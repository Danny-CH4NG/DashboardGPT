import { z, type ZodTypeAny } from "zod";
import { checkRules, type Rule } from "./rules.ts";

export type GridSize = { colSpan: number; rowSpan: number };

/**
 * Everything the platform needs to know about one component type, without the
 * renderer (so it can be turned into the manifest at build time, outside a browser).
 */
export type ComponentDefinition<D extends ZodTypeAny = ZodTypeAny, O extends ZodTypeAny = ZodTypeAny> = {
  type: string;
  /** Bump when the data shape changes incompatibly. */
  version: number;
  label: string;
  kind: "number" | "chart" | "list";
  /** One line telling the AI what data this fits. */
  fits: string;
  data: D;
  options: O;
  rules?: Rule[];
  defaultGrid: GridSize;
  example: { title: string; description?: string; data: z.input<D>; options?: z.input<O> };
};

export function defineComponent<D extends ZodTypeAny, O extends ZodTypeAny>(def: ComponentDefinition<D, O>) {
  return def;
}

/** Data schema plus the declared cross-field rules, for frontend validation before rendering. */
export function dataValidator(def: ComponentDefinition) {
  return def.data.superRefine((d, ctx) => {
    for (const issue of checkRules(d, def.rules)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  });
}

// Option pieces shared by several components.
export const num = z.number().finite();
export const statusLevel = z.enum(["ok", "warn", "alert", "info"]);
export const accent = z.enum(["cyan", "amber", "green", "red", "violet"]).describe("Highlight colour");
export const decimals = z.number().int().min(0).max(4).describe("Decimal places shown");
export const thresholds = z
  .object({ warn: num.optional(), alert: num.optional() })
  .describe("Values that turn the component amber (warn) or red (alert)");
