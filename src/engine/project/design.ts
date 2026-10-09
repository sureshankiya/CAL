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
import { soilClass } from "../data/soil";
import { analyseLateral, type Dir, type LateralResult } from "../lateral/analysis";
import { rigidDistribution, type RigidStoryResult } from "../lateral/rigid";
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
import { designDiaphragm, type DiaphragmDemand, type DiaphragmResult } from "../members/diaphragm";
import { designLedger, type LedgerResult } from "../members/ledger";
import { designMasonryWall, type MasonryWallResult } from "../members/masonryWall";
import { designHoldownFooting, type HoldownFootingResult } from "../members/holdownFooting";
import { designTieIn, type TieInResult } from "../members/tieIn";
import { designWoodTruss, type WoodTrussResult } from "../members/woodTruss";
import { designRetainingWall, type RetainingWallResult } from "../members/retainingWall";
import { designGuardPost, type GuardPostResult } from "../members/guardPost";
import { designCfsWall, type CfsWallResult } from "../members/cfsWall";
import {
  designBasePlateMember,
  designSteelBeam,
  designSteelColumn,
  type BasePlateMemberResult,
  type SteelBeamResult,
  type SteelColumnResult,
} from "../members/steel";
import { designTransfer, type TransferDemand, type TransferResult } from "../members/transfer";
import { designUplift, type UpliftResult } from "../members/uplift";
import type { DiaphragmSpec, MemberSpec, Project, ShearWallSpec, TransferSpec } from "./schema";

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
  | ShearWallResult
  | SteelBeamResult
  | SteelColumnResult
  | BasePlateMemberResult
  | DiaphragmResult
  | TransferResult
  | UpliftResult
  | LedgerResult
  | MasonryWallResult
  | HoldownFootingResult
  | TieInResult
  | WoodTrussResult
  | RetainingWallResult
  | GuardPostResult
  | CfsWallResult;

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
  const vp = velocityPressure(
    cycle.asce7,
    p.criteria.wind.V,
    h,
    p.criteria.wind.exposure,
    p.criteria.wind.Kzt,
    p.lateral?.Ke ?? 1,
    false,
  );
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
  if (m.kind === "basePlate" && m.sourceId) ids.add(m.sourceId);
  if (m.kind === "uplift") ids.add(m.sourceId);
  if (m.kind === "holdownFooting") ids.add(m.sourceId);
  if (m.kind === "transfer" && m.source.kind === "wall") ids.add(m.source.id);
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

