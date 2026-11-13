/**
 * One Claude tool-use loop per user message. No graph framework: the flow is
 * linear and its only branch ("data has problems → ask the user") is decided
 * by what the dashboard's validation and the table analysis return.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { DashboardClient, DashboardUnavailable } from "./dashboard.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import { analyzePastedText } from "./table.ts";

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
const EFFORT = (process.env.CLAUDE_EFFORT ?? "medium") as "low" | "medium" | "high";
const MAX_STEPS = 12;
const AGENT_TOOLS = ["list_component_types", "get_component_schema", "get_template", "validate_component", "create_draft", "update_draft", "save_to_library"];

const STATUS_TEXT: Record<string, string> = {
  list_component_types: "查看可用的元件種類…",
  get_component_schema: "讀取元件格式…",
  get_template: "讀取模板…",
  validate_component: "檢查資料格式…",
  create_draft: "請 Dashboard 渲染預覽…",
  update_draft: "更新預覽…",
  save_to_library: "存到 Dashboard 圖庫…",
};

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "status"; text: string }
  | { type: "preview"; draftId: string; previewUrl: string; title?: string }
  | { type: "saved"; componentId: string; title?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type Template = { id: string; title: string; type: string; description?: string; [k: string]: unknown };

export type Session = {
  id: string;
  template: Template | null;
  messages: Anthropic.Beta.BetaMessageParam[];
  draftId?: string;
  previewUrl?: string;
  savedComponentId?: string;
  tableCount: number;
  busy: boolean;
  updatedAt: number;
};

export class Agent {
  private sessions = new Map<string, Session>();
  private client: Anthropic;

  constructor(private dashboard: DashboardClient) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_KEY,
      // Explicit, so an unrelated ANTHROPIC_BASE_URL in the environment cannot redirect traffic.
      baseURL: process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com",
    });
    setInterval(() => this.gc(), 10 * 60_000).unref();
  }

  private gc() {
    const cutoff = Date.now() - 2 * 3600_000;
    for (const [id, s] of this.sessions) if (s.updatedAt < cutoff) this.sessions.delete(id);
  }

  create(template: Template | null): Session {
    const s: Session = { id: randomUUID(), template, messages: [], tableCount: 0, busy: false, updatedAt: Date.now() };
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  private buildUserContent(s: Session, text: string): Anthropic.Beta.BetaContentBlockParam[] {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (s.messages.length === 0) {
      blocks.push({
        type: "text",
        text: s.template
          ? `<session_context>使用者選擇了 dashboard 模板，請以它為基礎：\n${JSON.stringify(s.template)}</session_context>`
          : "<session_context>使用者選擇了空白模板：請依資料挑選最合適的元件種類。</session_context>",
      });
    }
    if (s.draftId) blocks.push({ type: "text", text: `<session_context>目前已有預覽 draftId=${s.draftId}；修改請用 update_draft。</session_context>` });
    blocks.push({ type: "text", text });
    const tables = analyzePastedText(text, s.tableCount + 1);
    s.tableCount += tables.length;
    for (const t of tables) blocks.push({ type: "text", text: `<pasted_table id="${t.id}">\n${JSON.stringify(t)}\n</pasted_table>` });
    return blocks;
  }

  async run(s: Session, text: string, emit: (e: ChatEvent) => void, signal: AbortSignal) {
    if (s.busy) return emit({ type: "error", message: "上一則訊息還在處理中，請稍候。" });
    s.busy = true;
    s.updatedAt = Date.now();
    const snapshot = s.messages.length;
    try {
      s.messages.push({ role: "user", content: this.buildUserContent(s, text) });
      const tools = await this.dashboard.claudeTools(AGENT_TOOLS);

      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = this.client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            tools,
            messages: s.messages,
            output_config: { effort: EFFORT },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal },
        );
        stream.on("text", (delta) => emit({ type: "text", delta }));
        const msg = await stream.finalMessage();
        // Append the whole content (thinking blocks included) so the next request replays it unchanged.
        s.messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

        if (msg.stop_reason === "refusal") {
          emit({ type: "error", message: "這個請求無法處理，請換個方式描述。" });
          break;
        }
        const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (uses.length === 0) break;
        if (msg.stop_reason === "max_tokens") {
          emit({ type: "error", message: "回應過長被截斷，請把資料分批提供。" });
          break;
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of uses) {
          emit({ type: "status", text: STATUS_TEXT[use.name] ?? `${use.name}…` });
          if (!AGENT_TOOLS.includes(use.name)) {
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `unknown tool ${use.name}` });
            continue;
          }
          const out = await this.dashboard.call(use.name, use.input as Record<string, unknown>);
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: out.isError, content: out.text });
          if (!out.isError && out.data) this.onToolSuccess(s, use.name, out.data, emit);
        }
        s.messages.push({ role: "user", content: results });
      }
    } catch (e) {
      if (signal.aborted) {
        s.messages.length = snapshot; // drop the half-finished turn
        return;
      }
      s.messages.length = snapshot;
      emit({ type: "error", message: describeError(e) });
    } finally {
      s.busy = false;
      s.updatedAt = Date.now();
      emit({ type: "done" });
    }
  }

  private onToolSuccess(s: Session, tool: string, data: Record<string, unknown>, emit: (e: ChatEvent) => void) {
    if ((tool === "create_draft" || tool === "update_draft") && typeof data.draftId === "string") {
      s.draftId = data.draftId;
      s.previewUrl = String(data.previewUrl);
      s.savedComponentId = undefined;
      const spec = data.spec as { title?: string } | undefined;
      emit({ type: "preview", draftId: s.draftId, previewUrl: s.previewUrl, title: spec?.title });
    }
    if (tool === "save_to_library" && typeof data.componentId === "string") {
      s.savedComponentId = data.componentId;
      emit({ type: "saved", componentId: data.componentId, title: String(data.title ?? "") });
    }
  }
}

function describeError(e: unknown) {
  if (e instanceof DashboardUnavailable) return "無法連線到 Dashboard 服務，請確認它正在運作後再試一次。";
  if (e instanceof Anthropic.AuthenticationError) return "AI 服務的 API key 無效，請檢查 ANTHROPIC_API_KEY。";
  if (e instanceof Anthropic.RateLimitError) return "AI 服務目前請求過多，請稍後再試。";
  if (e instanceof Anthropic.APIError) return `AI 服務錯誤（${e.status ?? "?"}），請稍後再試。`;
  return "發生未預期的錯誤，請再試一次。";
}
