/**
 * Beam analysis — Euler-Bernoulli finite elements for simple, continuous
 * (2–3 span) and cantilevered beams on knife-edge supports.
 *
 * Units: positions in ft, distributed loads in plf (lb/ft), point loads in lb,
 * EI in lb-in². Results: shear in lb, moment in lb-ft, deflection in inches.
 * Sign convention: gravity loads positive downward, deflection positive
 * downward, sagging moment positive, shear = Σ(upward forces left of the cut).
 *
 * Each load type is analysed separately. Floor and roof live loads (L, Lr)
 * are also split per span so that members can build the ASCE 7 §4.3.3
 * partial-loading envelope (load only the spans that increase an effect).
 */

import { LOAD_TYPES, type LoadType } from "../core/loads";

export interface BeamGeometry {
  /** interior spans between supports, ft */
  spans: number[];
  /** overhang beyond the first support, ft */
  leftCantilever?: number;
  /** overhang beyond the last support, ft */
  rightCantilever?: number;
}

export type BeamLoadKind = "udl" | "linear" | "point";

export interface BeamLoad {
  type: LoadType;
  kind: BeamLoadKind;
  /** udl / linear: start and end, ft from the left end of the member */
  x1?: number;
  x2?: number;
  /** udl / linear: intensity at x1 and x2, plf (udl uses w1) */
  w1?: number;
  w2?: number;
  /** point load position, ft from the left end, and magnitude, lb */
  x?: number;
  P?: number;
  label?: string;
}

/** Results of one analysed load set (one load type, or one pattern segment of it). */
export interface CaseResult {
  /** reaction at each support, lb (upward positive) */
  R: number[];
  /** moment at each station, lb-ft */
  M: number[];
  /** shear just left / right of each station, lb */
  VL: number[];
  VR: number[];
  /** deflection at each station, in (downward positive) */
  defl: number[];
  loads: BeamLoad[];
}

export interface BeamAnalysis {
  geometry: Required<BeamGeometry>;
  totalLength: number;
  /** support positions, ft */
  supports: number[];
  /** station positions, ft */
  x: number[];
  EI: number;
  /** analysed load type → full result */
  byType: Record<LoadType, CaseResult>;
  /** patterned load types → one result per segment (cantilevers and spans) */
  patterns: Partial<Record<LoadType, CaseResult[]>>;
  /** segment boundaries [start, end] ft for the pattern results */
  segments: Array<[number, number]>;
}

const EPS = 1e-9;

export function supportPositions(g: BeamGeometry): number[] {
  const a = g.leftCantilever ?? 0;
  const xs = [a];
  for (const s of g.spans) xs.push(xs[xs.length - 1] + s);
  return xs;
}

export function memberLength(g: BeamGeometry): number {
  return (g.leftCantilever ?? 0) + g.spans.reduce((s, v) => s + v, 0) + (g.rightCantilever ?? 0);
}

/** Split loads into per-segment pieces (cantilevers and spans) for pattern loading. */
function splitBySegments(loads: BeamLoad[], segments: Array<[number, number]>): BeamLoad[][] {
  const out: BeamLoad[][] = segments.map(() => []);
  for (const ld of loads) {
    if (ld.kind === "point") {
      const x = ld.x ?? 0;
      let k = segments.findIndex(([a, b]) => x >= a - EPS && x < b - EPS);
      if (k < 0) k = segments.length - 1;
      out[k].push(ld);
      continue;
    }
    const x1 = ld.x1 ?? 0;
    const x2 = ld.x2 ?? 0;
    const w1 = ld.w1 ?? 0;
    const w2 = ld.kind === "udl" ? w1 : (ld.w2 ?? w1);
    segments.forEach(([a, b], k) => {
      const s = Math.max(a, x1);
      const e = Math.min(b, x2);
      if (e - s <= EPS) return;
      const at = (xx: number) => (x2 - x1 <= EPS ? w1 : w1 + ((w2 - w1) * (xx - x1)) / (x2 - x1));
      out[k].push({ ...ld, kind: "linear", x1: s, x2: e, w1: at(s), w2: at(e) });
    });
  }
  return out;
}

