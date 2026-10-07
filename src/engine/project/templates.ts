/** Default specs for new members, with the next free mark from the project's templates. */

import { nextMark, type MarkKey } from "./marks";
import type { BeamSpec, CeilingJoistSpec, IJoistSpec, JoistSpec, MemberSpec, Project, RafterSpec } from "./schema";

export type NewMemberKind = "joist" | "rafter" | "ceilingJoist" | "ijoist" | "beam" | "header" | "ridge";

export const NEW_MEMBER_LABEL: Record<NewMemberKind, string> = {
  joist: "Floor joist (FJ)",
  rafter: "Rafter (R)",
  ceilingJoist: "Ceiling joist / rafter tie (CJ)",
  ijoist: "I-joist (IJ)",
  beam: "Beam (B)",
  header: "Header (H)",
  ridge: "Ridge beam (RB)",
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
  }
}

/** Copy of a member with a new id and the next free mark. */
export function duplicateMember(p: Project, m: MemberSpec): MemberSpec {
  const level = p.structures.find((s) => s.id === m.structureId)?.levels.find((l) => l.id === m.levelId);
  const key: MarkKey = m.kind === "beam" ? (m.role as MarkKey) : (m.kind as MarkKey);
  return { ...structuredClone(m), id: newId(), mark: nextMark(p, key, level?.number ?? 1) };
}

/** Number of supports for a member spec (for bearing-length and link pickers). */
export function supportCount(m: MemberSpec): number {
  if (m.kind === "rafter") return 2;
  return m.spans.length + 1;
}
