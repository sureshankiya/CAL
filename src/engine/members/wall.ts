/**
 * W-# — wood stud bearing walls (StudCalc port, corrected).
 *
 * Loads along the wall come from tributary areas, walls above, entered line /
 * point loads and load-path links (repetitive members as line loads, beams and
 * headers as point loads). The wall is split into segments of constant line
 * load; the typical stud in each segment carries w × s. Point loads are carried
 * by stud packs at their positions; king studs at openings carry wind from half
 * the opening width.
 *
 * Checks (NDS, ASD, every ASCE 7 §2.4 combination with its C_D):
 *  - stud axial compression with C_P (strong axis l_e = stud length; weak axis braced by
 *    sheathing, else by blocking), NDS 3.6 / 3.7
 *  - combined axial + out-of-plane C&C wind bending, NDS Eq. 3.9-3
 *  - stud bearing on the plates, NDS 3.10.2, C_b with l_b = stud thickness (3.10.4)
 *  - out-of-plane wind deflection, 0.42 × C&C (IBC Table 1604.3 note f), with P-Δ amplification
 *  - net uplift at the stud (0.6D + 0.6W) reported for the tie-down
 * Reactions delivered: distributed base load per foot (to continuous footings) and
 * stud-pack point loads (to pads or footings).
 */

import { asdCombinations, combine, relevantCombinations, type Combination } from "../core/combos";
import { fmt, fmtFtIn } from "../core/fmt";
import { LOAD_TYPES, addLoads, loadVector, scaleLoads, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { designColumn, type ColumnResult } from "../design/column";
import { firstPassing, maxPassingSpacing } from "../design/sizing";
import { bearingAreaFactor, governingCheck, resolveWood, type Check, type ResolvedWood } from "../design/wood";
import type { Grade, Species } from "../data/sawn";
import { wallCCPressure } from "../loads/wind";
import {
  extraToBeamLoads,
  ndsOf,
  resolveDead,
  type DeadRef,
  type DesignContext,
  type ExtraLoad,
  type LoadLine,
} from "./common";
import { areaWallLoads, type AreaLoad, type WallAbove } from "./distributed";
import type { MemberReaction, MemberResultBase } from "./types";

export interface StudPack {
  x: number;
  studs: number;
  label?: string;
}

export interface WallOpening {
  label: string;
  x1: number;
  x2: number;
  kings: number;
}

export interface WallWind {
  mode: "none" | "computed" | "entered";
  /** entered strength-level C&C pressure, psf */
  psf?: number;
  zone?: 4 | 5;
}

export interface WallInput {
  id: string;
  mark: string;
  description: string;
  species: Species;
  grade: Grade;
  size: string;
  spacing: number;
  /** floor to top of top plates, ft */
  plateHeight: number;
  topPlates: number;
  bottomPlates: number;
  /** wall length, ft */
  length: number;
  sheathing: "both" | "one" | "none";
  /** weak-axis blocking interval when unsheathed, ft (0 = none) */
  blocking?: number;
  /** wall self weight (wall assembly, psf of wall area) */
  self: DeadRef;
  area: AreaLoad[];
  walls: WallAbove[];
  extra: ExtraLoad[];
  wind: WallWind;
  /** wind deflection limit h / n */
  deflN: number;
  packs: StudPack[];
  openings: WallOpening[];
  wetService?: boolean;
  incised?: boolean;
}

export interface WallSegment {
  x1: number;
  x2: number;
  /** line load by type, plf (excluding wall self weight) */
  w: LoadVector;
}

export interface StudCheck {
  label: string;
  /** studs in the pack (1 = typical stud) */
  n: number;
  x?: number;
  P: LoadVector;
  /** lateral wind on the member, plf (strength level, signed by type W) */
  windPlf: number;
  col: ColumnResult;
  bearing: { P: number; combo: string; lb: number; Cb: number; fcperp: number; Fprime: number; ratio: number };
  uplift: { T: number; combo: string };
  mat: ResolvedWood;
}

export interface WallResult extends MemberResultBase {
  kind: "wall";
  input: WallInput;
  studLength: number;
  le1: number;
  le2: number;
  selfPsf: number;
  selfLabel: string;
  wind?: {
    p: number;
    source: string;
    A: number;
    zone: 4 | 5;
    GCp?: { pos: number; neg: number };
  };
  segments: WallSegment[];
  typical: StudCheck;
  packs: StudCheck[];
  kings: StudCheck[];
  deflection: {
    w: number;
    delta0: number;
    P: number;
    Pcr: number;
    amp: number;
    delta: number;
    limit: number;
    ratio: number;
  };
  combos: Combination[];
  /** distributed base load per foot, by type, envelope over segments */
  basePerFoot: LoadVector;
}

const WIND_FACTOR_FOR_DEFLECTION = 0.42;

function present(v: LoadVector, wind: boolean): Partial<Record<LoadType, boolean>> {
  const out: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(v[t]) > 1e-9) out[t] = true;
  if (wind) out.W = true;
  return out;
}

