/* Ported from TrussCalc (Roof Truss Planner, src/lib/truss-analysis.ts) — solver unchanged. */
/**
 * Pin-jointed 2D truss solver (method of joints solved as a linear system)
 * plus virtual-work joint deflections.
 */

import type { TrussGeometry } from "./trussGeometry";

export interface NodalLoad {
  fx: number;
  fy: number; // downward loads are negative
}

export interface SolveResult {
  /** Axial force per member, lb. Positive = tension, negative = compression. */
  forces: number[];
  reactionLeftX: number;
  reactionLeftY: number;
  reactionRightY: number;
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const M = A.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-10)
      throw new Error("Truss geometry is unstable or overconstrained; revise its members.");
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

export function solveTruss(g: TrussGeometry, loads: NodalLoad[]): SolveResult {
  const j = g.nodes.length;
  const m = g.members.length;
  const nUnknown = m + 3;
  const nEq = 2 * j;
  const A: number[][] = Array.from({ length: nEq }, () => new Array(nUnknown).fill(0));
  const rhs = new Array(nEq).fill(0);

  g.members.forEach((mem, k) => {
    const na = g.nodes[mem.a];
    const nb = g.nodes[mem.b];
    const ux = (nb.x - na.x) / mem.length;
    const uy = (nb.y - na.y) / mem.length;
    // tension pulls each node toward the other end
    A[2 * mem.a][k] += ux;
    A[2 * mem.a + 1][k] += uy;
    A[2 * mem.b][k] -= ux;
    A[2 * mem.b + 1][k] -= uy;
  });

  A[2 * g.supportLeft][m] += 1; // Rx at left support
  A[2 * g.supportLeft + 1][m + 1] += 1; // Ry at left support
  A[2 * g.supportRight + 1][m + 2] += 1; // Ry at right support

  g.nodes.forEach((n) => {
    rhs[2 * n.id] = -(loads[n.id]?.fx ?? 0);
    rhs[2 * n.id + 1] = -(loads[n.id]?.fy ?? 0);
  });

  // Least-squares collapse to a square system (2j equations, m+3 unknowns are equal for
  // statically determinate trusses; normal equations keep this robust either way).
  const AT: number[][] = Array.from({ length: nUnknown }, (_, i) =>
    Array.from({ length: nUnknown }, (_, k) => {
      let s = 0;
      for (let r = 0; r < nEq; r++) s += A[r][i] * A[r][k];
      return s;
    }),
  );
  const bt = Array.from({ length: nUnknown }, (_, i) => {
    let s = 0;
    for (let r = 0; r < nEq; r++) s += A[r][i] * rhs[r];
    return s;
  });

  const x = solveLinear(AT, bt);
  return {
    forces: x.slice(0, m),
    reactionLeftX: x[m],
    reactionLeftY: x[m + 1],
    reactionRightY: x[m + 2],
  };
}

/**
 * Virtual-work vertical deflection at a node.
 * axialStiffness[i] = A_i * E_i in lb (in^2 * psi).
 */
export function jointDeflection(
  g: TrussGeometry,
  realForces: number[],
  unitForces: number[],
  axialStiffness: number[],
): number {
  let sum = 0;
  g.members.forEach((mem, i) => {
    const Lin = mem.length * 12;
    sum += (unitForces[i] * realForces[i] * Lin) / axialStiffness[i];
  });
  return sum; // inches, positive downward for a downward unit load
}

export function unitLoadCase(g: TrussGeometry, nodeId: number): number[] {
  const loads: NodalLoad[] = g.nodes.map(() => ({ fx: 0, fy: 0 }));
  loads[nodeId] = { fx: 0, fy: -1 };
  return solveTruss(g, loads).forces;
}
