// Same build stack as the Lovable apps (JoistCalc / StudCalc / TrussCalc).
// @lovable.dev/vite-tanstack-config already includes TanStack Start, React, Tailwind,
// tsconfig paths and nitro — do not add them again here.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { buildDefines } from "./scripts/fingerprint.mjs";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Engine / data-library fingerprints stamped on every sheet (src/engine/version.ts).
  vite: { define: buildDefines(process.cwd()) },
});
