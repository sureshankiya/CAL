/** Default specs for new members, with the next free mark from the project's templates. */

import { markKeyOf, nextMark, type MarkKey } from "./marks";
import type {
  BeamSpec,
  CeilingJoistSpec,
  ConnectorSpec,
  FootingSpec,
  IJoistSpec,
  JoistSpec,
  MemberSpec,
  PostSpec,
  Project,
  RafterSpec,
  ShearWallSpec,
  TrussSpec,
  WallSpec,
  SteelBeamSpec,
  SteelColumnSpec,
  BasePlateSpec,
  DiaphragmSpec,
  TransferSpec,
  UpliftSpec,
  LedgerSpec,
  MasonryWallSpec,
  RetainingWallSpec,
  GuardPostSpec,
  CfsWallSpec,
  HoldownFootingSpec,
  TieInSpec,
  WoodTrussSpec,
} from "./schema";
import { zeroLoads } from "../core/loads";

export type NewMemberKind =
  | "joist"
  | "rafter"
  | "ceilingJoist"
  | "ijoist"
  | "beam"
  | "header"
  | "ridge"
  | "truss"
  | "wall"
  | "post"
  | "connector"
  | "footing"
  | "pad"
  | "shearWall"
  | "ftaoWall"
  | "roofDiaphragm"
  | "floorDiaphragm"
  | "transfer"
  | "uplift"
  | "ledger"
  | "steelBeam"
  | "steelColumn"
  | "basePlate"
  | "cmuWall"
  | "concreteWall"
  | "holdownFooting"
  | "tieIn"
  | "woodTruss"
  | "retainingWall"
  | "guardPost"
  | "cfsWall";

export const NEW_MEMBER_LABEL: Record<NewMemberKind, string> = {
  joist: "Floor joist (FJ)",
  rafter: "Rafter (R)",
  ceilingJoist: "Ceiling joist / rafter tie (CJ)",
  ijoist: "I-joist (IJ)",
  beam: "Beam (B)",
  header: "Header (H)",
  ridge: "Ridge beam (RB)",
  truss: "Truss — imported reactions (T)",
  wall: "Stud bearing wall (W)",
  post: "Post (P)",
  connector: "Connector / hanger / tie (CN)",
  footing: "Continuous footing (F)",
  pad: "Pad footing (PF)",
  shearWall: "Shear wall (SW)",
  ftaoWall: "Shear wall — force transfer around opening (SW)",
  roofDiaphragm: "Roof diaphragm (RD)",
  floorDiaphragm: "Floor diaphragm (FD)",
  transfer: "Shear transfer connection (ST)",
  uplift: "Wind uplift load path (UP)",
  ledger: "Ledger (LG)",
  steelBeam: "Steel beam / lintel (SB)",
  steelColumn: "Steel column — HSS / pipe (SC)",
  basePlate: "Column base plate + anchor rods (BP)",
  cmuWall: "CMU wall / stem wall (CW)",
  concreteWall: "Concrete wall / stem wall (CW)",
  holdownFooting: "Shear-wall / hold-down footing (HF)",
  tieIn: "Tie-in to existing concrete — dowels / adhesive anchors (TI)",
  woodTruss: "Wood truss — designed in HouseCalc (T)",
  retainingWall: "Cantilever retaining wall (RW)",
  guardPost: "Deck guard post (GP)",
  cfsWall: "Cold-formed steel stud wall (CS)",
};

