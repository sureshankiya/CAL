/**
 * RW-# — cantilever retaining wall, per foot of wall: concrete or CMU stem on a reinforced
 * concrete footing with toe and heel.
 *
 *  - Lateral earth pressure on the vertical plane through the heel, height H_t = H_r + h_f:
 *    equivalent fluid (IBC 1610.1 / geotechnical report), lateral surcharge K_a q with
 *    K_a = efp / γ, and the dynamic increment from the geotechnical report (IBC 1803.5.12),
 *    uniform or inverted triangle. Drained backfill: no hydrostatic pressure.
 *  - Stability (IBC 1807.2.3): sliding and overturning about the toe with nominal loads and
 *    0.7E, variable loads (surcharge on the heel, live load on the stem) set to zero on the
 *    resisting side; FS ≥ 1.5, ≥ 1.1 with earthquake. Sliding resistance = friction (or
 *    cohesion ≤ ½ dead load) + passive on the toe face below the neglected depth
 *    (IBC 1806.3, Table 1806.2).
 *  - Soil bearing: ASCE 7 §2.4 combinations with 1.0H, linear pressure with partial contact.
 *  - Stem: CW wall engine as a cantilever from the top of the footing (concrete ACI 318
 *    strength design with 1.6H, CMU TMS 402 ASD with 1.0H). A concrete stem is a one-way slab
 *    (ACI 318-19 13.3.7.1): minimum steel 0.0018 A_g each way (7.6.1.1, 24.4.3.2) and spacing
 *    7.7.2.3 / 24.4.3.3 replace the wall minimums of Table 11.6.1.
 *  - Footing (ACI 318-19 strength design, 1.6H): toe and heel as cantilevers from the stem
 *    faces under the factored soil pressure — flexure (22.2) at the face, one-way shear
 *    (22.5) at d from the face for the toe and at the face for the heel, A_s,min = 0.0018 A_g
 *    (7.6.1.1), longitudinal shrinkage and temperature steel (24.4.3), standard-hook
 *    development of the stem dowels into the footing (25.4.3).
 */

