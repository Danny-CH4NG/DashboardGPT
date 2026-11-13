import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the embeddable widget as one ES module: dist/widget.js
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: "widget/main.tsx", formats: ["es"], fileName: () => "widget.js" },
  },
});
