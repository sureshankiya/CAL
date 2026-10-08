/**
 * Out-of-plane wall panel analysis (per foot of wall): a vertical strip from
 * the base (x = 0) to the top support (x = h) with an optional parapet above it
 * (x = h … h + h_p). Timoshenko beam elements (bending and shear deformation):
 *
 *   k_e = EI / ((1 + Φ) L³) · [12, 6L, −12, 6L; 6L, (4 + Φ)L², −6L, (2 − Φ)L²; …],  Φ = 12 EI / (GA_v L²)
 *
 * which is exact for nodal loads; distributed loads are applied as consistent
 * nodal loads on a fine mesh. Supports: base fixed or pinned; top pinned, fixed
 * or free (cantilever). Units: x in ft, q in plf (per ft of wall), M in lb-in.
 * Sign convention: q > 0 acts toward the interior face; M > 0 puts the exterior
 * face in tension; V is the shear on the section from the part above it.
 */

export type PanelBase = "fixed" | "pinned";
export type PanelTop = "pinned" | "fixed" | "free";

export interface PanelGeometry {
  /** base to top support (or to the top of a cantilever), ft */
  h: number;
  /** parapet above the top support, ft */
  parapet?: number;
  base: PanelBase;
  top: PanelTop;
  /** flexural stiffness per ft of wall, lb-in² */
  EI: number;
  /** shear stiffness per ft of wall, lb (omit for Euler-Bernoulli) */
  GAv?: number;
}

/** Linearly varying load between x1 and x2 (ft), q1 / q2 plf. */
export interface PanelLoad {
  x1: number;
  x2: number;
  q1: number;
  q2: number;
}

export interface PanelResult {
  x: number[];
  /** shear, lb per ft */
  V: number[];
  /** moment, lb-in per ft */
  M: number[];
  /** lateral reactions, lb per ft (positive opposing positive q) */
  Rbase: number;
  Rtop: number;
  /** base / top fixing moments, lb-in per ft */
  Mbase: number;
  Mtop: number;
}

const NE = 60;

