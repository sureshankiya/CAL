/**
 * Project file schema (zod). A project holds the site / criteria, dead-load
 * assemblies, structures and levels, members with their load-path links, the
 * drawing register and the manual review table. Files saved by HouseCalc are
 * validated on open; schemaVersion supports later migrations.
 */

import { z } from "zod";

const num = z.number().finite();
const pos = num.positive();
const nonneg = num.nonnegative();

export const loadTypeSchema = z.enum(["D", "L", "Lr", "S", "W", "E"]);
export const loadVectorSchema = z.object({ D: num, L: num, Lr: num, S: num, W: num, E: num });

export const speciesSchema = z.enum(["DF-L", "HF", "SPF", "SP"]);
export const gradeSchema = z.enum(["Sel Str", "No.1 & Btr", "No.1", "No.2", "No.3", "Stud"]);

export const liveUseSchema = z.enum([
  "attic-no-storage",
  "attic-limited-storage",
  "habitable-attic",
  "sleeping",
  "living",
  "stairs",
  "deck",
  "balcony",
  "garage",
  "roof-ordinary",
  "roof-garden",
  "none",
]);

export const deadRefSchema = z.object({
  assemblyId: z.string().optional(),
  psf: nonneg.optional(),
  basis: z.enum(["sloped", "horizontal"]).optional(),
});
export const liveRefSchema = z.object({ use: liveUseSchema.optional(), psf: nonneg.optional() });

export const extraLoadSchema = z.object({
  kind: z.enum(["line", "point"]),
  type: loadTypeSchema,
  label: z.string(),
  w: num.optional(),
  x1: nonneg.optional(),
  x2: nonneg.optional(),
  P: num.optional(),
  x: nonneg.optional(),
});

/** Load carried from another member's support reaction (load-path link). */
export const linkedLoadSchema = z.object({
  id: z.string(),
  kind: z.enum(["point", "line"]),
  sourceId: z.string(),
  support: z.number().int().min(0),
  label: z.string().default(""),
  /** point: position on this member, ft */
  x: nonneg.optional(),
  /** line: extent on this member, ft (default full length) */
  x1: nonneg.optional(),
  x2: nonneg.optional(),
  /** multiplier, e.g. 2 for rafters bearing from both sides of a ridge beam */
  factor: pos.default(1),
});

export const deflectionSchema = z.object({
  preset: z.enum(["floor", "roof-plaster", "roof-nonplaster", "roof-no-ceiling", "floor-stiff", "custom"]),
  live: pos.optional(),
  total: pos.optional(),
});

const common = {
  id: z.string(),
  mark: z.string().min(1),
  description: z.string().default(""),
  structureId: z.string(),
  levelId: z.string(),
  /** new, existing (re-checked for new loads) or existing-modified (strengthened / altered) */
  status: z.enum(["new", "existing", "modified"]).default("new"),
  /** existing members: properties confirmed in the field */
  fieldVerified: z.boolean().optional(),
  existingNote: z.string().optional(),
  links: z.array(linkedLoadSchema).default([]),
};

export const joistSpecSchema = z.object({
  kind: z.literal("joist"),
  ...common,
  species: speciesSchema,
  grade: gradeSchema,
  size: z.string(),
  spacing: pos,
  spans: z.array(pos).min(1).max(3),
  leftCantilever: nonneg.optional(),
  rightCantilever: nonneg.optional(),
  dead: deadRefSchema,
  live: liveRefSchema,
  extra: z.array(extraLoadSchema).default([]),
  bearing: z.array(pos).min(1),
  luBottom: nonneg,
  rule441: z.boolean(),
  deflection: deflectionSchema,
  Kcr: pos.optional(),
  wetService: z.boolean().optional(),
  incised: z.boolean().optional(),
  addSelfWeight: z.boolean().optional(),
});

