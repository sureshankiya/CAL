/**
 * CW-# — concrete and CMU walls / stem walls, single wythe, per foot of wall.
 *
 * Out of plane: vertical strip from the base to the top support (+ parapet), Timoshenko
 * analysis (src/engine/analysis/panel.ts) for wind, seismic (ASCE 7 §12.11.1:
 * F_p = 0.4 S_DS I_e w_w ≥ 0.1 w_w, plus any added seismic pressure), lateral earth pressure
 * (equivalent fluid, H) and eccentric top load; axial load = top loads (links + entries) plus
 * self weight above the section.
 *
 *  - CMU (TMS 402 ASD, §8.3, src/engine/design/masonry.ts): ASCE 7 §2.4 combinations,
 *    H factor 1.0; axial P / P_a, combined axial + flexure M / M_c(P) on the cracked section,
 *    out-of-plane shear f_v / F_v with A_nv = b d; in-plane shear and flexure when an
 *    in-plane force is entered; reinforcement: vertical ≥ A_v / 3 where shear reinforcement is
 *    required (§8.3.5.2.1), special reinforced wall minimums (§7.3.2.6, SDC D–F) and the
 *    prescriptive seismic reinforcement (TMS 402 §7.4, by SDC)
 *  - Concrete (ACI 318-19 Ch. 11, strength design): ASCE 7 §2.3 combinations, H factor 1.6;
 *    φM_n at the factored axial load (22.2, 22.4), slenderness moment magnifier
 *    (6.6.4.5, member based, (EI)_eff = 0.4 E_c I_g / (1 + β_dns)) when k l_c / r > 22,
 *    one-way shear (22.5), in-plane shear (11.5.4.3), minimum reinforcement (Table 11.6.1)
 *    and spacing (11.7.2.1, 11.7.3.1)
 */

