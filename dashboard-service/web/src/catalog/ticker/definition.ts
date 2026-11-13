import { z } from "zod";
import { defineComponent } from "../_shared/define.ts";

export default defineComponent({
  type: "ticker",
  version: 1,
  label: "跑馬燈",
  kind: "list",
  fits: "Short announcements that scroll.",
  data: z.object({ items: z.array(z.string().min(1)).min(1).max(20) }),
  options: z.object({}).strict(),
  defaultGrid: { colSpan: 2, rowSpan: 1 },
  example: { title: "公告", data: { items: ["北上 152 次延誤 5 分鐘", "後站電扶梯保養至 14:00"] } },
});