export const rafterSpecSchema = z.object({
  kind: z.literal("rafter"),
  ...common,
  species: speciesSchema,
  grade: gradeSchema,
  size: z.string(),
  spacing: pos,
  rise: pos,
  run: pos,
  overhang: nonneg,
  ridge: z.enum(["beam", "board"]),
  plateSeat: pos,
  ridgeSeat: nonneg,
  seatCut: nonneg,
  dead: deadRefSchema,
  roofLive: z.boolean(),
  snow: z.boolean(),
  windPressure: num.optional(),
  deflection: deflectionSchema,
  Kcr: pos.optional(),
  luBottom: nonneg,
  rule441: z.boolean(),
  tieSpacing: pos.optional(),
  gable: z.boolean(),
});

export const ceilingJoistSpecSchema = z.object({
  kind: z.literal("ceilingJoist"),
  ...common,
  species: speciesSchema,
  grade: gradeSchema,
  size: z.string(),
  spacing: pos,
  spans: z.array(pos).min(1).max(3),
  dead: deadRefSchema,
  live: liveRefSchema,
  extra: z.array(extraLoadSchema).default([]),
  bearing: z.array(pos).min(1),
  deflection: deflectionSchema,
  Kcr: pos.optional(),
  luTop: nonneg,
  rule441: z.boolean(),
  /** rafter whose thrust this joist resists as a tie */
  tensionFrom: z.string().optional(),
  heel: z.object({ nail: z.string(), count: z.number().int().positive(), rafterThickness: pos }).optional(),
});

export const ijoistSpecSchema = z.object({
  kind: z.literal("ijoist"),
  ...common,
  series: z.enum(["TJI 110", "TJI 210", "TJI 230", "TJI 360", "TJI 560"]),
  depth: z.enum(['9-1/2"', '11-7/8"', '14"', '16"', '18"']),
  spacing: pos,
  spans: z.array(pos).min(1).max(3),
  leftCantilever: nonneg.optional(),
  rightCantilever: nonneg.optional(),
  dead: deadRefSchema,
  live: liveRefSchema,
  extra: z.array(extraLoadSchema).default([]),
  bearing: z.array(pos).min(1),
  deflection: deflectionSchema,
  Kcr: pos.optional(),
  addSelfWeight: z.boolean().optional(),
  cdOverride: pos.optional(),
});

export const woodMaterialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sawn"),
    species: speciesSchema,
    grade: gradeSchema,
    size: z.string(),
    plies: z.number().int().min(1).max(5),
  }),
  z.object({ kind: z.literal("glulam"), combo: z.string(), b: pos, d: pos }),
  z.object({
    kind: z.literal("scl"),
    product: z.string(),
    plies: z.number().int().min(1).max(5),
    plyWidth: pos,
    d: pos,
  }),
]);

export const areaLoadSchema = z.object({
  label: z.string(),
  trib: pos,
  dead: deadRefSchema.optional(),
  live: liveRefSchema.optional(),
  roofLive: z.boolean().optional(),
  snow: z.boolean().optional(),
  rise: nonneg.optional(),
  x1: nonneg.optional(),
  x2: nonneg.optional(),
});

export const wallAboveSchema = z.object({
  label: z.string(),
  dead: deadRefSchema,
  height: pos,
  x1: nonneg.optional(),
  x2: nonneg.optional(),
});

export const beamSpecSchema = z.object({
  kind: z.literal("beam"),
  ...common,
  role: z.enum(["beam", "header", "ridge", "flush", "dropped"]),
  material: woodMaterialSchema,
  spans: z.array(pos).min(1).max(3),
  leftCantilever: nonneg.optional(),
  rightCantilever: nonneg.optional(),
  area: z.array(areaLoadSchema).default([]),
  walls: z.array(wallAboveSchema).default([]),
  extra: z.array(extraLoadSchema).default([]),
  bearing: z.array(pos).min(1),
  luTop: nonneg,
  luBottom: nonneg,
  deflection: deflectionSchema,
  Kcr: pos.optional(),
  selfWeight: z.boolean(),
  wetService: z.boolean().optional(),
  incised: z.boolean().optional(),
  crOverride: pos.optional(),
});

export const studPackSchema = z.object({
  x: nonneg,
  studs: z.number().int().min(1).max(6),
  label: z.string().optional(),
});
export const wallOpeningSchema = z.object({
  label: z.string(),
  x1: nonneg,
  x2: nonneg,
  kings: z.number().int().min(1).max(4),
});

