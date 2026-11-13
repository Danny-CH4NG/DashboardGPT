/**
 * Cross-field rules that JSON Schema cannot express. They are declared on a
 * component definition, published in the manifest as data, and enforced the
 * same way by the frontend (zod refine) and the backend (generic engine).
 *
 * Paths are dot-separated; "*" walks every element of an array.
 *   { kind: "sameLength", each: "series.*.values", as: "x" }
 *   { kind: "greaterThan", field: "max", than: "min" }
 */
export type Rule =
  | { kind: "sameLength"; each: string; as: string }
  | { kind: "greaterThan"; field: string; than: string };

export type RuleIssue = { path: (string | number)[]; message: string };

function resolve(value: unknown, path: string): { path: (string | number)[]; value: unknown }[] {
  let cur: { path: (string | number)[]; value: unknown }[] = [{ path: [], value }];
  for (const seg of path.split(".")) {
    const next: typeof cur = [];
    for (const c of cur) {
      if (seg === "*") {
        if (Array.isArray(c.value)) c.value.forEach((v, i) => next.push({ path: [...c.path, i], value: v }));
      } else if (c.value && typeof c.value === "object" && seg in (c.value as object)) {
        next.push({ path: [...c.path, seg], value: (c.value as Record<string, unknown>)[seg] });
      }
    }
    cur = next;
  }
  return cur;
}

export function checkRules(data: unknown, rules: Rule[] = []): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const r of rules) {
    if (r.kind === "sameLength") {
      const ref = resolve(data, r.as)[0];
      if (!ref || !Array.isArray(ref.value)) continue;
      for (const m of resolve(data, r.each)) {
        if (Array.isArray(m.value) && m.value.length !== ref.value.length)
          issues.push({ path: m.path, message: `has ${m.value.length} items but "${r.as}" has ${ref.value.length}; they must match` });
      }
    } else if (r.kind === "greaterThan") {
      const a = resolve(data, r.field)[0];
      const b = resolve(data, r.than)[0];
      if (a && b && typeof a.value === "number" && typeof b.value === "number" && !(a.value > b.value))
        issues.push({ path: a.path, message: `must be greater than "${r.than}" (${b.value})` });
    }
  }
  return issues;
}
