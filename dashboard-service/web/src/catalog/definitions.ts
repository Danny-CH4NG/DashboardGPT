/**
 * All component definitions (no rendering code). Adding a component type:
 *   1. create ./<type>/definition.ts and ./<type>/Renderer.tsx
 *   2. list it here and in ./index.ts
 * The build turns this list into component-manifest.json; the backend and the
 * AI chat pick the new type up from there — no backend change needed.
 */
import bar from "./bar/definition.ts";
import donut from "./donut/definition.ts";
import gauge from "./gauge/definition.ts";
import kpiChips from "./kpi-chips/definition.ts";
import kpi from "./kpi/definition.ts";
import line from "./line/definition.ts";
import statusList from "./status-list/definition.ts";
import ticker from "./ticker/definition.ts";

export const definitions = [kpi, kpiChips, line, bar, gauge, donut, statusList, ticker];
