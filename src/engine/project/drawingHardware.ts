/**
 * Hardware called out on the drawings (Simpson Strong-Tie model numbers in notes, details and
 * plan callouts). Only models that appear on the drawings go to the project hardware list:
 * models in the HouseCalc catalogue keep their catalogue values; others are listed with blank
 * capacities for the engineer to enter from the manufacturer's catalogue / ICC-ES report.
 * Families named without a size (e.g. "HUC / HGUS or equivalent") are reported, not added.
 */

import { defaultHardware, type HardwareItem, type HardwareKind } from "../data/hardware";

interface Family {
  re: RegExp;
  kind: HardwareKind;
  what: string;
  /** the model is only taken when the same line reads like a connector note */
  context?: RegExp;
}

const CONNECTOR_LINE = /simpson|strong-?tie|hurricane|\btie\b|truss|rafter|joist|clip|connector|each end|per plan/i;

// model = family letters + size digits (+ suffix such as -2P, -SDS2.5, Z); ASTM designations
// (A307, A325, A615 …) are excluded by naming the A-angles explicitly
const FAMILIES: Family[] = [
  { re: /\b(HDU(?:2|4|5|8|11|14)(?:-SDS2\.5)?)\b/g, kind: "holdown", what: "hold-down" },
  { re: /\b(HTT[45])\b/g, kind: "holdown", what: "tension tie" },
  { re: /\b(H?HDQ\d{1,2}(?:-SDS\d(?:\.\d)?)?)\b/g, kind: "holdown", what: "hold-down" },
  { re: /\b(STHD(?:8|10|14)(?:RJ)?)\b/g, kind: "holdown", what: "strap-tie hold-down" },
  { re: /\b(HPAHD22(?:-2P)?|PAHD42)\b/g, kind: "holdown", what: "embedded strap hold-down" },
  { re: /\b(DTT[12]Z(?:-SDS2\.5)?|LTT(?:19|20B?|131))\b/g, kind: "holdown", what: "tension tie" },
  { re: /\b(LSTA\d{1,2}|MSTA\d{1,2}|MSTC\d{2}B?\d?|MSTI\d{2}|MST\d{2,3})\b/g, kind: "strap", what: "strap tie" },
  { re: /\b(CMSTC?16|CMST1[24]|CS1[468]|CS2[02])\b/g, kind: "strap", what: "coiled strap" },
  { re: /\b(ST\d{3,4}|LSTI\d{2,3})\b/g, kind: "strap", what: "strap tie" },
  { re: /\b(WB\d{3}C?)\b/g, kind: "strap", what: "wall bracing" },
  { re: /\b(LUS\d{2,4}(?:-\d)?|HUS\d{2,4}(?:-\d)?|HHUS\d{2,4}(?:-\d)?)\b/g, kind: "hanger", what: "face-mount hanger" },
  {
    re: /\b(HUCQ?\d{3,4}(?:-SDS)?|HGUS\d{3,4}(?:-\d)?|HU\d{2,4}(?:-\d)?|HGU\d{2,4})\b/g,
    kind: "hanger",
    what: "hanger",
  },
  {
    re: /\b(LSSU\d{2,3}|IUS\d\.\d{2}\/\d{1,2}|ITS\d\.\d{2}\/\d{1,2}|MIU\d\.\d{2}\/\d{1,2}|U\d{2,4}(?:-\d)?)\b/g,
    kind: "hanger",
    what: "hanger",
  },
  {
    re: /\b(H(?:1|2\.5A|2\.5T|3|4|6|7Z|8|10A?|14|15|16))\b/g,
    kind: "tie",
    what: "hurricane tie",
    context: CONNECTOR_LINE,
  },
  { re: /\b(DTC|RBC|LTS1[268]|MTS1[268]|HTS\d{2})\b/g, kind: "tie", what: "tie / truss clip" },
  { re: /\b(A3[45]|A2[13]|LTP4)\b/g, kind: "angle", what: "framing angle" },
  {
    re: /\b(BC(?:4|6|8|46|460|40)|CCQ?\d{2,3}(?:-SDS2\.5)?|ECCQ?\d{2,3}|LCE4|PCZ?\d{2,3})\b/g,
    kind: "post-cap",
    what: "post cap",
  },
  {
    re: /\b(ABU\d{2,3}Z?|ABA\d{2,3}Z?|ABW\d{2,3}Z?|CBSQ\d{2,3}(?:-SDS2)?|PBS?\d{2,3}Z?)\b/g,
    kind: "post-base",
    what: "post base",
  },
];

