/**
 * Seismic base shear and vertical distribution — ASCE 7 Equivalent Lateral
 * Force procedure (§12.8), for light-frame wood buildings.
 *  - Ta = Ct hn^x, Ct = 0.02, x = 0.75 (Table 12.8-2, all other structural systems)
 *  - Cs = SDS / (R / Ie) (Eq. 12.8-2), ≤ SD1 / (T (R / Ie)) for T ≤ TL (Eq. 12.8-3),
 *    ≥ 0.044 SDS Ie ≥ 0.01 (Eq. 12.8-5), ≥ 0.5 S1 / (R / Ie) where S1 ≥ 0.6g (Eq. 12.8-6)
 *  - Fx = Cvx V, Cvx = wx hx^k / Σ wi hi^k (Eq. 12.8-11, 12.8-12)
 * The period is taken as Ta (T = Ta, no Cu Ta from analysis).
 */

export interface SeismicSystem {
  id: "wsp" | "other";
  label: string;
  R: number;
  Omega0: number;
  Cd: number;
  ref: string;
}

export const SEISMIC_SYSTEMS: SeismicSystem[] = [
  {
    id: "wsp",
    label:
      "Bearing wall system — light-frame (wood) walls sheathed with wood structural panels rated for shear resistance",
    R: 6.5,
    Omega0: 3,
    Cd: 4,
    ref: "ASCE 7 Table 12.2-1, A.15",
  },
  {
    id: "other",
    label: "Bearing wall system — light-frame walls with shear panels of all other materials",
    R: 2,
    Omega0: 2.5,
    Cd: 2,
    ref: "ASCE 7 Table 12.2-1, A.17",
  },
];

export const seismicSystem = (id: string) => SEISMIC_SYSTEMS.find((s) => s.id === id) ?? SEISMIC_SYSTEMS[0];

export const IMPORTANCE_SEISMIC: Record<"I" | "II" | "III" | "IV", number> = { I: 1.0, II: 1.0, III: 1.25, IV: 1.5 };

/** ASCE 7 Table 12.12-1 allowable story drift factor (× hsx). */
export function driftLimitFactor(rc: "I" | "II" | "III" | "IV", lowRiseAccommodating: boolean): number {
  if (lowRiseAccommodating) return rc === "IV" ? 0.015 : rc === "III" ? 0.02 : 0.025;
  return rc === "IV" ? 0.01 : rc === "III" ? 0.015 : 0.02;
}

/** Table 12.8-1 coefficient for upper limit on calculated period. */
export function Cu(SD1: number): number {
  const pts: Array<[number, number]> = [
    [0.1, 1.7],
    [0.15, 1.6],
    [0.2, 1.5],
    [0.3, 1.4],
    [0.4, 1.4],
  ];
  if (SD1 <= 0.1) return 1.7;
  if (SD1 >= 0.4) return 1.4;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (SD1 <= x1) return y0 + ((y1 - y0) * (SD1 - x0)) / (x1 - x0);
  }
  return 1.4;
}

export interface BaseShearInput {
  SDS: number;
  SD1: number;
  S1?: number;
  R: number;
  Ie: number;
  /** structural height hn, ft */
  hn: number;
  /** long-period transition period, s */
  TL: number;
}

export interface BaseShearResult {
  Ta: number;
  T: number;
  CsEq2: number;
  CsMax?: number;
  CsMin: number;
  CsMinS1?: number;
  Cs: number;
  governs: "12.8-2" | "12.8-3" | "12.8-4" | "12.8-5" | "12.8-6";
}

export function seismicCoefficient(i: BaseShearInput): BaseShearResult {
  const Ta = 0.02 * Math.pow(i.hn, 0.75);
  const T = Ta;
  const RI = i.R / i.Ie;
  const CsEq2 = i.SDS / RI;
  const CsMax = T <= i.TL ? i.SD1 / (T * RI) : (i.SD1 * i.TL) / (T * T * RI);
  const CsMin = Math.max(0.044 * i.SDS * i.Ie, 0.01);
  const CsMinS1 = i.S1 !== undefined && i.S1 >= 0.6 ? (0.5 * i.S1) / RI : undefined;
  let Cs = CsEq2;
  let governs: BaseShearResult["governs"] = "12.8-2";
  if (CsMax < Cs) {
    Cs = CsMax;
    governs = T <= i.TL ? "12.8-3" : "12.8-4";
  }
  if (Cs < CsMin) {
    Cs = CsMin;
    governs = "12.8-5";
  }
  if (CsMinS1 !== undefined && Cs < CsMinS1) {
    Cs = CsMinS1;
    governs = "12.8-6";
  }
  return { Ta, T, CsEq2, CsMax, CsMin, CsMinS1, Cs, governs };
}

/** Distribution exponent k (§12.8.3). */
export function distributionExponent(T: number): number {
  if (T <= 0.5) return 1;
  if (T >= 2.5) return 2;
  return 1 + (T - 0.5) / 2;
}

export interface LevelWeight {
  id: string;
  /** seismic weight at the level, lb */
  w: number;
  /** height of the level above the base, ft */
  h: number;
}

export interface VerticalDistribution {
  k: number;
  rows: Array<{ id: string; w: number; h: number; whk: number; Cvx: number; Fx: number; Vx: number }>;
  W: number;
  V: number;
}

/** Fx at each level and story shear Vx (sum of Fx at and above), strength level. */
export function verticalDistribution(levels: LevelWeight[], Cs: number, T: number): VerticalDistribution {
  const k = distributionExponent(T);
  const W = levels.reduce((s, l) => s + l.w, 0);
  const V = Cs * W;
  const sum = levels.reduce((s, l) => s + l.w * Math.pow(l.h, k), 0);
  const sorted = [...levels].sort((a, b) => b.h - a.h);
  let acc = 0;
  const rows = sorted.map((l) => {
    const whk = l.w * Math.pow(l.h, k);
    const Cvx = sum > 0 ? whk / sum : 0;
    const Fx = Cvx * V;
    acc += Fx;
    return { id: l.id, w: l.w, h: l.h, whk, Cvx, Fx, Vx: acc };
  });
  return { k, rows, W, V };
}
