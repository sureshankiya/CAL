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
  // Table 21.2.2: φ = 0.65 + 0.25 (ε_t − ε_ty) / 0.003, ε_ty = f_y / E_s (0.00207 for Grade 60)
  const epsTy = fy / 29_000_000;
  const phi = Math.min(0.9, Math.max(0.65, 0.65 + (0.25 * (epsT - epsTy)) / 0.003));
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
export const plainOneWayShear = (fc: number, b: number, h: number, lambda = 1) =>
  0.6 * (4 / 3) * lambda * Math.sqrt(fc) * b * h;

/** Plain concrete two-way shear φV_n = 0.60 × [4/3 + 8/(3β)] λ √f'c b_o h ≤ 0.60 × 2.66 λ √f'c b_o h (Eq. 14.5.5.1b), lb. */
export const plainTwoWayShear = (fc: number, bo: number, h: number, beta: number, lambda = 1) =>
  0.6 * Math.min(4 / 3 + 8 / (3 * beta), 2.66) * lambda * Math.sqrt(fc) * bo * h;

export interface StrengthBar {
  /** depth from the compression face, in */
  d: number;
  A: number;
}

/**
 * Nominal axial / moment strength of a rectangular section b × t for a neutral axis
 * depth c (22.2: ε_cu = 0.003, Whitney block 0.85 f'c over a = β1 c, steel elastic-plastic
 * E_s = 29,000 ksi; displaced concrete deducted for bars inside the block). Moment about
 * mid-depth, φ from the net tensile strain of the extreme tension bar (Table 21.2.2).
 */
export function sectionStrength(c: number, b: number, t: number, bars: StrengthBar[], fc: number, fy: number) {
  const b1 = beta1(fc);
  const a = Math.min(b1 * c, t);
  const Cc = 0.85 * fc * a * b;
  let Pn = Cc;
  let Mn = Cc * (t / 2 - a / 2);
  for (const s of bars) {
    const eps = (0.003 * (s.d - c)) / c; // tension positive
    let fs = Math.max(-fy, Math.min(fy, 29_000_000 * eps));
    if (s.d < a && fs < 0) fs += 0.85 * fc; // displaced concrete
    Pn -= s.A * fs;
    Mn += s.A * fs * (s.d - t / 2);
  }
  const dt = Math.max(...bars.map((x) => x.d));
  const epsT = (0.003 * (dt - c)) / c;
  const epsTy = fy / 29_000_000;
  const phi = Math.min(0.9, Math.max(0.65, 0.65 + (0.25 * (epsT - epsTy)) / 0.003));
  return { a, Pn, Mn, epsT, phi };
}

/**
 * Design moment strength φM_n at a factored axial load P_u (lb, compression positive),
 * found by bisection on the neutral axis so that φP_n = P_u; capped by
 * φP_n,max = 0.80 φ [0.85 f'c (A_g − A_st) + f_y A_st] with φ = 0.65 (22.4.2.1).
 */
export function momentAtAxial(Pu: number, b: number, t: number, bars: StrengthBar[], fc: number, fy: number) {
  const Ast = bars.reduce((s, x) => s + x.A, 0);
  const PnMax = 0.8 * (0.85 * fc * (b * t - Ast) + fy * Ast);
  const phiPnMax = 0.65 * PnMax;
  if (Pu > phiPnMax) return { ok: false as const, phiPnMax, c: NaN, phiMn: 0, phi: 0.65, epsT: 0, a: 0 };
  const f = (c: number) => {
    const s = sectionStrength(c, b, t, bars, fc, fy);
    return s.phi * s.Pn;
  };
  let lo = 1e-4;
  let hi = 10 * t;
  if (f(lo) > Pu) return { ok: false as const, phiPnMax, c: NaN, phiMn: 0, phi: 0.9, epsT: 0, a: 0 };
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > Pu) hi = mid;
    else lo = mid;
  }
  const c = (lo + hi) / 2;
  const s = sectionStrength(c, b, t, bars, fc, fy);
  return { ok: true as const, phiPnMax, c, phiMn: s.phi * s.Mn, phi: s.phi, epsT: s.epsT, a: s.a };
}
