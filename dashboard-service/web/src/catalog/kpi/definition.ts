import { z } from "zod";
import { accent, decimals, defineComponent, num, statusLevel } from "../_shared/define.ts";

export default defineComponent({
  type: "kpi",
  version: 1,
  label: "單一指標",
  kind: "number",
  fits: "One headline number or status word, optionally with a delta.",
  data: z.object({
    value: z.union([num, z.string().min(1)]).describe("Main figure; a string for a word status such as 正常"),
    unit: z.string().optional(),
    label: z.string().optional().describe("Small caption under the value"),
    delta: num.optional().describe("Change vs. previous period, in the same unit"),
    status: statusLevel.optional(),
  }),
  options: z.object({ accent: accent.optional(), decimals: decimals.optional() }).strict(),
  defaultGrid: { colSpan: 2, rowSpan: 1 },
  example: { title: "今日累計進站", description: "今日 05:30 起累計進站人次。", data: { value: 13464, unit: "人次", delta: 820 } },
});
