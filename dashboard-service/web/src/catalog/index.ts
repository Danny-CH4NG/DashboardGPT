/** Definition + renderer for every component type, used by the page. */
import type { ComponentType as ReactComponent } from "react";
import type { ComponentDefinition } from "./_shared/define.ts";
import { definitions } from "./definitions.ts";
import Bar from "./bar/Renderer.tsx";
import Donut from "./donut/Renderer.tsx";
import Gauge from "./gauge/Renderer.tsx";
import KpiChips from "./kpi-chips/Renderer.tsx";
import Kpi from "./kpi/Renderer.tsx";
import Line from "./line/Renderer.tsx";
import StatusList from "./status-list/Renderer.tsx";
import Ticker from "./ticker/Renderer.tsx";

type AnyRenderer = ReactComponent<{ data: never; options: never; large?: boolean }>;
const renderers: Record<string, AnyRenderer> = {
  kpi: Kpi,
  "kpi-chips": KpiChips,
  line: Line,
  bar: Bar,
  gauge: Gauge,
  donut: Donut,
  "status-list": StatusList,
  ticker: Ticker,
} as Record<string, AnyRenderer>;

export type CatalogEntry = { def: ComponentDefinition; Renderer: AnyRenderer };
export const catalog: Record<string, CatalogEntry> = Object.fromEntries(
  definitions.map((def) => {
    const Renderer = renderers[def.type];
    if (!Renderer) throw new Error(`component type "${def.type}" has no renderer in catalog/index.ts`);
    return [def.type, { def, Renderer }];
  }),
);
export const typeLabel = (type: string) => catalog[type]?.def.label ?? type;