export const wallSpecSchema = z.object({
  kind: z.literal("wall"),
  ...common,
  species: speciesSchema,
  grade: gradeSchema,
  size: z.string(),
  spacing: pos,
  plateHeight: pos,
  topPlates: z.number().int().min(1).max(3),
  bottomPlates: z.number().int().min(1).max(2),
  length: pos,
  sheathing: z.enum(["both", "one", "none"]),
  blocking: nonneg.optional(),
  self: deadRefSchema,
  area: z.array(areaLoadSchema).default([]),
  walls: z.array(wallAboveSchema).default([]),
  extra: z.array(extraLoadSchema).default([]),
  wind: z.object({
    mode: z.enum(["none", "computed", "entered"]),
    psf: nonneg.optional(),
    zone: z.union([z.literal(4), z.literal(5)]).optional(),
  }),
  deflN: pos,
  packs: z.array(studPackSchema).default([]),
  openings: z.array(wallOpeningSchema).default([]),
  wetService: z.boolean().optional(),
  incised: z.boolean().optional(),
});

export const postSpecSchema = z.object({
  kind: z.literal("post"),
  ...common,
  material: woodMaterialSchema,
  builtUp: z.enum(["nailed", "bolted"]).optional(),
  height: pos,
  Ke: pos,
  braceWeak: nonneg.optional(),
  braceStrong: nonneg.optional(),
  extra: z.array(extraLoadSchema).default([]),
  eccentricity: nonneg.optional(),
  wind: z.object({ psf: nonneg, width: nonneg }).optional(),
  bearing: z.object({
    on: z.enum(["wood", "concrete", "steel"]),
    species: speciesSchema.optional(),
    grade: gradeSchema.optional(),
    size: z.string().optional(),
    lb: pos.optional(),
    atEnd: z.boolean().optional(),
  }),
  selfWeight: z.boolean(),
  wetService: z.boolean().optional(),
  incised: z.boolean().optional(),
});

export const trussSpecSchema = z.object({
  kind: z.literal("truss"),
  ...common,
  spacing: nonneg,
  girder: z.boolean(),
  plies: z.number().int().min(1).max(4),
  span: pos,
  designRef: z.string().default(""),
  bearings: z.array(z.object({ name: z.string(), x: nonneg, D: num, L: num, Lr: num, S: num, W: num, width: pos })),
  plate: z.object({ species: speciesSchema, grade: gradeSchema, size: z.string() }),
});

export const connectorSpecSchema = z.object({
  kind: z.literal("connector"),
  ...common,
  hardwareId: z.string(),
  quantity: z.number().int().min(1).max(8),
  sourceId: z.string(),
  support: z.number().int().min(0),
  lateral: nonneg.optional(),
});

export const footingSpecSchema = z.object({
  kind: z.literal("footing"),
  ...common,
  type: z.enum(["strip", "pad"]),
  B: pos,
  L: pos.optional(),
  h: pos,
  depth: pos,
  soilOver: nonneg.optional(),
  c1: pos,
  c2: pos.optional(),
  stem: z.object({ width: pos, height: pos }).optional(),
  rebar: z.object({ size: z.string(), spacing: pos.optional(), count: z.number().int().min(2).optional() }).optional(),
  longitudinal: z
    .object({ size: z.string(), top: z.number().int().min(0), bottom: z.number().int().min(0) })
    .optional(),
  extra: z.array(extraLoadSchema).default([]),
  qaOverride: pos.optional(),
  stories: z.number().int().min(1).max(3),
  /** pad under a post cast as a thickened slab-on-grade */
  thickened: z.boolean().optional(),
});

