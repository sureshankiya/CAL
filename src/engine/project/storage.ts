/**
 * Save / open project files (JSON) and per-browser autosave. Opening a file
 * validates it against the schema and reports the first problems found.
 * Browser storage is a convenience only: it can be unavailable, so every
 * access is guarded and the app works without it.
 */

import { softwareStamp, stampDifferences } from "../version";
import { projectSchema, type Project } from "./schema";

export const FILE_EXT = ".housecalc.json";
const AUTOSAVE_KEY = "housecalc:autosave:v1";

/** The file records the engine / data-library versions and fingerprints it was saved with. */
export function serializeProject(p: Project): string {
  return JSON.stringify({ ...p, software: softwareStamp() }, null, 2);
}

/** warnings: the file was saved with a different engine or data library — results may differ. */
export type ParseOutcome = { ok: true; project: Project; warnings: string[] } | { ok: false; errors: string[] };

export function parseProject(text: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not a JSON file: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const res = projectSchema.safeParse(raw);
  if (res.success) return { ok: true, project: res.data, warnings: stampDifferences(res.data.software) };
  return {
    ok: false,
    errors: res.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

export function fileNameFor(p: Project): string {
  const base = (p.info.jobRef || p.info.name || "project").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "project"}${FILE_EXT}`;
}

export function saveLocal(p: Project): boolean {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(p));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): Project | undefined {
  try {
    const text = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return undefined;
    const r = parseProject(text);
    return r.ok ? r.project : undefined;
  } catch {
    return undefined;
  }
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
