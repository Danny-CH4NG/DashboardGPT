import "./env.ts"; // must stay first: loads .env before other modules read process.env
import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { gridSize } from "./layout.ts";
import { ManifestRegistry, ManifestUnavailable } from "./manifest.ts";
import { Invalid, NotFound, Store, type StoreEvent } from "./store.ts";
import { createMcpServer } from "./mcp.ts";
import { originChecker } from "./origins.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4100);
const DATA_FILE = process.env.DATA_FILE ?? path.join(root, "data", "db.json");
// Origins allowed to call the API (e.g. the chat service) — comma separated.
// Loopback origins are always allowed; list others (e.g. the deployed chat page), comma separated.
const isAllowedOrigin = originChecker((process.env.ALLOWED_ORIGINS ?? "").split(","));
// Pages allowed to embed /embed/* in an iframe.
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS ?? "'self' http://localhost:* http://127.0.0.1:* http://[::1]:*";
// Optional: URL of the chat widget script. Unset = dashboard runs without chat.
const CHAT_WIDGET_URL = process.env.CHAT_WIDGET_URL ?? "";
// Map basemap (raster tiles). Default: OpenStreetMap, darkened in the browser to match the theme.
// For production traffic use your own tile server or a provider: OSM's servers are for light use only.
const BASEMAP = {
  tiles: process.env.BASEMAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: process.env.BASEMAP_ATTRIBUTION || "© OpenStreetMap contributors",
  maxzoom: Number(process.env.BASEMAP_MAXZOOM ?? 19),
  darken: (process.env.BASEMAP_DARKEN ?? "true") !== "false",
};
// Component manifest published by the frontend build: a URL (frontend deployed separately) or a file.
const MANIFEST_URL = process.env.MANIFEST_URL || undefined;
const MANIFEST_FILE = process.env.MANIFEST_FILE ?? path.join(root, "dist", "component-manifest.json");
const MANIFEST_REFRESH_MS = Number(process.env.MANIFEST_REFRESH_SECONDS ?? 30) * 1000;

export async function buildServer(store: Store, manifest: ManifestRegistry) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Invalid) return reply.code(422).send({ error: "invalid", errors: err.errors });
    if (err instanceof NotFound) return reply.code(404).send({ error: "not_found", message: err.message });
    if (err instanceof ManifestUnavailable) return reply.code(503).send({ error: "manifest_unavailable", message: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "bad_request", errors: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: "internal", message: "internal error" });
  });

  // ---- config for the web app ----
  app.get("/api/config", async () => ({ chatWidgetUrl: CHAT_WIDGET_URL, basemap: BASEMAP }));

  // ---- component manifest (published by the frontend build) ----
  app.get("/api/manifest/status", async () => manifest.status());
  app.post("/api/manifest/reload", async () => {
    await manifest.load();
    return manifest.status();
  });

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
      ...(isAllowedOrigin(req.headers.origin) ? { "Access-Control-Allow-Origin": req.headers.origin!, Vary: "Origin" } : {}),
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
    const server = createMcpServer(store, manifest);
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
  const manifest = new ManifestRegistry({ url: MANIFEST_URL, file: MANIFEST_URL ? undefined : MANIFEST_FILE });
  const store = new Store(DATA_FILE, manifest);
  await store.init();
  const app = await buildServer(store, manifest);
  // The page and stored data work without a manifest; validation and MCP report 503 until it loads.
  await manifest.load().then(
    () => app.log.info(`component manifest ${manifest.version} loaded from ${manifest.sourceLabel}`),
    (e) => app.log.warn(`component manifest not loaded from ${manifest.sourceLabel}: ${e.message} (retrying every ${MANIFEST_REFRESH_MS / 1000}s)`),
  );
  manifest.on("changed", (v) => app.log.info(`component manifest changed → ${v}`));
  manifest.startAutoReload(MANIFEST_REFRESH_MS, (e) => app.log.warn(`component manifest reload failed: ${e.message}`));
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
