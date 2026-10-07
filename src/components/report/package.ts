/**
 * House report composition: the ordered list of sheets (plan §11) with sheet
 * numbers, used by the report renderer, the table of contents and the
 * package navigator. Members are grouped roof first, then floors from the top
 * down; within a level: rafters, ceiling joists, ridge beams, beams and
 * headers, joists, I-joists.
 */

import type { MemberSpec, Project, ProjectDesign } from "@/engine/project";
import { duplicateMarks } from "@/engine/project";

export type SheetKind =
  | "cover"
  | "summary"
  | "criteria"
  | "loads"
  | "lateral"
  | "member"
  | "loadpath"
  | "schedules"
  | "general-notes"
  | "assumptions";

export interface SheetEntry {
  key: string;
  kind: SheetKind;
  /** title-block "Section" */
  section: string;
  /** contents line */
  title: string;
  memberId?: string;
  group?: string;
  sheetNo: number;
}

const KIND_ORDER: Record<string, number> = {
  truss: 0,
  rafter: 0,
  ceilingJoist: 1,
  ridge: 2,
  beam: 3,
  header: 3,
  flush: 3,
  dropped: 3,
  joist: 4,
  ijoist: 5,
  wall: 6,
  post: 7,
  shearWall: 8,
  connector: 9,
  footing: 10,
};

function orderKey(m: MemberSpec): number {
  return m.kind === "beam" ? KIND_ORDER[m.role] : KIND_ORDER[m.kind];
}

export function levelGroups(p: Project): Array<{ key: string; title: string; members: MemberSpec[] }> {
  const groups: Array<{ key: string; title: string; members: MemberSpec[] }> = [];
  for (const s of p.structures) {
    const levels = [...s.levels].sort((a, b) => b.number - a.number);
    for (const lv of levels) {
      const members = p.members
        .filter((m) => m.structureId === s.id && m.levelId === lv.id)
        .sort((a, b) => orderKey(a) - orderKey(b) || a.mark.localeCompare(b.mark, undefined, { numeric: true }));
      if (members.length)
        groups.push({
          key: `${s.id}:${lv.id}`,
          title: `${p.structures.length > 1 ? `${s.name} — ` : ""}${lv.name}`,
          members,
        });
    }
  }
  const placed = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));
  const loose = p.members.filter((m) => !placed.has(m.id));
  if (loose.length) groups.push({ key: "unassigned", title: "Unassigned level", members: loose });
  return groups;
}

export function buildPackage(p: Project, design: ProjectDesign): SheetEntry[] {
  const out: Omit<SheetEntry, "sheetNo">[] = [
    { key: "cover", kind: "cover", section: "Cover", title: "Cover — project, code cycle, Engineer of Record" },
    {
      key: "summary",
      kind: "summary",
      section: "Contents & summary",
      title: "Table of contents, member summary and package checks",
    },
    { key: "criteria", kind: "criteria", section: "Design criteria", title: "Design criteria" },
    { key: "loads", kind: "loads", section: "Design loads", title: "Dead, live, roof live and snow loads" },
  ];
  if (p.lateral?.enabled)
    out.push({
      key: "lateral",
      kind: "lateral",
      section: "Lateral analysis",
      title: "Seismic (ELF) and wind (MWFRS) story forces, wall-line distribution",
    });
  for (const g of levelGroups(p)) {
    for (const m of g.members) {
      const o = design.outcomes.get(m.id);
      const title = o?.result
        ? `${m.mark} — ${o.result.title}: ${o.result.callout}`
        : `${m.mark} — ${o?.error ? "ERROR" : "not designed"}`;
      out.push({
        key: `m-${m.id}`,
        kind: "member",
        section: `${m.mark} — ${o?.result?.title ?? m.kind}`,
        title,
        memberId: m.id,
        group: g.title,
      });
    }
  }
  out.push(
    {
      key: "loadpath",
      kind: "loadpath",
      section: "Load path",
      title: "Load-path summary — reactions carried from roof to foundation",
    },
    {
      key: "schedules",
      kind: "schedules",
      section: "Schedules",
      title: "Framing, beam, wall, post, shear wall, hold-down, connector and foundation schedules",
    },
    {
      key: "general-notes",
      kind: "general-notes",
      section: "General notes",
      title: "General structural notes and specific notes",
    },
    { key: "assumptions", kind: "assumptions", section: "Assumption log", title: "Assumption log and items to verify" },
  );
  return out.map((s, i) => ({ ...s, sheetNo: i + 1 }));
}

