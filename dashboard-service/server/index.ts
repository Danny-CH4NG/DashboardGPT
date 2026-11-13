import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { gridSize } from "../shared/schema.ts";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Invalid, NotFound, Store, type StoreEvent } from "./store.ts";
import { createMcpServer } from "./mcp.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4100);
const DATA_FILE = process.env.DATA_FILE ?? path.join(root, "data", "db.json");
// Origins allowed to call the API (e.g. the chat service) — comma separated.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:4200,http://localhost:5173").split(",").map((s) => s.trim());
// Pages allowed to embed /embed/* in an iframe.
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS ?? "'self' http://localhost:4200 http://localhost:5174";
// Optional: URL of the chat widget script. Unset = dashboard runs without chat.
const CHAT_WIDGET_URL = process.env.CHAT_WIDGET_URL ?? "";

export async function buildServer(store: Store) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: ALLOWED_ORIGINS });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Invalid) return reply.code(422).send({ error: "invalid", errors: err.errors });
    if (err instanceof NotFound) return reply.code(404).send({ error: "not_found", message: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "bad_request", errors: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: "internal", message: "internal error" });
  });

  // ---- config for the web app ----
  app.get("/api/config", async () => ({ chatWidgetUrl: CHAT_WIDGET_URL }));

  // ---- library ----
  app.get("/api/components", async () => store.listComponents());
  app.get<{ Params: { id: string } }>("/api/components/:id", async (req) => store.getComponent(req.params.id));

  // ---- drafts (previews made by other services) ----
  app.get<{ Params: { id: string } }>("/api/drafts/:id", async (req) => store.getDraft(req.params.id));

  // ---- layout ----
  app.get("/api/layout", async () => store.getLayout());
  app.put<{ Params: { slotId: string } }>("/api/layout/slots/:slotId", async (req) => {
    const body = z.object({ componentId: z.string(), keepSlotSize: z.boolean().optional() }).parse(req.body);
    return store.replaceSlot(req.params.slotId, body.componentId, { keepSlotSize: body.keepSlotSize ?? true });
  });
  app.patch<{ Params: { slotId: string } }>("/api/layout/slots/:slotId", async (req) => {
    const body = z.object({ grid: gridSize }).parse(req.body);
    return store.resizeSlot(req.params.slotId, body.grid);
  });
  app.post("/api/layout/reset", async () => store.resetLayout());

  // ---- server-sent events: lets every open page refresh on change ----
  app.get("/api/events", (req, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(req.headers.origin ?? "") ? req.headers.origin! : ALLOWED_ORIGINS[0],
    });
    const send = (e: StoreEvent) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    store.on("event", send);
    req.raw.on("close", () => {
      clearInterval(ping);
      store.off("event", send);
    });
  });

  // ---- MCP (stateless Streamable HTTP): one server + transport per request ----
  app.post("/mcp", async (req, reply) => {
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  const mcpNotAllowed = async (_req: unknown, reply: FastifyReply) =>
    reply.code(405).header("Allow", "POST").send({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  app.get("/mcp", mcpNotAllowed);
  app.delete("/mcp", mcpNotAllowed);

  app.get("/healthz", async () => ({ ok: true }));

  // ---- built web app (production) ----
  const dist = path.join(root, "dist");
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/mcp")) return reply.code(404).send({ error: "not_found" });
      if (req.url.startsWith("/embed/")) reply.header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`);
      else reply.header("Content-Security-Policy", "frame-ancestors 'self'");
      return reply.sendFile("index.html");
    });
  }

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const store = new Store(DATA_FILE);
  await store.init();
  const app = await buildServer(store);
  await app.listen({ port: PORT, host: "0.0.0.0" });
}