export function analysePanel(g: PanelGeometry, loads: PanelLoad[], topMoment = 0): PanelResult {
  if (!(g.h > 0)) throw new Error("Panel height must be positive");
  const hp = g.top === "free" ? 0 : Math.max(0, g.parapet ?? 0);
  const H = g.h + hp;
  // mesh with a node at the top support
  const nMain = hp > 0 ? Math.max(8, Math.round((NE * g.h) / H)) : NE;
  const nPar = hp > 0 ? Math.max(4, NE - nMain) : 0;
  const xs: number[] = [];
  for (let i = 0; i <= nMain; i++) xs.push((g.h * i) / nMain);
  for (let i = 1; i <= nPar; i++) xs.push(g.h + (hp * i) / nPar);
  const n = xs.length;
  const dof = 2 * n;
  const K = Array.from({ length: dof }, () => new Float64Array(dof));
  const F = new Float64Array(dof);
  const EI = g.EI;
  const q = (x: number) => {
    let s = 0;
    for (const l of loads) {
      if (x < l.x1 - 1e-9 || x > l.x2 + 1e-9 || l.x2 <= l.x1) continue;
      s += l.q1 + ((l.q2 - l.q1) * (x - l.x1)) / (l.x2 - l.x1);
    }
    return s;
  };
  // loads q in plf → lb/in per ft of wall: q / 12; lengths in inches
  const feq: number[][] = [];
  for (let e = 0; e < n - 1; e++) {
    const L = (xs[e + 1] - xs[e]) * 12;
    const Phi = g.GAv ? (12 * EI) / (g.GAv * L * L) : 0;
    const c = EI / ((1 + Phi) * L ** 3);
    const ke = [
      [12, 6 * L, -12, 6 * L],
      [6 * L, (4 + Phi) * L * L, -6 * L, (2 - Phi) * L * L],
      [-12, -6 * L, 12, -6 * L],
      [6 * L, (2 - Phi) * L * L, -6 * L, (4 + Phi) * L * L],
    ];
    const idx = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[idx[i]][idx[j]] += c * ke[i][j];
    // midpoint sampling keeps load discontinuities inside an element exact in total
    const xm = (xs[e] + xs[e + 1]) / 2;
    const qa = (q(xs[e] + 1e-9) + q(xm)) / 2;
    const qb = (q(xs[e + 1] - 1e-9) + q(xm)) / 2;
    const q1 = qa / 12;
    const q2 = qb / 12;
    const f = [
      (L * (7 * q1 + 3 * q2)) / 20,
      (L * L * (3 * q1 + 2 * q2)) / 60,
      (L * (3 * q1 + 7 * q2)) / 20,
      (-L * L * (2 * q1 + 3 * q2)) / 60,
    ];
    feq.push(f);
    for (let i = 0; i < 4; i++) F[idx[i]] += f[i];
  }
  const iTop = nMain;
  // rotation dof sign: θ = dv/dx; a top moment couple is applied at the top support node
  F[2 * iTop + 1] += topMoment;
  const fixed = new Set<number>([0]);
  if (g.base === "fixed") fixed.add(1);
  if (g.top !== "free") fixed.add(2 * iTop);
  if (g.top === "fixed") fixed.add(2 * iTop + 1);
  const free = [...Array(dof).keys()].filter((i) => !fixed.has(i));
  const m = free.length;
  const A = free.map((i) => free.map((j) => K[i][j]));
  const b = free.map((i) => F[i]);
  // Gaussian elimination (symmetric positive definite, small)
  for (let k = 0; k < m; k++) {
    const p = A[k][k];
    for (let i = k + 1; i < m; i++) {
      const f = A[i][k] / p;
      if (f === 0) continue;
      for (let j = k; j < m; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const u = new Float64Array(dof);
  const sol = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < m; j++) s -= A[i][j] * sol[j];
    sol[i] = s / A[i][i];
  }
  free.forEach((d, k) => (u[d] = sol[k]));
  // reactions R = K u − F at the constrained dofs (force on the panel from the support)
  const react = (d: number) => {
    let s = 0;
    for (let j = 0; j < dof; j++) s += K[d][j] * u[j];
    return s - F[d];
  };
  // element end forces → internal V, M at nodes (beam convention, x upward)
  const V = new Array(n).fill(0);
  const M = new Array(n).fill(0);
  for (let e = 0; e < n - 1; e++) {
    const L = (xs[e + 1] - xs[e]) * 12;
    const Phi = g.GAv ? (12 * EI) / (g.GAv * L * L) : 0;
    const c = EI / ((1 + Phi) * L ** 3);
    const ue = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
    const ke = [
      [12, 6 * L, -12, 6 * L],
      [6 * L, (4 + Phi) * L * L, -6 * L, (2 - Phi) * L * L],
      [-12, -6 * L, 12, -6 * L],
      [6 * L, (2 - Phi) * L * L, -6 * L, (4 + Phi) * L * L],
    ];
    const fe = ke.map((row, i) => c * row.reduce((s, kij, j) => s + kij * ue[j], 0) - feq[e][i]);
    if (e === 0) {
      V[0] = -fe[0];
      M[0] = fe[1];
    }
    V[e + 1] = fe[2];
    M[e + 1] = -fe[3];
  }
  // V = shear from the part above (positive along +q), M > 0 exterior face in tension
  return {
    x: xs,
    V: V.map((v) => -v + 0),
    M: M.map((v) => -v + 0),
    Rbase: -react(0),
    Rtop: g.top === "free" ? 0 : -react(2 * iTop),
    Mbase: g.base === "fixed" ? react(1) : 0,
    Mtop: g.top === "fixed" ? react(2 * iTop + 1) : 0,
  };
}
