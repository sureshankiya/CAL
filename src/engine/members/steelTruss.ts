/**
 * STR-# — steel roof truss (port of STRUTURA, Truss Report Master).
 *
 * Geometry generators for the 13 roof patterns are STRUTURA's (truss-engine.ts generateTruss);
 * the bridge patterns are not ported (AASHTO, outside a building package). Changes from STRUTURA:
 *  - section properties and grades from the HouseCalc AISC library (data/steel.ts) instead of
 *    STRUTURA's table (rectangular HSS rows carried the square-tube values; W8X18 r_y, pipe areas)
 *  - LRFD or ASD per ASCE 7 §2.3 / §2.4 from the combination library, wind down and wind uplift as
 *    separate cases of every W combination (STRUTURA: six fixed LRFD cases, no 0.5W cases)
 *  - tension: D2(a) yielding and D2(b) rupture on A_e = U A_n (STRUTURA: yielding only)
 *  - compression: E3 / E7 with L_cx = member length in plane and L_cy = the chord bracing length
 *    out of plane (STRUTURA: K = 1 on the member length about r_min, no E7)
 *  - truss self weight added to D; balanced / unbalanced snow and reduced roof live from the
 *    project criteria; deflection under service loads against a limit (STRUTURA: factored only)
 *
 * Units: geometry ft, forces lb (reported in kip on the sheet), steel checks in kip / ksi / in.
 */

import { asdCombinations, combine, relevantCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, zeroLoads, type LoadType } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import type { TrussGeometry, TrussMember, TrussNode, MemberGroup } from "../analysis/trussGeometry";
import { E_STEEL, steelGrade, steelShape, type SteelShape } from "../data/steel";
import {
  available,
  compression,
  flexureMajor,
  type CompressionResult,
  type ResistanceFactor,
  type SteelMethod,
} from "../design/steel";
import { governingCheck, type Check } from "../design/wood";
import {
  asce7Of,
  resolveDead,
  resolveDeflection,
  resolveRoofLive,
  resolveSnow,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type LoadLine,
} from "./common";
import { steelCombos } from "./steel";
import type { MemberReaction, MemberResultBase } from "./types";

export type SteelTrussPattern =
  | "king"
  | "queen"
  | "pratt"
  | "howe"
  | "warren"
  | "fink"
  | "double-fink"
  | "fan"
  | "modified-queen"
  | "scissors"
  | "north-light"
  | "bowstring"
  | "pitched-parallel";

/** Section groups: top / bottom chord, end verticals, interior verticals, diagonals. */
export type SteelTrussGroup = "TC" | "BC" | "EV" | "V" | "D";

export const STEEL_TRUSS_GROUPS: Record<SteelTrussGroup, string> = {
  TC: "Top chord",
  BC: "Bottom chord",
  EV: "End vertical",
  V: "Vertical",
  D: "Diagonal",
};

export const STEEL_TRUSS_PATTERNS: Record<SteelTrussPattern, { label: string; required: SteelTrussGroup[] }> = {
  king: { label: "King post", required: ["V", "D"] },
  queen: { label: "Queen post", required: ["V", "D"] },
  pratt: { label: "Pratt", required: ["D"] },
  howe: { label: "Howe", required: ["D"] },
  warren: { label: "Warren", required: ["D"] },
  fink: { label: "Fink", required: ["D"] },
  "double-fink": { label: "Double Fink", required: ["D"] },
  fan: { label: "Fan", required: ["D"] },
  "modified-queen": { label: "Modified queen", required: ["V", "D"] },
  scissors: { label: "Scissors", required: ["D"] },
  "north-light": { label: "North-light", required: ["EV", "D"] },
  bowstring: { label: "Bowstring", required: ["D"] },
  "pitched-parallel": { label: "Pitched parallel chord", required: ["EV", "V", "D"] },
};

export interface SteelTrussSection {
  shape: string;
  grade: string;
}

export interface SteelTrussInput {
  id: string;
  mark: string;
  description: string;
  pattern: SteelTrussPattern;
  /** ft */
  span: number;
  /** apex rise above the bearings, ft */
  rise: number;
  /** pitched parallel chord: vertical spacing of the chords, ft */
  chordDepth: number;
  /** top-chord overhang beyond each bearing, ft (horizontal) */
  overhang: number;
  /** requested panels (rounded to an even number, 4 to 16) */
  panels: number;
  /** truss spacing, ft o.c. */
  spacing: number;
  method: SteelMethod;
  sections: Record<"TC" | "BC", SteelTrussSection> & Partial<Record<"EV" | "V" | "D", SteelTrussSection>>;
  /** out-of-plane bracing of the top chord (purlins), ft; 0 = braced at every panel point */
  topBracing: number;
  /** out-of-plane bracing of the bottom chord, ft; 0 = braced at every panel point */
  bottomBracing: number;
  roofDead: DeadRef;
  /** dead load hung from the bottom chord (ceiling, MEP), psf */
  ceilingDead: DeadRef;
  roofLive: boolean;
  snow: boolean;
  /** strength-level wind on the horizontal projection, psf (magnitudes) */
  windDown: number;
  windUplift: number;
  selfWeight: boolean;
  /** tension members: A_n / A_g and shear-lag factor U (AISC D3, Table D3.1) */
  netArea: number;
  U: number;
  deflection: DeflectionInput;
}

