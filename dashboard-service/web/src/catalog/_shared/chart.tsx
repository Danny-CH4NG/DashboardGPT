import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, GaugeChart, PieChart, CustomChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GaugeChart, PieChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

export { echarts };
/** Props every renderer receives: validated data and options for its own type. */
export type RendererProps<D, O> = { data: D; options: O; large?: boolean };

export const ACCENTS = { cyan: "#38d6f5", amber: "#f5b638", green: "#4ade80", red: "#ff6b78", violet: "#8b7bff" } as const;
export const PALETTE = ["#38d6f5", "#f5b638", "#8b7bff", "#4ade80", "#ff6b78", "#7dd3fc"];
export const STATUS_COLOR = { ok: "#4ade80", warn: "#f5b638", alert: "#ff6b78", info: "#38d6f5" } as const;
export const TEXT = "#d4e3f5";
export const MUTED = "#6f86a6";
export const HUD_FONT = "Rajdhani, 'Noto Sans TC', sans-serif";
export const NUM_FONT = "Orbitron, Rajdhani, sans-serif";

export const fmt = (v: number | string, decimals?: number) =>
  typeof v === "number" ? v.toLocaleString("zh-TW", { maximumFractionDigits: decimals ?? 1 }) : v;

/** Shift a #rrggbb colour lighter (amt > 0) or darker (amt < 0). */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => {
    const c = (n >> s) & 255;
    return Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export function EChart({ option }: { option: echarts.EChartsCoreOption }) {
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

export const tooltip = {
  backgroundColor: "rgba(6, 14, 28, 0.95)",
  borderColor: "rgba(56, 214, 245, 0.45)",
  textStyle: { color: TEXT, fontFamily: HUD_FONT },
  extraCssText: "box-shadow: 0 0 18px rgba(56,214,245,.25); border-radius: 8px;",
};
export const axisCommon = {
  axisLine: { lineStyle: { color: "rgba(56, 214, 245, 0.25)" } },
  axisTick: { show: false },
  axisLabel: { color: MUTED, fontSize: 11, fontFamily: HUD_FONT },
  splitLine: { lineStyle: { color: "rgba(56, 214, 245, 0.08)", type: "dashed" } },
};
export const legend = (show: boolean) =>
  show ? { top: 0, right: 0, textStyle: { color: TEXT, fontSize: 11, fontFamily: HUD_FONT }, itemWidth: 12, itemHeight: 6, icon: "roundRect" } : undefined;


/** Rounds up to a tidy axis maximum: 95.04 → 100, 1720 → 2000. */
export function niceCeil(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v)!;
  return step * p;
}

export type CustomApi = { value: (dim: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] };
