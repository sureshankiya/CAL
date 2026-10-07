/**
 * Dead-load assemblies, itemised in psf.
 * Component weights are from ASCE 7 Commentary Table C3.1-1a where the table
 * lists them; other entries are typical published values marked "typical" and
 * print VERIFY until replaced with the specified product's weight.
 */

export type ComponentSource = "C3.1-1a" | "typical" | "computed" | "user";

export interface DeadComponentDef {
  key: string;
  name: string;
  psf: number;
  source: ComponentSource;
  group: "Roofing" | "Sheathing" | "Insulation" | "Ceilings" | "Floor finishes" | "Framing" | "Walls" | "Other";
}

/** Component library. "C3.1-1a" values follow ASCE 7-16 / 7-22 Table C3.1-1a. */
export const DEAD_COMPONENTS: DeadComponentDef[] = [
  // roofing
  { key: "asphalt-shingles", name: "Asphalt shingles", psf: 2.0, source: "C3.1-1a", group: "Roofing" },
  { key: "reroof-overlay", name: "Future reroof — one shingle overlay", psf: 2.0, source: "C3.1-1a", group: "Roofing" },
  {
    key: "underlayment",
    name: "Roofing underlayment (felt / synthetic)",
    psf: 0.5,
    source: "typical",
    group: "Roofing",
  },
  { key: "cement-tile", name: "Cement (concrete) roof tile", psf: 16.0, source: "C3.1-1a", group: "Roofing" },
  { key: "concrete-tile-lw", name: "Lightweight concrete roof tile", psf: 10.0, source: "typical", group: "Roofing" },
  {
    key: "clay-tile-spanish",
    name: "Clay tile, Spanish (add 10 psf for mortar set)",
    psf: 19.0,
    source: "C3.1-1a",
    group: "Roofing",
  },
  { key: "clay-tile-roman", name: "Clay tile, Roman", psf: 12.0, source: "C3.1-1a", group: "Roofing" },
  { key: "wood-shingles", name: "Wood shingles", psf: 3.0, source: "C3.1-1a", group: "Roofing" },
  { key: "slate-quarter", name: "Slate, 1/4 in.", psf: 10.0, source: "C3.1-1a", group: "Roofing" },
  {
    key: "metal-roofing",
    name: "Metal roofing panels (steel, 24–26 ga)",
    psf: 1.5,
    source: "typical",
    group: "Roofing",
  },
  {
    key: "bur-4ply",
    name: "Built-up roofing, four-ply felt and gravel",
    psf: 5.5,
    source: "C3.1-1a",
    group: "Roofing",
  },
  {
    key: "single-ply",
    name: "Waterproofing membrane, single-ply sheet",
    psf: 0.7,
    source: "C3.1-1a",
    group: "Roofing",
  },
  {
    key: "solar-pv",
    name: "Solar PV panels and racking (where indicated)",
    psf: 3.0,
    source: "typical",
    group: "Roofing",
  },
  // sheathing
  {
    key: "ply-15/32",
    name: "Plywood / OSB sheathing, 15/32 in. (1/2 in.)",
    psf: 1.6,
    source: "C3.1-1a",
    group: "Sheathing",
  },
  {
    key: "ply-19/32",
    name: "Plywood / OSB sheathing, 19/32 in. (5/8 in.)",
    psf: 2.0,
    source: "C3.1-1a",
    group: "Sheathing",
  },
  {
    key: "ply-23/32",
    name: "Plywood / OSB sheathing, 23/32 in. (3/4 in.)",
    psf: 2.4,
    source: "C3.1-1a",
    group: "Sheathing",
  },
  { key: "subfloor-3/4", name: "Subflooring, 3/4 in.", psf: 3.0, source: "C3.1-1a", group: "Sheathing" },
  { key: "decking-2in", name: "Decking, 2 in. wood (Douglas fir)", psf: 5.0, source: "C3.1-1a", group: "Sheathing" },
  // insulation
  {
    key: "insul-batt",
    name: "Insulation, batt or blown (typical allowance)",
    psf: 1.0,
    source: "typical",
    group: "Insulation",
  },
  {
    key: "insul-rigid-1",
    name: "Rigid insulation board, 1 in. (fiberboard)",
    psf: 1.5,
    source: "C3.1-1a",
    group: "Insulation",
  },
  { key: "insul-eps-1", name: "Polystyrene foam board, 1 in.", psf: 0.2, source: "C3.1-1a", group: "Insulation" },
  // ceilings
  { key: "gyp-1/2", name: "Gypsum board, 1/2 in.", psf: 2.2, source: "C3.1-1a", group: "Ceilings" },
  { key: "gyp-5/8", name: "Gypsum board, 5/8 in.", psf: 2.75, source: "C3.1-1a", group: "Ceilings" },
  { key: "plaster-wood-lath", name: "Plaster on wood lath", psf: 8.0, source: "C3.1-1a", group: "Ceilings" },
  { key: "mech-duct", name: "Mechanical duct allowance", psf: 4.0, source: "C3.1-1a", group: "Ceilings" },
  // floor finishes
  { key: "hardwood-7/8", name: "Hardwood flooring, 7/8 in.", psf: 4.0, source: "C3.1-1a", group: "Floor finishes" },
  {
    key: "linoleum",
    name: "Linoleum, vinyl or asphalt tile, 1/4 in.",
    psf: 1.0,
    source: "C3.1-1a",
    group: "Floor finishes",
  },
  {
    key: "tile-mortar-1/2",
    name: "Ceramic or quarry tile (3/4 in.) on 1/2 in. mortar bed",
    psf: 16.0,
    source: "C3.1-1a",
    group: "Floor finishes",
  },
  {
    key: "tile-mortar-1",
    name: "Ceramic or quarry tile (3/4 in.) on 1 in. mortar bed",
    psf: 23.0,
    source: "C3.1-1a",
    group: "Floor finishes",
  },
  {
    key: "tile-thinset",
    name: "Ceramic tile, thin-set on backer board",
    psf: 8.0,
    source: "typical",
    group: "Floor finishes",
  },
  {
    key: "lw-concrete-1.5",
    name: "Lightweight concrete topping, 1-1/2 in. (8 psf per in.)",
    psf: 12.0,
    source: "C3.1-1a",
    group: "Floor finishes",
  },
  // framing allowances (members designed with these assemblies do not add self weight again)
  {
    key: "framing-roof",
    name: "Roof framing allowance (rafters / trusses)",
    psf: 2.0,
    source: "typical",
    group: "Framing",
  },
  {
    key: "framing-floor",
    name: "Floor framing allowance (joists / I-joists)",
    psf: 3.0,
    source: "typical",
    group: "Framing",
  },
  { key: "framing-ceiling", name: "Ceiling joist allowance", psf: 1.5, source: "typical", group: "Framing" },
  // walls (psf of wall area)
  {
    key: "wall-ext-2x6",
    name: "Exterior stud wall 2x6 @ 16 in., 5/8 in. gypsum, insulated, 3/8 in. siding",
    psf: 12.0,
    source: "C3.1-1a",
    group: "Walls",
  },
  {
    key: "wall-ext-2x4",
    name: "Exterior stud wall 2x4 @ 16 in., 5/8 in. gypsum, insulated, 3/8 in. siding",
    psf: 11.0,
    source: "C3.1-1a",
    group: "Walls",
  },
  {
    key: "stucco-7/8",
    name: "Portland cement plaster (stucco), 7/8 in. on lath — add to stud wall",
    psf: 10.0,
    source: "typical",
    group: "Walls",
  },
  {
    key: "wall-int-2x4",
    name: "Interior partition, wood studs, 1/2 in. gypsum each side",
    psf: 8.0,
    source: "C3.1-1a",
    group: "Walls",
  },
  {
    key: "brick-veneer-wall",
    name: "Exterior stud wall with brick veneer",
    psf: 48.0,
    source: "C3.1-1a",
    group: "Walls",
  },
  { key: "windows", name: "Windows, glass, frame and sash", psf: 8.0, source: "C3.1-1a", group: "Walls" },
  // other
  { key: "misc", name: "Miscellaneous, mechanical and electrical", psf: 1.5, source: "typical", group: "Other" },
];

