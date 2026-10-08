/**
 * Engine and data-library fingerprints. The engine hash covers every
 * calculation source file under src/engine except the data library and the
 * version file; the data hash covers src/engine/data. Line endings are
 * normalised so the hash is the same on every platform.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|json)$/.test(name)) out.push(p);
  }
  return out;
}

function hashFiles(root, files) {
  const h = createHash("sha256");
  for (const f of files.sort()) {
    const rel = relative(root, f).split(sep).join("/");
    h.update(rel + "\n");
    h.update(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
    h.update("\n\0");
  }
  return h.digest("hex").slice(0, 12);
}

const EXCLUDE = ["src/engine/version.ts", "src/engine/lock.json"];

export function fingerprint(root) {
  const all = walk(join(root, "src/engine")).filter((f) => !EXCLUDE.includes(relative(root, f).split(sep).join("/")));
  const isData = (f) => relative(root, f).split(sep).join("/").startsWith("src/engine/data/");
  return {
    engine: hashFiles(
      root,
      all.filter((f) => !isData(f)),
    ),
    data: hashFiles(root, all.filter(isData)),
  };
}

export function readVersions(root) {
  const src = readFileSync(join(root, "src/engine/version.ts"), "utf8");
  const get = (name) => {
    const m = src.match(new RegExp(`export const ${name} = "([^"]+)"`));
    if (!m) throw new Error(`${name} not found in src/engine/version.ts`);
    return m[1];
  };
  return { engine: get("ENGINE_VERSION"), data: get("DATA_VERSION") };
}

export function readLock(root) {
  try {
    return JSON.parse(readFileSync(join(root, "src/engine/lock.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** Build-time constants injected into the app and the tests. */
export function buildDefines(root) {
  const fp = fingerprint(root);
  const v = readVersions(root);
  const lock = readLock(root);
  const locked =
    !!lock &&
    lock.engine.version === v.engine &&
    lock.engine.hash === fp.engine &&
    lock.data.version === v.data &&
    lock.data.hash === fp.data;
  return {
    __ENGINE_HASH__: JSON.stringify(fp.engine),
    __DATA_HASH__: JSON.stringify(fp.data),
    __VERSION_LOCKED__: JSON.stringify(locked),
    __LOCKED_ON__: JSON.stringify(locked ? lock.lockedOn : ""),
  };
}
