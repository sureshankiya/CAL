/**
 * Plain-language input for the Markdown input sheet: engineering labels ("Wind speed",
 * "Span", "Spacing", "Size") and values with units ("110 mph", "14'-6\"", "16 in. o.c.",
 * "(3) 1-3/4 x 11-7/8 LVL 2.0E", "L/360") resolved to project / member fields in HouseCalc's
 * units (lengths in ft, section dimensions / spacing / bearing in in., loads in psf, plf, lb).
 *
 * Used by markdown.ts: a line whose key is a label here is converted; any other key is read as
 * a dotted path, and a value with units on a known length field is converted the same way.
 * Nothing is guessed silently — each conversion is reported, and a label that is not a field
 * is reported with the nearest known labels.
 */

import type { NewMemberKind } from "./templates";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** One resolved field: path from the project root (project scope) or the member (member scope). */
export interface Assign {
  path: string[];
  value: Json;
  /** append to the list at `path` instead of setting it */
  push?: boolean;
}
export type Resolved = { ok: true; set: Assign[]; note?: string } | { ok: false; error: string };

/* --------------------------------------------------------------- labels */

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\*\*|__|`/g, "")
    .replace(/[’']/g, "'")
    .replace(/\(.*?\)/g, " ")
    .replace(/[_\-–—/.,:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ---------------------------------------------------------------- units */

type Unit = "ft" | "in" | "psf" | "plf" | "lb" | "psi" | "mph" | "pcf" | "none";

const FRAC = String.raw`(\d+)\s*\/\s*(\d+)`;

/** "1,500 psf" → {v: 1500, u: "psf"}; "14'-6 1/2\"" → {v: 14.5417, u: "ft"}; "11-7/8 in" → {v: 11.875, u: "in"} */
export function quantity(raw: string): { v: number; u?: string } | undefined {
  let s = raw
    .trim()
    .replace(/[′’]/g, "'")
    .replace(/[″”]/g, '"')
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/\s*(o\.?\s*c\.?|on cent(er|re)s?)\s*$/i, "")
    .replace(/\s*(max(imum)?|min(imum)?|typ(ical)?\.?)$/i, "")
    .trim();
  s = s.replace(/^[~≈]\s*/, "");
  // feet and inches: 14'-6", 14' 6 1/2", 14 ft 6 in, 14'
  const fi = new RegExp(
    String.raw`^(-?\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*-?\s*(?:(\d+(?:\.\d+)?)(?:(?:\s+|-)${FRAC})?\s*(?:"|in\.?|inch(?:es)?)?)?$`,
    "i",
  ).exec(s);
  if (fi) {
    const inches = fi[2] ? Number(fi[2]) + (fi[3] ? Number(fi[3]) / Number(fi[4]) : 0) : 0;
    return { v: Number(fi[1]) + inches / 12, u: "ft" };
  }
  // inches with a fraction: 11-7/8", 1 3/4 in, 7/16 in
  const fr = new RegExp(String.raw`^(?:(\d+)(?:\s+|-))?${FRAC}\s*("|in\.?|inch(?:es)?)?$`, "i").exec(s);
  if (fr) return { v: (fr[1] ? Number(fr[1]) : 0) + Number(fr[2]) / Number(fr[3]), u: fr[4] ? "in" : undefined };
  const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([a-z"'/²³]+(?:\s*\/\s*[a-z²³]+)?)?\.?$/i.exec(s);
  if (!m) return undefined;
  const u = m[2]?.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  return { v: Number(m[1]), u: u || undefined };
}

const UNIT: Record<string, { to: Unit; f: number }> = {
  ft: { to: "ft", f: 1 },
  feet: { to: "ft", f: 1 },
  foot: { to: "ft", f: 1 },
  "'": { to: "ft", f: 1 },
  in: { to: "in", f: 1 },
  inch: { to: "in", f: 1 },
  inches: { to: "in", f: 1 },
  '"': { to: "in", f: 1 },
  psf: { to: "psf", f: 1 },
  "lb/ft²": { to: "psf", f: 1 },
  "lb/ft2": { to: "psf", f: 1 },
  ksf: { to: "psf", f: 1000 },
  plf: { to: "plf", f: 1 },
  "lb/ft": { to: "plf", f: 1 },
  klf: { to: "plf", f: 1000 },
  "k/ft": { to: "plf", f: 1000 },
  lb: { to: "lb", f: 1 },
  lbs: { to: "lb", f: 1 },
  "#": { to: "lb", f: 1 },
  kip: { to: "lb", f: 1000 },
  kips: { to: "lb", f: 1000 },
  k: { to: "lb", f: 1000 },
  psi: { to: "psi", f: 1 },
  "lb/in²": { to: "psi", f: 1 },
  "lb/in2": { to: "psi", f: 1 },
  ksi: { to: "psi", f: 1000 },
  mph: { to: "mph", f: 1 },
  pcf: { to: "pcf", f: 1 },
  "lb/ft³": { to: "pcf", f: 1 },
  g: { to: "none", f: 1 },
};

/** Value of `raw` in `want` (ft ↔ in converted; ksf, ksi, kip, klf scaled); undefined if not a quantity. */
export function inUnit(raw: string, want: Unit): { v: number; from?: string } | { error: string } | undefined {
  const q = quantity(raw);
  if (!q) return undefined;
  if (!q.u) return { v: q.v };
  const u = UNIT[q.u];
  if (!u) return { error: `unit "${q.u}" not recognised (expected ${want})` };
  if (u.to === want || u.to === "none" || want === "none") return { v: q.v * u.f, from: q.u };
  if (u.to === "in" && want === "ft") return { v: q.v / 12, from: q.u };
  if (u.to === "ft" && want === "in") return { v: q.v * 12, from: q.u };
  return { error: `${raw.trim()} is in ${u.to}, the field is in ${want}` };
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function num(raw: string, want: Unit): Resolved | number {
  const r = inUnit(raw, want);
  if (!r) return { ok: false, error: `"${raw.trim()}" is not a number${want !== "none" ? ` (${want})` : ""}` };
  if ("error" in r) return { ok: false, error: r.error };
  return round(r.v);
}

/** "14 ft, 12'-6\"" or "[14, 12.5]" → [14, 12.5] in `want` */
function list(raw: string, want: Unit): Resolved | number[] {
  const t = raw.trim();
  if (/^\[.*\]$/.test(t)) {
    try {
      const a = JSON.parse(t) as unknown;
      if (Array.isArray(a) && a.every((x) => typeof x === "number")) return a as number[];
    } catch {
      /* fall through to text */
    }
  }
  const parts = t
    .replace(/^\[|\]$/g, "")
    .split(/\s*(?:,|;|\+|\band\b)\s*/i)
    .filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = num(p, want);
    if (typeof n !== "number") return n;
    out.push(n);
  }
  return out.length ? out : { ok: false, error: `no values in "${raw}"` };
}

const yes = (raw: string): boolean | undefined =>
  /^(yes|y|true|on|1|included?|reduce[ds]?)$/i.test(raw.trim())
    ? true
    : /^(no|n|false|off|0|none|not? included?|excluded?)$/i.test(raw.trim())
      ? false
      : undefined;

const bool = (raw: string): Resolved | boolean => {
  const b = yes(raw);
  return b === undefined ? { ok: false, error: `"${raw}" — expected yes / no` } : b;
};

/* ------------------------------------------------------------ materials */

export function speciesOf(s: string): string | undefined {
  if (/\bSPF\b|spruce/i.test(s)) return "SPF";
  if (/\bHF\b|hem[\s-]*fir/i.test(s)) return "HF";
  if (/\bSYP\b|\bSP\b|southern pine/i.test(s)) return "SP";
  if (/\bDF(-?L)?\b|douglas/i.test(s)) return "DF-L";
  return undefined;
}

export function gradeOf(s: string): string | undefined {
  if (/sel(ect)?\.?\s*str/i.test(s) || /\bSS\b/.test(s)) return "Sel Str";
  if (/(no\.?|#)\s*1\s*(&|and)\s*b(e?t)?(te)?r/i.test(s)) return "No.1 & Btr";
  if (/(no\.?|#)\s*1\b/i.test(s)) return "No.1";
  if (/(no\.?|#)\s*2\b/i.test(s)) return "No.2";
  if (/(no\.?|#)\s*3\b/i.test(s)) return "No.3";
  if (/\bstud\b/i.test(s) && !/\d+x\d+\s*stud/i.test(s)) return "Stud";
  return undefined;
}

const dimIn = (s: string) => {
  const m = /^(\d+(?:\.\d+)?)(?:[- ](\d+)\/(\d+))?$/.exec(s.trim());
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0) : NaN;
};

/** A wood member description → woodMaterial record (sawn, SCL or glulam). */
export function woodMaterial(raw: string): { [k: string]: Json } | undefined {
  const s = raw.replace(/[″"]/g, " in ").replace(/×/g, "x");
  const plies = Number(/\((\d)\)/.exec(s)?.[1] ?? /\b(\d)\s*-?\s*(?:ply|plies)\b/i.exec(s)?.[1] ?? 1);
  const D = String.raw`(\d+(?:\.\d+)?(?:[- ]\d+\/\d+)?)`;
  const scl = new RegExp(
    String.raw`${D}\s*(?:in\.?)?\s*x\s*${D}\s*(?:in\.?)?\s*(?:[\d.]+E\s*)?(LVL|LSL|PSL)`,
    "i",
  ).exec(s);
  const sclE = /(LVL|LSL|PSL)\s*(?:[\d.]+E)?/i.exec(s);
  if (scl || (sclE && new RegExp(`${D}\\s*(?:in\\.?)?\\s*x\\s*${D}`).test(s))) {
    const dims = scl ?? new RegExp(`${D}\\s*(?:in\\.?)?\\s*x\\s*${D}`).exec(s)!;
    const prod = (scl?.[3] ?? sclE![1]).toUpperCase();
    const E = /(\d\.\d+)\s*E\b/i.exec(s)?.[1];
    const product = prod === "LVL" ? "LVL 2.0E" : prod === "PSL" ? `PSL ${E === "1.8" ? "1.8E" : "2.2E"}` : "LSL 1.55E";
    return { kind: "scl", product, plies, plyWidth: dimIn(dims[1]), d: dimIn(dims[2]) };
  }
  if (/glu-?lam|\bGLB\b|24F|20F|\bV4\b|\bV8\b/i.test(s)) {
    const d = new RegExp(`${D}\\s*(?:in\\.?)?\\s*x\\s*${D}`).exec(s);
    if (!d) return undefined;
    const combo = /(2[04]F-[VE]\d+)/i.exec(s)?.[1]?.toUpperCase() ?? "24F-V4";
    return { kind: "glulam", combo, b: dimIn(d[1]), d: dimIn(d[2]) };
  }
  const saw = /\b(\d{1,2})\s*x\s*(\d{1,2})\b/i.exec(s);
  if (!saw) return undefined;
  return {
    kind: "sawn",
    species: speciesOf(s) ?? "DF-L",
    grade: gradeOf(s) ?? (Number(saw[1]) >= 5 ? "No.1" : "No.2"),
    size: `${saw[1]}x${saw[2]}`,
    plies,
  };
}

/** "L/360" → 360; "360" → 360 */
const ratio = (raw: string) => {
  const m = /^\s*(?:L\s*\/\s*)?(\d+(?:\.\d+)?)\s*$/i.exec(raw);
  return m ? Number(m[1]) : undefined;
};

/** "L/360 live, L/240 total" → {live, total} */
function deflection(raw: string): Resolved | { live?: number; total?: number } {
  const live = /L\s*\/\s*(\d+)\s*(?:\(?\s*live|LL)/i.exec(raw)?.[1];
  const total = /L\s*\/\s*(\d+)\s*(?:\(?\s*total|TL)/i.exec(raw)?.[1];
  if (live || total) return { live: live ? Number(live) : undefined, total: total ? Number(total) : undefined };
  const all = [...raw.matchAll(/L\s*\/\s*(\d+)/gi)].map((m) => Number(m[1]));
  if (all.length === 2) return { live: all[0], total: all[1] };
  if (all.length === 1) return { live: all[0] };
  return { ok: false, error: `"${raw}" — expected L/360 or "L/360 live, L/240 total"` };
}

const LOAD_TYPE: Record<string, string> = {
  d: "D",
  dead: "D",
  l: "L",
  live: "L",
  lr: "Lr",
  "roof live": "Lr",
  s: "S",
  snow: "S",
  w: "W",
  wind: "W",
  e: "E",
  seismic: "E",
};

/** "1,200 lb D at 6 ft" / "P = 1.2 kip (L) @ 6'-0\"" → point load; "150 plf D from 2 ft to 8 ft" → line load */
function extraLoad(raw: string, line: boolean): Resolved | { [k: string]: Json } {
  const s = raw.replace(/^\s*[PpWw]\s*=\s*/, "");
  const mag = /^\s*(-?[\d,]+(?:\.\d+)?)\s*(kips?|k|lbs?|#|plf|klf|lb\/ft)?/i.exec(s);
  if (!mag) return { ok: false, error: `"${raw}" — expected e.g. "1,200 lb D at 6 ft"` };
  const unit = (mag[2] ?? (line ? "plf" : "lb")).toLowerCase();
  const v = Number(mag[1].replace(/,/g, "")) * (UNIT[unit]?.f ?? 1);
  const t = /\b(?:\(\s*)?(dead|live|roof live|snow|wind|seismic|Lr|D|L|S|W|E)(?:\s*\))?(?=\s|$|,|\))/i.exec(
    s.slice(mag[0].length),
  )?.[1];
  const type = t ? (LOAD_TYPE[t.toLowerCase()] ?? t) : "D";
  const at = /(?:at|@)\s*([^,;]+?)(?:\s+from|\s*$|[,;])/i.exec(s)?.[1];
  const from = /from\s+(.+?)\s+to\s+(.+?)\s*$/i.exec(s);
  const label = raw.trim();
  if (line) {
    const rec: { [k: string]: Json } = { kind: "line", type, label, w: round(v) };
    if (from) {
      const a = num(from[1], "ft");
      const b = num(from[2], "ft");
      if (typeof a !== "number") return a;
      if (typeof b !== "number") return b;
      rec.x1 = a;
      rec.x2 = b;
    }
    return rec;
  }
  if (!at) return { ok: false, error: `"${raw}" — give the position, e.g. "… at 6 ft"` };
  const x = num(at, "ft");
  if (typeof x !== "number") return x;
  return { kind: "point", type, label, P: round(v), x, ...(t ? {} : { _assumedType: true }) };
}

/* ------------------------------------------------------- project labels */

interface Field {
  labels: string[];
  /** resolve the raw text to assignments */
  to: (raw: string) => Resolved;
  /** shown in the label reference */
  doc: string;
}

const one = (path: string, value: Json, note?: string): Resolved => ({
  ok: true,
  set: [{ path: path.split("."), value }],
  note,
});
const numField = (path: string, unit: Unit, labels: string[], doc?: string): Field => ({
  labels,
  doc: doc ?? `${path} (${unit === "none" ? "number" : unit})`,
  to: (raw) => {
    const n = num(raw, unit);
    return typeof n === "number" ? one(path, n) : n;
  },
});
const textField = (path: string, labels: string[]): Field => ({
  labels,
  doc: `${path} (text)`,
  to: (raw) => one(path, unquote(raw)),
});
const boolField = (path: string, labels: string[]): Field => ({
  labels,
  doc: `${path} (yes / no)`,
  to: (raw) => {
    const b = bool(raw);
    return typeof b === "boolean" ? one(path, b) : b;
  },
});

const unquote = (raw: string) => {
  const t = raw.trim();
  if (/^".*"$/.test(t)) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
};

function isoDate(raw: string): string {
  const t = unquote(raw).replace(/\.$/, "");
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : t;
}

export const PROJECT_FIELDS: Field[] = [
  textField("info.name", ["project", "project name", "name", "job name", "building"]),
  textField("info.address", ["address", "site address", "project address", "location", "site"]),
  textField("info.jobRef", [
    "job ref",
    "job reference",
    "job no",
    "job number",
    "job #",
    "project number",
    "project no",
  ]),
  textField("info.client", ["client", "owner"]),
  textField("info.jurisdiction", ["jurisdiction", "city", "building department", "agency", "county"]),
  textField("info.preparedBy", ["prepared by", "engineer", "calc by", "calculated by", "designer", "designed by"]),
  textField("info.checkedBy", ["checked by", "chk'd by", "chkd by"]),
  textField("info.approvedBy", ["approved by", "app'd by", "appd by"]),
  {
    labels: ["date", "issue date"],
    doc: "info.date (2026-02-02 or 2/2/2026)",
    to: (raw) => one("info.date", isoDate(raw)),
  },
  textField("info.revision", ["revision", "rev", "rev no"]),
  {
    labels: ["issue status", "issue", "status"],
    doc: "info.issue (final / check copy)",
    to: (raw) =>
      /check|draft|working/i.test(raw)
        ? one("info.issue", "check")
        : /final|issued?|permit/i.test(raw)
          ? one("info.issue", "final")
          : { ok: false, error: `"${raw}" — expected final or check copy` },
  },
  {
    labels: ["code", "code cycle", "building code", "codes", "governing code"],
    doc: "cycleId (2025 CBC / 2024 IBC → 2025; 2022 CBC / 2021 IBC → 2022)",
    to: (raw) =>
      /2025|2024/.test(raw)
        ? one("cycleId", "2025")
        : /2022|2021/.test(raw)
          ? one("cycleId", "2022")
          : { ok: false, error: `"${raw}" — HouseCalc has the 2025 CBC (2024 IBC) and 2022 CBC (2021 IBC) cycles` },
  },
  {
    labels: ["risk category", "occupancy category", "risk cat"],
    doc: "criteria.riskCategory (I–IV)",
    to: (raw) => {
      const r = /\b(IV|III|II|I)\b/.exec(raw.toUpperCase())?.[1] ?? ["", "I", "II", "III", "IV"][Number(raw.trim())];
      return r ? one("criteria.riskCategory", r) : { ok: false, error: `"${raw}" — expected I, II, III or IV` };
    },
  },
  {
    labels: ["live load basis", "live basis"],
    doc: "criteria.liveBasis (IRC / IBC)",
    to: (raw) =>
      /irc|crc|residential/i.test(raw)
        ? one("criteria.liveBasis", "IRC")
        : /ibc|cbc|building/i.test(raw)
          ? one("criteria.liveBasis", "IBC")
          : { ok: false, error: `"${raw}" — expected IRC or IBC` },
  },
  numField("criteria.roofLive.L0", "psf", ["roof live load", "roof live", "lr", "l0", "roof ll"]),
  boolField("criteria.roofLive.reduce", ["roof live reduction", "reduce roof live", "roof live load reduction"]),
  numField("criteria.snow.pg", "psf", ["ground snow load", "ground snow", "pg", "snow load"]),
  numField("criteria.snow.Ce", "none", ["ce", "snow exposure factor", "exposure factor"]),
  numField("criteria.snow.Ct", "none", ["ct", "thermal factor"]),
  numField("criteria.snow.Is", "none", ["is", "snow importance factor"]),
  numField("criteria.Kcr", "none", ["kcr", "creep factor", "long term deflection factor"]),
  numField("criteria.seismic.SDS", "none", ["sds", "s ds", "sds g"]),
  numField("criteria.seismic.SD1", "none", ["sd1", "s d1"]),
  textField("criteria.seismic.siteClass", ["site class", "soil site class"]),
  {
    labels: ["seismic design category", "sdc", "seismic category"],
    doc: "criteria.seismic.SDC (A–F)",
    to: (raw) => {
      const c = /\b([A-F])\b/.exec(raw.toUpperCase())?.[1];
      return c ? one("criteria.seismic.SDC", c) : { ok: false, error: `"${raw}" — expected A–F` };
    },
  },
  numField("criteria.wind.V", "mph", [
    "wind speed",
    "basic wind speed",
    "ultimate wind speed",
    "v",
    "vult",
    "design wind speed",
  ]),
  {
    labels: ["exposure", "wind exposure", "exposure category"],
    doc: "criteria.wind.exposure (B / C / D)",
    to: (raw) => {
      const e = /\b([BCD])\b/.exec(raw.toUpperCase())?.[1];
      return e ? one("criteria.wind.exposure", e) : { ok: false, error: `"${raw}" — expected B, C or D` };
    },
  },
  numField("criteria.wind.Kzt", "none", ["kzt", "topographic factor"]),
  numField("criteria.soil.bearing", "psf", [
    "soil bearing",
    "allowable soil bearing",
    "allowable bearing",
    "allowable bearing pressure",
    "allowable soil pressure",
    "soil bearing pressure",
    "qa",
  ]),
  textField("criteria.soil.source", ["soil source", "soil report", "geotechnical report", "soils report", "geotech"]),
  numField("criteria.soil.density", "pcf", ["soil density", "soil unit weight"]),
  numField("criteria.soil.frostDepth", "in", ["frost depth"]),
  numField("criteria.concrete.fc", "psi", ["f'c", "fc", "concrete strength", "concrete", "concrete f'c"]),
  {
    labels: ["fy", "rebar", "reinforcement", "rebar grade", "reinforcing steel", "reinforcement grade"],
    doc: "criteria.concrete.fy (Grade 60, 60 ksi or 60000 psi)",
    to: (raw) => {
      const g = /grade\s*(\d{2})/i.exec(raw)?.[1];
      if (g) return one("criteria.concrete.fy", Number(g) * 1000);
      const n = num(raw, "psi");
      if (typeof n !== "number") return n;
      return one("criteria.concrete.fy", n < 1000 ? n * 1000 : n);
    },
  },
  numField("criteria.concrete.cover", "in", ["concrete cover", "cover", "rebar cover"]),
  textField("notes", ["notes", "project notes", "general notes"]),
];

/* -------------------------------------------------------- member labels */

/** schema kind of a member template */
export const schemaKind = (k: NewMemberKind | string) =>
  ({
    header: "beam",
    ridge: "beam",
    pad: "footing",
    ftaoWall: "shearWall",
    roofDiaphragm: "diaphragm",
    floorDiaphragm: "diaphragm",
    cmuWall: "masonryWall",
    concreteWall: "masonryWall",
  })[k] ?? k;

const TEXT_KINDS: Array<[RegExp, NewMemberKind]> = [
  [/force transfer|ftao/i, "ftaoWall"],
  [/shear\s*wall/i, "shearWall"],
  [/roof diaphragm/i, "roofDiaphragm"],
  [/floor diaphragm/i, "floorDiaphragm"],
  [/shear transfer/i, "transfer"],
  [/uplift/i, "uplift"],
  [/base\s*plate/i, "basePlate"],
  [/hold-?down footing/i, "holdownFooting"],
  [/retaining/i, "retainingWall"],
  [/guard/i, "guardPost"],
  [/cold.?formed|cfs|metal stud/i, "cfsWall"],
  [/cmu|masonry|block wall/i, "cmuWall"],
  [/concrete wall|stem wall/i, "concreteWall"],
  [/tie.?in|dowel|adhesive anchor/i, "tieIn"],
  [/wood truss|truss design/i, "woodTruss"],
  [/truss/i, "truss"],
  [/ledger/i, "ledger"],
  [/hanger|connector|strap|\btie\b(?!.*rafter)|clip/i, "connector"],
  [/steel beam|wide.?flange|\bW\d+x|lintel/i, "steelBeam"],
  [/steel (column|post)|hss|pipe column/i, "steelColumn"],
  [/i-?joist|tji/i, "ijoist"],
  [/ceiling joist|rafter tie/i, "ceilingJoist"],
  [/rafter|roof joist/i, "rafter"],
  [/joist/i, "joist"],
  [/ridge/i, "ridge"],
  [/header/i, "header"],
  [/beam|girder|lvl|glu-?lam|psl/i, "beam"],
  [/pad|spread|isolated|column footing/i, "pad"],
  [/footing|foundation/i, "footing"],
  [/post|column/i, "post"],
  [/wall/i, "wall"],
];

/** member kind from words ("Floor joist", "LVL beam", "pad footing", "header") */
export function kindFromText(text: string, keys: NewMemberKind[]): NewMemberKind | undefined {
  const t = text.trim();
  const direct = keys.find((k) => k.toLowerCase() === t.toLowerCase().replace(/[\s_-]+/g, ""));
  if (direct) return direct;
  if (/^diaphragm$/i.test(t)) return "roofDiaphragm";
  if (/^masonrywall$/i.test(t)) return "cmuWall";
  return TEXT_KINDS.find(([re]) => re.test(t))?.[1];
}

const MARK_KINDS: Array<[string, NewMemberKind]> = [
  ["HSS", "steelColumn"],
  ["FJ", "joist"],
  ["DJ", "joist"],
  ["CJ", "ceilingJoist"],
  ["IJ", "ijoist"],
  ["RJ", "rafter"],
  ["RB", "ridge"],
  ["CN", "connector"],
  ["PF", "pad"],
  ["SW", "shearWall"],
  ["RD", "roofDiaphragm"],
  ["FD", "floorDiaphragm"],
  ["ST", "transfer"],
  ["UP", "uplift"],
  ["LG", "ledger"],
  ["SB", "steelBeam"],
  ["SC", "steelColumn"],
  ["BP", "basePlate"],
  ["CW", "cmuWall"],
  ["HF", "holdownFooting"],
  ["TI", "tieIn"],
  ["RW", "retainingWall"],
  ["GP", "guardPost"],
  ["CS", "cfsWall"],
  ["BW", "wall"],
  ["R", "rafter"],
  ["B", "beam"],
  ["H", "header"],
  ["T", "truss"],
  ["W", "wall"],
  ["P", "post"],
  ["F", "footing"],
];

/** member kind from the mark's prefix (FJ-1 → joist, 2W-3 → wall, PF-2 → pad) */
export function kindFromMark(mark: string): NewMemberKind | undefined {
  const p = /^\d*([A-Z]+)/i.exec(mark.trim())?.[1]?.toUpperCase();
  if (!p) return undefined;
  return MARK_KINDS.find(([k]) => p === k)?.[1] ?? MARK_KINDS.find(([k]) => p.startsWith(k) && k.length > 1)?.[1];
}

export const looksLikeMark = (s: string) => /^\d?[A-Z]{1,4}-?\d+[A-Z]?(?:-[A-Z0-9]+)?$/i.test(s.trim());

interface MemberCtx {
  /** schema kind */
  kind: string;
  /** number of supports (spans + 1) where known */
  supports: number;
  level: (raw: string) => string | undefined;
}

interface MemberField {
  labels: string[];
  kinds?: string[];
  doc: string;
  to: (raw: string, c: MemberCtx) => Resolved;
}

const LUMBER_KINDS = ["joist", "rafter", "ceilingJoist", "wall"];
const SPAN_KINDS = ["joist", "ceilingJoist", "ijoist", "beam", "steelBeam"];
const DEFL_KINDS = ["joist", "rafter", "ceilingJoist", "ijoist", "beam", "steelBeam"];

const set = (...a: Array<[string, Json]>): Resolved => ({
  ok: true,
  set: a.map(([p, v]) => ({ path: p.split("."), value: v })),
});

/** lumber size text → size (+ species / grade when written) */
function lumberSet(raw: string, prefix = ""): Resolved {
  const m = /\b(\d{1,2})\s*x\s*(\d{1,2})\b/i.exec(raw);
  if (!m) return { ok: false, error: `"${raw}" — expected a nominal size such as 2x10` };
  const out: Array<[string, Json]> = [[`${prefix}size`, `${m[1]}x${m[2]}`]];
  const sp = speciesOf(raw);
  const gr = gradeOf(raw);
  if (sp) out.push([`${prefix}species`, sp]);
  if (gr) out.push([`${prefix}grade`, gr]);
  const spc = /(?:@|at)\s*(\d+(?:\.\d+)?)\s*(?:in|")?/i.exec(raw)?.[1];
  if (spc && !prefix) out.push(["spacing", Number(spc)]);
  return set(...out);
}

export const MEMBER_FIELDS: MemberField[] = [
  {
    labels: ["description", "desc", "location", "remarks", "remark", "note", "notes", "use"],
    doc: "description",
    to: (raw) => one("description", unquote(raw)),
  },
  {
    labels: ["status", "new existing", "condition"],
    doc: "status (new / existing / modified)",
    to: (raw) =>
      /modif|alter|strengthen|reinforc/i.test(raw)
        ? one("status", "modified")
        : /exist/i.test(raw)
          ? one("status", "existing")
          : /new/i.test(raw)
            ? one("status", "new")
            : { ok: false, error: `"${raw}" — expected new, existing or modified` },
  },
  {
    labels: ["level", "floor", "story", "storey"],
    doc: "levelId (level name, number or id)",
    to: (raw, c) => {
      const id = c.level(raw);
      return id ? one("levelId", id) : { ok: false, error: `level "${raw}" not found in the project's levels` };
    },
  },
  {
    labels: ["size", "member", "section", "stud", "studs", "stud size", "lumber", "framing"],
    kinds: LUMBER_KINDS,
    doc: "size (2x10; species, grade and @ spacing read when written)",
    to: (raw) => lumberSet(raw),
  },
  {
    labels: ["species"],
    kinds: [...LUMBER_KINDS],
    doc: "species (DF-L, HF, SPF, SP)",
    to: (raw) => {
      const s = speciesOf(raw);
      return s ? one("species", s) : { ok: false, error: `species "${raw}" — expected DF-L, HF, SPF or SP` };
    },
  },
  {
    labels: ["grade"],
    kinds: [...LUMBER_KINDS],
    doc: "grade (Sel Str, No.1 & Btr, No.1, No.2, No.3, Stud)",
    to: (raw) => {
      const g = gradeOf(raw) ?? (/^stud$/i.test(raw.trim()) ? "Stud" : undefined);
      return g ? one("grade", g) : { ok: false, error: `grade "${raw}" not recognised` };
    },
  },
  {
    labels: ["size", "member", "section", "material", "beam", "header", "post", "lumber"],
    kinds: ["beam", "post"],
    doc: "material ((3) 1-3/4 x 11-7/8 LVL; 4x12 DF-L No.1; 5-1/8 x 12 24F-V4 glulam; (2) 2x12)",
    to: (raw) => {
      const m = woodMaterial(raw);
      return m ? one("material", m) : { ok: false, error: `"${raw}" — wood size not recognised` };
    },
  },
  {
    labels: ["species"],
    kinds: ["beam", "post"],
    doc: "material.species (sawn)",
    to: (raw) => {
      const s = speciesOf(raw);
      return s ? one("material.species", s) : { ok: false, error: `species "${raw}" not recognised` };
    },
  },
  {
    labels: ["grade"],
    kinds: ["beam", "post"],
    doc: "material.grade (sawn)",
    to: (raw) => {
      const g = gradeOf(raw);
      return g ? one("material.grade", g) : { ok: false, error: `grade "${raw}" not recognised` };
    },
  },
  {
    labels: ["plies", "ply"],
    kinds: ["beam", "post"],
    doc: "material.plies",
    to: (raw) => {
      const n = /(\d)/.exec(raw)?.[1];
      return n ? one("material.plies", Number(n)) : { ok: false, error: `plies "${raw}" — expected 1–5` };
    },
  },
  {
    labels: ["size", "shape", "section", "member"],
    kinds: ["steelBeam", "steelColumn"],
    doc: "shape (W8x18, HSS6x6x1/4)",
    to: (raw) => {
      const m =
        /\b(W\d+X\d+(?:\.\d+)?|HSS\s*\d+(?:\.\d+)?X\d+(?:\.\d+)?(?:X\d+\/\d+|X\d?\.\d+)?|C\d+X\d+(?:\.\d+)?)\b/i.exec(
          raw.replace(/\s+/g, ""),
        );
      return m
        ? one("shape", m[1].toUpperCase().replace(/^HSS/, "HSS").replace(/X/g, "x"))
        : { ok: false, error: `steel shape "${raw}" not recognised` };
    },
  },
  {
    labels: ["series", "product", "size", "joist", "tji"],
    kinds: ["ijoist"],
    doc: "series + depth (TJI 210 11-7/8)",
    to: (raw) => {
      const s = /TJI\s*-?\s*(110|210|230|360|560)/i.exec(raw)?.[1];
      const d = /(9-1\/2|9\.5|11-7\/8|11\.875|14|16|18)\s*(?:in|")?\s*$/i.exec(
        raw.replace(/TJI\s*-?\s*\d+/i, "").trim(),
      )?.[1];
      if (!s && !d) return { ok: false, error: `"${raw}" — expected e.g. TJI 210 11-7/8 (110, 210, 230, 360, 560)` };
      const depth = d
        ? (({ "9.5": '9-1/2"', "11.875": '11-7/8"' } as Record<string, string>)[d] ?? `${d}"`)
        : undefined;
      return set(
        ...(s ? ([["series", `TJI ${s}`]] as Array<[string, Json]>) : []),
        ...(depth ? ([["depth", depth]] as Array<[string, Json]>) : []),
      );
    },
  },
  {
    labels: ["depth", "joist depth"],
    kinds: ["ijoist"],
    doc: "depth (9-1/2, 11-7/8, 14, 16, 18 in.)",
    to: (raw) => {
      const q = quantity(raw);
      const map: Record<string, string> = {
        "9.5": '9-1/2"',
        "11.875": '11-7/8"',
        "14": '14"',
        "16": '16"',
        "18": '18"',
      };
      const v = q && map[String(round(q.v))];
      return v ? one("depth", v) : { ok: false, error: `I-joist depth "${raw}" not in the library` };
    },
  },
  {
    labels: ["grade", "steel grade"],
    kinds: ["steelBeam", "steelColumn"],
    doc: "grade (A992, A500 Gr. C, A36)",
    to: (raw) => one("grade", unquote(raw)),
  },
  {
    labels: ["spacing", "o c", "oc", "on center", "joist spacing", "stud spacing", "rafter spacing"],
    kinds: ["joist", "rafter", "ceilingJoist", "ijoist", "wall", "truss"],
    doc: 'spacing (in.; 16 in. o.c., 16", 1\'-4")',
    to: (raw) => {
      const n = num(raw, "in");
      return typeof n === "number" ? one("spacing", n) : n;
    },
  },
  {
    labels: ["span", "spans", "clear span", "length", "span length", "beam span", "joist span"],
    kinds: SPAN_KINDS,
    doc: "spans (ft; 14'-6\", 14.5 ft, or 14 ft, 12 ft for continuous)",
    to: (raw) => {
      const l = list(raw, "ft");
      return Array.isArray(l) ? one("spans", l) : l;
    },
  },
  {
    labels: ["cantilever", "right cantilever", "overhang", "cantilever length"],
    kinds: ["joist", "ijoist", "beam", "steelBeam"],
    doc: "rightCantilever (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("rightCantilever", n) : n;
    },
  },
  {
    labels: ["left cantilever", "back cantilever"],
    kinds: ["joist", "ijoist", "beam", "steelBeam"],
    doc: "leftCantilever (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("leftCantilever", n) : n;
    },
  },
  {
    labels: ["bearing", "bearing length", "bearing width", "lb"],
    kinds: ["joist", "ceilingJoist", "ijoist", "beam"],
    doc: "bearing (in. at every support, or a list)",
    to: (raw, c) => {
      const l = list(raw, "in");
      if (!Array.isArray(l)) return l;
      return one("bearing", l.length === 1 ? Array.from({ length: Math.max(2, c.supports) }, () => l[0]) : l);
    },
  },
  {
    labels: ["dead load", "dead", "dl", "floor dead load", "roof dead load"],
    kinds: ["joist", "rafter", "ceilingJoist", "ijoist"],
    doc: "dead.psf (psf)",
    to: (raw) => {
      const n = num(raw, "psf");
      return typeof n === "number" ? one("dead", { psf: n }) : n;
    },
  },
  {
    labels: ["live load", "live", "ll", "floor live load", "occupancy", "live load use"],
    kinds: ["joist", "ceilingJoist", "ijoist"],
    doc: "live (psf, or a use: living, sleeping, deck, balcony, attic, stairs, garage)",
    to: (raw) => liveRef(raw, "live"),
  },
  {
    labels: ["trib", "tributary", "tributary width", "trib width", "tributary length"],
    kinds: ["beam", "steelBeam", "wall"],
    doc: "area.0.trib (ft) — first area load",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? set(["area.0.trib", n], ["area.0.label", "Tributary area"]) : n;
    },
  },
  {
    labels: ["dead load", "dead", "dl", "area dead load"],
    kinds: ["beam", "steelBeam", "wall"],
    doc: "area.0.dead.psf (psf)",
    to: (raw) => {
      const n = num(raw, "psf");
      return typeof n === "number" ? set(["area.0.dead", { psf: n }], ["area.0.label", "Tributary area"]) : n;
    },
  },
  {
    labels: ["live load", "live", "ll", "area live load", "floor live load"],
    kinds: ["beam", "steelBeam", "wall"],
    doc: "area.0.live (psf or use)",
    to: (raw) => {
      const r = liveRef(raw, "area.0.live");
      if (r.ok) r.set.push({ path: ["area", "0", "label"], value: "Tributary area" });
      return r;
    },
  },
  {
    labels: ["roof live", "roof live load", "carries roof"],
    kinds: ["beam", "steelBeam", "wall"],
    doc: "area.0.roofLive (yes / no)",
    to: (raw) => {
      const b = bool(raw);
      return typeof b === "boolean" ? set(["area.0.roofLive", b], ["area.0.label", "Tributary area"]) : b;
    },
  },
  {
    labels: ["snow", "snow load"],
    kinds: ["beam", "steelBeam", "wall"],
    doc: "area.0.snow (yes / no)",
    to: (raw) => {
      const b = bool(raw);
      return typeof b === "boolean" ? set(["area.0.snow", b], ["area.0.label", "Tributary area"]) : b;
    },
  },
  {
    labels: ["point load", "point", "concentrated load", "p"],
    kinds: ["joist", "ceilingJoist", "ijoist", "beam", "steelBeam", "post", "steelColumn", "footing", "wall"],
    doc: "extra (point): 1,200 lb D at 6 ft (one line per load; type D, L, Lr, S, W, E)",
    to: (raw) => {
      const r = extraLoad(raw, false);
      if ("ok" in r) return r as Resolved;
      const assumed = r._assumedType;
      delete r._assumedType;
      return {
        ok: true,
        set: [{ path: ["extra"], value: r, push: true }],
        note: assumed ? "load type not given — D (dead) used" : undefined,
      };
    },
  },
  {
    labels: ["line load", "uniform load", "distributed load", "w"],
    kinds: ["joist", "ceilingJoist", "ijoist", "beam", "steelBeam", "wall", "footing"],
    doc: "extra (line): 150 plf D [from 2 ft to 8 ft]",
    to: (raw) => {
      const r = extraLoad(raw, true);
      if ("ok" in r) return r as Resolved;
      return { ok: true, set: [{ path: ["extra"], value: r, push: true }] };
    },
  },
  {
    labels: ["deflection", "deflection limit", "deflection limits"],
    kinds: DEFL_KINDS,
    doc: "deflection (L/360 live, L/240 total)",
    to: (raw) => {
      const d = deflection(raw);
      if ("ok" in d) return d as Resolved;
      return one("deflection", {
        preset: "custom",
        ...(d.live ? { live: d.live } : {}),
        ...(d.total ? { total: d.total } : {}),
      });
    },
  },
  {
    labels: ["live deflection", "live load deflection", "ll deflection"],
    kinds: DEFL_KINDS,
    doc: "deflection.live (L/360)",
    to: (raw) => {
      const r = ratio(raw);
      return r
        ? set(["deflection.preset", "custom"], ["deflection.live", r])
        : { ok: false, error: `"${raw}" — expected L/360` };
    },
  },
  {
    labels: ["total deflection", "total load deflection", "tl deflection"],
    kinds: DEFL_KINDS,
    doc: "deflection.total (L/240)",
    to: (raw) => {
      const r = ratio(raw);
      return r
        ? set(["deflection.preset", "custom"], ["deflection.total", r])
        : { ok: false, error: `"${raw}" — expected L/240` };
    },
  },
  {
    labels: ["deflection", "deflection limit", "wind deflection"],
    kinds: ["wall"],
    doc: "deflN (L/240)",
    to: (raw) => {
      const r = ratio(raw);
      return r ? one("deflN", r) : { ok: false, error: `"${raw}" — expected L/240` };
    },
  },
  {
    labels: ["role", "type", "beam type"],
    kinds: ["beam"],
    doc: "role (beam, header, ridge, flush, dropped)",
    to: (raw) => {
      const r = /flush/i.test(raw)
        ? "flush"
        : /drop/i.test(raw)
          ? "dropped"
          : /header/i.test(raw)
            ? "header"
            : /ridge/i.test(raw)
              ? "ridge"
              : /beam/i.test(raw)
                ? "beam"
                : undefined;
      return r ? one("role", r) : { ok: false, error: `"${raw}" — expected beam, header, ridge, flush or dropped` };
    },
  },
  {
    labels: ["pitch", "slope", "roof pitch", "roof slope", "rise"],
    kinds: ["rafter"],
    doc: "rise (in 12: 4:12, 4/12, 4 in 12)",
    to: (raw) => {
      const m = /^\s*(\d+(?:\.\d+)?)\s*(?::|\/|in)\s*12\s*$/i.exec(raw) ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(raw);
      const deg = /^\s*(\d+(?:\.\d+)?)\s*(?:°|deg)/i.exec(raw);
      if (deg) return one("rise", round(12 * Math.tan((Number(deg[1]) * Math.PI) / 180)));
      return m ? one("rise", Number(m[1])) : { ok: false, error: `pitch "${raw}" — expected 4:12` };
    },
  },
  {
    labels: ["run", "horizontal run", "rafter run", "span", "horizontal span", "rafter span"],
    kinds: ["rafter"],
    doc: "run (ft, horizontal plate to ridge)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("run", n) : n;
    },
  },
  {
    labels: ["overhang", "eave overhang", "eave"],
    kinds: ["rafter"],
    doc: "overhang (ft, horizontal)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("overhang", n) : n;
    },
  },
  {
    labels: ["ridge", "ridge condition"],
    kinds: ["rafter"],
    doc: "ridge (beam / board)",
    to: (raw) =>
      /board/i.test(raw)
        ? one("ridge", "board")
        : /beam/i.test(raw)
          ? one("ridge", "beam")
          : { ok: false, error: `"${raw}" — expected beam or board` },
  },
  {
    labels: ["roof live", "roof live load"],
    kinds: ["rafter"],
    doc: "roofLive (yes / no)",
    to: (raw) => {
      const b = bool(raw);
      return typeof b === "boolean" ? one("roofLive", b) : b;
    },
  },
  {
    labels: ["snow", "snow load"],
    kinds: ["rafter"],
    doc: "snow (yes / no)",
    to: (raw) => {
      const b = bool(raw);
      return typeof b === "boolean" ? one("snow", b) : b;
    },
  },
  {
    labels: ["height", "plate height", "wall height", "stud height", "stud length"],
    kinds: ["wall"],
    doc: "plateHeight (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("plateHeight", n) : n;
    },
  },
  {
    labels: ["length", "wall length"],
    kinds: ["wall"],
    doc: "length (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("length", n) : n;
    },
  },
  {
    labels: ["sheathing", "sheathed"],
    kinds: ["wall"],
    doc: "sheathing (both / one / none)",
    to: (raw) =>
      /both|two|2/i.test(raw)
        ? one("sheathing", "both")
        : /one|single|1|exterior/i.test(raw)
          ? one("sheathing", "one")
          : /none|no/i.test(raw)
            ? one("sheathing", "none")
            : { ok: false, error: `"${raw}" — expected both, one or none` },
  },
  {
    labels: ["top plates", "top plate"],
    kinds: ["wall"],
    doc: "topPlates (1–3; single / double / triple)",
    to: (raw) => {
      const n = /single/i.test(raw) ? 1 : /double/i.test(raw) ? 2 : /triple/i.test(raw) ? 3 : num(raw, "none");
      return typeof n === "number" ? one("topPlates", n) : n;
    },
  },
  {
    labels: ["wind", "wind pressure", "wind load"],
    kinds: ["wall"],
    doc: "wind (none / computed / 20 psf entered)",
    to: (raw) => {
      if (/none|no|interior/i.test(raw)) return one("wind", { mode: "none" });
      if (/comput|asce|c&c|yes/i.test(raw)) return one("wind", { mode: "computed", zone: 4 });
      const n = num(raw, "psf");
      return typeof n === "number" ? one("wind", { mode: "entered", psf: n }) : n;
    },
  },
  {
    labels: ["height", "post height", "column height", "unbraced length", "length", "lu"],
    kinds: ["post", "steelColumn"],
    doc: "height (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("height", n) : n;
    },
  },
  {
    labels: ["bears on", "bearing on", "base", "support"],
    kinds: ["post"],
    doc: "bearing.on (concrete / wood / steel)",
    to: (raw) =>
      /concrete|footing|slab|pier/i.test(raw)
        ? one("bearing.on", "concrete")
        : /steel/i.test(raw)
          ? one("bearing.on", "steel")
          : /wood|beam|plate|sill/i.test(raw)
            ? one("bearing.on", "wood")
            : { ok: false, error: `"${raw}" — expected concrete, wood or steel` },
  },
  {
    labels: ["unbraced length", "lb", "lu"],
    kinds: ["steelBeam"],
    doc: "Lb (ft)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("Lb", n) : n;
    },
  },
  {
    labels: ["size", "dimensions", "footing size"],
    kinds: ["footing"],
    doc: "size (pad 24 x 24 x 12 in.; strip 15 in. W x 18 in. D)",
    to: (raw) => {
      const s = raw.replace(/["″]/g, " in").replace(/×/g, "x");
      const w = /(\d+(?:\.\d+)?)\s*(?:in\.?)?\s*W\b/i.exec(s)?.[1];
      const d = /(\d+(?:\.\d+)?)\s*(?:in\.?)?\s*(?:D|thick|deep)\b/i.exec(s)?.[1];
      if (w && d) return set(["type", "strip"], ["B", round(Number(w) / 12)], ["h", Number(d)]);
      const ft = /(?:'|ft)/i.test(s);
      const n = [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      const toFt = (v: number) => round(ft ? v : v / 12);
      if (n.length >= 3)
        return set(["type", "pad"], ["B", toFt(n[0])], ["L", toFt(n[1])], ["h", ft ? n[2] * 12 : n[2]]);
      if (n.length === 2) return set(["type", "strip"], ["B", toFt(n[0])], ["h", ft ? n[1] * 12 : n[1]]);
      return {
        ok: false,
        error: `footing size "${raw}" — expected 24 x 24 x 12 in. (pad) or 15 in. W x 18 in. D (strip)`,
      };
    },
  },
  {
    labels: ["width", "footing width", "b"],
    kinds: ["footing"],
    doc: "B (ft; 24 in. → 2.0)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("B", n) : n;
    },
  },
  {
    labels: ["length", "footing length", "l"],
    kinds: ["footing"],
    doc: "L (ft, pad)",
    to: (raw) => {
      const n = num(raw, "ft");
      return typeof n === "number" ? one("L", n) : n;
    },
  },
  {
    labels: ["thickness", "footing thickness", "footing depth", "h"],
    kinds: ["footing"],
    doc: "h (in.)",
    to: (raw) => {
      const n = num(raw, "in");
      return typeof n === "number" ? one("h", n) : n;
    },
  },
  {
    labels: ["depth below grade", "embedment", "bottom below grade", "depth", "frost depth"],
    kinds: ["footing"],
    doc: "depth (in. below grade)",
    to: (raw) => {
      const n = num(raw, "in");
      return typeof n === "number" ? one("depth", n) : n;
    },
  },
  {
    labels: ["type", "footing type"],
    kinds: ["footing"],
    doc: "type (strip / pad)",
    to: (raw) =>
      /pad|spread|isolated|square/i.test(raw)
        ? one("type", "pad")
        : /strip|cont|wall/i.test(raw)
          ? one("type", "strip")
          : { ok: false, error: `"${raw}" — expected strip or pad` },
  },
  {
    labels: ["reinforcement", "rebar", "reinforcing", "bars", "steel"],
    kinds: ["footing"],
    doc: "rebar ((3) #4 each way — pad; (2) #4 top & bottom — strip)",
    to: (raw) => {
      const b = /\((\d+)\)\s*(#\d+)/.exec(raw) ?? /(\d+)\s*-?\s*(#\d+)/.exec(raw);
      const sp = /(#\d+)\s*(?:@|at)\s*(\d+(?:\.\d+)?)/i.exec(raw);
      if (sp && !b) return one("rebar", { size: sp[1], spacing: Number(sp[2]) });
      if (!b) return { ok: false, error: `reinforcement "${raw}" — expected e.g. (3) #4` };
      if (/top|bot/i.test(raw) && !/each way|e\.?w/i.test(raw)) {
        const n = Number(b[1]);
        const both = /top\s*(&|and|\/)\s*bot/i.test(raw) || /t\s*&\s*b/i.test(raw);
        return one("longitudinal", {
          size: b[2],
          top: both || /top/i.test(raw) ? n : 0,
          bottom: both || /bot/i.test(raw) ? n : 0,
        });
      }
      return one("rebar", { size: b[2], count: Number(b[1]) });
    },
  },
  {
    labels: ["post size", "column size", "column", "post", "c1"],
    kinds: ["footing"],
    doc: "c1 / c2 (in.; 6x6 → 5.5)",
    to: (raw) => {
      const nom = /\b(\d{1,2})\s*x\s*(\d{1,2})\b/.exec(raw);
      if (nom) {
        const actual = (n: number) => (n >= 6 ? n - 0.5 : n - 0.5);
        return set(["c1", actual(Number(nom[1]))], ["c2", actual(Number(nom[2]))]);
      }
      const n = num(raw, "in");
      return typeof n === "number" ? set(["c1", n]) : n;
    },
  },
];

function liveRef(raw: string, path: string): Resolved {
  const q = quantity(raw);
  if (q && (!q.u || UNIT[q.u]?.to === "psf")) return one(path, { psf: q.v * (UNIT[q.u ?? "psf"]?.f ?? 1) });
  const t = raw.toLowerCase();
  const use = /no storage|without storage|uninhabit/.test(t)
    ? "attic-no-storage"
    : /limited storage/.test(t)
      ? "attic-limited-storage"
      : /habitable attic/.test(t)
        ? "habitable-attic"
        : /sleep|bedroom/.test(t)
          ? "sleeping"
          : /stair/.test(t)
            ? "stairs"
            : /balcon/.test(t)
              ? "balcony"
              : /deck/.test(t)
                ? "deck"
                : /garage/.test(t)
                  ? "garage"
                  : /attic/.test(t)
                    ? "attic-limited-storage"
                    : /living|resid|dwelling|floor|room/.test(t)
                      ? "living"
                      : undefined;
  return use
    ? one(path, { use })
    : { ok: false, error: `live load "${raw}" — give psf or a use (living, sleeping, deck, attic, …)` };
}

/* ---------------------------------------------------------------- lookup */

const PROJECT_INDEX = new Map<string, Field>();
for (const f of PROJECT_FIELDS) for (const l of f.labels) PROJECT_INDEX.set(norm(l), f);

export function projectField(key: string): Field | undefined {
  return PROJECT_INDEX.get(norm(key));
}

export function memberField(key: string, kind: string): MemberField | undefined {
  const k = norm(key);
  return (
    MEMBER_FIELDS.find((f) => (!f.kinds || f.kinds.includes(kind)) && f.labels.some((l) => norm(l) === k)) ?? undefined
  );
}

export const memberLabelsFor = (kind: string) =>
  MEMBER_FIELDS.filter((f) => !f.kinds || f.kinds.includes(kind)).flatMap((f) => f.labels);

/** labels of the same kind of record that are close to `key` (typos, word order) */
export function suggest(key: string, candidates: string[]): string[] {
  const k = norm(key);
  const scored = [...new Set(candidates.map(norm))]
    .map((c) => ({ c, d: distance(k, c) - (c.includes(k) || k.includes(c) ? 2 : 0) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(Math.max(k.length, x.c.length) / 3)))
    .sort((a, b) => a.d - b.d);
  return scored.slice(0, 3).map((x) => x.c);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Units of dotted-path fields, so a value written with units ("spans: 14 ft") is converted. */
const PATH_UNITS: Record<string, Unit> = {
  spans: "ft",
  leftCantilever: "ft",
  rightCantilever: "ft",
  overhang: "ft",
  run: "ft",
  trib: "ft",
  plateHeight: "ft",
  Lb: "ft",
  x: "ft",
  x1: "ft",
  x2: "ft",
  spacing: "in",
  plyWidth: "in",
  psf: "psf",
};
const KIND_UNITS: Record<string, Record<string, Unit>> = {
  joist: { bearing: "in" },
  ceilingJoist: { bearing: "in" },
  ijoist: { bearing: "in" },
  beam: { bearing: "in", d: "in", b: "in" },
  wall: { length: "ft" },
  post: { height: "ft" },
  steelColumn: { height: "ft" },
  footing: { B: "ft", L: "ft", h: "in", depth: "in", c1: "in", c2: "in" },
};
const PROJECT_UNITS: Record<string, Unit> = {
  L0: "psf",
  pg: "psf",
  V: "mph",
  fc: "psi",
  fy: "psi",
  cover: "in",
  bearing: "psf",
};

/**
 * A dotted-path value written with units ("14 ft", "16 in. o.c.", "1,500 psf", "14 ft, 12 ft")
 * in the field's unit; undefined when the value has no units or the field's unit is not known.
 */
export function pathValueWithUnits(
  scope: "project" | "member",
  kind: string,
  path: string[],
  raw: string,
): { value: Json; from: string } | { error: string } | undefined {
  const last = path[path.length - 1];
  const unit =
    scope === "project"
      ? path[0] === "criteria"
        ? PROJECT_UNITS[last]
        : undefined
      : (KIND_UNITS[kind]?.[last] ?? PATH_UNITS[last]);
  if (!unit) return undefined;
  if (!/[a-z'"″′]/i.test(raw.replace(/^\s*\[|\]\s*$/g, "")) && !/\d,\d{3}\b/.test(raw)) return undefined;
  if (/^\s*[[{"]/.test(raw) && !/^\s*\[/.test(raw)) return undefined;
  if (last === "spans" || last === "bearing") {
    const l = list(raw, unit);
    return Array.isArray(l) ? { value: l, from: raw.trim() } : { error: l.ok ? "" : l.error };
  }
  const n = num(raw, unit);
  return typeof n === "number" ? { value: n, from: raw.trim() } : { error: n.ok ? "" : n.error };
}

/** Human-readable reference of the accepted labels (shown in the Fill from .md dialog). */
export function labelReference(): { project: Array<[string, string]>; member: Array<[string, string, string]> } {
  return {
    project: PROJECT_FIELDS.map((f) => [f.labels.slice(0, 3).join(" / "), f.doc]),
    member: MEMBER_FIELDS.map((f) => [f.labels.slice(0, 3).join(" / "), f.kinds ? f.kinds.join(", ") : "all", f.doc]),
  };
}

/** A plain-language starter sheet (Fill from .md → Starter sheet). */
export const STARTER_SHEET = `# Project input sheet

## Project information

- Project name: 
- Address: 
- Job no: 
- Client: 
- Jurisdiction: 
- Engineer: 
- Date: 
- Revision: 0
- Code: 2025 CBC
- Issue status: final

## Design criteria

| Parameter | Value |
|---|---|
| Risk category | II |
| Roof live load | 20 psf |
| Ground snow load | 0 psf |
| SDS / SD1 | 1.00 / 0.60 |
| Site class | D |
| Seismic design category | D |
| Wind speed | 95 mph |
| Exposure | C |
| Allowable soil bearing | 1,500 psf |
| f'c | 2,500 psi |
| Rebar | Grade 60 |

## Beam schedule

| Mark | Size | Span | Trib | Dead load | Live load | Deflection |
|---|---|---|---|---|---|---|
| B-1 | (3) 1-3/4 x 11-7/8 LVL | 16'-0" | 6 ft | 15 psf | 40 psf | L/360 live, L/240 total |
| H-1 | 4x8 DF-L No.2 | 6'-0" | 2 ft | 15 psf | 40 psf | |

## FJ-1 (floor joist)

- Size: 2x10 DF-L No.2 @ 16 in. o.c.
- Span: 13'-6"
- Dead load: 12 psf
- Live load: living
- Bearing length: 1.5 in

## R-1 (rafter)

- Size: 2x8 DF-L No.2 @ 24 in. o.c.
- Pitch: 4:12
- Run: 12 ft
- Overhang: 1'-6"
- Ridge: board

## 1W-1 (wall)

- Size: 2x6 DF-L Stud @ 16 in. o.c.
- Plate height: 9 ft
- Length: 12 ft
- Trib: 8 ft
- Dead load: 15 psf
- Live load: 40 psf

## P-1 (post)

- Size: 6x6 DF-L No.1
- Height: 8 ft
- Bears on: concrete
- Point load: 4,000 lb D at 0 ft

## Footing schedule

| Mark | Size | Reinforcement | Depth below grade |
|---|---|---|---|
| F-1 | 15 in W x 12 in D | (2) #4 top & bottom | 18 in |
| PF-1 | 24 x 24 x 12 in | (3) #4 each way | 18 in |
`;
