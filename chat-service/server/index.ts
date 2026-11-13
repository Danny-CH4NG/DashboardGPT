import "./env.ts"; // must stay first: loads .env before other modules read process.env
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Agent, MODEL, type ChatEvent, type Template } from "./agent.ts";
import { DashboardClient, DashboardUnavailable } from "./dashboard.ts";
import { TYPE_HINTS } from "./prompt.ts";
import { originChecker } from "./origins.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4200);
const DASHBOARD_MCP_URL = process.env.DASHBOARD_MCP_URL ?? "http://localhost:4100/mcp";
// Pages that embed the widget may call this API. Loopback origins are always allowed; list others, comma separated.
const isAllowedOrigin = originChecker((process.env.ALLOWED_ORIGINS ?? "").split(","));

export async function buildServer(dashboard = new DashboardClient(DASHBOARD_MCP_URL)) {
  const agent = new Agent(dashboard);
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DashboardUnavailable) return reply.code(502).send({ error: "dashboard_unavailable", message: "無法連線到 Dashboard 服務" });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "bad_request", errors: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: "internal" });
  });

  const needSession = (id: string) => {
    const s = agent.get(id);
    if (!s) throw Object.assign(new Error("session not found"), { statusCode: 404 });
    return s;
  };

  app.get("/api/health", async () => ({ ok: true, model: MODEL, dashboard: await dashboard.ping() }));

  /** Template picker: templates come from the dashboard over MCP. */
  app.get("/api/templates", async () => {
    const r = await dashboard.call("list_templates");
    if (r.isError || !r.data) throw new DashboardUnavailable(r.text);
    return r.data;
  });

  app.post("/api/sessions", async (req) => {
    const { templateId } = z.object({ templateId: z.string().nullable() }).parse(req.body);
    let template: Template | null = null;
    if (templateId) {
      const r = await dashboard.call("get_template", { id: templateId });
      if (r.isError || !r.data) throw Object.assign(new Error("template not found"), { statusCode: 404 });
      template = r.data as Template;
    }
    const s = agent.create(template);
    return {
      sessionId: s.id,
      template: template && { id: template.id, title: template.title, type: template.type },
      hint: template ? TYPE_HINTS[template.type] : null,
    };
  });

  /** Streams the agent's reply as server-sent events over the POST response. */
  app.post<{ Params: { id: string } }>("/api/sessions/:id/messages", async (req, reply) => {
    const s = needSession(req.params.id);
    const { text } = z.object({ text: z.string().min(1).max(50_000) }).parse(req.body);
    const origin = req.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin!, Vary: "Origin" } : {}),
    });
    const abort = new AbortController();
    reply.raw.on("close", () => abort.abort());
    const emit = (e: ChatEvent) => !reply.raw.writableEnded && reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    await agent.run(s, text, emit, abort.signal);
    reply.raw.end();
  });

  /** "存到 Dashboard" button: deterministic, no model call. */
  app.post<{ Params: { id: string } }>("/api/sessions/:id/save", async (req, reply) => {
    const s = needSession(req.params.id);
    const { title } = z.object({ title: z.string().max(40).optional() }).parse(req.body ?? {});
    if (!s.draftId) return reply.code(409).send({ error: "no_draft", message: "還沒有預覽可以儲存" });
    if (s.savedComponentId) return { componentId: s.savedComponentId };
    const r = await dashboard.call("save_to_library", { draftId: s.draftId, ...(title ? { title } : {}) });
    if (r.isError || !r.data) return reply.code(422).send({ error: "save_failed", message: r.text });
    s.savedComponentId = String(r.data.componentId);
    return { componentId: s.savedComponentId, title: r.data.title };
  });

  app.get("/api/slots", async () => {
    const r = await dashboard.call("list_slots");
    if (r.isError || !r.data) throw new DashboardUnavailable(r.text);
    return r.data;
  });

  /** Places the saved component on the dashboard page (user-confirmed in the UI). */
  app.post<{ Params: { id: string } }>("/api/sessions/:id/apply", async (req, reply) => {
    const s = needSession(req.params.id);
    const { slotId } = z.object({ slotId: z.string() }).parse(req.body);
    if (!s.savedComponentId) return reply.code(409).send({ error: "not_saved", message: "請先存到 Dashboard" });
    const r = await dashboard.call("apply_to_slot", { slotId, componentId: s.savedComponentId });
    if (r.isError) return reply.code(422).send({ error: "apply_failed", message: r.text });
    return { ok: true };
  });

  // widget.js + a standalone test page
  const dist = path.join(root, "dist");
  if (existsSync(dist)) {
    await app.register(fastifyStatic, {
      root: dist,
      setHeaders: (res) => res.header("Access-Control-Allow-Origin", "*"),
    });
  }
  await app.register(fastifyStatic, { root: path.join(root, "public"), prefix: "/demo/", decorateReply: false });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_KEY) console.warn("[chat] ANTHROPIC_API_KEY is not set; chat replies will fail.");
  const app = await buildServer();
  // "::" listens on IPv6 and IPv4, so "localhost" works whichever one it resolves to (Windows often picks ::1).
  // Machines without IPv6 fall back to IPv4 only.
  try {
    await app.listen({ port: PORT, host: process.env.HOST ?? "::" });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (process.env.HOST || (code !== "EAFNOSUPPORT" && code !== "EADDRNOTAVAIL")) throw e;
    await app.listen({ port: PORT, host: "0.0.0.0" });
  }
}
