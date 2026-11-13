import type { z } from "zod";
import def from "./definition.ts";
import { STATUS_COLOR, fmt, type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

export default function KpiChips({ data }: Props) {
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
