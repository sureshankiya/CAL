/**
 * Reinforced masonry, allowable stress design (TMS 402 Ch. 8, §8.3):
 *
 *  - Material: E_m = 900 f'm (concrete masonry, §4.2.2.2), E_v = 0.4 E_m,
 *    E_s = 29,000,000 psi
 *  - Allowable steel tension F_s = 32,000 psi for Grade 60 (20,000 psi Grade 40 / 50)
 *    (§8.3.3.1)
 *  - Allowable flexural compression F_b = 0.45 f'm (§8.3.4.2.2) — the factor is an input so
 *    older-edition calcs (MSJC 1/3 f'm) can be reproduced
 *  - Axial: P_a = (0.25 f'm A_n + 0.65 A_st F_s)[1 − (h / 140 r)²] for h / r ≤ 99, else
 *    (70 r / h)² (Eqs. 8-21, 8-22); bars not laterally tied → A_st = 0
 *  - Flexure with axial load: cracked transformed section, linear stress, masonry in tension
 *    and steel in compression neglected; capacity M_c at the applied P is the moment at which
 *    the masonry reaches F_b or the extreme tension steel reaches F_s
 *  - Shear: F_v = (F_vm + F_vs) γ_g; F_vm = ½[(4.0 − 1.75 M / (V d)) √f'm] + 0.25 P / A_n;
 *    F_vs = 0.5 (A_v F_s d) / (A_n s); F_v ≤ 3 √f'm γ_g for M / (V d) ≤ 0.25, ≤ 2 √f'm γ_g for
 *    M / (V d) ≥ 1.0, linear between (§8.3.5.1); M / (V d) taken positive and ≤ 1.0
 */

export const E_S = 29_000_000;

export function masonryModuli(fm: number) {
  const Em = 900 * fm;
  return { Em, Ev: 0.4 * Em, n: E_S / Em };
}

export const allowableFs = (fy: number) => (fy >= 60000 ? 32000 : 20000);

/** Fully grouted hollow concrete masonry wall self weight per Tedds / TMS block geometry. */
export interface BlockGeometry {
  /** specified thickness, in */
  t: number;
  /** unit height / length, in */
  hb: number;
  lb: number;
  /** face shell, internal web, end web thickness, in */
  tf: number;
  tw: number;
  te: number;
  nWeb: number;
  nEnd: number;
  gammaBlock: number;
  gammaGrout: number;
}

export function cmuSelfWeight(b: BlockGeometry, sv: number) {
  const cell = (b.lb - b.nWeb * b.tw - b.nEnd * b.te) * (b.t - 2 * b.tf); // in² per unit length lb
  const Ablock = ((b.t * b.lb - cell) / b.lb) * 12; // in² per ft
  const Agrout = (cell / b.lb) * 12;
  const wWall = (Ablock / 144) * b.gammaBlock + (Agrout / 144) * b.gammaGrout; // psf
  const wBond = ((2 * b.tf) / 12) * b.gammaBlock + ((b.t - 2 * b.tf) / 12) * b.gammaGrout;
  const s = Math.max(sv, b.hb);
  const w = ((s - b.hb) * wWall + b.hb * wBond) / s;
  return { Ablock, Agrout, wWall, wBond, w };
}

export function axialAllowable(fm: number, An: number, hEff: number, r: number, Ast = 0, Fs = 32000) {
  const sr = hEff / r;
  const red = sr <= 99 ? 1 - (sr / 140) ** 2 : (70 / sr) ** 2;
  return { sr, red, Pa: (0.25 * fm * An + 0.65 * Ast * Fs) * red, Fa: 0.25 * fm * red, eq: sr <= 99 ? "8-21" : "8-22" };
}

export interface SectionBar {
  /** depth from the compression face, in */
  d: number;
  A: number;
}

export interface AsdSectionResult {
  Mc: number;
  /** neutral axis depth, in (Infinity when the section is uncracked) */
  c: number;
  governs: "masonry" | "steel" | "uncracked" | "none";
  fm: number;
  fsMax: number;
}

