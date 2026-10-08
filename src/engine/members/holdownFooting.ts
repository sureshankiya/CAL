/**
 * HF-# — shear-wall / hold-down footing: the continuous footing under a shear wall checked as
 * a rigid body for the wall's in-plane forces (IBC 1605 / ASCE 7 §2.4 ASD combinations):
 *
 *  - Overturning about the footing toe: M_OT = V (h_wall + h_stem + h_ftg) vs M_R = P L_f / 2
 *    with P the factored dead (and live where the combination includes it) load
 *  - Soil bearing under eccentric load: e = M_OT / P; q_max = P / (B L_f) (1 + 6e / L_f) for
 *    e ≤ L_f / 6, else q_max = 2P / (3B (L_f / 2 − e)); vs the allowable value (IBC 1806.2)
 *  - Sliding: V ≤ μ P + passive on the end face (IBC 1806.3, Table 1806.2 lateral bearing
 *    and friction), P from the 0.6D combinations
 *  - Uplift at the hold-down (strength): the footing length that resists T_u by its dead
 *    weight, L_e = T_u / (0.9 w_D), must fit within the footing; longitudinal flexure of that
 *    length as a cantilever loaded by T_u, M_u = T_u L_e / 2, vs the top bars (ACI 318 22.2) or
 *    plain concrete (14.5.2)
 *
 * Gravity on the footing: wall top load and self weight from the shear-wall result, footing,
 * stem and soil, and entered line loads.
 */

