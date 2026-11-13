/** Shapes of the dashboard REST API (layout is owned by the backend). */
import type { GridSize } from "./catalog/envelope.ts";
export type { ComponentSpec, GridSize } from "./catalog/envelope.ts";

export const zoneIds = ["top", "left", "right", "bottomLeft"] as const;
export type ZoneId = (typeof zoneIds)[number];
export type Slot = { slotId: string; componentId: string; grid: GridSize };
export type Layout = { zones: Partial<Record<ZoneId, { columns: number; slots: Slot[] }>> };
