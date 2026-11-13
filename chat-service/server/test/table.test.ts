import { describe, expect, it } from "vitest";
import { analyzePastedText, toNumber } from "../table.ts";

describe("toNumber", () => {
  it("normalises separators and percent", () => {
    expect(toNumber("1,284")).toBe(1284);
    expect(toNumber("98%")).toBe(98);
    expect(toNumber("12a")).toBeNull();
  });
});

describe("analyzePastedText", () => {
  it("parses a clean TSV pasted from Excel", () => {
    const [t] = analyzePastedText("請幫我做圖\n時間\t進站\t出站\n08:00\t1,720\t1540\n09:00\t1210\t1180\n");
    expect(t.format).toBe("tsv");
    expect(t.columns.map((c) => c.type)).toEqual(["text", "number", "number"]);
    expect(t.rows[0]).toEqual(["08:00", 1720, 1540]);
    expect(t.issues).toEqual([]);
  });

  it("flags missing values, non-numbers and ragged rows", () => {
    const [t] = analyzePastedText("月台,擁擠度\n1A,46\n1B,\n2A,高\n2B,54,x");
    const problems = t.issues.map((i) => `${i.row}:${i.problem}`);
    expect(problems).toContain("2:缺值");
    expect(problems.some((p) => p.startsWith("3:「高」不是數字"))).toBe(true);
    expect(problems.some((p) => p.startsWith("4:這一列有 3 個欄位"))).toBe(true);
  });

  it("parses markdown tables and spots duplicate labels", () => {
    const [t] = analyzePastedText("| 設備 | 數量 |\n|---|---|\n| 電梯 | 12 |\n| 電梯 | 3 |");
    expect(t.format).toBe("markdown");
    expect(t.rowCount).toBe(2);
    expect(t.issues.some((i) => i.problem.includes("重複"))).toBe(true);
  });

  it("ignores ordinary sentences with commas", () => {
    expect(analyzePastedText("你好，我想做一個圖, 謝謝")).toEqual([]);
  });
});
