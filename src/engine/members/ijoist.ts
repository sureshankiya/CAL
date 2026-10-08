/**
 * IJ-# — prefabricated wood I-joists (TJI®) designed with the manufacturer's
 * allowable properties at 100 % load duration: moment Mr, shear Vr, end
 * reaction, bending stiffness EI and shear-deflection coefficient K.
 * Capacities are multiplied by C_D for each ASD combination. Deflection is
 * bending (EI, from the beam solver) plus shear deflection 8·(M − M_chord) / K
 * (simple span, uniform load: 12 w L² / K with w in plf and L in ft).
 * Manufacturer data must be confirmed against the current specifier's guide.
 */

import { analyseBeam, memberLength, type BeamAnalysis, type BeamLoad, type CaseResult } from "../analysis/beam";
import { asdCombinations, loadDurationFactor, relevantCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, loadVector, type LoadType } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { governingCheck, type Check } from "../design/wood";
import { tjiProps, type TjiDepth, type TjiProps, type TjiSeries } from "../data/ijoist";
import { TABLES, tableStatusText } from "../data/library";
import {
  extraToBeamLoads,
  loadAssumptions,
  resolveDead,
  resolveDeflection,
  resolveLive,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type ExtraLoad,
  type LiveRef,
  type LoadLine,
} from "./common";
import { supportName, type MemberReaction, type MemberResultBase } from "./types";

export interface IJoistInput {
  id: string;
  mark: string;
  description: string;
  series: TjiSeries;
  depth: TjiDepth;
  spacing: number;
  spans: number[];
  leftCantilever?: number;
  rightCantilever?: number;
  dead: DeadRef;
  live: LiveRef;
  extra: ExtraLoad[];
  /** bearing length at each support, in */
  bearing: number[];
  deflection: DeflectionInput;
  Kcr?: number;
  addSelfWeight?: boolean;
  cdOverride?: number;
}

export interface IJoistComboRow {
  combo: Combination;
  CD: number;
  Mpos: number;
  Mneg: number;
  V: number;
  R: number[];
}

export interface IJoistDeflection {
  segment: number;
  kind: "span" | "cantilever";
  length: number;
  limitLength: number;
  liveBending: number;
  liveShear: number;
  live: number;
  liveSource: string;
  total: number;
  totalSource: string;
  liveLimit: number;
  totalLimit: number;
}

export interface IJoistResult extends MemberResultBase {
  kind: "ijoist";
  input: IJoistInput;
  props: TjiProps;
  analysis: BeamAnalysis;
  rows: IJoistComboRow[];
  deflection: IJoistDeflection[];
  trib: number;
}

const TRANSIENT: LoadType[] = ["L", "Lr", "S"];

/** Shear deflection along the member for one analysed case, in (down +): 8 (M − M_chord) / K. */
function shearDeflection(a: BeamAnalysis, c: CaseResult, K: number): number[] {
  const nodeAt = (x: number) => {
    let best = 0;
    for (let i = 1; i < a.x.length; i++) if (Math.abs(a.x[i] - x) < Math.abs(a.x[best] - x)) best = i;
    return best;
  };
  const out = new Array(a.x.length).fill(0);
  const g = a.geometry;
  a.segments.forEach(([s, e], k) => {
    const isLeftCant = k === 0 && g.leftCantilever > 0;
    const isRightCant = k === a.segments.length - 1 && g.rightCantilever > 0;
    const Ms = c.M[nodeAt(s)];
    const Me = c.M[nodeAt(e)];
    for (let i = 0; i < a.x.length; i++) {
      const x = a.x[i];
      if (x < s - 1e-9 || x > e + 1e-9) continue;
      let chord: number;
      if (isLeftCant) chord = Me;
      else if (isRightCant) chord = Ms;
      else chord = Ms + ((Me - Ms) * (x - s)) / (e - s);
      out[i] = (8 * (c.M[i] - chord) * 12) / K;
    }
  });
  return out;
}

