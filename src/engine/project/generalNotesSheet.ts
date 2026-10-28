/**
 * Content of the S0.0 general notes drawing sheet, assembled from the project and its design so
 * the sheet agrees with the calculations: drawing index, codes and standards, structural design
 * criteria, general notes (notes engine), project nailing (from the designed members) plus the
 * typical fastening table, hardware schedule, special inspections and deferred submittals.
 */

import { getCycle } from "../core/codes";
import { fmt } from "../core/fmt";
import { TYPICAL_NAILING } from "../data/nailing";
import { nailDef } from "../design/dowel";
import type { PlyConnectionInput } from "../design/plies";
import { DEFLECTION_PRESETS } from "../loads/deflection";
import { liveLoad } from "../loads/live";
import type { AnyResult, ProjectDesign } from "./design";
import { issuedNoteLine } from "./drawingData";
import { generateNotes, hardwareSchedule, type NoteSection } from "./notes";
import type { Project } from "./schema";

export interface GeneralNotesSheet {
  index: Array<[string, string]>;
  codes: string[];
  criteria: Array<[string, string]>;
  notes: NoteSection[];
  /** location, connection, fastener, spacing */
  nailing: string[][];
  typicalNailing: Array<[string, string, string]>;
  /** model, description, fasteners, used at */
  hardware: string[][];
  /** item, type, members */
  inspections: string[][];
  deferred: string[];
}

const plyText = (c: PlyConnectionInput) =>
  c.fastener === "nail"
    ? `${c.rows} rows ${nailDef(c.nail ?? "16d-common").label}`
    : `${c.rows} rows ${fmt(c.boltDia ?? 0.5, 3)} in. dia. through-bolts`;

