/**
 * Shared pieces of the member modules: the project design context, resolution
 * of area loads (dead assemblies, live uses, roof live, snow) into member line
 * loads, and the printed load lines used on every member sheet.
 */

import type { BeamLoad } from "../analysis/beam";
import { getCycle, type CycleId } from "../core/codes";
import { fmt } from "../core/fmt";
import type { LoadType } from "../core/loads";
import { fromDefault, fromOverride, type AssumptionEntry } from "../core/provenance";
import { assemblyDesignValue, type DeadAssembly } from "../loads/dead";
import { deflectionLimits, type DeflectionPreset } from "../loads/deflection";
import { liveDef, liveLoad, roofLiveReduction, type LiveBasis, type LiveUse } from "../loads/live";
import { snowLoads, type Asce7Edition, type SnowResult } from "../loads/snow";

/** Site snow parameters; slope and eave-to-ridge distance come from each member. */
export interface SiteSnow {
  pg: number;
  Ce: number;
  Ct: number;
  Is: number;
  slippery: boolean;
}

export interface DesignContext {
  cycleId: CycleId;
  liveBasis: LiveBasis;
  assemblies: DeadAssembly[];
  roofLive: { L0: number; reduce: boolean };
  snow: SiteSnow;
  /** default creep factor for total deflection */
  Kcr: number;
  SDS: number;
  /** site wind for components and cladding (from the lateral criteria), when set up */
  windCC?: { qEff: number; thetaDeg: number; h: number; expr: string };
  /** concrete for anchorage (from the foundation criteria) */
  concrete?: { fc: number; fy: number };
  /** project hardware list (connectors, hold-downs) */
  hardware?: import("../data/hardware").HardwareItem[];
}

export const ndsOf = (ctx: DesignContext) => getCycle(ctx.cycleId).nds;
export const asce7Of = (ctx: DesignContext): Asce7Edition => getCycle(ctx.cycleId).asce7;

/** Printed load build-up line, e.g. "Dead — RD1 Roof: 15.00 psf × 1.333 ft = 20.00 plf". */
export interface LoadLine {
  type: LoadType;
  label: string;
  expr: string;
  value: number;
  unit: "plf" | "lb" | "psf";
  ref?: string;
  verify?: boolean;
}

export interface DeadRef {
  assemblyId?: string;
  /** direct psf, used when no assembly is referenced (flagged as user entry) */
  psf?: number;
  /** area basis of a direct psf entry (assemblies carry their own basis) */
  basis?: "sloped" | "horizontal";
}

export interface LiveRef {
  use?: LiveUse;
  psf?: number;
}

/**
 * Dead load of an assembly or a direct psf entry. A direct entry takes the
 * basis it states, else the member's default: roof members default to the
 * sloped surface, floors and ceilings to plan area.
 */
export function resolveDead(
  ctx: DesignContext,
  ref: DeadRef,
  defaultBasis: "sloped" | "horizontal" = "horizontal",
): { psf: number; label: string; basis: "sloped" | "horizontal" | "wall"; ref: string } {
  if (ref.assemblyId) {
    const a = ctx.assemblies.find((x) => x.id === ref.assemblyId);
    if (!a) throw new Error(`Dead-load assembly ${ref.assemblyId} not found`);
    return {
      psf: assemblyDesignValue(a),
      label: `${a.id} ${a.name}`,
      basis: a.basis,
      ref: "Loads sheet, ASCE 7 Table C3.1-1a",
    };
  }
  const basis = ref.basis ?? defaultBasis;
  return {
    psf: ref.psf ?? 0,
    label: `Dead load (entered, per ft² of ${basis === "sloped" ? "roof surface" : "plan area"})`,
    basis,
    ref: "Entered by engineer",
  };
}

export function resolveLive(
  ctx: DesignContext,
  ref: LiveRef,
): { psf: number; label: string; ref: string; roof: boolean; override: boolean } {
  if (ref.use) {
    const l = liveLoad(ref.use, ctx.liveBasis);
    const roof = !!liveDef(ref.use).roof;
    if (ref.psf !== undefined && ref.psf !== l.psf)
      return { psf: ref.psf, label: l.label, ref: l.ref, roof, override: true };
    return { psf: l.psf, label: l.label, ref: l.ref, roof, override: false };
  }
  return { psf: ref.psf ?? 0, label: "Live load (entered)", ref: "Entered by engineer", roof: false, override: false };
}

