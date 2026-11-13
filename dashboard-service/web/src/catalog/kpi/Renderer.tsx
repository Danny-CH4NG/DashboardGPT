import type { z } from "zod";
import def from "./definition.ts";
import { ACCENTS, STATUS_COLOR, fmt, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

export default function Kpi({ data, options, large }: Props) {
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