/** Resultant force of the part of a distributed load left of x, and its moment about x. */
function distLeftOf(ld: BeamLoad, x: number): { F: number; Mx: number } {
  const x1 = ld.x1 ?? 0;
  const x2 = ld.x2 ?? 0;
  if (x <= x1 + EPS) return { F: 0, Mx: 0 };
  const w1 = ld.w1 ?? 0;
  const w2 = ld.kind === "udl" ? w1 : (ld.w2 ?? w1);
  const end = Math.min(x, x2);
  const l = end - x1;
  if (l <= EPS) return { F: 0, Mx: 0 };
  const wEnd = x2 - x1 <= EPS ? w1 : w1 + ((w2 - w1) * (end - x1)) / (x2 - x1);
  const F = ((w1 + wEnd) / 2) * l;
  // centroid of a trapezoid measured from x1
  const c = Math.abs(w1 + wEnd) < EPS ? l / 2 : (l * (w1 + 2 * wEnd)) / (3 * (w1 + wEnd));
  return { F, Mx: F * (x - (x1 + c)) };
}

/** Shear (lb) and moment (lb-ft) at x from statics; side 'L' excludes point forces exactly at x. */
export function staticsAt(
  x: number,
  supports: number[],
  R: number[],
  loads: BeamLoad[],
  side: "L" | "R",
): { V: number; M: number } {
  let V = 0;
  let M = 0;
  const left = (xp: number) => (side === "L" ? xp < x - EPS : xp <= x + EPS);
  supports.forEach((xs, i) => {
    if (left(xs)) {
      V += R[i];
      M += R[i] * (x - xs);
    }
  });
  for (const ld of loads) {
    if (ld.kind === "point") {
      const xp = ld.x ?? 0;
      if (left(xp)) {
        V -= ld.P ?? 0;
        M -= (ld.P ?? 0) * (x - xp);
      }
    } else {
      const { F, Mx } = distLeftOf(ld, x);
      V -= F;
      M -= Mx;
    }
  }
  return { V, M };
}

interface Mesh {
  nodes: number[];
  supportNode: number[];
}

function buildMesh(total: number, supports: number[], loads: BeamLoad[], perSegment = 48): Mesh {
  // key points kept at their exact values (supports first) and merged only when they
  // coincide to within round-off, so supports and load ends always fall on nodes
  const tol = 1e-9 * Math.max(1, total);
  const keys: number[] = [];
  const add = (v: number) => {
    const c = Math.min(Math.max(v, 0), total);
    if (!keys.some((k) => Math.abs(k - c) <= tol)) keys.push(c);
  };
  supports.forEach(add);
  add(0);
  add(total);
  for (const ld of loads) {
    if (ld.kind === "point") add(ld.x ?? 0);
    else {
      add(ld.x1 ?? 0);
      add(ld.x2 ?? 0);
    }
  }
  keys.sort((a, b) => a - b);
  const nodes: number[] = [];
  const maxLen = Math.max(total / (perSegment * Math.max(1, supports.length - 1 + 2)), 0.05);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    const n = Math.max(1, Math.ceil((b - a) / maxLen));
    for (let k = 0; k < n; k++) nodes.push(a + ((b - a) * k) / n);
  }
  nodes.push(keys[keys.length - 1]);
  const supportNode = supports.map((xs) => {
    let best = 0;
    for (let i = 1; i < nodes.length; i++) if (Math.abs(nodes[i] - xs) < Math.abs(nodes[best] - xs)) best = i;
    return best;
  });
  return { nodes, supportNode };
}

/** Consistent nodal loads of a linear distributed load q1→q2 (lb/in) over one element of length h (in). */
function elementLoad(q1: number, q2: number, h: number): [number, number, number, number] {
  return [
    (h * (21 * q1 + 9 * q2)) / 60,
    (h * h * (3 * q1 + 2 * q2)) / 60,
    (h * (9 * q1 + 21 * q2)) / 60,
    (-h * h * (2 * q1 + 3 * q2)) / 60,
  ];
}

/**
 * Banded Gaussian elimination for the symmetric positive-definite reduced
 * stiffness matrix (half bandwidth 3 for two-DOF beam elements).
 */
