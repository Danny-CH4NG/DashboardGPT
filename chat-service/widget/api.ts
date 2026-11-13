export type Template = { id: string; title: string; type: string; typeLabel: string; description: string; source: "builtin" | "ai"; createdAt?: string };
export type Slot = { slotId: string; zone: string; componentId: string; title?: string };
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "status"; text: string }
  | { type: "preview"; draftId: string; previewUrl: string; title?: string }
  | { type: "saved"; componentId: string; title?: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** The API lives wherever widget.js was loaded from. */
export const API_BASE = new URL(".", import.meta.url).origin;

/** fetch() that turns a bare network/CORS failure ("Failed to fetch") into an actionable message. */
async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(
      `連不到 AI 服務（${API_BASE}）。請確認 chat-service 正在執行；若 dashboard 不是用 localhost 開啟，請把 ${location.origin} 加到 chat-service 的 ALLOWED_ORIGINS。`,
    );
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  templates: () => call(`${API_BASE}/api/templates`).then((r) => json<{ templates: Template[] }>(r)),
  slots: () => call(`${API_BASE}/api/slots`).then((r) => json<{ slots: Slot[] }>(r)),
  createSession: (templateId: string | null) =>
    call(`${API_BASE}/api/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId }) }).then((r) =>
      json<{ sessionId: string; template: { id: string; title: string; type: string } | null; hint: string | null }>(r),
    ),
  save: (sid: string) =>
    call(`${API_BASE}/api/sessions/${sid}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) =>
      json<{ componentId: string; title?: string }>(r),
    ),
  apply: (sid: string, slotId: string) =>
    call(`${API_BASE}/api/sessions/${sid}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId }) }).then((r) =>
      json<{ ok: true }>(r),
    ),
  /** POST + read the SSE stream of agent events. */
  async send(sid: string, text: string, onEvent: (e: ChatEvent) => void, signal: AbortSignal) {
    const res = await call(`${API_BASE}/api/sessions/${sid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (line) onEvent(JSON.parse(line.slice(5)));
      }
    }
  },
};
