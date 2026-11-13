import type { z } from "zod";
import def from "./definition.ts";
import { echarts, PALETTE, TEXT, MUTED, HUD_FONT, NUM_FONT, fmt, shade, EChart, tooltip, legend, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

/** Donut with thickness: a darker copy offset below the top face reads as a 3D ring. */
export default function Donut({ data, large }: Props) {
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
