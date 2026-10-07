/**
 * NDS wood compression members (ASD): studs, stud packs, king studs and posts.
 *
 *  - Compression parallel to grain — NDS 3.6, column stability C_P Eq. 3.7-1,
 *    c = 0.8 sawn, 0.9 glulam / SCL; F_cE = 0.822 E_min' / (l_e / d)² per axis
 *  - Built-up columns — NDS 15.3.2: C_P × K_f (0.6 nailed, 0.75 bolted) for buckling
 *    perpendicular to the wide faces of the laminations
 *  - Slenderness l_e / d ≤ 50 (NDS 3.7.1.4)
 *  - Combined bending and axial compression — NDS Eq. 3.9-3 (bending about the strong axis)
 *  - Net tension with bending — NDS 3.8, Eq. 3.9-1 / 3.9-2
 * Every ASD combination of ASCE 7 §2.4 is evaluated with its own C_D (NDS Table 2.3.2).
 */

import { loadDurationFactor, type Combination } from "../core/combos";
import { LOAD_TYPES, type LoadType, type LoadVector } from "../core/loads";
import {
  beamStabilityFactor,
  columnStabilityFactor,
  effectiveLength,
  nds441Rule,
  volumeFactor,
  type ResolvedWood,
} from "./wood";

export interface ColumnConditions {
  wetService: boolean;
  incised: boolean;
  /** repetitive-member factor for bending (studs ≤ 24 in. o.c., NDS 4.3.9) */
  repetitive: boolean;
}

export interface ColumnInput {
  mat: ResolvedWood;
  cond: ColumnConditions;
  /** column length for bending (simple span between supports), in */
  length: number;
  /** effective length for buckling about the strong axis (dimension d), in */
  le1: number;
  /** effective length for buckling about the weak axis (dimension b), in; 0 = continuously braced */
  le2: number;
  /** built-up column of plies (NDS 15.3) */
  builtUp?: "nailed" | "bolted";
  /** axial load by type, lb (compression +) */
  P: LoadVector;
  /** uniform lateral load by type causing bending about the strong axis, lb/ft */
  w?: LoadVector;
  /** eccentricity of the axial load about the strong axis, in */
  e?: number;
  /** unbraced length of the compression edge for C_L, in (0 = braced); default braced */
  lu?: number;
  combos: Combination[];
  present: Partial<Record<LoadType, boolean>>;
}

export interface ColumnRow {
  combo: Combination;
  CD: number;
  P: number;
  M: number;
  fc: number;
  ft: number;
  fb: number;
  FcStar: number;
  FcE1: number;
  FcE2: number;
  CP: number;
  FcPrime: number;
  FtPrime: number;
  FbPrime: number;
  axial: number;
  interaction: number;
  /** governing ratio of the row */
  ratio: number;
}

export interface ColumnResult {
  rows: ColumnRow[];
  governing: ColumnRow;
  /** worst axial-only row */
  axialGov: ColumnRow;
  c: number;
  Kf: number;
  le1d1: number;
  le2d2: number;
  EminPrime1: number;
  EminPrime2: number;
  Eprime: number;
  CM: { Fc: number; Fb: number; Ft: number; E: number; Fcperp: number };
  Ci: number;
  CiE: number;
  Ct: number;
  Cr: number;
  CL: number;
  CV?: number;
  CF: { Fb: number; Fc: number; Ft: number };
  clText: string;
}

const sum = (v: LoadVector, c: Combination) => LOAD_TYPES.reduce((s, t) => s + (c.factors[t] ?? 0) * v[t], 0);

