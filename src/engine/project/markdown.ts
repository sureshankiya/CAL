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
import {
  PROJECT_FIELDS,
  kindFromMark,
  kindFromText,
  looksLikeMark,
  memberField,
  memberLabelsFor,
  norm,
  pathValueWithUnits,
  projectField,
  schemaKind,
  suggest,
  type Json,
  type Resolved,
} from "./mdFriendly";
import { newProject } from "./example";
import { newMemberSpec, NEW_MEMBER_LABEL, newId, type NewMemberKind } from "./templates";
import { memberSpecSchema, projectSchema, type MemberSpec, type Project } from "./schema";

export const MD_EXT = ".housecalc.md";

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

interface Entry {
  /** key as written ("Wind speed", "criteria.wind.V", "Span") */
  key: string;
  /** dotted path, when the key is written as one */
  path?: string[];
  raw: string;
  value: Json;
  line: number;
}

interface Section {
  type: "project" | "member";
  mark?: string;
  /** kind as written in the heading / schedule */
  kind?: string;
  /** template kind resolved from the kind text, the schedule heading or the mark prefix */
  tk?: NewMemberKind;
  heading: string;
  line: number;
  entries: Entry[];
}

export interface MarkdownReport {
  /** number of `path: value` lines applied */
  applied: number;
  updated: string[];
  added: string[];
  /** keys that are not fields of the project / member (ignored), with the nearest labels */
  ignored: string[];
  /** sheet problems and schema errors — nothing is applied while any remain */
  errors: string[];
  /** template defaults used for new members, per mark (fields the sheet did not give) */
  defaulted: Array<{ mark: string; fields: string[] }>;
  /** headings that are not project / member / schedule sections, and lines outside sections (ignored) */
  skipped: { sections: string[]; lines: number };
  /** labels and values with units read into fields ("Span: 14'-6\"" → spans = [14.5]) */
  converted: string[];
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

const PATH_KEY = /^[A-Za-z_][\w]*(?:\.[\w]+|\[\d+\])*$/;
const KINDS = Object.keys(NEW_MEMBER_LABEL) as NewMemberKind[];

const stripMd = (s: string) =>
  s
    .replace(/\*\*|__/g, "")
    .replace(/`/g, "")
    .trim();

/** heading text → member mark and kind, or undefined */
function memberHeading(title: string): { mark: string; kind?: string; tk?: NewMemberKind } | undefined {
  const t = stripMd(title).replace(/^\d+(\.\d+)*\.?\s+(?=\S)/, "");
  const kindOf = (text: string | undefined, mark: string) =>
    (text ? (templateKind(text) ?? kindFromText(text, KINDS)) : undefined) ?? kindFromMark(mark);
  let m = /^member\s+(\S+?)\s*\(\s*(.+?)\s*\)$/i.exec(t) ?? /^(\S+)\s*\(\s*(.+?)\s*\)$/.exec(t);
  if (m && (/^member\s/i.test(t) || looksLikeMark(m[1]))) return { mark: m[1], kind: m[2], tk: kindOf(m[2], m[1]) };
  m = /^(?:member\s+)?(\S+)\s*(?:[—–:]|\s-)\s*(.+)$/i.exec(t);
  if (m && looksLikeMark(m[1])) return { mark: m[1], kind: m[2], tk: kindOf(m[2], m[1]) };
  m = /^(.+?)\s+(\S+)$/.exec(t);
  if (m && looksLikeMark(m[2]) && !looksLikeMark(m[1]) && kindFromText(m[1], KINDS))
    return { mark: m[2], kind: m[1], tk: kindOf(m[1], m[2]) };
  m = /^(?:member\s+)?(\S+)$/i.exec(t);
  if (m && looksLikeMark(m[1])) return { mark: m[1], tk: kindFromMark(m[1]) };
  return undefined;
}

const PROJECT_HEADING =
  /^(project|project information|project info|information|job|design criteria|criteria|design basis|loads|design loads|site|site data|code|codes|seismic|wind|snow|soil|foundation criteria|concrete)\b/i;

const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
const MARK_COL = /^(mark|marks|tag|member mark|id mark)$/i;
const KIND_COL = /^(kind|type|member type|member|element|item type)$/i;
const BLANK = /^(|-|—|–|n\/?a|none given|not stated)$/i;

function parseSheet(text: string, skipped: MarkdownReport["skipped"]): Section[] {
  const sections: Section[] = [];
  let cur: Section | undefined;
  /** kind suggested by the current heading ("Beam schedule") for schedule tables */
  let hint: NewMemberKind | undefined;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let inComment = false;
  let inFence = false;
  let table: Array<{ cells: string[]; line: number }> = [];

  const flushTable = () => {
    if (!table.length) return;
    const rows = table;
    table = [];
    const header = rows.length > 1 && isSeparator(rows[1].cells) ? rows[0].cells.map(stripMd) : undefined;
    const body = (header ? rows.slice(2) : rows).filter((r) => !isSeparator(r.cells));
    const iMark = header?.findIndex((h) => MARK_COL.test(h)) ?? -1;
    if (header && iMark >= 0) {
      // member schedule: one member per row, columns are labels
      const iKind = header.findIndex((h, i) => i !== iMark && KIND_COL.test(h));
      for (const r of body) {
        const mark = stripMd(r.cells[iMark] ?? "");
        if (!mark || BLANK.test(mark)) continue;
        const kindText = iKind >= 0 ? stripMd(r.cells[iKind] ?? "") : "";
        const byMark = kindFromMark(mark);
        // the mark refines the schedule's kind (H-1 in a beam schedule is a header, PF-1 a pad)
        const fromHint = hint && byMark && schemaKind(byMark) === schemaKind(hint) ? byMark : hint;
        const tk =
          (kindText ? (templateKind(kindText) ?? kindFromText(kindText, KINDS)) : undefined) ?? fromHint ?? byMark;
        const sec: Section = {
          type: "member",
          mark,
          kind: kindText || tk,
          tk,
          heading: `schedule row ${mark}`,
          line: r.line,
          entries: [],
        };
        header.forEach((h, i) => {
          if (i === iMark || i === iKind || !h) return;
          let raw = stripMd(r.cells[i] ?? "");
          if (BLANK.test(raw)) return;
          // unit in the column header: "Span (ft)", "Spacing [in]"
          const unit = /[([]\s*(ft|in|psf|plf|lb|kips?|psi|ksi|mph)\.?\s*[)\]]/i.exec(h)?.[1];
          if (unit && /^-?[\d.,]+$/.test(raw)) raw = `${raw} ${unit}`;
          const key = h.replace(/\s*[([].*?[)\]]\s*/g, " ").trim();
          sec.entries.push({
            key,
            path: PATH_KEY.test(key) ? splitPath(key) : undefined,
            raw,
            value: parseValue(raw),
            line: r.line,
          });
        });
        sections.push(sec);
      }
      return;
    }
    if (!cur) {
      skipped.lines += body.length;
      return;
    }
    // two-column (key | value [| unit | source]) rows
    const keyHead =
      header &&
      (/^(field|key|path|item|parameter|input|property|label)$/i.test(header[0]) || /^value/i.test(header[1] ?? ""));
    const iUnit = header?.findIndex((h) => /^units?$/i.test(h)) ?? -1;
    const data = header && !keyHead ? [rows[0], ...body] : body;
    for (const r of data) {
      if (r.cells.length < 2) continue;
      const key = stripMd(r.cells[0]);
      let raw = stripMd(r.cells[1]);
      if (!key || /^-+$/.test(raw)) continue;
      if (iUnit >= 0 && r.cells[iUnit] && /^-?[\d.,]+$/.test(raw)) raw = `${raw} ${stripMd(r.cells[iUnit])}`;
      cur.entries.push({
        key,
        path: PATH_KEY.test(key) ? splitPath(key) : undefined,
        raw,
        value: parseValue(raw),
        line: r.line,
      });
    }
  };

  lines.forEach((ln, i) => {
    const n = i + 1;
    if (/^\s*```/.test(ln)) {
      flushTable();
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
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      table.push({
        cells: ln
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim()),
        line: n,
      });
      return;
    }
    flushTable();
    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(ln);
    if (h) {
      const level = h[1].length;
      const title = stripMd(h[2]);
      if (level === 1) return;
      const bare = title.replace(/^\d+(\.\d+)*\.?\s+(?=\S)/, "");
      const mem = memberHeading(title);
      hint = /schedule|register|list|members|framing|beams|joists|rafters|headers|posts|columns|footings|walls/i.test(
        bare,
      )
        ? kindFromText(bare, KINDS)
        : undefined;
      if (mem) {
        cur = {
          type: "member",
          mark: mem.mark,
          kind: mem.kind ?? mem.tk,
          tk: mem.tk,
          heading: title,
          line: n,
          entries: [],
        };
        sections.push(cur);
      } else if (PROJECT_HEADING.test(bare)) {
        if (!(cur?.type === "project" && level > 2)) {
          cur = { type: "project", heading: title, line: n, entries: [] };
          sections.push(cur);
        }
      } else if (level === 2) {
        cur = undefined;
        if (!hint) skipped.sections.push(title);
      }
      // other ### headings: sub-headings of the current section
      return;
    }
    if (/^\s*#/.test(ln)) return;
    const kvm = /^\s*(?:[-*+]\s+|\d+\.\s+)?(?:\*\*)?([A-Za-z_][^:=|]{0,48}?)(?:\*\*)?\s*(?::|=)(?:\*\*)?\s?(.*)$/.exec(
      ln,
    );
    if (!kvm) return;
    const key = kvm[1].trim();
    const raw = kvm[2].replace(/\*\*\s*$/, "").trim();
    if (/^https?$/i.test(key)) return;
    if (!cur) {
      skipped.lines++;
      return;
    }
    cur.entries.push({
      key,
      path: PATH_KEY.test(key) ? splitPath(key) : undefined,
      raw,
      value: parseValue(raw),
      line: n,
    });
  });
  flushTable();
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