let counter = 0;
export const newId = (prefix = "m") => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newMemberSpec(p: Project, kind: NewMemberKind, structureId: string, levelId: string): MemberSpec {
  const level = p.structures.find((s) => s.id === structureId)?.levels.find((l) => l.id === levelId);
  const lvNo = level?.number ?? 1;
  const key: MarkKey =
    kind === "ftaoWall"
      ? "shearWall"
      : kind === "cmuWall" || kind === "concreteWall"
        ? "masonryWall"
        : kind === "woodTruss"
          ? "truss"
          : kind;
  const base = {
    id: newId(),
    mark: nextMark(p, key, lvNo),
    description: "",
    structureId,
    levelId,
    status: "new" as const,
    links: [],
  };
  const roofDead = p.assemblies.find((a) => a.kind === "roof")?.id;
  const wallDead = p.assemblies.find((a) => a.kind === "wall")?.id;
  const floorDead = p.assemblies.find((a) => a.kind === "floor")?.id;
  const ceilDead = p.assemblies.find((a) => a.kind === "ceiling")?.id;
  switch (kind) {
    case "joist":
      return {
        kind: "joist",
        ...base,
        species: "DF-L",
        grade: "No.2",
        size: "2x10",
        spacing: 16,
        spans: [12],
        dead: { assemblyId: floorDead },
        live: { use: "living" },
        extra: [],
        bearing: [1.5, 1.5],
        luBottom: 0,
        rule441: false,
        deflection: { preset: "floor" },
      } satisfies JoistSpec;
    case "rafter":
      return {
        kind: "rafter",
        ...base,
        species: "DF-L",
        grade: "No.2",
        size: "2x8",
        spacing: 24,
        rise: 4,
        run: 12,
        overhang: 1.5,
        ridge: "beam",
        plateSeat: 3.5,
        ridgeSeat: 0,
        seatCut: 0,
        dead: { assemblyId: roofDead },
        roofLive: true,
        snow: true,
        deflection: { preset: "roof-nonplaster" },
        luBottom: 4,
        rule441: false,
        gable: true,
      } satisfies RafterSpec;
    case "ceilingJoist":
      return {
        kind: "ceilingJoist",
        ...base,
        species: "DF-L",
        grade: "No.2",
        size: "2x6",
        spacing: 24,
        spans: [12],
        dead: { assemblyId: ceilDead },
        live: { use: "attic-no-storage" },
        extra: [],
        bearing: [3.5, 3.5],
        deflection: { preset: "roof-nonplaster" },
        luTop: 0,
        rule441: true,
      } satisfies CeilingJoistSpec;
    case "ijoist":
      return {
        kind: "ijoist",
        ...base,
        series: "TJI 210",
        depth: '11-7/8"',
        spacing: 16,
        spans: [14],
        dead: { assemblyId: floorDead },
        live: { use: "living" },
        extra: [],
        bearing: [1.75, 1.75],
        deflection: { preset: "floor" },
      } satisfies IJoistSpec;
    case "beam":
    case "header":
    case "ridge":
      return {
        kind: "beam",
        ...base,
        role: kind === "ridge" ? "ridge" : kind,
        material: { kind: "sawn", species: "DF-L", grade: "No.2", size: kind === "header" ? "4x8" : "4x10", plies: 1 },
        spans: [kind === "header" ? 6 : 10],
        area: [],
        walls: [],
        extra: [],
        bearing: [3, 3],
        luTop: 0,
        luBottom: 0,
        deflection: { preset: kind === "beam" ? "floor" : "roof-nonplaster" },
        selfWeight: true,
      } satisfies BeamSpec;
    case "truss":
      return {
        kind: "truss",
        ...base,
        spacing: 24,
        girder: false,
        plies: 1,
        span: 24,
        designRef: "",
        bearings: [
          { name: "Left", x: 0, D: 0, L: 0, Lr: 0, S: 0, W: 0, width: 1.5 },
          { name: "Right", x: 24, D: 0, L: 0, Lr: 0, S: 0, W: 0, width: 1.5 },
        ],
        plate: { species: "DF-L", grade: "No.2", size: "2x6" },
      } satisfies TrussSpec;
    case "wall":
      return {
        kind: "wall",
        ...base,
        species: "DF-L",
        grade: "Stud",
        size: "2x6",
        spacing: 16,
        plateHeight: 9,
        topPlates: 2,
        bottomPlates: 1,
        length: 12,
        sheathing: "both",
        self: { assemblyId: wallDead },
        area: [],
        walls: [],
        extra: [],
        wind: { mode: "computed", zone: 4 },
        deflN: 240,
        packs: [],
        openings: [],
      } satisfies WallSpec;
    case "post":
      return {
        kind: "post",
        ...base,
        material: { kind: "sawn", species: "DF-L", grade: "No.1", size: "6x6", plies: 1 },
        height: 8,
        Ke: 1,
        extra: [],
        bearing: { on: "concrete" },
        selfWeight: true,
      } satisfies PostSpec;
    case "connector":
      return {
        kind: "connector",
        ...base,
        hardwareId: p.hardware.find((h) => h.kind === "tie")?.id ?? p.hardware[0]?.id ?? "",
        quantity: 1,
        sourceId: p.members[0]?.id ?? "",
        support: 0,
      } satisfies ConnectorSpec;
    case "footing":
    case "pad":
      return {
        kind: "footing",
        ...base,
        type: kind === "pad" ? "pad" : "strip",
        B: kind === "pad" ? 2 : 1.25,
        L: kind === "pad" ? 2 : undefined,
        h: 12,
        depth: 18,
        c1: kind === "pad" ? 5.5 : 6,
        c2: kind === "pad" ? 5.5 : undefined,
        rebar: kind === "pad" ? { size: "#4", count: 3 } : undefined,
        longitudinal: kind === "pad" ? undefined : { size: "#4", top: 1, bottom: 1 },
        extra: [],
        stories: 1,
      } satisfies FootingSpec;
    case "shearWall":
    case "ftaoWall":
      return {
        kind: "shearWall",
        ...base,
        lineId: p.lateral?.lines[0]?.id ?? "",
        b: 8,
        h: 9,
        sides: [{ key: "SI-15/32-8d", spacing: 6 }],
        stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: 16 },
        endPost: { size: "2x4", plies: 2, holeDia: 1 },
        top: { D: 0, L: 0, Lr: 0, S: 0 },
        self: { assemblyId: wallDead },
        overturning: "full",
        holdownId: p.hardware.find((h) => h.kind === "holdown")?.id,
        sill: { type: "cast-in", d: 0.625, spacing: 48, embed: 7, edge: 1.75 },
        sillSize: "2x4",
        windService: { factor: 0.42, limitN: 600 },
        ...(kind === "ftaoWall"
          ? {
              b: 12,
              opening: {
                L1: 3,
                Lo: 6,
                L2: 3,
                ha: 1.5,
                hb: 3,
                strapId: p.hardware.find((h) => h.kind === "strap")?.id,
              },
            }
          : {}),
      } satisfies ShearWallSpec;
    case "roofDiaphragm":
    case "floorDiaphragm": {
      const st = p.lateral?.stories ?? [];
      return {
        kind: "diaphragm",
        ...base,
        level: kind === "roofDiaphragm" ? "roof" : "floor",
        storyId: (kind === "roofDiaphragm" ? st[st.length - 1] : st[0])?.id ?? "",
        dir: "X",
        sheathing: kind === "roofDiaphragm" ? "SH-15/32-8d" : "SH-19/32-10d",
        blocked: false,
        edge: "6/6",
        unblockedCase: 1,
        chord: {
          species: "DF-L",
          grade: "No.2",
          size: "2x6",
          splice: { type: "nails", nail: "16d-common", nails: 12 },
        },
        collectorOmega: false,
      } satisfies DiaphragmSpec;
    }
    case "transfer":
      return {
        kind: "transfer",
        ...base,
        interface: "diaphragm-to-wall",
        source: { kind: "wall", id: p.members.find((m) => m.kind === "shearWall")?.id ?? "" },
        connector: {
          type: "clip",
          hardwareId: p.hardware.find((h) => h.model.startsWith("A35"))?.id ?? "",
          direction: "F1",
        },
        spacing: 24,
      } satisfies TransferSpec;
    case "uplift":
      return {
        kind: "uplift",
        ...base,
        sourceId: p.members.find((m) => m.kind === "rafter" || m.kind === "truss")?.id ?? "",
        support: 0,
        levels: [
          {
            label: "Rafter to top plate",
            deadAbove: 0,
            connector: { type: "hardware", hardwareId: p.hardware.find((h) => h.kind === "tie")?.id ?? "" },
            spacing: 24,
          },
        ],
      } satisfies UpliftSpec;
    case "ledger":
      return {
        kind: "ledger",
        ...base,
        ledger: { species: "DF-L", grade: "No.2", size: "2x12" },
        extra: [],
        lateral: { W: 0, E: 0 },
        fastener: { type: "bolt", D: 0.625, Fyb: 45000, spacing: 24 },
        support: { kind: "concrete", Fe: 7500, embed: 5 },
        continuity: 1.25,
      } satisfies LedgerSpec;
    case "steelBeam":
      return {
        kind: "steelBeam",
        ...base,
        role: "beam",
        shape: "W8x18",
        grade: "A992",
        method: "LRFD",
        spans: [12],
        area: [],
        walls: [],
        extra: [],
        Lb: 0,
        deflection: { preset: "floor" },
        selfWeight: true,
        bearing: [
          { lb: 5.5, support: "post", species: "DF-L", grade: "No.1", size: "6x6" },
          { lb: 5.5, support: "post", species: "DF-L", grade: "No.1", size: "6x6" },
        ],
      } satisfies SteelBeamSpec;
    case "steelColumn":
      return {
        kind: "steelColumn",
        ...base,
        shape: "HSS4x4x1/4",
        grade: "A500C",
        method: "LRFD",
        height: 9,
        Kx: 1,
        Ky: 1,
        extra: [],
        ex: 0,
        ey: 0,
        selfWeight: true,
      } satisfies SteelColumnSpec;
    case "basePlate":
      return {
        kind: "basePlate",
        ...base,
        method: "LRFD",
        sourceId: p.members.find((m) => m.kind === "steelColumn")?.id,
        column: "HSS4x4x1/4",
        P: zeroLoads(),
        M: zeroLoads(),
        V: zeroLoads(),
        plate: { N: 10, B: 10, tp: 0.5, grade: "A36-PL" },
        rod: {
          d: 0.625,
          steel: 0,
          nx: 2,
          ny: 2,
          sx: 6,
          sy: 6,
          e1: 2,
          hef: 7,
          type: "headed",
          Abrg: 0.7,
          eh: 3,
          washer: 0,
          groutPad: false,
        },
        foundation: { edges: [12, 12, 12, 12], ha: 18, cracked: true, condition: "B" },
        weld: { w: 0.1875, FEXX: 70 },
      } satisfies BasePlateSpec;
    case "cmuWall":
    case "concreteWall": {
      const cmu = kind === "cmuWall";
      return {
        kind: "masonryWall",
        ...base,
        material: cmu ? "cmu" : "concrete",
        L: 12,
        h: 3,
        support: "pinned-fixed",
        t: cmu ? 7.625 : 8,
        cmu: cmu
          ? {
              fm: 2000,
              fmSource: "TMS 602 unit strength method — confirm with the specification",
              mortar: "S",
              block: {
                hb: 7.625,
                lb: 15.625,
                tf: 1.25,
                tw: 1.0,
                te: 1.25,
                nWeb: 1,
                nEnd: 2,
                gammaBlock: 115,
                gammaGrout: 140,
              },
              FbFactor: 0.45,
              shearDeformation: true,
            }
          : undefined,
        concrete: cmu ? undefined : { fc: p.criteria.concrete.fc, gamma: 150, cover: 1.5 },
        fy: 60000,
        vertical: { size: "#5", spacing: cmu ? 16 : 16, layout: "center" },
        horizontal: { size: "#4", count: cmu ? 2 : 1, spacing: cmu ? 16 : 12 },
        extra: [],
        eccentricity: 0,
        wind: { W: 0, Wp: 0 },
        seismic: { include: true, Eadd: 0 },
      } satisfies MasonryWallSpec;
    }
    case "holdownFooting": {
      const sw = p.members.find((m) => m.kind === "shearWall");
      return {
        kind: "holdownFooting",
        ...base,
        sourceId: sw?.id ?? "",
        Lf: sw && sw.kind === "shearWall" ? sw.b + 2 : 10,
        B: 1.25,
        h: 18,
        depth: 18,
        longitudinal: { size: "#4", top: 2, bottom: 2 },
        extra: [],
      } satisfies HoldownFootingSpec;
    }
    case "tieIn":
      return {
        kind: "tieIn",
        ...base,
        joint: "New footing to existing footing",
        anchor: { kind: "rebar", size: "#4", fya: 60000, futa: 90000, steelLabel: "ASTM A615 Grade 60" },
        hef: 6,
        spacing: 16,
        ca1: 6,
        ha: 12,
        existing: { fc: 2500, cracked: true, verified: false },
        product: {
          name: "Adhesive — enter the product",
          report: "ACI 318-19 Table 17.6.5.2.5 minimum bond stress (replace with the ICC-ES report values)",
          tauCr: 200,
          tauUncr: 650,
          kcCr: 17,
          kcUncr: 24,
          phiBond: 0.55,
          phiConcrete: 0.65,
          verified: false,
        },
        shearDir: "toward-edge",
        demand: { Nu: 0, Vu: 0, source: "" },
      } satisfies TieInSpec;
    case "woodTruss":
      return {
        kind: "woodTruss",
        ...base,
        type: "fink",
        span: 28,
        pitch: 4,
        overhang: 1.5,
        spacing: 24,
        bearingLen: 3.5,
        tc: { species: "DF-L", grade: "No.2", size: "2x6" },
        bc: { species: "DF-L", grade: "No.2", size: "2x6" },
        web: { species: "DF-L", grade: "No.2", size: "2x4" },
        webBracing: "none",
        roofDead: roofDead ? { assemblyId: roofDead } : { psf: 15, basis: "sloped" },
        ceilingDead: ceilDead ? { assemblyId: ceilDead } : { psf: 10 },
        atticLive: 0,
        roofLive: true,
        snow: p.criteria.snow.pg > 0,
        windUplift: 0,
        netSection: 0.85,
        joint: { type: "plate", value: 100, zone: 12, source: "truss plate manufacturer ESR — enter the value" },
        deflection: { preset: "custom", live: 360, total: 240 },
      } satisfies WoodTrussSpec;
    case "retainingWall":
      return {
        kind: "retainingWall",
        ...base,
        Hr: 4,
        stem: {
          material: "concrete",
          height: 4,
          t: 8,
          concrete: { fc: p.criteria.concrete.fc, gamma: 150, cover: 2 },
          fy: 60000,
          vertical: { size: "#4", spacing: 12, layout: "offset", d: 5.75 },
          horizontal: { size: "#4", count: 1, spacing: 12 },
        },
        footing: {
          toe: 1,
          heel: 2,
          h: 14,
          coverBottom: 3,
          coverTop: 2,
          bottom: { size: "#5", spacing: 12 },
          top: { size: "#5", spacing: 12 },
          longitudinal: { size: "#4", count: 6 },
        },
        soil: {
          efp: 35,
          efpSource: "assumed — confirm with the geotechnical report (IBC 1610.1)",
          surcharge: 0,
          toeCover: 1,
          countToeSoil: false,
          neglectPassive: 1,
        },
        extra: [],
      } satisfies RetainingWallSpec;
    case "guardPost":
      return {
        kind: "guardPost",
        ...base,
        post: { species: "DF-L", grade: "No.1", size: "4x6" },
        wetService: true,
        incised: true,
        guardHeight: 36,
        topBolt: 2,
        s: 8,
        P: 200,
        rail: { w: 0, spacing: 0 },
        bolt: { d: 0.5, Fu: 60000, label: "1/2 in. A307 through-bolts" },
        washer: 2,
        device: {
          model: "Tension device — enter the model",
          capacity: 1500,
          source: "manufacturer catalogue — enter the allowable tension",
          verified: false,
        },
      } satisfies GuardPostSpec;
    case "cfsWall":
      return {
        kind: "cfsWall",
        ...base,
        designation: "362S162-54",
        lip: 0.5,
        Fy: 50000,
        height: 9,
        spacing: 16,
        extra: [],
        W: 0,
        deflWindFactor: 0.42,
        deflLimit: 360,
        table: {
          Pa: 1000,
          Ma: 1000,
          source: "manufacturer / SSMA load table — enter the allowable values",
          verified: false,
        },
        K: 1,
      } satisfies CfsWallSpec;
  }
}

