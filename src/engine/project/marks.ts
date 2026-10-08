/**
 * Member marks from configurable templates, so marks match the drawings
 * (e.g. B101 = level 1, sequence 01; FJ-1; R-1). Tokens: {L} level number,
 * {n} sequence, {nn} two-digit sequence.
 */

import type { MemberSpec, Project } from "./schema";

export type MarkKey =
  | "joist"
  | "rafter"
  | "ceilingJoist"
  | "ijoist"
  | "beam"
  | "header"
  | "ridge"
  | "flush"
  | "dropped"
  | "wall"
  | "post"
  | "truss"
  | "connector"
  | "footing"
  | "pad"
  | "shearWall"
  | "steelBeam"
  | "steelColumn"
  | "basePlate"
  | "roofDiaphragm"
  | "floorDiaphragm"
  | "transfer"
  | "uplift"
  | "ledger";

export const DEFAULT_MARKS: Record<MarkKey, string> = {
  joist: "FJ-{n}",
  rafter: "R-{n}",
  ceilingJoist: "CJ-{n}",
  ijoist: "IJ-{n}",
  beam: "B-{n}",
  header: "H-{n}",
  ridge: "RB-{n}",
  flush: "FB-{n}",
  dropped: "DB-{n}",
  wall: "{L}W-{n}",
  post: "P-{n}",
  truss: "T-{n}",
  connector: "CN-{n}",
  footing: "F-{n}",
  pad: "PF-{n}",
  shearWall: "{L}SW-{n}",
  steelBeam: "SB-{n}",
  steelColumn: "SC-{n}",
  basePlate: "BP-{n}",
  roofDiaphragm: "RD-{n}",
  floorDiaphragm: "FD-{n}",
  transfer: "ST-{n}",
  uplift: "UP-{n}",
  ledger: "LG-{n}",
};

export const markKeyOf = (m: Pick<MemberSpec, "kind"> & { role?: string; type?: string; level?: string }): MarkKey =>
  m.kind === "beam"
    ? ((m.role ?? "beam") as MarkKey)
    : m.kind === "footing"
      ? m.type === "pad"
        ? "pad"
        : "footing"
      : m.kind === "diaphragm"
        ? m.level === "floor"
          ? "floorDiaphragm"
          : "roofDiaphragm"
        : (m.kind as MarkKey);

export function formatMark(template: string, level: number, seq: number): string {
  return template
    .replace(/\{L\}/g, String(level))
    .replace(/\{nn\}/g, String(seq).padStart(2, "0"))
    .replace(/\{n\}/g, String(seq));
}

/** Next free mark for a member key on a level. */
export function nextMark(p: Project, key: MarkKey, levelNumber: number): string {
  const template = p.marks[key] ?? DEFAULT_MARKS[key];
  const used = new Set(p.members.map((m) => m.mark));
  for (let seq = 1; seq < 1000; seq++) {
    const mark = formatMark(template, levelNumber, seq);
    if (!used.has(mark)) return mark;
  }
  return formatMark(template, levelNumber, 999);
}

/** Duplicate marks across the project (each must be unique on drawings and schedules). */
export function duplicateMarks(p: Project): string[] {
  const seen = new Map<string, number>();
  for (const m of p.members) seen.set(m.mark, (seen.get(m.mark) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
