import type { z } from "zod";
import def from "./definition.ts";
import { type RendererProps } from "../_shared/chart.tsx";

type Props = RendererProps<z.output<typeof def.data>, z.output<typeof def.options>>;

const LEVEL_LABEL = { alert: "嚴重", warn: "注意", info: "資訊", ok: "正常" } as const;
export default function StatusList({ data }: Props) {
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
