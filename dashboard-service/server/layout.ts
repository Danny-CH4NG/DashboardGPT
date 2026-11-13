/** Page layout: owned by the backend (where each component sits and how big it is). */
import { z } from "zod";

export const gridSize = z.object({ colSpan: z.number().int().min(1).max(12), rowSpan: z.number().int().min(1).max(8) });
export type GridSize = z.infer<typeof gridSize>;

export const zoneIds = ["top", "left", "right", "bottomLeft"] as const;
export type ZoneId = (typeof zoneIds)[number];

export const slot = z.object({ slotId: z.string(), componentId: z.string(), grid: gridSize });
export type Slot = z.infer<typeof slot>;

export const layout = z.object({
  zones: z.record(z.enum(zoneIds), z.object({ columns: z.number().int().min(1).max(12), slots: z.array(slot) })),
});
export type Layout = z.infer<typeof layout>;
