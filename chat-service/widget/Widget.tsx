import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ChatEvent, type Slot, type Template } from "./api.ts";

type Part =
  | { kind: "text"; text: string }
  | { kind: "status"; text: string }
  | { kind: "preview"; url: string; title?: string; draftId: string }
  | { kind: "saved"; title?: string }
  | { kind: "error"; text: string };
type Msg = { role: "user" | "assistant"; parts: Part[] };
type Session = { id: string; template: { id: string; title: string; type: string } | null };

// ---- tiny, safe markdown subset: paragraphs, lists, **bold**, `code` ----
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? <strong key={i}>{seg.slice(2, -2)}</strong> : seg.startsWith("`") && seg.endsWith("`") ? <code key={i}>{seg.slice(1, -1)}</code> : <Fragment key={i}>{seg}</Fragment>,
  );
}
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    blocks.push(<L key={blocks.length}>{list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</L>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:(\d+)[.)]|[-*•])\s+(.*)$/);
    if (m) {
      const ordered = !!m[1];
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(m[2]);
    } else if (line.trim() === "") flush();
    else {
      flush();
      blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

const TYPE_GLYPH: Record<string, ReactNode> = {
  line: <path d="M3 17l5-6 4 3 6-8 3 3" />,
  bar: <path d="M5 20V11M10 20V5M15 20v-6M20 20V8" />,
  gauge: <path d="M4 17a8 8 0 1 1 16 0M12 17l4-5" />,
  donut: <path d="M12 3a9 9 0 1 0 9 9h-9z M14 3.2A9 9 0 0 1 20.8 10H14z" />,
  kpi: <path d="M4 7h16M7 12h10M9 17h6" />,
  "kpi-chips": <path d="M3 9h6v6H3zM10 9h5v6h-5zM16 9h5v6h-5z" />,
  "status-list": <path d="M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11" />,
  ticker: <path d="M3 12h13M12 8l4 4-4 4M19 6v12" />,
};
const Glyph = ({ type }: { type: string }) => (
  <svg viewBox="0 0 24 24" className="glyph" aria-hidden>
    {TYPE_GLYPH[type] ?? <circle cx="12" cy="12" r="7" />}
  </svg>
);

function TemplatePicker({ onPick }: { onPick: (t: Template | null) => void }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.templates().then((r) => setTemplates(r.templates), (e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);

  const ai = templates?.filter((t) => t.source === "ai") ?? [];
  const builtin = templates?.filter((t) => t.source !== "ai") ?? [];
  const card = (t: Template) => (
    <button key={t.id} className="tpl" onClick={() => onPick(t)} title={t.description}>
      <Glyph type={t.type} />
      <span className="tpl__title">{t.title}</span>
      <span className="tpl__type">
        {t.typeLabel}
        {t.source === "ai" && <em>AI</em>}
      </span>
    </button>
  );

  return (
    <div className="picker">
      <p className="lead">選一個起點。模板來自 Dashboard，做好的元件會存回 Dashboard 圖庫。</p>
      <button className="tpl tpl--blank" onClick={() => onPick(null)}>
        <span className="plus">＋</span>
        <span>
          <span className="tpl__title">空白模板</span>
          <span className="tpl__type">貼上資料，由 AI 選擇最合適的元件</span>
        </span>
      </button>
      {error && (
        <div className="notice notice--error">
          無法從 Dashboard 取得模板：{error}
          <button className="link" onClick={load}>
            重試
          </button>
        </div>
      )}
      {!templates && !error && <div className="loading">讀取模板中…</div>}
      {ai.length > 0 && (
        <>
          <h4 className="section">AI 生成的模板</h4>
          <div className="tpl-grid">{ai.map(card)}</div>
        </>
      )}
      {builtin.length > 0 && (
        <>
          <h4 className="section">Dashboard 模板</h4>
          <div className="tpl-grid">{builtin.map(card)}</div>
        </>
      )}
    </div>
  );
}

function SaveBar({ sessionId, saved, onSaved }: { sessionId: string; saved: boolean; onSaved: (title?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotId, setSlotId] = useState("");
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    if (saved) api.slots().then((r) => setSlots(r.slots), () => setSlots([]));
  }, [saved]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.save(sessionId);
      onSaved(r.title);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!slotId) return;
    setBusy(true);
    setError(null);
    try {
      await api.apply(sessionId, slotId);
      setPlaced(slots?.find((s) => s.slotId === slotId)?.title ?? slotId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="savebar">
      {!saved ? (
        <button className="btn btn--primary" disabled={busy} onClick={save}>
          {busy ? "儲存中…" : "存到 Dashboard"}
        </button>
      ) : placed ? (
        <span className="ok">✓ 已放到頁面，取代「{placed}」</span>
      ) : (
        <div className="place">
          <span className="ok">✓ 已存到圖庫</span>
          <select value={slotId} onChange={(e) => setSlotId(e.target.value)} aria-label="要取代的元件">
            <option value="">取代頁面上的…</option>
            {slots?.map((s) => (
              <option key={s.slotId} value={s.slotId}>
                {s.title ?? s.componentId}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!slotId || busy} onClick={apply}>
            放到頁面
          </button>
        </div>
      )}
      {error && <div className="notice notice--error">{error}</div>}
    </div>
  );
}

export function Widget() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unread, setUnread] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

  const start = async (t: Template | null) => {
    setStarting(true);
    try {
      const r = await api.createSession(t?.id ?? null);
      setSession({ id: r.sessionId, template: r.template });
      const intro = r.template
        ? `已選擇模板 **${r.template.title}**。請貼上要顯示的資料，可以直接從 Excel 複製，或用 CSV、Markdown 表格。\n\n格式範例：`
        : "使用 **空白模板**。請貼上資料（可直接從 Excel 複製，或用 CSV、Markdown 表格），並簡單說明想呈現什麼，我會挑選最合適的元件。";
      setMessages([{ role: "assistant", parts: [{ kind: "text", text: intro }, ...(r.hint ? [{ kind: "status" as const, text: r.hint }] : [])] }]);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setMessages([{ role: "assistant", parts: [{ kind: "error", text: `無法開始：${(e as Error).message}` }] }]);
      setSession(null);
    } finally {
      setStarting(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setSession(null);
    setMessages([]);
    setHasPreview(false);
    setSaved(false);
    setBusy(false);
  };

  const patchLast = (fn: (m: Msg) => Msg) => setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

  const onEvent = (e: ChatEvent) => {
    switch (e.type) {
      case "text":
        return patchLast((m) => {
          const last = m.parts[m.parts.length - 1];
          if (last?.kind === "text") return { ...m, parts: [...m.parts.slice(0, -1), { kind: "text", text: last.text + e.delta }] };
          return { ...m, parts: [...m.parts, { kind: "text", text: e.delta }] };
        });
      case "status":
        return patchLast((m) => {
          const last = m.parts[m.parts.length - 1];
          const parts = last?.kind === "status" ? m.parts.slice(0, -1) : m.parts;
          return { ...m, parts: [...parts, { kind: "status", text: e.text }] };
        });
      case "preview":
        setHasPreview(true);
        setSaved(false);
        return patchLast((m) => ({
          ...m,
          parts: [...m.parts.filter((p) => p.kind !== "status"), { kind: "preview", url: e.previewUrl, title: e.title, draftId: e.draftId }],
        }));
      case "saved":
        setSaved(true);
        return patchLast((m) => ({ ...m, parts: [...m.parts, { kind: "saved", title: e.title }] }));
      case "error":
        return patchLast((m) => ({ ...m, parts: [...m.parts, { kind: "error", text: e.message }] }));
      case "done":
        return patchLast((m) => ({ ...m, parts: m.parts.filter((p) => p.kind !== "status") }));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !session || busy) return;
    setInput("");
    setBusy(true);
    setMessages((ms) => [...ms, { role: "user", parts: [{ kind: "text", text }] }, { role: "assistant", parts: [{ kind: "status", text: "分析中…" }] }]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await api.send(session.id, text, onEvent, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) onEvent({ type: "error", message: `連線中斷：${(e as Error).message}` });
    } finally {
      setBusy(false);
      if (!open) setUnread(true);
    }
  };

  return (
    <>
      <button className={`fab ${open ? "fab--hidden" : ""}`} onClick={() => setOpen(true)} aria-label="開啟 AI 元件助理">
        <span className="fab__core">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
            <path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
          </svg>
        </span>
        <span className="fab__label">AI 元件助理</span>
        {(unread || busy) && <span className={`fab__dot ${busy ? "fab__dot--busy" : ""}`} />}
      </button>

      <section className={`panel ${open ? "panel--open" : ""} ${wide ? "panel--wide" : ""}`} role="dialog" aria-label="AI 元件助理" aria-hidden={!open}>
        <header className="panel__head">
          <div className="panel__title">
            <span className="pulse" />
            <div>
              <strong>AI 元件助理</strong>
              <small>{session ? (session.template ? `模板｜${session.template.title}` : "空白模板") : "選擇模板"}</small>
            </div>
          </div>
          <div className="panel__tools">
            {session && (
              <button className="icon" onClick={reset} title="重新選擇模板" aria-label="重新開始">
                ↺
              </button>
            )}
            <button className="icon" onClick={() => setWide((w) => !w)} title={wide ? "縮小" : "放大"} aria-label={wide ? "縮小" : "放大"}>
              {wide ? "⤡" : "⤢"}
            </button>
            <button className="icon" onClick={() => setOpen(false)} title="收合" aria-label="收合">
              ✕
            </button>
          </div>
        </header>

        <div className="panel__body" ref={scrollRef}>
          {!session && !messages.length ? (
            starting ? <div className="loading">建立對話中…</div> : <TemplatePicker onPick={start} />
          ) : (
            <div className="thread">
              {messages.map((m, i) => (
                <div key={i} className={`msg msg--${m.role}`}>
                  {m.parts.map((p, j) => {
                    if (p.kind === "text") return m.role === "user" ? <pre key={j} className="bubble">{p.text}</pre> : <div key={j} className="bubble rich"><RichText text={p.text} /></div>;
                    if (p.kind === "status")
                      return (
                        <div key={j} className={`status ${p.text.includes("\n") ? "status--hint" : ""}`}>
                          {!p.text.includes("\n") && <span className="spinner" />}
                          <span>{p.text}</span>
                        </div>
                      );
                    if (p.kind === "preview")
                      return (
                        <figure key={j} className="preview">
                          <figcaption>
                            <span>預覽（由 Dashboard 渲染）</span>
                            <a href={p.url} target="_blank" rel="noreferrer">
                              新視窗開啟 ↗
                            </a>
                          </figcaption>
                          <iframe src={p.url} title={p.title ?? "預覽"} loading="lazy" />
                        </figure>
                      );
                    if (p.kind === "saved") return <div key={j} className="ok">✓ 已存到 Dashboard 圖庫{p.title ? `：${p.title}` : ""}</div>;
                    return (
                      <div key={j} className="notice notice--error">
                        {p.text}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {session && (
          <footer className="panel__foot">
            {hasPreview && !busy && <SaveBar sessionId={session.id} saved={saved} onSaved={() => setSaved(true)} />}
            <div className="composer">
              <textarea
                ref={inputRef}
                value={input}
                placeholder="貼上表格資料，或描述想要的修改…（Enter 送出，Shift+Enter 換行）"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={3}
                disabled={busy}
              />
              <button className="send" onClick={send} disabled={busy || !input.trim()} aria-label="送出">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 12l16-8-6 16-2.5-6.5z" />
                </svg>
              </button>
            </div>
          </footer>
        )}
      </section>
    </>
  );
}
