/**
 * Validation project (plan §14, Phase 4 exit): 1109 San Miguel Avenue, Spring Valley, CA —
 * master-bedroom addition to an existing house, rebuilt from the permit drawings
 * (S-sheets: foundation plan and schedule, shear wall and hold-down schedules, typical
 * details) and the calculation package.
 *
 * From the drawings: 2x8 DF-L No.2 rafters @ 24 in. o.c., 8'-2" horizontal span, 4:12,
 * 1'-0" overhang, H2.5A at the plate; 2x4 DF-L No.2 @ 16 in. o.c. walls, 9'-8" plate
 * height; SW1 / SW2 / SW3 with 7/16 in. OSB 8d @ 4 in. edge (+ 5/8 in. GWB), HDU2-SDS2.5;
 * 5/8 in. anchor bolts @ 6'-0" o.c., 7 in. embedment, 3 × 3 × 0.229 plate washers; 8x16 CMU
 * stem wall on F1 18 in. W × 10 in. D with (3) #4 T&B and #4 @ 18 in. transverse; f'c =
 * 3,000 psi, Grade 60; 1,500 psf soil; 4 in. slab on grade, 10-mil vapor barrier, joints
 * @ 12'-0" o.c.; new footings doweled to the existing footings.
 *
 * Interpretation (each one is an assumption on the sheets): the addition roof is a single
 * slope from the new exterior wall to the existing house wall (rafter high end on the
 * existing wall, field verify); lateral demand from ELF with S_DS = 1.0 (CMU sheet) and
 * S_D1 = 0.6 (assumed); the CMU wall loads and the 40 psf added seismic pressure are the
 * Tedds inputs; the CMU wall uses the specified 7-5/8 in. thickness (Tedds used 8 in.).
 */

import { defaultHardware } from "../data/hardware";
import { defaultLateral, generateWeights } from "./lateral";
import { newProject } from "./example";
import type { MemberSpec, Project } from "./schema";