export const shearWallSpecSchema = z.object({
  kind: z.literal("shearWall"),
  ...common,
  lineId: z.string(),
  b: pos,
  h: pos,
  sides: z
    .array(z.object({ key: z.string(), spacing: pos, vsOverride: pos.optional(), GaOverride: pos.optional() }))
    .min(1)
    .max(2),
  stud: z.object({ species: speciesSchema, grade: gradeSchema, size: z.string(), spacing: pos }),
  endPost: z.object({ size: z.string(), plies: z.number().int().min(1).max(4), holeDia: nonneg }),
  top: z.object({ D: nonneg, L: nonneg, Lr: nonneg, S: nonneg }),
  self: deadRefSchema,
  overturning: z.enum(["full", "endpost"]),
  holdownId: z.string().optional(),
  upliftFrom: z.string().optional(),
  sill: z.object({
    type: z.enum(["cast-in", "post-installed"]),
    d: pos,
    spacing: pos,
    embed: pos,
    edge: pos,
    allowShear: pos.optional(),
    label: z.string().optional(),
  }),
  sillSize: z.string(),
  holdownAnchor: z
    .object({
      d: pos,
      steel: z.string(),
      hef: pos,
      edges: z.tuple([pos, pos, pos, pos]),
      plate: pos,
      cracked: z.boolean(),
      omega: z.boolean(),
    })
    .optional(),
  ka: pos.optional(),
  windService: z.object({ factor: pos, limitN: pos }),
  /** start position along the wall line, ft (for the collector force profile) */
  x: nonneg.optional(),
  /** force transfer around one opening (FTAO) */
  opening: z.object({ L1: pos, Lo: pos, L2: pos, ha: pos, hb: nonneg, strapId: z.string().optional() }).optional(),
});

const steelMethodSchema = z.enum(["LRFD", "ASD"]);

export const steelBeamSpecSchema = z.object({
  kind: z.literal("steelBeam"),
  ...common,
  role: z.enum(["beam", "header", "lintel", "ridge", "flush", "dropped"]),
  shape: z.string(),
  grade: z.string(),
  method: steelMethodSchema,
  spans: z.array(pos).min(1).max(3),
  leftCantilever: nonneg.optional(),
  rightCantilever: nonneg.optional(),
  fixedLeft: z.boolean().optional(),
  fixedRight: z.boolean().optional(),
  area: z.array(areaLoadSchema).default([]),
  walls: z.array(wallAboveSchema).default([]),
  extra: z.array(extraLoadSchema).default([]),
  Lb: nonneg,
  CbOverride: pos.optional(),
  deflection: deflectionSchema,
  selfWeight: z.boolean(),
  bearing: z
    .array(
      z.object({
        lb: pos,
        support: z.enum(["wood", "post", "steel", "concrete"]),
        species: speciesSchema.optional(),
        grade: gradeSchema.optional(),
        size: z.string().optional(),
      }),
    )
    .min(1),
});

export const steelColumnSpecSchema = z.object({
  kind: z.literal("steelColumn"),
  ...common,
  shape: z.string(),
  grade: z.string(),
  method: steelMethodSchema,
  height: pos,
  Kx: pos,
  Ky: pos,
  Ly: pos.optional(),
  extra: z.array(extraLoadSchema).default([]),
  ex: nonneg,
  ey: nonneg,
  wind: z.object({ psf: nonneg, width: nonneg }).optional(),
  selfWeight: z.boolean(),
  cap: z.object({ length: pos, width: pos, species: speciesSchema, grade: gradeSchema }).optional(),
});

export const basePlateSpecSchema = z.object({
  kind: z.literal("basePlate"),
  ...common,
  method: steelMethodSchema,
  /** steel column above (its base reactions are the plate forces) */
  sourceId: z.string().optional(),
  column: z.string(),
  /** additional unfactored base forces by type: P (lb, + down), M (lb-ft), V (lb) */
  P: loadVectorSchema,
  M: loadVectorSchema,
  V: loadVectorSchema,
  plate: z.object({ N: pos, B: pos, tp: pos, grade: z.string() }),
  rod: z.object({
    d: pos,
    steel: z.number().int().min(0),
    nx: z.number().int().min(1).max(4),
    ny: z.number().int().min(1).max(4),
    sx: nonneg,
    sy: nonneg,
    e1: pos,
    hef: pos,
    type: z.enum(["headed", "hooked"]),
    Abrg: pos,
    eh: pos,
    washer: nonneg,
    groutPad: z.boolean(),
    nShear: z.number().int().min(1).optional(),
  }),
  foundation: z.object({
    edges: z.tuple([pos, pos, pos, pos]),
    ha: pos,
    cracked: z.boolean(),
    condition: z.enum(["A", "B"]),
  }),
  weld: z.object({ w: pos, FEXX: pos }),
});

