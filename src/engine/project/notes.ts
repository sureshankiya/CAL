/**
 * General / specific notes generator and the consolidated hardware schedule.
 *
 * General notes are assembled from what the project actually contains (codes from the
 * cycle, criteria, materials used by the designed members, special inspections that the
 * member types trigger, deferred submittals), so the notes sheet and the calculation
 * sheets cannot disagree. Specific notes come from each member's flags; field
 * verification items come from every assumption marked VERIFY. Notes that rely on
 * code sections are worded at section level and listed for the EOR's confirmation.
 */

import { getCycle } from "../core/codes";
import { fmt } from "../core/fmt";
import type { AnyResult, ProjectDesign } from "./design";
import type { Project } from "./schema";

export interface NoteSection {
  title: string;
  notes: string[];
}

export interface InspectionRow {
  item: string;
  basis: string;
  type: "Continuous" | "Periodic" | "Per ICC-ES report";
  members: string;
}

export interface HardwareRow {
  model: string;
  description: string;
  manufacturer: string;
  fasteners: string;
  report: string;
  usedAt: string[];
  maxRatio: number;
  checked: boolean;
}

export interface GeneratedNotes {
  sections: NoteSection[];
  inspections: InspectionRow[];
  deferred: string[];
  fieldVerify: Array<{ mark: string; item: string; value: string }>;
  specific: Array<{ mark: string; note: string }>;
}

const results = (d: ProjectDesign) => [...d.outcomes.values()].map((o) => o.result).filter((r): r is AnyResult => !!r);

