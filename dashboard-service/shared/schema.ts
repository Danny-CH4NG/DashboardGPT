/**
 * Component contract — the single source of truth.
 * The dashboard renders from it, the REST API validates with it, and the MCP
 * server publishes it (as JSON Schema) so other services never import this file.
 */
import { z } from "zod";

const num = z.number().finite();
const status = z.enum(["ok", "warn", "alert", "info"]);

export const kpiData = z.object({
  value: z.union([num, z.string().min(1)]).describe("Main figure; a string for a word status such as 正常"),
  unit: z.string().optional(),
  label: z.string().optional().describe("Small caption under the value"),
  delta: num.optional().describe("Change vs. previous period, in the same unit"),
  status: status.optional(),
});

export const kpiChipsData = z
  .array(z.object({ label: z.string().min(1), value: z.union([num, z.string()]), unit: z.string().optional(), status: status.optional() }))
  .min(1)
  .max(8);

export const seriesData = z
  .object({
    x: z.array(z.string()).min(2).describe("Category or time labels, in order"),
    series: z
      .array(z.object({ name: z.string().min(1), values: z.array(num.nullable()) }))
      .min(1)
      .max(6),
  })
  .superRefine((d, ctx) => {
    d.series.forEach((s, i) => {
      if (s.values.length !== d.x.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", i, "values"],
          message: `series "${s.name}" has ${s.values.length} values but x has ${d.x.length} labels`,
        });
    });
  });

export const gaugeData = z
  .object({ value: num, min: num.default(0), max: num.default(100), unit: z.string().optional(), label: z.string().optional() })
  .refine((d) => d.max > d.min, { message: "max must be greater than min", path: ["max"] });

export const donutData = z
  .array(z.object({ name: z.string().min(1), value: num.nonnegative() }))
  .min(1)
  .max(10);

export const statusListData = z
  .array(z.object({ label: z.string().min(1), level: status, time: z.string().optional(), location: z.string().optional() }))
  .max(30);

export const tickerData = z.object({ items: z.array(z.string().min(1)).min(1).max(20) });

export const componentTypes = {
  kpi: { data: kpiData, kind: "number", label: "單一指標", fits: "One headline number or status word, optionally with a delta." },
  "kpi-chips": { data: kpiChipsData, kind: "number", label: "指標晶片列", fits: "2–8 small labelled figures shown side by side." },
  line: { data: seriesData, kind: "chart", label: "折線圖", fits: "Values over ordered time/sequence; trends; 1–6 series." },
  bar: { data: seriesData, kind: "chart", label: "長條圖", fits: "Comparing values across categories; 1–6 series." },
  gauge: { data: gaugeData, kind: "chart", label: "儀表", fits: "One value within a known range (percent, rate)." },
  donut: { data: donutData, kind: "chart", label: "環圈圖", fits: "Parts of a whole; 1–10 non-negative categories." },
  "status-list": { data: statusListData, kind: "list", label: "狀態清單", fits: "Events or alerts with a severity level." },
  ticker: { data: tickerData, kind: "list", label: "跑馬燈", fits: "Short announcements that scroll." },
} as const;

export type ComponentType = keyof typeof componentTypes;
export const componentTypeEnum = z.enum(Object.keys(componentTypes) as [ComponentType, ...ComponentType[]]);

export const gridSize = z.object({
  colSpan: z.number().int().min(1).max(12),
  rowSpan: z.number().int().min(1).max(8),
});

export const componentOptions = z
  .object({
    accent: z.enum(["cyan", "amber", "green", "red", "violet"]).optional(),
    decimals: z.number().int().min(0).max(4).optional(),
    stacked: z.boolean().optional(),
    smooth: z.boolean().optional(),
    thresholds: z.object({ warn: num.optional(), alert: num.optional() }).optional(),
  })
  .strict();

export const componentSpec = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),
  type: componentTypeEnum,
  title: z.string().min(1).max(40),
  description: z.string().max(400).optional(),
  grid: gridSize.describe("Default size when placed on the page"),
  data: z.unknown(),
  options: componentOptions.optional(),
  source: z
    .object({ kind: z.enum(["builtin", "ai"]), createdAt: z.string(), templateId: z.string().optional() })
    .optional(),
});

export type ComponentSpec = z.infer<typeof componentSpec>;
export type GridSize = z.infer<typeof gridSize>;

export type ValidationIssue = { path: string; message: string };

/** Validates the envelope and then the type-specific data. */
export function validateComponent(input: unknown): { ok: true; spec: ComponentSpec } | { ok: false; errors: ValidationIssue[] } {
  const env = componentSpec.safeParse(input);
  if (!env.success) return { ok: false, errors: toIssues(env.error) };
  const def = componentTypes[env.data.type];
  const data = def.data.safeParse(env.data.data);
  if (!data.success) return { ok: false, errors: toIssues(data.error, "data") };
  return { ok: true, spec: { ...env.data, data: data.data } };
}

function toIssues(err: z.ZodError, prefix?: string): ValidationIssue[] {
  return err.issues.map((i) => ({
    path: [prefix, ...i.path].filter((p) => p !== undefined && p !== "").join("."),
    message: i.message,
  }));
}

// ---- Layout ---------------------------------------------------------------

export const zoneIds = ["top", "left", "right", "bottomLeft"] as const;
export type ZoneId = (typeof zoneIds)[number];

export const slot = z.object({
  slotId: z.string(),
  componentId: z.string(),
  grid: gridSize,
});
export type Slot = z.infer<typeof slot>;

export const layout = z.object({
  zones: z.record(z.enum(zoneIds), z.object({ columns: z.number().int().min(1).max(12), slots: z.array(slot) })),
});
export type Layout = z.infer<typeof layout>;
