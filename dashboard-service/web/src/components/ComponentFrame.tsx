import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentSpec, GridSize } from "../../../shared/schema.ts";
import { ComponentBody } from "../renderers/index.tsx";

type Props = {
  spec: ComponentSpec;
  grid?: GridSize;
  maxColumns?: number;
  /** Omitted in embed/preview mode: no replace or resize controls. */
  onReplace?: () => void;
  onResize?: (grid: GridSize) => void;
  highlighted?: boolean;
  fill?: boolean;
};

/** Shared outer shell for every component: title, help, expand, replace, size. */
export function ComponentFrame({ spec, grid, maxColumns = 12, onReplace, onResize, highlighted, fill }: Props) {
  const [help, setHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu && !help) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setHelp(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu, help]);

  useEffect(() => {
    if (!expanded) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [expanded]);

  const style = grid && !fill ? { gridColumn: `span ${Math.min(grid.colSpan, maxColumns)}`, gridRow: `span ${grid.rowSpan}` } : undefined;
  const resize = (dc: number, dr: number) => {
    if (!grid || !onResize) return;
    onResize({
      colSpan: Math.max(1, Math.min(maxColumns, grid.colSpan + dc)),
      rowSpan: Math.max(1, Math.min(8, grid.rowSpan + dr)),
    });
  };

  return (
    <>
      <section className={`frame ${highlighted ? "frame--hl" : ""} ${fill ? "frame--fill" : ""}`} style={style} data-component={spec.id} data-type={spec.type}>
        <header className="frame__head" ref={menuRef}>
          <h3 className="frame__title" title={spec.title}>
            {spec.title}
            {spec.source?.kind === "ai" && <span className="ai-tag">AI</span>}
          </h3>
          <div className="frame__tools">
            {spec.description && (
              <button className="icon-btn" aria-label="說明" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
                ?
              </button>
            )}
            <button className="icon-btn" aria-label="放大" onClick={() => setExpanded(true)}>
              ⤢
            </button>
            {(onReplace || onResize) && (
              <button className="icon-btn" aria-label="更多" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                ⋯
              </button>
            )}
          </div>
          {help && <div className="popover popover--help">{spec.description}</div>}
          {menu && (
            <div className="popover popover--menu" role="menu">
              {onReplace && (
                <button role="menuitem" onClick={() => (setMenu(false), onReplace())}>
                  替換元件…
                </button>
              )}
              {onResize && grid && (
                <div className="size-ctl">
                  <span>
                    寬 {grid.colSpan}/{maxColumns}
                  </span>
                  <button aria-label="變窄" onClick={() => resize(-1, 0)}>−</button>
                  <button aria-label="變寬" onClick={() => resize(1, 0)}>+</button>
                  <span>高 {grid.rowSpan}</span>
                  <button aria-label="變矮" onClick={() => resize(0, -1)}>−</button>
                  <button aria-label="變高" onClick={() => resize(0, 1)}>+</button>
                </div>
              )}
            </div>
          )}
        </header>
        <div className="frame__body">
          <ComponentBody spec={spec} />
        </div>
      </section>
      {expanded &&
        createPortal(
        <div className="modal" role="dialog" aria-label={spec.title} onMouseDown={(e) => e.target === e.currentTarget && setExpanded(false)}>
          <div className="modal__card">
            <header className="frame__head">
              <h3 className="frame__title">{spec.title}</h3>
              <button className="icon-btn" aria-label="關閉" onClick={() => setExpanded(false)}>
                ✕
              </button>
            </header>
            {spec.description && <p className="modal__desc">{spec.description}</p>}
            <div className="modal__body">
              <ComponentBody spec={spec} large />
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