/** Piecewise-constant line load along the wall from uniform line loads. */
function segmentsOf(loads: ReturnType<typeof extraToBeamLoads>["loads"], length: number): WallSegment[] {
  const xs = new Set<number>([0, length]);
  for (const l of loads)
    if (l.kind !== "point") [l.x1 ?? 0, l.x2 ?? length].forEach((x) => xs.add(Math.min(Math.max(x, 0), length)));
  const pts = [...xs].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);
  const segs: WallSegment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const mid = (pts[i - 1] + pts[i]) / 2;
    const w = zeroLoads();
    for (const l of loads) {
      if (l.kind === "point") continue;
      if (mid >= (l.x1 ?? 0) && mid <= (l.x2 ?? length)) w[l.type] += l.w1 ?? 0;
    }
    segs.push({ x1: pts[i - 1], x2: pts[i], w });
  }
  // merge equal neighbours
  const out: WallSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && LOAD_TYPES.every((t) => Math.abs(prev.w[t] - s.w[t]) < 1e-6)) prev.x2 = s.x2;
    else out.push({ ...s, w: { ...s.w } });
  }
  return out;
}

const totalOf = (v: LoadVector) => v.D + v.L + Math.max(v.Lr, v.S);

function evaluate(ctx: DesignContext, wl: WallInput, size = wl.size, spacing = wl.spacing) {
  const nds = ndsOf(ctx);
  const s = spacing / 12;
  const studLength = wl.plateHeight - (1.5 * (wl.topPlates + wl.bottomPlates)) / 12;
  if (!(studLength > 0)) throw new Error("Stud length must be positive — check plate height and plates");
  const lIn = studLength * 12;
  const mat = resolveWood({ kind: "sawn", species: wl.species, grade: wl.grade, size, plies: 1 }, nds);
  const le1 = lIn;
  const le2 = wl.sheathing === "none" ? (wl.blocking && wl.blocking > 0 ? wl.blocking * 12 : lIn) : 0;

  // loads along the wall
  const dist = areaWallLoads(ctx, wl.area, wl.walls, wl.length);
  const ex = extraToBeamLoads(wl.extra, wl.length);
  const allLoads = [...dist.loads, ...ex.loads];
  const lines: LoadLine[] = [...dist.lines, ...ex.lines];
  const self = resolveDead(ctx, wl.self);
  const selfPlf = self.psf * wl.plateHeight;
  lines.push({
    type: "D",
    label: `Wall self weight — ${self.label}`,
    expr: `${fmt(self.psf, 2)} psf × ${fmt(wl.plateHeight, 2)} ft`,
    value: selfPlf,
    unit: "plf",
    ref: self.ref,
  });
  const segments = segmentsOf(allLoads, wl.length);
  const points = allLoads.filter((l) => l.kind === "point");

  // wind
  let wind: WallResult["wind"];
  let pWind = 0;
  const zone = wl.wind.zone ?? 4;
  const A = studLength * Math.max(s, studLength / 3);
  if (wl.wind.mode === "entered") {
    pWind = wl.wind.psf ?? 0;
    wind = { p: pWind, source: "Entered C&C pressure (strength level)", A, zone };
  } else if (wl.wind.mode === "computed") {
    if (!ctx.windCC) throw new Error("Wind C&C pressure requested but site wind is not set up (lateral criteria)");
    const cc = wallCCPressure(ctx.windCC.qEff, A, zone, ctx.windCC.thetaDeg);
    pWind = cc.p;
    wind = {
      p: pWind,
      source: `ASCE 7 Fig. 30.3-1 zone ${zone}, A = ${fmt(A, 1)} ft², qh = ${fmt(ctx.windCC.qEff, 2)} psf`,
      A,
      zone,
      GCp: { pos: cc.pos, neg: cc.neg },
    };
  }
  const hasWind = pWind > 0;

  const selfVec = loadVector({ D: selfPlf });
  const envelope = zeroLoads();
  // envelope over the segments: largest downward load, most negative wind (uplift)
  for (const sg of segments)
    for (const t of LOAD_TYPES)
      envelope[t] = t === "W" ? Math.min(envelope[t], sg.w[t]) : Math.max(envelope[t], sg.w[t]);
  const basePerFoot = addLoads(envelope, selfVec);

  const allPresent = present(
    addLoads(
      basePerFoot,
      points.reduce((a, p) => addLoads(a, loadVector({ [p.type]: p.P ?? 0 })), zeroLoads()),
    ),
    hasWind,
  );
  const combos = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!allPresent.W, includeSeismic: false }),
    allPresent,
  );

  const cond = { wetService: !!wl.wetService, incised: !!wl.incised, repetitive: spacing <= 24 };
  const windVec = (trib: number) => loadVector({ W: pWind * trib });

  const studCheck = (
    label: string,
    n: number,
    P: LoadVector,
    windTrib: number,
    atEnd: boolean,
    x?: number,
  ): StudCheck => {
    const m = n === 1 ? mat : resolveWood({ kind: "sawn", species: wl.species, grade: wl.grade, size, plies: n }, nds);
    const col = designColumn({
      mat: m,
      cond,
      length: lIn,
      le1,
      le2,
      builtUp: n > 1 ? "nailed" : undefined,
      P,
      w: hasWind ? windVec(windTrib) : undefined,
      lu: 0,
      combos,
      present: allPresent,
    });
    // bearing on the plate: largest compression over the combinations
    let Pb = 0;
    let comboB = "";
    let T = 0;
    let comboT = "";
    for (const c of combos) {
      const v = combine(P, c);
      if (v > Pb) {
        Pb = v;
        comboB = c.label;
      }
      if (-v > T) {
        T = -v;
        comboT = c.label;
      }
    }
    const lb = m.b;
    const Cb = bearingAreaFactor(lb, atEnd);
    const fcperp = Pb / (m.b * m.d);
    const Fprime = m.Fcperp * col.CM.Fcperp * col.Ct * Cb;
    return {
      label,
      n,
      x,
      P,
      windPlf: pWind * windTrib,
      col,
      bearing: { P: Pb, combo: comboB, lb, Cb, fcperp, Fprime, ratio: fcperp / Fprime },
      uplift: { T, combo: comboT },
      mat: m,
    };
  };

  // typical stud: governing segment
  const studLoad = (w: LoadVector) => scaleLoads(addLoads(w, selfVec), s);
  let typical: StudCheck | undefined;
  const worst = (c: StudCheck) => Math.max(c.col.governing.ratio, c.bearing.ratio);
  for (const sg of segments) {
    const c = studCheck(
      segments.length > 1 ? `Typical stud, ${fmt(sg.x1, 2)}–${fmt(sg.x2, 2)} ft` : "Typical stud",
      1,
      studLoad(sg.w),
      s,
      false,
    );
    if (!typical || worst(c) > worst(typical)) typical = c;
  }
  if (!typical) throw new Error("Wall has no length");

  // stud packs under point loads
  const segAt = (x: number) => segments.find((g) => x >= g.x1 - 1e-9 && x <= g.x2 + 1e-9) ?? segments[0];
  const assigned = new Map<number, LoadVector>();
  const unassigned: string[] = [];
  for (const p of points) {
    let best = -1;
    let dist = Infinity;
    wl.packs.forEach((k, i) => {
      const d = Math.abs(k.x - (p.x ?? 0));
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best < 0 || dist > 1.0 + 1e-9) {
      unassigned.push(`${p.label ?? "point load"} at ${fmt(p.x ?? 0, 2)} ft`);
      continue;
    }
    const v = assigned.get(best) ?? zeroLoads();
    v[p.type] += p.P ?? 0;
    assigned.set(best, v);
  }
  if (unassigned.length) throw new Error(`Point load(s) without a stud pack within 1 ft: ${unassigned.join("; ")}`);
  const packs = wl.packs.map((k, i) => {
    const Ppt = assigned.get(i) ?? zeroLoads();
    const atEnd = k.x <= 0.25 || k.x >= wl.length - 0.25;
    return {
      check: studCheck(
        k.label || `Stud pack at ${fmtFtIn(k.x)}`,
        k.studs,
        addLoads(Ppt, studLoad(segAt(k.x).w)),
        s,
        atEnd,
        k.x,
      ),
      point: Ppt,
    };
  });

  // king studs at openings: wind from half the opening plus half a stud space
  const kings = wl.openings.map((o) => {
    const trib = (o.x2 - o.x1) / 2 + s / 2;
    return studCheck(
      `King studs, ${o.label}`,
      Math.max(1, o.kings),
      scaleLoads(addLoads(segAt(o.x1).w, selfVec), s / 2),
      trib,
      false,
      o.x1,
    );
  });

  // out-of-plane deflection of the typical stud (service wind with P-Δ)
  const E = typical.col.Eprime;
  const I = mat.I;
  const wServ = WIND_FACTOR_FOR_DEFLECTION * pWind * s; // plf
  const delta0 = (5 * (wServ / 12) * lIn ** 4) / (384 * E * I);
  const Pt = typical.P;
  const Pserv = Pt.D + 0.75 * Pt.L + 0.75 * Math.max(Pt.Lr, Pt.S);
  const Pcr = (Math.PI ** 2 * E * I) / (le1 * le1);
  const amp = Pserv < Pcr ? 1 / (1 - Pserv / Pcr) : Infinity;
  const delta = delta0 * amp;
  const limit = lIn / wl.deflN;

  return {
    nds,
    studLength,
    le1,
    le2,
    mat,
    self,
    selfPlf,
    lines,
    segments,
    typical,
    packs,
    kings,
    wind,
    combos,
    basePerFoot,
    deflection: { w: wServ, delta0, P: Pserv, Pcr, amp, delta, limit, ratio: delta / limit },
    hasWind,
  };
}

