/**
 * Content of the S0 general notes drawing sheet, laid out like the engineer's issued S0 sheets:
 * titled panels of all-caps notes (their standard text, s0Template.ts, overridable per project)
 * plus the parts generated from the project so the sheet agrees with the calculations — codes
 * and standards, structural criteria, symbol legend, lap splice schedule (from f'c), nailing,
 * shear wall and hardware schedules, special inspections, deferred submittals, drawing index.
 */

import { getCycle } from "../core/codes";
import { fmt } from "../core/fmt";
import { S0_TEMPLATE } from "../data/s0Template";
import { TYPICAL_NAILING } from "../data/nailing";
import { nailDef } from "../design/dowel";
import type { PlyConnectionInput } from "../design/plies";
import { assemblyDesignValue } from "../loads/dead";
import { DEFLECTION_PRESETS } from "../loads/deflection";
import { liveLoad } from "../loads/live";
import type { AnyResult, ProjectDesign } from "./design";
import { issuedNoteLine } from "./drawingData";
import { generateNotes, hardwareSchedule } from "./notes";
import type { Project } from "./schema";

export type S0Panel =
  | { title: string; kind: "notes"; lines: string[] }
  | {
      title: string;
      kind: "criteria";
      groups: Array<{ head: string; rows: Array<[string, string]> }>;
      foot: string[];
    }
  | {
      title: string;
      kind: "table";
      head: string[];
      /** column width fractions */
      widths: number[];
      rows: string[][];
      caption?: string;
      foot?: string[];
    };

export interface GeneralNotesSheet {
  panels: S0Panel[];
  /** sheet number, title */
  index: Array<[string, string]>;
  sheetNo: string;
}

/**
 * Tension lap splices, inches, per ACI 318-19 25.4.2.3 (simplified, Grade 60 uncoated, normal
 * weight; ψt = 1.3 top bars) and 25.5.2: Class A = 1.0 ld, Class B = 1.3 ld, 12 in. minimum.
 * Rows: class, location, #3 … #8.
 */
export function lapSpliceTable(fc: number, fy: number): string[][] {
  const bars = [3, 4, 5, 6, 7, 8];
  const ld = (n: number) => (fy * (n / 8)) / ((n <= 6 ? 25 : 20) * Math.sqrt(Math.min(fc, 10000)));
  const row = (cls: string, loc: string, k: number) => [
    cls,
    loc,
    ...bars.map((n) => String(Math.max(12, Math.ceil(k * ld(n) - 1e-9)))),
  ];
  return [row("A", "TOP", 1.3), row("A", "BOTTOM", 1), row("B", "TOP", 1.3 * 1.3), row("B", "BOTTOM", 1.3)];
}

const plyText = (c: PlyConnectionInput) =>
  c.fastener === "nail"
    ? `${c.rows} rows ${nailDef(c.nail ?? "16d-common").label}`
    : `${c.rows} rows ${fmt(c.boltDia ?? 0.5, 3)} in. dia. through-bolts`;

const up = (s: string) => s.toUpperCase();
/** template text: markdown emphasis and quote markers removed, one note per line */
const lines = (s: string) =>
  s
    .split(/\n+/)
    .map((l) => l.replace(/\*\*/g, "").replace(/^>\s*/, "").trim())
    .filter(Boolean);