export const diaphragmSpecSchema = z.object({
  kind: z.literal("diaphragm"),
  ...common,
  level: z.enum(["roof", "floor"]),
  storyId: z.string(),
  dir: z.enum(["X", "Y"]),
  sheathing: z.string(),
  blocked: z.boolean(),
  edge: z.enum(["6/6", "4/6", "2.5/4", "2/3"]),
  unblockedCase: z.union([z.literal(1), z.literal(2)]),
  chord: z.object({
    species: speciesSchema,
    grade: gradeSchema,
    size: z.string(),
    splice: z.object({
      type: z.enum(["nails", "strap"]),
      nail: z.string(),
      nails: z.number().int().min(1),
      strapId: z.string().optional(),
    }),
  }),
  collectorOmega: z.boolean(),
});

export const transferSpecSchema = z.object({
  kind: z.literal("transfer"),
  ...common,
  interface: z.enum(["diaphragm-to-wall", "sole-plate", "rim-to-sill", "other"]),
  source: z.union([
    z.object({ kind: z.literal("wall"), id: z.string() }),
    z.object({ kind: z.literal("line"), lineId: z.string() }),
  ]),
  connector: z.union([
    z.object({ type: z.literal("clip"), hardwareId: z.string(), direction: z.enum(["F1", "F2"]) }),
    z.object({
      type: z.literal("nails"),
      nail: z.string(),
      ts: pos,
      tm: pos,
      species: speciesSchema,
      toenail: z.boolean(),
      rows: z.number().int().min(1).max(3),
    }),
  ]),
  spacing: pos,
});

export const upliftSpecSchema = z.object({
  kind: z.literal("uplift"),
  ...common,
  sourceId: z.string(),
  support: z.number().int().min(0),
  levels: z
    .array(
      z.object({
        label: z.string(),
        deadAbove: nonneg,
        connector: z.union([
          z.object({ type: z.literal("hardware"), hardwareId: z.string() }),
          z.object({ type: z.literal("entered"), capacity: pos, source: z.string(), model: z.string() }),
        ]),
        spacing: pos,
      }),
    )
    .min(1),
});

export const ledgerSpecSchema = z.object({
  kind: z.literal("ledger"),
  ...common,
  ledger: z.object({ species: speciesSchema, grade: gradeSchema, size: z.string() }),
  extra: z.array(extraLoadSchema).default([]),
  lateral: z.object({ W: nonneg, E: nonneg }),
  fastener: z.object({ type: z.enum(["bolt", "lag"]), D: pos, Fyb: pos, spacing: pos, label: z.string().optional() }),
  support: z.union([
    z.object({ kind: z.literal("wood"), species: speciesSchema, thickness: pos }),
    z.object({ kind: z.enum(["concrete", "cmu"]), Fe: pos, embed: pos }),
  ]),
  continuity: pos,
  wetService: z.boolean().optional(),
});

