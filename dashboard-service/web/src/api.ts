import { useEffect, useState, useCallback } from "react";
import type { ComponentSpec, GridSize, Layout } from "./types.ts";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  layout: () => fetch("/api/layout").then((r) => json<Layout>(r)),
  components: () => fetch("/api/components").then((r) => json<ComponentSpec[]>(r)),
  component: (id: string) => fetch(`/api/components/${id}`).then((r) => json<ComponentSpec>(r)),
  draft: (id: string) => fetch(`/api/drafts/${id}`).then((r) => json<{ spec: ComponentSpec }>(r)),
  config: () => fetch("/api/config").then((r) => json<{ chatWidgetUrl: string }>(r)),
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

/** Re-runs `load` whenever the server reports one of `events`. */
export function useLive<T>(load: () => Promise<T>, events: string[]) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    load().then(setValue, (e) => setError(String(e)));
  }, [load]);
  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    events.forEach((e) => es.addEventListener(e, refresh));
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, events.join()]);
  return { value, error, refresh };
}
