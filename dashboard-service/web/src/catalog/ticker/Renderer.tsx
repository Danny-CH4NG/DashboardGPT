import type { z } from "zod";
import def from "./definition.ts";
import { type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

export default function Ticker({ data }: Props) {
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