import { asdCombinations, combine, relevantCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { bar, flexure, plainFlexure } from "../design/concrete";
import { governingCheck, type Check } from "../design/wood";
import type { DesignContext, ExtraLoad, LoadLine } from "./common";
import type { ShearWallResult } from "./shearWall";
import type { MemberResultBase } from "./types";

export interface HoldownFootingInput {
  id: string;
  mark: string;
  description: string;
  /** footing length along the wall, ft (≥ wall length) */
  Lf: number;
  /** width, ft */
  B: number;
  /** thickness, in */
  h: number;
  /** bottom of footing below grade, in */
  depth: number;
  stem?: { width: number; height: number };
  longitudinal?: { size: string; top: number; bottom: number };
  extra: ExtraLoad[];
  fc: number;
  fy: number;
  cover: number;
  qa: number;
  qaSource: string;
  soilDensity: number;
  friction?: number;
  cohesion?: number;
  lateralBearing: number;
  soilSource: string;
  wall: ShearWallResult;
}

export interface HoldownFootingRow {
  combo: Combination;
  lateral: "W" | "E" | "—";
  V: number;
  P: number;
  M: number;
  e: number;
  qmax: number;
  qRatio: number;
  otRatio: number;
  slideCap?: number;
  slideRatio?: number;
}

export interface HoldownFootingResult extends MemberResultBase {
  kind: "holdownFooting";
  input: HoldownFootingInput;
  wallMark: string;
  arm: number;
  weights: { wall: number; footing: number; stem: number; soil: number; extra: LoadVector };
  gravity: LoadVector;
  rows: HoldownFootingRow[];
  govBearing: HoldownFootingRow;
  govOT: HoldownFootingRow;
  govSlide?: HoldownFootingRow;
  passive: number;
  uplift: { Tu: number; basis: string; wD: number; Le: number; Mu: number; phiMn: number; d?: number; plain: boolean };
}

export function designHoldownFooting(ctx: DesignContext, f: HoldownFootingInput): HoldownFootingResult {
  const w = f.wall;
  const Lw = w.input.b;
  if (f.Lf < Lw - 1e-6)
    throw new Error(`Footing length ${fmt(f.Lf, 2)} ft is shorter than the wall (${fmt(Lw, 2)} ft)`);
  const lines: LoadLine[] = [];
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [];
  // gravity, lb (whole footing)
  const wallTop = zeroLoads();
  for (const t of ["D", "L", "Lr", "S"] as const) wallTop[t] = w.input.top[t] * Lw;
  const wallSelf = w.selfPlf * Lw;
  const stemH = f.stem?.height ?? 0;
  const soilOver = Math.max(0, f.depth - f.h - stemH);
  const wFtg = 150 * (f.h / 12) * f.B * f.Lf;
  const wStem = f.stem ? 150 * (f.stem.width / 12) * (f.stem.height / 12) * f.Lf : 0;
  const stemFoot = f.stem ? f.stem.width / 12 : 0.5;
  const wSoil = f.soilDensity * (soilOver / 12) * Math.max(0, f.B - stemFoot) * f.Lf;
  const extra = zeroLoads();
  for (const e of f.extra) {
    if (e.kind !== "line") throw new Error(`${e.label}: use line loads (plf) along the footing`);
    extra[e.type] += (e.w ?? 0) * f.Lf;
    lines.push({
      type: e.type,
      label: e.label,
      expr: `${fmt(e.w ?? 0, 1)} plf × ${fmt(f.Lf, 2)} ft`,
      value: (e.w ?? 0) * f.Lf,
      unit: "lb",
    });
  }
  const gravity = zeroLoads();
  for (const t of LOAD_TYPES) gravity[t] = wallTop[t] + extra[t];
  gravity.D += wallSelf + wFtg + wStem + wSoil;
  for (const t of ["D", "L", "Lr", "S"] as const)
    if (wallTop[t])
      lines.push({
        type: t,
        label: `${w.mark} top load`,
        expr: `${fmt(w.input.top[t], 1)} plf × ${fmt(Lw, 2)} ft`,
        value: wallTop[t],
        unit: "lb",
      });
  lines.push(
    {
      type: "D",
      label: `${w.mark} wall self weight`,
      expr: `${fmt(w.selfPlf, 1)} plf × ${fmt(Lw, 2)} ft`,
      value: wallSelf,
      unit: "lb",
    },
    {
      type: "D",
      label: "Footing",
      expr: `150 pcf × ${fmt(f.h / 12, 3)} × ${fmt(f.B, 2)} × ${fmt(f.Lf, 2)} ft`,
      value: wFtg,
      unit: "lb",
    },
  );
  if (wStem)
    lines.push({
      type: "D",
      label: "Stem wall",
      expr: `150 pcf × ${fmt(f.stem!.width / 12, 3)} × ${fmt(f.stem!.height / 12, 3)} × ${fmt(f.Lf, 2)} ft`,
      value: wStem,
      unit: "lb",
    });
  if (wSoil)
    lines.push({
      type: "D",
      label: "Soil over footing",
      expr: `${fmt(f.soilDensity, 0)} pcf × ${fmt(soilOver / 12, 3)} ft × ${fmt(f.B - stemFoot, 2)} × ${fmt(f.Lf, 2)} ft`,
      value: wSoil,
      unit: "lb",
    });
  lines.push(
    {
      type: "W",
      label: `${w.mark} in-plane shear (strength)`,
      expr: "from the wall-line distribution",
      value: w.demand.W,
      unit: "lb",
    },
    {
      type: "E",
      label: `${w.mark} in-plane shear E_h = ρQ_E (strength)`,
      expr: "from the wall-line distribution",
      value: w.demand.Eh,
      unit: "lb",
    },
  );
  const arm = w.input.h + (stemH + f.h) / 12; // ft
  const A = f.B * f.Lf;
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(gravity[t]) > 1e-9) present[t] = true;
  if (w.demand.W) present.W = true;
  if (w.demand.Eh) present.E = true;
  const combos = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  // passive on the leading end face (ft-based lateral bearing, psf per ft below grade)
  const dTop = (f.depth - f.h) / 12;
  const dBot = f.depth / 12;
  const passive = 0.5 * f.lateralBearing * (dBot * dBot - dTop * dTop) * f.B;
  const rows: HoldownFootingRow[] = combos.map((c) => {
    const V = Math.abs((c.factors.W ?? 0) * w.demand.W) + Math.abs((c.factors.E ?? 0) * w.demand.Eh);
    const lateral: HoldownFootingRow["lateral"] = c.factors.E ? "E" : c.factors.W ? "W" : "—";
    const P = combine(gravity, c);
    const M = V * arm;
    const e = P > 0 ? M / P : Infinity;
    let qmax: number;
    if (e <= f.Lf / 6) qmax = (P / A) * (1 + (6 * e) / f.Lf);
    else if (e < f.Lf / 2) qmax = (2 * P) / (3 * f.B * (f.Lf / 2 - e));
    else qmax = Infinity;
    const MR = (P * f.Lf) / 2;
    const row: HoldownFootingRow = {
      combo: c,
      lateral,
      V,
      P,
      M,
      e,
      qmax,
      qRatio: qmax / f.qa,
      otRatio: V > 0 ? M / MR : 0,
    };
    if (V > 0) {
      const fr = f.friction !== undefined ? f.friction * Math.max(0, P) : (f.cohesion ?? 0) * A;
      const cap = fr + passive;
      row.slideCap = cap;
      row.slideRatio = V / cap;
    }
    return row;
  });
  const govBearing = rows.reduce((a, b) => (b.qRatio > a.qRatio ? b : a));
  const govOT = rows.reduce((a, b) => (b.otRatio > a.otRatio ? b : a));
  const lat = rows.filter((r) => r.slideRatio !== undefined);
  const govSlide = lat.length ? lat.reduce((a, b) => (b.slideRatio! > a.slideRatio! ? b : a)) : undefined;

  // uplift at the hold-down (strength level)
  const Tu = w.hdAnchor?.Tu ?? Math.max(w.Tmax.seismic / 0.7, w.Tmax.wind / 0.6);
  const basis = w.hdAnchor
    ? `${w.mark} hold-down anchor demand T_u (${w.hdAnchor.basis})`
    : `${w.mark} T_max / 0.7 (seismic) or / 0.6 (wind)`;
  const wD = (wFtg + wStem + wSoil) / f.Lf + w.selfPlf + w.input.top.D;
  const Le = Tu > 0 ? Tu / (0.9 * wD) : 0;
  const Mu = (Tu * Le) / 2; // lb-ft
  let phiMn: number;
  let d: number | undefined;
  const plain = !f.longitudinal || f.longitudinal.top === 0;
  if (plain) phiMn = plainFlexure(f.fc, (f.B * 12 * f.h ** 2) / 6) / 12;
  else {
    const b = bar(f.longitudinal!.size);
    d = f.h - f.cover - b.d / 2;
    phiMn = flexure(b.A * f.longitudinal!.top, f.B * 12, d, f.fc, f.fy).phiMn / 12;
  }
  const uplift = { Tu, basis, wD, Le, Mu, phiMn, d, plain };

  const checks: Check[] = [
    {
      name: "Soil bearing under eccentric load (IBC 1806.2)",
      demand: govBearing.qmax,
      capacity: f.qa,
      ratio: govBearing.qRatio,
      pass: govBearing.qRatio <= 1,
      combo: govBearing.combo.label,
      CD: 1,
      unit: "psf",
    },
    {
      name: "Overturning of wall and footing, M_OT / M_R",
      demand: govOT.M,
      capacity: (govOT.P * f.Lf) / 2,
      ratio: govOT.otRatio,
      pass: govOT.otRatio <= 1,
      combo: govOT.combo.label,
      CD: 1,
      unit: "lb-ft",
    },
  ];
  if (govSlide)
    checks.push({
      name: "Sliding: friction + passive on the end face (IBC 1806.3)",
      demand: govSlide.V,
      capacity: govSlide.slideCap!,
      ratio: govSlide.slideRatio!,
      pass: govSlide.slideRatio! <= 1,
      combo: govSlide.combo.label,
      CD: 1,
      unit: "lb",
    });
  checks.push(
    {
      name: "Hold-down uplift resisted within the footing, L_e = T_u / (0.9 w_D) ≤ L_f",
      demand: Le,
      capacity: f.Lf,
      ratio: Le / f.Lf,
      pass: Le <= f.Lf,
      combo: "0.9D + 1.0E / 1.0W",
      CD: 1,
      unit: "ft",
    },
    {
      name: `Longitudinal flexure under hold-down uplift, ${plain ? "plain (ACI 318 14.5.2)" : "top bars (ACI 318 22.2)"}`,
      demand: Mu,
      capacity: phiMn,
      ratio: Mu / phiMn,
      pass: Mu <= phiMn,
      combo: "0.9D + 1.0E / 1.0W",
      CD: 1,
      unit: "lb-ft",
    },
  );
  assumptions.push(
    fromDefault(
      "Rigid footing",
      "Wall and footing act as one rigid body; linear soil pressure, no tension",
      "engineer",
    ),
    fromDefault("Allowable soil pressure", `${fmt(f.qa, 0)} psf — ${f.qaSource}`, f.qaSource, true),
    fromDefault(
      "Sliding resistance",
      `${f.friction !== undefined ? `friction μ = ${fmt(f.friction, 2)}` : `cohesion ${fmt(f.cohesion ?? 0, 0)} psf`}; lateral bearing ${fmt(f.lateralBearing, 0)} psf/ft on one end face`,
      f.soilSource,
      true,
    ),
    fromDefault(
      "Uplift length",
      "Hold-down uplift spread over the footing length needed to mobilise 0.9 × the dead weight per foot; that length checked as a cantilever (M_u = T_u L_e / 2)",
      "engineer",
    ),
  );
  if (plain) flags.push("Plain footing under a hold-down — consider (2) #4 top and bottom continuous");
  const callout = `${fmt(f.B * 12, 0)} in. W × ${fmt(f.h, 0)} in. D × ${fmt(f.Lf, 2)} ft footing under ${w.mark}${f.longitudinal ? `, (${f.longitudinal.top}) ${f.longitudinal.size} T & (${f.longitudinal.bottom}) B` : ""}`;
  return {
    id: f.id,
    mark: f.mark,
    kind: "holdownFooting",
    title: "Shear-wall / hold-down footing",
    callout,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: lines,
    assumptions,
    flags,
    input: f,
    wallMark: w.mark,
    arm,
    weights: { wall: wallSelf, footing: wFtg, stem: wStem, soil: wSoil, extra },
    gravity,
    rows,
    govBearing,
    govOT,
    govSlide,
    passive,
    uplift,
  };
}
