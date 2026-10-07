/**
 * Project-level design: builds the design context from the criteria, runs the
 * lateral analysis, orders members so that every load-path source is designed
 * before the members it loads (topological order), turns links into loads on
 * the receiving member, and designs each member. A member that cannot be
 * designed reports its error without stopping the rest of the package.
 *
 * Load path (plan §9): roof → walls / beams / posts → floors → walls / posts →
 * footings. Links carry reactions by load type: repetitive members and walls as
 * line loads (per foot), beams, posts and stud packs as point loads.
 */

import { getCycle } from "../core/codes";
import { LOAD_TYPES, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault } from "../core/provenance";
import { analyseLateral, type LateralResult } from "../lateral/analysis";
import { driftLimitFactor } from "../loads/seismic";
import { velocityPressure } from "../loads/wind";
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
import { designConnector, type ConnectorResult } from "../members/connector";
import { designFooting, type FootingResult } from "../members/footing";
import { designPost, type PostResult } from "../members/post";
import { designShearWall, shearWallWeight, type ShearWallDemand, type ShearWallResult } from "../members/shearWall";
import { designTruss, type TrussResult } from "../members/truss";
import { designWall, type WallResult } from "../members/wall";
import type { MemberSpec, Project, ShearWallSpec } from "./schema";

export type AnyResult =
  | JoistResult
  | RafterResult
  | CeilingJoistResult
  | IJoistResult
  | BeamResult
  | WallResult
  | PostResult
  | TrussResult
  | ConnectorResult
  | FootingResult
  | ShearWallResult;

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
  lateral?: LateralResult;
  lateralError?: string;
}

/** Mean roof height and roof angle from the lateral model (used for C&C wind as well). */
export function buildingHeight(p: Project): { h: number; thetaDeg: number } {
  const lat = p.lateral;
  if (!lat || !lat.stories.length) return { h: 15, thetaDeg: (Math.atan(4 / 12) * 180) / Math.PI };
  const plate = lat.stories.reduce((s, x) => s + x.height, 0);
  const thetaDeg = (Math.atan(lat.pitch / 12) * 180) / Math.PI;
  return { h: thetaDeg <= 10 ? plate : plate + lat.roofRise / 2, thetaDeg };
}

export function contextOf(p: Project): DesignContext {
  const cycle = getCycle(p.cycleId);
  const { h, thetaDeg } = buildingHeight(p);
  const vp = velocityPressure(cycle.asce7, p.criteria.wind.V, h, p.criteria.wind.exposure, p.criteria.wind.Kzt, p.lateral?.Ke ?? 1, false);
  return {
    cycleId: p.cycleId,
    liveBasis: p.criteria.liveBasis,
    assemblies: p.assemblies,
    roofLive: p.criteria.roofLive,
    snow: p.criteria.snow,
    Kcr: p.criteria.Kcr,
    SDS: p.criteria.seismic.SDS,
    windCC: { qEff: vp.qEff, thetaDeg, h, expr: vp.expr },
    hardware: p.hardware,
    concrete: { fc: p.criteria.concrete.fc, fy: p.criteria.concrete.fy },
  };
}