type Evaluated = ReturnType<typeof evaluate>;

function checksOf(ev: Evaluated): Check[] {
  const checks: Check[] = [];
  const add = (sc: StudCheck, name: string) => {
    const g = sc.col.governing;
    const a = sc.col.axialGov;
    checks.push({
      name: `${name} — axial compression (NDS 3.6, 3.7)`,
      demand: a.fc,
      capacity: a.FcPrime,
      ratio: a.axial,
      pass: a.axial <= 1,
      combo: a.combo.label,
      CD: a.CD,
      unit: "psi",
    });
    if (g.fb > 0 || g.ft > 0)
      checks.push({
        name: `${name} — combined axial and bending (NDS 3.9)`,
        demand: g.interaction,
        capacity: 1,
        ratio: g.interaction,
        pass: g.interaction <= 1,
        combo: g.combo.label,
        CD: g.CD,
        unit: "",
      });
    checks.push({
      name: `${name} — bearing on plate (NDS 3.10.2)`,
      demand: sc.bearing.fcperp,
      capacity: sc.bearing.Fprime,
      ratio: sc.bearing.ratio,
      pass: sc.bearing.ratio <= 1,
      combo: sc.bearing.combo,
      CD: 1,
      unit: "psi",
    });
  };
  add(ev.typical, "Typical stud");
  checks.push({
    name: "Stud slenderness l_e/d (NDS 3.7.1.4)",
    category: "detailing",
    demand: Math.max(ev.typical.col.le1d1, ev.typical.col.le2d2),
    capacity: 50,
    ratio: Math.max(ev.typical.col.le1d1, ev.typical.col.le2d2) / 50,
    pass: Math.max(ev.typical.col.le1d1, ev.typical.col.le2d2) <= 50,
    combo: "—",
    CD: 1,
    unit: "",
  });
  ev.packs.forEach((p) => add(p.check, p.check.label));
  ev.kings.forEach((k) => add(k, k.label));
  if (ev.hasWind)
    checks.push({
      name: "Out-of-plane wind deflection (IBC Table 1604.3)",
      category: "serviceability",
      demand: ev.deflection.delta,
      capacity: ev.deflection.limit,
      ratio: ev.deflection.ratio,
      pass: ev.deflection.ratio <= 1,
      combo: "0.42 × C&C",
      CD: 1,
      unit: "in",
    });
  return checks;
}