/** Axial force and moment about mid-depth for a neutral axis c and extreme fibre stress fm. */
function asdForces(c: number, fm: number, b: number, t: number, bars: SectionBar[], n: number) {
  let T = 0;
  let MT = 0;
  for (const s of bars) {
    if (s.d <= c) continue;
    const fs = (n * fm * (s.d - c)) / c;
    T += s.A * fs;
    MT += s.A * fs * (s.d - t / 2);
  }
  const C = 0.5 * fm * b * Math.min(c, t);
  const P = C - T;
  const M = C * (t / 2 - c / 3) + MT;
  return { P, M, C, T };
}

/**
 * Allowable moment M_c (lb-in) of a cracked rectangular section b × t with bars at depths d_i
 * under axial compression P (lb, compression positive).
 */
export function asdMomentCapacity(
  P: number,
  b: number,
  t: number,
  bars: SectionBar[],
  n: number,
  Fb: number,
  Fs: number,
): AsdSectionResult {
  const dMax = Math.max(...bars.map((x) => x.d));
  const solve = (fn: (c: number) => number, lo: number, hi: number) => {
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (fn(mid) > P) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const fsAt = (c: number, fm: number) => (c >= dMax ? 0 : (n * fm * (dMax - c)) / c);
  // masonry at F_b
  const PmasT = asdForces(t, Fb, b, t, bars, n).P;
  if (P > PmasT) {
    // whole section in compression: P / A + M / S ≤ F_b (bars neglected)
    const A = b * t;
    const S = (b * t * t) / 6;
    const Mc = Math.max(0, (Fb - P / A) * S);
    return { Mc, c: Infinity, governs: Mc > 0 ? "uncracked" : "none", fm: Fb, fsMax: 0 };
  }
  const cA = solve((c) => asdForces(c, Fb, b, t, bars, n).P, 1e-6, t);
  if (fsAt(cA, Fb) <= Fs * (1 + 1e-9)) {
    const f = asdForces(cA, Fb, b, t, bars, n);
    return { Mc: f.M, c: cA, governs: "masonry", fm: Fb, fsMax: fsAt(cA, Fb) };
  }
  // extreme steel at F_s: fm = F_s c / (n (d_max − c))
  const fmOf = (c: number) => (Fs * c) / (n * (dMax - c));
  const Pmin = asdForces(1e-6, fmOf(1e-6), b, t, bars, n).P;
  if (P < Pmin) return { Mc: 0, c: 0, governs: "none", fm: 0, fsMax: Fs };
  const cB = solve((c) => asdForces(c, fmOf(c), b, t, bars, n).P, 1e-6, dMax * (1 - 1e-9));
  const f = asdForces(cB, fmOf(cB), b, t, bars, n);
  return { Mc: f.M, c: cB, governs: "steel", fm: fmOf(cB), fsMax: Fs };
}

/** Balance point of a single layer at depth d (Tedds presentation). */
export function asdBalance(b: number, t: number, d: number, As: number, n: number, Fb: number, Fs: number) {
  const k = n / (Fs / Fb + n);
  const T = As * Fs;
  const C = (k * d * Fb * b) / 2;
  return { k, T, C, P: C - T, M: T * (d - t / 2) + C * (t / 2 - (k * d) / 3), epsS: Fs / E_S };
}

export function masonryShear(o: {
  fm: number;
  An: number;
  /** M / (V d), positive */
  MVd: number;
  P: number;
  gammaG?: number;
  /** shear reinforcement: area per spacing, spacing (in), d (in), F_s */
  Av?: number;
  s?: number;
  d?: number;
  Fs?: number;
}) {
  const g = o.gammaG ?? 1;
  const r = Math.min(1, Math.max(0, o.MVd));
  const sq = Math.sqrt(o.fm);
  const Fvm = 0.5 * (4 - 1.75 * r) * sq + (0.25 * Math.max(0, o.P)) / o.An;
  const Fvs = o.Av && o.s && o.d && o.Fs ? (0.5 * o.Av * o.Fs * o.d) / (o.An * o.s) : 0;
  const k = r <= 0.25 ? 3 : r >= 1 ? 2 : 3 - ((r - 0.25) / 0.75) * 1;
  const FvMax = k * sq * g;
  return { r, Fvm, Fvs, FvMax, kMax: k, Fv: Math.min((Fvm + Fvs) * g, FvMax) };
}