export const masonryWallSpecSchema = z.object({
  kind: z.literal("masonryWall"),
  ...common,
  material: z.enum(["cmu", "concrete"]),
  L: pos,
  h: pos,
  parapet: nonneg.optional(),
  support: z.enum(["pinned-fixed", "pinned-pinned", "fixed-fixed", "cantilever"]),
  t: pos,
  cmu: z
    .object({
      fm: pos,
      fmSource: z.string(),
      fcu: pos.optional(),
      mortar: z.enum(["M", "S", "N"]),
      block: z.object({
        hb: pos,
        lb: pos,
        tf: pos,
        tw: pos,
        te: pos,
        nWeb: z.number().int().min(0),
        nEnd: z.number().int().min(0),
        gammaBlock: pos,
        gammaGrout: pos,
      }),
      FbFactor: pos,
      shearDeformation: z.boolean(),
    })
    .optional(),
  concrete: z.object({ fc: pos, gamma: pos, cover: pos }).optional(),
  fy: pos,
  vertical: z.object({
    size: z.string(),
    spacing: pos,
    layout: z.enum(["center", "offset", "each-face"]),
    d: pos.optional(),
  }),
  horizontal: z.object({ size: z.string(), count: z.number().int().min(1), spacing: pos }),
  extra: z.array(extraLoadSchema).default([]),
  eccentricity: num.default(0),
  wind: z.object({ W: nonneg, Wp: nonneg }),
  seismic: z.object({ include: z.boolean(), Eadd: nonneg }),
  soil: z.object({ height: nonneg, efp: nonneg, surcharge: nonneg }).optional(),
  inPlane: z.object({ W: nonneg, E: nonneg, h: pos.optional() }).optional(),
});

export const holdownFootingSpecSchema = z.object({
  kind: z.literal("holdownFooting"),
  ...common,
  sourceId: z.string(),
  Lf: pos,
  B: pos,
  h: pos,
  depth: pos,
  stem: z.object({ width: pos, height: pos }).optional(),
  longitudinal: z
    .object({ size: z.string(), top: z.number().int().min(0), bottom: z.number().int().min(0) })
    .optional(),
  extra: z.array(extraLoadSchema).default([]),
  qaOverride: pos.optional(),
});

export const adhesiveSchema = z.object({
  name: z.string(),
  report: z.string(),
  tauCr: pos,
  tauUncr: pos,
  kcCr: pos,
  kcUncr: pos,
  phiBond: pos,
  phiConcrete: pos,
  verified: z.boolean().default(false),
});

export const tieInSpecSchema = z.object({
  kind: z.literal("tieIn"),
  ...common,
  joint: z.string().default(""),
  anchor: z.object({
    kind: z.enum(["rebar", "rod"]),
    size: z.string(),
    fya: pos,
    futa: pos,
    steelLabel: z.string(),
  }),
  hef: pos,
  spacing: pos,
  ca1: pos,
  ha: pos,
  existing: z.object({ fc: pos, cracked: z.boolean(), verified: z.boolean() }),
  product: adhesiveSchema,
  shearDir: z.enum(["toward-edge", "parallel-edge"]),
  demand: z.object({ Nu: nonneg, Vu: nonneg, source: z.string().default("") }),
  shearFriction: z.object({ Vu: nonneg, roughened: z.boolean(), Ac: pos }).optional(),
});

const trussLumberSchema = z.object({ species: speciesSchema, grade: gradeSchema, size: z.string() });

export const woodTrussSpecSchema = z.object({
  kind: z.literal("woodTruss"),
  ...common,
  type: z.enum(["fink", "howe", "king", "queen", "king-queen", "parallel"]),
  span: pos,
  pitch: nonneg,
  depth: pos.optional(),
  panels: z.number().int().min(2).max(20).optional(),
  pattern: z.enum(["warren", "pratt"]).optional(),
  overhang: nonneg,
  spacing: pos,
  bearingLen: pos,
  tc: trussLumberSchema,
  bc: trussLumberSchema,
  web: trussLumberSchema,
  webBracing: z.enum(["none", "midpoint"]),
  roofDead: deadRefSchema,
  ceilingDead: deadRefSchema,
  atticLive: nonneg,
  roofLive: z.boolean(),
  snow: z.boolean(),
  windUplift: nonneg,
  netSection: pos,
  joint: z.union([
    z.object({ type: z.literal("plate"), value: pos, zone: pos, source: z.string() }),
    z.object({ type: z.literal("nailed"), nail: z.string(), gusset: pos }),
    z.object({ type: z.literal("bolted"), D: pos, gusset: pos }),
  ]),
  deflection: deflectionSchema,
});

