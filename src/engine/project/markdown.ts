/**
 * Markdown input sheet: fill the project — information, criteria, assemblies, levels,
 * lateral, hardware and every member — from a .md file, and export the project in the same
 * format (the export is also the template).
 *
 * Format (one value per line; headings choose the section):
 *
 *   ## Project
 *   - info.name: 1109 San Miguel Avenue
 *   - criteria.wind.V: 95
 *   - assemblies.0.layers.1.psf: 2.5
 *
 *   ## Member B-1 (beam)
 *   - description: Garage door header
 *   - spans: [16]
 *   - material.kind: sawn
 *
 * - Keys are dotted paths into the project (Project section) or into the member (Member
 *   sections); array items by index (`extra.0.w` or `extra[0].w`). `### ` sub-headings,
 *   blank lines, other text and table header rows are ignored. `| key | value |` table rows
 *   are read like `- key: value` lines.
 * - Values: numbers, true / false, JSON arrays / objects (`[12, 10]`), quoted strings
 *   (`"2025"`), otherwise the text as written. A value whose field is text is kept as text
 *   (job reference 1234 stays "1234").
 * - Members are matched by mark: an existing mark is updated, a new mark is added from the
 *   standard template for its kind, then the values in the sheet are applied. Fields the
 *   sheet leaves out keep the current value (existing member / project) or the template
 *   default (new member) — the report lists them. A field the sheet gives for a new member
 *   replaces the template's value for that field as a whole.
 * - Lists: a list given as a JSON value (`spans: [14, 12]`) replaces the list; indexed paths
 *   (`extra.0.w`) edit that item. In a complete export the sheet's lists replace the
 *   project's lists.
 * - mode "new": start from a new project (defaults for everything the sheet does not give)
 *   with only the sheet's members.
 * - Headings other than "## Project" / "## Member …" and lines outside them are ignored
 *   (counted in the report). A drawing-data document is recognised and reported as such —
 *   convert it with convertDrawingData() (drawingData.ts).
 * - Complete records (Export .md): a sheet with `schemaVersion` takes nothing from the
 *   new-project defaults in mode "new", and a member section with `id` takes nothing from
 *   the template — the sheet is the whole record.
 * - The result is validated against the project schema; nothing is applied while a required
 *   field is missing or a value is invalid, and the report names each one.
 */

import { looksLikeDrawingData } from "./drawingData";
import { newProject } from "./example";
import { newMemberSpec, NEW_MEMBER_LABEL, newId, type NewMemberKind } from "./templates";
import { projectSchema, type MemberSpec, type Project } from "./schema";

export const MD_EXT = ".housecalc.md";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/* --------------------------------------------------------------- export */

const SIMPLE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$|^(true|false|null)$/;