export const componentDef = (key: string) => DEAD_COMPONENTS.find((c) => c.key === key);

export interface DeadComponent {
  /** library key, or a free key for user-entered items */
  key: string;
  name: string;
  psf: number;
  source: ComponentSource;
  /** library value replaced by the engineer (prints in red on the loads sheet) */
  overridden?: boolean;
}

export type AssemblyKind = "roof" | "floor" | "ceiling" | "wall" | "deck";

export interface DeadAssembly {
  id: string;
  name: string;
  kind: AssemblyKind;
  /** "sloped" = per ft² of roof surface; "horizontal" = per ft² of plan area */
  basis: "sloped" | "horizontal" | "wall";
  components: DeadComponent[];
  /** optional rounded-up design value; must be ≥ the itemised sum */
  designValue?: number;
}

export function assemblySum(a: DeadAssembly): number {
  return Math.round(a.components.reduce((s, c) => s + c.psf, 0) * 100) / 100;
}

/** Design value used by members: the rounded-up value when given, otherwise the itemised sum. */
export function assemblyDesignValue(a: DeadAssembly): number {
  const sum = assemblySum(a);
  if (a.designValue === undefined) return sum;
  if (a.designValue < sum - 1e-9)
    throw new Error(`${a.name}: design value ${a.designValue} psf is less than the itemised sum ${sum} psf`);
  return a.designValue;
}

