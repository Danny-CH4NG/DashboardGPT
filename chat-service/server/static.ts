/**
 * Serves the built web app from a folder. A small replacement for @fastify/static,
 * whose dependencies cannot be loaded by Vercel's function runtime.
 * Unknown GET paths go to `fallback` (e.g. the SPA's index.html) or 404.
 */
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

type Options = {
  /** Extra headers for one file response. */
  headers?: (urlPath: string, req: FastifyRequest) => Record<string, string>;
  /** File (relative to root) to answer with when nothing matches, or null for 404. */
  fallback?: (urlPath: string, req: FastifyRequest) => string | null;
};

async function fileAt(root: string, rel: string) {
  const full = path.resolve(root, "." + path.posix.normalize("/" + rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  try {
    const s = await fs.promises.stat(full);
    return s.isFile() ? { full, size: s.size } : null;
  } catch {
    return null;
  }
}

export function serveStatic(app: FastifyInstance, root: string, opts: Options = {}) {
  const base = path.resolve(root);
  const send = (reply: FastifyReply, req: FastifyRequest, urlPath: string, f: { full: string; size: number }) => {
    const ext = path.extname(f.full).toLowerCase();
    reply
      .header("Content-Type", TYPES[ext] ?? "application/octet-stream")
      .header("Content-Length", f.size)
      // Vite puts content-hashed files under /assets/; everything else must be revalidated.
      .header("Cache-Control", urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
    for (const [k, v] of Object.entries(opts.headers?.(urlPath, req) ?? {})) reply.header(k, v);
    return req.method === "HEAD" ? reply.send() : reply.send(fs.createReadStream(f.full));
  };

  app.setNotFoundHandler(async (req, reply) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      return reply.code(400).send({ error: "bad_request" });
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const direct = urlPath.endsWith("/") ? null : await fileAt(base, urlPath);
      if (direct) return send(reply, req, urlPath, direct);
      const fb = opts.fallback?.(urlPath, req);
      const file = fb ? await fileAt(base, fb) : null;
      if (file) return send(reply, req, urlPath, file);
    }
    return reply.code(404).send({ error: "not_found" });
  });
}