export interface SteelTrussRow {
  name: string;
  group: SteelTrussGroup;
  shape: string;
  length: number;
  /** member force by load case, lb (+ tension) */
  byType: { D: number; Lr: number; S: number; Su: number; Wd: number; Wu: number };
  Tmax: number;
  Tcombo: string;
  Cmax: number;
  Ccombo: string;
  /** available tension (min of yielding / rupture) and compression, kip */
  Pt: number;
  tLimit: string;
  Pc: number;
  comp?: CompressionResult;
  compError?: string;
  ratio: number;
  combo: string;
  mode: "tension" | "compression" | "zero";
  slender: number;
}

export interface SteelTrussResult extends MemberResultBase {
  kind: "steelTruss";
  input: SteelTrussInput;
  geometry: TrussGeometry;
  panels: number;
  mats: Partial<Record<SteelTrussGroup, { shape: SteelShape; Fy: number; Fu: number; gradeLabel: string }>>;
  thetaDeg: number;
  method: SteelMethod;
  loads: {
    D: number;
    Dceil: number;
    Lr: number;
    S: number;
    Swind: number;
    Slee: number;
    Wd: number;
    Wu: number;
    self: number;
  };
  rows: SteelTrussRow[];
  combosUsed: string[];
  factors: { tY: ResistanceFactor; tR: ResistanceFactor; c: ResistanceFactor };
  tail?: { M: number; Mc: number; ratio: number; combo: string; length: number };
  defl: { node: string; live: number; dead: number; total: number; liveLim: number; totalLim: number };
  /** horizontal reaction at the pinned bearing, governing combination, lb */
  Rx: number;
}

const NODE = (i: number) => `N${i + 1}`;
const PHI_T_YIELD: ResistanceFactor = { phi: 0.9, omega: 1.67 };
const PHI_T_RUPTURE: ResistanceFactor = { phi: 0.75, omega: 2.0 };
const PHI_C: ResistanceFactor = { phi: 0.9, omega: 1.67 };

/* ---------------- geometry (STRUTURA generateTruss, roof patterns) ---------------- */

const evenPanels = (n: number) => Math.max(4, Math.min(16, Math.round(n / 2) * 2));

function topProfile(type: SteelTrussPattern, x: number, span: number, rise: number, chordDepth: number) {
  const q = x / span;
  if (type === "pitched-parallel") return 2 * rise * Math.min(q, 1 - q) + chordDepth;
  if (type === "north-light") return rise * (0.35 + 0.65 * q);
  if (type === "bowstring") return rise * Math.sin(Math.PI * q);
  return 2 * rise * Math.min(q, 1 - q);
}

function bottomProfile(type: SteelTrussPattern, x: number, span: number, rise: number) {
  if (type === "scissors") return ((Math.min(x, span - x) * rise) / span) * 0.65;
  if (type === "pitched-parallel") return 2 * Math.min(x / span, 1 - x / span) * rise;
  return 0;
}

const PRATT_LIKE: SteelTrussPattern[] = ["pratt", "fink", "double-fink", "fan", "king", "queen", "modified-queen"];

