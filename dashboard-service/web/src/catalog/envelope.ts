/**
 * The outer frame every component shares (title, help text, grid size …).
 * `data` and `options` are defined per component type in ./<type>/definition.ts.
 */
import { z } from "zod";

export const gridSize = z.object({
  colSpan: z.number().int().min(1).max(12).describe("Columns (right panel is 4 wide)"),
  rowSpan: z.number().int().min(1).max(8).describe("Rows (one row ≈ 84px)"),
});

export const envelope = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/).describe("lowercase-kebab-case English id"),
  type: z.string().describe("Component type, see list_component_types"),
  title: z.string().min(1).max(40),
  description: z.string().max(400).optional().describe("Shown in the ? help popover"),
  grid: gridSize,
  source: z
    .object({
      kind: z.enum(["builtin", "ai"]),
      createdAt: z.string(),
      templateId: z.string().optional(),
      manifestVersion: z.string().optional(),
    })
    .optional(),
});

export type GridSize = z.infer<typeof gridSize>;
export type ComponentSpec = z.infer<typeof envelope> & { data: unknown; options?: Record<string, unknown> };