export function dependencies(m: MemberSpec): string[] {
  const ids = new Set(m.links.map((l) => l.sourceId));
  if (m.kind === "ceilingJoist" && m.tensionFrom) ids.add(m.tensionFrom);
  if (m.kind === "connector") ids.add(m.sourceId);
  if (m.kind === "shearWall" && m.upliftFrom) ids.add(m.upliftFrom);
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
      if (!r.perFoot)
        throw new Error(`Line link from ${src.result.mark} ${r.name}: not a line reaction — use a point link`);
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

/** Wall-line demand on a shear wall: its share of the line force. */
function shearWallDemand(
  p: Project,
  s: ShearWallSpec,
  lateral: LateralResult | undefined,
  outcomes: Map<string, DesignOutcome>,
): ShearWallDemand {
  if (!p.lateral?.enabled || !lateral)
    throw new Error("Shear walls need the lateral analysis — enable it under Lateral and assign the wall to a wall line");
  const lf = lateral.lines.find((x) => x.line.id === s.lineId);
  if (!lf) throw new Error("Wall line not found — assign the shear wall to a wall line");
  const inLine = p.members.filter((m): m is ShearWallSpec => m.kind === "shearWall" && m.lineId === s.lineId);
  const weights = inLine.map((m) => shearWallWeight(m));
  const total = weights.reduce((a, b) => a + b, 0);
  const share = total > 0 ? shearWallWeight(s) / total : 0;
  const story = p.lateral.stories.find((x) => x.id === lf.line.storyId)!;
  let stacked: ShearWallDemand["stacked"];
  if (s.upliftFrom) {
    const up = outcomes.get(s.upliftFrom)?.result;
    if (!up || up.kind !== "shearWall") throw new Error("Stacked wall above has an error or is not a shear wall");
    stacked = { mark: up.mark, Ts: up.Tmax.seismic, Tw: up.Tmax.wind, Tu: up.hdAnchor?.Tu ?? 0 };
  }
  return {
    lineName: lf.line.name,
    share,
    Eh: lf.Eh * share,
    QE: (lf.Eh / lateral.rho) * share,
    W: lf.W * share,
    rho: lateral.rho,
    SDS: p.criteria.seismic.SDS,
    Cd: lateral.system.Cd,
    Ie: lateral.Ie,
    Omega0: lateral.system.Omega0,
    hsx: story.height,
    driftFactor: driftLimitFactor(p.criteria.riskCategory, p.lateral.driftLowRise),
    seismicSDC: p.criteria.seismic.SDC,
    stacked,
  };
}

/** Gravity on top of a shear wall: entered plus linked loads (line w; point P spread over the wall). */
function shearWallTop(s: ShearWallSpec, linked: ExtraLoad[]) {
  const top = { ...s.top };
  for (const e of linked) {
    const w = e.kind === "line" ? (e.w ?? 0) : (e.P ?? 0) / s.b;
    if (e.type === "D" || e.type === "L" || e.type === "Lr" || e.type === "S") top[e.type] += w;
  }
  return top;
}

function designOne(
  p: Project,
  ctx: DesignContext,
  m: MemberSpec,
  linked: ExtraLoad[],
  outcomes: Map<string, DesignOutcome>,
  lateral: LateralResult | undefined,
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
    case "wall":
      return designWall(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "post":
      return designPost(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "truss":
      return designTruss(ctx, m);
    case "connector": {
      const src = outcomes.get(m.sourceId);
      if (!src?.result) throw new Error(`Connector source ${markOf(p, m.sourceId)} has an error or is missing`);
      const r = src.result.reactions[m.support];
      if (!r) throw new Error(`${src.result.mark}: support ${m.support + 1} does not exist`);
      return designConnector(ctx, {
        id: m.id,
        mark: m.mark,
        description: m.description,
        hardwareId: m.hardwareId,
        quantity: m.quantity,
        sourceMark: src.result.mark,
        supportName: r.name,
        R: r.byType,
        lateral: m.lateral,
      });
    }
    case "footing":
      return designFooting(ctx, {
        ...m,
        extra: [...m.extra, ...linked],
        fc: p.criteria.concrete.fc,
        fy: p.criteria.concrete.fy,
        cover: p.criteria.concrete.cover,
        qa: m.qaOverride ?? p.criteria.soil.bearing,
        qaSource: m.qaOverride ? "entered on the footing" : p.criteria.soil.source,
        soilDensity: p.criteria.soil.density,
        frostDepth: p.criteria.soil.frostDepth,
      });
    case "shearWall":
      return designShearWall(
        ctx,
        { ...m, top: shearWallTop(m, linked) },
        shearWallDemand(p, m, lateral, outcomes),
      );
  }
}

/** Existing / modified members: assumptions to field-verify and a sheet flag. */
function markExisting(m: MemberSpec, r: AnyResult) {
  if (m.status === "new") return;
  const what = m.status === "existing" ? "Existing member" : "Existing member, modified";
  r.title = `${r.title} (${m.status === "existing" ? "existing" : "existing — modified"})`;
  r.assumptions.unshift(
    fromDefault(
      what,
      `${r.callout} — size, species / grade, condition and bearing ${m.fieldVerified ? "verified in the field" : "assumed; field verify before construction"}${m.existingNote ? ` (${m.existingNote})` : ""}`,
      m.fieldVerified ? "field verified" : "assumed existing condition",
      !m.fieldVerified,
    ),
  );
  r.flags.unshift(
    `${what.toUpperCase()} — re-checked for the new loads. ${m.fieldVerified ? "Properties verified in the field." : "Field verify size, grade, condition and bearing; notify the engineer of any difference."}`,
  );
}

export function designProject(p: Project): ProjectDesign {
  const ctx = contextOf(p);
  let lateral: LateralResult | undefined;
  let lateralError: string | undefined;
  if (p.lateral?.enabled) {
    try {
      lateral = analyseLateral(
        p.lateral,
        {
          cycleId: p.cycleId,
          riskCategory: p.criteria.riskCategory,
          SDS: p.criteria.seismic.SDS,
          SD1: p.criteria.seismic.SD1,
          V: p.criteria.wind.V,
          exposure: p.criteria.wind.exposure,
          Kzt: p.criteria.wind.Kzt,
        },
        p.assemblies,
      );
    } catch (e) {
      lateralError = e instanceof Error ? e.message : String(e);
    }
  }
  const outcomes = new Map<string, DesignOutcome>();
  const { order, circular } = designOrder(p.members);
  for (const id of order) {
    const m = p.members.find((x) => x.id === id)!;
    const o: DesignOutcome = { spec: m, dependsOn: dependencies(m), linked: [] };
    outcomes.set(id, o);
    try {
      o.linked = linkLoads(p, m, outcomes);
      o.result = designOne(p, ctx, m, o.linked, outcomes, lateral);
      markExisting(m, o.result);
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
  return { ctx, outcomes, order, circular, lateral, lateralError };
}

/** Members that take load from the given member (for the load-path view). */
export function supportedBy(p: Project, id: string): MemberSpec[] {
  return p.members.filter((m) => dependencies(m).includes(id));
}

export const loadTypesOf = (v: LoadVector): LoadType[] => LOAD_TYPES.filter((t) => Math.abs(v[t]) > 1e-9);

export const emptyVector = zeroLoads;