export function buildSteelTruss(
  t: Pick<SteelTrussInput, "pattern" | "span" | "rise" | "chordDepth" | "panels" | "overhang" | "sections">,
) {
  const p = evenPanels(t.panels);
  const pts: Array<{ x: number; y: number; top: boolean; bottom: boolean }> = [];
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i <= p; i++) {
    const x = (t.span * i) / p;
    bottom.push(pts.length);
    pts.push({ x, y: bottomProfile(t.pattern, x, t.span, t.rise), top: false, bottom: true });
  }
  for (let i = 0; i <= p; i++) {
    const x = (t.span * i) / p;
    const y = topProfile(t.pattern, x, t.span, t.rise, t.chordDepth);
    if (Math.abs(y - pts[bottom[i]].y) < 0.001) {
      top.push(bottom[i]);
      pts[bottom[i]].top = true;
    } else {
      top.push(pts.length);
      pts.push({ x, y, top: true, bottom: false });
    }
  }
  const defs: Array<[number, number, SteelTrussGroup]> = [];
  const seen = new Set<string>();
  const add = (a: number, b: number, g: SteelTrussGroup) => {
    if (a === b || (g !== "TC" && g !== "BC" && !t.sections[g])) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    defs.push([a, b, g]);
  };
  for (let i = 0; i < p; i++) {
    add(bottom[i], bottom[i + 1], "BC");
    add(top[i], top[i + 1], "TC");
  }
  for (let i = 0; i <= p; i++) {
    const isEnd = i === 0 || i === p;
    if (Math.abs(pts[top[i]].y - pts[bottom[i]].y) > 0.05) add(bottom[i], top[i], isEnd ? "EV" : "V");
  }
  for (let i = 0; i < p; i++) {
    let a: number;
    let b: number;
    if (PRATT_LIKE.includes(t.pattern)) {
      a = i < p / 2 ? bottom[i] : bottom[i + 1];
      b = i < p / 2 ? top[i + 1] : top[i];
    } else if (t.pattern === "howe") {
      a = i < p / 2 ? bottom[i + 1] : bottom[i];
      b = i < p / 2 ? top[i] : top[i + 1];
    } else {
      a = i % 2 === 0 ? bottom[i] : bottom[i + 1];
      b = i % 2 === 0 ? top[i + 1] : top[i];
    }
    add(a, b, "D");
  }
  const nodes: TrussNode[] = pts.map((q, id) => ({
    id,
    name: NODE(id),
    x: q.x,
    y: q.y,
    onTopChord: q.top,
    onBottomChord: q.bottom,
  }));
  const geoGroup = (g: SteelTrussGroup): MemberGroup => (g === "V" || g === "D" ? "WEB" : g);
  const members: TrussMember[] = defs.map(([a, b, g], id) => ({
    id,
    name: `M${id + 1}`,
    a,
    b,
    group: geoGroup(g),
    length: Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y),
  }));
  const oh = Math.max(0, t.overhang);
  const slopeL = (nodes[top[1]].y - nodes[top[0]].y) / (nodes[top[1]].x - nodes[top[0]].x);
  const slopeR = (nodes[top[p]].y - nodes[top[p - 1]].y) / (nodes[top[p]].x - nodes[top[p - 1]].x);
  const rise = Math.max(...nodes.map((n) => n.y));
  const g: TrussGeometry = {
    // the steel patterns are not TrussCalc types; the drawing does not read this field
    type: "custom",
    span: t.span,
    rise,
    pitch: (t.rise / (t.span / 2)) * 12,
    overhang: oh,
    overhangSlope: oh * Math.hypot(1, Math.max(Math.abs(slopeL), Math.abs(slopeR))),
    tailLeft: oh ? { x: -oh, y: nodes[top[0]].y - oh * slopeL } : undefined,
    tailRight: oh ? { x: t.span + oh, y: nodes[top[p]].y + oh * slopeR } : undefined,
    nodes,
    members,
    topChordNodes: top,
    bottomChordNodes: bottom,
    supportLeft: bottom[0],
    supportRight: bottom[p],
    apex: nodes.reduce((best, n) => (n.y > nodes[best].y ? n.id : best), 0),
    slopeLength: Math.hypot(t.span / 2, t.rise),
  };
  return { g, groups: defs.map((d) => d[2]), panels: p };
}

/* ---------------- direct stiffness solver (pin-jointed, left pin / right roller) ---------------- */

