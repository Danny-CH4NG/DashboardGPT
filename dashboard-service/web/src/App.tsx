import { useEffect, useMemo, useState } from "react";
import type { ComponentSpec, Layout, Slot, ZoneId } from "./types.ts";
import { api, useLive } from "./api.ts";
import { ComponentFrame } from "./components/ComponentFrame.tsx";
import { LibraryDrawer } from "./components/LibraryDrawer.tsx";
import { DEFAULT_BASEMAP, StationMap, type Basemap } from "./components/StationMap.tsx";

const LAYOUT_EVENTS = ["layout.updated"];
const LIBRARY_EVENTS = ["library.updated"];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Runtime config from the server; falls back to defaults so the page still renders without it. */
function useConfig() {
  const [config, setConfig] = useState<{ chatWidgetUrl: string; basemap: Basemap } | null>(null);
  useEffect(() => {
    api.config().then(setConfig, () => setConfig({ chatWidgetUrl: "", basemap: DEFAULT_BASEMAP }));
  }, []);
  return config;
}

/** Loads the optional chat widget. The dashboard works the same without it. */
function useChatWidget(chatWidgetUrl: string | undefined) {
  useEffect(() => {
    if (!chatWidgetUrl || document.querySelector("dashboard-chat")) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = chatWidgetUrl;
    const el = document.createElement("dashboard-chat");
    s.onerror = () => {
      console.warn("[dashboard] chat widget unavailable; continuing without it");
      el.remove();
    };
    document.head.appendChild(s);
    el.setAttribute("dashboard-url", location.origin);
    document.body.appendChild(el);
  }, [chatWidgetUrl]);
}

export function App() {
  const layout = useLive(api.layout, LAYOUT_EVENTS);
  const library = useLive(api.components, LIBRARY_EVENTS);
  const [replacing, setReplacing] = useState<Slot | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const clock = useClock();
  const config = useConfig();
  useChatWidget(config?.chatWidgetUrl);

  const byId = useMemo(() => Object.fromEntries((library.value ?? []).map((c) => [c.id, c])), [library.value]);

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(t);
  }, [highlight]);

  if (layout.error || library.error) return <div className="fatal">無法載入儀表板：{layout.error ?? library.error}</div>;
  if (!layout.value || !library.value) return <div className="fatal">載入中…</div>;

  const zone = (id: ZoneId, l: Layout) => {
    const z = l.zones[id];
    if (!z) return null;
    return (
      <div className={`zone zone--${id}`} style={{ gridTemplateColumns: `repeat(${z.columns}, minmax(0, 1fr))` }}>
        {z.slots.map((s) => {
          const spec: ComponentSpec | undefined = byId[s.componentId];
          if (!spec) return <div key={s.slotId} className="frame render-error">找不到元件 {s.componentId}</div>;
          return (
            <ComponentFrame
              key={s.slotId}
              spec={spec}
              grid={s.grid}
              maxColumns={z.columns}
              highlighted={highlight === spec.id}
              onReplace={() => setReplacing(s)}
              onResize={(grid) => api.resizeSlot(s.slotId, grid)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="app">
      {config && <StationMap basemap={config.basemap} onSelect={(z) => z.componentId && setHighlight(z.componentId)} />}
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark">
            <span>HC</span>
          </span>
          <span className="brand-text">
            <strong>新竹站｜數位孿生</strong>
            <small>HSINCHU STATION · DIGITAL TWIN</small>
          </span>
        </div>
        <div className="topbar__time">
          <span className="clock">{clock}</span>
          <span className="muted">晴 24°C · 濕度 68%</span>
        </div>
        <div className="topbar__slot">{zone("top", layout.value)}</div>
      </header>
      <aside className="side side--left">{zone("left", layout.value)}</aside>
      <aside className="side side--right">{zone("right", layout.value)}</aside>
      <aside className="side side--bottom-left">{zone("bottomLeft", layout.value)}</aside>
      <button className="reset-btn" onClick={() => confirm("將版面還原為預設？") && api.resetLayout()}>
        還原預設版面
      </button>
      {replacing && (
        <LibraryDrawer
          components={library.value}
          currentId={replacing.componentId}
          targetTitle={byId[replacing.componentId]?.title}
          onClose={() => setReplacing(null)}
          onPick={async (id) => {
            await api.replaceSlot(replacing.slotId, id);
            setReplacing(null);
            setHighlight(id);
          }}
        />
      )}
    </div>
  );
}
