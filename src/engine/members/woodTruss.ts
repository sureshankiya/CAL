/**
 * T-# — wood roof truss designed in HouseCalc (port of TrussCalc, Roof Truss Planner).
 *
 * Geometry and the pin-jointed solver are TrussCalc's (src/engine/analysis/trussGeometry.ts,
 * trussSolver.ts); HouseCalc adds n-panel parallel-chord trusses. Changes from TrussCalc:
 *  - loads by type (D, attic L, Lr, S balanced and unbalanced, W uplift) analysed separately and
 *    combined per ASCE 7 §2.4 with C_D per combination (TrussCalc: one D + L case, one C_D)
 *  - reference design values, size factors and specific gravity from the HouseCalc data library
 *    (NDS Supplement Table 4A); repetitive-member factor C_r on chord bending (NDS 4.3.9)
 *  - nailed and bolted joints by the NDS 12.3 yield limit equations (TrussCalc scaled tabulated
 *    values by G^1.5); metal-plate joints use the entered plate value (manufacturer ESR, VERIFY)
 *
 * Checks (NDS, ASD): tension 3.8 on the net section; compression 3.7 with C_P (le/d both axes,
 * chords braced out of plane by sheathing / ceiling, webs by the bracing entered); top chord
 * axial + panel bending 3.9.2; bottom chord tension + bending 3.9.1; heel bearing 3.10.2 with C_b;
 * eave tail bending; deflection by virtual work (live, and live + K_cr dead); joints.
 */