function fmtValue(v: unknown): string {
  if (typeof v === "string") {
    // quote text that would otherwise read as a number, boolean, JSON or be trimmed / lost
    if (v === "" || SIMPLE.test(v) || /^[[{"]/.test(v) || v !== v.trim() || /[\n\r|]/.test(v)) return JSON.stringify(v);
    return v;
  }
  return JSON.stringify(v);
}

function flatten(v: unknown, prefix: string, out: Array<[string, string]>) {
  if (v === undefined) return;
  if (Array.isArray(v)) {
    if (v.length === 0 || v.every((x) => x === null || typeof x !== "object")) {
      out.push([prefix, JSON.stringify(v)]);
      return;
    }
    v.forEach((x, i) => flatten(x, prefix ? `${prefix}.${i}` : String(i), out));
    return;
  }
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) {
      if (prefix) out.push([prefix, "{}"]);
      return;
    }
    for (const [k, x] of entries) flatten(x, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.push([prefix, fmtValue(v)]);
}

const PROJECT_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: "Information", keys: ["schemaVersion", "info", "cycleId"] },
  { title: "Design criteria", keys: ["criteria"] },
  { title: "Dead-load assemblies", keys: ["assemblies"] },
  { title: "Structures and levels", keys: ["structures"] },
  { title: "Member marks", keys: ["marks"] },
  { title: "Lateral", keys: ["lateral"] },
  { title: "Hardware", keys: ["hardware"] },
  { title: "Slab, notes, drawings and review table", keys: ["slab", "notes", "drawings", "review"] },
];

export function projectToMarkdown(p: Project): string {
  const lines: string[] = [
    `# HouseCalc input sheet — ${p.info.name || "project"}`,
    "",
    "<!-- One `- path: value` line per field. Edit values, add `## Member MARK (kind)` sections for new",
    '     members, then use Fill from .md in HouseCalc. Text that looks like a number is quoted ("2025"). -->',
    "",
    "## Project",
  ];
  const rec = p as unknown as Record<string, unknown>;
  const used = new Set<string>(["members", "software"]);
  const emit = (title: string, keys: string[]) => {
    const out: Array<[string, string]> = [];
    for (const k of keys) {
      used.add(k);
      flatten(rec[k], k, out);
    }
    if (!out.length) return;
    lines.push("", `### ${title}`, "");
    for (const [k, v] of out) lines.push(`- ${k}: ${v}`);
  };
  for (const g of PROJECT_GROUPS) emit(g.title, g.keys);
  const rest = Object.keys(rec).filter((k) => !used.has(k));
  if (rest.length) emit("Other", rest);
  for (const m of p.members) {
    lines.push("", `## Member ${m.mark} (${m.kind})`, "");
    const out: Array<[string, string]> = [];
    const { kind: _kind, ...fields } = m as unknown as Record<string, unknown>;
    flatten(fields, "", out);
    for (const [k, v] of out) lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  return lines.join("\n");
}

/* ---------------------------------------------------------------- parse */

interface Section {
  type: "project" | "member";
  mark?: string;
  kind?: string;
  heading: string;
  line: number;
  entries: Array<{ path: string[]; raw: string; value: Json; line: number }>;
}

export interface MarkdownReport {
  /** number of `path: value` lines applied */
  applied: number;
  updated: string[];
  added: string[];
  /** keys that are not fields of the project / member (ignored) */
  ignored: string[];
  /** sheet problems and schema errors — nothing is applied while any remain */
  errors: string[];
  /** template defaults used for new members, per mark (fields the sheet did not give) */
  defaulted: Array<{ mark: string; fields: string[] }>;
  /** headings that are not "## Project" / "## Member" sections, and lines outside sections (ignored) */
  skipped: { sections: string[]; lines: number };
  /** the text is a drawing-data document, not an input sheet — convert it first */
  drawingData?: boolean;
}

export type MarkdownOutcome =
  { ok: true; project: Project; report: MarkdownReport } | { ok: false; report: MarkdownReport };

function parseValue(raw: string): Json {
  const s = raw.trim();
  if (s === "") return "";
  if (SIMPLE.test(s) || /^[[{"]/.test(s)) {
    try {
      return JSON.parse(s) as Json;
    } catch {
      return s;
    }
  }
  return s;
}

const splitPath = (k: string) =>
  k
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

function parseSheet(text: string, errors: string[], skipped: MarkdownReport["skipped"]): Section[] {
  const sections: Section[] = [];
  let cur: Section | undefined;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let inComment = false;
  let inFence = false;
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (/^\s*```/.test(ln)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inComment) {
      if (ln.includes("-->")) inComment = false;
      return;
    }
    if (/^\s*<!--/.test(ln)) {
      if (!ln.includes("-->")) inComment = true;
      return;
    }
    const h2 = /^##\s+(.+?)\s*$/.exec(ln);
    if (h2 && !ln.startsWith("###")) {
      const title = h2[1];
      const mem = /^member\s+(.+?)\s*\(\s*([A-Za-z]+)\s*\)\s*$/i.exec(title);
      if (/^project\b/i.test(title)) cur = { type: "project", heading: title, line: n, entries: [] };
      else if (mem) cur = { type: "member", mark: mem[1].trim(), kind: mem[2], heading: title, line: n, entries: [] };
      else {
        cur = undefined;
        skipped.sections.push(title);
        return;
      }
      sections.push(cur);
      return;
    }
    let key: string | undefined;
    let raw: string | undefined;
    const bullet = /^\s*(?:[-*+]\s+)?([A-Za-z_][\w.[\]-]*)\s*:\s?(.*)$/.exec(ln);
    const row = /^\s*\|\s*([A-Za-z_][\w.[\]-]*)\s*\|\s*(.*?)\s*\|\s*$/.exec(ln);
    if (row && !/^-+$/.test(row[2]) && !/^(field|key|path)$/i.test(row[1])) [key, raw] = [row[1], row[2]];
    else if (bullet && !/^\s*#/.test(ln)) [key, raw] = [bullet[1], bullet[2]];
    if (key === undefined || raw === undefined) return;
    if (!cur) {
      skipped.lines++;
      return;
    }
    cur.entries.push({ path: splitPath(key), raw, value: parseValue(raw), line: n });
  });
  return sections;
}

/* ---------------------------------------------------------------- apply */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function setPath(root: Record<string, unknown>, path: string[], value: unknown) {
  let o: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    const nextIsIndex = /^\d+$/.test(path[i + 1]);
    const cur = (o as Record<string, unknown>)[k];
    if (cur === null || typeof cur !== "object") (o as Record<string, unknown>)[k] = nextIsIndex ? [] : {};
    o = (o as Record<string, unknown>)[k] as Record<string, unknown>;
  }
  (o as Record<string, unknown>)[path[path.length - 1]] = value;
}

function getPath(root: unknown, path: (string | number)[]): unknown {
  let o = root;
  for (const k of path) {
    if (o === null || typeof o !== "object") return undefined;
    o = (o as Record<string, unknown>)[k as string];
  }
  return o;
}

/** template kind for a member kind written in the sheet (schema kind or "Add member" kind) */
function templateKind(kind: string): NewMemberKind | undefined {
  const k = kind.trim();
  const keys = Object.keys(NEW_MEMBER_LABEL) as NewMemberKind[];
  const direct = keys.find((x) => x.toLowerCase() === k.toLowerCase());
  if (direct) return direct;
  const alias: Record<string, NewMemberKind> = { diaphragm: "roofDiaphragm", masonrywall: "cmuWall" };
  return alias[k.toLowerCase()];
}

function leafPaths(v: unknown, prefix: string[], out: string[][]) {
  if (Array.isArray(v)) {
    if (v.length === 0 || v.every((x) => x === null || typeof x !== "object")) out.push(prefix);
    else v.forEach((x, i) => leafPaths(x, [...prefix, String(i)], out));
  } else if (v !== null && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!e.length) out.push(prefix);
    for (const [k, x] of e) leafPaths(x, [...prefix, k], out);
  } else out.push(prefix);
}

/**
 * Fill `current` from a Markdown input sheet. Returns the new project (not applied) and a
 * report; ok = false when the sheet has errors or the result fails the schema.
 */
export function applyMarkdown(current: Project, text: string, opts: { mode?: "fill" | "new" } = {}): MarkdownOutcome {
  const report: MarkdownReport = {
    applied: 0,
    updated: [],
    added: [],
    ignored: [],
    errors: [],
    defaulted: [],
    skipped: { sections: [], lines: 0 },
  };
  const sections = parseSheet(text, report.errors, report.skipped);
  if (!sections.length) {
    if (looksLikeDrawingData(text)) {
      report.drawingData = true;
      report.errors.unshift(
        "This is a drawing-data document (schedules, notes and OCR text from the drawings), not a HouseCalc input sheet. Use Convert to build an input sheet from its tables, review it, then apply.",
      );
    } else
      report.errors.unshift(
        'No "## Project" or "## Member MARK (kind)" sections found — see Export .md for the format.',
      );
    return { ok: false, report };
  }

  const mode = opts.mode ?? "fill";
  const draft = clone(mode === "new" ? newProject(current.info.name) : current) as unknown as Record<
    string,
    unknown
  > & {
    members: MemberSpec[];
  };
  delete draft.software;
  const complete = sections.some((x) => x.type === "project" && x.entries.some((e) => e.path[0] === "schemaVersion"));
  if (mode === "new" && complete) for (const k of Object.keys(draft)) delete draft[k];
  if (mode === "new") draft.members = [];
  // complete export: a list the sheet gives replaces the list (cleared the first time the sheet
  // indexes into it); partial sheets edit list items by index
  const listsSeen = new Set<string>();
  const put = (root: Record<string, unknown>, path: string[], value: unknown, scope: string) => {
    for (let i = 0; i < path.length - 1 && complete; i++) {
      if (!/^\d+$/.test(path[i + 1])) continue;
      const key = `${scope}:${path.slice(0, i + 1).join(".")}`;
      if (listsSeen.has(key)) continue;
      listsSeen.add(key);
      setPath(root, path.slice(0, i + 1), []);
    }
    setPath(root, path, value);
  };
  // where each sheet line landed in the draft, for the unknown-key check after validation
  const placed: Array<{ path: (string | number)[]; label: string }> = [];
  const sheetPaths = new Map<number, Set<string>>();

  for (const sec of sections.filter((s) => s.type === "project")) {
    for (const e of sec.entries) {
      if (e.path[0] === "members") {
        report.errors.push(`Line ${e.line}: give members in "## Member MARK (kind)" sections, not as members.* paths`);
        continue;
      }
      if (e.path[0] === "software") continue;
      put(draft, e.path, e.value, "project");
      placed.push({ path: e.path, label: e.path.join(".") });
      report.applied++;
    }
  }

  // members: after the project section so new members see the sheet's structures / assemblies
  for (const sec of sections.filter((s) => s.type === "member")) {
    const mark = sec.mark!;
    let idx = draft.members.findIndex((m) => m.mark === mark);
    if (idx < 0) {
      const tk = templateKind(sec.kind!);
      if (!tk) {
        report.errors.push(
          `Line ${sec.line}: member kind "${sec.kind}" is not known — use one of: ${Object.keys(NEW_MEMBER_LABEL).join(", ")}`,
        );
        continue;
      }
      const p = draft as unknown as Project;
      const s = p.structures?.[0];
      const lv = s?.levels?.[0];
      if ((!s || !lv) && !sec.entries.some((e) => e.path[0] === "id")) {
        report.errors.push(`Line ${sec.line}: ${mark}: the project has no structure / level to place the member on`);
        continue;
      }
      const record = sec.entries.some((e) => e.path[0] === "id");
      const m = (record ? { kind: tk } : newMemberSpec(p, tk, s!.id, lv!.id)) as unknown as Record<string, unknown>;
      if (record) m.kind = sec.kind;
      m.mark = mark;
      // the sheet's fields replace the template's fields as a whole
      for (const e of sec.entries) if (!["kind", "mark"].includes(e.path[0])) delete m[e.path[0]];
      draft.members.push(m as unknown as MemberSpec);
      idx = draft.members.length - 1;
      report.added.push(mark);
      sheetPaths.set(idx, new Set());
    } else if (!report.updated.includes(mark) && !report.added.includes(mark)) {
      report.updated.push(mark);
      if (draft.members[idx].kind !== sec.kind && templateKind(sec.kind!) !== templateKind(draft.members[idx].kind)) {
        report.errors.push(
          `Line ${sec.line}: ${mark} is a ${draft.members[idx].kind} in the project, the sheet says ${sec.kind} — change the mark or the kind`,
        );
        continue;
      }
    }
    const m = draft.members[idx] as unknown as Record<string, unknown>;
    for (const e of sec.entries) {
      if (e.path[0] === "kind") continue;
      if (e.path[0] === "mark" && e.value !== mark) {
        report.errors.push(`Line ${e.line}: mark "${String(e.value)}" differs from the section heading "${mark}"`);
        continue;
      }
      put(m, e.path, e.value, `member:${idx}`);
      placed.push({ path: ["members", idx, ...e.path], label: `${mark} ${e.path.join(".")}` });
      sheetPaths.get(idx)?.add(e.path.join("."));
      report.applied++;
    }
    if (typeof m.id !== "string" || !m.id || draft.members.some((x, j) => j !== idx && x.id === m.id)) m.id = newId();
  }

  // template defaults kept for new members
  for (const [idx, given] of sheetPaths) {
    const all: string[][] = [];
    leafPaths(draft.members[idx], [], all);
    const fields = all
      .map((p) => p.join("."))
      .filter(
        (p) =>
          !["id", "kind", "mark"].includes(p) &&
          ![...given].some((g) => p === g || p.startsWith(`${g}.`) || g.startsWith(`${p}.`)),
      );
    if (fields.length) report.defaulted.push({ mark: draft.members[idx].mark, fields });
  }

  // validate; coerce text ↔ number where the sheet's value type differs from the field's
  const label = (path: (string | number)[]) => {
    if (path[0] === "members" && typeof path[1] === "number") {
      const mk = draft.members[path[1]]?.mark ?? `#${path[1]}`;
      return `${mk}: ${path.slice(2).join(".") || "(member)"}`;
    }
    return path.join(".") || "(project)";
  };
  let res = projectSchema.safeParse(draft);
  for (let pass = 0; pass < 6 && !res.success; pass++) {
    let fixed = 0;
    for (const iss of res.error.issues) {
      const v = getPath(draft, iss.path);
      let nv: unknown = undefined;
      if (iss.code === "invalid_type" && iss.expected === "string" && (typeof v === "number" || typeof v === "boolean"))
        nv = String(v);
      else if (
        iss.code === "invalid_type" &&
        iss.expected === "number" &&
        typeof v === "string" &&
        v.trim() !== "" &&
        Number.isFinite(Number(v))
      )
        nv = Number(v);
      else if (
        iss.code === "invalid_type" &&
        iss.expected === "boolean" &&
        typeof v === "string" &&
        /^(yes|no)$/i.test(v)
      )
        nv = /^yes$/i.test(v);
      else if ((iss.code === "invalid_enum_value" || iss.code === "invalid_literal") && typeof v === "number")
        nv = String(v);
      if (nv !== undefined && iss.path.length) {
        setPath(draft, iss.path.map(String), nv);
        fixed++;
      }
    }
    if (!fixed) break;
    res = projectSchema.safeParse(draft);
  }
  if (!res.success) {
    for (const iss of res.error.issues.slice(0, 25)) {
      const v = getPath(draft, iss.path);
      report.errors.push(
        v === undefined
          ? `${label(iss.path)}: required — not in the sheet (${iss.message})`
          : `${label(iss.path)}: ${iss.message}`,
      );
    }
    if (res.error.issues.length > 25) report.errors.push(`… and ${res.error.issues.length - 25} more`);
  }
  if (report.errors.length || !res.success) return { ok: false, report };

  const project = res.data;
  for (const pl of placed) {
    const got = getPath(project, pl.path);
    if (got === undefined) report.ignored.push(pl.label);
  }
  return { ok: true, project, report };
}
