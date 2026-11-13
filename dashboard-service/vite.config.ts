import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { buildManifest } from "./web/src/catalog/manifest.ts";

const API = `http://localhost:${process.env.PORT ?? 4100}`;

/**
 * Publishes component-manifest.json next to the built page (build), and serves
 * a freshly generated one in dev so definition edits show up without a rebuild.
 */
function componentManifest(): Plugin {
  return {
    name: "component-manifest",
    configureServer(server) {
      server.middlewares.use("/component-manifest.json", async (_req, res) => {
        const mod = (await server.ssrLoadModule("/src/catalog/manifest.ts")) as typeof import("./web/src/catalog/manifest.ts");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify(mod.buildManifest(), null, 2));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "component-manifest.json", source: JSON.stringify(buildManifest(), null, 2) });
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), componentManifest()],
  build: { outDir: "../public", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": API, "/mcp": API },
  },
});
