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
} from "./schema";

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
  | "shearWall";

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
};

let counter = 0;
export const newId = (prefix = "m") => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newMemberSpec(p: Project, kind: NewMemberKind, structureId: string, levelId: string): MemberSpec {
  const level = p.structures.find((s) => s.id === structureId)?.levels.find((l) => l.id === levelId);
  const lvNo = level?.number ?? 1;
  const key: MarkKey = kind;
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
      } satisfies ShearWallSpec;
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
      return 0;
    default:
      return m.spans.length + 1;
  }
}

/** Support names for link pickers (matches each module's reaction names). */
export function supportLabels(m: MemberSpec): string[] {
  switch (m.kind) {
    case "rafter":
      return ["Plate", "Ridge"];
    case "truss":
      return m.bearings.map((b) => b.name);
    case "wall":
      return ["Base (line)", ...m.packs.map((k) => k.label || `Stud pack at ${k.x} ft`)];
    case "post":
      return ["Base"];
    default:
      return Array.from({ length: supportCount(m) }, (_, i) => String.fromCharCode(65 + i));
  }
}
