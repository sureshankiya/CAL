/**
 * ACI 318-19 helpers for footings: reinforcing bars, flexure of rectangular
 * sections (22.2, φ from net tensile strain 21.2.2), one-way shear without
 * shear reinforcement (22.5.5.1, Table 22.5.5.1(c) with size effect λ_s),
 * two-way shear (22.6.5.2), and structural plain concrete (Ch. 14).
 */

export const BARS: Record<string, { d: number; A: number }> = {
  "#3": { d: 0.375, A: 0.11 },
  "#4": { d: 0.5, A: 0.2 },
  "#5": { d: 0.625, A: 0.31 },
  "#6": { d: 0.75, A: 0.44 },
  "#7": { d: 0.875, A: 0.6 },
  "#8": { d: 1.0, A: 0.79 },
};

export const bar = (size: string) => {
  const b = BARS[size];
  if (!b) throw new Error(`Unknown bar ${size}`);
  return b;
};

/** β1 (Table 22.2.2.4.3). */
export function beta1(fc: number): number {
  if (fc <= 4000) return 0.85;
  if (fc >= 8000) return 0.65;
  return 0.85 - (0.05 * (fc - 4000)) / 1000;
}

export interface FlexureResult {
  As: number;
  d: number;
  a: number;
  c: number;
  epsT: number;
  phi: number;
  Mn: number;
  phiMn: number;
}

/** Rectangular section, tension steel only; b, d in in.; returns lb-in. */
export function flexure(As: number, b: number, d: number, fc: number, fy: number): FlexureResult {
  const a = (As * fy) / (0.85 * fc * b);
  const c = a / beta1(fc);
  const epsT = c > 0 ? (0.003 * (d - c)) / c : Infinity;
  const phi = Math.min(0.9, Math.max(0.65, 0.65 + ((epsT - 0.002) * 250) / 3));
  const Mn = As * fy * (d - a / 2);
  return { As, d, a, c, epsT, phi, Mn, phiMn: phi * Mn };
}

/** Size-effect factor λ_s = √(2 / (1 + d / 10)) ≤ 1.0 (Eq. 22.5.5.1.3). */
export const lambdaS = (d: number) => Math.min(1, Math.sqrt(2 / (1 + d / 10)));

/** One-way shear, A_v < A_v,min: V_c = 8 λ_s λ ρ_w^(1/3) √f'c b d ≤ 5 λ √f'c b d (Table 22.5.5.1(c), 22.5.5.1.1), lb. */
export function oneWayShear(b: number, d: number, As: number, fc: number, lambda = 1) {
  const rho = As / (b * d);
  const ls = lambdaS(d);
  const Vc = Math.min(8 * ls * lambda * Math.cbrt(rho) * Math.sqrt(fc) * b * d, 5 * lambda * Math.sqrt(fc) * b * d);
  return { rho, ls, Vc, phiVc: 0.75 * Vc };
}

/** Two-way shear stress capacity v_c, psi (Table 22.6.5.2), without shear reinforcement. */
export function twoWayShearStress(fc: number, d: number, bo: number, beta: number, alphaS = 40, lambda = 1) {
  const ls = lambdaS(d);
  const r = Math.sqrt(fc) * lambda * ls;
  const a = 4 * r;
  const b = (2 + 4 / beta) * r;
  const c = (2 + (alphaS * d) / bo) * r;
  return { ls, vc: Math.min(a, b, c), a, b, c };
}

/** Plain concrete (Ch. 14): flexure φM_n = 0.60 × 5 λ √f'c S_m (Eq. 14.5.2.1a), lb-in. */
export const plainFlexure = (fc: number, Sm: number, lambda = 1) => 0.6 * 5 * lambda * Math.sqrt(fc) * Sm;

/** Plain concrete one-way shear φV_n = 0.60 × (4/3) λ √f'c b h (Eq. 14.5.5.1a), lb. */
export const plainOneWayShear = (fc: number, b: number, h: number, lambda = 1) => 0.6 * (4 / 3) * lambda * Math.sqrt(fc) * b * h;

/** Plain concrete two-way shear φV_n = 0.60 × [4/3 + 8/(3β)] λ √f'c b_o h ≤ 0.60 × 2.66 λ √f'c b_o h (Eq. 14.5.5.1b), lb. */
export const plainTwoWayShear = (fc: number, bo: number, h: number, beta: number, lambda = 1) =>
  0.6 * Math.min(4 / 3 + 8 / (3 * beta), 2.66) * lambda * Math.sqrt(fc) * bo * h;
