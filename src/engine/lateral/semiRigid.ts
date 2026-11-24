/**
 * Semi-rigid diaphragm distribution (ASCE 7 §12.3.1: diaphragm stiffness included in the
 * analysis): the diaphragm is a Timoshenko beam spanning across the wall lines of one
 * direction, each line an elastic support of stiffness k_i (the secant stiffness of its
 * shear walls, as for the rigid analysis).
 *
 *  - Bending: the chords at ±W/2, EI = E A W² / 2 (SDPWS Eq. 4.2-1 bending term)
 *  - Shear: GA = 1000 G_a W (G_a apparent shear stiffness, kips/in, SDPWS Table 4.2A;
 *    reproduces the 0.25 v L / (1000 G_a) term of Eq. 4.2-1 for a simple span)
 *  - Load: the story force spread uniformly along the span; inherent and accidental torsion
 *    (§12.8.4.2, ±0.05 of the span) as a linear load with the same resultant moment
 *  - Line force F_i = k_i Δ_i; the largest over the eccentricity cases is used
 *  - Chord splice slip (third term of Eq. 4.2-1) is not included
 */

export interface SemiRigidLine {
  id: string;
  /** position along the span, ft */
  pos: number;
  /** line stiffness, lb/in */
  k: number;
}

export interface SemiRigidResult {
  V: number;
  span: number;
  EI: number;
  GA: number;
  e: number;
  ea: number;
  lines: Array<{ id: string; total: number; direct: number; delta: number }>;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error("Semi-rigid diaphragm: unstable support (check wall lines)");
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Support forces for one load case: uniform V over the span plus a linear load giving moment M about mid-span. */
function analyse(lines: SemiRigidLine[], V: number, M: number, span: number, EI: number, GA: number) {
  const pts = new Set<number>([0, span, ...lines.map((l) => l.pos)]);
  const nMesh = 40;
  for (let i = 1; i < nMesh; i++) pts.add((span * i) / nMesh);
  const xs = [...pts].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);
  const n = xs.length;
  const K = Array.from({ length: 2 * n }, () => new Array<number>(2 * n).fill(0));
  const F = new Array<number>(2 * n).fill(0);
  const c = span / 2;
  const w0 = V / span;
  const w1 = (12 * M) / span ** 3;
  for (let e = 0; e < n - 1; e++) {
    const L = (xs[e + 1] - xs[e]) * 12;
    const phi = (12 * EI) / (GA * L * L);
    const f = EI / ((1 + phi) * L ** 3);
    const k = [
      [12, 6 * L, -12, 6 * L],
      [6 * L, (4 + phi) * L * L, -6 * L, (2 - phi) * L * L],
      [-12, -6 * L, 12, -6 * L],
      [6 * L, (2 - phi) * L * L, -6 * L, (4 + phi) * L * L],
    ];
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[dof[i]][dof[j]] += f * k[i][j];
    // lumped load at the element ends (lb), from the load at the element mid-point
    const xm = (xs[e] + xs[e + 1]) / 2;
    const P = (w0 + w1 * (xm - c)) * (xs[e + 1] - xs[e]);
    F[2 * e] += P / 2;
    F[2 * e + 2] += P / 2;
  }
  const at = lines.map((l) => xs.findIndex((x) => Math.abs(x - l.pos) < 1e-6));
  lines.forEach((l, i) => (K[2 * at[i]][2 * at[i]] += l.k));
  const u = solve(K, F);
  return lines.map((l, i) => ({ id: l.id, delta: u[2 * at[i]], F: l.k * u[2 * at[i]] }));
}

/**
 * Line forces for a story force V on a semi-rigid diaphragm of span `span` (ft), stiffness
 * EI (lb·in²) and GA (lb); e = inherent eccentricity of the mass from mid-span (ft), ea the
 * accidental eccentricity (ft, 0 for wind).
 */
export function semiRigidDistribution(
  lines: SemiRigidLine[],
  V: number,
  span: number,
  EI: number,
  GA: number,
  e: number,
  ea: number,
): SemiRigidResult {
  if (!lines.length) throw new Error("Semi-rigid diaphragm: no wall lines");
  if (lines.some((l) => !(l.k > 0))) throw new Error("Semi-rigid diaphragm: line stiffness missing");
  if (lines.length === 1)
    return { V, span, EI, GA, e, ea, lines: [{ id: lines[0].id, total: V, direct: V, delta: V / lines[0].k }] };
  const direct = analyse(lines, V, V * e, span, EI, GA);
  const cases = ea > 0 ? [e + ea, e - ea] : [e];
  const out = direct.map((d) => ({ id: d.id, total: d.F, direct: d.F, delta: d.delta }));
  for (const ecc of cases) {
    const r = analyse(lines, V, V * ecc, span, EI, GA);
    r.forEach((x, i) => {
      if (x.F > out[i].total) Object.assign(out[i], { total: x.F, delta: x.delta });
    });
  }
  return { V, span, EI, GA, e, ea, lines: out };
}