/** Roof live load for a member with tributary area At (ft²) on a roof of the given rise (in/ft). */
export function resolveRoofLive(
  ctx: DesignContext,
  At: number,
  rise: number,
): { psf: number; expr: string; ref: string } {
  const L0 = ctx.roofLive.L0;
  if (!ctx.roofLive.reduce)
    return { psf: L0, expr: `L0 = ${fmt(L0, 1)} psf (no reduction taken)`, ref: "ASCE 7 §4.8; IBC Table 1607.1" };
  const r = roofLiveReduction(L0, At, rise);
  return {
    psf: r.Lr,
    expr: `Lr = L0 R1 R2 = ${fmt(L0, 1)} × ${fmt(r.R1, 3)} × ${fmt(r.R2, 3)} = ${fmt(L0 * r.R1 * r.R2, 2)} psf${r.bounded === "min" ? " → 12 psf minimum" : ""} (At = ${fmt(At, 0)} ft², F = ${fmt(rise, 2)})`,
    ref: r.ref,
  };
}

export function resolveSnow(ctx: DesignContext, rise: number, W: number, gable: boolean): SnowResult {
  return snowLoads({
    edition: asce7Of(ctx),
    pg: ctx.snow.pg,
    Ce: ctx.snow.Ce,
    Ct: ctx.snow.Ct,
    Is: ctx.snow.Is,
    rise,
    slippery: ctx.snow.slippery,
    W,
    gable,
  });
}

/** A user-entered load on a member (line or point), by load type. */
export interface ExtraLoad {
  kind: "line" | "point";
  type: LoadType;
  label: string;
  /** line: plf over x1..x2 (ft); point: lb at x (ft) */
  w?: number;
  x1?: number;
  x2?: number;
  P?: number;
  x?: number;
  /** load-path link: reaction of another member's support carried here */
  source?: { memberId: string; support: number };
}

export function extraToBeamLoads(extra: ExtraLoad[], total: number): { loads: BeamLoad[]; lines: LoadLine[] } {
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  for (const e of extra) {
    if (e.kind === "line") {
      const x1 = e.x1 ?? 0;
      const x2 = e.x2 ?? total;
      loads.push({ type: e.type, kind: "udl", x1, x2, w1: e.w ?? 0, label: e.label });
      lines.push({
        type: e.type,
        label: e.label,
        expr: `${fmt(e.w ?? 0, 1)} plf from ${fmt(x1, 2)} ft to ${fmt(x2, 2)} ft`,
        value: e.w ?? 0,
        unit: "plf",
      });
    } else {
      loads.push({ type: e.type, kind: "point", x: e.x ?? 0, P: e.P ?? 0, label: e.label });
      lines.push({
        type: e.type,
        label: e.label,
        expr: `${fmt(e.P ?? 0, 0)} lb at ${fmt(e.x ?? 0, 2)} ft`,
        value: e.P ?? 0,
        unit: "lb",
      });
    }
  }
  return { loads, lines };
}

export interface DeflectionInput {
  preset: DeflectionPreset;
  live?: number;
  total?: number;
}

export function resolveDeflection(d: DeflectionInput) {
  return deflectionLimits(d.preset, d.preset === "custom" ? { live: d.live ?? 360, total: d.total ?? 240 } : undefined);
}

/** Assumption entries for loads that came from defaults, overrides or direct entry. */
export function loadAssumptions(
  dead: ReturnType<typeof resolveDead>,
  live?: ReturnType<typeof resolveLive>,
): AssumptionEntry[] {
  const out: AssumptionEntry[] = [];
  if (dead.ref === "Entered by engineer")
    out.push(fromDefault("Dead load", `${fmt(dead.psf, 1)} psf entered directly`, "engineer"));
  if (live?.override) out.push(fromOverride("Live load", `${fmt(live.psf, 1)} psf`, `${live.label} per ${live.ref}`));
  return out;
}

export const typeName: Record<LoadType, string> = {
  D: "Dead",
  L: "Live",
  Lr: "Roof live",
  S: "Snow",
  W: "Wind",
  E: "Seismic",
};