/** Assembly component flagged for verification (typical values or overrides). */
export const needsVerify = (c: DeadComponent) => c.source === "typical" || !!c.overridden;

const lib = (key: string): DeadComponent => {
  const d = componentDef(key);
  if (!d) throw new Error(`Unknown dead-load component ${key}`);
  return { key: d.key, name: d.name, psf: d.psf, source: d.source };
};

/** Default assemblies for a new project (editable). */
export function defaultAssemblies(): DeadAssembly[] {
  return [
    {
      id: "RD1",
      name: "Roof — asphalt shingles (ceiling carried by ceiling joists)",
      kind: "roof",
      basis: "sloped",
      components: ["asphalt-shingles", "reroof-overlay", "underlayment", "ply-15/32", "framing-roof", "misc"].map(lib),
      designValue: 10,
    },
    {
      id: "RD2",
      name: "Roof — concrete tile (ceiling carried by ceiling joists)",
      kind: "roof",
      basis: "sloped",
      components: ["cement-tile", "underlayment", "ply-15/32", "framing-roof", "misc"].map(lib),
      designValue: 22,
    },
    {
      id: "RD3",
      name: "Roof — asphalt shingles, vaulted ceiling on rafters",
      kind: "roof",
      basis: "sloped",
      components: [
        "asphalt-shingles",
        "reroof-overlay",
        "underlayment",
        "ply-15/32",
        "framing-roof",
        "insul-batt",
        "gyp-5/8",
        "misc",
      ].map(lib),
      designValue: 15,
    },
    {
      id: "FD1",
      name: "Floor — wood framed, wood / carpet finish",
      kind: "floor",
      basis: "horizontal",
      components: ["hardwood-7/8", "ply-23/32", "framing-floor", "gyp-5/8", "misc"].map(lib),
      designValue: 15,
    },
    {
      id: "FD2",
      name: "Floor — wood framed, tile on mortar bed",
      kind: "floor",
      basis: "horizontal",
      components: ["tile-mortar-1/2", "ply-23/32", "framing-floor", "gyp-5/8", "misc"].map(lib),
      designValue: 26,
    },
    {
      id: "CD1",
      name: "Ceiling — gypsum on ceiling joists, attic insulation",
      kind: "ceiling",
      basis: "horizontal",
      components: ["gyp-5/8", "insul-batt", "framing-ceiling", "misc"].map(lib),
      designValue: 7,
    },
    {
      id: "DD1",
      name: "Deck — 2 in. wood decking",
      kind: "deck",
      basis: "horizontal",
      components: ["decking-2in", "framing-floor", "misc"].map(lib),
      designValue: 10,
    },
    {
      id: "WD1",
      name: "Exterior wall — 2x6 @ 16 in., stucco",
      kind: "wall",
      basis: "wall",
      components: ["wall-ext-2x6", "stucco-7/8"].map(lib),
      designValue: 22,
    },
    {
      id: "WD2",
      name: "Interior wall — 2x4 @ 16 in., gypsum both sides",
      kind: "wall",
      basis: "wall",
      components: ["wall-int-2x4"].map(lib),
      designValue: 10,
    },
  ];
}
