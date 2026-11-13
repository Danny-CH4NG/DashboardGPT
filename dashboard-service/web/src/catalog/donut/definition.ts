import { z } from "zod";
import { defineComponent, num } from "../_shared/define.ts";

export default defineComponent({
  type: "donut",
  version: 1,
  label: "環圈圖",
  kind: "chart",
  fits: "Parts of a whole; 1–10 non-negative categories.",
  data: z.array(z.object({ name: z.string().min(1), value: num.nonnegative() })).min(1).max(10),
  options: z.object({}).strict(),
  defaultGrid: { colSpan: 2, rowSpan: 2 },
  example: { title: "設備狀態", data: [{ name: "正常", value: 126 }, { name: "保養中", value: 6 }, { name: "異常", value: 2 }] },
});