interface Solution {
  forces: number[];
  disp: number[];
  Rx: number;
  RyL: number;
  RyR: number;
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
    if (Math.abs(M[piv][k]) < 1e-9) throw new Error("Truss layout is unstable — add end verticals or web members");
    [M[k], M[piv]] = [M[piv], M[k]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      if (f) for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** loads: fy per node, lb (downward negative); EA per member, lb. */
function solve(g: TrussGeometry, EA: number[], fy: number[]): Solution {
  const nd = g.nodes.length * 2;
  const K = Array.from({ length: nd }, () => new Array(nd).fill(0));
  const geo = g.members.map((m) => {
    const a = g.nodes[m.a];
    const b = g.nodes[m.b];
    const L = m.length * 12;
    return { c: ((b.x - a.x) * 12) / L, s: ((b.y - a.y) * 12) / L, L };
  });
  g.members.forEach((m, k) => {
    const { c, s, L } = geo[k];
    const q = [c, s, -c, -s];
    const ids = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[ids[i]][ids[j]] += (EA[k] / L) * q[i] * q[j];
  });
  const F = new Array(nd).fill(0);
  fy.forEach((v, i) => (F[2 * i + 1] = v));
  const fixed = new Set([2 * g.supportLeft, 2 * g.supportLeft + 1, 2 * g.supportRight + 1]);
  const free = Array.from({ length: nd }, (_, i) => i).filter((i) => !fixed.has(i));
  const uf = solveLinear(
    free.map((i) => free.map((j) => K[i][j])),
    free.map((i) => F[i]),
  );
  const u = new Array(nd).fill(0);
  free.forEach((d, i) => (u[d] = uf[i]));
  const R = (i: number) => K[i].reduce((s, v, j) => s + v * u[j], 0) - F[i];
  const forces = g.members.map((m, k) => {
    const { c, s, L } = geo[k];
    return (EA[k] / L) * (c * (u[2 * m.b] - u[2 * m.a]) + s * (u[2 * m.b + 1] - u[2 * m.a + 1]));
  });
  return { forces, disp: u, Rx: R(2 * g.supportLeft), RyL: R(2 * g.supportLeft + 1), RyR: R(2 * g.supportRight + 1) };
}

/** Equivalent nodal loads from a line load q(x) (plf, horizontal projection) on chord nodes. */
function nodal(g: TrussGeometry, ids: number[], q: (x: number) => number, out: number[], sign = -1) {
  const xs = ids.map((id) => g.nodes[id].x);
  ids.forEach((id, i) => {
    let F = 0;
    if (i > 0) F += q((xs[i - 1] + 3 * xs[i]) / 4) * ((xs[i] - xs[i - 1]) / 2);
    if (i < ids.length - 1) F += q((3 * xs[i] + xs[i + 1]) / 4) * ((xs[i + 1] - xs[i]) / 2);
    out[id] += sign * F;
  });
}

type CaseKey = "D" | "Lr" | "S" | "Su" | "Wd" | "Wu";

export function designSteelTruss(ctx: DesignContext, t: SteelTrussInput): SteelTrussResult {
  const pat = STEEL_TRUSS_PATTERNS[t.pattern];
  for (const g of pat.required)
    if (!t.sections[g]) throw new Error(`${pat.label} truss requires ${STEEL_TRUSS_GROUPS[g].toLowerCase()} members`);
  if (t.pattern === "pitched-parallel" && t.chordDepth <= 0) throw new Error("Chord spacing must be greater than zero");
  const { g, groups, panels } = buildSteelTruss(t);
  const E = E_STEEL;
  const mats: SteelTrussResult["mats"] = {};
  for (const k of Object.keys(STEEL_TRUSS_GROUPS) as SteelTrussGroup[]) {
    const s = t.sections[k];
    if (!s) continue;
    const gr = steelGrade(s.grade);
    mats[k] = { shape: steelShape(s.shape), Fy: gr.Fy, Fu: gr.Fu, gradeLabel: gr.label };
  }
  const matOf = (k: number) => mats[groups[k]]!;
  const lines: LoadLine[] = [];
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];

  // ---------------- loads, plf of horizontal projection
  const theta = Math.atan2(t.rise, t.span / 2);
  const cos = Math.cos(theta);
  const pitch = (t.rise / (t.span / 2)) * 12;
  const trib = t.spacing;
  const rd = resolveDead(ctx, t.roofDead, "sloped");
  const roofD = rd.basis === "sloped" ? rd.psf / cos : rd.psf;
  const cd = resolveDead(ctx, t.ceilingDead, "horizontal");
  const lr = t.roofLive ? resolveRoofLive(ctx, t.span * trib, pitch) : undefined;
  const gable = t.pattern !== "north-light" && t.pattern !== "bowstring";
  const sn = t.snow ? resolveSnow(ctx, pitch, t.span / 2, gable) : undefined;
  const unbal = sn?.unbalanced.applies ? sn.unbalanced : undefined;
  const wD = roofD * trib;
  const wDc = cd.psf * trib;
  const wLr = (lr?.psf ?? 0) * trib;
  const wS = (sn?.balanced ?? 0) * trib;
  const wWd = t.windDown * trib;
  const wWu = t.windUplift * trib;
  lines.push({
    type: "D",
    label: `Roof dead — ${rd.label}`,
    expr: `${fmt(rd.psf, 2)} psf${rd.basis === "sloped" ? ` / cos θ = ${fmt(roofD, 2)} psf` : ""} × ${fmt(trib, 2)} ft`,
    value: wD,
    unit: "plf",
  });
  if (wDc)
    lines.push({
      type: "D",
      label: `Bottom-chord dead — ${cd.label}`,
      expr: `${fmt(cd.psf, 2)} psf × ${fmt(trib, 2)} ft`,
      value: wDc,
      unit: "plf",
    });
  if (lr)
    lines.push({
      type: "Lr",
      label: "Roof live load",
      expr: `${lr.expr} × ${fmt(trib, 2)} ft`,
      value: wLr,
      unit: "plf",
      ref: lr.ref,
    });
  if (sn) {
    lines.push({
      type: "S",
      label: "Snow, balanced",
      expr: `${fmt(sn.balanced, 2)} psf × ${fmt(trib, 2)} ft`,
      value: wS,
      unit: "plf",
      ref: sn.refs.ps,
    });
    if (unbal)
      lines.push({
        type: "S",
        label: "Snow, unbalanced (leeward / windward)",
        expr: `${fmt(unbal.leeward, 2)} / ${fmt(unbal.windward, 2)} psf × ${fmt(trib, 2)} ft`,
        value: unbal.leeward * trib,
        unit: "plf",
        ref: sn.refs.unbal,
      });
  }
  if (wWd)
    lines.push({
      type: "W",
      label: "Wind, downward (strength)",
      expr: `${fmt(t.windDown, 2)} psf × ${fmt(trib, 2)} ft`,
      value: wWd,
      unit: "plf",
    });
  if (wWu)
    lines.push({
      type: "W",
      label: "Wind, net uplift (strength), upward",
      expr: `${fmt(t.windUplift, 2)} psf × ${fmt(trib, 2)} ft`,
      value: -wWu,
      unit: "plf",
    });

  // ---------------- nodal load cases
  const blank = () => g.nodes.map(() => 0);
  const cases: Record<CaseKey, number[]> = {
    D: blank(),
    Lr: blank(),
    S: blank(),
    Su: blank(),
    Wd: blank(),
    Wu: blank(),
  };
  const tc = g.topChordNodes;
  const bc = g.bottomChordNodes;
  nodal(g, tc, () => wD, cases.D);
  nodal(g, bc, () => wDc, cases.D);
  nodal(g, tc, () => wLr, cases.Lr);
  nodal(g, tc, () => wS, cases.S);
  if (unbal) nodal(g, tc, (x) => (x < t.span / 2 ? unbal.windward : unbal.leeward) * trib, cases.Su);
  nodal(g, tc, () => wWd, cases.Wd);
  nodal(g, tc, () => wWu, cases.Wu, +1);
  let self = 0;
  if (t.selfWeight)
    g.members.forEach((m, k) => {
      const w = matOf(k).shape.wt * m.length;
      self += w;
      cases.D[m.a] -= w / 2;
      cases.D[m.b] -= w / 2;
    });
  if (g.overhang > 0) {
    const tailSelf = t.selfWeight ? mats.TC!.shape.wt * g.overhangSlope : 0;
    self += 2 * tailSelf;
    const ends = [tc[0], tc[tc.length - 1]];
    ends.forEach((id, i) => {
      cases.D[id] -= wD * g.overhang + tailSelf;
      cases.Lr[id] -= wLr * g.overhang;
      cases.S[id] -= wS * g.overhang;
      if (unbal) cases.Su[id] -= (i === 0 ? unbal.windward : unbal.leeward) * trib * g.overhang;
      cases.Wd[id] -= wWd * g.overhang;
      cases.Wu[id] += wWu * g.overhang;
    });
  }
  if (t.selfWeight)
    lines.push({
      type: "D",
      label: "Truss self weight (members and tails)",
      expr: "Σ w L from the section weights",
      value: self,
      unit: "lb",
    });
  const EA = g.members.map((_, k) => matOf(k).shape.A * E * 1000);
  const sol = Object.fromEntries((Object.keys(cases) as CaseKey[]).map((k) => [k, solve(g, EA, cases[k])])) as Record<
    CaseKey,
    Solution
  >;

  // ---------------- combinations: wind down / uplift and balanced / unbalanced snow variants
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  if (wLr) present.Lr = true;
  if (wS) present.S = true;
  if (wWd || wWu) present.W = true;
  type Case = { combo: Combination; s: "S" | "Su"; w: "Wd" | "Wu"; label: string };
  const expand = (base: Combination[]) => {
    const out: Case[] = [];
    for (const c of base) {
      const ss: Array<"S" | "Su"> = unbal && c.factors.S ? ["S", "Su"] : ["S"];
      const ws: Array<"Wd" | "Wu"> = c.factors.W
        ? ([wWd ? "Wd" : null, wWu ? "Wu" : null].filter(Boolean) as Array<"Wd" | "Wu">)
        : ["Wd"];
      for (const s of ss)
        for (const w of ws)
          out.push({
            combo: c,
            s,
            w,
            label: `${c.label}${s === "Su" ? " (unbal. S)" : ""}${c.factors.W ? (w === "Wd" ? " (W down)" : " (W up)") : ""}`,
          });
    }
    return out;
  };
  const allCases = expand(steelCombos(ctx, t.method, present));
  const valueOf = (pick: (s: Solution) => number, cs: Case) => {
    const f = cs.combo.factors;
    return (
      (f.D ?? 0) * pick(sol.D) +
      (f.Lr ?? 0) * pick(sol.Lr) +
      (f.S ?? 0) * pick(sol[cs.s]) +
      (f.W ?? 0) * pick(sol[cs.w])
    );
  };

  // ---------------- member checks (kip)
  const tY = PHI_T_YIELD;
  const tR = PHI_T_RUPTURE;
  const span = t.span;
  const rows: SteelTrussRow[] = g.members.map((m, k) => {
    const grp = groups[k];
    const mt = matOf(k);
    const s = mt.shape;
    const L = m.length * 12;
    const brace = grp === "TC" ? t.topBracing : grp === "BC" ? t.bottomBracing : 0;
    const Lcy = Math.max(L, brace * 12);
    const byType = {
      D: sol.D.forces[k],
      Lr: sol.Lr.forces[k],
      S: sol.S.forces[k],
      Su: sol.Su.forces[k],
      Wd: sol.Wd.forces[k],
      Wu: sol.Wu.forces[k],
    };
    let Tmax = 0;
    let Tcombo = "—";
    let Cmax = 0;
    let Ccombo = "—";
    for (const cs of allCases) {
      const F = valueOf((x) => x.forces[k], cs);
      if (F > Tmax) [Tmax, Tcombo] = [F, cs.label];
      if (-F > Cmax) [Cmax, Ccombo] = [-F, cs.label];
    }
    const Ag = s.A;
    const Ae = t.U * t.netArea * Ag;
    const PtY = available(mt.Fy * Ag, tY, t.method);
    const PtR = available(mt.Fu * Ae, tR, t.method);
    const Pt = Math.min(PtY, PtR);
    let comp: CompressionResult | undefined;
    let compError: string | undefined;
    let Pc = 0;
    try {
      comp = compression(s, mt.Fy, E, L, Lcy);
      Pc = available(comp.Pn, PHI_C, t.method);
    } catch (e) {
      compError = e instanceof Error ? e.message : String(e);
    }
    const rT = Tmax / 1000 / Pt;
    const rC = Cmax > 1 ? (compError ? Infinity : Cmax / 1000 / Pc) : 0;
    const mode: SteelTrussRow["mode"] =
      Tmax < 1 && Cmax < 1 ? "zero" : rC >= rT && Cmax >= 1 ? "compression" : "tension";
    return {
      name: m.name,
      group: grp,
      shape: s.name,
      length: m.length,
      byType,
      Tmax,
      Tcombo,
      Cmax,
      Ccombo,
      Pt,
      tLimit: PtR < PtY ? "rupture (D2-2)" : "yielding (D2-1)",
      Pc,
      comp,
      compError,
      ratio: Math.max(rT, rC),
      combo: mode === "compression" ? Ccombo : Tcombo,
      mode,
      slender: mode === "compression" ? Math.max(L / s.rx, Lcy / s.ry) : L / Math.min(s.rx, s.ry),
    };
  });

  // ---------------- reactions (unfactored by type; W = uplift case for the load path)
  const asd = expand(
    relevantCombinations(
      asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: false }),
      present,
    ),
  );
  const sides = [
    { name: "Left bearing", x: 0, pick: (s: Solution) => s.RyL },
    { name: "Right bearing", x: span, pick: (s: Solution) => s.RyR },
  ];
  const reactions: MemberReaction[] = sides.map((sd, i) => {
    const byType = zeroLoads();
    byType.D = sd.pick(sol.D);
    byType.Lr = sd.pick(sol.Lr);
    byType.S = Math.max(sd.pick(sol.S), sd.pick(sol.Su));
    byType.W = wWu ? sd.pick(sol.Wu) : sd.pick(sol.Wd);
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const cs of asd) {
      const v = valueOf(sd.pick, cs);
      if (v > maxDown) [maxDown, maxDownCombo] = [v, cs.label];
      if (v < minNet) [minNet, minNetCombo] = [v, cs.label];
    }
    const perFoot = zeroLoads();
    for (const tp of LOAD_TYPES) perFoot[tp] = byType[tp] / t.spacing;
    return { support: i, name: sd.name, x: sd.x, byType, perFoot, maxDown, maxDownCombo, minNet, minNetCombo };
  });
  let Rx = 0;
  for (const cs of allCases) {
    const v = valueOf((s) => s.Rx, cs);
    if (Math.abs(v) > Math.abs(Rx)) Rx = v;
  }

  // ---------------- top-chord tail (cantilever flexure, F2 / F7 / F8)
  let tail: SteelTrussResult["tail"];
  if (g.overhang > 0) {
    const tcm = mats.TC!;
    const lt = g.overhangSlope;
    try {
      const fl = flexureMajor(tcm.shape, tcm.Fy, E, lt * 12, 1);
      const Mc = available(fl.Mn, { phi: 0.9, omega: 1.67 }, t.method);
      for (const cs of allCases) {
        const f = cs.combo.factors;
        const sw = cs.s === "Su" && unbal ? Math.max(unbal.windward, unbal.leeward) * trib : wS;
        const w =
          (f.D ?? 0) * (wD + (t.selfWeight ? tcm.shape.wt / cos : 0)) +
          (f.Lr ?? 0) * wLr +
          (f.S ?? 0) * sw +
          (f.W ?? 0) * (cs.w === "Wd" ? wWd : -wWu);
        const M = (Math.abs(w) * g.overhang * g.overhang) / 2 / 1000; // kip-ft, w on horizontal projection
        if (!tail || M / Mc > tail.ratio) tail = { M, Mc, ratio: M / Mc, combo: cs.label, length: lt };
      }
    } catch (e) {
      flags.push(`Top-chord tail flexure not checked: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---------------- service deflection at the bottom-chord joints
  const lim = resolveDeflection(t.deflection);
  let defl = { node: "—", live: 0, dead: 0, total: 0 };
  for (const id of bc) {
    if (id === g.supportLeft || id === g.supportRight) continue;
    const dy = (s: Solution) => -s.disp[2 * id + 1];
    const live = Math.max(dy(sol.Lr), dy(sol.S), dy(sol.Su));
    const total = live + dy(sol.D);
    if (total > defl.total) defl = { node: g.nodes[id].name, live, dead: dy(sol.D), total };
  }
  const D = { ...defl, liveLim: (span * 12) / lim.live, totalLim: (span * 12) / lim.total };

  // ---------------- checks
  const checks: Check[] = [];
  const unit = "kip";
  for (const grp of Object.keys(STEEL_TRUSS_GROUPS) as SteelTrussGroup[]) {
    const set = rows.filter((r) => r.group === grp);
    const ten = set.filter((r) => r.Tmax >= 1);
    const cmp = set.filter((r) => r.Cmax >= 1);
    if (ten.length) {
      const r = ten.reduce((a, b) => (b.Tmax / 1000 / b.Pt > a.Tmax / 1000 / a.Pt ? b : a));
      checks.push({
        name: `${STEEL_TRUSS_GROUPS[grp]} tension ${r.name} (${r.shape}) — AISC D2, ${r.tLimit}`,
        demand: r.Tmax / 1000,
        capacity: r.Pt,
        ratio: r.Tmax / 1000 / r.Pt,
        pass: r.Tmax / 1000 <= r.Pt,
        combo: r.Tcombo,
        CD: 1,
        unit,
      });
    }
    if (cmp.length) {
      const ratioC = (r: SteelTrussRow) => (r.compError ? Infinity : r.Cmax / 1000 / r.Pc);
      const r = cmp.reduce((a, b) => (ratioC(b) > ratioC(a) ? b : a));
      checks.push({
        name: r.compError
          ? `${STEEL_TRUSS_GROUPS[grp]} compression ${r.name} (${r.shape}) — not designed: ${r.compError}`
          : `${STEEL_TRUSS_GROUPS[grp]} compression ${r.name} (${r.shape}) — AISC ${r.comp!.slender ? "E7" : "E3"}`,
        demand: r.Cmax / 1000,
        capacity: r.compError ? 0 : r.Pc,
        ratio: ratioC(r),
        pass: !r.compError && r.Cmax / 1000 <= r.Pc,
        combo: r.Ccombo,
        CD: 1,
        unit,
      });
    }
  }
  if (tail)
    checks.push({
      name: `Top-chord tail flexure (cantilever ${fmt(g.overhang, 2)} ft) — AISC Ch. F`,
      demand: tail.M,
      capacity: tail.Mc,
      ratio: tail.ratio,
      pass: tail.ratio <= 1,
      combo: tail.combo,
      CD: 1,
      unit: "kip-ft",
    });
  checks.push(
    {
      name: `Live-load deflection at ${D.node} (L/${lim.live})`,
      category: "serviceability",
      demand: D.live,
      capacity: D.liveLim,
      ratio: D.live / D.liveLim,
      pass: D.live <= D.liveLim,
      combo: "Lr / S (service)",
      CD: 1,
      unit: "in",
    },
    {
      name: `Total deflection at ${D.node}, D + live (L/${lim.total})`,
      category: "serviceability",
      demand: D.total,
      capacity: D.totalLim,
      ratio: D.total / D.totalLim,
      pass: D.total <= D.totalLim,
      combo: "D + Lr / S (service)",
      CD: 1,
      unit: "in",
    },
  );

  // ---------------- assumptions and flags
  assumptions.push(
    fromDefault(
      "Analysis",
      "First-order linear elastic pin-jointed 2D truss (direct stiffness), left bearing pinned, right on a roller; purlins / deck bear at the top-chord panel points (no chord bending between panel points)",
      "STRUTURA method",
    ),
    fromDefault(
      "Out-of-plane bracing",
      `Top chord braced at ${t.topBracing ? `${fmt(t.topBracing, 2)} ft` : "every panel point"}, bottom chord at ${t.bottomBracing ? `${fmt(t.bottomBracing, 2)} ft` : "every panel point"}; webs K = 1.0 on the member length`,
      "engineer",
      true,
    ),
    fromDefault(
      "Tension net section",
      `A_n = ${fmt(t.netArea, 2)} A_g, U = ${fmt(t.U, 2)} (AISC D3, Table D3.1) — set from the connection detail`,
      "engineer",
      true,
    ),
    fromDefault(
      "Wind",
      "Entered pressures are strength-level net vertical pressures on the horizontal projection; components normal to the roof resolved by the engineer",
      "engineer",
      true,
    ),
  );
  if (sn?.unbalanced.applies) assumptions.push(fromDefault("Unbalanced snow", sn.unbalanced.note, sn.refs.unbal));
  if (t.snow && !gable)
    flags.push(
      `${pat.label} roof: unbalanced snow for ${t.pattern === "bowstring" ? "curved roofs (ASCE 7 §7.6.2)" : "monoslope / sawtooth roofs (ASCE 7 §7.6.4 / §7.7)"} not computed — balanced snow only`,
    );
  for (const r of rows) {
    if (r.mode === "compression" && r.slender > 200)
      flags.push(`${r.name} (${r.shape}): L_c/r = ${fmt(r.slender, 0)} > 200 (AISC E2 user note)`);
    if (r.mode === "tension" && r.slender > 300)
      flags.push(`${r.name} (${r.shape}): L/r = ${fmt(r.slender, 0)} > 300 (AISC D1 user note)`);
  }
  if (wWd && wWu)
    flags.push(
      `Reactions by type carry W as the uplift case; downward wind reaction ${reactions.map((r, i) => `${r.name} ${fmt(i ? sol.Wd.RyR : sol.Wd.RyL, 0)} lb`).join(", ")} — add at the supports where it governs`,
    );
  if (reactions.some((r) => r.minNet < -1)) flags.push("Net uplift at the bearings — anchor each truss to its support");
  flags.push(
    "Joints, gusset plates, welds and bolts designed separately (AISC Ch. J / K) — connection eccentricity is not modelled",
    "Permanent bracing of the chords and webs at the spacing on this sheet, shown on the framing plan",
  );

  const callout = `${pat.label} steel truss @ ${fmt(t.spacing, 2)} ft o.c., ${fmt(t.span, 2)} ft span, ${panels} panels; TC ${t.sections.TC.shape}, BC ${t.sections.BC.shape}${(
    ["EV", "V", "D"] as const
  )
    .filter((k) => t.sections[k])
    .map((k) => `, ${STEEL_TRUSS_GROUPS[k].toLowerCase()}s ${t.sections[k]!.shape}`)
    .join("")}`;
  return {
    id: t.id,
    mark: t.mark,
    kind: "steelTruss",
    title: "Steel roof truss",
    callout,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: lines,
    assumptions,
    flags,
    input: t,
    geometry: g,
    panels,
    mats,
    thetaDeg: (theta * 180) / Math.PI,
    method: t.method,
    loads: {
      D: wD,
      Dceil: wDc,
      Lr: wLr,
      S: wS,
      Swind: unbal?.windward ?? 0,
      Slee: unbal?.leeward ?? 0,
      Wd: wWd,
      Wu: wWu,
      self,
    },
    rows,
    combosUsed: allCases.map((c) => c.label),
    factors: { tY, tR, c: PHI_C },
    tail,
    defl: D,
    Rx: Math.abs(Rx) < 0.5 ? 0 : Rx,
  };
}