/** Copy of a member with a new id and the next free mark. */
export function duplicateMember(p: Project, m: MemberSpec): MemberSpec {
  const level = p.structures.find((s) => s.id === m.structureId)?.levels.find((l) => l.id === m.levelId);
  return { ...structuredClone(m), id: newId(), mark: nextMark(p, markKeyOf(m), level?.number ?? 1) };
}

/** Number of supports for a member spec (for bearing-length and link pickers). */
export function supportCount(m: MemberSpec): number {
  switch (m.kind) {
    case "rafter":
    case "woodTruss":
      return 2;
    case "truss":
      return m.bearings.length;
    case "wall":
      return 1 + m.packs.length;
    case "post":
      return 1;
    case "connector":
    case "footing":
    case "shearWall":
    case "diaphragm":
    case "transfer":
    case "uplift":
    case "holdownFooting":
    case "tieIn":
    case "retainingWall":
    case "guardPost":
      return 0;
    case "cfsWall":
      return 1;
    case "steelColumn":
      return 2;
    case "basePlate":
    case "ledger":
    case "masonryWall":
      return 1;
    default:
      return m.spans.length + 1;
  }
}

/** Support names for link pickers (matches each module's reaction names). */
export function supportLabels(m: MemberSpec): string[] {
  switch (m.kind) {
    case "rafter":
      return ["Plate", "Ridge"];
    case "woodTruss":
      return ["Left heel (line)", "Right heel (line)"];
    case "truss":
      return m.bearings.map((b) => b.name);
    case "wall":
      return ["Base (line)", ...m.packs.map((k) => k.label || `Stud pack at ${k.x} ft`)];
    case "post":
      return ["Base"];
    case "steelColumn":
      return ["Base", "Base shear"];
    case "basePlate":
      return ["Foundation"];
    case "ledger":
      return ["Wall (line)"];
    case "masonryWall":
    case "cfsWall":
      return ["Base (line)"];
    default:
      return Array.from({ length: supportCount(m) }, (_, i) => String.fromCharCode(65 + i));
  }
}
