/**
 * Lock the engine and data-library versions (PLAN.md §12.1 release step).
 *
 *   node scripts/lock.mjs            lock the current sources
 *
 * Refuses when the sources changed since the last lock but the version in
 * src/engine/version.ts was not bumped, so a released version number always
 * means one set of calculation sources.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, readLock, readVersions } from "./fingerprint.mjs";

const root = process.cwd();
const fp = fingerprint(root);
const v = readVersions(root);
const lock = readLock(root);
const today = new Date().toISOString().slice(0, 10);

const problems = [];
if (lock) {
  if (lock.engine.version === v.engine && lock.engine.hash !== fp.engine)
    problems.push(`engine sources changed since ${v.engine} was locked — bump ENGINE_VERSION`);
  if (lock.data.version === v.data && lock.data.hash !== fp.data)
    problems.push(`data library changed since ${v.data} was locked — bump DATA_VERSION`);
}
if (problems.length) {
  for (const p of problems) console.error(`lock: ${p}`);
  process.exit(1);
}

const history = lock?.history ?? [];
const entry = { engine: v.engine, engineHash: fp.engine, data: v.data, dataHash: fp.data, lockedOn: today };
const last = history[history.length - 1];
if (!last || last.engineHash !== fp.engine || last.dataHash !== fp.data) history.push(entry);

const out = {
  engine: { version: v.engine, hash: fp.engine },
  data: { version: v.data, hash: fp.data },
  lockedOn: lock && lock.engine.hash === fp.engine && lock.data.hash === fp.data ? lock.lockedOn : today,
  history,
};
writeFileSync(join(root, "src/engine/lock.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`locked engine ${v.engine} (${fp.engine}), data ${v.data} (${fp.data})`);
