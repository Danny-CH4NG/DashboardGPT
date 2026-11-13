/**
 * Deterministic parsing of tables pasted into the chat (TSV from Excel, CSV,
 * Markdown tables). The model gets this analysis next to the raw text, so
 * data problems are found by code first and explained by the model.
 */
import Papa from "papaparse";

export type ColumnType = "number" | "text" | "empty";
export type Issue = { row?: number; column?: string; problem: string; severity: "error" | "warning" | "info" };
export type TableAnalysis = {
  id: string;
  format: "tsv" | "csv" | "markdown";
  columns: { name: string; type: ColumnType; filled: number; numeric: number; min?: number; max?: number }[];
  rowCount: number;
  /** Rows as parsed; numbers normalised ("1,284" → 1284, "98%" → 98), empty cells → null. Row numbers are 1-based, header excluded. */
  rows: (string | number | null)[][];
  issues: Issue[];
};

const NUM = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;

export function toNumber(raw: string): number | null {
  let s = raw.trim().replace(/[\s　]/g, "");
  if (s.endsWith("%")) s = s.slice(0, -1);
  if (!NUM.test(s)) return null;
  return Number(s.replace(/,/g, ""));
}

function isTableLine(line: string) {
  return line.includes("\t") || (line.trim().startsWith("|") && line.trim().endsWith("|")) || line.split(",").length >= 2;
}

/** Finds blocks of ≥ 2 consecutive table-looking lines. */
export function findTableBlocks(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length >= 2) blocks.push(cur.join("\n"));
    cur = [];
  };
  for (const line of lines) {
    if (line.trim() && isTableLine(line)) cur.push(line);
    else flush();
  }
  flush();
  // A comma inside a normal sentence is not a table: require a consistent column count for CSV.
  return blocks.filter((b) => {
    if (b.includes("\t") || b.trim().startsWith("|")) return true;
    const counts = b.split("\n").map((l) => l.split(",").length);
    return counts.filter((c) => c === counts[0]).length >= Math.ceil(counts.length * 0.8);
  });
}

function parseBlock(block: string): { format: TableAnalysis["format"]; cells: string[][] } {
  if (block.trim().startsWith("|")) {
    const cells = block
      .split("\n")
      .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
      .filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    return { format: "markdown", cells };
  }
  const tsv = block.includes("\t");
  const res = Papa.parse<string[]>(block, { delimiter: tsv ? "\t" : ",", skipEmptyLines: true });
  return { format: tsv ? "tsv" : "csv", cells: res.data.map((r) => r.map((c) => (c ?? "").trim())) };
}

export function analyzeTable(block: string, id: string): TableAnalysis {
  const { format, cells } = parseBlock(block);
  const [header, ...body] = cells;
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const names = Array.from({ length: width }, (_, i) => header[i] || `欄${i + 1}`);
  const issues: Issue[] = [];

  body.forEach((r, i) => {
    if (r.length !== header.length)
      issues.push({ row: i + 1, problem: `這一列有 ${r.length} 個欄位，但表頭有 ${header.length} 個`, severity: "error" });
  });
  header.forEach((h, i) => {
    if (!h) issues.push({ column: names[i], problem: "表頭是空的，不知道這一欄代表什麼", severity: "warning" });
  });
  const dupHeaders = names.filter((n, i) => names.indexOf(n) !== i);
  dupHeaders.forEach((n) => issues.push({ column: n, problem: "表頭重複", severity: "error" }));

  const columns = names.map((name, c) => {
    const values = body.map((r) => r[c] ?? "");
    const filled = values.filter((v) => v !== "" && !/^(-|—|n\/?a|null)$/i.test(v)).length;
    const nums = values.map(toNumber);
    const numeric = nums.filter((n) => n !== null).length;
    const type: ColumnType = filled === 0 ? "empty" : numeric / filled >= 0.6 ? "number" : "text";
    const numVals = nums.filter((n): n is number => n !== null);
    return {
      name,
      type,
      filled,
      numeric,
      ...(numVals.length ? { min: Math.min(...numVals), max: Math.max(...numVals) } : {}),
    };
  });

  columns.forEach((col, c) => {
    if (col.type === "empty") {
      issues.push({ column: col.name, problem: "整欄都是空的", severity: "warning" });
      return;
    }
    body.forEach((r, i) => {
      const v = (r[c] ?? "").trim();
      const empty = v === "" || /^(-|—|n\/?a|null)$/i.test(v);
      if (empty) issues.push({ row: i + 1, column: col.name, problem: "缺值", severity: "error" });
      else if (col.type === "number" && toNumber(v) === null)
        issues.push({ row: i + 1, column: col.name, problem: `「${v}」不是數字，但這一欄其他都是數字`, severity: "error" });
    });
    const percentLike = body.some((r) => (r[c] ?? "").trim().endsWith("%"));
    if (percentLike && col.max !== undefined && col.max > 100)
      issues.push({ column: col.name, problem: `含 % 符號但最大值是 ${col.max}，超過 100`, severity: "warning" });
    if (percentLike && body.some((r) => r[c] && !r[c].trim().endsWith("%") && toNumber(r[c]) !== null))
      issues.push({ column: col.name, problem: "部分數值有 % 符號、部分沒有，單位可能不一致", severity: "warning" });
  });

  const label = columns.findIndex((c) => c.type === "text");
  if (label >= 0) {
    const seen = new Map<string, number>();
    body.forEach((r, i) => {
      const v = (r[label] ?? "").trim();
      if (!v) return;
      if (seen.has(v)) issues.push({ row: i + 1, column: columns[label].name, problem: `「${v}」與第 ${seen.get(v)} 列重複`, severity: "warning" });
      else seen.set(v, i + 1);
    });
  }
  if (body.length === 0) issues.push({ problem: "只有表頭，沒有資料列", severity: "error" });

  const rows = body.slice(0, 200).map((r) =>
    names.map((_, c) => {
      const v = (r[c] ?? "").trim();
      if (v === "" || /^(-|—|n\/?a|null)$/i.test(v)) return null;
      return columns[c].type === "number" ? (toNumber(v) ?? v) : v;
    }),
  );
  if (body.length > 200) issues.push({ problem: `共 ${body.length} 列，只分析前 200 列`, severity: "info" });

  return { id, format, columns, rowCount: body.length, rows, issues };
}

export function analyzePastedText(text: string, startIndex = 1): TableAnalysis[] {
  return findTableBlocks(text).map((b, i) => analyzeTable(b, `t${startIndex + i}`));
}