export function generalNotesSheet(p: Project, d: ProjectDesign): GeneralNotesSheet {
  const c = getCycle(p.cycleId);
  const rs = [...d.outcomes.values()].flatMap((o) => (o.result ? [o.result] : []));
  const has = (...k: AnyResult["kind"][]) => rs.some((r) => k.includes(r.kind));
  const cr = p.criteria;
  const L = d.lateral;
  const gen = generateNotes(p, d);

  const index: Array<[string, string]> = (p.drawingIndex ?? []).length
    ? p.drawingIndex!.map((s) => [s.number, s.title])
    : [["S0.0", "General notes"]];

  const codes = [
    `${c.building} — building code`,
    `${c.residential} — residential code`,
    `${c.asce7} — Minimum Design Loads and Associated Criteria for Buildings and Other Structures`,
    `ANSI/AWC ${c.nds} — National Design Specification for Wood Construction, with the ${c.ndsSupplement}`,
    `ANSI/AWC ${c.sdpws} — Special Design Provisions for Wind and Seismic`,
    ...(has("footing", "holdownFooting", "masonryWall", "tieIn", "basePlate", "retainingWall", "shearWall")
      ? [`${c.aci318} — Building Code Requirements for Structural Concrete`]
      : []),
    ...(has("steelBeam", "steelColumn", "basePlate", "steelTruss", "guardPost")
      ? [`ANSI/${c.aisc360} — Specification for Structural Steel Buildings`]
      : []),
    ...(rs.some(
      (r) =>
        (r.kind === "masonryWall" && r.input.material === "cmu") ||
        (r.kind === "retainingWall" && r.input.stem.material === "cmu"),
    )
      ? [`${c.tms402} — Building Code Requirements and Specification for Masonry Structures`]
      : []),
    ...(has("cfsWall") ? ["AISI S100 — North American Specification for Cold-Formed Steel Structural Members"] : []),
    "ICC-ES evaluation reports of the products specified (connectors, anchors, engineered lumber, panels)",
  ];

  const uses = new Map<string, string>();
  for (const m of p.members) {
    const add = (use?: string) => {
      if (!use) return;
      const l = liveLoad(use as Parameters<typeof liveLoad>[0], cr.liveBasis);
      uses.set(l.label, `${fmt(l.psf, 0)} psf`);
    };
    if ("live" in m && m.live) add((m.live as { use?: string }).use);
    if (m.kind === "beam") for (const a of m.area) add(a.live?.use);
  }
  const presets = new Set(p.members.flatMap((x) => ("deflection" in x ? [x.deflection.preset] : [])));
  const criteria: Array<[string, string]> = [
    ["Risk Category", cr.riskCategory],
    ...[...uses].map(([k, v]): [string, string] => [`Live load — ${k}`, v]),
    [
      "Roof live load",
      `${fmt(cr.roofLive.L0, 0)} psf${cr.roofLive.reduce ? " (reduced where permitted, ASCE 7 §4.8)" : ""}`,
    ],
    [
      "Snow",
      cr.snow.pg > 0
        ? `p_g = ${fmt(cr.snow.pg, 0)} psf; C_e = ${fmt(cr.snow.Ce, 2)}; C_t = ${fmt(cr.snow.Ct, 2)}${c.snowIncludesIs ? `; I_s = ${fmt(cr.snow.Is, 2)}` : ""}`
        : "p_g = 0 psf",
    ],
    [
      "Wind",
      `V = ${fmt(cr.wind.V, 0)} mph (ultimate); Exposure ${cr.wind.exposure}; K_zt = ${fmt(cr.wind.Kzt, 2)}; K_d = 0.85; enclosed, GC_pi = ±0.18${L ? `; MWFRS ${L.windMethod === "directional" ? "Ch. 27 directional" : "Ch. 28 envelope"} procedure` : ""}`,
    ],
    [
      "Seismic",
      `S_DS = ${fmt(cr.seismic.SDS, 3)}; S_D1 = ${fmt(cr.seismic.SD1, 3)}; Site Class ${cr.seismic.siteClass}; SDC ${cr.seismic.SDC}${L ? `; I_e = ${fmt(L.Ie, 2)}` : ""}`,
    ],
    ...(L
      ? ([
          [
            "Seismic force-resisting system",
            `${L.system.label}; R = ${fmt(L.system.R, 1)}, Ω0 = ${fmt(L.system.Omega0, 1)}, C_d = ${fmt(L.system.Cd, 1)}`,
          ],
          [
            "Seismic analysis",
            `${L.seismicMethod === "simplified" ? "ASCE 7 §12.14 simplified alternative" : "ASCE 7 §12.8 equivalent lateral force"}; C_s = ${fmt(L.cs.Cs, 4)}; V = ${fmt(L.dist.V, 0)} lb (strength); ρ = ${fmt(L.rho, 2)}`,
          ],
        ] as Array<[string, string]>)
      : []),
    ...Object.values(DEFLECTION_PRESETS)
      .filter((x) => presets.has(x.preset))
      .map((x): [string, string] => [`Deflection — ${x.label}`, `L/${x.live} live; L/${x.total} total`]),
    ["Allowable soil bearing", `${fmt(cr.soil.bearing, 0)} psf (${cr.soil.source})`],
    ...(has("footing", "holdownFooting", "masonryWall", "tieIn", "retainingWall")
      ? ([
          [
            "Concrete / reinforcement",
            `f'c = ${fmt(cr.concrete.fc, 0)} psi; ASTM A615 Grade ${fmt(cr.concrete.fy / 1000, 0)}`,
          ],
        ] as Array<[string, string]>)
      : []),
  ];

  const nailing: string[][] = [];
  for (const r of rs) {
    if (r.kind === "shearWall")
      for (const s of r.sides)
        nailing.push([
          r.mark,
          `Shear wall sheathing — ${s.row.label}`,
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
  const nailingRows = [...merged].map(([key, marks]) => [marks.join(", "), ...key.split("\u0000")]);

  const hardware = hardwareSchedule(p, d).map((h) => [
    `${h.manufacturer} ${h.model}`.trim(),
    h.description,
    h.fasteners || "Per manufacturer",
    h.usedAt.join("; "),
  ]);

  return {
    index,
    codes,
    criteria,
    notes: [
      ...gen.sections.filter((s) => s.title !== "Codes and design criteria"),
      ...(p.notes.trim()
        ? [
            {
              title: "Project notes",
              notes: p.notes
                .split(/\n+/)
                .map((l) => ((p.info.issue ?? "final") === "final" ? issuedNoteLine(l) : l).trim())
                .filter(Boolean),
            },
          ]
        : []),
    ],
    nailing: nailingRows,
    typicalNailing: TYPICAL_NAILING,
    hardware,
    inspections: gen.inspections.map((i) => [i.item, i.type, i.members]),
    deferred: gen.deferred,
  };
}
