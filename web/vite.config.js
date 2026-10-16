import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// BindLens Web is served at bindlens.com/app/ (GitHub Pages, from docs/app)
export default defineConfig({
  base: "/app/",
  plugins: [preact()],
  build: { outDir: "../docs/app", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 4000 },
  worker: { format: "es" },
  server: { port: 8000 },
});