import { asdCombinations, relevantCombinations, strengthCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { loadVector, zeroLoads, type LoadType } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { bar, flexure, oneWayShear } from "../design/concrete";
import { governingCheck, type Check } from "../design/wood";
import type { DesignContext, ExtraLoad, LoadLine } from "./common";
import { eccentricBearing } from "./holdownFooting";
import { designMasonryWall, type MasonryWallInput, type MasonryWallResult } from "./masonryWall";
import type { MemberResultBase } from "./types";

export interface RetainingWallInput {
  id: string;
  mark: string;
  description: string;
  /** retained height above the top of the footing, ft */
  Hr: number;
  stem: Pick<MasonryWallInput, "material" | "t" | "cmu" | "concrete" | "fy" | "vertical" | "horizontal"> & {
    /** stem height above the top of the footing (≥ H_r), ft */
    height: number;
  };
  footing: {
    /** toe length in front of the stem, ft */
    toe: number;
    /** heel length behind the stem, ft */
    heel: number;
    /** thickness, in */
    h: number;
    fc: number;
    fy: number;
    coverBottom: number;
    coverTop: number;
    bottom: { size: string; spacing: number };
    top: { size: string; spacing: number };
    longitudinal: { size: string; count: number };
  };
  soil: {
    /** backfill unit weight, pcf */
    gamma: number;
    /** active equivalent fluid pressure, pcf */
    efp: number;
    efpSource: string;
    /** uniform vertical surcharge on the backfill, psf (live) */
    surcharge: number;
    /** dynamic earth-pressure increment k × H (geotechnical report) */
    seismic?: { shape: "uniform" | "inverted"; k: number };
    /** soil cover over the toe, ft */
    toeCover: number;
    /** count the toe soil as resisting sliding / overturning */
    countToeSoil: boolean;
    /** top of passive resistance ignored, ft */
    neglectPassive: number;
    /** lateral bearing, psf per ft (IBC Table 1806.2) */
    passive: number;
    friction?: number;
    cohesion?: number;
    qa: number;
    qaSource: string;
    soilSource: string;
  };
  /** line loads on top of the stem, plf (fence, wall, guard) */
  extra: ExtraLoad[];
  seismicSDC: string;
}

export interface RwVertical {
  label: string;
  type: "D" | "L";
  W: number;
  x: number;
  /** counted as resisting sliding and overturning */
  resists: boolean;
}

export interface RwLateral {
  label: string;
  type: "H" | "Hq" | "E";
  P: number;
  y: number;
  expr: string;
}

export interface RwStabilityCase {
  label: string;
  seismic: boolean;
  H: number;
  Wr: number;
  friction: number;
  passive: number;
  R: number;
  FSs: number;
  Mo: number;
  Mr: number;
  FSo: number;
  FSreq: number;
}

export interface RwBearingRow {
  combo: Combination;
  P: number;
  xbar: number;
  e: number;
  qmax: number;
  qmin: number;
  ratio: number;
}

export interface RwFootingSection {
  name: "Toe" | "Heel";
  /** distance of the critical flexure section from the toe, ft */
  xFace: number;
  /** max bottom-tension (+) and top-tension (−) moments, lb-in/ft */
  MuPos: { Mu: number; combo: string };
  MuNeg: { Mu: number; combo: string };
  Vu: { Vu: number; combo: string; at: number };
  dBot: number;
  dTop: number;
  phiMnBot: number;
  phiMnTop: number;
  phiVc: number;
}

/** footing actions per strength combination (moments lb-in/ft: toe + bottom tension, heel − top tension) */
export interface RwFootingRow {
  combo: Combination;
  Pu: number;
  xbar: number;
  MuToe: number;
  VuToe: number;
  MuHeel: number;
  VuHeel: number;
}

export interface RetainingWallResult extends MemberResultBase {
  kind: "retainingWall";
  input: RetainingWallInput;
  geo: { B: number; ts: number; hf: number; Ht: number; Ka: number; freeboard: number };
  vertical: RwVertical[];
  lateral: RwLateral[];
  passive: { dp: number; dn: number; Pp: number };
  stability: RwStabilityCase[];
  bearing: RwBearingRow[];
  bearingGov: RwBearingRow;
  footing: {
    toe: RwFootingSection;
    heel: RwFootingSection;
    AsMin: number;
    AsBot: number;
    AsTop: number;
    rows: RwFootingRow[];
  };
  longitudinal: { As: number; req: number; spacing: number; maxSpacing: number };
  dowel: { size: string; db: number; ldh: number; avail: number; psi: { e: number; r: number; o: number; c: number } };
  stem: MasonryWallResult;
}

const CONCRETE = 150;

/** Linear contact pressure (psf) at x from the toe for resultant P at xbar on width B. */
function pressureAt(P: number, xbar: number, B: number, x: number): number {
  if (P <= 0) return 0;
  const e = B / 2 - xbar;
  if (Math.abs(e) <= B / 6) {
    const q0 = (P / B) * (1 + (6 * e) / B); // at the toe
    const qB = (P / B) * (1 - (6 * e) / B); // at the heel end
    return q0 + ((qB - q0) * x) / B;
  }
  if (e > 0) {
    const L = 3 * xbar; // contact from the toe
    const q0 = (2 * P) / L;
    return x <= L ? q0 * (1 - x / L) : 0;
  }
  const L = 3 * (B - xbar); // contact from the heel end
  const qB = (2 * P) / L;
  return x >= B - L ? qB * (1 - (B - x) / L) : 0;
}

/** ∫ f(x) dx and ∫ f(x)(x − x0) dx over [a, b] by the midpoint rule. */
function integrate(f: (x: number) => number, a: number, b: number, x0: number, n = 400) {
  let F = 0;
  let M = 0;
  if (b <= a) return { F, M };
  const dx = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const x = a + (i + 0.5) * dx;
    const v = f(x) * dx;
    F += v;
    M += v * (x - x0);
  }
  return { F, M };
}

