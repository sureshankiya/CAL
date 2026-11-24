// Self-check: drives mcp/server.ts over stdio like Claude does. Run: bun mcp/smoke.ts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "bun", args: [join(import.meta.dirname, "server.ts")] }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const t = r.content[0].text;
  return {
    err: !!r.isError,
    text: t,
    json: (() => {
      try {
        return JSON.parse(t);
      } catch {
        return undefined;
      }
    })(),
  };
};

const tools = (await client.listTools()).tools.map((t) => t.name);
assert.equal(tools.length, 11);

await call("load_project", { example: "example" });
const d = await call("run_design");
assert.ok(d.json.members.length > 0 && d.json.packageChecks.length > 0);
const fj = d.json.members.find((m: { kind: string }) => m.kind === "joist");
const before = (await call("get_member", { member: fj.mark })).json;
assert.ok(before.result.checks.length > 0);

// edit, reject bad edit, add, delete
const span0 = before.spec.spans[0];
const up = await call("update_member", { member: fj.mark, patch: { spans: [span0 + 2] } });
assert.ok(!up.err, up.text);
assert.equal((await call("get_member", { member: fj.mark })).json.spec.spans[0], span0 + 2);
assert.ok((await call("update_member", { member: fj.mark, patch: { spans: "x" } })).err);
const add = await call("add_member", { kind: "beam" });
assert.ok(!add.err, add.text);
assert.ok(!(await call("delete_member", { member: add.json.added.mark })).err);

// markdown round trip + file save/load
const md = (await call("export_markdown")).text;
const dir = mkdtempSync(join(tmpdir(), "hc-"));
assert.ok(!(await call("fill_from_markdown", { text: md, mode: "new" })).err);
const file = join(dir, "t.housecalc.json");
assert.ok(!(await call("save_project", { path: file })).err);
const back = await call("load_project", { path: file });
assert.ok(!back.err && back.json.members > 0, back.text);
await client.close();
console.log("mcp smoke OK:", tools.join(", "));
