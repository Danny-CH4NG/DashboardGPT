import { z } from "zod";
import { defineComponent, num, statusLevel } from "../_shared/define.ts";

export default defineComponent({
  type: "kpi-chips",
  version: 1,
  label: "指標晶片列",
  kind: "number",
  fits: "2–8 small labelled figures shown side by side.",
  data: z
    .array(z.object({ label: z.string().min(1), value: z.union([num, z.string()]), unit: z.string().optional(), status: statusLevel.optional() }))
    .min(1)
    .max(8),
  options: z.object({}).strict(),
  defaultGrid: { colSpan: 2, rowSpan: 1 },
  example: {
    title: "轉乘",
    data: [
      { label: "內灣線", value: 12, unit: "分" },
      { label: "高鐵接駁", value: 6, unit: "分" },
    ],
  },
});