export interface PackageCheck {
  ok: boolean;
  text: string;
}

/** Package consistency checks (plan §11): marks, errors, failures, VERIFY data, load path, uplift ties, lateral. */
export function packageChecks(p: Project, design: ProjectDesign): PackageCheck[] {
  const dup = duplicateMarks(p);
  const outcomes = [...design.outcomes.values()];
  const errors = outcomes.filter((o) => o.error);
  const fails = outcomes.filter((o) => o.result && !o.result.pass);
  const verify = outcomes.reduce((n, o) => n + (o.result ? o.result.assumptions.filter((a) => a.verify).length : 0), 0);
  const carried = new Set(p.members.flatMap((m) => m.links.map((l) => `${l.sourceId}:${l.support}`)));
  const tied = new Set(p.members.flatMap((m) => (m.kind === "connector" ? [`${m.sourceId}:${m.support}`] : [])));
  const uncarried: string[] = [];
  const untied: string[] = [];
  for (const o of outcomes) {
    if (!o.result) continue;
    o.result.reactions.forEach((r, i) => {
      // ridge-board rafters: the ridge reaction is resisted by the opposing rafter (internal to the pair)
      if (o.result!.kind === "rafter" && o.result!.input.ridge === "board" && i === 1) return;
      if (r.maxDown > 1 && !carried.has(`${o.spec.id}:${i}`)) uncarried.push(`${o.result!.mark} ${r.name}`);
      if (r.minNet < -1 && !tied.has(`${o.spec.id}:${i}`)) untied.push(`${o.result!.mark} ${r.name}`);
    });
  }
  const out: PackageCheck[] = [
    { ok: dup.length === 0, text: dup.length ? `Duplicate marks: ${dup.join(", ")}` : "Member marks are unique" },
    {
      ok: errors.length === 0,
      text: errors.length
        ? `Members with errors: ${errors.map((e) => e.spec.mark).join(", ")}`
        : "Every member designed without error",
    },
    {
      ok: fails.length === 0,
      text: fails.length
        ? `Members failing: ${fails.map((e) => e.spec.mark).join(", ")}`
        : "Every member passes all checks",
    },
    {
      ok: verify === 0,
      text: verify ? `${verify} item(s) marked VERIFY — resolve before the package is issued` : "No VERIFY items",
    },
    {
      ok: uncarried.length === 0,
      text: uncarried.length
        ? `Reactions not yet carried to a supporting member or footing: ${uncarried.join(", ")}`
        : "Every reaction is carried down to a supporting member or footing",
    },
    {
      ok: untied.length === 0,
      text: untied.length
        ? `Net uplift without a connector: ${untied.join(", ")}`
        : "Every net uplift reaction has a connector",
    },
  ];
  if (p.lateral?.enabled) {
    if (design.lateralError) out.push({ ok: false, text: `Lateral analysis: ${design.lateralError}` });
    for (const w of design.lateral?.warnings ?? []) out.push({ ok: false, text: `Lateral: ${w}` });
    const lines = design.lateral?.lines ?? [];
    const empty = lines.filter((l) => !p.members.some((m) => m.kind === "shearWall" && m.lineId === l.line.id));
    out.push({
      ok: empty.length === 0,
      text: empty.length
        ? `Wall lines without shear walls: ${empty.map((l) => l.line.name).join(", ")}`
        : "Every wall line has at least one shear wall",
    });
  }
  return out;
}
