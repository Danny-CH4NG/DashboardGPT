import type { z } from "zod";
import def from "./definition.ts";
import { echarts, ACCENTS, PALETTE, STATUS_COLOR, fmt, shade, alpha, EChart, tooltip, axisCommon, legend, niceCeil, type CustomApi, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

/** Bars drawn as lit cuboids (front, side and top faces). */
export default function Bar3D({ data, options, large }: Props) {
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
