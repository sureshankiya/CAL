/**
 * Project-level design: builds the design context from the criteria, orders
 * members so that every load-path source is designed before the members it
 * loads (topological order), turns links into loads on the receiving member,
 * and designs each member. A member that cannot be designed reports its error
 * without stopping the rest of the package.
 */

import { LOAD_TYPES, type LoadType } from "../core/loads";
import {
  designBeam,
  designCeilingJoist,
  designIJoist,
  designJoist,
  designRafter,
  type BeamResult,
  type CeilingJoistResult,
  type DesignContext,
  type ExtraLoad,
  type IJoistResult,
  type JoistResult,
  type RafterResult,
} from "../members";
import type { LoadVector } from "../core/loads";
import type { MemberSpec, Project } from "./schema";

export type AnyResult = JoistResult | RafterResult | CeilingJoistResult | IJoistResult | BeamResult;

export interface DesignOutcome {
  spec: MemberSpec;
  result?: AnyResult;
  error?: string;
  /** members this one takes load from */
  dependsOn: string[];
  /** loads created from links, as applied */
  linked: ExtraLoad[];
}

export interface ProjectDesign {
  ctx: DesignContext;
  outcomes: Map<string, DesignOutcome>;
  order: string[];
  /** members caught in a circular load path */
  circular: string[];
}

export function contextOf(p: Project): DesignContext {
  return {
    cycleId: p.cycleId,
    liveBasis: p.criteria.liveBasis,
    assemblies: p.assemblies,
    roofLive: p.criteria.roofLive,
    snow: p.criteria.snow,
    Kcr: p.criteria.Kcr,
    SDS: p.criteria.seismic.SDS,
  };
}

export function dependencies(m: MemberSpec): string[] {
  const ids = new Set(m.links.map((l) => l.sourceId));
  if (m.kind === "ceilingJoist" && m.tensionFrom) ids.add(m.tensionFrom);
  return [...ids];
}

/** Kahn ordering; members in cycles are returned separately. */
export function designOrder(members: MemberSpec[]): { order: string[]; circular: string[] } {
  const byId = new Map(members.map((m) => [m.id, m]));
  const indeg = new Map<string, number>();
  const users = new Map<string, string[]>();
  for (const m of members) {
    const deps = dependencies(m).filter((d) => byId.has(d));
    indeg.set(m.id, deps.length);
    for (const d of deps) users.set(d, [...(users.get(d) ?? []), m.id]);
  }
  const queue = members.filter((m) => indeg.get(m.id) === 0).map((m) => m.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const u of users.get(id) ?? []) {
      indeg.set(u, indeg.get(u)! - 1);
      if (indeg.get(u) === 0) queue.push(u);
    }
  }
  const circular = members.filter((m) => !order.includes(m.id)).map((m) => m.id);
  return { order, circular };
}

const markOf = (p: Project, id: string) => p.members.find((m) => m.id === id)?.mark ?? id;

function linkLoads(p: Project, m: MemberSpec, outcomes: Map<string, DesignOutcome>): ExtraLoad[] {
  const out: ExtraLoad[] = [];
  for (const l of m.links) {
    const src = outcomes.get(l.sourceId);
    if (!src) throw new Error(`Link ${l.label || l.id}: source member not found`);
    if (!src.result) throw new Error(`Link from ${markOf(p, l.sourceId)} cannot be applied — that member has an error`);
    const r = src.result.reactions[l.support];
    if (!r) throw new Error(`Link from ${src.result.mark}: support ${l.support + 1} does not exist`);
    const label = `${l.label ? `${l.label} — ` : ""}${src.result.mark} reaction ${r.name}${l.factor !== 1 ? ` × ${l.factor}` : ""}`;
    if (l.kind === "point") {
      for (const t of LOAD_TYPES) {
        const P = r.byType[t] * l.factor;
        if (Math.abs(P) > 1e-9)
          out.push({
            kind: "point",
            type: t,
            label,
            P,
            x: l.x ?? 0,
            source: { memberId: l.sourceId, support: l.support },
          });
      }
    } else {
      if (!r.perFoot) throw new Error(`Line link from ${src.result.mark}: not a repetitive member — use a point link`);
      for (const t of LOAD_TYPES) {
        const w = r.perFoot[t] * l.factor;
        if (Math.abs(w) > 1e-9)
          out.push({
            kind: "line",
            type: t,
            label,
            w,
            x1: l.x1,
            x2: l.x2,
            source: { memberId: l.sourceId, support: l.support },
          });
      }
    }
  }
  return out;
}

function tensionOf(
  p: Project,
  rafterId: string,
  outcomes: Map<string, DesignOutcome>,
): { T: LoadVector; source: string } {
  const src = outcomes.get(rafterId);
  if (!src?.result) throw new Error(`Rafter ${markOf(p, rafterId)} has an error — tie force unavailable`);
  if (src.result.kind !== "rafter") throw new Error(`${src.result.mark} is not a rafter`);
  if (!src.result.thrust) throw new Error(`${src.result.mark} has a ridge beam — no rafter thrust to tie`);
  return { T: src.result.thrust.T, source: src.result.mark };
}

function designOne(
  p: Project,
  ctx: DesignContext,
  m: MemberSpec,
  linked: ExtraLoad[],
  outcomes: Map<string, DesignOutcome>,
): AnyResult {
  switch (m.kind) {
    case "joist":
      return designJoist(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "rafter":
      return designRafter(ctx, m);
    case "ceilingJoist":
      return designCeilingJoist(ctx, {
        ...m,
        extra: [...m.extra, ...linked],
        tension: m.tensionFrom ? tensionOf(p, m.tensionFrom, outcomes) : undefined,
      });
    case "ijoist":
      return designIJoist(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "beam":
      return designBeam(ctx, { ...m, extra: [...m.extra, ...linked] });
  }
}

export function designProject(p: Project): ProjectDesign {
  const ctx = contextOf(p);
  const outcomes = new Map<string, DesignOutcome>();
  const { order, circular } = designOrder(p.members);
  for (const id of order) {
    const m = p.members.find((x) => x.id === id)!;
    const o: DesignOutcome = { spec: m, dependsOn: dependencies(m), linked: [] };
    outcomes.set(id, o);
    try {
      o.linked = linkLoads(p, m, outcomes);
      o.result = designOne(p, ctx, m, o.linked, outcomes);
    } catch (e) {
      o.error = e instanceof Error ? e.message : String(e);
    }
  }
  for (const id of circular) {
    const m = p.members.find((x) => x.id === id)!;
    outcomes.set(id, {
      spec: m,
      dependsOn: dependencies(m),
      linked: [],
      error: "Circular load path — this member is loaded by a member it supports",
    });
  }
  return { ctx, outcomes, order, circular };
}

/** Members that take load from the given member (for the load-path view). */
export function supportedBy(p: Project, id: string): MemberSpec[] {
  return p.members.filter((m) => dependencies(m).includes(id));
}

export const loadTypesOf = (v: LoadVector): LoadType[] => LOAD_TYPES.filter((t) => Math.abs(v[t]) > 1e-9);
