import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, GaugeChart, PieChart, CustomChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { componentTypes, type ComponentSpec, type ComponentType } from "../../../shared/schema.ts";
import type { z } from "zod";

echarts.use([LineChart, GaugeChart, PieChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

type DataOf<T extends ComponentType> = z.infer<(typeof componentTypes)[T]["data"]>;
type Opts = NonNullable<ComponentSpec["options"]>;
type RendererProps<T extends ComponentType> = { data: DataOf<T>; options: Opts; large?: boolean };

export const ACCENTS = { cyan: "#38d6f5", amber: "#f5b638", green: "#4ade80", red: "#ff6b78", violet: "#8b7bff" } as const;
const PALETTE = ["#38d6f5", "#f5b638", "#8b7bff", "#4ade80", "#ff6b78", "#7dd3fc"];
const STATUS_COLOR = { ok: "#4ade80", warn: "#f5b638", alert: "#ff6b78", info: "#38d6f5" } as const;
const TEXT = "#d4e3f5";
const MUTED = "#6f86a6";
const HUD_FONT = "Rajdhani, 'Noto Sans TC', sans-serif";
const NUM_FONT = "Orbitron, Rajdhani, sans-serif";

const fmt = (v: number | string, decimals?: number) =>
  typeof v === "number" ? v.toLocaleString("zh-TW", { maximumFractionDigits: decimals ?? 1 }) : v;

/** Shift a #rrggbb colour lighter (amt > 0) or darker (amt < 0). */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => {
    const c = (n >> s) & 255;
    return Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function EChart({ option }: { option: echarts.EChartsCoreOption }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    chart.current = echarts.init(el.current!, undefined, { renderer: "canvas" });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);
  return <div ref={el} className="echart" />;
}

const tooltip = {
  backgroundColor: "rgba(6, 14, 28, 0.95)",
  borderColor: "rgba(56, 214, 245, 0.45)",
  textStyle: { color: TEXT, fontFamily: HUD_FONT },
  extraCssText: "box-shadow: 0 0 18px rgba(56,214,245,.25); border-radius: 8px;",
};
const axisCommon = {
  axisLine: { lineStyle: { color: "rgba(56, 214, 245, 0.25)" } },
  axisTick: { show: false },
  axisLabel: { color: MUTED, fontSize: 11, fontFamily: HUD_FONT },
  splitLine: { lineStyle: { color: "rgba(56, 214, 245, 0.08)", type: "dashed" } },
};
const legend = (show: boolean) =>
  show ? { top: 0, right: 0, textStyle: { color: TEXT, fontSize: 11, fontFamily: HUD_FONT }, itemWidth: 12, itemHeight: 6, icon: "roundRect" } : undefined;

function LineSeries({ data, options, large }: RendererProps<"line">) {
  const single = data.series.length === 1;
  const colors = options.accent ? [ACCENTS[options.accent], ...PALETTE.filter((c) => c !== ACCENTS[options.accent!])] : PALETTE;
  const t = options.thresholds;
  const option: echarts.EChartsCoreOption = {
    grid: { left: 8, right: 12, top: single ? 12 : 30, bottom: 4, containLabel: true },
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { lineStyle: { color: "rgba(56,214,245,.5)" } } },
    legend: legend(!single),
    xAxis: { type: "category", data: data.x, boundaryGap: false, ...axisCommon, splitLine: { show: false } },
    yAxis: { type: "value", ...axisCommon },
    series: data.series.map((s, i) => {
      const c = colors[i % colors.length];
      return {
        name: s.name,
        type: "line",
        data: s.values,
        smooth: options.smooth,
        stack: options.stacked ? "total" : undefined,
        symbol: "circle",
        symbolSize: large ? 7 : 4,
        showSymbol: large,
        lineStyle: { width: 2.5, color: c, shadowColor: c, shadowBlur: 12 },
        itemStyle: { color: c, borderColor: "#fff", borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: alpha(c, i === 0 ? 0.38 : 0.18) },
            { offset: 1, color: alpha(c, 0) },
          ]),
        },
        markLine:
          i === 0 && t?.warn != null
            ? { symbol: "none", silent: true, lineStyle: { color: STATUS_COLOR.warn, type: "dashed", opacity: 0.8 }, label: { show: false }, data: [{ yAxis: t.warn }] }
            : undefined,
      };
    }),
  };
  return <EChart option={option} />;
}

