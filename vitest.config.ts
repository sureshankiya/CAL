import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { buildDefines } from "./scripts/fingerprint.mjs";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: buildDefines(fileURLToPath(new URL(".", import.meta.url))),
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
