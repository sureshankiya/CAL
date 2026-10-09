/**
 * CJ-# — ceiling joists, also acting as rafter ties where the roof has a
 * ridge board. Bending, shear, bearing and deflection from the ceiling and
 * attic loads (wood beam engine); axial tension from the rafter thrust
 * (NDS 3.8), combined bending and tension (NDS 3.9.1, Eq. 3.9-1 and 3.9-2)
 * for every combination of the joist's own loads with the thrust, and the
 * heel-joint nailing (NDS 12.3 yield limit equations).
 */

import { memberLength, type BeamLoad } from "../analysis/beam";
import { asdCombinations, loadDurationFactor, relevantCombinations } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, loadVector, type LoadType, type LoadVector } from "../core/loads";
import { nailDef, nailSingleShear, type NailShearResult } from "../design/dowel";
import {
  beamStabilityFactor,
  comboMomentEnvelope,
  designWoodBeam,
  governingCheck,
  type Check,
  type WoodBeamResult,
} from "../design/wood";
import { firstPassing, maxPassingSpacing } from "../design/sizing";
import { SPECIFIC_GRAVITY, type Grade, type Species } from "../data/sawn";
import {
  extraToBeamLoads,
  loadAssumptions,
  ndsOf,
  resolveDead,
  resolveDeflection,
  resolveLive,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type ExtraLoad,
  type LiveRef,
  type LoadLine,
  asce7Of,
} from "./common";
import { reactionsFrom } from "./joist";
import type { MemberResultBase } from "./types";

export interface CeilingJoistInput {
  id: string;
  mark: string;
  description: string;
  species: Species;
  grade: Grade;
  size: string;
  spacing: number;
  spans: number[];
  dead: DeadRef;
  live: LiveRef;
  extra: ExtraLoad[];
  bearing: number[];
  deflection: DeflectionInput;
  Kcr?: number;
  /** top-edge bracing interval (attic side), ft; 0 = continuously braced */
  luTop: number;
  /** NDS 4.4.1.2 bracing provided (C_L = 1.0) */
  rule441: boolean;
  /** rafter thrust carried as tension, unfactored by type, lb per joist */
  tension?: { T: LoadVector; source: string };
  /** heel joint: rafter face-nailed to the ceiling joist */
  heel?: { nail: string; count: number; rafterThickness: number };
}

export interface TensionRow {
  combo: string;
  CD: number;
  T: number;
  ft: number;
  FtPrime: number;
  fb: number;
  FbStar: number;
  FbStarStar: number;
  eq1: number;
  eq2: number;
  nReq: number;
}

export interface CeilingJoistResult extends MemberResultBase {
  kind: "ceilingJoist";
  input: CeilingJoistInput;
  design: WoodBeamResult;
  tension?: {
    rows: TensionRow[];
    governing: TensionRow;
    nail?: NailShearResult & { label: string; provided: number; required: number };
  };
}

function build(ctx: DesignContext, j: CeilingJoistInput) {
  const total = memberLength({ spans: j.spans });
  const trib = j.spacing / 12;
  const dead = resolveDead(ctx, j.dead);
  const live = resolveLive(ctx, j.live);
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  if (dead.psf) {
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: dead.psf * trib, label: "Dead" });
    lines.push({
      type: "D",
      label: `Dead — ${dead.label}`,
      expr: `${fmt(dead.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: dead.psf * trib,
      unit: "plf",
      ref: dead.ref,
    });
  }
  if (live.psf) {
    loads.push({ type: "L", kind: "udl", x1: 0, x2: total, w1: live.psf * trib, label: live.label });
    lines.push({
      type: "L",
      label: `Live — ${live.label}`,
      expr: `${fmt(live.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: live.psf * trib,
      unit: "plf",
      ref: live.ref,
      verify: live.override,
    });
  }
  const ex = extraToBeamLoads(j.extra, total);
  loads.push(...ex.loads);
  lines.push(...ex.lines);
  if (j.tension) {
    for (const t of LOAD_TYPES)
      if (j.tension.T[t])
        lines.push({
          type: t,
          label: `Tension from rafter thrust (${j.tension.source})`,
          expr: `T_${t}`,
          value: j.tension.T[t],
          unit: "lb",
        });
  }
  return { loads, lines, dead, live };
}