export function designColumn(i: ColumnInput): ColumnResult {
  const m = i.mat;
  const wet = i.cond.wetService;
  const CM = wet
    ? {
        Fc: m.Fc * m.CFc <= 750 ? 1 : m.CM.Fc,
        Fb: m.Fb * m.CF <= 1150 ? 1 : m.CM.Fb,
        Ft: m.CM.Ft,
        E: m.CM.E,
        Fcperp: m.CM.Fcperp,
      }
    : { Fc: 1, Fb: 1, Ft: 1, E: 1, Fcperp: 1 };
  const incised = i.cond.incised && m.kind === "sawn";
  const Ci = incised ? 0.8 : 1;
  const CiE = incised ? 0.95 : 1;
  const Ct = 1;
  const Cr = i.cond.repetitive && m.kind === "sawn" && m.sizeClass.startsWith("Dimension") ? 1.15 : 1;
  const c = m.kind === "sawn" ? 0.8 : 0.9;
  const Kf = i.builtUp === "bolted" ? 0.75 : i.builtUp === "nailed" ? 0.6 : 1;
  const Eprime = m.E * CM.E * Ct * CiE;
  const EminPrime1 = m.Emin * CM.E * Ct * CiE;
  const EminPrime2 = m.EminStab * CM.E * Ct * CiE;
  const le1d1 = i.le1 / m.d;
  const le2d2 = i.le2 > 0 ? i.le2 / m.b : 0;
  const FcE1 = le1d1 > 0 ? (0.822 * EminPrime1) / (le1d1 * le1d1) : Infinity;
  const FcE2 = le2d2 > 0 ? (0.822 * EminPrime2) / (le2d2 * le2d2) : Infinity;

  // beam stability for bending about the strong axis
  let FbE = Infinity;
  let clText = "Compression edge braced — C_L = 1.00";
  if (i.lu && i.lu > 0) {
    const rule = m.kind === "sawn" && m.nominalRatio !== undefined ? nds441Rule(m.nominalRatio) : undefined;
    if (rule?.ok && m.nominalRatio! <= 4) {
      clText = `C_L = 1.00 by NDS 4.4.1.2 — ${rule.text}`;
    } else {
      const le = effectiveLength(i.lu, m.d);
      const RB = Math.sqrt((le * m.d) / (m.b * m.b));
      FbE = (1.2 * EminPrime2) / (RB * RB);
      clText = `C_L from NDS 3.3.3, l_e = ${le.toFixed(1)} in. (Table 3.3.3), R_B = ${RB.toFixed(2)}, F_bE = ${FbE.toFixed(0)} psi`;
    }
  }
  let CLmin = 1;
  const CV = m.kind === "glulam" ? volumeFactor(i.length / 12, m.d, m.b, m.volumeX ?? 10) : undefined;

  const rows: ColumnRow[] = i.combos.map((combo) => {
    const CD = loadDurationFactor(combo, i.present);
    const P = sum(i.P, combo);
    const wl = i.w ? sum(i.w, combo) : 0;
    const Mw = (Math.abs(wl) * (i.length / 12) ** 2) / 8;
    const Me = i.e ? (Math.abs(Math.max(P, 0)) * i.e) / 12 : 0;
    const M = Mw + Me;
    const fc = Math.max(P, 0) / m.A;
    const ft = Math.max(-P, 0) / m.A;
    const fb = (M * 12) / m.S;
    const FcStar = m.Fc * CD * CM.Fc * Ct * m.CFc * Ci;
    const CP1 = columnStabilityFactor(FcE1, FcStar, c);
    const CP2 = columnStabilityFactor(FcE2, FcStar, c) * Kf;
    const CP = Math.min(CP1, CP2);
    const FcPrime = FcStar * CP;
    const FtPrime = m.Ft * CD * CM.Ft * Ct * m.CFt * Ci;
    const FbBase = m.Fb * CD * CM.Fb * Ct * m.CF * Ci * Cr;
    const CL = Number.isFinite(FbE) ? beamStabilityFactor(FbE, FbBase) : 1;
    CLmin = Math.min(CLmin, CL);
    const FbPrime = FbBase * Math.min(CL, CV ?? 1);
    const axial = fc > 0 ? fc / FcPrime : ft > 0 ? ft / FtPrime : 0;
    let interaction = 0;
    if (fc > 0) {
      const amp = 1 - fc / FcE1;
      interaction = fb > 0 ? (amp > 0 ? (fc / FcPrime) ** 2 + fb / (FbPrime * amp) : Infinity) : (fc / FcPrime) ** 2;
    } else if (ft > 0) {
      interaction = Math.max(ft / FtPrime + fb / FbBase, (fb - ft) / FbPrime);
    } else interaction = fb / FbPrime;
    return {
      combo,
      CD,
      P,
      M,
      fc,
      ft,
      fb,
      FcStar,
      FcE1,
      FcE2,
      CP,
      FcPrime,
      FtPrime,
      FbPrime,
      axial,
      interaction,
      ratio: Math.max(axial, interaction),
    };
  });
  const governing = rows.reduce((a, b) => (b.ratio > a.ratio ? b : a), rows[0]);
  const axialGov = rows.reduce((a, b) => (b.axial > a.axial ? b : a), rows[0]);
  return {
    rows,
    governing,
    axialGov,
    c,
    Kf,
    le1d1,
    le2d2,
    EminPrime1,
    EminPrime2,
    Eprime,
    CM,
    Ci,
    CiE,
    Ct,
    Cr,
    CL: CLmin,
    CV,
    CF: { Fb: m.CF, Fc: m.CFc, Ft: m.CFt },
    clText,
  };
}