class BandedSystem {
  private a: Float64Array;
  constructor(
    private n: number,
    private bw: number,
  ) {
    this.a = new Float64Array(n * (2 * bw + 1));
  }
  private idx(i: number, j: number) {
    return i * (2 * this.bw + 1) + (j - i + this.bw);
  }
  add(i: number, j: number, v: number) {
    if (Math.abs(i - j) > this.bw) throw new Error("outside band");
    this.a[this.idx(i, j)] += v;
  }
  private factored = false;
  factor() {
    const { n, bw } = this;
    for (let k = 0; k < n; k++) {
      const piv = this.a[this.idx(k, k)];
      if (Math.abs(piv) < 1e-12) throw new Error("Beam is unstable — check supports");
      for (let i = k + 1; i <= Math.min(n - 1, k + bw); i++) {
        const f = this.a[this.idx(i, k)] / piv;
        if (f === 0) continue;
        this.a[this.idx(i, k)] = f;
        for (let j = k + 1; j <= Math.min(n - 1, k + bw); j++) this.a[this.idx(i, j)] -= f * this.a[this.idx(k, j)];
      }
    }
    this.factored = true;
  }
  solve(b: Float64Array): Float64Array {
    if (!this.factored) this.factor();
    const { n, bw } = this;
    const y = Float64Array.from(b);
    for (let i = 0; i < n; i++) for (let k = Math.max(0, i - bw); k < i; k++) y[i] -= this.a[this.idx(i, k)] * y[k];
    for (let i = n - 1; i >= 0; i--) {
      for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) y[i] -= this.a[this.idx(i, k)] * y[k];
      y[i] /= this.a[this.idx(i, i)];
    }
    return y;
  }
}

/** Analyse a beam for a set of loads. Returns per-type and per-pattern-segment results. */
export function analyseBeam(
  geometry: BeamGeometry,
  EI: number,
  loads: BeamLoad[],
  patternTypes: LoadType[] = ["L", "Lr"],
): BeamAnalysis {
  const g: Required<BeamGeometry> = {
    spans: geometry.spans,
    leftCantilever: geometry.leftCantilever ?? 0,
    rightCantilever: geometry.rightCantilever ?? 0,
  };
  if (!g.spans.length || g.spans.some((s) => !(s > 0))) throw new Error("Each span must be greater than zero");
  if (!(EI > 0)) throw new Error("EI must be greater than zero");
  const supports = supportPositions(g);
  const total = memberLength(g);
  const mesh = buildMesh(total, supports, loads);
  const { nodes, supportNode } = mesh;
  const nn = nodes.length;
  const ndof = 2 * nn;

  // reduced system: remove vertical DOFs at supports
  const constrained = new Set(supportNode.map((k) => 2 * k));
  const map = new Int32Array(ndof).fill(-1);
  let nf = 0;
  for (let d = 0; d < ndof; d++) if (!constrained.has(d)) map[d] = nf++;
  const sys = new BandedSystem(nf, 3);
  const elemK: number[][][] = [];
  for (let e = 0; e < nn - 1; e++) {
    const h = (nodes[e + 1] - nodes[e]) * 12;
    const c = EI / h ** 3;
    const k = [
      [12 * c, 6 * h * c, -12 * c, 6 * h * c],
      [6 * h * c, 4 * h * h * c, -6 * h * c, 2 * h * h * c],
      [-12 * c, -6 * h * c, 12 * c, -6 * h * c],
      [6 * h * c, 2 * h * h * c, -6 * h * c, 4 * h * h * c],
    ];
    elemK.push(k);
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) {
      const gi = map[dofs[i]];
      if (gi < 0) continue;
      for (let j = 0; j < 4; j++) {
        const gj = map[dofs[j]];
        if (gj < 0) continue;
        sys.add(gi, gj, k[i][j]);
      }
    }
  }
  sys.factor();

  const nodeOf = (x: number) => {
    let best = 0;
    for (let i = 1; i < nn; i++) if (Math.abs(nodes[i] - x) < Math.abs(nodes[best] - x)) best = i;
    return best;
  };

  const solveSet = (set: BeamLoad[]): CaseResult => {
    // global load vector (lb, lb-in); downward loads → negative vertical force in FE convention (v up)
    const F = new Float64Array(ndof);
    for (const ld of set) {
      if (ld.kind === "point") {
        F[2 * nodeOf(ld.x ?? 0)] -= ld.P ?? 0;
        continue;
      }
      const x1 = ld.x1 ?? 0;
      const x2 = ld.x2 ?? 0;
      const w1 = ld.w1 ?? 0;
      const w2 = ld.kind === "udl" ? w1 : (ld.w2 ?? w1);
      const at = (xx: number) => (x2 - x1 <= EPS ? w1 : w1 + ((w2 - w1) * (xx - x1)) / (x2 - x1));
      for (let e = 0; e < nn - 1; e++) {
        const a = Math.max(nodes[e], x1);
        const b = Math.min(nodes[e + 1], x2);
        if (b - a <= EPS) continue;
        // loads are mesh-aligned (load ends are nodes), so the element is fully loaded
        const h = (nodes[e + 1] - nodes[e]) * 12;
        const q1 = at(nodes[e]) / 12;
        const q2 = at(nodes[e + 1]) / 12;
        const fe = elementLoad(q1, q2, h);
        F[2 * e] -= fe[0];
        F[2 * e + 1] -= fe[1];
        F[2 * e + 2] -= fe[2];
        F[2 * e + 3] -= fe[3];
      }
    }
    const rhs = new Float64Array(nf);
    for (let d = 0; d < ndof; d++) if (map[d] >= 0) rhs[map[d]] = F[d];
    const uRed = sys.solve(rhs);
    const u = new Float64Array(ndof);
    for (let d = 0; d < ndof; d++) if (map[d] >= 0) u[d] = uRed[map[d]];
    // reactions from element end forces at support DOFs: R = K u − F (upward positive)
    const Rfull = new Float64Array(ndof);
    for (let e = 0; e < nn - 1; e++) {
      const k = elemK[e];
      const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) {
        let s = 0;
        for (let j = 0; j < 4; j++) s += k[i][j] * u[dofs[j]];
        Rfull[dofs[i]] += s;
      }
    }
    const R = supportNode.map((k) => Rfull[2 * k] - F[2 * k]);
    const M: number[] = [];
    const VL: number[] = [];
    const VR: number[] = [];
    for (const x of nodes) {
      const l = staticsAt(x, supports, R, set, "L");
      const r = staticsAt(x, supports, R, set, "R");
      M.push(r.M);
      VL.push(l.V);
      VR.push(r.V);
    }
    const defl: number[] = [];
    for (let i = 0; i < nn; i++) defl.push(-u[2 * i]);
    return { R, M, VL, VR, defl, loads: set };
  };

  const byType = {} as Record<LoadType, CaseResult>;
  for (const t of LOAD_TYPES) byType[t] = solveSet(loads.filter((l) => l.type === t));

  const segments: Array<[number, number]> = [];
  if (g.leftCantilever > EPS) segments.push([0, supports[0]]);
  for (let i = 0; i < supports.length - 1; i++) segments.push([supports[i], supports[i + 1]]);
  if (g.rightCantilever > EPS) segments.push([supports[supports.length - 1], total]);

  const patterns: Partial<Record<LoadType, CaseResult[]>> = {};
  if (segments.length > 1) {
    for (const t of patternTypes) {
      const tl = loads.filter((l) => l.type === t);
      if (!tl.length) continue;
      patterns[t] = splitBySegments(tl, segments).map((set) => solveSet(set));
    }
  }

  return { geometry: g, totalLength: total, supports, x: nodes, EI, byType, patterns, segments };
}