export const memberSpecSchema = z.discriminatedUnion("kind", [
  joistSpecSchema,
  rafterSpecSchema,
  ceilingJoistSpecSchema,
  ijoistSpecSchema,
  beamSpecSchema,
  wallSpecSchema,
  postSpecSchema,
  trussSpecSchema,
  connectorSpecSchema,
  footingSpecSchema,
  shearWallSpecSchema,
  steelBeamSpecSchema,
  steelColumnSpecSchema,
  basePlateSpecSchema,
  diaphragmSpecSchema,
  transferSpecSchema,
  upliftSpecSchema,
  ledgerSpecSchema,
  masonryWallSpecSchema,
  holdownFootingSpecSchema,
  tieInSpecSchema,
  woodTrussSpecSchema,
]);

export const hardwareItemSchema = z.object({
  id: z.string(),
  model: z.string(),
  kind: z.enum(["holdown", "tie", "hanger", "post-cap", "post-base", "strap", "angle"]),
  manufacturer: z.string(),
  description: z.string(),
  fasteners: z.string(),
  report: z.string(),
  down: z
    .object({ "100": nonneg.optional(), "115": nonneg.optional(), "125": nonneg.optional(), "160": nonneg.optional() })
    .optional(),
  uplift: nonneg.optional(),
  F1: nonneg.optional(),
  F2: nonneg.optional(),
  tension: nonneg.optional(),
  deflection: nonneg.optional(),
  anchorDia: pos.optional(),
  minPost: pos.optional(),
  checked: z.boolean(),
  source: z.string(),
});

export const weightItemSchema = z.object({
  label: z.string(),
  kind: z.enum(["area", "wall", "lump"]),
  qty: nonneg,
  height: nonneg.optional(),
  assemblyId: z.string().optional(),
  psf: nonneg.optional(),
  sloped: z.boolean().optional(),
  W: nonneg.optional(),
});

export const lateralSchema = z.object({
  enabled: z.boolean(),
  system: z.enum(["wsp", "other"]),
  rho: pos,
  TL: pos,
  S1: nonneg.optional(),
  driftLowRise: z.boolean(),
  Lx: pos,
  Ly: pos,
  ridge: z.enum(["X", "Y"]),
  pitch: nonneg,
  roofRise: nonneg,
  Ke: pos,
  stories: z.array(
    z.object({ id: z.string(), name: z.string(), height: pos, items: z.array(weightItemSchema).default([]) }),
  ),
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      storyId: z.string(),
      dir: z.enum(["X", "Y"]),
      trib: pos,
      pos: nonneg.optional(),
    }),
  ),
  distribution: z.enum(["flexible", "rigid", "envelope"]).default("flexible"),
  com: z.object({ x: nonneg, y: nonneg }).optional(),
});

export const assemblySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["roof", "floor", "ceiling", "wall", "deck"]),
  basis: z.enum(["sloped", "horizontal", "wall"]),
  components: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      psf: nonneg,
      source: z.enum(["C3.1-1a", "typical", "computed", "user"]),
      overridden: z.boolean().optional(),
    }),
  ),
  designValue: nonneg.optional(),
});

export const structureSchema = z.object({
  id: z.string(),
  name: z.string(),
  levels: z.array(z.object({ id: z.string(), name: z.string(), number: z.number().int().min(0) })).min(1),
});

export const drawingSchema = z.object({
  id: z.string(),
  name: z.string(),
  pages: z.number().int().nonnegative(),
  addedAt: z.string(),
  /** sheet labels by page (e.g. "S-1"), entered or read from the title block */
  sheets: z.record(z.string()).default({}),
});

