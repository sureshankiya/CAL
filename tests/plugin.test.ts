/** The plugin ships a bundled copy of the MCP server: it must match the current engine sources. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("housecalc plugin", () => {
  it("plugin/server.mjs is the current build of mcp/server.ts — run `bun run build:plugin`", () => {
    const out = join(mkdtempSync(join(tmpdir(), "hc-plugin-")), "server.mjs");
    execFileSync("bun", ["build", "mcp/server.ts", "--target=node", "--format=esm", "--outfile", out], {
      cwd: root,
      stdio: "ignore",
    });
    expect(readFileSync(out).equals(readFileSync(join(root, "plugin/server.mjs")))).toBe(true);
  }, 60_000);
});