export function generateNotes(p: Project, d: ProjectDesign): GeneratedNotes {
  const c = getCycle(p.cycleId);
  const rs = results(d);
  const has = (...k: AnyResult["kind"][]) => rs.some((r) => k.includes(r.kind));
  const of = <K extends AnyResult["kind"]>(k: K) =>
    rs.filter((r): r is Extract<AnyResult, { kind: K }> => r.kind === k);
  const marks = (k: AnyResult["kind"][]) =>
    rs
      .filter((r) => k.includes(r.kind))
      .map((r) => r.mark)
      .join(", ");
  const crit = p.criteria;
  const sections: NoteSection[] = [];

  sections.push({
    title: "Codes and design criteria",
    notes: [
      `Codes: ${c.building}; ${c.residential}; ${c.asce7}; ANSI/AWC ${c.nds} with ${c.ndsSupplement}; ${c.sdpws}${has("footing", "masonryWall", "holdownFooting", "tieIn", "basePlate", "retainingWall") ? `; ${c.aci318}` : ""}${of("masonryWall").some((r) => r.input.material === "cmu") || of("retainingWall").some((r) => r.input.stem.material === "cmu") ? `; ${c.tms402}` : ""}${has("guardPost") ? `; ${c.aisc360} (bolts)` : ""}${has("steelBeam", "steelColumn", "basePlate") ? `; ${c.aisc360}` : ""}.`,
      `Risk Category ${crit.riskCategory}. Roof live load ${fmt(crit.roofLive.L0, 0)} psf${crit.roofLive.reduce ? " (reduced per ASCE 7 §4.8 where permitted)" : ""}; ground snow load p_g = ${fmt(crit.snow.pg, 0)} psf.`,
      `Wind: V = ${fmt(crit.wind.V, 0)} mph (ultimate), Exposure ${crit.wind.exposure}, K_zt = ${fmt(crit.wind.Kzt, 2)}.`,
      `Seismic: S_DS = ${fmt(crit.seismic.SDS, 3)}, S_D1 = ${fmt(crit.seismic.SD1, 3)}, Site Class ${crit.seismic.siteClass}, Seismic Design Category ${crit.seismic.SDC}${d.lateral ? `; ${d.lateral.system.label}, R = ${fmt(d.lateral.system.R, 1)}, Ω0 = ${fmt(d.lateral.system.Omega0, 1)}, C_d = ${fmt(d.lateral.system.Cd, 1)}` : ""}.`,
      `Allowable soil bearing pressure ${fmt(crit.soil.bearing, 0)} psf (${crit.soil.source}).`,
      "Design loads as listed on the design criteria and loads sheets. Dead loads include the framing allowance stated in each assembly.",
    ],
  });

  if (has("footing", "holdownFooting", "masonryWall", "tieIn", "basePlate", "retainingWall")) {
    const conc = of("masonryWall").filter((r) => r.input.material === "concrete");
    sections.push({
      title: "Foundations and concrete",
      notes: [
        "Footings bear on undisturbed native soil or engineered fill compacted to at least 90 % relative compaction (ASTM D1557) unless the soils report requires more; bottom of footings at least 12 in. below lowest adjacent grade (IBC 1809.4) or below frost depth.",
        `Concrete: f'c = ${fmt(crit.concrete.fc, 0)} psi at 28 days${conc.length ? ` (walls ${[...new Set(conc.map((r) => fmt(r.input.concrete!.fc, 0)))].join(" / ")} psi)` : ""}, normal weight, mix per ACI 318 Ch. 19 for the exposure classes on the drawings; maximum aggregate 3/4 in.`,
        `Reinforcing steel: ASTM A615 Grade ${fmt(crit.concrete.fy / 1000, 0)}, deformed; clear cover ${fmt(crit.concrete.cover, 0)} in. for concrete cast against earth, 1-1/2 in. (No. 5 and smaller) for formed surfaces exposed to earth or weather (ACI 318 20.5.1.3); lap splices and hooks per ACI 318 Ch. 25.`,
        "Anchor bolts and hold-down anchors: set and tied in place before concrete is placed; do not wet-set.",
        "Contractor to verify all existing foundations to remain and report damage or discrepancies to the Engineer of Record before construction.",
      ],
    });
  }

  if (p.slab) {
    const s = p.slab;
    sections.push({
      title: "Slab on grade",
      notes: [
        `Slab on grade: ${fmt(s.thickness, 1)} in. thick concrete (CRC R506.1 minimum 3-1/2 in.), reinforced with ${s.reinforcement}${s.reinforcement.toLowerCase().includes("none") ? "" : " placed at mid-depth on chairs"}.`,
        `Under the slab: ${s.vaporRetarder} vapor retarder with lapped and taped joints over ${s.base} (CRC R506.2.2, R506.2.3; CALGreen 4.505.2 capillary break where required).`,
        `Control (contraction) joints ${s.joints}; isolation joints at columns and walls.`,
        "Thickened slab under posts and point loads as shown on the plans and on the thickened-slab sheets.",
      ],
    });
  }

  const rws = of("retainingWall");
  if (rws.length) {
    const seis = rws.filter((r) => r.input.soil.seismic && r.input.soil.seismic.k > 0);
    sections.push({
      title: "Retaining walls",
      notes: [
        `Retaining walls ${rws.map((r) => r.mark).join(", ")} are designed for an active equivalent fluid pressure of ${[...new Set(rws.map((r) => fmt(r.input.soil.efp, 0)))].join(" / ")} pcf with level, free-draining backfill${rws.some((r) => r.input.soil.surcharge > 0) ? ` and the surcharge shown on the sheets` : ""}${seis.length ? `, plus the seismic earth-pressure increment from the geotechnical report (${seis.map((r) => r.mark).join(", ")})` : ""}. No hydrostatic pressure is included.`,
        "Provide a 12 in. minimum width of free-draining gravel behind the stem, filter fabric, and a 4 in. perforated drain pipe at the heel sloped to daylight or weep holes at 8 ft o.c. maximum; waterproof the retained face where it encloses usable space.",
        "Do not place backfill until the stem concrete has reached 75 % of f'c (or the grout has cured 7 days for CMU stems) and any bracing or the restraining floor is in place; compact backfill in 8 in. lifts with hand-operated equipment within 3 ft of the stem.",
        "Stem dowels with standard hooks into the footing as scheduled, lapped with the stem bars; shear keys are not used unless shown.",
      ],
    });
  }

  const deck =
    has("guardPost") ||
    rs.some(
      (r) =>
        (r.kind === "joist" || r.kind === "beam" || r.kind === "ledger") && JSON.stringify(r.input).includes('"deck"'),
    );
  if (deck)
    sections.push({
      title: "Exterior decks",
      notes: [
        "Deck framing: preservative-treated lumber per AWPA U1 (UC4A for posts and members in ground contact), incised where so noted on the sheets; design values include wet service and incising factors.",
        `Fasteners and connectors in treated wood: hot-dip galvanized (ASTM A153 / A653 G185) or stainless steel (${c.residential} R317.3).`,
        `Ledger: flashed at the house rim, attached with the bolts / lags and spacing on the ledger sheet; no attachment through siding or to brick veneer; deck lateral load connection per ${c.residential} R507.9.2 or as detailed.`,
        "Guard posts: through-bolted to the rim / end joist with the tension devices scheduled on the guard post sheets; do not notch guard posts.",
      ],
    });

  const cmu = of("masonryWall").filter((r) => r.input.material === "cmu");
  if (cmu.length)
    sections.push({
      title: "Masonry",
      notes: [
        `Concrete masonry units: ASTM C90, ${[...new Set(cmu.map((r) => `${fmt(r.input.t, 3).replace(/0+$/, "").replace(/\.$/, "")} in.`))].join(" / ")} nominal width units, running bond, fully grouted (${cmu.map((r) => r.mark).join(", ")}).`,
        `Specified compressive strength f'm = ${[...new Set(cmu.map((r) => fmt(r.input.cmu!.fm, 0)))].join(" / ")} psi (${cmu[0].input.cmu!.fmSource}); mortar ASTM C270 Type ${[...new Set(cmu.map((r) => r.input.cmu!.mortar))].join(" / ")}; grout ASTM C476, f'g not less than f'm nor 2,000 psi.`,
        "Reinforcement per TMS 602: vertical bars centred in grouted cells unless detailed otherwise, held in position at top, bottom and at 200 bar diameters maximum; bond beams at the top of walls and at floor and roof lines; lap splices per TMS 402.",
        "Cleanouts at the bottom of grout pours over 5 ft; grout lifts and pour heights per TMS 602 Table 3.",
      ],
    });

  const wood = has(
    "joist",
    "rafter",
    "ceilingJoist",
    "ijoist",
    "beam",
    "wall",
    "post",
    "shearWall",
    "ledger",
    "woodTruss",
    "diaphragm",
    "guardPost",
  );
  if (wood)
    sections.push({
      title: "Wood framing",
      notes: [
        "Sawn lumber: grade-stamped by an approved agency, moisture content 19 % or less at installation; species and grade as scheduled.",
        ...(rs.some((r) => r.kind === "beam" && r.input.material.kind === "glulam")
          ? ["Glued laminated timber per ANSI A190.1 with an APA / AITC trademark; camber and grade as scheduled."]
          : []),
        ...(rs.some((r) => r.kind === "beam" && r.input.material.kind === "scl")
          ? [
              "Structural composite lumber (LVL / PSL / LSL) per the manufacturer's ICC-ES evaluation report; multi-ply members fastened per the manufacturer.",
            ]
          : []),
        ...(has("ijoist")
          ? [
              "Prefabricated wood I-joists: install, block and stiffen per the manufacturer's ICC-ES report and literature; no field cuts in flanges; web holes only per the manufacturer's hole chart.",
            ]
          : []),
        `Fastening per ${c.residential} Table R602.3(1) and ${c.building} Table 2304.10.2 unless noted otherwise; nails are common wire nails unless noted.`,
        "Wood in contact with concrete or masonry, or within 8 in. of earth: preservative-treated per AWPA U1; fasteners and connectors in treated wood hot-dip galvanized (ASTM A153) or stainless steel.",
        ...(has("shearWall")
          ? [
              "Shear walls: wood structural panels APA-rated, all panel edges blocked, edge and field nailing as scheduled, 3/8 in. minimum edge distance; sill anchor bolts with 3 in. × 3 in. × 0.229 in. plate washers (SDPWS 4.3.6.4.3) unless noted; hold-downs installed per the manufacturer with the specified fasteners.",
            ]
          : []),
        ...(has("diaphragm")
          ? [
              "Roof and floor sheathing as scheduled on the diaphragm schedule; stagger panel joints; boundary and edge nailing as scheduled.",
            ]
          : []),
      ],
    });

  const cfs = of("cfsWall");
  if (cfs.length)
    sections.push({
      title: "Cold-formed steel framing",
      notes: [
        `Cold-formed steel studs and tracks: ASTM A1003, G60 coating minimum (G90 at exterior walls), sizes and yield strength as scheduled (${cfs.map((r) => r.mark).join(", ")}); member designations per SSMA / AISI S201.`,
        "Design and installation per AISI S100 and AISI S240; bridging, blocking, jamb and header framing at openings and track fastening per the manufacturer and the details.",
        "Screws: self-drilling, ASTM C1513, size and spacing as detailed; penetrate at least three exposed threads.",
      ],
    });

  if (has("steelBeam", "steelColumn", "basePlate"))
    sections.push({
      title: "Structural steel",
      notes: [
        "W and C shapes ASTM A992 (W) / A36 (C); HSS ASTM A500 Grade C (round and rectangular as scheduled); plates and bars ASTM A36; anchor rods ASTM F1554 Grade 36 with heavy hex nuts and hardened washers unless noted.",
        "Welding by AWS D1.1 certified welders with E70XX electrodes; welds as shown on the details.",
        "Base plates on non-shrink, non-metallic grout (5,000 psi minimum) where grouted; steel exposed to weather hot-dip galvanized or shop primed and painted.",
      ],
    });

  if (has("connector", "shearWall", "uplift", "transfer"))
    sections.push({
      title: "Connectors",
      notes: [
        "Connectors, hangers, straps and hold-downs: Simpson Strong-Tie or approved equal with a current ICC-ES report and equal or greater capacity; fill all specified fastener holes; see the hardware schedule.",
      ],
    });

  if (has("tieIn") || rs.some((r) => r.kind === "shearWall" && r.input.sill.type === "post-installed"))
    sections.push({
      title: "Post-installed anchors and dowels",
      notes: [
        "Post-installed adhesive anchors and dowels: products, hole size, embedment, cleaning and cure per the ICC-ES report listed on the tie-in schedule; substitutions require the Engineer of Record's approval with calculations.",
        "Existing concrete strength assumed as stated on the tie-in sheets; locate existing reinforcement before drilling and do not cut existing bars without approval.",
      ],
    });

  // special inspections (IBC Ch. 17)
  const inspections: InspectionRow[] = [];
  if (has("footing", "holdownFooting", "masonryWall", "retainingWall"))
    inspections.push({
      item: "Concrete: reinforcement placement, anchor bolts / hold-down anchors before placement, concrete sampling",
      basis: "IBC 1705.3 and Table 1705.3 (exceptions for light-frame footings per 1705.3 to be confirmed)",
      type: "Periodic",
      members: marks(["footing", "holdownFooting", "masonryWall", "retainingWall"]),
    });
  if (rws.length)
    inspections.push({
      item: "Soils: bearing material under retaining-wall footings, backfill placement and compaction, drainage",
      basis: "IBC 1705.6 and Table 1705.6 (geotechnical engineer of record)",
      type: "Periodic",
      members: rws.map((r) => r.mark).join(", "),
    });
  if (cmu.length)
    inspections.push({
      item: "Masonry: reinforcement, grout space, grout placement, prism / unit strength verification",
      basis: "IBC 1705.4; TMS 602 Tables 3 and 4 (Level per risk category)",
      type: "Periodic",
      members: cmu.map((r) => r.mark).join(", "),
    });
  if (has("tieIn") || rs.some((r) => r.kind === "shearWall" && r.input.sill.type === "post-installed"))
    inspections.push({
      item: "Post-installed adhesive anchors and dowels",
      basis:
        "IBC 1705.1.1 and the ICC-ES report (continuous for sustained-tension adhesive anchors installed horizontally or overhead)",
      type: "Per ICC-ES report",
      members: marks(["tieIn"]),
    });
  if (has("steelBeam", "steelColumn", "basePlate"))
    inspections.push({
      item: "Structural steel: welding, bolting, anchor rods",
      basis: "IBC 1705.2; AISC 360 Ch. N",
      type: "Periodic",
      members: marks(["steelBeam", "steelColumn", "basePlate"]),
    });
  const tightNailing = of("shearWall").filter((r) => r.sides.some((s) => s.spacing <= 4));
  if (tightNailing.length && ["C", "D", "E", "F"].includes(crit.seismic.SDC))
    inspections.push({
      item: "Wood shear walls with edge nailing at 4 in. o.c. or less: nailing, bolting, anchoring and hold-downs",
      basis: "IBC 1705.12.2 (seismic) / 1705.11.1 (wind, where required); exceptions per 1705.12.2 to be confirmed",
      type: "Periodic",
      members: tightNailing.map((r) => r.mark).join(", "),
    });

  const deferred: string[] = [];
  if (has("truss"))
    deferred.push(
      `Prefabricated wood trusses (${marks(["truss"])}): truss design drawings and calculations by the manufacturer, reviewed by the Engineer of Record before submittal to the building official.`,
    );
  if (of("woodTruss").some((r) => r.input.joint.type === "plate"))
    deferred.push(
      `Metal plate connectors for trusses ${of("woodTruss")
        .filter((r) => r.input.joint.type === "plate")
        .map((r) => r.mark)
        .join(", ")}: plate sizes by the truss plate manufacturer per TPI 1.`,
    );

  const fieldVerify: GeneratedNotes["fieldVerify"] = [];
  const specific: GeneratedNotes["specific"] = [];
  for (const r of rs) {
    for (const a of r.assumptions) if (a.verify) fieldVerify.push({ mark: r.mark, item: a.item, value: a.value });
    for (const f of r.flags) specific.push({ mark: r.mark, note: f });
  }
  sections.push({
    title: "General",
    notes: [
      "Contractor to verify all dimensions and existing conditions; report discrepancies to the Engineer of Record before proceeding.",
      "Temporary bracing and shoring during construction are the contractor's responsibility.",
    ],
  });
  return { sections, inspections, deferred, fieldVerify, specific };
}

