import { useMemo, useState } from "react";
import { componentTypes, type ComponentSpec } from "../../../shared/schema.ts";
import { ComponentBody } from "../renderers/index.tsx";

type Props = {
  components: ComponentSpec[];
  currentId?: string;
  targetTitle?: string;
  onPick: (componentId: string) => void;
  onClose: () => void;
};

/** Side drawer listing every template in the library (builtin + AI-made) for slot replacement. */
export function LibraryDrawer({ components, currentId, targetTitle, onPick, onClose }: Props) {
  const [tab, setTab] = useState<"builtin" | "ai">("builtin");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(
    () =>
      components
        .filter((c) => (c.source?.kind ?? "builtin") === tab)
        .sort((a, b) => (b.source?.createdAt ?? "").localeCompare(a.source?.createdAt ?? "")),
    [components, tab],
  );
  const aiCount = components.filter((c) => c.source?.kind === "ai").length;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" aria-label="元件圖庫">
        <header className="drawer__head">
          <div>
            <h2>替換元件</h2>
            {targetTitle && <p className="muted">目前：{targetTitle}</p>}
          </div>
          <button className="icon-btn" aria-label="關閉" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "builtin"} onClick={() => setTab("builtin")}>
            內建模板
          </button>
          <button role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")}>
            AI 生成 <span className="count">{aiCount}</span>
          </button>
        </div>
        <div className="drawer__list">
          {list.length === 0 && <p className="muted">還沒有 AI 生成的元件。用右下角的 AI 助理做一個吧。</p>}
          {list.map((c) => (
            <button
              key={c.id}
              className={`lib-item ${selected === c.id ? "lib-item--sel" : ""}`}
              onClick={() => setSelected(c.id)}
              disabled={c.id === currentId}
            >
              <div className="lib-item__meta">
                <strong>{c.title}</strong>
                <span className="muted">
                  {componentTypes[c.type].label}
                  {c.id === currentId ? " · 使用中" : ""}
                </span>
              </div>
              <div className="lib-item__preview">
                <ComponentBody spec={c} />
              </div>
            </button>
          ))}
        </div>
        <footer className="drawer__foot">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" disabled={!selected} onClick={() => selected && onPick(selected)}>
            替換
          </button>
        </footer>
      </aside>
    </div>
  );
}