function evaluate(ctx: DesignContext, j: CeilingJoistInput, size = j.size) {
  const b = build(ctx, j);
  const lim = resolveDeflection(j.deflection);
  const design = designWoodBeam({
    material: { kind: "sawn", species: j.species, grade: j.grade, size, plies: 1 },
    geometry: { spans: j.spans },
    loads: b.loads,
    includeSelfWeight: false,
    conditions: { wetService: false, incised: false, repetitive: j.spacing <= 24, flatUse: false },
    lu: { top: j.luTop, bottom: 0 },
    bearingLengths: j.bearing,
    defl: { live: lim.live, total: lim.total },
    Kcr: j.Kcr ?? ctx.Kcr,
    rule441: j.rule441,
    SDS: ctx.SDS,
    nds: ndsOf(ctx),
    asce7: asce7Of(ctx),
  });
  const checks: Check[] = [...design.checks];
  let tension: CeilingJoistResult["tension"];
  if (j.tension && LOAD_TYPES.some((t) => j.tension!.T[t] > 0)) {
    const mat = design.mat;
    const present: Partial<Record<LoadType, boolean>> = { ...design.present };
    for (const t of LOAD_TYPES) if (j.tension.T[t] > 0) present[t] = true;
    const combos = relevantCombinations(
      asdCombinations({ asce7: asce7Of(ctx), includeWind: !!present.W, includeSeismic: false }),
      present,
    );
    const nail = j.heel ? nailDef(j.heel.nail) : undefined;
    const G = SPECIFIC_GRAVITY[j.species];
    const ns = nail ? nailSingleShear({ nail, ts: j.heel!.rafterThickness, tm: mat.b, Gs: G, Gm: G }) : undefined;
    const rows: TensionRow[] = combos.map((c) => {
      const CD = loadDurationFactor(c, present);
      const T = LOAD_TYPES.reduce((s, t) => s + (c.factors[t] ?? 0) * j.tension!.T[t], 0);
      const env = comboMomentEnvelope(design, c);
      const M = Math.max(0, ...env.max);
      const ft = T / mat.A;
      const FtPrime = mat.Ft * CD * design.factors.CM.Ft * mat.CFt * design.factors.Ci;
      const fb = (M * 12) / mat.S;
      // F_b* excludes C_L; F_b** excludes C_V (sawn: includes C_L)
      const FbStar = mat.Fb * CD * design.factors.CM.Fb * mat.CF * design.factors.Ci * design.factors.Cr;
      const CL = Number.isFinite(design.factors.FbE_top) ? beamStabilityFactor(design.factors.FbE_top, FbStar) : 1;
      const FbStarStar = FbStar * CL;
      const eq1 = ft / FtPrime + fb / FbStar;
      const eq2 = fb > ft ? (fb - ft) / FbStarStar : 0;
      const nReq = ns && ns.Z > 0 ? T / (ns.Z * CD) : Infinity;
      return { combo: c.label, CD, T, ft, FtPrime, fb, FbStar, FbStarStar, eq1, eq2, nReq };
    });
    const governing = rows.reduce((a, r) => (Math.max(r.eq1, r.eq2) > Math.max(a.eq1, a.eq2) ? r : a), rows[0]);
    const gt = rows.reduce((a, r) => (r.ft / r.FtPrime > a.ft / a.FtPrime ? r : a), rows[0]);
    checks.push({
      name: "Axial tension (NDS 3.8)",
      demand: gt.ft,
      capacity: gt.FtPrime,
      ratio: gt.ft / gt.FtPrime,
      pass: gt.ft <= gt.FtPrime,
      combo: gt.combo,
      CD: gt.CD,
      unit: "psi",
    });
    const gi = Math.max(governing.eq1, governing.eq2);
    checks.push({
      name: "Combined bending and tension (NDS Eq. 3.9-1, 3.9-2)",
      demand: gi,
      capacity: 1,
      ratio: gi,
      pass: gi <= 1,
      combo: governing.combo,
      CD: governing.CD,
      unit: "",
    });
    let nailOut: NonNullable<CeilingJoistResult["tension"]>["nail"];
    if (ns && j.heel) {
      const gn = rows.reduce((a, r) => (r.nReq > a.nReq ? r : a), rows[0]);
      nailOut = { ...ns, label: nail!.label, provided: j.heel.count, required: gn.nReq };
      checks.push({
        name: `Heel joint nailing — ${nail!.label} (NDS 12.3)`,
        demand: gn.nReq,
        capacity: j.heel.count,
        ratio: gn.nReq / j.heel.count,
        pass: gn.nReq <= j.heel.count,
        combo: gn.combo,
        CD: gn.CD,
        unit: "nails",
      });
    }
    tension = { rows, governing, nail: nailOut };
  }
  const governing = governingCheck(checks);
  return { b, design, checks, tension, governing, pass: checks.every((c) => c.pass) };
}

export function designCeilingJoist(ctx: DesignContext, j: CeilingJoistInput): CeilingJoistResult {
  const ev = evaluate(ctx, j);
  const flags: string[] = [];
  if (j.tension)
    flags.push(
      "Ceiling joists continuous or lap-spliced over bearing walls with the heel nailing; ties at plate level",
    );
  let alternatives: CeilingJoistResult["alternatives"];
  if (!ev.pass) {
    const lightest = firstPassing(
      ["2x4", "2x6", "2x8", "2x10", "2x12"].filter((s) => s !== j.size),
      (s) => evaluate(ctx, j, s),
    ).chosen?.candidate;
    const maxSpacing = maxPassingSpacing((s) => evaluate(ctx, { ...j, spacing: s }));
    alternatives = { lightest, maxSpacing };
  }
  return {
    id: j.id,
    mark: j.mark,
    kind: "ceilingJoist",
    title: j.tension ? "Ceiling joist / rafter tie" : "Ceiling joist",
    callout: `${j.size} ${j.species} ${j.grade} @ ${fmt(j.spacing, j.spacing % 1 ? 1 : 0)} in. o.c.`,
    pass: ev.pass,
    governing: ev.governing,
    checks: ev.checks,
    reactions: reactionsFrom(ev.design, j.spacing),
    loadLines: ev.b.lines,
    assumptions: [...loadAssumptions(ev.b.dead, ev.b.live), ...ev.design.assumptions],
    flags,
    alternatives,
    input: j,
    design: ev.design,
    tension: ev.tension,
  };
}

export const zeroTension = (): LoadVector => loadVector({});