/** Consolidated hardware schedule: every catalogue item the design uses, where, and its governing D/C. */
export function hardwareSchedule(p: Project, d: ProjectDesign): HardwareRow[] {
  const rows = new Map<string, HardwareRow>();
  const add = (id: string | undefined, where: string, ratio: number) => {
    if (!id) return;
    const h = p.hardware.find((x) => x.id === id);
    if (!h) return;
    const row = rows.get(id) ?? {
      model: h.model,
      description: h.description,
      manufacturer: h.manufacturer,
      fasteners: h.fasteners,
      report: h.report,
      usedAt: [],
      maxRatio: 0,
      checked: !!h.checked,
    };
    if (!row.usedAt.includes(where)) row.usedAt.push(where);
    row.maxRatio = Math.max(row.maxRatio, Number.isFinite(ratio) ? ratio : 0);
    rows.set(id, row);
  };
  for (const r of results(d)) {
    switch (r.kind) {
      case "connector":
        add(
          r.item.id,
          `${r.mark} (${r.input.sourceMark} ${r.input.supportName}${r.input.quantity > 1 ? `, ${r.input.quantity} per bearing` : ""})`,
          r.governing.ratio,
        );
        break;
      case "shearWall":
        if (r.holdown) add(r.holdown.item.id, `${r.mark} hold-downs`, r.holdown.ratio);
        if (r.ftao?.strap) add(r.ftao.strap.item.id, `${r.mark} opening straps`, r.ftao.strap.ratio);
        break;
      case "diaphragm":
        if (r.input.chord.splice.type === "strap")
          add(r.input.chord.splice.strapId, `${r.mark} chord splices`, r.governing.ratio);
        break;
      case "transfer":
        if (r.input.connector.type === "clip")
          add(r.input.connector.hardwareId, `${r.mark} @ ${fmt(r.input.spacing, 0)} in. o.c.`, r.governing.ratio);
        break;
      case "uplift":
        r.input.levels.forEach((l, i) => {
          if (l.connector.type === "hardware")
            add(l.connector.hardwareId, `${r.mark} ${l.label} @ ${fmt(l.spacing, 0)} in. o.c.`, r.rows[i]?.ratio ?? 0);
        });
        break;
    }
  }
  return [...rows.values()].sort((a, b) => a.model.localeCompare(b.model));
}