import { asdCombinations, relevantCombinations, strengthCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, addLoads, loadVector, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { analysePanel, type PanelLoad, type PanelResult } from "../analysis/panel";
import { bar, momentAtAxial, oneWayShear, type StrengthBar } from "../design/concrete";
import {
  allowableFs,
  type TmsEdition,
  asdBalance,
  asdMomentCapacity,
  axialAllowable,
  cmuSelfWeight,
  masonryModuli,
  masonryShear,
  type AsdSectionResult,
  type BlockGeometry,
  type SectionBar,
} from "../design/masonry";
import { governingCheck, type Check } from "../design/wood";
import { asce7Of, type DesignContext, type ExtraLoad, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export type WallSupport = "pinned-fixed" | "pinned-pinned" | "fixed-fixed" | "cantilever";

export interface MasonryWallInput {
  id: string;
  mark: string;
  description: string;
  material: "cmu" | "concrete";
  /** panel length, ft */
  L: number;
  /** base to top support (or top of a cantilever), ft */
  h: number;
  parapet?: number;
  support: WallSupport;
  /** specified thickness, in */
  t: number;
  cmu?: {
    fm: number;
    fmSource: string;
    /** unit strength (for the record) */
    fcu?: number;
    mortar: "M" | "S" | "N";
    block: Omit<BlockGeometry, "t">;
    /** F_b / f'm (TMS 402 §8.3.4.2.2: 0.45) */
    FbFactor: number;
    /** shear stiffness in the analysis (Tedds convention) */
    shearDeformation: boolean;
  };
  concrete?: { fc: number; gamma: number; cover: number };
  fy: number;
  vertical: { size: string; spacing: number; layout: "center" | "offset" | "each-face"; d?: number };
  horizontal: { size: string; count: number; spacing: number };
  /** top loads, plf by type (line links + entries) */
  extra: ExtraLoad[];
  /** eccentricity of the top load from the wall centre line, in (+ toward the interior) */
  eccentricity: number;
  wind: { W: number; Wp: number };
  seismic: { include: boolean; Eadd: number; SDC: string; Ie: number; SDS: number };
  /**
   * Lateral earth pressure: equivalent fluid efp (pcf) to `height` above the base plus a
   * uniform surcharge pressure (psf); `seismic` is the dynamic earth-pressure increment from
   * the geotechnical report (IBC 1803.5.12), k × height psf — uniform, or an inverted
   * triangle with the maximum at the top of the soil — carried as E.
   */
  soil?: {
    height: number;
    efp: number;
    surcharge: number;
    seismic?: { shape: "uniform" | "inverted"; k: number };
  };
  inPlane?: { W: number; E: number; h?: number };
}

export interface PanelCase {
  type: LoadType | "H";
  r: PanelResult;
  /** acts in one direction only (seismic earth-pressure increment) */
  oneWay?: boolean;
}

export interface WallSectionCheck {
  combo: Combination;
  sign: 1 | -1;
  x: number;
  P: number;
  M: number;
  V: number;
}

export interface MasonryWallResult extends MemberResultBase {
  kind: "masonryWall";
  input: MasonryWallInput;
  section: { b: number; A: number; I: number; S: number; r: number; Anv: number; dPos: number; dNeg: number };
  bars: { Av: number; As: number; Ah: number };
  self: { w: number; text: string[]; cmu?: ReturnType<typeof cmuSelfWeight> };
  mat: {
    E: number;
    G?: number;
    n?: number;
    Fb?: number;
    Fs?: number;
    fm?: number;
    fc?: number;
  };
  lateral: { W: number; Wp: number; Fp: number; Ewall: number; E: number; H?: { top: number; base: number } };
  top: LoadVector;
  combos: Array<{ combo: Combination; ratio: number }>;
  K: number;
  slender: { klr: number; limit: number };
  /** governing out-of-plane combined check */
  flex: WallSectionCheck & {
    Mc: number;
    ratio: number;
    cap:
      AsdSectionResult | { c: number; phi: number; phiMn: number; epsT: number; a: number; delta: number; Mu0: number };
  };
  axial: {
    combo: Combination;
    P: number;
    cap: number;
    ratio: number;
    fa?: number;
    Fa?: number;
    sr: number;
    red: number;
  };
  shear: WallSectionCheck & { cap: number; ratio: number; fv?: number; Fvm?: number; MVd?: number; FvMax?: number };
  balance?: ReturnType<typeof asdBalance>;
  diagram: { combo: Combination; sign: 1 | -1; x: number[]; P: number[]; V: number[]; M: number[] };
  inPlaneRes?: {
    combo: string;
    V: number;
    M: number;
    P: number;
    An: number;
    MVd: number;
    shearCap: number;
    shearText: string;
    Mcap: number;
    ratioV: number;
    ratioM: number;
    /** shear reinforcement required (V > F_vm A_n) */
    needsAv?: boolean;
  };
}

const Hfactor = (c: Combination) => (c.kind === "ASD" ? 1.0 : 1.6);

export function designMasonryWall(ctx: DesignContext, w: MasonryWallInput): MasonryWallResult {
  const cmu = w.material === "cmu";
  if (cmu && !w.cmu) throw new Error("CMU wall: masonry properties missing");
  if (!cmu && !w.concrete) throw new Error("Concrete wall: concrete properties missing");
  const b = 12;
  const t = w.t;
  const hp = w.support === "cantilever" ? 0 : (w.parapet ?? 0);
  const Htot = w.h + hp;
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];
  const lines: LoadLine[] = [];

  // ---------------- materials and self weight
  const vb = bar(w.vertical.size);
  const hb = bar(w.horizontal.size);
  const As = (vb.A * 12) / w.vertical.spacing; // per layer, in²/ft
  const layers = w.vertical.layout === "each-face" ? 2 : 1;
  const Ah = (w.horizontal.count * hb.A * 12) / w.horizontal.spacing; // in²/ft of height
  let self: MasonryWallResult["self"];
  let mat: MasonryWallResult["mat"];
  if (cmu) {
    const c = w.cmu!;
    const cw = cmuSelfWeight({ ...c.block, t }, w.horizontal.spacing);
    self = {
      w: cw.w,
      cmu: cw,
      text: [
        `A_block = [t l_b − (l_b − N_web t_bw − N_end t_be)(t − 2 t_bf)] / l_b = ${fmt(cw.Ablock, 2)} in²/ft`,
        `A_grout = (l_b − N_web t_bw − N_end t_be)(t − 2 t_bf) / l_b = ${fmt(cw.Agrout, 2)} in²/ft`,
        `w_wall = A_block γ_block + A_grout γ_grout = ${fmt(cw.wWall, 2)} psf; bond beam w_bb = 2 t_bf γ_block + (t − 2 t_bf) γ_grout = ${fmt(cw.wBond, 2)} psf`,
        `w_sw = ((s_v − h_b) w_wall + h_b w_bb) / s_v = ${fmt(cw.w, 2)} psf`,
      ],
    };
    const mod = masonryModuli(c.fm);
    mat = { E: mod.Em, G: mod.Ev, n: mod.n, Fb: c.FbFactor * c.fm, Fs: allowableFs(w.fy), fm: c.fm };
    assumptions.push(
      fromDefault("Masonry compressive strength", `f'm = ${fmt(c.fm, 0)} psi`, c.fmSource, true),
      fromDefault(
        "Construction",
        `Hollow concrete units, fully grouted, running bond, Type ${c.mortar} PCL mortar`,
        "TMS 602",
      ),
    );
    if (Math.abs(c.FbFactor - 0.45) > 1e-6)
      assumptions.push(
        fromDefault(
          "Allowable flexural compression",
          `F_b = ${fmt(c.FbFactor, 3)} f'm (entered; TMS 402 §8.3.4.2.2 gives 0.45 f'm)`,
          "engineer",
          true,
        ),
      );
  } else {
    const c = w.concrete!;
    self = {
      w: (c.gamma * t) / 12,
      text: [`w_sw = γ_c t = ${fmt(c.gamma, 0)} pcf × ${fmt(t / 12, 3)} ft = ${fmt((c.gamma * t) / 12, 2)} psf`],
    };
    mat = { E: 57000 * Math.sqrt(c.fc), fc: c.fc };
  }

  // ---------------- section
  const A = b * t;
  const I = (b * t ** 3) / 12;
  const S = I / (t / 2);
  const r = Math.sqrt(I / A);
  const cover = cmu ? 0 : w.concrete!.cover;
  // depth to the bars from the interior face (positive moment: exterior face in tension)
  let barsPos: SectionBar[];
  let barsNeg: SectionBar[];
  if (w.vertical.layout === "each-face") {
    const d1 = t - cover - vb.d / 2;
    const d2 = cover + vb.d / 2;
    barsPos = [
      { d: d1, A: As },
      { d: d2, A: As },
    ];
    barsNeg = barsPos.map((x) => ({ d: t - x.d, A: x.A }));
  } else {
    const d = w.vertical.layout === "center" ? t / 2 : (w.vertical.d ?? t / 2);
    barsPos = [{ d, A: As }];
    barsNeg = [{ d: t - d, A: As }];
  }
  const dPos = Math.max(...barsPos.map((x) => x.d));
  const dNeg = Math.max(...barsNeg.map((x) => x.d));
  const Anv = b * Math.min(dPos, dNeg);

  // ---------------- loads
  const top = zeroLoads();
  for (const e of w.extra) {
    if (e.kind !== "line") throw new Error(`${e.label}: walls take line loads (plf) — use a line link`);
    top[e.type] += e.w ?? 0;
    lines.push({
      type: e.type,
      label: e.label,
      expr: `${fmt(e.w ?? 0, 1)} plf at the top`,
      value: e.w ?? 0,
      unit: "plf",
    });
  }
  lines.push({
    type: "D",
    label: "Wall self weight",
    expr: `${fmt(self.w, 2)} psf × ${fmt(Htot, 2)} ft`,
    value: self.w * Htot,
    unit: "plf",
  });
  const Fp = w.seismic.include ? Math.max(0.4 * w.seismic.SDS * w.seismic.Ie, 0.1) : 0;
  const Ewall = Fp * self.w;
  const E = w.seismic.include ? Ewall + w.seismic.Eadd : 0;
  const soil = w.soil && w.soil.height > 0 ? w.soil : undefined;
  const Hlat = soil
    ? { base: soil.efp * Math.min(soil.height, Htot) + soil.surcharge, top: soil.surcharge }
    : undefined;
  if (w.wind.W)
    lines.push({
      type: "W",
      label: "Wind on the wall (out of plane)",
      expr: "entered, C&C",
      value: w.wind.W,
      unit: "psf",
    });
  if (hp > 0 && w.wind.Wp)
    lines.push({ type: "W", label: "Wind on the parapet", expr: "entered, C&C", value: w.wind.Wp, unit: "psf" });
  if (E)
    lines.push({
      type: "E",
      label: "Seismic out of plane, ASCE 7 §12.11.1",
      expr: `max(0.4 S_DS I_e, 0.1) w_sw + E_add = ${fmt(Fp, 3)} × ${fmt(self.w, 2)} + ${fmt(w.seismic.Eadd, 1)}`,
      value: E,
      unit: "psf",
    });

  // ---------------- analysis per load type
  const geo = {
    h: w.h,
    parapet: hp,
    base: w.support === "pinned-pinned" ? ("pinned" as const) : ("fixed" as const),
    top:
      w.support === "cantilever"
        ? ("free" as const)
        : w.support === "fixed-fixed"
          ? ("fixed" as const)
          : ("pinned" as const),
    EI: mat.E * I,
    GAv: cmu && w.cmu!.shearDeformation ? mat.G! * Anv : undefined,
  };
  const cases: PanelCase[] = [];
  const windLoads: PanelLoad[] = [];
  if (w.wind.W) windLoads.push({ x1: 0, x2: w.h, q1: w.wind.W, q2: w.wind.W });
  if (hp > 0 && w.wind.Wp) windLoads.push({ x1: w.h, x2: Htot, q1: w.wind.Wp, q2: w.wind.Wp });
  if (windLoads.length) cases.push({ type: "W", r: analysePanel(geo, windLoads) });
  if (E) cases.push({ type: "E", r: analysePanel(geo, [{ x1: 0, x2: Htot, q1: E, q2: E }]) });
  if (soil) {
    const hs = Math.min(soil.height, Htot);
    cases.push({
      type: "H",
      r: analysePanel(geo, [{ x1: 0, x2: hs, q1: soil.efp * hs + soil.surcharge, q2: soil.surcharge }]),
    });
    lines.push({
      type: "D",
      label: "Lateral earth pressure (H), equivalent fluid",
      expr: `${fmt(soil.efp, 0)} pcf × ${fmt(hs, 2)} ft${soil.surcharge ? ` + ${fmt(soil.surcharge, 0)} psf surcharge` : ""} at the base`,
      value: soil.efp * hs + soil.surcharge,
      unit: "psf",
    });
  }
  const Esoil = soil?.seismic && soil.seismic.k > 0 ? { ...soil.seismic, hs: Math.min(soil.height, Htot) } : undefined;
  if (Esoil) {
    const q = Esoil.k * Esoil.hs;
    cases.push({
      type: "E",
      oneWay: true,
      r: analysePanel(geo, [
        Esoil.shape === "uniform" ? { x1: 0, x2: Esoil.hs, q1: q, q2: q } : { x1: 0, x2: Esoil.hs, q1: 0, q2: q },
      ]),
    });
    lines.push({
      type: "E",
      label: "Seismic earth-pressure increment (geotechnical report)",
      expr: `${fmt(Esoil.k, 1)} pcf × ${fmt(Esoil.hs, 2)} ft, ${Esoil.shape === "uniform" ? "uniform" : "inverted triangle, maximum at the top"}`,
      value: q,
      unit: "psf",
    });
  }
  // eccentric top load: moment per type (lb-in per ft), + toward the interior → exterior face in tension
  for (const tp of LOAD_TYPES) {
    if (!top[tp] || !w.eccentricity || w.support === "cantilever") continue;
    cases.push({ type: tp, r: analysePanel(geo, [], top[tp] * w.eccentricity) });
  }
  const xs = analysePanel(geo, []).x;
  const nNode = xs.length;
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const tp of LOAD_TYPES) if (Math.abs(top[tp]) > 1e-9) present[tp] = true;
  if (windLoads.length || w.inPlane?.W) present.W = true;
  if (E || Esoil || w.inPlane?.E) present.E = true;
  const combos = relevantCombinations(
    (cmu ? asdCombinations : strengthCombinations)({
      SDS: ctx.SDS,
      includeWind: !!present.W,
      includeSeismic: !!present.E,
    }),
    present,
  ).map((c) => (soil ? { ...c, label: `${c.label} + ${cmu ? "" : "1.6"}H` } : c));
  const axialAt = (c: Combination, x: number) => {
    let P = 0;
    for (const tp of LOAD_TYPES) P += (c.factors[tp] ?? 0) * top[tp];
    P += (c.factors.D ?? 0) * self.w * (Htot - x);
    return P;
  };
  const effects = (c: Combination, sign: 1 | -1, i: number) => {
    let M = 0;
    let V = 0;
    for (const cs of cases) {
      const f = cs.type === "H" ? Hfactor(c) : (c.factors[cs.type] ?? 0);
      if (!f) continue;
      const s = (cs.type === "W" || cs.type === "E") && !cs.oneWay ? sign : 1;
      M += s * f * cs.r.M[i];
      V += s * f * cs.r.V[i];
    }
    return { M, V };
  };
  const signs: Array<1 | -1> = present.W || present.E ? [1, -1] : [1];

  // ---------------- checks per combination and section
  const K = w.support === "cantilever" ? 2 : 1;
  let flexGov: MasonryWallResult["flex"] | undefined;
  let shearGov: MasonryWallResult["shear"] | undefined;
  let diagram: MasonryWallResult["diagram"] | undefined;
  const comboRatios: MasonryWallResult["combos"] = [];
  const concreteSlender = { klr: (K * w.h * 12) / (cmu ? r : 0.3 * t), limit: 22 };
  let axialGov: MasonryWallResult["axial"] | undefined;
  const fm = mat.fm ?? 0;
  const fc = mat.fc ?? 0;
  const sqrtFc = Math.sqrt(fc);
  const tms: TmsEdition = ctx.cycleId === "2025" ? "22" : "16";
  const ax = cmu ? axialAllowable(fm, A, K * w.h * 12, r, 0, 32000, tms) : undefined;
  for (const c of combos) {
    let worst = 0;
    // axial at the base
    const Pb = axialAt(c, 0);
    let axRatio: number;
    if (cmu) {
      axRatio = Pb / ax!.Pa;
      if (!axialGov || axRatio > axialGov.ratio)
        axialGov = { combo: c, P: Pb, cap: ax!.Pa, ratio: axRatio, fa: Pb / A, Fa: ax!.Fa, sr: ax!.sr, red: ax!.red };
    } else {
      const Ast = As * layers;
      const phiPnMax = 0.65 * 0.8 * (0.85 * fc * (A - Ast) + w.fy * Ast);
      axRatio = Pb / phiPnMax;
      if (!axialGov || axRatio > axialGov.ratio)
        axialGov = { combo: c, P: Pb, cap: phiPnMax, ratio: axRatio, sr: concreteSlender.klr, red: 1 };
    }
    worst = Math.max(worst, axRatio);
    for (const sign of signs) {
      // slenderness magnifier (concrete)
      let delta = 1;
      if (!cmu && concreteSlender.klr > concreteSlender.limit) {
        const Pu = Math.max(0, Pb);
        const PD = (c.factors.D ?? 0) * (top.D + self.w * Htot);
        const beta = Pu > 0 ? Math.min(1, Math.max(0, PD / Pu)) : 0;
        const EIeff = (0.4 * mat.E * I) / (1 + beta);
        const Pc = (Math.PI ** 2 * EIeff) / (K * w.h * 12) ** 2;
        delta = Pu >= 0.75 * Pc ? Infinity : Math.max(1, 1 / (1 - Pu / (0.75 * Pc)));
      }
      for (let i = 0; i < nNode; i++) {
        const x = xs[i];
        const P = axialAt(c, x);
        const ef = effects(c, sign, i);
        const M0 = ef.M;
        const M = M0 * delta;
        const V = Math.abs(ef.V);
        const bars = M >= 0 ? barsPos : barsNeg;
        const dEff = M >= 0 ? dPos : dNeg;
        let Mc: number;
        let cap: MasonryWallResult["flex"]["cap"];
        if (cmu) {
          const s = asdMomentCapacity(P, b, t, bars, mat.n!, mat.Fb!, mat.Fs!);
          Mc = s.Mc;
          cap = s;
        } else {
          const s = momentAtAxial(P, b, t, bars as StrengthBar[], fc, w.fy);
          Mc = s.ok ? s.phiMn : 0;
          cap = { c: s.c, phi: s.phi, phiMn: Mc, epsT: s.epsT, a: s.a, delta, Mu0: Math.abs(M0) };
        }
        const fr = Math.abs(M) < 1e-9 ? 0 : Mc > 0 ? Math.abs(M) / Mc : Infinity;
        if (!flexGov || fr > flexGov.ratio) flexGov = { combo: c, sign, x, P, M, V, Mc, ratio: fr, cap };
        // shear
        let sCap: number;
        let extra: Partial<MasonryWallResult["shear"]> = {};
        if (cmu) {
          const MVd = V > 0 ? Math.abs(M) / (V * dEff) : 1;
          const sh = masonryShear({ fm, An: A, MVd, P, edition: tms });
          sCap = sh.Fv * Anv;
          extra = { fv: V / Anv, Fvm: sh.Fvm, MVd: sh.r, FvMax: sh.FvMax };
        } else {
          const AsT = bars.reduce((s, x) => s + (x.d >= dEff - 1e-9 ? x.A : 0), 0);
          sCap = oneWayShear(b, dEff, AsT, fc).phiVc;
        }
        const sr = V <= 1e-9 ? 0 : V / sCap;
        if (!shearGov || sr > shearGov.ratio) shearGov = { combo: c, sign, x, P, M, V, cap: sCap, ratio: sr, ...extra };
        worst = Math.max(worst, fr, sr);
      }
    }
    comboRatios.push({ combo: c, ratio: worst });
  }
  const gov = flexGov!;
  {
    const P: number[] = [];
    const V: number[] = [];
    const M: number[] = [];
    for (let i = 0; i < nNode; i++) {
      const ef = effects(gov.combo, gov.sign, i);
      P.push(axialAt(gov.combo, xs[i]));
      V.push(ef.V);
      M.push(ef.M);
    }
    diagram = { combo: gov.combo, sign: gov.sign, x: xs, P, V, M };
  }

  // ---------------- checks
  const checks: Check[] = [];
  const unitM = cmu ? "lb-in" : "lb-in";
  checks.push({
    name: cmu
      ? `Axial compression, P / P_a (TMS 402 Eq. ${ax!.eq})`
      : "Axial compression, P_u / φP_n,max (ACI 318 22.4.2.1)",
    demand: axialGov!.P,
    capacity: axialGov!.cap,
    ratio: axialGov!.ratio,
    pass: axialGov!.ratio <= 1,
    combo: axialGov!.combo.label,
    CD: 1,
    unit: "lb",
  });
  checks.push({
    name: cmu
      ? `Combined axial and out-of-plane flexure, M / M_c (TMS 402 §8.3.4.2) at x = ${fmt(gov.x, 2)} ft`
      : `Combined axial and out-of-plane flexure, M_u / φM_n (ACI 318 22.4) at x = ${fmt(gov.x, 2)} ft`,
    demand: Math.abs(gov.M),
    capacity: gov.Mc,
    ratio: gov.ratio,
    pass: gov.ratio <= 1,
    combo: gov.combo.label,
    CD: 1,
    unit: unitM,
  });
  const sg = shearGov!;
  checks.push({
    name: cmu
      ? `Out-of-plane shear, f_v / F_v (TMS 402 §8.3.5.1) at x = ${fmt(sg.x, 2)} ft`
      : `Out-of-plane shear, V_u / φV_c (ACI 318 22.5) at x = ${fmt(sg.x, 2)} ft`,
    demand: cmu ? sg.fv! : sg.V,
    capacity: cmu ? sg.cap / Anv : sg.cap,
    ratio: sg.ratio,
    pass: sg.ratio <= 1,
    combo: sg.combo.label,
    CD: 1,
    unit: cmu ? "psi" : "lb",
  });
  if (!cmu && concreteSlender.klr > concreteSlender.limit) {
    const cap = gov.cap as { delta: number };
    if (!Number.isFinite(cap.delta)) flags.push("P_u ≥ 0.75 P_c — wall unstable out of plane");
    assumptions.push(
      fromDefault(
        "Slenderness",
        `k l_c / r = ${fmt(concreteSlender.klr, 1)} > 22: moments magnified per ACI 318 6.6.4.5 (member based, C_m = 1.0, (EI)_eff = 0.4 E_c I_g / (1 + β_dns))`,
        "ACI 318 6.2.5, 6.6.4",
      ),
    );
  }

  // reinforcement
  const AvVert = As * layers;
  if (cmu) {
    const sdc = w.seismic.SDC;
    if (["C", "D", "E", "F"].includes(sdc)) {
      const sMax = sdc === "C" ? 120 : 48;
      checks.push({
        name: `Prescriptive seismic reinforcement, SDC ${sdc}: vertical bar ≥ 0.2 in² at ≤ ${sMax} in. (TMS 402 §7.4)`,
        category: "detailing",
        demand: w.vertical.spacing,
        capacity: vb.A >= 0.2 - 1e-9 ? sMax : 0,
        ratio: vb.A >= 0.2 - 1e-9 ? w.vertical.spacing / sMax : Infinity,
        pass: vb.A >= 0.2 - 1e-9 && w.vertical.spacing <= sMax,
        combo: "—",
        CD: 1,
        unit: "in",
      });
      checks.push({
        name: `Prescriptive seismic reinforcement, SDC ${sdc}: horizontal ≥ 0.2 in² at ≤ ${sMax} in. (TMS 402 §7.4)`,
        category: "detailing",
        demand: w.horizontal.spacing,
        capacity: w.horizontal.count * hb.A >= 0.2 - 1e-9 ? sMax : 0,
        ratio: w.horizontal.count * hb.A >= 0.2 - 1e-9 ? w.horizontal.spacing / sMax : Infinity,
        pass: w.horizontal.count * hb.A >= 0.2 - 1e-9 && w.horizontal.spacing <= sMax,
        combo: "—",
        CD: 1,
        unit: "in",
      });
      if (sdc !== "C") {
        // special reinforced masonry shear walls (TMS 402 §7.3.2.6): spacing ≤ min(L/3, H/3, 48 in.),
        // ρ ≥ 0.0007 each direction, sum ≥ 0.002 of the gross area
        const Ag = t * 12;
        const rv = AvVert / Ag;
        const rh = Ah / Ag;
        const sLim = Math.min((w.L * 12) / 3, (w.h * 12) / 3, 48);
        checks.push(
          {
            name: `Special reinforced wall: bar spacing ≤ min(L/3, H/3, 48 in.) = ${fmt(sLim, 1)} in. (TMS 402 §7.3.2.6)`,
            category: "detailing",
            demand: Math.max(w.vertical.spacing, w.horizontal.spacing),
            capacity: sLim,
            ratio: Math.max(w.vertical.spacing, w.horizontal.spacing) / sLim,
            pass: Math.max(w.vertical.spacing, w.horizontal.spacing) <= sLim + 1e-9,
            combo: "—",
            CD: 1,
            unit: "in",
          },
          {
            name: "Special reinforced wall: ρ ≥ 0.0007 each direction (TMS 402 §7.3.2.6)",
            category: "detailing",
            demand: 0.0007,
            capacity: Math.min(rv, rh),
            ratio: 0.0007 / Math.min(rv, rh),
            pass: Math.min(rv, rh) >= 0.0007 - 1e-12,
            combo: "—",
            CD: 1,
            unit: "",
          },
          {
            name: "Special reinforced wall: ρ_v + ρ_h ≥ 0.002 (TMS 402 §7.3.2.6)",
            category: "detailing",
            demand: 0.002,
            capacity: rv + rh,
            ratio: 0.002 / (rv + rh),
            pass: rv + rh >= 0.002 - 1e-12,
            combo: "—",
            CD: 1,
            unit: "",
          },
        );
      }
      assumptions.push(
        fromDefault(
          "Seismic reinforcement",
          `TMS 402 §7.4 prescriptive minimums for SDC ${sdc} (bar area ≥ 0.2 in², spacing ≤ ${sMax} in. each way)${sdc === "C" ? "" : "; special reinforced wall limits of §7.3.2.6"}`,
          "TMS 402 Ch. 7 — confirm limits and wall classification against the adopted edition",
          true,
        ),
      );
    }
  } else {
    const small = vb.d <= 0.625 && w.fy >= 60000;
    const rhoLmin = small ? 0.0012 : 0.0015;
    const rhoTmin = hb.d <= 0.625 && w.fy >= 60000 ? 0.002 : 0.0025;
    const rhoL = AvVert / A;
    const rhoT = Ah / A;
    checks.push(
      {
        name: `Vertical reinforcement ρ_l ≥ ${rhoLmin} (ACI 318 Table 11.6.1)`,
        category: "detailing",
        demand: rhoLmin,
        capacity: rhoL,
        ratio: rhoLmin / rhoL,
        pass: rhoL >= rhoLmin,
        combo: "—",
        CD: 1,
        unit: "",
      },
      {
        name: `Horizontal reinforcement ρ_t ≥ ${rhoTmin} (ACI 318 Table 11.6.1)`,
        category: "detailing",
        demand: rhoTmin,
        capacity: rhoT,
        ratio: rhoTmin / rhoT,
        pass: rhoT >= rhoTmin,
        combo: "—",
        CD: 1,
        unit: "",
      },
      {
        name: "Vertical bar spacing ≤ min(3h, 18 in.) (ACI 318 11.7.2.1)",
        category: "detailing",
        demand: w.vertical.spacing,
        capacity: Math.min(3 * t, 18),
        ratio: w.vertical.spacing / Math.min(3 * t, 18),
        pass: w.vertical.spacing <= Math.min(3 * t, 18),
        combo: "—",
        CD: 1,
        unit: "in",
      },
      {
        name: "Horizontal bar spacing ≤ min(3h, 18 in.) (ACI 318 11.7.3.1)",
        category: "detailing",
        demand: w.horizontal.spacing,
        capacity: Math.min(3 * t, 18),
        ratio: w.horizontal.spacing / Math.min(3 * t, 18),
        pass: w.horizontal.spacing <= Math.min(3 * t, 18),
        combo: "—",
        CD: 1,
        unit: "in",
      },
    );
    if (t > 10 && layers < 2)
      checks.push({
        name: "Walls thicker than 10 in.: two layers of reinforcement (ACI 318 11.7.2.3)",
        category: "detailing",
        demand: 2,
        capacity: layers,
        ratio: 2,
        pass: false,
        combo: "—",
        CD: 1,
        unit: "",
      });
  }

  // ---------------- in plane
  let inPlaneRes: MasonryWallResult["inPlaneRes"];
  if (w.inPlane && (w.inPlane.W || w.inPlane.E)) {
    const hIp = w.inPlane.h ?? w.h;
    const Lin = w.L * 12;
    const ipBars: SectionBar[] = [];
    const nb = Math.max(2, Math.floor((Lin - 8) / w.vertical.spacing) + 1);
    const step = nb > 1 ? (Lin - 8) / (nb - 1) : 0;
    for (let i = 0; i < nb; i++) ipBars.push({ d: 4 + i * step, A: vb.A * layers });
    const An = t * Lin;
    const MVd = hIp / w.L;
    let best: MasonryWallResult["inPlaneRes"] | undefined;
    let needsAv = false;
    for (const c of combos) {
      const V = Math.abs((c.factors.W ?? 0) * w.inPlane.W) + Math.abs((c.factors.E ?? 0) * w.inPlane.E);
      if (!V) continue;
      const M = V * hIp * 12;
      const P = axialAt(c, 0) * w.L;
      let shearCap: number;
      let shearText: string;
      let Mcap: number;
      if (cmu) {
        const sh = masonryShear({
          fm,
          An,
          MVd,
          P,
          Av: w.horizontal.count * hb.A,
          s: w.horizontal.spacing,
          d: Lin,
          Fs: mat.Fs,
          edition: tms,
        });
        shearCap = sh.Fv * An;
        // shear reinforcement required where the masonry alone does not carry V (§8.3.5.2.1)
        needsAv = needsAv || V > Math.min(sh.Fvm, sh.FvMax) * An;
        shearText = `F_vm = ${fmt(sh.Fvm, 1)} psi, F_vs = ${fmt(sh.Fvs, 1)} psi, F_v = ${fmt(sh.Fv, 1)} psi (≤ ${fmt(sh.FvMax, 1)} psi), A_n = ${fmt(An, 0)} in²`;
        Mcap = asdMomentCapacity(P, t, Lin, ipBars, mat.n!, mat.Fb!, mat.Fs!).Mc;
      } else {
        const ac = MVd <= 1.5 ? 3 : MVd >= 2 ? 2 : 3 - (MVd - 1.5) * 2;
        const rhoT = (w.horizontal.count * hb.A) / (t * w.horizontal.spacing);
        const Vn = Math.min((ac * sqrtFc + rhoT * w.fy) * An, 8 * sqrtFc * An);
        shearCap = 0.75 * Vn;
        shearText = `φV_n = 0.75 (α_c √f'c + ρ_t f_y) A_cv ≤ 0.75 × 8 √f'c A_cv; α_c = ${fmt(ac, 2)}, ρ_t = ${fmt(rhoT, 5)}, A_cv = ${fmt(An, 0)} in²`;
        const s = momentAtAxial(P, t, Lin, ipBars as StrengthBar[], fc, w.fy);
        Mcap = s.ok ? s.phiMn : 0;
      }
      const ratioV = V / shearCap;
      const ratioM = Mcap > 0 ? M / Mcap : Infinity;
      if (!best || Math.max(ratioV, ratioM) > Math.max(best.ratioV, best.ratioM))
        best = { combo: c.label, V, M, P, An, MVd, shearCap, shearText, Mcap, ratioV, ratioM };
    }
    if (best) {
      inPlaneRes = { ...best, needsAv };
      if (cmu && needsAv)
        checks.push({
          name: "Shear reinforcement required: perpendicular (vertical) steel ≥ A_v / 3 (TMS 402 §8.3.5.2.1)",
          category: "detailing",
          demand: Ah / 3,
          capacity: As * layers,
          ratio: Ah / 3 / (As * layers),
          pass: As * layers >= Ah / 3,
          combo: "—",
          CD: 1,
          unit: "in²",
        });
      checks.push(
        {
          name: cmu ? "In-plane shear (TMS 402 §8.3.5.1)" : "In-plane shear (ACI 318 11.5.4.3)",
          demand: best.V,
          capacity: best.shearCap,
          ratio: best.ratioV,
          pass: best.ratioV <= 1,
          combo: best.combo,
          CD: 1,
          unit: "lb",
        },
        {
          name: cmu
            ? "In-plane flexure with axial load, cracked section"
            : "In-plane flexure with axial load (ACI 318 22.4)",
          demand: best.M,
          capacity: best.Mcap,
          ratio: best.ratioM,
          pass: best.ratioM <= 1,
          combo: best.combo,
          CD: 1,
          unit: "lb-in",
        },
      );
      if (cmu && ["D", "E", "F"].includes(w.seismic.SDC))
        flags.push(
          "Special reinforced masonry shear walls (SDC D–F): confirm the shear-wall classification and TMS 402 §7.3.2.6 detailing (in-plane shear amplification is not applied here)",
        );
    }
  }

  // ---------------- assumptions
  assumptions.push(
    fromDefault(
      "Out-of-plane support",
      {
        "pinned-fixed": "Pinned at the top (floor / roof diaphragm), fixed at the base (footing)",
        "pinned-pinned": "Pinned at the top and at the base",
        "fixed-fixed": "Fixed at the top and at the base",
        cantilever: "Fixed at the base, free at the top (cantilever)",
      }[w.support],
      "engineer",
    ),
    fromDefault(
      "Analysis",
      cmu && w.cmu!.shearDeformation
        ? `Vertical strip 12 in. wide, bending and shear deformation (E_m I, E_v A_nv), K = ${K}`
        : `Vertical strip 12 in. wide, gross-section stiffness (indeterminate panels: distribution independent of EI), K = ${K}`,
      "engineer",
    ),
  );
  if (cmu)
    assumptions.push(
      fromDefault(
        "Out-of-plane shear area",
        `A_nv = b d = ${fmt(Anv, 1)} in²/ft (conservative; fully grouted A_n = ${fmt(A, 0)} in²/ft)`,
        "Tedds convention",
      ),
      fromDefault(
        "Compression reinforcement",
        "Bars not laterally tied: neglected in compression (A_st = 0 in P_a)",
        "TMS 402 §8.3.4.2.1",
      ),
    );
  if (w.seismic.include && hp > 0)
    flags.push("Parapet seismic: ASCE 7 §13.3 (a_p = 2.5) is not applied — the wall coefficient is used; confirm");
  if (soil)
    assumptions.push(
      fromDefault(
        "Lateral earth pressure",
        `Equivalent fluid ${fmt(soil.efp, 0)} pcf to ${fmt(soil.height, 2)} ft${soil.surcharge ? ` + ${fmt(soil.surcharge, 0)} psf` : ""}; H factor ${cmu ? "1.0 (ASCE 7 §2.4.1)" : "1.6 (ASCE 7 §2.3.1)"}`,
        "geotechnical report or IBC Table 1610.1",
        true,
      ),
    );
  if (!cmu && w.vertical.layout === "center")
    flags.push("Concrete wall reinforced at the centre line: confirm cover from both faces (ACI 318 20.5.1.3)");

  // ---------------- reactions (per foot at the base)
  const base = addLoads(top, loadVector({ D: self.w * Htot }));
  const asdForReact = relevantCombinations(
    asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const net = asdForReact.map((c) => ({ c, v: LOAD_TYPES.reduce((s, tp) => s + (c.factors[tp] ?? 0) * base[tp], 0) }));
  const maxR = net.reduce((a, x) => (x.v > a.v ? x : a));
  const minR = net.reduce((a, x) => (x.v < a.v ? x : a));
  const callout =
    `${fmt(t, 3).replace(/0+$/, "").replace(/\.$/, "")} in. ${cmu ? "CMU, fully grouted" : `concrete (f'c ${fmt(fc, 0)} psi)`}, ` +
    `${w.vertical.size} @ ${fmt(w.vertical.spacing, 0)} in. vert.${layers === 2 ? " each face" : ""}, ` +
    `${w.horizontal.count > 1 ? `(${w.horizontal.count}) ` : ""}${w.horizontal.size} @ ${fmt(w.horizontal.spacing, 0)} in. horiz.`;

  const balance = cmu ? asdBalance(b, t, dPos, AvVert, mat.n!, mat.Fb!, mat.Fs!) : undefined;
  return {
    id: w.id,
    mark: w.mark,
    kind: "masonryWall",
    title: cmu ? "CMU wall" : "Concrete wall",
    callout,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Base",
        x: 0,
        byType: base,
        perFoot: base,
        maxDown: maxR.v,
        maxDownCombo: maxR.c.label,
        minNet: minR.v,
        minNetCombo: minR.c.label,
      },
    ],
    loadLines: lines,
    assumptions,
    flags,
    input: w,
    section: { b, A, I, S, r, Anv, dPos, dNeg },
    bars: { Av: AvVert, As, Ah },
    self,
    mat,
    lateral: { W: w.wind.W, Wp: w.wind.Wp, Fp, Ewall, E, H: Hlat },
    top,
    combos: comboRatios,
    K,
    slender: concreteSlender,
    flex: gov,
    axial: axialGov!,
    shear: sg,
    balance,
    diagram,
    inPlaneRes,
  };
}
