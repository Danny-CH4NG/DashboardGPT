import "./env.ts"; // must stay first: loads .env before other modules read process.env
import Fastify from "fastify";

/** The Fastify factory; server.ts passes its own import so Vercel can detect the framework from the entry file. */
export type FastifyFactory = typeof Fastify;
import cors from "@fastify/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Agent, MODEL, newChatState, type ChatEvent, type ChatState, type Template } from "./agent.ts";
import { DashboardClient, DashboardUnavailable } from "./dashboard.ts";
import { TYPE_HINTS } from "./prompt.ts";
import { originChecker } from "./origins.ts";
import { serveStatic } from "./static.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4200);
const DASHBOARD_MCP_URL = process.env.DASHBOARD_MCP_URL ?? "http://localhost:4100/mcp";
// Pages that embed the widget may call this API. Loopback origins are always allowed; list others, comma separated.
const isAllowedOrigin = originChecker((process.env.ALLOWED_ORIGINS ?? "").split(","));
// widget.js and the standalone demo page (on Vercel the CDN serves this folder).
const WEB_DIR = path.join(root, "public");

// The conversation travels with each request; validate its outer shape and size.
const chatState = z.object({
  template: z.record(z.unknown()).nullable(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() }).passthrough()).max(400),
  draftId: z.string().optional(),
  previewUrl: z.string().optional(),
  savedComponentId: z.string().optional(),
  tableCount: z.number().int().min(0),
});

export async function buildServer(dashboard = new DashboardClient(DASHBOARD_MCP_URL), fastify: FastifyFactory = Fastify) {
  const agent = new Agent(dashboard);
  const app = fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 4 * 1024 * 1024 });
  await app.register(cors, { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DashboardUnavailable) return reply.code(502).send({ error: "dashboard_unavailable", message: "無法連線到 Dashboard 服務" });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "bad_request", errors: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: "internal" });
  });

  app.get("/api/health", async () => ({ ok: true, model: MODEL, dashboard: await dashboard.ping() }));

  /** Template picker: templates come from the dashboard over MCP. */
  app.get("/api/templates", async () => {
    const r = await dashboard.call("list_templates");
    if (r.isError || !r.data) throw new DashboardUnavailable(r.text);
    return r.data;
  });

  /** Starts a conversation: returns the initial state (kept by the browser) and a data-format hint. */
  app.post("/api/start", async (req, reply) => {
    const { templateId } = z.object({ templateId: z.string().nullable() }).parse(req.body);
    let template: Template | null = null;
    if (templateId) {
      const r = await dashboard.call("get_template", { id: templateId });
      if (r.isError || !r.data) return reply.code(404).send({ error: "template_not_found", message: "找不到這個模板" });
      template = r.data as Template;
    }
    return { state: newChatState(template), hint: template ? TYPE_HINTS[template.type] ?? null : null };
  });

  /** One user turn. Streams agent events as SSE over the POST response; the last useful event is the new state. */
  app.post("/api/chat", async (req, reply) => {
    const body = z.object({ state: chatState, text: z.string().min(1).max(50_000) }).parse(req.body);
    const origin = req.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin!, Vary: "Origin" } : {}),
    });
    const abort = new AbortController();
    reply.raw.on("close", () => abort.abort());
    const emit = (e: ChatEvent) => !reply.raw.writableEnded && reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    await agent.run(body.state as ChatState, body.text, emit, abort.signal);
    reply.raw.end();
  });

  /** "存到 Dashboard" button: deterministic, no model call. */
  app.post("/api/save", async (req, reply) => {
    const { draftId, title } = z.object({ draftId: z.string(), title: z.string().max(40).optional() }).parse(req.body);
    const r = await dashboard.call("save_to_library", { draftId, ...(title ? { title } : {}) });
    if (r.isError || !r.data) return reply.code(422).send({ error: "save_failed", message: r.text });
    return { componentId: String(r.data.componentId), title: r.data.title };
  });

  app.get("/api/slots", async () => {
    const r = await dashboard.call("list_slots");
    if (r.isError || !r.data) throw new DashboardUnavailable(r.text);
    return r.data;
  });

  /** Places a saved component on the dashboard page (user-confirmed in the UI). */
  app.post("/api/apply", async (req, reply) => {
    const { slotId, componentId } = z.object({ slotId: z.string(), componentId: z.string() }).parse(req.body);
    const r = await dashboard.call("apply_to_slot", { slotId, componentId });
    if (r.isError) return reply.code(422).send({ error: "apply_failed", message: r.text });
    return { ok: true };
  });

  // widget.js + demo page (public/; on Vercel it is bundled with the function and served from here too)
  serveStatic(app, WEB_DIR, {
    fallback: (p) => (p === "/" ? "index.html" : null),
    headers: (p): Record<string, string> => (p === "/widget.js" ? { "Access-Control-Allow-Origin": "*" } : {}),
  });

  return app;
}

/** Starts listening. On Vercel the platform takes over the listen call. */
export async function startServer(fastify: FastifyFactory = Fastify) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_KEY) console.warn("[chat] ANTHROPIC_API_KEY is not set; chat replies will fail.");
  const app = await buildServer(undefined, fastify);
  // "::" listens on IPv6 and IPv4, so "localhost" works whichever one it resolves to (Windows often picks ::1).
  // Machines without IPv6 fall back to IPv4 only.
  try {
    await app.listen({ port: PORT, host: process.env.HOST ?? "::" });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (process.env.HOST || (code !== "EAFNOSUPPORT" && code !== "EADDRNOTAVAIL")) throw e;
    await app.listen({ port: PORT, host: "0.0.0.0" });
  }
  return app;
}
