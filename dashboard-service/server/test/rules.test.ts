import { describe, expect, it } from "vitest";
import { checkRules as backend, type Rule } from "../rules.ts";
// The frontend keeps its own copy; both must agree on every rule.
import { checkRules as frontend } from "../../web/src/catalog/_shared/rules.ts";

const cases: [unknown, Rule[]][] = [
  [{ x: ["a", "b"], series: [{ values: [1, 2] }, { values: [1] }] }, [{ kind: "sameLength", each: "series.*.values", as: "x" }]],
  [{ x: ["a"], series: [] }, [{ kind: "sameLength", each: "series.*.values", as: "x" }]],
  [{ min: 0, max: 0 }, [{ kind: "greaterThan", field: "max", than: "min" }]],
  [{ min: 0, max: 5 }, [{ kind: "greaterThan", field: "max", than: "min" }]],
  [null, [{ kind: "greaterThan", field: "max", than: "min" }]],
];

describe("rule engine parity", () => {
  it.each(cases)("frontend and backend agree on %j", (data, rules) => {
    expect(backend(data, rules)).toEqual(frontend(data, rules));
  });
  it("reports the offending path", () => {
    expect(backend(cases[0][0], cases[0][1])).toEqual([{ path: ["series", 1, "values"], message: 'has 1 items but "x" has 2; they must match' }]);
  });
});
