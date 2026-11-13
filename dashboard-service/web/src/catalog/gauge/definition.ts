import { z } from "zod";
import { accent, decimals, defineComponent, num, thresholds } from "../_shared/define.ts";

export default defineComponent({
  type: "gauge",
  version: 1,
  label: "儀表",
  kind: "chart",
  fits: "One value within a known range (percent, rate).",
  data: z.object({ value: num, min: num.default(0), max: num.default(100), unit: z.string().optional(), label: z.string().optional() }),
  options: z.object({ accent: accent.optional(), decimals: decimals.optional(), thresholds: thresholds.optional() }).strict(),
  rules: [{ kind: "greaterThan", field: "max", than: "min" }],
  defaultGrid: { colSpan: 2, rowSpan: 2 },
  example: { title: "列車準點率", data: { value: 98, min: 0, max: 100, unit: "%", label: "今日" }, options: { thresholds: { warn: 95, alert: 90 } } },
});