/** Bars drawn as lit cuboids (front, side and top faces). */
function Bar3D({ data, options, large }: RendererProps<"bar">) {
  const t = options.thresholds;
  const n = data.series.length;
  const single = n === 1;
  const stacked = !!options.stacked && n > 1;
  const colors = options.accent ? [ACCENTS[options.accent], ...PALETTE.filter((c) => c !== ACCENTS[options.accent!])] : PALETTE;
  const colorFor = (si: number, v: number) => {
    if (single && t) {
      if (t.alert != null && v >= t.alert) return STATUS_COLOR.alert;
      if (t.warn != null && v >= t.warn) return STATUS_COLOR.warn;
    }
    return colors[si % colors.length];
  };
  // Running totals for stacking.
  const base = data.x.map(() => 0);
  const max = Math.max(
    ...(stacked ? data.x.map((_, j) => data.series.reduce((a, s) => a + (s.values[j] ?? 0), 0)) : data.series.flatMap((s) => s.values.map((v) => v ?? 0))),
  );

  const series = data.series.map((s, si) => {
    const rows = s.values.map((v, j) => {
      const b = stacked ? base[j] : 0;
      const top = b + (v ?? 0);
      if (stacked) base[j] = top;
      return [j, top, b, v];
    });
    return {
      name: s.name,
      type: "custom",
      encode: { x: 0, y: 1, tooltip: 3 },
      data: rows,
      z: 10 + (stacked ? si : 0),
      itemStyle: { color: colors[si % colors.length] },
      renderItem: (params: { dataIndex: number }, api: CustomApi) => {
        const j = api.value(0);
        const v = api.value(3);
        if (v == null || Number.isNaN(v)) return null;
        const band = api.size([1, 0])[0];
        const groupW = band * (large ? 0.55 : 0.62);
        const w = stacked || single ? Math.min(groupW, large ? 64 : 30) : Math.min(groupW / n - 4, large ? 36 : 18);
        const [cx] = api.coord([j, 0]);
        const x = stacked || single ? cx - w / 2 : cx - groupW / 2 + si * (groupW / n) + (groupW / n - w) / 2;
        const [, yTop] = api.coord([j, api.value(1)]);
        const [, yBase] = api.coord([j, api.value(2)]);
        const d = w * 0.38;
        const dy = d * 0.55;
        const c = colorFor(si, v);
        const showTop = !stacked || si === n - 1 || params.dataIndex < 0;
        return {
          type: "group",
          children: [
            {
              type: "polygon", // side face
              shape: { points: [[x + w, yTop], [x + w + d, yTop - dy], [x + w + d, yBase - dy], [x + w, yBase]] },
              style: { fill: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: shade(c, -0.35) }, { offset: 1, color: shade(c, -0.7) }]) },
            },
            {
              type: "rect", // front face
              shape: { x, y: yTop, width: w, height: Math.max(0, yBase - yTop) },
              style: {
                fill: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c }, { offset: 1, color: alpha(c, 0.25) }]),
                shadowColor: alpha(c, 0.6),
                shadowBlur: 10,
              },
            },
            showTop && {
              type: "polygon", // top face
              shape: { points: [[x, yTop], [x + w, yTop], [x + w + d, yTop - dy], [x + d, yTop - dy]] },
              style: { fill: shade(c, 0.35) },
            },
          ].filter(Boolean),
        };
      },
    };
  });

  const option: echarts.EChartsCoreOption = {
    grid: { left: 8, right: 16, top: single ? 16 : 30, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(56,214,245,.06)" } },
      formatter: (ps: { axisValueLabel: string; marker: string; seriesName: string; value: number[] }[]) =>
        `${ps[0]?.axisValueLabel ?? ""}<br/>${ps.map((p) => `${p.marker}${p.seriesName}　<b>${fmt(p.value[3], options.decimals)}</b>`).join("<br/>")}`,
    },
    legend: legend(!single),
    xAxis: { type: "category", data: data.x, ...axisCommon, splitLine: { show: false } },
    yAxis: { type: "value", max: (e: { max: number }) => niceCeil(Math.max(e.max, max) * 1.05), ...axisCommon },
    series: [
      ...series,
      ...(t?.warn != null
        ? [{ type: "line", data: [], markLine: { symbol: "none", silent: true, lineStyle: { color: STATUS_COLOR.warn, type: "dashed", opacity: 0.8 }, label: { show: false }, data: [{ yAxis: t.warn }] } }]
        : []),
    ],
  };
  return <EChart option={option} />;
}
/** Rounds up to a tidy axis maximum: 95.04 → 100, 1720 → 2000. */
function niceCeil(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v)!;
  return step * p;
}
type CustomApi = { value: (dim: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] };