/** ACI 318-19 Eq. 25.4.3.1(a) standard-hook development length, in. */
export function hookDevelopment(size: string, fy: number, fc: number) {
  const db = bar(size).d;
  const psi = { e: 1.0, r: 1.6, o: 1.0, c: fc < 6000 ? fc / 15000 + 0.6 : 1.0 };
  const raw = ((fy * psi.e * psi.r * psi.o * psi.c) / (55 * Math.sqrt(fc))) * db ** 1.5;
  return { db, psi, raw, ldh: Math.max(raw, 8 * db, 6) };
}

export function designRetainingWall(ctx: DesignContext, w: RetainingWallInput): RetainingWallResult {
  const f = w.footing;
  const s = w.soil;
  if (w.stem.height < w.Hr - 1e-9)
    throw new Error(`Stem height ${fmt(w.stem.height, 2)} ft is less than the retained height ${fmt(w.Hr, 2)} ft`);
  if (f.toe < 0 || f.heel <= 0) throw new Error("Footing: heel length must be positive and the toe non-negative");
  const ts = w.stem.t / 12;
  const hf = f.h / 12;
  const B = f.toe + ts + f.heel;
  const Ht = w.Hr + hf;
  const Ka = s.efp / s.gamma;
  const seis = s.seismic && s.seismic.k > 0 ? s.seismic : undefined;
  const lines: LoadLine[] = [];
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [];

  // ---------------- stem (cantilever from the top of the footing)
  const stem = designMasonryWall(ctx, {
    id: `${w.id}-stem`,
    mark: w.mark,
    description: w.description,
    material: w.stem.material,
    L: 1,
    h: w.stem.height,
    support: "cantilever",
    t: w.stem.t,
    cmu: w.stem.cmu,
    concrete: w.stem.concrete,
    fy: w.stem.fy,
    vertical: w.stem.vertical,
    horizontal: w.stem.horizontal,
    extra: w.extra,
    eccentricity: 0,
    wind: { W: 0, Wp: 0 },
    seismic: { include: false, Eadd: 0, SDC: w.seismicSDC, Ie: 1, SDS: ctx.SDS },
    soil: { height: w.Hr, efp: s.efp, surcharge: Ka * s.surcharge, seismic: seis },
  });

  // ---------------- vertical loads per foot, arms from the toe
  const top = zeroLoads();
  for (const e of w.extra) {
    if (e.kind !== "line") throw new Error(`${e.label}: use line loads (plf) on the stem`);
    top[e.type] += e.w ?? 0;
  }
  const xs = f.toe + ts / 2;
  const xHeel = f.toe + ts + f.heel / 2;
  const vertical: RwVertical[] = [
    { label: "Stem", type: "D", W: stem.self.w * w.stem.height, x: xs, resists: true },
    { label: "Footing", type: "D", W: CONCRETE * hf * B, x: B / 2, resists: true },
    { label: "Soil over the heel", type: "D", W: s.gamma * w.Hr * f.heel, x: xHeel, resists: true },
  ];
  if (s.toeCover > 0 && f.toe > 0)
    vertical.push({
      label: "Soil over the toe",
      type: "D",
      W: s.gamma * s.toeCover * f.toe,
      x: f.toe / 2,
      resists: s.countToeSoil,
    });
  if (top.D) vertical.push({ label: "Load on the stem (D)", type: "D", W: top.D, x: xs, resists: true });
  if (top.L + top.Lr + top.S)
    vertical.push({ label: "Load on the stem (L)", type: "L", W: top.L + top.Lr + top.S, x: xs, resists: false });
  if (s.surcharge > 0)
    vertical.push({ label: "Surcharge on the heel", type: "L", W: s.surcharge * f.heel, x: xHeel, resists: false });
  for (const v of vertical)
    lines.push({ type: v.type, label: v.label, expr: `arm ${fmt(v.x, 2)} ft from the toe`, value: v.W, unit: "plf" });

  // ---------------- lateral loads on the plane through the heel
  const lateral: RwLateral[] = [
    {
      label: "Active earth pressure",
      type: "H",
      P: 0.5 * s.efp * Ht * Ht,
      y: Ht / 3,
      expr: `½ × ${fmt(s.efp, 0)} pcf × ${fmt(Ht, 2)}²`,
    },
  ];
  if (s.surcharge > 0)
    lateral.push({
      label: "Surcharge (K_a q)",
      type: "Hq",
      P: Ka * s.surcharge * Ht,
      y: Ht / 2,
      expr: `${fmt(Ka, 3)} × ${fmt(s.surcharge, 0)} psf × ${fmt(Ht, 2)}`,
    });
  if (seis)
    lateral.push({
      label: "Seismic increment",
      type: "E",
      P: seis.shape === "uniform" ? seis.k * Ht * Ht : 0.5 * seis.k * Ht * Ht,
      y: seis.shape === "uniform" ? Ht / 2 : (2 * Ht) / 3,
      expr:
        seis.shape === "uniform"
          ? `${fmt(seis.k, 1)} pcf × ${fmt(Ht, 2)}² (uniform)`
          : `½ × ${fmt(seis.k, 1)} pcf × ${fmt(Ht, 2)}² (inverted triangle)`,
    });
  for (const l of lateral)
    lines.push({
      type: l.type === "E" ? "E" : l.type === "Hq" ? "L" : "D",
      label: l.label,
      expr: `${l.expr}, at ${fmt(l.y, 2)} ft above the base`,
      value: l.P,
      unit: "plf",
    });

  // ---------------- passive on the toe face
  const dp = s.toeCover + hf;
  const dn = Math.min(s.neglectPassive, dp);
  const Pp = 0.5 * s.passive * (dp * dp - dn * dn);

  // ---------------- stability, IBC 1807.2.3
  const stability: RwStabilityCase[] = [];
  const surchOpts = s.surcharge > 0 ? [false, true] : [false];
  const seisOpts = seis ? [false, true] : [false];
  const Wr = vertical.filter((v) => v.resists).reduce((a, v) => a + v.W, 0);
  const Mr = vertical.filter((v) => v.resists).reduce((a, v) => a + v.W * v.x, 0);
  for (const sc of seisOpts)
    for (const sq of surchOpts) {
      const parts = lateral.filter((l) => l.type === "H" || (sq && l.type === "Hq") || (sc && l.type === "E"));
      const fac = (l: RwLateral) => (l.type === "E" ? 0.7 : 1);
      const H = parts.reduce((a, l) => a + fac(l) * l.P, 0);
      const Mo = parts.reduce((a, l) => a + fac(l) * l.P * l.y, 0);
      const fr = s.friction !== undefined ? s.friction * Wr : Math.min((s.cohesion ?? 0) * B, 0.5 * Wr);
      const R = fr + Pp;
      stability.push({
        label: ["H", sq ? "surcharge" : "", sc ? "0.7E" : ""].filter(Boolean).join(" + "),
        seismic: sc,
        H,
        Wr,
        friction: fr,
        passive: Pp,
        R,
        FSs: R / H,
        Mo,
        Mr,
        FSo: Mr / Mo,
        FSreq: sc ? 1.1 : 1.5,
      });
    }

  // ---------------- soil bearing, ASCE 7 §2.4 with 1.0H
  const hasL = vertical.some((v) => v.type === "L");
  const present: Partial<Record<LoadType, boolean>> = { D: true, L: hasL, E: !!seis };
  const asd = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: false, includeSeismic: !!seis }),
    present,
  ).map((c) => ({ ...c, label: `${c.label} + H` }));
  const lateralMoment = (c: Combination) => {
    let H = 0;
    let M = 0;
    for (const l of lateral) {
      const k = l.type === "H" ? 1 : l.type === "Hq" ? (c.factors.L ?? 0) : (c.factors.E ?? 0);
      H += k * l.P;
      M += k * l.P * l.y;
    }
    return { H, M };
  };
  const bearing: RwBearingRow[] = asd.map((c) => {
    let P = 0;
    let Mv = 0;
    for (const v of vertical) {
      const k = c.factors[v.type] ?? 0;
      P += k * v.W;
      Mv += k * v.W * v.x;
    }
    const { M: Mo } = lateralMoment(c);
    const xbar = P > 0 ? (Mv - Mo) / P : 0;
    const e = B / 2 - xbar;
    const eb = eccentricBearing(P, P * Math.abs(e), 1, B);
    const qmax = xbar <= 0 || xbar >= B ? Infinity : eb.qmax;
    const qmin = Math.abs(e) <= B / 6 ? (P / B) * (1 - (6 * Math.abs(e)) / B) : 0;
    return { combo: c, P, xbar, e, qmax, qmin, ratio: qmax / s.qa };
  });
  const bearingGov = bearing.reduce((a, b) => (b.ratio > a.ratio ? b : a));

  // ---------------- footing, ACI 318 strength design (1.6H)
  const strength = relevantCombinations(
    strengthCombinations({ SDS: ctx.SDS, includeWind: false, includeSeismic: !!seis }),
    present,
  ).map((c) => ({ ...c, label: `${c.label} + 1.6H` }));
  const bBot = bar(f.bottom.size);
  const bTop = bar(f.top.size);
  const AsBot = (bBot.A * 12) / f.bottom.spacing;
  const AsTop = (bTop.A * 12) / f.top.spacing;
  const dBot = f.h - f.coverBottom - bBot.d / 2;
  const dTop = f.h - f.coverTop - bTop.d / 2;
  const phiMnBot = flexure(AsBot, 12, dBot, f.fc, f.fy).phiMn;
  const phiMnTop = flexure(AsTop, 12, dTop, f.fc, f.fy).phiMn;
  const xFront = f.toe;
  const xBack = f.toe + ts;
  const toe: RwFootingSection = {
    name: "Toe",
    xFace: xFront,
    MuPos: { Mu: 0, combo: "—" },
    MuNeg: { Mu: 0, combo: "—" },
    Vu: { Vu: 0, combo: "—", at: Math.max(0, xFront - dBot / 12) },
    dBot,
    dTop,
    phiMnBot,
    phiMnTop,
    phiVc: oneWayShear(12, dBot, AsBot, f.fc).phiVc,
  };
  const heel: RwFootingSection = {
    name: "Heel",
    xFace: xBack,
    MuPos: { Mu: 0, combo: "—" },
    MuNeg: { Mu: 0, combo: "—" },
    Vu: { Vu: 0, combo: "—", at: xBack },
    dBot,
    dTop,
    phiMnBot,
    phiMnTop,
    phiVc: oneWayShear(12, dTop, AsTop, f.fc).phiVc,
  };
  const toeSoil = s.toeCover > 0 ? s.gamma * s.toeCover : 0;
  const footingRows: RwFootingRow[] = [];
  for (const c of strength) {
    const kD = c.factors.D ?? 0;
    const kL = c.factors.L ?? 0;
    let P = 0;
    let Mv = 0;
    for (const v of vertical) {
      const k = v.type === "D" ? kD : kL;
      P += k * v.W;
      Mv += k * v.W * v.x;
    }
    let Mo = 0;
    for (const l of lateral) {
      const k = l.type === "H" ? 1.6 : l.type === "Hq" ? 1.6 * (kL > 0 ? 1 : 0) : (c.factors.E ?? 0);
      Mo += k * l.P * l.y;
    }
    if (P <= 0) continue;
    const xbar = (Mv - Mo) / P;
    if (xbar <= 0) {
      flags.push(`${c.label}: factored resultant outside the footing — footing pressure not computed`);
      continue;
    }
    const q = (x: number) => pressureAt(P, xbar, B, x);
    const row: RwFootingRow = { combo: c, Pu: P, xbar, MuToe: 0, VuToe: 0, MuHeel: 0, VuHeel: 0 };
    footingRows.push(row);
    // toe: net upward = soil pressure − footing − soil over the toe (lb/ft per ft), moment at the front face
    const toeNet = (x: number) => q(x) - kD * (CONCRETE * hf + toeSoil);
    if (f.toe > 0) {
      const m = integrate(toeNet, 0, xFront, xFront).M; // ∫ net (x − xf) dx, x < xf → negative for upward net
      const Mu = -m * 12; // + bottom tension
      if (Mu > toe.MuPos.Mu) toe.MuPos = { Mu, combo: c.label };
      if (-Mu > -toe.MuNeg.Mu) toe.MuNeg = { Mu, combo: c.label };
      const V = Math.abs(integrate(toeNet, 0, toe.Vu.at, 0).F);
      if (V > toe.Vu.Vu) toe.Vu = { ...toe.Vu, Vu: V, combo: c.label };
      row.MuToe = Mu;
      row.VuToe = V;
    }
    // heel: net downward = footing + soil + surcharge − soil pressure, moment at the back face
    const heelDown = kD * (CONCRETE * hf + s.gamma * w.Hr) + kL * s.surcharge;
    const heelNet = (x: number) => heelDown - q(x);
    const hm = integrate(heelNet, xBack, B, xBack);
    const MuH = -hm.M * 12; // downward net → top tension → negative
    if (MuH > heel.MuPos.Mu) heel.MuPos = { Mu: MuH, combo: c.label };
    if (MuH < heel.MuNeg.Mu) heel.MuNeg = { Mu: MuH, combo: c.label };
    if (Math.abs(hm.F) > heel.Vu.Vu) heel.Vu = { ...heel.Vu, Vu: Math.abs(hm.F), combo: c.label };
    row.MuHeel = MuH;
    row.VuHeel = Math.abs(hm.F);
  }
  const AsMin = 0.0018 * 12 * f.h;

  // longitudinal shrinkage and temperature steel (24.4.3.2 / 24.4.3.3)
  const bL = bar(f.longitudinal.size);
  const AsL = f.longitudinal.count * bL.A;
  const reqL = 0.0018 * B * 12 * f.h;
  const spL = f.longitudinal.count > 1 ? (B * 12 - 2 * f.coverBottom) / (f.longitudinal.count - 1) : Infinity;
  const maxSpL = Math.min(5 * f.h, 18);

  // stem dowels: standard hook into the footing
  const hook = hookDevelopment(w.stem.vertical.size, w.stem.fy, f.fc);
  const avail = f.h - f.coverBottom - bBot.d;

  // ---------------- checks
  const checks: Check[] = [];
  const ck = (c: Omit<Check, "CD" | "pass"> & { pass?: boolean }): void => {
    checks.push({ CD: 1, pass: c.pass ?? c.ratio <= 1 + 1e-9, ...c });
  };
  for (const st of stability) {
    ck({
      name: `Sliding (${st.label}): FS = ${fmt(st.FSs, 2)} ≥ ${fmt(st.FSreq, 1)}`,
      demand: st.FSreq * st.H,
      capacity: st.R,
      ratio: (st.FSreq * st.H) / st.R,
      combo: st.label,
      unit: "lb/ft",
    });
    ck({
      name: `Overturning (${st.label}): FS = ${fmt(st.FSo, 2)} ≥ ${fmt(st.FSreq, 1)}`,
      demand: st.FSreq * st.Mo,
      capacity: st.Mr,
      ratio: (st.FSreq * st.Mo) / st.Mr,
      combo: st.label,
      unit: "lb-ft/ft",
    });
  }
  ck({
    name: "Soil bearing q_max ≤ q_a",
    demand: bearingGov.qmax,
    capacity: s.qa,
    ratio: bearingGov.ratio,
    combo: bearingGov.combo.label,
    unit: "psf",
  });
  for (const sec of [toe, heel]) {
    if (sec.name === "Toe" && f.toe <= 0) continue;
    if (sec.MuPos.Mu > 0)
      ck({
        name: `${sec.name} flexure, bottom bars (22.2)`,
        demand: sec.MuPos.Mu,
        capacity: sec.phiMnBot,
        ratio: sec.MuPos.Mu / sec.phiMnBot,
        combo: sec.MuPos.combo,
        unit: "lb-in/ft",
      });
    if (sec.MuNeg.Mu < 0)
      ck({
        name: `${sec.name} flexure, top bars (22.2)`,
        demand: -sec.MuNeg.Mu,
        capacity: sec.phiMnTop,
        ratio: -sec.MuNeg.Mu / sec.phiMnTop,
        combo: sec.MuNeg.combo,
        unit: "lb-in/ft",
      });
    ck({
      name: `${sec.name} one-way shear (22.5)${sec.name === "Toe" ? " at d from the face" : " at the face"}`,
      demand: sec.Vu.Vu,
      capacity: sec.phiVc,
      ratio: sec.Vu.Vu / sec.phiVc,
      combo: sec.Vu.combo,
      unit: "lb/ft",
    });
  }
  ck({
    name: "Bottom bars A_s ≥ 0.0018 A_g (7.6.1.1)",
    category: "detailing",
    demand: AsMin,
    capacity: AsBot,
    ratio: AsMin / AsBot,
    combo: "—",
    unit: "in²/ft",
  });
  ck({
    name: "Top bars A_s ≥ 0.0018 A_g (7.6.1.1)",
    category: "detailing",
    demand: AsMin,
    capacity: AsTop,
    ratio: AsMin / AsTop,
    combo: "—",
    unit: "in²/ft",
  });
  ck({
    name: "Longitudinal bars A_s ≥ 0.0018 A_g (24.4.3.2)",
    category: "detailing",
    demand: reqL,
    capacity: AsL,
    ratio: reqL / AsL,
    combo: "—",
    unit: "in²",
  });
  ck({
    name: "Longitudinal bar spacing ≤ min(5h, 18 in.) (24.4.3.3)",
    category: "detailing",
    demand: spL,
    capacity: maxSpL,
    ratio: spL / maxSpL,
    combo: "—",
    unit: "in",
  });
  ck({
    name: "Stem dowel hook development ℓ_dh ≤ h − cover (25.4.3)",
    category: "detailing",
    demand: hook.ldh,
    capacity: avail,
    ratio: hook.ldh / avail,
    combo: "—",
    unit: "in",
  });
  // concrete stem: one-way slab minimums (ACI 318-19 13.3.7.1 → 7.6.1.1, 7.7.2.3, 24.4.3) replace the
  // wall minimums of Table 11.6.1 / 11.7
  const concreteStem = w.stem.material === "concrete";
  const wallMinimum = (name: string) => /Table 11\.6\.1|11\.7\.[23]\.1/.test(name);
  for (const c of stem.checks) {
    if (concreteStem && wallMinimum(c.name)) continue;
    checks.push({ ...c, name: `Stem — ${c.name}` });
  }
  if (concreteStem) {
    const vMin = 0.0018 * 12 * w.stem.t;
    const hMin = 0.0018 * 12 * w.stem.t;
    const Av = stem.bars.As;
    const Ah = stem.bars.Ah;
    ck({
      name: "Stem — vertical A_s ≥ 0.0018 A_g, one-way slab (13.3.7.1, 7.6.1.1)",
      category: "detailing",
      demand: vMin,
      capacity: Av,
      ratio: vMin / Av,
      combo: "—",
      unit: "in²/ft",
    });
    ck({
      name: "Stem — horizontal A_s ≥ 0.0018 A_g, shrinkage and temperature (24.4.3.2)",
      category: "detailing",
      demand: hMin,
      capacity: Ah,
      ratio: hMin / Ah,
      combo: "—",
      unit: "in²/ft",
    });
    const sv = Math.min(3 * w.stem.t, 18);
    const sh = Math.min(5 * w.stem.t, 18);
    ck({
      name: "Stem — vertical bar spacing ≤ min(3h, 18 in.) (7.7.2.3)",
      category: "detailing",
      demand: w.stem.vertical.spacing,
      capacity: sv,
      ratio: w.stem.vertical.spacing / sv,
      combo: "—",
      unit: "in",
    });
    ck({
      name: "Stem — horizontal bar spacing ≤ min(5h, 18 in.) (24.4.3.3)",
      category: "detailing",
      demand: w.stem.horizontal.spacing,
      capacity: sh,
      ratio: w.stem.horizontal.spacing / sh,
      combo: "—",
      unit: "in",
    });
  }

  // ---------------- assumptions and flags
  assumptions.push(
    fromDefault("Lateral earth pressure", `${fmt(s.efp, 0)} pcf equivalent fluid, active`, s.efpSource, true),
    fromDefault("Backfill unit weight", `γ = ${fmt(s.gamma, 0)} pcf; K_a = efp / γ = ${fmt(Ka, 3)}`, s.efpSource, true),
    fromDefault(
      "Drainage",
      "Drained, free-draining backfill — no hydrostatic pressure (IBC 1610.1); provide drains / weep holes",
      "EOR",
      true,
    ),
    fromDefault(
      "Sliding resistance",
      `${s.friction !== undefined ? `μ = ${fmt(s.friction, 2)}` : `cohesion ${fmt(s.cohesion ?? 0, 0)} psf ≤ ½ D`}; passive ${fmt(s.passive, 0)} psf/ft, top ${fmt(dn, 2)} ft ignored`,
      s.soilSource,
      true,
    ),
    fromDefault("Soil bearing", `q_a = ${fmt(s.qa, 0)} psf`, s.qaSource, s.qaSource !== "soils report"),
    fromDefault(
      "Dowel hook factors",
      `ψ_e 1.0, ψ_r 1.6 (no confining reinforcement), ψ_o 1.0 (side cover ≥ 6 d_b), ψ_c ${fmt(hook.psi.c, 3)}`,
      "ACI 318-19 Table 25.4.3.2",
      true,
    ),
  );
  if (seis)
    assumptions.push(
      fromDefault(
        "Seismic earth pressure",
        `${fmt(seis.k, 1)}H psf, ${seis.shape === "uniform" ? "uniform" : "inverted triangle"}; wall inertia not added`,
        "geotechnical report (IBC 1803.5.12)",
        true,
      ),
    );
  else if (/^[DEF]/.test(w.seismicSDC) && w.Hr > 6)
    flags.push(
      `SDC ${w.seismicSDC} and more than 6 ft of backfill: the geotechnical report must give the dynamic seismic earth pressure (IBC 1803.5.12)`,
    );
  if (bearing.some((b) => Math.abs(b.e) > B / 6))
    flags.push("Resultant outside the middle third in at least one combination — partial contact (heel or toe lifts)");
  if (stability.some((st) => st.FSs < st.FSreq))
    flags.push("Sliding governs: widen the heel, add a shear key or deepen the toe for passive resistance");
  flags.push("Stem dowels lap the stem bars (ACI 318 25.5 Class B / TMS 402 §6.1.7) — detail on the drawings");
  if (w.stem.height > w.Hr + 1e-9 && w.stem.height - w.Hr > 0.5)
    flags.push(
      `Stem extends ${fmt(w.stem.height - w.Hr, 2)} ft above the retained grade — guard / fence loads not included unless entered`,
    );

  const freeboard = w.stem.height - w.Hr;
  const callout =
    `${fmt(w.Hr, 2)} ft retained; ${stem.callout}; ftg ${fmt(B, 2)} ft × ${fmt(f.h, 0)} in. ` +
    `(toe ${fmt(f.toe, 2)} ft, heel ${fmt(f.heel, 2)} ft), ${f.bottom.size} @ ${fmt(f.bottom.spacing, 0)} bot., ` +
    `${f.top.size} @ ${fmt(f.top.spacing, 0)} top, (${f.longitudinal.count}) ${f.longitudinal.size} long.`;
  const D = vertical.filter((v) => v.type === "D").reduce((a, v) => a + v.W, 0);
  const L = vertical.filter((v) => v.type === "L").reduce((a, v) => a + v.W, 0);
  return {
    id: w.id,
    mark: w.mark,
    kind: "retainingWall",
    title: "Cantilever retaining wall",
    callout,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Soil",
        x: 0,
        byType: loadVector({ D, L }),
        perFoot: loadVector({ D, L }),
        maxDown: bearingGov.P,
        maxDownCombo: bearingGov.combo.label,
        minNet: Math.min(...bearing.map((b) => b.P)),
        minNetCombo: bearing.reduce((a, b) => (b.P < a.P ? b : a)).combo.label,
      },
    ],
    loadLines: lines,
    assumptions: [...assumptions, ...stem.assumptions],
    flags: [...flags, ...stem.flags],
    input: w,
    geo: { B, ts, hf, Ht, Ka, freeboard },
    vertical,
    lateral,
    passive: { dp, dn, Pp },
    stability,
    bearing,
    bearingGov,
    footing: { toe, heel, AsMin, AsBot, AsTop, rows: footingRows },
    longitudinal: { As: AsL, req: reqL, spacing: spL, maxSpacing: maxSpL },
    dowel: { size: w.stem.vertical.size, db: hook.db, ldh: hook.ldh, avail, psi: hook.psi },
    stem,
  };
}
