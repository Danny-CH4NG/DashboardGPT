import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, GaugeChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { componentTypes, type ComponentSpec, type ComponentType } from "../../../shared/schema.ts";
import type { z } from "zod";

echarts.use([LineChart, BarChart, GaugeChart, PieChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

type DataOf<T extends ComponentType> = z.infer<(typeof componentTypes)[T]["data"]>;
type Opts = NonNullable<ComponentSpec["options"]>;
type RendererProps<T extends ComponentType> = { data: DataOf<T>; options: Opts; large?: boolean };

export const ACCENTS = { cyan: "#38d6f5", amber: "#f5b638", green: "#4ade80", red: "#f8656b", violet: "#a78bfa" } as const;
const PALETTE = ["#38d6f5", "#f5b638", "#a78bfa", "#4ade80", "#f8656b", "#7dd3fc"];
const STATUS_COLOR = { ok: "#4ade80", warn: "#f5b638", alert: "#f8656b", info: "#38d6f5" } as const;
const TEXT = "#c9d6e8";
const MUTED = "#6f819c";

const fmt = (v: number | string, decimals?: number) =>
  typeof v === "number" ? v.toLocaleString("zh-TW", { maximumFractionDigits: decimals ?? 1 }) : v;

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

const axisCommon = {
  axisLine: { lineStyle: { color: "#2a3a52" } },
  axisTick: { show: false },
  axisLabel: { color: MUTED, fontSize: 11 },
  splitLine: { lineStyle: { color: "#1c2a3e" } },
};

function SeriesChart({ data, options, large, kind }: RendererProps<"line"> & { kind: "line" | "bar" }) {
  const t = options.thresholds;
  const single = data.series.length === 1;
  const option: echarts.EChartsCoreOption = {
    color: options.accent ? [ACCENTS[options.accent], ...PALETTE] : PALETTE,
    grid: { left: 8, right: 12, top: single ? 12 : 30, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#0e1828", borderColor: "#2a3a52", textStyle: { color: TEXT } },
    legend: single ? undefined : { top: 0, right: 0, textStyle: { color: TEXT, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    xAxis: { type: "category", data: data.x, ...axisCommon, splitLine: { show: false } },
    yAxis: { type: "value", ...axisCommon },
    series: data.series.map((s, i) => ({
      name: s.name,
      type: kind,
      data: s.values.map((v) =>
        kind === "bar" && single && v != null && t
          ? { value: v, itemStyle: { color: t.alert != null && v >= t.alert ? STATUS_COLOR.alert : t.warn != null && v >= t.warn ? STATUS_COLOR.warn : undefined } }
          : v,
      ),
      smooth: options.smooth,
      stack: options.stacked ? "total" : undefined,
      symbol: large ? "circle" : "none",
      barMaxWidth: 22,
      itemStyle: kind === "bar" ? { borderRadius: [3, 3, 0, 0] } : undefined,
      areaStyle: kind === "line" && i === 0 ? { opacity: 0.15 } : undefined,
      markLine:
        i === 0 && t?.warn != null
          ? { symbol: "none", silent: true, lineStyle: { color: STATUS_COLOR.warn, type: "dashed", opacity: 0.8 }, label: { show: false }, data: [{ yAxis: t.warn }] }
          : undefined,
    })),
  };
  return <EChart option={option} />;
}

function Gauge({ data, options, large }: RendererProps<"gauge">) {
  const t = options.thresholds;
  const color =
    t?.alert != null && data.value <= t.alert ? STATUS_COLOR.alert : t?.warn != null && data.value <= t.warn ? STATUS_COLOR.warn : ACCENTS[options.accent ?? "cyan"];
  const option: echarts.EChartsCoreOption = {
    series: [
      {
        type: "gauge",
        min: data.min,
        max: data.max,
        startAngle: 210,
        endAngle: -30,
        radius: "92%",
        center: ["50%", "58%"],
        progress: { show: true, width: large ? 18 : 10, itemStyle: { color } },
        axisLine: { lineStyle: { width: large ? 18 : 10, color: [[1, "#1c2a3e"]] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: large, color: MUTED },
        title: { offsetCenter: [0, "38%"], color: MUTED, fontSize: 12 },
        detail: {
          offsetCenter: [0, "0%"],
          valueAnimation: true,
          color: TEXT,
          fontSize: large ? 44 : 26,
          fontWeight: 600,
          formatter: (v: number) => `${fmt(v, options.decimals)}${data.unit ?? ""}`,
        },
        data: [{ value: data.value, name: data.label ?? "" }],
      },
    ],
  };
  return <EChart option={option} />;
}

function Donut({ data, large }: RendererProps<"donut">) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const option: echarts.EChartsCoreOption = {
    color: PALETTE,
    tooltip: { trigger: "item", backgroundColor: "#0e1828", borderColor: "#2a3a52", textStyle: { color: TEXT } },
    legend: { orient: "vertical", right: 0, top: "middle", textStyle: { color: TEXT, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    title: {
      text: fmt(total),
      subtext: "總計",
      left: "33%",
      top: "38%",
      textAlign: "center",
      textStyle: { color: TEXT, fontSize: large ? 28 : 18, fontWeight: 600 },
      subtextStyle: { color: MUTED, fontSize: 11 },
      itemGap: 2,
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["34%", "52%"],
        label: { show: false },
        itemStyle: { borderColor: "#0b1420", borderWidth: 2 },
        data,
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
        <li key={i}>
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
  line: (p) => <SeriesChart data={p.data} options={p.options} large={p.large} kind="line" />,
  bar: (p) => <SeriesChart data={p.data} options={p.options} large={p.large} kind="bar" />,
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
