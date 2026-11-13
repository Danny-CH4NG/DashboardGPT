import { z } from "zod";
import { accent, decimals, defineComponent, thresholds } from "../_shared/define.ts";
import { seriesData } from "../line/definition.ts";

export default defineComponent({
  type: "bar",
  version: 1,
  label: "長條圖",
  kind: "chart",
  fits: "Comparing values across categories; 1–6 series.",
  data: seriesData,
  options: z.object({ accent: accent.optional(), decimals: decimals.optional(), stacked: z.boolean().optional(), thresholds: thresholds.optional() }).strict(),
  rules: [{ kind: "sameLength", each: "series.*.values", as: "x" }],
  defaultGrid: { colSpan: 2, rowSpan: 2 },
  example: {
    title: "月台擁擠度",
    description: "各月台人數占設計容量的百分比。",
    data: { x: ["1A", "1B", "2A"], series: [{ name: "擁擠度 %", values: [46, 72, 88] }] },
    options: { thresholds: { warn: 70, alert: 85 } },
  },
});