export function designWall(ctx: DesignContext, wl: WallInput): WallResult {
  const ev = evaluate(ctx, wl);
  const checks = checksOf(ev);
  const pass = checks.every((c) => c.pass);
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [];
  if (wl.sheathing === "none")
    flags.push(
      `Studs not sheathed: weak-axis buckling over ${wl.blocking ? `${fmt(wl.blocking, 2)} ft (blocking)` : "the full stud length"}`,
    );
  else
    assumptions.push(
      fromDefault(
        "Weak-axis bracing",
        `Studs braced about the weak axis by ${wl.sheathing === "both" ? "sheathing both faces" : "sheathing one face"}, fastened per CBC Table 2304.10.2`,
        "NDS 3.7.1",
      ),
    );
  assumptions.push(
    fromDefault(
      "Plate bearing",
      `Plates of the same species and grade as the studs; C_b with l_b = stud thickness (${fmt(ev.mat.b, 2)} in.) at interior bearing`,
      "NDS 3.10.4",
    ),
  );
  if (ev.hasWind)
    assumptions.push(
      fromDefault(
        "Wind deflection load",
        "0.42 × strength-level C&C pressure for the deflection check",
        "IBC Table 1604.3 note f",
      ),
    );
  if (ev.typical.uplift.T > 1)
    flags.push(
      `Net uplift ${fmt(ev.typical.uplift.T, 0)} lb per stud (${ev.typical.uplift.combo}) — tie studs to plates; see connector schedule`,
    );
  if (wl.packs.some((k) => k.studs > 1))
    flags.push(
      "Built-up stud packs: plies nailed together per NDS 15.3.3; full-height packs bearing on solid blocking / squash blocks to the foundation",
    );
  for (const o of wl.openings)
    flags.push(
      `${o.label}: header bears on jack studs; header and jack-stud loads carried as point loads to stud packs`,
    );

  let alternatives: WallResult["alternatives"];
  if (!pass) {
    const run = (size: string, spacing = wl.spacing) => {
      const e = evaluate(ctx, wl, size, spacing);
      const c = checksOf(e);
      return { pass: c.every((k) => k.pass), governing: governingCheck(c) };
    };
    const sizes = ["2x4", "2x6", "2x8"].filter((x) => x !== wl.size);
    const lightest = firstPassing(sizes, (x) => run(x)).chosen?.candidate;
    const maxSpacing = maxPassingSpacing((sp) => run(wl.size, sp), [12, 16, 24]);
    alternatives = { lightest, maxSpacing };
  }

  // reactions: distributed base load and stud-pack point loads
  const comboMinMax = (v: LoadVector) => {
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of ev.combos) {
      const x = combine(v, c);
      if (x > maxDown) {
        maxDown = x;
        maxDownCombo = c.label;
      }
      if (x < minNet) {
        minNet = x;
        minNetCombo = c.label;
      }
    }
    return { maxDown, maxDownCombo, minNet, minNetCombo };
  };
  const baseTotal = zeroLoads();
  for (const sg of ev.segments) for (const t of LOAD_TYPES) baseTotal[t] += sg.w[t] * (sg.x2 - sg.x1);
  baseTotal.D += ev.selfPlf * wl.length;
  const perFoot = ev.basePerFoot;
  const reactions: MemberReaction[] = [
    {
      support: 0,
      name: "Base (line)",
      x: 0,
      byType: baseTotal,
      perFoot,
      ...comboMinMax(perFoot),
    },
    ...ev.packs.map((p, i) => ({
      support: i + 1,
      name: p.check.label,
      x: p.check.x ?? 0,
      byType: p.point,
      ...comboMinMax(p.point),
    })),
  ];
  const typ = `${wl.size} ${wl.species} ${wl.grade} @ ${fmt(wl.spacing, wl.spacing % 1 ? 1 : 0)} in. o.c.`;
  return {
    id: wl.id,
    mark: wl.mark,
    kind: "wall",
    title: "Stud bearing wall",
    callout: `${typ}, ${fmtFtIn(ev.studLength)} studs`,
    pass,
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: ev.lines,
    assumptions,
    flags,
    alternatives,
    input: wl,
    studLength: ev.studLength,
    le1: ev.le1,
    le2: ev.le2,
    selfPsf: ev.self.psf,
    selfLabel: ev.self.label,
    wind: ev.wind,
    segments: ev.segments,
    typical: ev.typical,
    packs: ev.packs.map((p) => p.check),
    kings: ev.kings,
    deflection: ev.deflection,
    combos: ev.combos,
    basePerFoot: ev.basePerFoot,
  };
}

export const wallTotalPerFoot = (r: WallResult) => totalOf(r.basePerFoot);