export function designIJoist(ctx: DesignContext, j: IJoistInput): IJoistResult {
  const p = tjiProps(j.series, j.depth);
  if (!p) throw new Error(`${j.series} is not made in ${j.depth} depth`);
  const geometry = { spans: j.spans, leftCantilever: j.leftCantilever, rightCantilever: j.rightCantilever };
  const total = memberLength(geometry);
  const trib = j.spacing / 12;
  const dead = resolveDead(ctx, j.dead);
  const live = resolveLive(ctx, j.live);
  const liveType: LoadType = live.roof ? "Lr" : "L";
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  if (dead.psf) {
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: dead.psf * trib, label: "Dead" });
    lines.push({
      type: "D",
      label: `Dead — ${dead.label}`,
      expr: `${fmt(dead.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: dead.psf * trib,
      unit: "plf",
      ref: dead.ref,
    });
  }
  if (j.addSelfWeight) {
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: p.weight, label: "Self weight" });
    lines.push({
      type: "D",
      label: "Self weight (manufacturer)",
      expr: `${fmt(p.weight, 1)} plf`,
      value: p.weight,
      unit: "plf",
    });
  }
  if (live.psf) {
    loads.push({ type: liveType, kind: "udl", x1: 0, x2: total, w1: live.psf * trib, label: live.label });
    lines.push({
      type: liveType,
      label: `${liveType === "L" ? "Live" : "Roof live"} — ${live.label}`,
      expr: `${fmt(live.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: live.psf * trib,
      unit: "plf",
      ref: live.ref,
      verify: live.override,
    });
  }
  const ex = extraToBeamLoads(j.extra, total);
  loads.push(...ex.loads);
  lines.push(...ex.lines);

  const a = analyseBeam(geometry, p.EI, loads);
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (loads.some((l) => l.type === t)) present[t] = true;
  const combos = relevantCombinations(
    asdCombinations({ includeWind: !!present.W, includeSeismic: !!present.E, SDS: ctx.SDS }),
    present,
  );

  const env = (t: LoadType, field: "M" | "VL" | "VR") => {
    const pats = a.patterns[t];
    const full = a.byType[t][field];
    if (!pats) return { max: [...full], min: [...full] };
    const max = full.map(() => 0);
    const min = full.map(() => 0);
    for (const c of pats)
      c[field].forEach((v, i) => {
        if (v > 0) max[i] += v;
        else min[i] += v;
      });
    return { max, min };
  };
  const M = Object.fromEntries(LOAD_TYPES.map((t) => [t, env(t, "M")])) as Record<
    LoadType,
    { max: number[]; min: number[] }
  >;
  const VL = Object.fromEntries(LOAD_TYPES.map((t) => [t, env(t, "VL")])) as Record<
    LoadType,
    { max: number[]; min: number[] }
  >;
  const VR = Object.fromEntries(LOAD_TYPES.map((t) => [t, env(t, "VR")])) as Record<
    LoadType,
    { max: number[]; min: number[] }
  >;
  const reactionEnv = (t: LoadType, i: number, sign: 1 | -1) => {
    const pats = a.patterns[t];
    if (!pats) return a.byType[t].R[i];
    return pats.reduce((s, c) => s + (sign > 0 ? Math.max(0, c.R[i]) : Math.min(0, c.R[i])), 0);
  };
  const n = a.x.length;
  const rows: IJoistComboRow[] = combos.map((c) => {
    const CD = j.cdOverride ?? loadDurationFactor(c, present);
    let Mpos = 0;
    let Mneg = 0;
    let V = 0;
    for (let i = 0; i < n; i++) {
      let mx = 0;
      let mn = 0;
      let vmax = 0;
      let vmin = 0;
      for (const t of LOAD_TYPES) {
        const f = c.factors[t] ?? 0;
        if (!f) continue;
        mx += f * M[t].max[i];
        mn += f * M[t].min[i];
        vmax += f * Math.max(VL[t].max[i], VR[t].max[i]);
        vmin += f * Math.min(VL[t].min[i], VR[t].min[i]);
      }
      Mpos = Math.max(Mpos, mx);
      Mneg = Math.min(Mneg, mn);
      V = Math.max(V, Math.abs(vmax), Math.abs(vmin));
    }
    const R = a.supports.map((_, i) => LOAD_TYPES.reduce((s, t) => s + (c.factors[t] ?? 0) * reactionEnv(t, i, 1), 0));
    return { combo: c, CD, Mpos, Mneg, V, R };
  });

  const checks: Check[] = [];
  const gov = (f: (r: IJoistComboRow) => number) => rows.reduce((x, r) => (f(r) > f(x) ? r : x), rows[0]);
  const gm = gov((r) => r.Mpos / (p.Mr * r.CD));
  checks.push({
    name: "Moment, positive (Mr × C_D)",
    demand: gm.Mpos,
    capacity: p.Mr * gm.CD,
    ratio: gm.Mpos / (p.Mr * gm.CD),
    pass: gm.Mpos <= p.Mr * gm.CD,
    combo: gm.combo.label,
    CD: gm.CD,
    unit: "lb-ft",
  });
  if (rows.some((r) => r.Mneg < -1e-6)) {
    const gn = gov((r) => -r.Mneg / (p.Mr * r.CD));
    checks.push({
      name: "Moment, negative (Mr × C_D)",
      demand: -gn.Mneg,
      capacity: p.Mr * gn.CD,
      ratio: -gn.Mneg / (p.Mr * gn.CD),
      pass: -gn.Mneg <= p.Mr * gn.CD,
      combo: gn.combo.label,
      CD: gn.CD,
      unit: "lb-ft",
    });
  }
  const gv = gov((r) => r.V / (p.Vr * r.CD));
  checks.push({
    name: "Shear (Vr × C_D)",
    demand: gv.V,
    capacity: p.Vr * gv.CD,
    ratio: gv.V / (p.Vr * gv.CD),
    pass: gv.V <= p.Vr * gv.CD,
    combo: gv.combo.label,
    CD: gv.CD,
    unit: "lb",
  });
  a.supports.forEach((xs, i) => {
    const end =
      i === 0
        ? (j.leftCantilever ?? 0) <= 0.25
        : i === a.supports.length - 1
          ? (j.rightCantilever ?? 0) <= 0.25
          : false;
    const gr = gov((r) => r.R[i] / (p.Rend * r.CD));
    const cap = p.Rend * gr.CD;
    checks.push({
      name: `Reaction at support ${supportName(i)} (${end ? "end" : "intermediate"}, R × C_D)`,
      demand: gr.R[i],
      capacity: cap,
      ratio: gr.R[i] / cap,
      pass: gr.R[i] <= cap,
      combo: gr.combo.label,
      CD: gr.CD,
      unit: "lb",
    });
    const lb = j.bearing[i] ?? j.bearing[j.bearing.length - 1] ?? 1.75;
    const need = end ? 1.75 : 3.5;
    checks.push({
      name: `Bearing length at support ${supportName(i)} (minimum ${need} in.)`,
      category: "detailing",
      demand: need,
      capacity: lb,
      ratio: need / lb,
      pass: lb >= need,
      combo: "—",
      CD: 1,
      unit: "in",
    });
  });

  // deflection: bending + shear, transient part of each gravity combination, total = K_cr·D + transient
  const Kcr = j.Kcr ?? ctx.Kcr;
  const lim = resolveDeflection(j.deflection);
  const caseDefl = (c: CaseResult) => {
    const s = shearDeflection(a, c, p.K);
    return { bend: c.defl, shear: s };
  };
  const typeDefl = (t: LoadType) => {
    const pats = a.patterns[t];
    const cases = pats ?? [a.byType[t]];
    const bendMax = new Array(n).fill(0);
    const bendMin = new Array(n).fill(0);
    const shMax = new Array(n).fill(0);
    const shMin = new Array(n).fill(0);
    for (const c of cases) {
      const d = caseDefl(c);
      for (let i = 0; i < n; i++) {
        const tot = d.bend[i] + d.shear[i];
        if (!pats) {
          bendMax[i] = bendMin[i] = d.bend[i];
          shMax[i] = shMin[i] = d.shear[i];
        } else if (tot > 0) {
          bendMax[i] += d.bend[i];
          shMax[i] += d.shear[i];
        } else {
          bendMin[i] += d.bend[i];
          shMin[i] += d.shear[i];
        }
      }
    }
    return { bendMax, bendMin, shMax, shMin };
  };
  const dD = typeDefl("D");
  const dT = Object.fromEntries(TRANSIENT.map((t) => [t, typeDefl(t)])) as Record<
    LoadType,
    ReturnType<typeof typeDefl>
  >;
  const sets: Array<{ label: string; f: Partial<Record<LoadType, number>> }> = [];
  for (const c of combos) {
    const f: Partial<Record<LoadType, number>> = {};
    for (const t of TRANSIENT) if (present[t] && (c.factors[t] ?? 0) !== 0) f[t] = c.factors[t];
    if (!Object.keys(f).length) continue;
    const label = TRANSIENT.filter((t) => f[t])
      .map((t) => `${f[t] === 1 ? "" : String(f[t])}${t}`)
      .join(" + ");
    if (!sets.some((s) => s.label === label)) sets.push({ label, f });
  }
  if (!sets.length) sets.push({ label: "—", f: {} });
  const deflection: IJoistDeflection[] = a.segments.map(([s, e], k) => {
    const cant =
      (k === 0 && (j.leftCantilever ?? 0) > 0) || (k === a.segments.length - 1 && (j.rightCantilever ?? 0) > 0);
    const len = e - s;
    const limitLength = cant ? 2 * len : len;
    let best = { live: 0, bend: 0, shear: 0, label: "—", total: 0, totalLabel: "D" };
    for (const set of sets) {
      for (let i = 0; i < n; i++) {
        const x = a.x[i];
        if (x < s - 1e-9 || x > e + 1e-9) continue;
        let bend = 0;
        let shear = 0;
        let bendUp = 0;
        let shearUp = 0;
        for (const t of TRANSIENT) {
          const f = set.f[t] ?? 0;
          if (!f) continue;
          bend += f * dT[t].bendMax[i];
          shear += f * dT[t].shMax[i];
          bendUp += f * dT[t].bendMin[i];
          shearUp += f * dT[t].shMin[i];
        }
        const liveDown = bend + shear;
        const liveUp = bendUp + shearUp;
        const live = Math.max(Math.abs(liveDown), Math.abs(liveUp));
        const dead = dD.bendMax[i] + dD.shMax[i];
        const tot = Math.max(Math.abs(Kcr * dead + liveDown), Math.abs(Kcr * dead + liveUp));
        if (live > best.live)
          best = {
            ...best,
            live,
            bend: Math.abs(liveDown) >= Math.abs(liveUp) ? bend : bendUp,
            shear: Math.abs(liveDown) >= Math.abs(liveUp) ? shear : shearUp,
            label: set.label,
          };
        if (tot > best.total) best = { ...best, total: tot, totalLabel: set.label === "—" ? "D" : set.label };
      }
    }
    return {
      segment: k,
      kind: cant ? "cantilever" : "span",
      length: len,
      limitLength,
      liveBending: best.bend,
      liveShear: best.shear,
      live: best.live,
      liveSource: best.label,
      total: best.total,
      totalSource: `${fmt(Kcr, 2)}D${best.totalLabel === "D" ? "" : ` + ${best.totalLabel}`}`,
      liveLimit: (limitLength * 12) / lim.live,
      totalLimit: (limitLength * 12) / lim.total,
    };
  });
  for (const d of deflection) {
    const nm = d.kind === "cantilever" ? "cantilever" : `span ${d.segment + 1 - ((j.leftCantilever ?? 0) > 0 ? 1 : 0)}`;
    checks.push({
      name: `Deflection, live (${nm})`,
      demand: d.live,
      capacity: d.liveLimit,
      ratio: d.live / d.liveLimit,
      pass: d.live <= d.liveLimit,
      combo: d.liveSource,
      CD: 1,
      unit: "in",
    });
    checks.push({
      name: `Deflection, total (${nm})`,
      demand: d.total,
      capacity: d.totalLimit,
      ratio: d.total / d.totalLimit,
      pass: d.total <= d.totalLimit,
      combo: d.totalSource,
      CD: 1,
      unit: "in",
    });
  }

  const reactions: MemberReaction[] = a.supports.map((xs, i) => {
    const byType = loadVector(Object.fromEntries(LOAD_TYPES.map((t) => [t, reactionEnv(t, i, 1)])));
    const perFoot = loadVector(Object.fromEntries(LOAD_TYPES.map((t) => [t, (byType[t] * 12) / j.spacing])));
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of combos) {
      const up = LOAD_TYPES.reduce((s, t) => s + (c.factors[t] ?? 0) * reactionEnv(t, i, 1), 0);
      const lo = LOAD_TYPES.reduce((s, t) => s + (c.factors[t] ?? 0) * reactionEnv(t, i, -1), 0);
      if (up > maxDown) {
        maxDown = up;
        maxDownCombo = c.label;
      }
      if (lo < minNet) {
        minNet = lo;
        minNetCombo = c.label;
      }
    }
    return { support: i, name: supportName(i), x: xs, byType, perFoot, maxDown, maxDownCombo, minNet, minNetCombo };
  });

  const assumptions: AssumptionEntry[] = [
    ...loadAssumptions(dead, live),
    fromDefault(
      "I-joist properties",
      `${j.series} ${j.depth}: ${tableStatusText("tji-4000")}`,
      "manufacturer",
      TABLES["tji-4000"].status !== "verified",
    ),
    fromDefault(
      "Load duration",
      j.cdOverride ? `C_D = ${fmt(j.cdOverride, 2)} (manual)` : "C_D per combination applied to Mr, Vr and reaction",
      "NDS Table 2.3.2",
    ),
    fromDefault("Long-term deflection", `K_cr = ${fmt(Kcr, 2)}`, "NDS 3.5.2"),
  ];
  const flags = [
    "Web stiffeners, blocking panels, rim board and hole locations per manufacturer",
    ...(a.supports.length > 2
      ? [
          "Intermediate reaction checked against the end-reaction value (conservative) — confirm with the manufacturer's intermediate bearing value",
        ]
      : []),
  ];
  const governing = governingCheck(checks);
  return {
    id: j.id,
    mark: j.mark,
    kind: "ijoist",
    title: "I-joist",
    callout: `${j.depth} ${j.series} @ ${fmt(j.spacing, j.spacing % 1 ? 1 : 0)} in. o.c.`,
    pass: checks.every((c) => c.pass),
    governing,
    checks,
    reactions,
    loadLines: lines,
    assumptions,
    flags,
    input: j,
    props: p,
    analysis: a,
    rows,
    deflection,
    trib,
  };
}