const memberFields = new Map<string, Set<string>>();
/** field names of a member kind (schema) */
function fieldsOf(kind: string): Set<string> {
  let f = memberFields.get(kind);
  if (!f) {
    const o = memberSpecSchema.optionsMap.get(kind) as { shape?: Record<string, unknown> } | undefined;
    f = new Set(Object.keys(o?.shape ?? {}));
    memberFields.set(kind, f);
  }
  return f;
}

/** a project label, or "A / B: v1 / v2" for two labels written together */
function resolveProject(key: string, raw: string): Resolved | undefined {
  const f = projectField(key);
  if (f) return f.to(raw);
  const ks = key.split(/\s*\/\s*/);
  const vs = raw.split(/\s*\/\s*/);
  if (ks.length > 1 && ks.length === vs.length && ks.every((k) => projectField(k))) {
    const set: Extract<Resolved, { ok: true }>["set"] = [];
    for (let i = 0; i < ks.length; i++) {
      const r = projectField(ks[i])!.to(vs[i]);
      if (!r.ok) return r;
      set.push(...r.set);
    }
    return { ok: true, set };
  }
  return undefined;
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
    converted: [],
  };
  if (looksLikeDrawingData(text)) {
    report.drawingData = true;
    report.errors.unshift(
      "This is a drawing-data document (schedules, notes and OCR text from the drawings), not a HouseCalc input sheet. Use Convert to build an input sheet from its tables, review it, then apply.",
    );
    return { ok: false, report };
  }
  const sections = parseSheet(text, report.skipped);
  if (!sections.length) {
    report.errors.unshift(
      'No project or member sections found — use "## Project" for project data and "## B-1 (beam)" (or a member schedule table with a Mark column) for members; see Export .md for the format.',
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
  const complete = sections.some((x) => x.type === "project" && x.entries.some((e) => e.path?.[0] === "schemaVersion"));
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
  /** append to a list, skipping an identical item (re-applying a sheet does not double loads) */
  const push = (root: Record<string, unknown>, path: string[], value: unknown) => {
    const cur = getPath(root, path);
    const list = Array.isArray(cur) ? cur : [];
    if (!list.some((x) => JSON.stringify(x) === JSON.stringify(value))) list.push(value);
    setPath(root, path, list);
  };
  const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const where = (sec: Section, e: Entry) => `Line ${e.line}${sec.type === "member" ? ` (${sec.mark})` : ""}`;
  // where each sheet line landed in the draft, for the unknown-key check after validation
  const placed: Array<{ path: (string | number)[]; label: string }> = [];
  const sheetPaths = new Map<number, Set<string>>();
  const TOP = new Set(Object.keys(projectSchema.shape));

  for (const sec of sections.filter((x) => x.type === "project")) {
    for (const e of sec.entries) {
      if (e.path?.[0] === "members") {
        report.errors.push(`Line ${e.line}: give members in "## Member MARK (kind)" sections, not as members.* paths`);
        continue;
      }
      if (e.path?.[0] === "software") continue;
      const asPath =
        e.path && (e.path.length > 1 || TOP.has(e.path[0])) && !(e.path.length === 1 && projectField(e.key));
      if (asPath) {
        const u = pathValueWithUnits("project", "", e.path!, e.raw);
        if (u && "error" in u) {
          report.errors.push(`${where(sec, e)}: ${e.key}: ${u.error}`);
          continue;
        }
        const value = u ? u.value : e.value;
        if (u) report.converted.push(`${where(sec, e)}: ${e.key}: ${e.raw} → ${show(value)}`);
        put(draft, e.path!, value, "project");
        placed.push({ path: e.path!, label: e.path!.join(".") });
        report.applied++;
        continue;
      }
      const r = resolveProject(e.key, e.raw);
      if (!r) {
        const near = suggest(
          e.key,
          PROJECT_FIELDS.flatMap((f) => f.labels),
        );
        report.ignored.push(
          `${where(sec, e)}: "${e.key}" — not a project field${near.length ? ` (did you mean ${near.map((x) => `"${x}"`).join(", ")}?)` : ""}`,
        );
        continue;
      }
      if (!r.ok) {
        report.errors.push(`${where(sec, e)}: ${e.key}: ${r.error}`);
        continue;
      }
      for (const a of r.set) {
        if (a.push) push(draft, a.path, a.value);
        else put(draft, a.path, a.value, "project");
        placed.push({ path: a.path, label: `${e.key} (${a.path.join(".")})` });
      }
      report.converted.push(
        `${where(sec, e)}: ${e.key}: ${e.raw} → ${r.set.map((a) => `${a.path.join(".")} = ${show(a.value)}`).join("; ")}${r.note ? ` (${r.note})` : ""}`,
      );
      report.applied++;
    }
  }

  const levelOf = (structureId: string | undefined) => (raw: string) => {
    const p = draft as unknown as Project;
    const all = (p.structures ?? []).flatMap((st) => st.levels.map((l) => ({ ...l, st: st.id })));
    const pool = [...all.filter((l) => l.st === structureId), ...all.filter((l) => l.st !== structureId)];
    const t = norm(raw);
    const ord: Record<string, number> = { first: 1, ground: 1, main: 1, second: 2, upper: 2, third: 3 };
    const n = Number(/(\d+)/.exec(raw)?.[1] ?? ord[t.split(" ")[0]] ?? NaN);
    return (
      pool.find((l) => l.id === raw.trim())?.id ??
      pool.find((l) => norm(l.name) === t)?.id ??
      (/roof/.test(t) ? pool.find((l) => /roof/i.test(l.name))?.id : undefined) ??
      pool.find((l) => t.length > 2 && norm(l.name).includes(t))?.id ??
      (Number.isFinite(n) ? pool.find((l) => l.number === n)?.id : undefined)
    );
  };

  // members: after the project section so new members see the sheet's structures / assemblies
  for (const sec of sections.filter((x) => x.type === "member")) {
    const mark = sec.mark!;
    let idx = draft.members.findIndex((m) => m.mark === mark);
    const record = sec.entries.some((e) => e.path?.[0] === "id");
    if (idx < 0) {
      let tk = sec.tk ?? (sec.kind ? templateKind(sec.kind) : undefined);
      if (!tk) {
        report.errors.push(
          `Line ${sec.line}: ${mark}: member kind ${sec.kind ? `"${sec.kind}" ` : ""}not known — write it after the mark, e.g. "## ${mark} (beam)", or use one of: ${KINDS.join(", ")}`,
        );
        continue;
      }
      // a footing written with three dimensions or "pad" is a pad footing
      if (
        tk === "footing" &&
        sec.entries.some(
          (e) =>
            (/^(size|dimensions|footing size)$/i.test(norm(e.key)) &&
              (e.raw.match(/\d+(?:\.\d+)?/g) ?? []).length >= 3) ||
            (/^(type|footing type)$/i.test(norm(e.key)) && /pad|spread|isolated/i.test(e.raw)),
        )
      )
        tk = "pad";
      const p = draft as unknown as Project;
      const st = p.structures?.[0];
      const lv = st?.levels?.[0];
      if ((!st || !lv) && !record) {
        report.errors.push(`Line ${sec.line}: ${mark}: the project has no structure / level to place the member on`);
        continue;
      }
      const m = (record ? { kind: tk } : newMemberSpec(p, tk, st!.id, lv!.id)) as unknown as Record<string, unknown>;
      if (record) m.kind = sec.kind;
      m.mark = mark;
      // a field given as a dotted path replaces the template's value for that field as a whole
      for (const e of sec.entries)
        if (e.path && !["kind", "mark"].includes(e.path[0]) && (record || e.path.length > 1)) delete m[e.path[0]];
      draft.members.push(m as unknown as MemberSpec);
      idx = draft.members.length - 1;
      report.added.push(mark);
      sheetPaths.set(idx, new Set());
    } else if (!report.updated.includes(mark) && !report.added.includes(mark)) {
      report.updated.push(mark);
      const sk = sec.tk ?? (sec.kind ? templateKind(sec.kind) : undefined);
      if (sec.kind && sk && schemaKind(sk) !== draft.members[idx].kind && draft.members[idx].kind !== sec.kind) {
        report.errors.push(
          `Line ${sec.line}: ${mark} is a ${draft.members[idx].kind} in the project, the sheet says ${sec.kind} — change the mark or the kind`,
        );
        continue;
      }
    }
    const m = draft.members[idx] as unknown as Record<string, unknown>;
    const kind = String(m.kind);
    const supports = () => (Array.isArray(m.spans) ? m.spans.length : 1) + 1;
    const ctx = {
      kind,
      get supports() {
        return supports();
      },
      level: levelOf(m.structureId as string | undefined),
    };
    // bearing lengths after the spans they follow
    const entries = [...sec.entries].sort((x, y) => Number(/bearing/i.test(x.key)) - Number(/bearing/i.test(y.key)));
    let gaveBearing = false;
    for (const e of entries) {
      if (e.path?.[0] === "kind" && e.path.length === 1) continue;
      if (e.path?.[0] === "mark" && e.path.length === 1) {
        if (e.value !== mark)
          report.errors.push(`Line ${e.line}: mark "${String(e.value)}" differs from the section heading "${mark}"`);
        continue;
      }
      if (/bearing/i.test(e.key)) gaveBearing = true;
      const jsonish = /^\s*[[{"]/.test(e.raw) || SIMPLE.test(e.raw.trim());
      const exact = !!e.path && e.path.length === 1 && fieldsOf(kind).has(e.path[0]);
      let field = memberField(e.key, kind);
      // a key that is the member's own field name keeps that field (diaphragm "level", …)
      if (field && exact) {
        const t = field.to(e.raw, ctx);
        if (t.ok && !t.set.some((a) => a.path[0] === e.path![0])) field = undefined;
      }
      const known = e.path && (e.path.length > 1 || exact || e.path[0] in m || record);
      if (e.path && (known || !field) && (jsonish || e.path.length > 1 || !field)) {
        const u = pathValueWithUnits("member", kind, e.path, e.raw);
        if (u && "error" in u) {
          report.errors.push(`${where(sec, e)}: ${e.key}: ${u.error}`);
          continue;
        }
        if (!known && !field) {
          const near = suggest(e.key, [...memberLabelsFor(kind), ...Object.keys(m)]);
          report.ignored.push(
            `${where(sec, e)}: "${e.key}" — not a field of a ${kind}${near.length ? ` (did you mean ${near.map((x) => `"${x}"`).join(", ")}?)` : ""}`,
          );
          continue;
        }
        const value = u ? u.value : e.value;
        if (u) report.converted.push(`${where(sec, e)}: ${e.key}: ${e.raw} → ${show(value)}`);
        put(m, e.path, value, `member:${idx}`);
        placed.push({ path: ["members", idx, ...e.path], label: `${mark} ${e.path.join(".")}` });
        sheetPaths.get(idx)?.add(e.path.join("."));
        report.applied++;
        continue;
      }
      if (!field) {
        const near = suggest(e.key, memberLabelsFor(kind));
        report.ignored.push(
          `${where(sec, e)}: "${e.key}" — not a field of a ${kind}${near.length ? ` (did you mean ${near.map((x) => `"${x}"`).join(", ")}?)` : ""}`,
        );
        continue;
      }
      const r = field.to(e.raw, ctx);
      if (!r.ok) {
        report.errors.push(`${where(sec, e)}: ${e.key}: ${r.error}`);
        continue;
      }
      for (const a of r.set) {
        if (a.push) push(m, a.path, a.value);
        else put(m, a.path, a.value, `member:${idx}`);
        placed.push({ path: ["members", idx, ...a.path], label: `${mark} ${e.key}` });
        sheetPaths.get(idx)?.add(a.path.join("."));
      }
      report.converted.push(
        `${where(sec, e)}: ${e.key}: ${e.raw} → ${r.set.map((a) => `${a.path.join(".")}${a.push ? " +=" : " ="} ${show(a.value)}`).join("; ")}${r.note ? ` (${r.note})` : ""}`,
      );
      report.applied++;
    }
    // one bearing length per support when the sheet changed the number of spans
    if (
      !gaveBearing &&
      Array.isArray(m.bearing) &&
      Array.isArray(m.spans) &&
      m.bearing.length !== m.spans.length + 1 &&
      m.bearing.every((x) => typeof x === "number")
    ) {
      const b = m.bearing as number[];
      m.bearing = Array.from({ length: (m.spans as unknown[]).length + 1 }, (_, i) => b[Math.min(i, b.length - 1)]);
      report.converted.push(
        `${mark}: bearing set for ${(m.spans as unknown[]).length + 1} supports (${show(m.bearing)} in.)`,
      );
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
