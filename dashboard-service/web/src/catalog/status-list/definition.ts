import { z } from "zod";
import { defineComponent, statusLevel } from "../_shared/define.ts";

export default defineComponent({
  type: "status-list",
  version: 1,
  label: "狀態清單",
  kind: "list",
  fits: "Events or alerts with a severity level.",
  data: z
    .array(z.object({ label: z.string().min(1), level: statusLevel, time: z.string().optional(), location: z.string().optional() }))
    .max(30),
  options: z.object({}).strict(),
  defaultGrid: { colSpan: 4, rowSpan: 2 },
  example: { title: "告警", data: [{ label: "2A 月台擁擠度 88%", level: "alert", time: "10:38" }] },
});
