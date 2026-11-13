import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = `http://localhost:${process.env.PORT ?? 4100}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": API, "/mcp": API },
  },
});
