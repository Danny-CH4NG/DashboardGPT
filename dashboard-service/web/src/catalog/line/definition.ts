import { z } from "zod";
import { accent, decimals, defineComponent, num, thresholds } from "../_shared/define.ts";

export const seriesData = z.object({
  x: z.array(z.string()).min(2).describe("Category or time labels, in order"),
  series: z
    .array(z.object({ name: z.string().min(1), values: z.array(num.nullable()).describe("One value per x label; null = no data") }))
    .min(1)
    .max(6),
});

export default defineComponent({
  type: "line",
  version: 1,
  label: "折線圖",
  kind: "chart",
  fits: "Values over ordered time/sequence; trends; 1–6 series.",
  data: seriesData,
  options: z
    .object({ accent: accent.optional(), decimals: decimals.optional(), smooth: z.boolean().optional(), stacked: z.boolean().optional(), thresholds: thresholds.optional() })
    .strict(),
  rules: [{ kind: "sameLength", each: "series.*.values", as: "x" }],
  defaultGrid: { colSpan: 4, rowSpan: 2 },
  example: {
    title: "即時人流（進／出站）",
    description: "今日每小時進站與出站人次。",
    data: { x: ["08:00", "09:00", "10:00"], series: [{ name: "進站", values: [1720, 1210, 860] }, { name: "出站", values: [1540, 1180, 820] }] },
    options: { smooth: true },
  },
});