/** Gauge built from stacked rings: tick bezel, bevelled track, glowing progress, domed centre. */
function Gauge({ data, options, large }: RendererProps<"gauge">) {
  const t = options.thresholds;
  const c =
    t?.alert != null && data.value <= t.alert ? STATUS_COLOR.alert : t?.warn != null && data.value <= t.warn ? STATUS_COLOR.warn : ACCENTS[options.accent ?? "cyan"];
  const common = { min: data.min, max: data.max, startAngle: 220, endAngle: -40, center: ["50%", "56%"] };
  const w = large ? 22 : 11;
  const option: echarts.EChartsCoreOption = {
    series: [
      {
        // outer bezel ticks
        type: "gauge",
        ...common,
        radius: "98%",
        splitNumber: large ? 10 : 5,
        axisLine: { lineStyle: { width: 1, color: [[1, "rgba(56,214,245,.35)"]] } },
        axisTick: { distance: 2, length: large ? 6 : 4, splitNumber: 5, lineStyle: { color: "rgba(56,214,245,.35)", width: 1 } },
        splitLine: { distance: 2, length: large ? 12 : 7, lineStyle: { color: "rgba(140,220,255,.7)", width: 1.5 } },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: { show: false },
        title: { show: false },
      },
      {
        // bevelled track + progress
        type: "gauge",
        ...common,
        radius: "84%",
        progress: {
          show: true,
          width: w,
          roundCap: true,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: shade(c, -0.45) }, { offset: 1, color: shade(c, 0.25) }]),
            shadowColor: c,
            shadowBlur: 16,
          },
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: w,
            color: [[1, new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "#22334d" }, { offset: 0.5, color: "#0d1828" }, { offset: 1, color: "#1b2a40" }])]],
            shadowColor: "rgba(0,0,0,.8)",
            shadowBlur: 8,
            shadowOffsetY: 3,
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: data.value }],
      },
      {
        // domed centre disc with the reading
        type: "pie",
        radius: ["0%", "58%"],
        center: ["50%", "56%"],
        silent: true,
        label: {
          show: true,
          position: "center",
          formatter: () => `{v|${fmt(data.value, options.decimals)}}{u|${data.unit ?? ""}}\n{l|${data.label ?? ""}}`,
          rich: {
            v: { fontFamily: NUM_FONT, fontSize: large ? 46 : 22, fontWeight: 700, color: "#fff", textShadowColor: c, textShadowBlur: 14 },
            u: { fontFamily: HUD_FONT, fontSize: large ? 18 : 11, color: MUTED, padding: [0, 0, 0, 2] },
            l: { fontFamily: HUD_FONT, fontSize: large ? 15 : 11, color: MUTED, padding: [4, 0, 0, 0] },
          },
        },
        itemStyle: {
          color: new echarts.graphic.RadialGradient(0.4, 0.3, 0.9, [
            { offset: 0, color: "#1d3352" },
            { offset: 0.7, color: "#0b1626" },
            { offset: 1, color: "#060c18" },
          ]),
          borderColor: alpha(c, 0.45),
          borderWidth: 1,
          shadowColor: "rgba(0,0,0,.7)",
          shadowBlur: 14,
          shadowOffsetY: 4,
        },
        data: [{ value: 1 }],
      },
    ],
  };
  return <EChart option={option} />;
}

/** Donut with thickness: a darker copy offset below the top face reads as a 3D ring. */
function Donut({ data, large }: RendererProps<"donut">) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const depth = large ? 2.2 : 3.2; // percent of height
  const center = (dy: number) => ["34%", `${50 + dy}%`];
  const ring = ["54%", "80%"];
  const option: echarts.EChartsCoreOption = {
    tooltip: { ...tooltip, trigger: "item", formatter: "{b}　<b>{c}</b>（{d}%）" },
    legend: {
      data: data.map((d) => d.name),
      orient: "vertical",
      right: 4,
      top: "middle",
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: TEXT, fontSize: large ? 14 : 11, fontFamily: HUD_FONT },
      formatter: (name: string) => {
        const d = data.find((x) => x.name === name);
        return d ? `${name}  ${total ? Math.round((d.value / total) * 100) : 0}%` : name;
      },
    },
    series: [
      {
        type: "pie",
        radius: ring,
        center: center(depth / 2),
        silent: true,
        label: { show: false },
        itemStyle: { borderColor: "#050b16", borderWidth: 1 },
        data: data.map((d, i) => ({ ...d, itemStyle: { color: shade(PALETTE[i % PALETTE.length], -0.6) } })),
        z: 1,
      },
      {
        type: "pie",
        radius: ring,
        center: center(-depth / 2),
        label: { show: false },
        emphasis: { scale: true, scaleSize: 5 },
        itemStyle: { borderColor: "#050b16", borderWidth: 2, shadowColor: "rgba(56,214,245,.35)", shadowBlur: 12 },
        data: data.map((d, i) => {
          const c = PALETTE[i % PALETTE.length];
          return {
            ...d,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [{ offset: 0, color: shade(c, 0.3) }, { offset: 1, color: shade(c, -0.15) }]) },
          };
        }),
        z: 2,
      },
      {
        type: "pie",
        radius: ["0%", "46%"],
        center: center(-depth / 2),
        silent: true,
        itemStyle: { color: "transparent" },
        label: {
          show: true,
          position: "center",
          formatter: () => `{v|${fmt(total)}}\n{l|總計}`,
          rich: {
            v: { fontFamily: NUM_FONT, fontSize: large ? 30 : 16, fontWeight: 700, color: "#fff", textShadowColor: "rgba(56,214,245,.7)", textShadowBlur: 10 },
            l: { fontFamily: HUD_FONT, fontSize: large ? 14 : 10, color: MUTED, padding: [3, 0, 0, 0] },
          },
        },
        data: [{ value: 1, name: "" }],
        z: 3,
      },
    ],
  };
  return <EChart option={option} />;
}

