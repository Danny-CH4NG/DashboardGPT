import type { z } from "zod";
import def from "./definition.ts";
import { echarts, ACCENTS, STATUS_COLOR, MUTED, HUD_FONT, NUM_FONT, fmt, shade, alpha, EChart, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

/** Gauge built from stacked rings: tick bezel, bevelled track, glowing progress, domed centre. */
export default function Gauge({ data, options, large }: Props) {
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
