// Static single-page build (no server functions) — `bun run build:static`, output in dist-static/.
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { buildDefines } from "./scripts/fingerprint.mjs";

export default defineConfig({
  root: fileURLToPath(new URL("./static", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/lib/aiExtract", replacement: fileURLToPath(new URL("./static/aiExtractStub.ts", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  define: buildDefines(process.cwd()),
  build: {
    outDir: fileURLToPath(new URL("./dist-static", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