/** Seismic importance factor I_e (ASCE 7 Table 1.5-2). */
const importanceFactor = (rc: string) => ({ I: 1, II: 1, III: 1.25, IV: 1.5 })[rc] ?? 1;

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
    throw new Error(
      "Shear walls need the lateral analysis — enable it under Lateral and assign the wall to a wall line",
    );
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
        qaVerify: qaNeedsVerify(p, m.qaOverride ?? p.criteria.soil.bearing, !!m.qaOverride),
        soilDensity: p.criteria.soil.density,
        frostDepth: p.criteria.soil.frostDepth,
      });
    case "shearWall":
      return designShearWall(ctx, { ...m, top: shearWallTop(m, linked) }, shearWallDemand(p, m, lateral, outcomes));
    case "steelBeam":
      return designSteelBeam(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "steelColumn":
      return designSteelColumn(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "basePlate": {
      const P = { ...m.P };
      const V = { ...m.V };
      let column = m.column;
      let sourceMark: string | undefined;
      if (m.sourceId) {
        const src = outcomes.get(m.sourceId)?.result;
        if (!src) throw new Error(`Column ${markOf(p, m.sourceId)} has an error or is missing`);
        if (src.kind !== "steelColumn") throw new Error(`${src.mark} is not a steel column`);
        for (const t of LOAD_TYPES) {
          P[t] += src.reactions[0].byType[t];
          V[t] += src.reactions[1].byType[t];
        }
        column = src.shape.name;
        sourceMark = src.mark;
      }
      return designBasePlateMember(ctx, {
        ...m,
        P,
        V,
        column,
        sourceMark,
        fc: p.criteria.concrete.fc,
        seismic: ["C", "D", "E", "F"].includes(p.criteria.seismic.SDC),
      });
    }
    case "diaphragm":
      return designDiaphragm(ctx, m, diaphragmDemand(p, m, lateral));
    case "transfer":
      return designTransfer(ctx, m, transferDemand(p, m, lateral, outcomes));
    case "uplift": {
      const src = outcomes.get(m.sourceId)?.result;
      if (!src) throw new Error(`Uplift source ${markOf(p, m.sourceId)} has an error or is missing`);
      const r = src.reactions[m.support];
      if (!r) throw new Error(`${src.mark}: support ${m.support + 1} does not exist`);
      if (!r.perFoot) throw new Error(`${src.mark} ${r.name}: not a repetitive member — no reaction per foot`);
      return designUplift(ctx, { ...m, sourceMark: `${src.mark} ${r.name}`, perFoot: r.perFoot });
    }
    case "ledger":
      return designLedger(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "masonryWall":
      return designMasonryWall(ctx, {
        ...m,
        extra: [...m.extra, ...linked],
        seismic: {
          include: m.seismic.include,
          Eadd: m.seismic.Eadd,
          SDC: p.criteria.seismic.SDC,
          Ie: importanceFactor(p.criteria.riskCategory),
          SDS: p.criteria.seismic.SDS,
        },
      });
    case "holdownFooting": {
      const src = outcomes.get(m.sourceId)?.result;
      if (!src) throw new Error(`Shear wall ${markOf(p, m.sourceId)} has an error or is missing`);
      if (src.kind !== "shearWall") throw new Error(`${src.mark} is not a shear wall`);
      const sc = p.criteria.soil.class ? soilClass(p.criteria.soil.class) : undefined;
      return designHoldownFooting(ctx, {
        ...m,
        extra: [...m.extra, ...linked],
        fc: p.criteria.concrete.fc,
        fy: p.criteria.concrete.fy,
        cover: p.criteria.concrete.cover,
        qa: m.qaOverride ?? p.criteria.soil.bearing,
        qaSource: m.qaOverride ? "entered on the footing" : p.criteria.soil.source,
        soilDensity: p.criteria.soil.density,
        friction: sc ? sc.friction : 0.25,
        cohesion: sc?.cohesion,
        lateralBearing: sc ? sc.lateral : 100,
        soilSource: sc
          ? `IBC Table 1806.2, class ${sc.id}`
          : "IBC Table 1806.2 (class not set — 0.25 / 100 psf/ft assumed)",
        wall: src,
      });
    }
    case "woodTruss":
      return designWoodTruss(ctx, m);
    case "retainingWall": {
      const sc = p.criteria.soil.class ? soilClass(p.criteria.soil.class) : undefined;
      return designRetainingWall(ctx, {
        ...m,
        footing: { ...m.footing, fc: p.criteria.concrete.fc, fy: p.criteria.concrete.fy },
        soil: {
          ...m.soil,
          gamma: p.criteria.soil.density,
          passive: sc ? sc.lateral : 100,
          friction: sc ? sc.friction : 0.25,
          cohesion: sc?.cohesion,
          qa: m.soil.qaOverride ?? p.criteria.soil.bearing,
          qaSource: m.soil.qaOverride ? "entered on the wall" : p.criteria.soil.source,
          soilSource: sc
            ? `IBC Table 1806.2, class ${sc.id}`
            : "IBC Table 1806.2 (class not set — 0.25 / 100 psf/ft assumed)",
        },
        extra: [...m.extra, ...linked],
        seismicSDC: p.criteria.seismic.SDC,
      });
    }
    case "guardPost":
      return designGuardPost(ctx, m);
    case "cfsWall":
      return designCfsWall(ctx, { ...m, extra: [...m.extra, ...linked] });
    case "tieIn":
      return designTieIn(ctx, {
        ...m,
        seismic: ["C", "D", "E", "F"].includes(p.criteria.seismic.SDC),
      });
  }
}

/** Plan dimensions: span direction (perpendicular to the load) and depth (parallel to it). */
const planOf = (p: Project, dir: Dir) => {
  const lat = p.lateral!;
  return dir === "X" ? { Dspan: lat.Ly, Dpar: lat.Lx } : { Dspan: lat.Lx, Dpar: lat.Ly };
};

/** Effective length of a shear wall for line sharing and collectors (FTAO: the piers). */
const wallLength = (w: ShearWallSpec) => (w.opening ? w.opening.L1 + w.opening.L2 : w.b);

function diaphragmDemand(p: Project, d: DiaphragmSpec, lateral: LateralResult | undefined): DiaphragmDemand {
  if (!p.lateral?.enabled || !lateral)
    throw new Error("Diaphragms need the lateral analysis — enable it under Lateral");
  const sf = lateral.stories.find((x) => x.storyId === d.storyId);
  if (!sf) throw new Error("Diaphragm: story not found");
  const lines = p.lateral.lines.filter((l) => l.storyId === d.storyId && l.dir === d.dir);
  if (!lines.length) throw new Error(`Diaphragm: no ${d.dir} wall lines in ${sf.name}`);
  const missing = lines.filter((l) => l.pos === undefined);
  if (missing.length)
    throw new Error(`Diaphragm: enter the plan position of wall line(s) ${missing.map((l) => l.name).join(", ")}`);
  const { Dspan, Dpar } = planOf(p, d.dir);
  return {
    storyName: sf.name,
    Fpx: sf.Fpx,
    FpxCalc: sf.FpxCalc,
    FpxMin: sf.FpxMin,
    FpxMax: sf.FpxMax,
    Fw: sf.windF[d.dir],
    Dspan,
    Dpar,
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      pos: l.pos!,
      walls: p.members
        .filter((m): m is ShearWallSpec => m.kind === "shearWall" && m.lineId === l.id)
        .flatMap((w) =>
          // FTAO wall: its two full-height piers (the opening is spanned by the strap / header)
          w.opening
            ? [
                { mark: `${w.mark} pier 1`, L: w.opening.L1, x: w.x },
                {
                  mark: `${w.mark} pier 2`,
                  L: w.opening.L2,
                  x: w.x === undefined ? undefined : w.x + w.opening.L1 + w.opening.Lo,
                },
              ]
            : [{ mark: w.mark, L: wallLength(w), x: w.x }],
        ),
    })),
    Omega0: lateral.system.Omega0,
    lightFrame: p.lateral.system === "wsp",
    SDC: p.criteria.seismic.SDC,
  };
}

