import { useEffect, useState, useCallback } from "react";
import type { ComponentSpec, GridSize, Layout } from "./types.ts";
import type { Basemap } from "./components/StationMap.tsx";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  layout: () => fetch("/api/layout").then((r) => json<Layout>(r)),
  components: () => fetch("/api/components").then((r) => json<ComponentSpec[]>(r)),
  component: (id: string) => fetch(`/api/components/${id}`).then((r) => json<ComponentSpec>(r)),
  draft: (id: string) => fetch(`/api/drafts/${id}`).then((r) => json<{ spec: ComponentSpec }>(r)),
  config: () => fetch("/api/config").then((r) => json<{ chatWidgetUrl: string; basemap: Basemap }>(r)),
  replaceSlot: (slotId: string, componentId: string) =>
    fetch(`/api/layout/slots/${slotId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentId }),
    }).then((r) => json(r)),
  resizeSlot: (slotId: string, grid: GridSize) =>
    fetch(`/api/layout/slots/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grid }),
    }).then((r) => json(r)),
  resetLayout: () => fetch("/api/layout/reset", { method: "POST" }).then((r) => json(r)),
};

/**
 * Shared poller: one /api/revision request every few seconds for the whole page
 * (paused while the tab is hidden). Every write on the server bumps the revision.
 */
const POLL_MS = 4000;
type Listener = () => void;
const listeners = new Set<Listener>();
let lastRevision: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function poll() {
  timer = null;
  if (!document.hidden) {
    try {
      const { revision } = await fetch("/api/revision").then((r) => json<{ revision: number }>(r));
      if (lastRevision !== null && revision !== lastRevision) listeners.forEach((l) => l());
      lastRevision = revision;
    } catch {
      /* offline or server restarting: try again next tick */
    }
  }
  if (listeners.size) timer = setTimeout(poll, POLL_MS);
}
function subscribe(l: Listener) {
  listeners.add(l);
  if (!timer) timer = setTimeout(poll, 0);
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && listeners.size && timer) {
    clearTimeout(timer);
    timer = setTimeout(poll, 0);
  }
});

/** Loads `load` and re-runs it whenever server data changes. */
export function useLive<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    load().then(
      (v) => {
        setValue(v);
        setError(null);
      },
      (e) => setError(String(e)),
    );
  }, [load]);
  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);
  return { value, error, refresh };
}
