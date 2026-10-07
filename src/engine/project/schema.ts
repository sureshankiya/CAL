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
  status: z.enum(["new", "existing"]).default("new"),
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

export const memberSpecSchema = z.discriminatedUnion("kind", [
  joistSpecSchema,
  rafterSpecSchema,
  ceilingJoistSpecSchema,
  ijoistSpecSchema,
  beamSpecSchema,
]);

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
    soil: z.object({ bearing: pos, source: z.string() }),
  }),
  assemblies: z.array(assemblySchema),
  structures: z.array(structureSchema).min(1),
  members: z.array(memberSpecSchema),
  marks: z.record(z.string()),
  drawings: z.array(drawingSchema).default([]),
  review: z.array(reviewItemSchema).default([]),
  notes: z.string().default(""),
});

export type Project = z.infer<typeof projectSchema>;
export type MemberSpec = z.infer<typeof memberSpecSchema>;
export type JoistSpec = z.infer<typeof joistSpecSchema>;
export type RafterSpec = z.infer<typeof rafterSpecSchema>;
export type CeilingJoistSpec = z.infer<typeof ceilingJoistSpecSchema>;
export type IJoistSpec = z.infer<typeof ijoistSpecSchema>;
export type BeamSpec = z.infer<typeof beamSpecSchema>;
export type LinkedLoad = z.infer<typeof linkedLoadSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type DrawingMeta = z.infer<typeof drawingSchema>;
export type Structure = z.infer<typeof structureSchema>;
