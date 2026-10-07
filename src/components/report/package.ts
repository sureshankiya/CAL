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
  "cover" | "summary" | "criteria" | "loads" | "member" | "schedules" | "general-notes" | "assumptions";

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
  rafter: 0,
  ceilingJoist: 1,
  ridge: 2,
  beam: 3,
  header: 3,
  flush: 3,
  dropped: 3,
  joist: 4,
  ijoist: 5,
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
    { key: "schedules", kind: "schedules", section: "Schedules", title: "Framing and beam / header schedules" },
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

/** Phase 1 consistency checks (plan §11): marks, errors, failures, VERIFY data, reactions not carried. */
export function packageChecks(p: Project, design: ProjectDesign): PackageCheck[] {
  const dup = duplicateMarks(p);
  const errors = [...design.outcomes.values()].filter((o) => o.error);
  const fails = [...design.outcomes.values()].filter((o) => o.result && !o.result.pass);
  const verify = [...design.outcomes.values()].reduce(
    (n, o) => n + (o.result ? o.result.assumptions.filter((a) => a.verify).length : 0),
    0,
  );
  const carried = new Set(p.members.flatMap((m) => m.links.map((l) => `${l.sourceId}:${l.support}`)));
  const uncarried: string[] = [];
  for (const o of design.outcomes.values()) {
    if (!o.result) continue;
    o.result.reactions.forEach((r, i) => {
      if (r.maxDown > 1 && !carried.has(`${o.spec.id}:${i}`)) uncarried.push(`${o.result!.mark} ${r.name}`);
    });
  }
  return [
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
      ok: true,
      text: uncarried.length
        ? `Reactions to walls, posts or foundations (carried in Phase 2 load takedown): ${uncarried.join(", ")}`
        : "Every reaction is carried by a supporting member",
    },
  ];
}