export function generalNotesSheet(p: Project, d: ProjectDesign): GeneralNotesSheet {
  const c = getCycle(p.cycleId);
  const rs = [...d.outcomes.values()].flatMap((o) => (o.result ? [o.result] : []));
  const has = (...k: AnyResult["kind"][]) => rs.some((r) => k.includes(r.kind));
  const cr = p.criteria;
  const L = d.lateral;
  const gen = generateNotes(p, d);
  const final = (p.info.issue ?? "final") === "final";
  const issued = (l: string) => (final ? issuedNoteLine(l) : l);
  const concrete = has("footing", "holdownFooting", "masonryWall", "tieIn", "basePlate", "retainingWall", "shearWall");
  const steel = has("steelBeam", "steelColumn", "basePlate", "steelTruss", "guardPost");
  const cmu = rs.some(
    (r) =>
      (r.kind === "masonryWall" && r.input.material === "cmu") ||
      (r.kind === "retainingWall" && r.input.stem.material === "cmu"),
  );

  const joists = rs.filter((r) => r.kind === "joist" || r.kind === "ijoist");
  const fill = (key: string): string[] =>
    lines(p.s0Notes?.[key] ?? S0_TEMPLATE[key] ?? "")
      .flatMap((l) => {
        if (!l.includes("{FLOOR_JOISTS}")) return [l];
        if (!joists.length) return [];
        const txt = joists.map((r) => `${r.mark}: ${r.callout}`).join("; ");
        return [l.replace("{FLOOR_JOISTS}", up(`Floor joists: ${txt}`))];
      })
      .map((l) => issued(l.replace(/\{FC\}/g, fmt(cr.concrete.fc, 0)).replace(/\{ASCE\}/g, c.asce7)));
  const panel = (key: string, title = key): S0Panel => ({ title, kind: "notes", lines: fill(key) });

  // ---------------------------------------------------------------- codes and standards
  const jur = p.info.jurisdiction.trim();
  const codes = [
    `${c.building.split(" / ")[0]} (California Building Code${jur ? `), including the ${jur} amendments` : ")"}.`,
    `${c.residential.split(" / ")[0]} (California Residential Code), where applicable to one- and two-family dwellings and accessory structures.`,
    ...(rs.some((r) => JSON.stringify(r.input).includes('"existing"')) ||
    rs.some((r) => r.kind === "joist" && r.input.sister)
      ? [`${p.cycleId} CEBC (California Existing Building Code) for work on existing construction.`]
      : []),
    `ASCE/SEI ${c.asce7.replace("ASCE ", "")} for the determination of dead, live, roof, snow, wind and seismic loads.`,
    `ANSI/AWC ${c.nds} (National Design Specification for Wood Construction) with the ${c.ndsSupplement}.`,
    `ANSI/AWC ${c.sdpws} (Special Design Provisions for Wind and Seismic) for shear walls and diaphragms.`,
    ...(concrete
      ? [`${c.aci318} for structural concrete, including reinforcing details, anchorage and development lengths.`]
      : []),
    ...(cmu ? [`${c.tms402} for masonry construction.`] : []),
    ...(steel ? [`ANSI/${c.aisc360} for structural steel.`] : []),
    ...(has("cfsWall") ? ["AISI S100 / AISI S240 for cold-formed steel framing."] : []),
    "ASTM standards as referenced in these notes; ICC-ES evaluation reports (ESR) for all proprietary connectors, anchors, engineered lumber and panels.",
  ].map((s, i) => up(`${i + 1}. ${s}`));

  // ---------------------------------------------------------------- structural criteria
  const uses = new Map<string, string>();
  for (const m of p.members) {
    const add = (use?: string) => {
      if (!use) return;
      const l = liveLoad(use as Parameters<typeof liveLoad>[0], cr.liveBasis);
      uses.set(l.label, `${fmt(l.psf, 0)} PSF`);
    };
    if ("live" in m && m.live) add((m.live as { use?: string }).use);
    if (m.kind === "beam") for (const a of m.area) add(a.live?.use);
  }
  const presets = new Set(p.members.flatMap((x) => ("deflection" in x ? [x.deflection.preset] : [])));
  // subscripts written plainly as on the issued sheets (S_DS -> SDS)
  const r2 = (a: string, b: string): [string, string] => [up(a.replace(/_/g, "")), up(b)];
  const groups: Array<{ head: string; rows: Array<[string, string]> }> = [
    {
      head: `GRAVITY LOADS (${up(c.building.split(" / ")[0])} CH. 16 & ${c.asce7})`,
      rows: [
        r2("Risk category", cr.riskCategory),
        ...p.assemblies.map((a) => r2(`${a.name} dead`, `${fmt(assemblyDesignValue(a), 0)} psf`)),
        ...[...uses].map(([k, v]) => r2(`${k} live`, v)),
        r2("Roof live", `${fmt(cr.roofLive.L0, 0)} psf${cr.roofLive.reduce ? " (reducible)" : ""}`),
        r2("Ground snow, p_g", `${fmt(cr.snow.pg, 0)} psf`),
      ],
    },
    ...(presets.size
      ? [
          {
            head: "DEFLECTION CRITERIA",
            rows: Object.values(DEFLECTION_PRESETS)
              .filter((x) => presets.has(x.preset))
              .map((x) => r2(x.label, `L/${x.live} live, L/${x.total} total`)),
          },
        ]
      : []),
    {
      head: `SEISMIC DESIGN PARAMETERS (${c.asce7} CH. 11-12)`,
      rows: [
        r2("Risk category", cr.riskCategory),
        r2("Site class", cr.seismic.siteClass),
        r2("Seismic design category", cr.seismic.SDC),
        r2("S_DS / S_D1", `${fmt(cr.seismic.SDS, 3)} / ${fmt(cr.seismic.SD1, 3)}`),
        ...(L
          ? [
              r2("Importance factor, I_e", fmt(L.Ie, 2)),
              r2("Basic seismic-force-resisting system", L.system.label),
              r2("R / Ω0 / C_d", `${fmt(L.system.R, 1)} / ${fmt(L.system.Omega0, 1)} / ${fmt(L.system.Cd, 1)}`),
              r2("Seismic response coefficient, C_s", fmt(L.cs.Cs, 4)),
              r2("Design base shear, V (strength)", `${fmt(L.dist.V, 0)} lb`),
              r2("Redundancy factor, ρ", fmt(L.rho, 2)),
              r2(
                "Analysis procedure",
                L.seismicMethod === "simplified" ? "Simplified alternative (12.14)" : "Equivalent lateral force (12.8)",
              ),
            ]
          : []),
      ],
    },
    {
      head: `WIND DESIGN PARAMETERS (${c.asce7} CH. 26-30)`,
      rows: [
        r2("Basic wind speed, V (ultimate)", `${fmt(cr.wind.V, 0)} mph`),
        r2("Risk category", cr.riskCategory),
        r2("Exposure category", cr.wind.exposure),
        r2("Directionality factor, K_d", "0.85"),
        r2("Topographic factor, K_zt", fmt(cr.wind.Kzt, 2)),
        ...(L ? [r2("Mean roof height", `${fmt(L.h, 1)} ft`)] : []),
        r2("Enclosure / GC_pi", "Enclosed / ±0.18"),
        ...(L
          ? [r2("MWFRS procedure", L.windMethod === "directional" ? "Directional (Ch. 27)" : "Envelope (Ch. 28)")]
          : []),
        r2("Components and cladding", "Ch. 30"),
      ],
    },
    {
      head: "FOUNDATION",
      rows: [
        r2("Allowable soil bearing", `${fmt(cr.soil.bearing, 0)} psf`),
        r2("Basis", cr.soil.source),
        ...(concrete
          ? [
              r2("Concrete, f'c (28 days)", `${fmt(cr.concrete.fc, 0)} psi`),
              r2("Reinforcement", `ASTM A615 Gr. ${fmt(cr.concrete.fy / 1000, 0)}`),
            ]
          : []),
      ],
    },
  ];

  // ---------------------------------------------------------------- symbol legend
  const legend = new Map<string, string>();
  for (const r of rs) {
    const pre =
      r.mark
        .replace(/^\([EN]\)/, "")
        .replace(/^\d+/, "")
        .replace(/-?\d+[A-Z]?$/, "") || r.mark;
    if (!legend.has(pre)) legend.set(pre, up(r.title));
  }
  const hw = hardwareSchedule(p, d);
  for (const h of hw) if (!legend.has(up(h.model))) legend.set(up(h.model), up(h.description || h.model));
  for (const [k, v] of [
    ["PT", "PRESSURE-TREATED LUMBER"],
    ["TYP", "TYPICAL"],
    ["U.N.O.", "UNLESS NOTED OTHERWISE"],
    ["(E)", "EXISTING"],
    ["(N)", "NEW"],
  ])
    legend.set(k, v);

  // ---------------------------------------------------------------- nailing (designed)
  const nailing: string[][] = [];
  for (const r of rs) {
    if (r.kind === "shearWall")
      for (const s of r.sides)
        nailing.push([
          r.mark,
          `Shear wall sheathing - ${s.row.label}`,
          s.row.nail,
          `${s.spacing} in. edges / 12 in. field, blocked`,
        ]);
    if (r.kind === "diaphragm")
      nailing.push([r.mark, "Diaphragm sheathing", r.callout, r.input.blocked ? "Blocked" : "Unblocked"]);
    if (r.kind === "transfer") nailing.push([r.mark, "Shear transfer", r.callout, "Full length of the shear wall"]);
    if (r.kind === "beam" && r.input.plyConnection && r.input.material.kind !== "glulam")
      nailing.push([
        r.mark,
        "Built-up plies",
        plyText(r.input.plyConnection),
        `${fmt(r.input.plyConnection.spacing, 0)} in. o.c., staggered`,
      ]);
    if (r.kind === "joist" && r.input.sister?.connection)
      nailing.push([
        r.mark,
        "Sister joist to existing",
        plyText(r.input.sister.connection),
        `${fmt(r.input.sister.connection.spacing, 0)} in. o.c.`,
      ]);
    if (r.kind === "ceilingJoist" && r.input.heel)
      nailing.push([
        r.mark,
        "Rafter to ceiling joist (heel)",
        `${r.input.heel.count}-${nailDef(r.input.heel.nail).label}`,
        "Face nail each heel",
      ]);
  }
  // one row per identical connection, listing every mark that uses it
  const merged = new Map<string, string[]>();
  for (const [mark, ...rest] of nailing) {
    const key = rest.join("\u0000");
    merged.set(key, [...(merged.get(key) ?? []), mark]);
  }
  const nailingRows = [...merged].map(([key, marks]) => [marks.join(", "), ...key.split("\u0000")].map(up));

  // ---------------------------------------------------------------- shear wall schedule
  const walls = rs.flatMap((r) => (r.kind === "shearWall" ? [r] : []));
  const wallRows = walls.map((r) =>
    [
      r.mark,
      r.sides.map((s) => s.row.label).join(" + "),
      r.sides.map((s) => `${s.row.nail} @ ${s.spacing}/12`).join(" + "),
      r.rod ? "Continuous rod" : r.holdown ? `${r.holdown.item.model} (${r.post.label})` : "-",
      `${fmt(r.input.sill.d, 3)} in. dia. ${r.input.sill.type === "post-installed" ? "adhesive anchor" : "A.B."} @ ${fmt(r.input.sill.spacing, 0)} in. o.c., ${fmt(r.input.sill.embed, 0)} in. emb.`,
    ].map(up),
  );

  // ---------------------------------------------------------------- hardware schedule
  const hardware = hw.map((h) =>
    [`${h.manufacturer} ${h.model}`.trim(), h.description, h.fasteners || "Per manufacturer", h.usedAt.join("; ")].map(
      up,
    ),
  );

  // generated sections not already covered by the standard text
  const covered = new Set([
    "Codes and design criteria",
    "Foundations and concrete",
    "Wood framing",
    "Connectors",
    "General",
  ]);
  const extra: S0Panel[] = gen.sections
    .filter((s) => !covered.has(s.title))
    .map((s) => ({
      title: up(`${s.title} notes`),
      kind: "notes",
      lines: s.notes.map((n, i) => up(issued(`${i + 1}. ${n}`))),
    }));

  const index: Array<[string, string]> = (p.drawingIndex ?? []).length
    ? p.drawingIndex!.map((s) => [up(s.number), up(s.title)])
    : [["S-0", "GENERAL NOTES AND SPECIFICATIONS"]];

  const all: S0Panel[] = [
    ...(concrete
      ? [
          panel("REINFORCED CONCRETE NOTES"),
          {
            title: "REINFORCED CONCRETE LAP SPLICE SCHEDULE",
            kind: "table" as const,
            caption: `F'C = ${fmt(cr.concrete.fc, 0)} PSI AT 28 DAYS - LAP LENGTH (INCHES)`,
            head: ["SPLICE CLASS", "LOCATION", "#3", "#4", "#5", "#6", "#7", "#8"],
            widths: [0.17, 0.19, 0.11, 0.11, 0.11, 0.11, 0.1, 0.1],
            rows: lapSpliceTable(cr.concrete.fc, cr.concrete.fy),
            foot: [
              `TENSION LAP SPLICES PER ${c.aci318} 25.4.2.3 AND 25.5.2, GRADE ${fmt(cr.concrete.fy / 1000, 0)} UNCOATED BARS, NORMAL-WEIGHT CONCRETE. CLEAR SPACING AND COVER NOT LESS THAN d_b. TOP BARS: MORE THAN 12 IN. OF FRESH CONCRETE CAST BELOW THE SPLICE. USE CLASS B UNLESS NOTED OTHERWISE.`,
            ],
          },
        ]
      : []),
    { title: "SYMBOL LEGEND", kind: "table", head: ["SYMBOL", "DESCRIPTION"], widths: [0.28, 0.72], rows: [...legend] },
    panel("SITE DRAINAGE RECOMMENDATIONS"),
    ...(has("truss", "woodTruss") ? [panel("ENGINEERED WOOD TRUSSES/RAFTER")] : []),
    { title: "CODES AND STANDARDS", kind: "notes", lines: [...codes, ...fill("CODES AND STANDARDS NOTES")] },
    { title: "STRUCTURAL CRITERIA", kind: "criteria", groups, foot: fill("STRUCTURAL CRITERIA NOTES") },
    panel("NAILING SCHEDULE"),
    ...(nailingRows.length
      ? [
          {
            title: "NAILING SCHEDULE - DESIGNED CONNECTIONS",
            kind: "table" as const,
            head: ["MARK", "CONNECTION", "FASTENER", "SPACING"],
            widths: [0.15, 0.31, 0.27, 0.27],
            rows: nailingRows,
          },
        ]
      : []),
    {
      title: "FASTENING SCHEDULE - TYPICAL FRAMING",
      kind: "table",
      head: ["CONNECTION", "FASTENER", "LOCATION / SPACING"],
      widths: [0.44, 0.27, 0.29],
      rows: TYPICAL_NAILING.map((r) => r.map(up)),
      foot: [
        `COMMON WIRE NAILS PER ${up(c.building.split(" / ")[0])} TABLE 2304.10.2 / ${up(c.residential.split(" / ")[0])} TABLE R602.3(1) UNLESS NOTED. SCHEDULED CONNECTIONS ON THE PLANS AND CALCULATIONS GOVERN.`,
      ],
    },
    panel("WOOD FRAMING NOTES"),
    ...(wallRows.length
      ? [
          {
            title: "SHEAR WALL SCHEDULE",
            kind: "table" as const,
            head: ["MARK", "SHEATHING", "EDGE / FIELD NAILING", "HOLDOWN", "SILL ANCHOR"],
            widths: [0.12, 0.25, 0.23, 0.18, 0.22],
            rows: wallRows,
            foot: [
              "ALL PANEL EDGES BLOCKED. 3/8 IN. MIN. NAIL EDGE DISTANCE. SILL ANCHORS WITH 3 IN. X 3 IN. X 0.229 IN. PLATE WASHERS. HOLDOWNS PER MANUFACTURER WITH ALL SPECIFIED FASTENERS.",
            ],
          },
        ]
      : []),
    ...(hardware.length
      ? [
          {
            title: "HARDWARE SCHEDULE",
            kind: "table" as const,
            head: ["PRODUCT", "DESCRIPTION", "FASTENERS", "LOCATION"],
            widths: [0.22, 0.24, 0.26, 0.28],
            rows: hardware,
            foot: [
              "INSTALL ALL CONNECTORS WITH THE FULL NUMBER AND SIZE OF FASTENERS LISTED BY THE MANUFACTURER. SUBSTITUTIONS REQUIRE THE ENGINEER'S APPROVAL.",
            ],
          },
        ]
      : []),
    ...extra,
    ...(gen.inspections.length
      ? [
          {
            title: `SPECIAL INSPECTIONS (${up(c.building.split(" / ")[0])} CH. 17)`,
            kind: "table" as const,
            head: ["ITEM", "TYPE", "MEMBERS"],
            widths: [0.55, 0.2, 0.25],
            rows: gen.inspections.map((i) => [i.item, i.type, i.members].map(up)),
          },
        ]
      : []),
    ...(gen.deferred.length
      ? [
          {
            title: "DEFERRED SUBMITTALS",
            kind: "notes" as const,
            lines: gen.deferred.map((s, i) => up(`${i + 1}. ${s}`)),
          },
        ]
      : []),
    { title: "DRAWING INDEX", kind: "table", head: ["NO.", "DRAWING INDEX"], widths: [0.2, 0.8], rows: index },
    panel("GENERAL STRUCTURAL NOTES"),
    panel("GENERAL NOTES"),
    panel("MISCELLANEOUS"),
    ...(p.notes.trim()
      ? [
          {
            title: "PROJECT NOTES",
            kind: "notes" as const,
            lines: p.notes
              .split(/\n+/)
              .map((l) => up(issued(l).trim()))
              .filter(Boolean),
          },
        ]
      : []),
  ];
  const panels = all.filter((x) => x.kind !== "notes" || x.lines.length);

  return { panels, index, sheetNo: index[0][0] };
}
