/**
 * Locked versions (PLAN.md §12.1): a released engine / data-library version
 * means exactly one set of calculation sources. Changing a calculation file
 * without bumping src/engine/version.ts and re-running `bun run lock` fails
 * here, and the build stamps "UNLOCKED" on every sheet.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { fingerprint, readLock, readVersions } from "../scripts/fingerprint.mjs";
import { DATA_VERSION, ENGINE_VERSION, VERSION_LOCKED, softwareStamp, stampDifferences } from "@/engine/version";
import { exampleProject } from "@/engine/project/example";
import { parseProject, serializeProject } from "@/engine/project/storage";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("locked versions", () => {
  it("the calculation sources match the lock for the current version", () => {
    const lock = readLock(root);
    expect(lock, "src/engine/lock.json missing — run `bun run lock`").toBeDefined();
    const v = readVersions(root);
    const fp = fingerprint(root);
    expect(v).toEqual({ engine: ENGINE_VERSION, data: DATA_VERSION });
    expect(lock!.engine.version, "ENGINE_VERSION differs from the lock — run `bun run lock`").toBe(v.engine);
    expect(lock!.data.version, "DATA_VERSION differs from the lock — run `bun run lock`").toBe(v.data);
    expect(
      fp.engine,
      `engine sources changed since ${v.engine} was locked — bump ENGINE_VERSION, run \`bun run lock\``,
    ).toBe(lock!.engine.hash);
    expect(fp.data, `data library changed since v${v.data} was locked — bump DATA_VERSION, run \`bun run lock\``).toBe(
      lock!.data.hash,
    );
    expect(VERSION_LOCKED).toBe(true);
  });

  it("each released version maps to one set of sources", () => {
    const h = readLock(root)?.history ?? [];
    const eng = new Map<string, string>();
    const dat = new Map<string, string>();
    for (const e of h) {
      if (eng.has(e.engine)) expect(eng.get(e.engine)).toBe(e.engineHash);
      if (dat.has(e.data)) expect(dat.get(e.data)).toBe(e.dataHash);
      eng.set(e.engine, e.engineHash);
      dat.set(e.data, e.dataHash);
    }
  });

  it("project files record the software and warn when opened with a different build", () => {
    const text = serializeProject(exampleProject());
    const r = parseProject(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.software).toEqual(softwareStamp());
    expect(r.warnings).toEqual([]);
    const old = { ...softwareStamp(), engine: "0.9.0", engineHash: "000000000000" };
    expect(stampDifferences(old)).toHaveLength(1);
    const r2 = parseProject(JSON.stringify({ ...JSON.parse(text), software: old }));
    expect(r2.ok && r2.warnings[0]).toMatch(/engine 0\.9\.0/);
  });
});