/** Pattern envelope of one load type: [max, min] arrays for a result field. */
export function patternEnvelope(
  a: BeamAnalysis,
  t: LoadType,
  field: "M" | "VL" | "VR" | "defl",
): { max: number[]; min: number[] } {
  const pats = a.patterns[t];
  const full = a.byType[t][field];
  if (!pats) return { max: [...full], min: [...full] };
  const max = full.map(() => 0);
  const min = full.map(() => 0);
  for (const p of pats) {
    p[field].forEach((v, i) => {
      if (v > 0) max[i] += v;
      else min[i] += v;
    });
  }
  return { max, min };
}

/** Pattern envelope of support reactions: [max, min] per support. */
export function reactionEnvelope(a: BeamAnalysis, t: LoadType): { max: number[]; min: number[] } {
  const pats = a.patterns[t];
  const full = a.byType[t].R;
  if (!pats) return { max: [...full], min: [...full] };
  const max = full.map(() => 0);
  const min = full.map(() => 0);
  for (const p of pats)
    p.R.forEach((v, i) => {
      if (v > 0) max[i] += v;
      else min[i] += v;
    });
  return { max, min };
}

/** Shear at a position for one load type (non-patterned), lb. */
export function shearAt(a: BeamAnalysis, t: LoadType, x: number, side: "L" | "R"): number {
  const r = a.byType[t];
  return staticsAt(x, a.supports, r.R, r.loads, side).V;
}