function Kpi({ data, options, large }: RendererProps<"kpi">) {
  const accent = data.status ? STATUS_COLOR[data.status] : ACCENTS[options.accent ?? "cyan"];
  const isWord = typeof data.value === "string";
  return (
    <div className={`kpi ${large ? "kpi--large" : ""}`} style={{ ["--accent" as string]: accent }}>
      {isWord ? (
        <div className="kpi__ring">
          <i className="kpi__orbit" />
          <span>{data.value}</span>
        </div>
      ) : (
        <div className="kpi__value">
          {fmt(data.value, options.decimals)}
          {data.unit && <small>{data.unit}</small>}
        </div>
      )}
      {data.delta != null && (
        <div className={`kpi__delta ${data.delta >= 0 ? "up" : "down"}`}>
          {data.delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(data.delta), options.decimals)}
          {data.unit ? ` ${data.unit}` : ""}
        </div>
      )}
      {data.label && <div className="kpi__label">{data.label}</div>}
    </div>
  );
}

function KpiChips({ data }: RendererProps<"kpi-chips">) {
  return (
    <div className="chips">
      {data.map((c, i) => (
        <div key={i} className="chip" style={{ ["--accent" as string]: STATUS_COLOR[c.status ?? "info"] }}>
          <span className="chip__label">{c.label}</span>
          <span className="chip__value">
            {fmt(c.value)}
            {c.unit && <small>{c.unit}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

const LEVEL_LABEL = { alert: "嚴重", warn: "注意", info: "資訊", ok: "正常" } as const;
function StatusList({ data }: RendererProps<"status-list">) {
  if (data.length === 0) return <div className="empty">目前沒有項目</div>;
  return (
    <ul className="status-list">
      {data.map((d, i) => (
        <li key={i} className={`status-list__item status-list__item--${d.level}`}>
          <span className={`badge badge--${d.level}`}>{LEVEL_LABEL[d.level]}</span>
          <span className="status-list__label">{d.label}</span>
          <span className="status-list__time">{d.time}</span>
        </li>
      ))}
    </ul>
  );
}

function Ticker({ data }: RendererProps<"ticker">) {
  const text = data.items.join("　　▸　　");
  return (
    <div className="ticker">
      <div className="ticker__track" style={{ animationDuration: `${Math.max(12, text.length * 0.35)}s` }}>
        <span>{text}</span>
        <span aria-hidden>{text}</span>
      </div>
    </div>
  );
}

const renderers: { [T in ComponentType]: (p: RendererProps<T>) => JSX.Element } = {
  kpi: Kpi,
  "kpi-chips": KpiChips,
  line: LineSeries,
  bar: Bar3D,
  gauge: Gauge,
  donut: Donut,
  "status-list": StatusList,
  ticker: Ticker,
};

/** Renders the inner content of a component; validates data first so a bad spec never crashes the page. */
export function ComponentBody({ spec, large }: { spec: ComponentSpec; large?: boolean }) {
  const def = componentTypes[spec.type];
  const parsed = def.data.safeParse(spec.data);
  if (!parsed.success) {
    return (
      <div className="render-error">
        資料格式不符（{def.label}）
        <ul>
          {parsed.error.issues.slice(0, 3).map((i, k) => (
            <li key={k}>
              {i.path.join(".") || "data"}：{i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const R = renderers[spec.type] as (p: RendererProps<ComponentType>) => JSX.Element;
  return <R data={parsed.data as never} options={spec.options ?? {}} large={large} />;
}