import { asdCombinations, combine, loadDurationFactor, relevantCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import {
  buildParallelChord,
  buildTruss,
  type MemberGroup,
  type TrussGeometry,
  type TrussType,
} from "../analysis/trussGeometry";
import { jointDeflection, solveTruss, unitLoadCase, type NodalLoad } from "../analysis/trussSolver";
import { SPECIFIC_GRAVITY, type Grade, type Species } from "../data/sawn";
import { dowelBearingAngle, dowelYieldDouble, nailDef, nailSingleShear } from "../design/dowel";
import {
  bearingAreaFactor,
  columnStabilityFactor,
  governingCheck,
  resolveWood,
  type Check,
  type ResolvedWood,
} from "../design/wood";
import {
  ndsOf,
  resolveDead,
  resolveDeflection,
  resolveRoofLive,
  resolveSnow,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type LoadLine,
} from "./common";
import type { MemberReaction, MemberResultBase } from "./types";

export interface TrussLumber {
  species: Species;
  grade: Grade;
  size: string;
}

export interface WoodTrussInput {
  id: string;
  mark: string;
  description: string;
  type: Exclude<TrussType, "custom">;
  span: number;
  /** pitched trusses: rise per 12 */
  pitch: number;
  /** parallel chord: depth (ft), panels, web pattern */
  depth?: number;
  panels?: number;
  pattern?: "warren" | "pratt";
  overhang: number;
  spacing: number;
  bearingLen: number;
  tc: TrussLumber;
  bc: TrussLumber;
  web: TrussLumber;
  webBracing: "none" | "midpoint";
  roofDead: DeadRef;
  ceilingDead: DeadRef;
  /** attic storage live load on the bottom chord, psf */
  atticLive: number;
  roofLive: boolean;
  snow: boolean;
  /** net wind uplift on the horizontal projection, psf, strength level (upward positive) */
  windUplift: number;
  netSection: number;
  joint:
    | { type: "plate"; value: number; zone: number; source: string }
    | { type: "nailed"; nail: string; gusset: number }
    | { type: "bolted"; D: number; gusset: number };
  deflection: DeflectionInput;
}

export interface TrussMemberRow {
  name: string;
  group: MemberGroup;
  size: string;
  length: number;
  byType: LoadVector;
  /** unbalanced-snow member force (left windward), lb */
  Sunbal: number;
  Tmax: number;
  Tcombo: string;
  Cmax: number;
  Ccombo: string;
  le: number;
  leWeak: number;
  slender: number;
  ratio: number;
  combo: string;
  CD: number;
  mode: "tension" | "compression" | "zero";
  f: number;
  Fprime: number;
  CP: number;
  FcE: number;
}

export interface WoodTrussResult extends MemberResultBase {
  kind: "woodTruss";
  input: WoodTrussInput;
  geometry: TrussGeometry;
  mats: Record<"TC" | "BC" | "WEB", ResolvedWood>;
  thetaDeg: number;
  loads: {
    D: number;
    Dceil: number;
    Lr: number;
    S: number;
    Sbal: number;
    Swind: number;
    Slee: number;
    L: number;
    W: number;
    self: number;
    Lrtext: string;
    Stext: string;
  };
  rows: TrussMemberRow[];
  combosUsed: string[];
  tcCombined: {
    member: string;
    combo: string;
    CD: number;
    fc: number;
    Fc: number;
    fb: number;
    Fb: number;
    FcE: number;
    M: number;
    w: number;
    panel: number;
    ratio: number;
  };
  bcCombined: {
    member: string;
    combo: string;
    CD: number;
    ft: number;
    Ft: number;
    fb: number;
    Fb: number;
    M: number;
    w: number;
    panel: number;
    ratio: number;
  };
  bearing: { R: number; combo: string; Cb: number; A: number; fcperp: number; Fprime: number; ratio: number };
  tail?: { M: number; fb: number; Fb: number; ratio: number; combo: string };
  defl: { node: string; live: number; dead: number; total: number; liveLim: number; totalLim: number; Kcr: number };
  joints: Array<{
    node: string;
    member: string;
    F: number;
    combo: string;
    required: number;
    available: number;
    ratio: number;
    unit: string;
  }>;
  jointText: string;
}

const groupKey = (g: MemberGroup): "TC" | "BC" | "WEB" => (g === "TC" ? "TC" : g === "BC" ? "BC" : "WEB");

/** Equivalent nodal loads from a line load q(x) (plf, horizontal) on a chord's nodes (tributary halves). */
function nodal(g: TrussGeometry, ids: number[], q: (x: number) => number, out: NodalLoad[], sign = -1) {
  const xs = ids.map((id) => g.nodes[id].x);
  ids.forEach((id, i) => {
    let F = 0;
    if (i > 0) F += q((xs[i - 1] + 3 * xs[i]) / 4) * ((xs[i] - xs[i - 1]) / 2);
    if (i < ids.length - 1) F += q((3 * xs[i] + xs[i + 1]) / 4) * ((xs[i + 1] - xs[i]) / 2);
    out[id].fy += sign * F;
  });
}

export function designWoodTruss(ctx: DesignContext, t: WoodTrussInput): WoodTrussResult {
  const nds = ndsOf(ctx);
  const parallel = t.type === "parallel";
  const g = parallel
    ? buildParallelChord(t.span, t.depth ?? 2.5, t.panels ?? 8, t.pattern ?? "warren", t.overhang)
    : buildTruss(t.type, t.span, t.pitch, t.overhang);
  const mat = (l: TrussLumber) =>
    resolveWood({ kind: "sawn", species: l.species, grade: l.grade, size: l.size, plies: 1 }, nds);
  const mats = { TC: mat(t.tc), BC: mat(t.bc), WEB: mat(t.web) };
  const matOf = (gr: MemberGroup) => mats[groupKey(gr)];
  const theta = parallel ? 0 : Math.atan2(g.rise, t.span / 2);
  const cos = Math.cos(theta);
  const rise = parallel ? 0 : t.pitch;
  const trib = t.spacing / 12;
  const lines: LoadLine[] = [];
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];

  // ---------------- area loads → plf of horizontal projection
  const rd = resolveDead(ctx, t.roofDead, "sloped");
  const roofD = rd.basis === "sloped" ? rd.psf / cos : rd.psf;
  const cd = resolveDead(ctx, t.ceilingDead, "horizontal");
  const At = t.span * trib;
  const lr = t.roofLive ? resolveRoofLive(ctx, At, rise) : undefined;
  const sn = t.snow ? resolveSnow(ctx, rise, t.span / 2, !parallel) : undefined;
  const wD = roofD * trib;
  const wDc = cd.psf * trib;
  const wLr = (lr?.psf ?? 0) * trib;
  const wS = (sn?.balanced ?? 0) * trib;
  const unbal = sn?.unbalanced.applies ? sn.unbalanced : undefined;
  const wL = t.atticLive * trib;
  const wW = t.windUplift * trib;
  lines.push({
    type: "D",
    label: `Roof dead — ${rd.label}`,
    expr: `${fmt(rd.psf, 2)} psf${rd.basis === "sloped" ? ` / cos θ = ${fmt(roofD, 2)} psf` : ""} × ${fmt(trib, 3)} ft`,
    value: wD,
    unit: "plf",
  });
  if (wDc)
    lines.push({
      type: "D",
      label: `Ceiling dead — ${cd.label}`,
      expr: `${fmt(cd.psf, 2)} psf × ${fmt(trib, 3)} ft (bottom chord)`,
      value: wDc,
      unit: "plf",
    });
  if (wL)
    lines.push({
      type: "L",
      label: "Attic storage live load (bottom chord)",
      expr: `${fmt(t.atticLive, 1)} psf × ${fmt(trib, 3)} ft`,
      value: wL,
      unit: "plf",
    });
  if (lr)
    lines.push({
      type: "Lr",
      label: "Roof live load",
      expr: `${lr.expr} × ${fmt(trib, 3)} ft`,
      value: wLr,
      unit: "plf",
      ref: lr.ref,
    });
  if (sn) {
    lines.push({
      type: "S",
      label: "Snow, balanced",
      expr: `${fmt(sn.balanced, 2)} psf × ${fmt(trib, 3)} ft`,
      value: wS,
      unit: "plf",
      ref: sn.refs.ps,
    });
    if (unbal)
      lines.push({
        type: "S",
        label: "Snow, unbalanced (leeward / windward)",
        expr: `${fmt(unbal.leeward, 2)} / ${fmt(unbal.windward, 2)} psf × ${fmt(trib, 3)} ft`,
        value: unbal.leeward * trib,
        unit: "plf",
        ref: sn.refs.unbal,
      });
  }
  if (wW)
    lines.push({
      type: "W",
      label: "Net wind uplift (strength), upward",
      expr: `${fmt(t.windUplift, 2)} psf × ${fmt(trib, 3)} ft`,
      value: -wW,
      unit: "plf",
    });

  // ---------------- nodal load cases
  const blank = (): NodalLoad[] => g.nodes.map(() => ({ fx: 0, fy: 0 }));
  const tcIds = g.topChordNodes;
  const bcIds = g.bottomChordNodes;
  const cases: Record<LoadType | "Su", NodalLoad[]> = {
    D: blank(),
    L: blank(),
    Lr: blank(),
    S: blank(),
    W: blank(),
    E: blank(),
    Su: blank(),
  };
  nodal(g, tcIds, () => wD, cases.D);
  nodal(g, bcIds, () => wDc, cases.D);
  nodal(g, bcIds, () => wL, cases.L);
  nodal(g, tcIds, () => wLr, cases.Lr);
  nodal(g, tcIds, () => wS, cases.S);
  if (unbal) nodal(g, tcIds, (x) => (x < t.span / 2 ? unbal.windward : unbal.leeward) * trib, cases.Su);
  nodal(g, tcIds, () => wW, cases.W, +1);
  let self = 0;
  for (const m of g.members) {
    const w = matOf(m.group).selfWeight * m.length;
    self += w;
    cases.D[m.a].fy -= w / 2;
    cases.D[m.b].fy -= w / 2;
  }
  const ohSlope = g.overhangSlope;
  if (g.overhang > 0) {
    const tailSelf = mats.TC.selfWeight * ohSlope;
    self += 2 * tailSelf;
    const ends = parallel ? [tcIds[0], tcIds[tcIds.length - 1]] : [g.supportLeft, g.supportRight];
    for (const id of ends) {
      cases.D[id].fy -= wD * g.overhang + tailSelf;
      cases.Lr[id].fy -= wLr * g.overhang;
      cases.S[id].fy -= wS * g.overhang;
      cases.W[id].fy += wW * g.overhang;
    }
    if (unbal) {
      cases.Su[ends[0]].fy -= unbal.windward * trib * g.overhang;
      cases.Su[ends[1]].fy -= unbal.leeward * trib * g.overhang;
    }
  }
  lines.push({
    type: "D",
    label: "Truss self weight",
    expr: `members ${t.tc.size} / ${t.bc.size} / ${t.web.size}`,
    value: self,
    unit: "lb",
  });
  const sol = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, solveTruss(g, v)])) as Record<
    LoadType | "Su",
    ReturnType<typeof solveTruss>
  >;

  // ---------------- combinations (balanced snow and unbalanced snow cases)
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  if (wL) present.L = true;
  if (wLr) present.Lr = true;
  if (wS) present.S = true;
  if (wW) present.W = true;
  const base = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!wW, includeSeismic: false }),
    present,
  );
  type Case = { combo: Combination; unbal: boolean; label: string; CD: number };
  const allCases: Case[] = [];
  for (const c of base) {
    const CD = loadDurationFactor(c, present);
    allCases.push({ combo: c, unbal: false, label: c.label, CD });
    if (unbal && c.factors.S) allCases.push({ combo: c, unbal: true, label: `${c.label} (unbalanced S)`, CD });
  }
  const forceOf = (k: number, cs: Case) => {
    let F = 0;
    for (const tp of LOAD_TYPES) {
      const f = cs.combo.factors[tp] ?? 0;
      if (!f) continue;
      F += f * (tp === "S" && cs.unbal ? sol.Su.forces[k] : sol[tp].forces[k]);
    }
    return F;
  };
  const wTop = (cs: Case, x: number) => {
    const f = cs.combo.factors;
    const s = cs.unbal && unbal ? (x < t.span / 2 ? unbal.windward : unbal.leeward) * trib : wS;
    return (f.D ?? 0) * wD + (f.Lr ?? 0) * wLr + (f.S ?? 0) * s - (f.W ?? 0) * wW;
  };
  const CM = 1;

  // ---------------- member axial checks
  const rows: TrussMemberRow[] = g.members.map((m, k) => {
    const M = matOf(m.group);
    const size = groupKey(m.group) === "TC" ? t.tc.size : groupKey(m.group) === "BC" ? t.bc.size : t.web.size;
    const le = m.length * 12;
    const leWeak = m.group === "WEB" || m.group === "EV" ? (t.webBracing === "midpoint" ? le / 2 : le) : 0;
    const slender = Math.max(le / M.d, leWeak / M.bPly);
    const byType = zeroLoads();
    for (const tp of LOAD_TYPES) byType[tp] = sol[tp].forces[k];
    let best = { ratio: 0, combo: "—", CD: 1, mode: "zero" as TrussMemberRow["mode"], f: 0, Fprime: 0, CP: 1, FcE: 0 };
    let Tmax = 0;
    let Tcombo = "—";
    let Cmax = 0;
    let Ccombo = "—";
    for (const cs of allCases) {
      const F = forceOf(k, cs);
      if (F > Tmax) [Tmax, Tcombo] = [F, cs.label];
      if (-F > Cmax) [Cmax, Ccombo] = [-F, cs.label];
      if (Math.abs(F) < 1e-6) continue;
      if (F > 0) {
        const f = F / (M.A * t.netSection);
        const Fp = M.Ft * cs.CD * M.CFt * CM;
        const r = f / Fp;
        if (r > best.ratio)
          best = { ratio: r, combo: cs.label, CD: cs.CD, mode: "tension", f, Fprime: Fp, CP: 1, FcE: 0 };
      } else {
        const f = -F / M.A;
        const Fs = M.Fc * cs.CD * M.CFc * CM;
        const FcE = (0.822 * M.Emin) / (slender * slender);
        const CP = columnStabilityFactor(FcE, Fs, 0.8);
        const Fp = Fs * CP;
        const r = f / Fp;
        if (r > best.ratio)
          best = { ratio: r, combo: cs.label, CD: cs.CD, mode: "compression", f, Fprime: Fp, CP, FcE };
      }
    }
    return {
      name: m.name,
      group: m.group,
      size,
      length: m.length,
      byType,
      Sunbal: sol.Su.forces[k],
      Tmax,
      Tcombo,
      Cmax,
      Ccombo,
      le,
      leWeak,
      slender,
      ...best,
    };
  });

  // ---------------- top chord: axial + panel bending (NDS 3.9.2)
  const Cr = t.spacing <= 24 ? 1.15 : 1;
  let tcC: WoodTrussResult["tcCombined"] | undefined;
  g.members.forEach((m, k) => {
    if (m.group !== "TC") return;
    const M = mats.TC;
    const xm = (g.nodes[m.a].x + g.nodes[m.b].x) / 2;
    const l = m.length; // ft along the chord
    for (const cs of allCases) {
      const F = forceOf(k, cs);
      const w = wTop(cs, xm) * cos * cos + (cs.combo.factors.D ?? 0) * M.selfWeight * cos;
      const Mom = (Math.abs(w) * l * l) / 8;
      const fb = (Mom * 12) / M.S;
      const Fb = M.Fb * cs.CD * M.CF * Cr * CM;
      const fc = Math.max(0, -F) / M.A;
      const ft = Math.max(0, F) / (M.A * t.netSection);
      const Fs = M.Fc * cs.CD * M.CFc;
      const FcE1 = (0.822 * M.Emin) / ((l * 12) / M.d) ** 2;
      const Fc = Fs * columnStabilityFactor(FcE1, Fs, 0.8);
      const ratio =
        fc > 0 ? (fc / Fc) ** 2 + fb / (Fb * Math.max(1e-6, 1 - fc / FcE1)) : ft / (M.Ft * cs.CD * M.CFt) + fb / Fb;
      if (!tcC || ratio > tcC.ratio)
        tcC = {
          member: m.name,
          combo: cs.label,
          CD: cs.CD,
          fc: fc || ft,
          Fc,
          fb,
          Fb,
          FcE: FcE1,
          M: Mom,
          w,
          panel: l,
          ratio,
        };
    }
  });
  // ---------------- bottom chord: tension + bending (NDS 3.9.1)
  let bcC: WoodTrussResult["bcCombined"] | undefined;
  g.members.forEach((m, k) => {
    if (m.group !== "BC") return;
    const M = mats.BC;
    const l = m.length;
    for (const cs of allCases) {
      const F = forceOf(k, cs);
      const w = (cs.combo.factors.D ?? 0) * (wDc + M.selfWeight) + (cs.combo.factors.L ?? 0) * wL;
      const Mom = (w * l * l) / 8;
      const fb = (Mom * 12) / M.S;
      const Fb = M.Fb * cs.CD * M.CF * Cr;
      const ft = Math.max(0, F) / (M.A * t.netSection);
      const Ft = M.Ft * cs.CD * M.CFt;
      const fc = Math.max(0, -F) / M.A;
      const Fc =
        M.Fc *
        cs.CD *
        M.CFc *
        columnStabilityFactor((0.822 * M.Emin) / ((l * 12) / M.d) ** 2, M.Fc * cs.CD * M.CFc, 0.8);
      const ratio = fc > 0 ? (fc / Fc) ** 2 + fb / Fb : Math.max(ft / Ft + fb / Fb, (fb - ft) / Fb);
      if (!bcC || ratio > bcC.ratio)
        bcC = {
          member: m.name,
          combo: cs.label,
          CD: cs.CD,
          ft: ft || fc,
          Ft: ft > 0 ? Ft : Fc,
          fb,
          Fb,
          M: Mom,
          w,
          panel: l,
          ratio,
        };
    }
  });

  // ---------------- reactions and heel bearing
  const sides = [
    { name: "Left heel", id: g.supportLeft, x: 0, key: "reactionLeftY" as const },
    { name: "Right heel", id: g.supportRight, x: t.span, key: "reactionRightY" as const },
  ];
  const reactions: MemberReaction[] = sides.map((s, i) => {
    const byType = zeroLoads();
    for (const tp of LOAD_TYPES) byType[tp] = sol[tp][s.key];
    byType.S = Math.max(sol.S[s.key], sol.Su[s.key]);
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of base) {
      const v = combine(byType, c);
      if (v > maxDown) [maxDown, maxDownCombo] = [v, c.label];
      if (v < minNet) [minNet, minNetCombo] = [v, c.label];
    }
    const perFoot = zeroLoads();
    for (const tp of LOAD_TYPES) perFoot[tp] = (byType[tp] * 12) / t.spacing;
    return { support: i, name: s.name, x: s.x, byType, perFoot, maxDown, maxDownCombo, minNet, minNetCombo };
  });
  const Rgov = reactions.reduce((a, b) => (b.maxDown > a.maxDown ? b : a));
  const Cb = bearingAreaFactor(t.bearingLen, false);
  const Abrg = t.bearingLen * mats.BC.bPly;
  const fcperp = Rgov.maxDown / Abrg;
  const FcpP = mats.BC.Fcperp * Cb;
  const bearing = {
    R: Rgov.maxDown,
    combo: Rgov.maxDownCombo,
    Cb,
    A: Abrg,
    fcperp,
    Fprime: FcpP,
    ratio: fcperp / FcpP,
  };

  // ---------------- eave tail
  let tail: WoodTrussResult["tail"];
  if (g.overhang > 0) {
    for (const cs of allCases) {
      const w = wTop(cs, 0) * cos * cos + (cs.combo.factors.D ?? 0) * mats.TC.selfWeight * cos;
      const Mom = (Math.abs(w) * ohSlope * ohSlope) / 2;
      const fb = (Mom * 12) / mats.TC.S;
      const Fb = mats.TC.Fb * cs.CD * mats.TC.CF * Cr;
      if (!tail || fb / Fb > tail.ratio) tail = { M: Mom, fb, Fb, ratio: fb / Fb, combo: cs.label };
    }
  }

  // ---------------- deflection (virtual work)
  const EA = g.members.map((m) => matOf(m.group).A * matOf(m.group).E * CM);
  const lim = resolveDeflection(t.deflection);
  let defl = { node: "—", live: 0, dead: 0, total: 0 };
  for (const id of bcIds) {
    if (id === g.supportLeft || id === g.supportRight) continue;
    const u = unitLoadCase(g, id);
    const dd = jointDeflection(g, sol.D.forces, u, EA);
    const dLive =
      Math.max(
        jointDeflection(g, sol.Lr.forces, u, EA),
        jointDeflection(g, sol.S.forces, u, EA),
        jointDeflection(g, sol.Su.forces, u, EA),
      ) + jointDeflection(g, sol.L.forces, u, EA);
    const tot = dLive + ctx.Kcr * dd;
    if (tot > defl.total) defl = { node: g.nodes[id].name, live: dLive, dead: dd, total: tot };
  }
  const spanIn = t.span * 12;
  const D = { ...defl, liveLim: spanIn / lim.live, totalLim: spanIn / lim.total, Kcr: ctx.Kcr };

  // ---------------- joints
  const joints: WoodTrussResult["joints"] = [];
  let jointText: string;
  const Gm = (gr: MemberGroup) => SPECIFIC_GRAVITY[(gr === "TC" ? t.tc : gr === "BC" ? t.bc : t.web).species];
  if (t.joint.type === "plate")
    jointText = `Metal connector plates both faces, design value ${fmt(t.joint.value, 0)} psi of contact area per plate (${t.joint.source}); joint zone ${fmt(t.joint.zone, 1)} in. along each member`;
  else if (t.joint.type === "nailed")
    jointText = `Nailed ${fmt(t.joint.gusset, 3)} in. gussets both faces, ${nailDef(t.joint.nail).label}, NDS 12.3 single shear × C_D`;
  else
    jointText = `${fmt(t.joint.D, 3)} in. bolts, double shear through ${fmt(t.joint.gusset, 2)} in. wood gussets, NDS 12.3 double shear × C_D`;
  for (const n of g.nodes) {
    g.members.forEach((m, k) => {
      if (m.a !== n.id && m.b !== n.id) return;
      const M = matOf(m.group);
      let worst = { ratio: 0, F: 0, combo: "—", required: 0, available: 0, unit: "" };
      for (const cs of allCases) {
        const F = Math.abs(forceOf(k, cs));
        if (F < 1) continue;
        let required: number;
        let available: number;
        let unit: string;
        if (t.joint.type === "plate") {
          required = F / (2 * t.joint.value);
          available = t.joint.zone * M.d;
          unit = "in² per plate";
        } else if (t.joint.type === "nailed") {
          const nail = nailDef(t.joint.nail);
          const z = nailSingleShear({ nail, ts: t.joint.gusset, tm: M.bPly, Gs: 0.5, Gm: Gm(m.group) });
          required = Math.ceil(F / (2 * z.Z * cs.CD));
          const D0 = nail.D;
          available =
            Math.max(1, Math.floor((M.d - 5 * D0) / (5 * D0)) + 1) *
            Math.max(1, Math.floor((12 - 15 * D0) / (15 * D0)) + 1);
          unit = "nails per face";
        } else {
          const Dd = t.joint.D;
          const Fe = dowelBearingAngle(Gm(m.group), Dd, 0).Fpar;
          const z = dowelYieldDouble({
            D: Dd,
            Fyb: 45000,
            ls: t.joint.gusset,
            Fes: dowelBearingAngle(0.5, Dd, 0).Fpar,
            lm: M.bPly,
            Fem: Fe,
            thetaDeg: 0,
          });
          required = Math.ceil(F / (z.Z * cs.CD));
          available =
            Math.max(1, Math.floor((M.d - 3 * Dd) / (1.5 * Dd)) + 1) *
            Math.max(1, Math.floor((12 - 7 * Dd) / (4 * Dd)) + 1);
          unit = "bolts";
        }
        const ratio = required / available;
        if (ratio > worst.ratio) worst = { ratio, F, combo: cs.label, required, available, unit };
      }
      if (worst.F > 0) joints.push({ node: n.name, member: m.name, ...worst });
    });
  }

  // ---------------- checks
  const checks: Check[] = [];
  const byGroup = (gr: MemberGroup[], mode: "tension" | "compression") => {
    const set = rows.filter((r) => gr.includes(r.group) && r.mode === mode);
    return set.length ? set.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined;
  };
  const addAxial = (label: string, r: TrussMemberRow | undefined, ref: string) => {
    if (!r) return;
    checks.push({
      name: `${label} ${r.name} (${r.size}) — ${ref}`,
      demand: r.f,
      capacity: r.Fprime,
      ratio: r.ratio,
      pass: r.ratio <= 1,
      combo: r.combo,
      CD: r.CD,
      unit: "psi",
    });
  };
  addAxial("Top chord compression", byGroup(["TC"], "compression"), "NDS 3.7");
  addAxial("Top chord tension (reversal)", byGroup(["TC"], "tension"), "NDS 3.8");
  addAxial("Bottom chord tension", byGroup(["BC"], "tension"), "NDS 3.8");
  addAxial("Bottom chord compression (reversal)", byGroup(["BC"], "compression"), "NDS 3.7");
  addAxial("Web compression", byGroup(["WEB", "EV"], "compression"), "NDS 3.7");
  addAxial("Web tension", byGroup(["WEB", "EV"], "tension"), "NDS 3.8");
  const maxSl = Math.max(...rows.filter((r) => r.mode === "compression").map((r) => r.slender), 0);
  checks.push({
    name: "Slenderness l_e / d ≤ 50 (NDS 3.7.1.4)",
    category: "detailing",
    demand: maxSl,
    capacity: 50,
    ratio: maxSl / 50,
    pass: maxSl <= 50,
    combo: "—",
    CD: 1,
    unit: "",
  });
  if (tcC)
    checks.push({
      name: `Top chord axial + panel bending ${tcC.member} (NDS 3.9.2)`,
      demand: tcC.ratio,
      capacity: 1,
      ratio: tcC.ratio,
      pass: tcC.ratio <= 1,
      combo: tcC.combo,
      CD: tcC.CD,
      unit: "",
    });
  if (bcC)
    checks.push({
      name: `Bottom chord axial + bending ${bcC.member} (NDS 3.9.1)`,
      demand: bcC.ratio,
      capacity: 1,
      ratio: bcC.ratio,
      pass: bcC.ratio <= 1,
      combo: bcC.combo,
      CD: bcC.CD,
      unit: "",
    });
  checks.push({
    name: "Heel bearing, bottom chord (NDS 3.10.2, C_b 3.10.4)",
    demand: fcperp,
    capacity: FcpP,
    ratio: bearing.ratio,
    pass: bearing.ratio <= 1,
    combo: bearing.combo,
    CD: 1,
    unit: "psi",
  });
  if (tail)
    checks.push({
      name: "Eave tail bending (cantilever)",
      demand: tail.fb,
      capacity: tail.Fb,
      ratio: tail.ratio,
      pass: tail.ratio <= 1,
      combo: tail.combo,
      CD: 1,
      unit: "psi",
    });
  checks.push(
    {
      name: `Live-load deflection at ${D.node} (L/${lim.live})`,
      category: "serviceability",
      demand: D.live,
      capacity: D.liveLim,
      ratio: D.live / D.liveLim,
      pass: D.live <= D.liveLim,
      combo: "Lr / S / L",
      CD: 1,
      unit: "in",
    },
    {
      name: `Total deflection at ${D.node}, live + K_cr dead (L/${lim.total})`,
      category: "serviceability",
      demand: D.total,
      capacity: D.totalLim,
      ratio: D.total / D.totalLim,
      pass: D.total <= D.totalLim,
      combo: "D + Lr / S / L",
      CD: 1,
      unit: "in",
    },
  );
  const jg = joints.length ? joints.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined;
  if (jg)
    checks.push({
      name: `Joint ${jg.node}, member ${jg.member}: ${t.joint.type === "plate" ? "plate contact area" : "fasteners"} required / available`,
      demand: jg.required,
      capacity: jg.available,
      ratio: jg.ratio,
      pass: jg.ratio <= 1,
      combo: jg.combo,
      CD: 1,
      unit: jg.unit,
    });

  assumptions.push(
    fromDefault(
      "Analysis",
      "Pin-jointed truss, loads at panel points (tributary halves); chords checked for panel bending as simple spans (conservative)",
      "TrussCalc method",
    ),
    fromDefault(
      "Lateral bracing",
      `Top chord braced by roof sheathing, bottom chord by the ceiling; webs ${t.webBracing === "midpoint" ? "braced at mid-length (continuous lateral restraint)" : "unbraced out of plane"}`,
      "engineer",
    ),
    fromDefault(
      "Net section",
      `A_n = ${fmt(t.netSection, 2)} A_g for tension at joints`,
      t.joint.type === "plate" ? "plate teeth (convention)" : "engineer",
      true,
    ),
  );
  if (t.joint.type === "plate") {
    assumptions.push(
      fromDefault(
        "Plate value",
        `${fmt(t.joint.value, 0)} psi of contact area per plate`,
        t.joint.source || "truss plate manufacturer",
        true,
      ),
    );
    flags.push(
      "Metal-plate joints: final plate sizes by the truss plate manufacturer per TPI 1 (this check is preliminary)",
    );
  }
  if (sn?.unbalanced.applies) assumptions.push(fromDefault("Unbalanced snow", sn.unbalanced.note, sn.refs.unbal));
  if (reactions.some((r) => r.minNet < -1))
    flags.push("Net uplift at the heels — tie each truss to the wall (connector check by CN-#)");
  if (!wW) flags.push("No wind uplift entered — enter the net uplift pressure to check reversal and heel ties");

  const typeLabel = parallel
    ? `${t.panels ?? 8}-panel parallel-chord (${t.pattern ?? "warren"})`
    : t.type === "king-queen"
      ? "king + queen post"
      : t.type;
  return {
    id: t.id,
    mark: t.mark,
    kind: "woodTruss",
    title: "Wood roof truss (designed)",
    callout: `${typeLabel} truss @ ${fmt(t.spacing, 0)} in. o.c., ${fmt(t.span, 2)} ft span; TC ${t.tc.size}, BC ${t.bc.size}, webs ${t.web.size} ${t.web.species} ${t.web.grade}`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: lines,
    assumptions,
    flags,
    input: t,
    geometry: g,
    mats,
    thetaDeg: (theta * 180) / Math.PI,
    loads: {
      D: wD,
      Dceil: wDc,
      Lr: wLr,
      S: wS,
      Sbal: sn?.balanced ?? 0,
      Swind: unbal?.windward ?? 0,
      Slee: unbal?.leeward ?? 0,
      L: wL,
      W: wW,
      self,
      Lrtext: lr?.expr ?? "",
      Stext: sn ? `p_s = ${fmt(sn.ps, 2)} psf` : "",
    },
    rows,
    combosUsed: allCases.map((c) => c.label),
    tcCombined: tcC!,
    bcCombined: bcC!,
    bearing,
    tail,
    defl: D,
    joints,
    jointText,
  };
}
