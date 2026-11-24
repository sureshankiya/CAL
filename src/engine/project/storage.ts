/**
 * Save / open project files (JSON) and per-browser autosave. Opening a file
 * validates it against the schema and reports the first problems found.
 * Browser storage is a convenience only: it can be unavailable, so every
 * access is guarded and the app works without it.
 */

import { softwareStamp, stampDifferences } from "../version";
import { z } from "zod";
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

/* ---------------------------------------------------------------- office defaults and jurisdiction presets */

const OFFICE_KEY = "housecalc:office:v1";

/** what a new project starts from: the engineer's names, code cycle, criteria, S0 note edits, details selection, plan sheets, hardware list */
const officeDefaultsSchema = projectSchema
  .pick({
    cycleId: true,
    criteria: true,
    s0Notes: true,
    detailSheets: true,
    drawingIndex: true,
    hardware: true,
  })
  .extend({ info: projectSchema.shape.info.pick({ preparedBy: true, checkedBy: true, approvedBy: true }) });
/** design criteria of one jurisdiction, saved from a project and applied to later ones */
const presetSchema = projectSchema.pick({ cycleId: true, criteria: true });
const officeSchema = z.object({
  defaults: officeDefaultsSchema.optional(),
  presets: z.record(presetSchema).default({}),
});
export type Office = z.infer<typeof officeSchema>;

/** per-browser office settings; empty when storage is unavailable or the stored data does not validate */
export function loadOffice(): Office {
  try {
    const r = officeSchema.safeParse(JSON.parse(window.localStorage.getItem(OFFICE_KEY) ?? "{}"));
    if (r.success) return r.data;
  } catch {
    /* storage unavailable */
  }
  return { presets: {} };
}

export function saveOffice(o: Office): boolean {
  try {
    window.localStorage.setItem(OFFICE_KEY, JSON.stringify(o));
    return true;
  } catch {
    return false;
  }
}

/** the office defaults of a project (what "Save as office defaults" stores) */
export const officeDefaultsOf = (p: Project): NonNullable<Office["defaults"]> => ({
  cycleId: p.cycleId,
  criteria: p.criteria,
  s0Notes: p.s0Notes,
  detailSheets: p.detailSheets,
  drawingIndex: p.drawingIndex,
  hardware: p.hardware,
  info: { preparedBy: p.info.preparedBy, checkedBy: p.info.checkedBy, approvedBy: p.info.approvedBy },
});

/** a project with the office defaults applied; hardware already in the project is kept, missing items are added */
export function applyOfficeDefaults(p: Project, o: Office): Project {
  const d = o.defaults;
  if (!d) return p;
  const have = new Set(p.hardware.map((h) => h.id));
  return {
    ...p,
    cycleId: d.cycleId,
    criteria: d.criteria,
    s0Notes: d.s0Notes,
    detailSheets: d.detailSheets,
    drawingIndex: d.drawingIndex,
    hardware: [
      ...p.hardware.map((h) => d.hardware.find((x) => x.id === h.id) ?? h),
      ...d.hardware.filter((h) => !have.has(h.id)),
    ],
    info: { ...p.info, ...d.info },
  };
}

/** a project with a jurisdiction's saved criteria and code cycle */
export const applyPreset = (p: Project, name: string, o: Office): Project =>
  o.presets[name] ? { ...p, ...o.presets[name], info: { ...p.info, jurisdiction: p.info.jurisdiction || name } } : p;