/** families named without a model size */
const BARE = /\b(HUC|HGUS|HU|ECC|CC|CBSQ|WB|LSTA|MST|HDU|ABU|LUS)\b(?![\d-])/g;
const BARE_CONTEXT = /simpson|cap|hanger|strap|post|base|equivalent|connector|each end|brac/i;

export interface DrawingHardware {
  model: string;
  kind: HardwareKind;
  what: string;
  sheets: string[];
}

export interface HardwareFound {
  models: DrawingHardware[];
  /** families named without a size: family → sheets */
  bare: Array<{ family: string; sheets: string[] }>;
}

const SHEET = /\b(S-\d+(?:\.\d+)?)\b/;

export function findHardware(text: string): HardwareFound {
  const models = new Map<string, DrawingHardware>();
  const bare = new Map<string, Set<string>>();
  let pageSheet = "";
  for (const raw of text.split(/\n/)) {
    const page = /^#{2,4}\s+PDF page \d+\s*-\s*(\S+)/i.exec(raw);
    if (page) {
      pageSheet = page[1];
      continue;
    }
    const line = raw.toUpperCase();
    const sheet = SHEET.exec(raw)?.[1] ?? pageSheet;
    for (const f of FAMILIES) {
      if (f.context && !f.context.test(raw)) continue;
      for (const m of line.matchAll(f.re)) {
        const model = m[1];
        const cur = models.get(model) ?? { model, kind: f.kind, what: f.what, sheets: [] };
        if (sheet && !cur.sheets.includes(sheet)) cur.sheets.push(sheet);
        models.set(model, cur);
      }
    }
    if (BARE_CONTEXT.test(raw))
      for (const m of line.matchAll(BARE)) {
        const s = bare.get(m[1]) ?? new Set<string>();
        if (sheet) s.add(sheet);
        bare.set(m[1], s);
      }
  }
  const sized = [...models.keys()];
  return {
    models: [...models.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.model.localeCompare(b.model)),
    // a bare family is only reported when no sized model of that family is on the drawings
    bare: [...bare.entries()]
      .filter(([fam]) => !sized.some((m) => m.startsWith(fam) && /\d/.test(m.slice(fam.length, fam.length + 1))))
      .map(([family, s]) => ({ family, sheets: [...s] })),
  };
}

const sheetList = (s: string[]) => (s.length ? s.join(", ") : "notes");

/** project hardware list: only the models on the drawings */
export function hardwareFromDrawings(found: DrawingHardware[]): HardwareItem[] {
  const cat = new Map(defaultHardware().map((h) => [h.model.toUpperCase(), h]));
  return found.map((f) => {
    const c = cat.get(f.model) ?? cat.get(`${f.model}-SDS2.5`);
    if (c) return { ...c, source: `${c.source}; on the drawings (${sheetList(f.sheets)})` };
    return {
      id: f.model,
      model: f.model,
      kind: f.kind,
      manufacturer: "Simpson Strong-Tie",
      description: `${f.model} ${f.what}`,
      fasteners: "per catalogue",
      report: "",
      checked: false,
      source: `Called out on the drawings (${sheetList(f.sheets)}) — enter the allowable loads, fasteners and ICC-ES report from the manufacturer's catalogue`,
    };
  });
}