export function sanMiguelProject(): Project {
  const p = newProject("1109 San Miguel Avenue — master bedroom addition");
  p.info = {
    ...p.info,
    address: "1109 San Miguel Avenue, Spring Valley, CA 91977",
    jobRef: "SM-1109",
    client: "Owner",
    jurisdiction: "County of San Diego",
    date: "2026-07-02",
  };
  p.cycleId = "2025";
  p.criteria = {
    ...p.criteria,
    riskCategory: "II",
    roofLive: { L0: 20, reduce: false },
    snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
    seismic: { SDS: 1.0, SD1: 0.6, siteClass: "D (default) — S_D1 assumed, verify", SDC: "D" },
    wind: { V: 110, exposure: "B", Kzt: 1 },
    soil: {
      bearing: 1500,
      source: "Foundation note 3 (S-sheets): minimum allowable soil bearing 1,500 psf",
      class: "5",
      density: 120,
    },
    concrete: { fc: 3000, fy: 60000, cover: 3 },
  };
  p.hardware = defaultHardware();
  p.slab = {
    thickness: 4,
    reinforcement: "nominal reinforcement per plan (#3 @ 18 in. o.c. each way assumed — confirm)",
    vaporRetarder: "10-mil",
    base: "4 in. coarse aggregate capillary break",
    joints: "saw-cut 1 in. deep at 12'-0\" o.c. maximum each way (15'-0\" maximum per the typical slab detail)",
  };
  p.structures = [
    {
      id: "S1",
      name: "Addition",
      levels: [
        { id: "L1", name: "First floor (slab on grade)", number: 1 },
        { id: "RF", name: "Roof", number: 2 },
      ],
    },
  ];
  const base = { structureId: "S1", levelId: "L1", status: "new" as const };
  const roof = { structureId: "S1", levelId: "RF", status: "new" as const };
  const L = (id: string, sourceId: string, support: number, label: string) => ({
    id,
    kind: "line" as const,
    sourceId,
    support,
    label,
    factor: 1,
  });
  const sw = (id: string, mark: string, lineId: string, b: number, description: string, x: number): MemberSpec => ({
    kind: "shearWall",
    id,
    mark,
    description,
    ...base,
    links: [],
    lineId,
    b,
    h: 9.667,
    sides: [
      { key: "SH-7/16-8d", spacing: 4 },
      { key: "GWB-5/8-4-blocked", spacing: 4 },
    ],
    stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: 16 },
    endPost: { size: "2x4", plies: 2, holeDia: 1 },
    top: { D: 25, L: 0, Lr: 10, S: 0 },
    self: { psf: 12 },
    overturning: "full",
    holdownId: "HDU2-SDS2.5",
    sill: { type: "cast-in", d: 0.625, spacing: 72, embed: 7, edge: 1.75 },
    sillSize: "2x4",
    windService: { factor: 0.42, limitN: 600 },
    x,
  });
  p.members = [
    {
      kind: "rafter",
      id: "sm-r1",
      mark: "R-1",
      description: "Addition roof rafters, new exterior wall 1W-1 to the existing house wall (E)1W-2",
      ...roof,
      links: [],
      species: "DF-L",
      grade: "No.2",
      size: "2x8",
      spacing: 24,
      rise: 4,
      run: 8.167,
      overhang: 1,
      ridge: "beam",
      plateSeat: 3.5,
      ridgeSeat: 3.5,
      seatCut: 1.5,
      dead: { psf: 10, basis: "horizontal" },
      roofLive: true,
      snow: false,
      windPressure: -23.7,
      deflection: { preset: "roof-plaster" },
      luBottom: 0,
      rule441: false,
      tieSpacing: 24,
      gable: false,
    },
    {
      kind: "connector",
      id: "sm-cn1",
      mark: "CN-1",
      description: "Rafter to new top plate, wind uplift",
      ...roof,
      links: [],
      hardwareId: "H2.5A",
      quantity: 1,
      sourceId: "sm-r1",
      support: 0,
    },
    {
      kind: "connector",
      id: "sm-cn2",
      mark: "CN-2",
      description: "Rafter to existing top plate, wind uplift (detail: (N) roof to (E) wall)",
      ...roof,
      links: [],
      hardwareId: "H2.5A",
      quantity: 1,
      sourceId: "sm-r1",
      support: 1,
    },
    {
      kind: "wall",
      id: "sm-w1",
      mark: "1W-1",
      description: "New exterior bearing wall (SW3 line)",
      ...base,
      links: [L("sk1", "sm-r1", 0, "Rafters")],
      species: "DF-L",
      grade: "No.2",
      size: "2x4",
      spacing: 16,
      plateHeight: 9.667,
      topPlates: 2,
      bottomPlates: 1,
      length: 13.167,
      sheathing: "both",
      self: { psf: 12 },
      area: [],
      walls: [],
      extra: [],
      wind: { mode: "computed", zone: 4 },
      deflN: 240,
      packs: [],
      openings: [],
    },
    {
      kind: "wall",
      id: "sm-w2",
      mark: "(E)1W-2",
      description: "Existing house wall receiving the high end of R-1",
      ...base,
      status: "existing",
      existingNote: "Existing 2x4 @ 16 in. o.c. wall assumed — field verify size, spacing, grade and condition",
      links: [L("sk2", "sm-r1", 1, "Rafters (high end)")],
      species: "DF-L",
      grade: "Stud",
      size: "2x4",
      spacing: 16,
      plateHeight: 9,
      topPlates: 2,
      bottomPlates: 1,
      length: 12,
      sheathing: "both",
      self: { psf: 12 },
      area: [],
      walls: [],
      extra: [{ kind: "line", type: "D", label: "Existing roof and ceiling (assumed 15 psf × 6 ft)", w: 90 }],
      wind: { mode: "none" },
      deflN: 240,
      packs: [],
      openings: [],
    },
    sw("sm-sw1", "SW1", "LNA", 12, "Exterior side wall (south end HD1, north end HD2)", 0),
    sw("sm-sw2", "SW2", "LNB", 12, "Exterior side wall (south end HD3, north end HD4)", 0),
    sw("sm-sw3", "SW3", "LN1", 13.167, "Exterior front wall (west end HD5, east end HD6)", 0),
    {
      kind: "masonryWall",
      id: "sm-cw1",
      mark: "CW-1",
      description: "8x16 CMU stem wall under 1W-1 / SW3 (foundation schedule F1)",
      ...base,
      links: [L("sk3", "sm-w1", 0, "Bearing wall 1W-1")],
      material: "cmu",
      L: 13.167,
      h: 3,
      support: "pinned-fixed",
      t: 7.625,
      cmu: {
        fm: 2000,
        fmSource:
          "Unit strength method, f'cu = 2,500 psi with Type M mortar (Tedds input) — confirm with TMS 602 Table 2",
        fcu: 2500,
        mortar: "M",
        block: { hb: 8, lb: 16, tf: 1.25, tw: 1.25, te: 1.25, nWeb: 1, nEnd: 2, gammaBlock: 115, gammaGrout: 140 },
        FbFactor: 0.45,
        shearDeformation: true,
      },
      fy: 60000,
      vertical: { size: "#5", spacing: 8, layout: "center" },
      horizontal: { size: "#4", count: 2, spacing: 8 },
      extra: [],
      eccentricity: 0,
      wind: { W: 18, Wp: 18 },
      seismic: { include: true, Eadd: 40 },
    },
    {
      kind: "footing",
      id: "sm-f1",
      mark: "F1",
      description: "Continuous footing under the CMU stem wall (foundation schedule F1)",
      ...base,
      links: [L("sk4", "sm-cw1", 0, "CMU wall CW-1")],
      type: "strip",
      B: 1.5,
      h: 10,
      depth: 46,
      soilOver: 36,
      c1: 7.625,
      rebar: { size: "#4", spacing: 18 },
      longitudinal: { size: "#4", top: 3, bottom: 3 },
      extra: [],
      stories: 1,
    },
    {
      kind: "footing",
      id: "sm-fe1",
      mark: "(E)F-2",
      description: "Existing footing under (E)1W-2",
      ...base,
      status: "existing",
      existingNote: "Existing 12 in. wide × 12 in. deep plain footing assumed — field verify",
      links: [L("sk5", "sm-w2", 0, "Existing wall (E)1W-2")],
      type: "strip",
      B: 1,
      h: 12,
      depth: 18,
      soilOver: 6,
      c1: 6,
      stem: { width: 6, height: 12 },
      extra: [],
      stories: 1,
    },
    {
      kind: "holdownFooting",
      id: "sm-hf1",
      mark: "HF-1",
      description: "F1 under SW3 with the CMU stem (hold-downs HD5 / HD6)",
      ...base,
      links: [],
      sourceId: "sm-sw3",
      Lf: 13.167,
      B: 1.5,
      h: 10,
      depth: 46,
      stem: { width: 7.625, height: 36 },
      longitudinal: { size: "#4", top: 3, bottom: 3 },
      extra: [],
    },
    {
      kind: "tieIn",
      id: "sm-ti1",
      mark: "TI-1",
      description: "(N) footing F1 to (E) footing, typical",
      ...base,
      links: [],
      joint: "New continuous footing F1 doweled into the side of the existing footing",
      anchor: { kind: "rebar", size: "#4", fya: 60000, futa: 90000, steelLabel: "ASTM A615 Grade 60" },
      hef: 6,
      spacing: 16,
      ca1: 5,
      ha: 12,
      existing: { fc: 2500, cracked: true, verified: false },
      product: {
        name: "Epoxy adhesive per the drawings (product to be confirmed)",
        report: "ACI 318-19 Table 17.6.5.2.5 minimum bond stress (replace with the ICC-ES report values)",
        tauCr: 200,
        tauUncr: 650,
        kcCr: 17,
        kcUncr: 24,
        phiBond: 0.55,
        phiConcrete: 0.7,
        verified: false,
      },
      shearDir: "parallel-edge",
      demand: { Nu: 0, Vu: 0, source: "prescriptive tie-in (no calculated demand)" },
    },
  ];
  p.lateral = {
    ...defaultLateral(p),
    enabled: true,
    Lx: 13.167,
    Ly: 12,
    ridge: "X",
    pitch: 4,
    roofRise: 2.7,
    stories: [{ id: "ST1", name: "First story", height: 9.667, items: [] }],
    lines: [
      { id: "LN1", name: "Line 1 (front, SW3)", storyId: "ST1", dir: "X", trib: 12, pos: 12 },
      { id: "LNA", name: "Line A (SW1)", storyId: "ST1", dir: "Y", trib: 6.583, pos: 0 },
      { id: "LNB", name: "Line B (SW2)", storyId: "ST1", dir: "Y", trib: 6.583, pos: 13.167 },
    ],
    distribution: "flexible",
  };
  p.lateral.stories[0].items = generateWeights(p, p.lateral, 0);
  p.members.push({
    kind: "diaphragm",
    id: "sm-rd1",
    mark: "RD-1",
    description: "Addition roof diaphragm, Y-direction load to SW1 / SW2",
    ...roof,
    links: [],
    level: "roof",
    storyId: "ST1",
    dir: "Y",
    sheathing: "SH-15/32-8d",
    blocked: false,
    edge: "6/6",
    unblockedCase: 1,
    chord: { species: "DF-L", grade: "No.2", size: "2x4", splice: { type: "nails", nail: "16d-common", nails: 12 } },
    collectorOmega: false,
  });
  p.notes =
    "Rebuilt from the 1109 San Miguel permit set for HouseCalc Phase 4 validation. X-direction lateral load is resisted by SW3 and the existing house (the existing building is not checked here).";
  return p;
}