export const reviewItemSchema = z.object({
  id: z.string(),
  drawingId: z.string(),
  page: z.number().int().positive(),
  sheet: z.string().default(""),
  /** what was read, e.g. "Rafter size R-1" */
  item: z.string(),
  value: z.string(),
  /** member / field it feeds, when linked */
  target: z.object({ memberId: z.string(), field: z.string() }).optional(),
  confirmed: z.boolean().default(false),
  note: z.string().default(""),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  info: z.object({
    name: z.string(),
    address: z.string().default(""),
    jobRef: z.string().default(""),
    client: z.string().default(""),
    jurisdiction: z.string().default(""),
    preparedBy: z.string().default(""),
    checkedBy: z.string().default(""),
    approvedBy: z.string().default(""),
    date: z.string().default(""),
    revision: z.string().default("0"),
  }),
  cycleId: z.enum(["2025", "2022"]),
  criteria: z.object({
    riskCategory: z.enum(["I", "II", "III", "IV"]),
    liveBasis: z.enum(["IRC", "IBC"]),
    roofLive: z.object({ L0: pos, reduce: z.boolean() }),
    snow: z.object({ pg: nonneg, Ce: pos, Ct: pos, Is: pos, slippery: z.boolean() }),
    Kcr: pos,
    seismic: z.object({ SDS: nonneg, SD1: nonneg, siteClass: z.string(), SDC: z.string() }),
    wind: z.object({ V: pos, exposure: z.enum(["B", "C", "D"]), Kzt: pos }),
    soil: z.object({
      bearing: pos,
      source: z.string(),
      class: z.enum(["1", "2", "3", "4", "5"]).optional(),
      density: pos.default(120),
      frostDepth: nonneg.optional(),
    }),
    concrete: z.object({ fc: pos, fy: pos, cover: pos }).default({ fc: 2500, fy: 60000, cover: 3 }),
  }),
  assemblies: z.array(assemblySchema),
  structures: z.array(structureSchema).min(1),
  members: z.array(memberSpecSchema),
  marks: z.record(z.string()),
  hardware: z.array(hardwareItemSchema).default([]),
  lateral: lateralSchema.optional(),
  drawings: z.array(drawingSchema).default([]),
  review: z.array(reviewItemSchema).default([]),
  notes: z.string().default(""),
  /** slab-on-grade specification for the notes (thickened slabs are checked as pads) */
  slab: z
    .object({
      thickness: pos,
      reinforcement: z.string(),
      vaporRetarder: z.string(),
      base: z.string(),
      joints: z.string(),
    })
    .optional(),
});

export type Project = z.infer<typeof projectSchema>;
export type MemberSpec = z.infer<typeof memberSpecSchema>;
export type JoistSpec = z.infer<typeof joistSpecSchema>;
export type RafterSpec = z.infer<typeof rafterSpecSchema>;
export type CeilingJoistSpec = z.infer<typeof ceilingJoistSpecSchema>;
export type IJoistSpec = z.infer<typeof ijoistSpecSchema>;
export type BeamSpec = z.infer<typeof beamSpecSchema>;
export type WallSpec = z.infer<typeof wallSpecSchema>;
export type PostSpec = z.infer<typeof postSpecSchema>;
export type TrussSpec = z.infer<typeof trussSpecSchema>;
export type ConnectorSpec = z.infer<typeof connectorSpecSchema>;
export type FootingSpec = z.infer<typeof footingSpecSchema>;
export type ShearWallSpec = z.infer<typeof shearWallSpecSchema>;
export type SteelBeamSpec = z.infer<typeof steelBeamSpecSchema>;
export type SteelColumnSpec = z.infer<typeof steelColumnSpecSchema>;
export type BasePlateSpec = z.infer<typeof basePlateSpecSchema>;
export type DiaphragmSpec = z.infer<typeof diaphragmSpecSchema>;
export type TransferSpec = z.infer<typeof transferSpecSchema>;
export type UpliftSpec = z.infer<typeof upliftSpecSchema>;
export type LedgerSpec = z.infer<typeof ledgerSpecSchema>;
export type MasonryWallSpec = z.infer<typeof masonryWallSpecSchema>;
export type HoldownFootingSpec = z.infer<typeof holdownFootingSpecSchema>;
export type TieInSpec = z.infer<typeof tieInSpecSchema>;
export type WoodTrussSpec = z.infer<typeof woodTrussSpecSchema>;
export type LateralSpec = z.infer<typeof lateralSchema>;
export type HardwareSpec = z.infer<typeof hardwareItemSchema>;
export type LinkedLoad = z.infer<typeof linkedLoadSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type DrawingMeta = z.infer<typeof drawingSchema>;
export type Structure = z.infer<typeof structureSchema>;
