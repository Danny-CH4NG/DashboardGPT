import type { z } from "zod";
import def from "./definition.ts";
import { echarts, ACCENTS, PALETTE, STATUS_COLOR, alpha, EChart, tooltip, axisCommon, legend, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

export default function LineSeries({ data, options, large }: Props) {
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