function transferDemand(
  p: Project,
  t: TransferSpec,
  lateral: LateralResult | undefined,
  outcomes: Map<string, DesignOutcome>,
): TransferDemand {
  if (t.source.kind === "wall") {
    const r = outcomes.get(t.source.id)?.result;
    if (!r || r.kind !== "shearWall") throw new Error("Shear transfer: source shear wall has an error or is missing");
    return { sourceText: `${r.mark} (${r.demand.lineName})`, vS: r.vS, vW: r.vW };
  }
  const src = t.source;
  const lf = lateral?.lines.find((x) => x.line.id === src.lineId);
  if (!lf || !p.lateral) throw new Error("Shear transfer: wall line not found or lateral analysis off");
  const { Dpar } = planOf(p, lf.line.dir);
  return { sourceText: `${lf.line.name} over ${fmtFt(Dpar)}`, vS: lf.Easd / Dpar, vW: lf.Wasd / Dpar };
}

const fmtFt = (v: number) => `${Math.round(v * 100) / 100} ft`;

/**
 * Allowable soil pressure check (plan §2B Q4): a presumptive value (IBC Table
 * 1806.2) is accepted when it does not exceed the value for the stated soil
 * class; any other value needs a geotechnical report reference.
 */
export function qaNeedsVerify(p: Project, qa: number, entered: boolean): boolean {
  const src = p.criteria.soil.source;
  if (!entered && /presumptive|1806\.2/i.test(src)) {
    const cls = p.criteria.soil.class ? soilClass(p.criteria.soil.class) : undefined;
    return !cls || qa > cls.bearing;
  }
  return !/geotechnical report|soils report|geotech/i.test(src) || entered;
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

/** Inputs not yet entered: a VERIFY assumption (DRAFT banner on the cover) and a sheet flag. */
function markPending(m: MemberSpec, r: AnyResult) {
  const list = m.pendingInputs?.filter((x) => x.trim());
  if (!list?.length) return;
  r.assumptions.unshift(
    fromDefault(
      "Inputs not yet entered",
      `${list.join("; ")} — HouseCalc template values in use`,
      "not on the drawings",
      true,
    ),
  );
  r.flags.unshift(`REQUIRED INPUT — ${list.join("; ")}: template values in use; results are not valid until entered.`);
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
  const { order, circular } = designOrder(p.members);
  const run = () => {
    const outcomes = new Map<string, DesignOutcome>();
    for (const id of order) {
      const m = p.members.find((x) => x.id === id)!;
      const o: DesignOutcome = { spec: m, dependsOn: dependencies(m), linked: [] };
      outcomes.set(id, o);
      try {
        o.linked = linkLoads(p, m, outcomes);
        o.result = designOne(p, ctx, m, o.linked, outcomes, lateral);
        markExisting(m, o.result);
        markPending(m, o.result);
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
    return outcomes;
  };
  let outcomes = run();
  // rigid / envelope distribution: line stiffness from the shear walls of the previous pass
  if (lateral && p.lateral && p.lateral.distribution !== "flexible") {
    for (let iter = 0; iter < 3; iter++) {
      if (!applyRigid(p, lateral, outcomes)) break;
      outcomes = run();
    }
  }
  return { ctx, outcomes, order, circular, lateral, lateralError };
}

/**
 * Wall-line stiffness from the designed shear walls (secant k = Q_E / δ_xe of
 * each wall) and the rigid-diaphragm line forces; envelope takes the larger of
 * the flexible and rigid forces. Returns false when the rigid distribution
 * cannot be formed (positions or stiffness missing).
 */
function applyRigid(p: Project, lateral: LateralResult, outcomes: Map<string, DesignOutcome>): boolean {
  const lat = p.lateral!;
  const k = new Map<string, number>();
  for (const o of outcomes.values()) {
    const r = o.result;
    if (r?.kind !== "shearWall" || !(r.drift.dxe > 0)) continue;
    const id = (o.spec as ShearWallSpec).lineId;
    k.set(id, (k.get(id) ?? 0) + r.demand.QE / r.drift.dxe);
  }
  const results: Array<RigidStoryResult & { storyId: string; storyName: string; kind: "seismic" | "wind" }> = [];
  let applied = false;
  for (const sf of lateral.stories) {
    const ls = lat.lines.filter((l) => l.storyId === sf.storyId);
    if (!ls.length) continue;
    if (ls.some((l) => l.pos === undefined || !(k.get(l.id)! > 0))) {
      const msg = `${sf.name}: rigid distribution needs a plan position and designed shear walls on every wall line — flexible distribution used`;
      if (!lateral.warnings.includes(msg)) lateral.warnings.push(msg);
      continue;
    }
    const rl = ls.map((l) => ({ id: l.id, dir: l.dir as Dir, pos: l.pos!, k: k.get(l.id)! }));
    const cm = lat.com ?? { x: lat.Lx / 2, y: lat.Ly / 2 };
    const plan = { Lx: lat.Lx, Ly: lat.Ly };
    const per = new Map<string, { E: number; W: number; dE: number; tE: number; dW: number; tW: number }>();
    for (const dir of ["X", "Y"] as Dir[]) {
      if (!rl.some((l) => l.dir === dir)) continue;
      const rs = rigidDistribution(rl, sf.VE, dir, cm, plan, true);
      const rw = rigidDistribution(rl, sf.VW[dir], dir, { x: lat.Lx / 2, y: lat.Ly / 2 }, plan, false);
      results.push({ ...rs, storyId: sf.storyId, storyName: sf.name, kind: "seismic" });
      results.push({ ...rw, storyId: sf.storyId, storyName: sf.name, kind: "wind" });
      for (const l of rs.lines) {
        const w = rw.lines.find((x) => x.id === l.id)!;
        const cur = per.get(l.id) ?? { E: 0, W: 0, dE: 0, tE: 0, dW: 0, tW: 0 };
        if (l.total > cur.E) Object.assign(cur, { E: l.total, dE: l.direct, tE: l.torsion });
        if (w.total > cur.W) Object.assign(cur, { W: w.total, dW: w.direct, tW: w.torsion });
        per.set(l.id, cur);
      }
      if (rs.torsionRatio > 1.2) {
        const msg = `${sf.name}, ${dir} direction: δmax/δavg = ${rs.torsionRatio.toFixed(2)} > 1.2 — torsional irregularity (ASCE 7 Table 12.3-1 Type 1a${rs.torsionRatio > 1.4 ? ", extreme 1b" : ""}); amplification A_x (§12.8.4.3) not applied — EOR review`;
        if (!lateral.warnings.includes(msg)) lateral.warnings.push(msg);
      }
    }
    for (const lf of lateral.lines) {
      const r = per.get(lf.line.id);
      if (!r || lf.line.storyId !== sf.storyId) continue;
      const rigid = { Eh: lateral.rho * r.E, W: r.W, directE: r.dE, torsionE: r.tE, directW: r.dW, torsionW: r.tW };
      const env = lat.distribution === "envelope";
      lf.rigid = rigid;
      lf.method = lat.distribution;
      lf.Eh = env ? Math.max(lf.flex.Eh, rigid.Eh) : rigid.Eh;
      lf.W = env ? Math.max(lf.flex.W, rigid.W) : rigid.W;
      lf.Easd = 0.7 * lf.Eh;
      lf.Wasd = 0.6 * lf.W;
      lf.governs = lf.Easd >= lf.Wasd ? "seismic" : "wind";
      lf.share = sf.VE > 0 ? lf.Eh / (lateral.rho * sf.VE) : lf.share;
      applied = true;
    }
  }
  lateral.rigid = results;
  return applied;
}

/** Members that take load from the given member (for the load-path view). */
export function supportedBy(p: Project, id: string): MemberSpec[] {
  return p.members.filter((m) => dependencies(m).includes(id));
}

export const loadTypesOf = (v: LoadVector): LoadType[] => LOAD_TYPES.filter((t) => Math.abs(v[t]) > 1e-9);

export const emptyVector = zeroLoads;
