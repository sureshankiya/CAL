/**
 * SW-# — segmented wood shear walls (SDPWS-2021 §4.3, NDS-ASD), one full-height
 * segment per wall, with demand taken from the lateral analysis (the wall's
 * share of its wall line) — never entered directly (plan §2B Q1).
 *
 * Checks:
 *  - unit shear vs v_s / 2.0 (seismic) and v_w / 2.0 (wind), aspect-ratio factor
 *    1.25 − 0.125 h/b_s for WSP walls with h/b_s > 2 (SDPWS 4.3.4.2); two-sided walls:
 *    same material added, dissimilar materials max(2 × smaller, larger) (4.3.3.2)
 *  - aspect ratio limit (Table 4.3.4)
 *  - chord forces: overturning T and C for every ASCE 7 §2.4 lateral combination;
 *    end-post tension (NDS 3.8, net area) and compression with C_P (NDS 3.7)
 *  - hold-down device (catalogue allowable tension) incl. uplift from a wall stacked above
 *  - hold-down anchor in concrete, strength level (ACI 318-19 Ch. 17), seismic Ω0 option
 *  - sill anchor bolts: NDS 12.3 bolt in the sill, ACI 318 breakout parallel to the edge
 *  - FTAO walls (one opening, SDPWS 4.3.5.2, rational analysis by the Diekmann method):
 *    pier unit shear v_p = V / (L1 + L2); hold-down H = V h / L; unit shear above and below the
 *    opening v_ab = H / (h_a + h_b); strap force at the opening corners F = (v_p − v) L_i;
 *    pier aspect h_o / L_i ≤ 3.5 and L_i ≥ 2 ft; aspect factor on the piers
 *  - seismic drift: SDPWS Eq. 4.3-1 δ_sw at strength level, δ_x = C_d δ_xe / I_e (ASCE 7
 *    Eq. 12.8-15) vs Δ_a (Table 12.12-1); wind deflection at a service factor
 */

import { asdCombinations, type Combination } from "../core/combos";
import { fmt, fmtFtIn } from "../core/fmt";
import { loadVector, type LoadVector } from "../core/loads";
import { fromDefault, fromOverride, type AssumptionEntry } from "../core/provenance";
import {
  ANCHOR_STEELS,
  anchorShearParallel,
  anchorTension,
  boltInConcrete,
  type ConcreteTension,
} from "../design/anchors";
import { designColumn, type ColumnResult } from "../design/column";
import { governingCheck, resolveWood, type Check, type ResolvedWood } from "../design/wood";
import { aspectFactor, panel1532Shear, sideValues, type SheathingRow } from "../data/sdpws";
import { type HardwareItem } from "../data/hardware";
import type { Grade, Species } from "../data/sawn";
import { SPECIFIC_GRAVITY } from "../data/sawn";
import { ndsOf, resolveDead, type DeadRef, type DesignContext, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface ShearWallSide {
  key: string;
  /** panel edge nail spacing, in */
  spacing: number;
  /** 3/8 or 7/16 in. panels: use the 15/32 in. shear values (SDPWS Table 4.3A footnote; studs ≤ 16 in. o.c. or panels across studs) */
  panel1532?: boolean;
  /** nominal values entered over the table (override, flagged) */
  vsOverride?: number;
  GaOverride?: number;
}

export interface SillAnchor {
  type: "cast-in" | "post-installed";
  d: number;
  /** spacing, in */
  spacing: number;
  /** embedment, in */
  embed: number;
  /** edge distance to the concrete edge (perpendicular to the wall), in */
  edge: number;
  /** post-installed anchors: allowable shear per anchor (ASD, from the ESR), lb */
  allowShear?: number;
  label?: string;
}

export interface HoldownAnchor {
  d: number;
  steel: string;
  hef: number;
  edges: [number, number, number, number];
  /** square bearing plate side, in (A_brg = side² − hole) */
  plate: number;
  cracked: boolean;
  omega: boolean;
}

export interface ShearWallInput {
  id: string;
  mark: string;
  description: string;
  lineId: string;
  /** segment length b_s, ft */
  b: number;
  /** wall height (plate height), ft */
  h: number;
  sides: ShearWallSide[];
  stud: { species: Species; grade: Grade; size: string; spacing: number };
  endPost: { size: string; plies: number; holeDia: number };
  /** gravity on top of the wall, plf, by type (entered or from links) */
  top: { D: number; L: number; Lr: number; S: number };
  self: DeadRef;
  overturning: "full" | "endpost";
  holdownId?: string;
  upliftFrom?: string;
  sill: SillAnchor;
  sillSize: string;
  holdownAnchor?: HoldownAnchor;
  /** vertical anchor stiffness k_a, lb/in, when no hold-down device is selected */
  ka?: number;
  windService: { factor: number; limitN: number };
  /** force transfer around one opening (FTAO): pier lengths and opening, ft; strap from the hardware list */
  opening?: { L1: number; Lo: number; L2: number; ha: number; hb: number; strapId?: string };
}

export interface FtaoResult {
  L1: number;
  L2: number;
  Lo: number;
  ho: number;
  ha: number;
  hb: number;
  pierAspect: number;
  v: { s: number; w: number };
  vp: { s: number; w: number };
  H: { s: number; w: number };
  vab: { s: number; w: number };
  F: { s: number; w: number };
  strap?: { item: HardwareItem; F: number; ratio: number };
}

export interface ShearWallDemand {
  lineName: string;
  /** wall share of the line force */
  share: number;
  /** strength-level forces on this wall, lb: Eh = ρ Q_E, Q_E, W */
  Eh: number;
  QE: number;
  W: number;
  rho: number;
  SDS: number;
  Cd: number;
  Ie: number;
  Omega0: number;
  /** story height for Δa, ft */
  hsx: number;
  driftFactor: number;
  seismicSDC: string;
  /** stacked uplift from the wall above, ASD by lateral type */
  stacked?: { mark: string; Ts: number; Tw: number; Tu: number };
}

export interface ChordRow {
  combo: string;
  kind: "seismic" | "wind";
  V: number;
  wG: number;
  T: number;
  C: number;
}

export interface ShearWallResult extends MemberResultBase {
  kind: "shearWall";
  input: ShearWallInput;
  demand: ShearWallDemand;
  sides: Array<{ row: SheathingRow; vs: number; vw: number; Ga: number; spacing: number; override: boolean }>;
  vsc: number;
  vwc: number;
  /** wind: WSP + gypsum wallboard on opposite faces combined additively (SDPWS 4.3.3.2.1 exception) */
  windSum: boolean;
  Gac: number;
  aspect: number;
  maxAspect: number;
  Car: number;
  vAllowS: number;
  vAllowW: number;
  vS: number;
  vW: number;
  selfPlf: number;
  arm: number;
  chord: ChordRow[];
  Tmax: { seismic: number; wind: number };
  post: ResolvedWood;
  Aen: number;
  tension: { T: number; ft: number; Ft: number; ratio: number; combo: string };
  compression: { C: number; col: ColumnResult; combo: string };
  holdown?: { item: HardwareItem; T: number; ratio: number };
  hdAnchor?: { Tu: number; basis: string; t: ConcreteTension; ratio: number };
  sill: {
    perBolt: number;
    Z?: number;
    Zprime: number;
    mode?: string;
    ratio: number;
    concrete?: { Vu: number; phiVn: number; ratio: number; governs: string };
  };
  drift: {
    v: number;
    Td: number;
    da: number;
    ka: number;
    bend: number;
    shear: number;
    slip: number;
    dxe: number;
    dx: number;
    allow: number;
    ratio: number;
  };
  windDefl: { v: number; d: number; allow: number; ratio: number };
  ftao?: FtaoResult;
}

/**
 * Two-sided walls (SDPWS 4.3.3.2): same construction both faces — additive; dissimilar —
 * the greater of twice the smaller and the larger. Exception (wind): wood structural panels
 * (Table 4.3A) on one face and gypsum wallboard on the other are additive.
 */
function combineSides(sides: Array<{ row: SheathingRow; vs: number; vw: number; Ga: number }>) {
  if (sides.length === 1) return { vsc: sides[0].vs, vwc: sides[0].vw, Gac: sides[0].Ga, windSum: false };
  const [a, b] = sides;
  const same = a.row.key === b.row.key && a.vs === b.vs;
  if (same) return { vsc: a.vs + b.vs, vwc: a.vw + b.vw, Gac: a.Ga + b.Ga, windSum: false };
  const wspGwb = (x: SheathingRow, y: SheathingRow) => x.table === "4.3A" && y.key.startsWith("GWB");
  const windSum = wspGwb(a.row, b.row) || wspGwb(b.row, a.row);
  return {
    vsc: Math.max(2 * Math.min(a.vs, b.vs), a.vs, b.vs),
    vwc: windSum ? a.vw + b.vw : Math.max(2 * Math.min(a.vw, b.vw), a.vw, b.vw),
    Gac: a.Ga + b.Ga,
    windSum,
  };
}

/** Capacity weight used to share a wall line between its walls: allowable seismic capacity of the segment, lb. */
export function shearWallWeight(s: Pick<ShearWallInput, "sides" | "b" | "h" | "opening">): number {
  const sides = s.sides.map((x) => {
    const v = sideValues(x.key, x.spacing);
    return { ...v, vs: x.vsOverride ?? v.vs, vw: x.vsOverride ? Math.round((1.4 * x.vsOverride) / 5) * 5 : v.vw };
  });
  const { vsc } = combineSides(sides);
  const fam = sides.some((x) => x.row.family === "gypsum") ? "gypsum" : "wsp";
  if (s.opening) {
    const ho = s.h - s.opening.ha - s.opening.hb;
    const Lp = s.opening.L1 + s.opening.L2;
    return (vsc * aspectFactor(fam, ho / Math.min(s.opening.L1, s.opening.L2)) * Lp) / 2;
  }
  return (vsc * aspectFactor(fam, s.h / s.b) * s.b) / 2;
}

export function designShearWall(ctx: DesignContext, s: ShearWallInput, dem: ShearWallDemand): ShearWallResult {
  const nds = ndsOf(ctx);
  if (!s.sides.length) throw new Error("Select the sheathing for at least one side");
  if (s.sides.length > 2) throw new Error("A wall has at most two sheathed sides");
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];
  const sides = s.sides.map((x) => {
    const v0 = sideValues(x.key, x.spacing);
    let v = v0;
    if (x.panel1532) {
      const alt = panel1532Shear(x.key, x.spacing);
      if (!alt) throw new Error(`${v0.row.label}: no 15/32 in. row with the same nailing (SDPWS Table 4.3A footnote)`);
      if (s.stud.spacing > 16 && !x.key.endsWith("-across"))
        throw new Error(`${v0.row.label}: 15/32 in. values need studs at 16 in. o.c. or less, or panels across studs`);
      v = { ...v0, vs: alt.vs, vw: Math.round((1.4 * alt.vs) / 5) * 5 };
      assumptions.push(
        fromDefault(
          `Sheathing values — ${v0.row.label}`,
          `15/32 in. panel shear v_s = ${fmt(alt.vs, 0)} plf (studs ${fmt(s.stud.spacing, 0)} in. o.c.); G_a of the ${v0.row.label}`,
          "SDPWS Table 4.3A footnote — confirm in the adopted edition",
          true,
        ),
      );
    }
    const override = x.vsOverride !== undefined || x.GaOverride !== undefined;
    if (override)
      assumptions.push(
        fromOverride(
          `Sheathing values — ${v.row.label}`,
          `v_s = ${fmt(x.vsOverride ?? v.vs, 0)} plf, G_a = ${fmt(x.GaOverride ?? v.Ga, 1)} kips/in`,
          `SDPWS Table ${v.row.table}: v_s = ${fmt(v.vs, 0)} plf, G_a = ${fmt(v.Ga, 1)}`,
        ),
      );
    const vs = x.vsOverride ?? v.vs;
    const vw = v.row.family === "wsp" ? Math.round((1.4 * vs) / 5) * 5 : vs;
    return { row: v.row, vs, vw, Ga: x.GaOverride ?? v.Ga, spacing: x.spacing, override };
  });
  const { vsc, vwc, Gac, windSum } = combineSides(sides);
  const family = sides.some((x) => x.row.family === "gypsum") ? "gypsum" : "wsp";
  let aspect = s.h / s.b;
  let maxAspect = Math.min(...sides.map((x) => x.row.maxAspect));
  let Car = aspectFactor(family, aspect);
  let vS = (0.7 * dem.Eh) / s.b;
  let vW = (0.6 * dem.W) / s.b;
  let ftao: FtaoResult | undefined;
  if (s.opening) {
    const o = s.opening;
    if (Math.abs(o.L1 + o.Lo + o.L2 - s.b) > 0.01)
      throw new Error(
        `FTAO: L1 + opening + L2 = ${fmt(o.L1 + o.Lo + o.L2, 2)} ft must equal the wall length ${fmt(s.b, 2)} ft`,
      );
    const ho = s.h - o.ha - o.hb;
    if (!(ho > 0) || !(o.ha > 0) || !(o.hb >= 0))
      throw new Error("FTAO: check the heights above and below the opening");
    const Lp = o.L1 + o.L2;
    const Lmin = Math.min(o.L1, o.L2);
    const v = { s: vS, w: vW };
    const vp = { s: (0.7 * dem.Eh) / Lp, w: (0.6 * dem.W) / Lp };
    const H = { s: (0.7 * dem.Eh * s.h) / s.b, w: (0.6 * dem.W * s.h) / s.b };
    const vab = { s: H.s / (o.ha + o.hb), w: H.w / (o.ha + o.hb) };
    const Lmax = Math.max(o.L1, o.L2);
    const F = { s: (vp.s - v.s) * Lmax, w: (vp.w - v.w) * Lmax };
    aspect = ho / Lmin;
    maxAspect = Math.min(3.5, maxAspect);
    Car = aspectFactor(family, aspect);
    vS = Math.max(vp.s, vab.s);
    vW = Math.max(vp.w, vab.w);
    ftao = { L1: o.L1, L2: o.L2, Lo: o.Lo, ho, ha: o.ha, hb: o.hb, pierAspect: aspect, v, vp, H, vab, F };
    if (Lmin < 2) flags.push(`FTAO pier ${fmt(Lmin, 2)} ft is shorter than 2 ft (SDPWS 4.3.5.2)`);
    if (o.strapId) {
      const item = ctx.hardware?.find((x) => x.id === o.strapId);
      if (!item) throw new Error(`FTAO strap ${o.strapId} not in the project hardware list`);
      if (item.tension === undefined) throw new Error(`${item.model}: allowable tension not entered`);
      const Fm = Math.max(F.s, F.w);
      ftao.strap = { item, F: Fm, ratio: Fm / item.tension };
      if (!item.checked)
        assumptions.push(fromDefault("Strap capacity", `${item.model} ${fmt(item.tension, 0)} lb`, item.source, true));
    } else flags.push("FTAO: select a strap for the corner forces at the head and sill of the opening");
    assumptions.push(
      fromDefault(
        "FTAO method",
        "Force transfer around the opening by the Diekmann rational method (equal unit shear in the panels above and below the opening, pier shear by length, straps at head and sill continuous over the piers); the deflection uses Eq. 4.3-1 over the full wall with the larger of v_p and v_ab — VERIFY method with the EOR",
        "SDPWS 4.3.5.2 (principles of mechanics)",
        true,
      ),
    );
  }
  const vAllowS = (vsc * Car) / 2;
  const vAllowW = (vwc * Car) / 2;

  // gravity per foot on the wall
  const self = resolveDead(ctx, s.self);
  const selfPlf = self.psf * s.h;
  const g: LoadVector = loadVector({ D: s.top.D + selfPlf, L: s.top.L, Lr: s.top.Lr, S: s.top.S });
  const lines: LoadLine[] = [
    { type: "D", label: "Dead load on top of wall", expr: "entered / from load path", value: s.top.D, unit: "plf" },
    {
      type: "D",
      label: `Wall self weight — ${self.label}`,
      expr: `${fmt(self.psf, 1)} psf × ${fmt(s.h, 2)} ft`,
      value: selfPlf,
      unit: "plf",
    },
  ];
  if (s.top.L)
    lines.push({
      type: "L",
      label: "Floor live load on top of wall",
      expr: "entered / from load path",
      value: s.top.L,
      unit: "plf",
    });
  if (s.top.Lr)
    lines.push({
      type: "Lr",
      label: "Roof live load on top of wall",
      expr: "entered / from load path",
      value: s.top.Lr,
      unit: "plf",
    });
  if (s.top.S)
    lines.push({
      type: "S",
      label: "Snow load on top of wall",
      expr: "entered / from load path",
      value: s.top.S,
      unit: "plf",
    });
  lines.push({
    type: "E",
    label: `Seismic — ${dem.lineName} share ${fmt(dem.share * 100, 1)} % (E_h = ρ Q_E)`,
    expr: `${fmt(dem.rho, 2)} × ${fmt(dem.QE, 0)} lb`,
    value: dem.Eh,
    unit: "lb",
  });
  lines.push({
    type: "W",
    label: `Wind — ${dem.lineName} share ${fmt(dem.share * 100, 1)} %`,
    expr: "MWFRS story shear × line share",
    value: dem.W,
    unit: "lb",
  });

  // chord forces, ASD lateral combinations
  const post = resolveWood(
    { kind: "sawn", species: s.stud.species, grade: s.stud.grade, size: s.endPost.size, plies: s.endPost.plies },
    nds,
  );
  const arm = s.overturning === "full" ? s.b - post.b / 12 : s.b;
  const tribEnd = s.stud.spacing / 12 / 2;
  const combos = asdCombinations({ SDS: dem.SDS, includeWind: true, includeSeismic: true }).filter(
    (c) => (c.factors.E ?? 0) !== 0 || (c.factors.W ?? 0) !== 0,
  );
  const chord: ChordRow[] = combos.map((c: Combination) => {
    const kind = (c.factors.E ?? 0) !== 0 ? "seismic" : "wind";
    const V = kind === "seismic" ? (c.factors.E ?? 0) * dem.Eh : (c.factors.W ?? 0) * dem.W;
    const wG =
      (c.factors.D ?? 0) * g.D + (c.factors.L ?? 0) * g.L + (c.factors.Lr ?? 0) * g.Lr + (c.factors.S ?? 0) * g.S;
    const wD = (c.factors.D ?? 0) * g.D;
    const stackedT = dem.stacked
      ? (kind === "seismic" ? dem.stacked.Ts : dem.stacked.Tw) *
        Math.min(1, (c.factors.E ?? c.factors.W ?? 0) / (kind === "seismic" ? 0.7 : 0.6))
      : 0;
    const T =
      s.overturning === "full"
        ? (V * s.h - (wD * s.b * s.b) / 2) / arm + stackedT
        : (V * s.h) / arm - wD * tribEnd + stackedT;
    const C = (V * s.h) / arm + wG * tribEnd;
    return { combo: c.label, kind, V, wG, T, C };
  });
  const Ts = Math.max(0, ...chord.filter((r) => r.kind === "seismic").map((r) => r.T));
  const Tw = Math.max(0, ...chord.filter((r) => r.kind === "wind").map((r) => r.T));
  const tRow = chord.reduce((a, b) => (b.T > a.T ? b : a));
  const cRow = chord.reduce((a, b) => (b.C > a.C ? b : a));

  // end post tension (net section) and compression
  const Aen = s.endPost.plies * post.bPly * (post.d - s.endPost.holeDia);
  const Ft = post.Ft * 1.6 * post.CFt;
  const ft = Math.max(0, tRow.T) / Aen;
  // end post buckling in the plane of the wall over the full wall height (conservative; Tedds method)
  const studLen = s.h * 12;
  const comboC = combos.find((c) => c.label === cRow.combo)!;
  const col = designColumn({
    mat: post,
    cond: { wetService: false, incised: false, repetitive: false },
    length: studLen,
    le1: studLen,
    le2: 0,
    builtUp: s.endPost.plies > 1 ? "nailed" : undefined,
    P: loadVector({ D: cRow.C }),
    combos: [
      { ...comboC, factors: { D: 1, ...(comboC.factors.E ? { E: comboC.factors.E } : { W: comboC.factors.W }) } },
    ],
    present: { D: true, E: !!comboC.factors.E, W: !!comboC.factors.W },
  });

  const checks: Check[] = [];
  if (ftao?.strap)
    checks.push({
      name: `FTAO strap ${ftao.strap.item.model} at opening corners (catalogue allowable)`,
      demand: ftao.strap.F,
      capacity: ftao.strap.item.tension!,
      ratio: ftao.strap.ratio,
      pass: ftao.strap.ratio <= 1,
      combo: ftao.F.s >= ftao.F.w ? "0.7E" : "0.6W",
      CD: 1.6,
      unit: "lb",
    });
  checks.push({
    name: ftao ? "Pier aspect ratio h_o / L_pier (SDPWS 4.3.5.2)" : "Aspect ratio h/b_s (SDPWS Table 4.3.4)",
    category: "detailing",
    demand: aspect,
    capacity: maxAspect,
    ratio: aspect / maxAspect,
    pass: aspect <= maxAspect,
    combo: "—",
    CD: 1,
    unit: "",
  });
  checks.push({
    name: ftao
      ? "Unit shear, seismic — max(pier, above / below opening) (ASD v_s / 2.0)"
      : "Unit shear, seismic (SDPWS 4.3.3, ASD v_s / 2.0)",
    demand: vS,
    capacity: vAllowS,
    ratio: vS / vAllowS,
    pass: vS <= vAllowS,
    combo: "0.7E",
    CD: 1.6,
    unit: "plf",
  });
  checks.push({
    name: ftao
      ? "Unit shear, wind — max(pier, above / below opening) (ASD v_w / 2.0)"
      : "Unit shear, wind (SDPWS 4.3.3, ASD v_w / 2.0)",
    demand: vW,
    capacity: vAllowW,
    ratio: vW / vAllowW,
    pass: vW <= vAllowW,
    combo: "0.6W",
    CD: 1.6,
    unit: "plf",
  });
  checks.push({
    name: `End post tension, net section (NDS 3.8)`,
    demand: ft,
    capacity: Ft,
    ratio: ft / Ft,
    pass: ft <= Ft,
    combo: tRow.combo,
    CD: 1.6,
    unit: "psi",
  });
  const cg = col.governing;
  checks.push({
    name: "End post compression with C_P (NDS 3.7)",
    demand: cg.fc,
    capacity: cg.FcPrime,
    ratio: cg.axial,
    pass: cg.axial <= 1,
    combo: cRow.combo,
    CD: 1.6,
    unit: "psi",
  });

  // hold-down
  let holdown: ShearWallResult["holdown"];
  const Tmax = Math.max(Ts, Tw);
  if (s.holdownId) {
    const item = ctx.hardware?.find((x) => x.id === s.holdownId);
    if (!item) throw new Error(`Hold-down ${s.holdownId} not in the project hardware list`);
    if (item.tension === undefined)
      throw new Error(`${item.model}: allowable tension not entered in the hardware list`);
    holdown = { item, T: Tmax, ratio: Tmax / item.tension };
    checks.push({
      name: `Hold-down ${item.model} (catalogue allowable, C_D = 1.6)`,
      demand: Tmax,
      capacity: item.tension,
      ratio: Tmax / item.tension,
      pass: Tmax <= item.tension,
      combo: Ts >= Tw ? "seismic" : "wind",
      CD: 1.6,
      unit: "lb",
    });
    if (item.minPost && post.b < item.minPost - 1e-6)
      flags.push(
        `${item.model} requires an end post at least ${fmt(item.minPost, 2)} in. thick — provided ${fmt(post.b, 2)} in.`,
      );
    if (!item.checked)
      assumptions.push(
        fromDefault("Hold-down capacity", `${item.model} ${fmt(item.tension, 0)} lb`, item.source, true),
      );
  } else if (Tmax > 0) {
    checks.push({
      name: "Net overturning tension — hold-down required",
      demand: Tmax,
      capacity: 0,
      ratio: Infinity,
      pass: false,
      combo: Ts >= Tw ? "seismic" : "wind",
      CD: 1.6,
      unit: "lb",
    });
  }

  // hold-down anchor, strength level
  let hdAnchor: ShearWallResult["hdAnchor"];
  if (s.holdownAnchor && Tmax > 0) {
    const a = s.holdownAnchor;
    const steel = ANCHOR_STEELS.find((x) => x.label === a.steel) ?? ANCHOR_STEELS[0];
    const seismicSDC = /[CDEF]/.test(dem.seismicSDC);
    const wD9 = 0.9 * g.D;
    const wDs = (0.9 - 0.2 * dem.SDS) * g.D;
    const QEh = a.omega ? dem.Omega0 * dem.QE : dem.Eh;
    const Tu_s =
      s.overturning === "full" ? (QEh * s.h - (wDs * s.b * s.b) / 2) / arm : (QEh * s.h) / arm - wDs * tribEnd;
    const Tu_w =
      s.overturning === "full" ? (dem.W * s.h - (wD9 * s.b * s.b) / 2) / arm : (dem.W * s.h) / arm - wD9 * tribEnd;
    const stackedU = dem.stacked?.Tu ?? 0;
    const Tu = Math.max(Tu_s, Tu_w, 0) + stackedU;
    const basis =
      Tu_s >= Tu_w ? `(0.9 − 0.2S_DS)D + ${a.omega ? "Ω0 Q_E (ACI 318 17.10.5.3d)" : "ρ Q_E"}` : "0.9D + 1.0W";
    const t = anchorTension({
      d: a.d,
      steel,
      hef: a.hef,
      edges: a.edges,
      Abrg: Math.max(0.01, a.plate * a.plate - (Math.PI * (a.d + 1 / 16) ** 2) / 4),
      fc: ctx.concrete?.fc ?? 2500,
      cracked: a.cracked,
      seismic: seismicSDC && Tu_s >= Tu_w,
    });
    hdAnchor = { Tu, basis, t, ratio: Tu / t.phiNn };
    checks.push({
      name: `Hold-down anchor, ${fmt(a.d, 3)} in. — ${t.governs} (ACI 318-19 Ch. 17)`,
      demand: Tu,
      capacity: t.phiNn,
      ratio: Tu / t.phiNn,
      pass: Tu <= t.phiNn,
      combo: basis,
      CD: 1,
      unit: "lb",
    });
  }

  // sill anchors
  const perBolt = Math.max(vS, vW) * (s.sill.spacing / 12);
  let sill: ShearWallResult["sill"];
  if (s.sill.type === "cast-in") {
    const ts = Number(s.sillSize.split("x")[0]) >= 3 ? 2.5 : 1.5;
    const bz = boltInConcrete(s.sill.d, ts, SPECIFIC_GRAVITY[s.stud.species], s.sill.embed);
    const Zprime = bz.Z * 1.6;
    const vStrength = dem.Eh / s.b;
    const Vu = vStrength * (s.sill.spacing / 12);
    const t = anchorTension({
      d: s.sill.d,
      steel: ANCHOR_STEELS[0],
      hef: s.sill.embed,
      edges: [s.sill.edge, 99, 99, 99],
      Abrg: 1,
      fc: ctx.concrete?.fc ?? 2500,
      cracked: true,
      seismic: false,
    });
    const sp = anchorShearParallel({
      d: s.sill.d,
      steel: ANCHOR_STEELS[0],
      hef: s.sill.embed,
      ca1: s.sill.edge,
      ha: Math.max(s.sill.embed + 2, 12),
      fc: ctx.concrete?.fc ?? 2500,
      cracked: true,
      Ncb: t.Ncb,
    });
    sill = {
      perBolt,
      Z: bz.Z,
      Zprime,
      mode: bz.mode,
      ratio: perBolt / Zprime,
      concrete: { Vu, phiVn: sp.phiVn, ratio: Vu / sp.phiVn, governs: sp.governs },
    };
    checks.push({
      name: `Sill anchor ${fmt(s.sill.d, 3)} in. @ ${fmt(s.sill.spacing, 0)} in. — bolt in ${s.sillSize} sill (NDS 12.3, mode ${bz.mode})`,
      demand: perBolt,
      capacity: Zprime,
      ratio: perBolt / Zprime,
      pass: perBolt <= Zprime,
      combo: vS >= vW ? "0.7E" : "0.6W",
      CD: 1.6,
      unit: "lb",
    });
    checks.push({
      name: `Sill anchor — concrete, ${sp.governs} (ACI 318-19 17.7)`,
      demand: Vu,
      capacity: sp.phiVn,
      ratio: Vu / sp.phiVn,
      pass: Vu <= sp.phiVn,
      combo: "ρQ_E (strength)",
      CD: 1,
      unit: "lb",
    });
    assumptions.push(
      fromDefault(
        "Sill bolt in concrete",
        "NDS 12.3 yield equations with concrete dowel bearing strength F_e = 7,500 psi; concrete shear checked at strength level without Ω0",
        "NDS 12.3; ACI 318-19 17.10.6",
        true,
      ),
    );
    flags.push(
      "Plate washers 3 in. × 3 in. × 0.229 in. at each sill anchor (SDPWS 4.3.6.4.3); anchors within 12 in. of each end of each sill piece",
    );
  } else {
    if (!s.sill.allowShear)
      throw new Error("Post-installed sill anchor: enter the allowable shear from the anchor's ESR");
    sill = { perBolt, Zprime: s.sill.allowShear, ratio: perBolt / s.sill.allowShear };
    checks.push({
      name: `Sill anchor ${s.sill.label ?? "post-installed"} @ ${fmt(s.sill.spacing, 0)} in. (ESR allowable)`,
      demand: perBolt,
      capacity: s.sill.allowShear,
      ratio: perBolt / s.sill.allowShear,
      pass: perBolt <= s.sill.allowShear,
      combo: vS >= vW ? "0.7E" : "0.6W",
      CD: 1.6,
      unit: "lb",
    });
    assumptions.push(
      fromDefault(
        "Post-installed anchor",
        `${s.sill.label ?? "anchor"}: ${fmt(s.sill.allowShear, 0)} lb allowable shear`,
        "ICC-ES ESR (entered)",
        true,
      ),
    );
  }

  // seismic drift (strength level, ρ = 1.0, §12.12.1)
  const E = post.E;
  const A = post.A;
  const hdItem = holdown?.item;
  const ka = hdItem?.tension && hdItem.deflection ? hdItem.tension / hdItem.deflection : (s.ka ?? 30000);
  if (!hdItem?.deflection)
    assumptions.push(
      fromDefault("Anchor stiffness", `k_a = ${fmt(ka, 0)} lb/in`, s.ka ? "entered" : "default (Tedds default)", !s.ka),
    );
  const vd = dem.QE / s.b;
  const wDd = (0.6 - 0.2 * dem.SDS) * g.D;
  const Td =
    s.overturning === "full"
      ? Math.max(0, (dem.QE * s.h - (wDd * s.b * s.b) / 2) / arm)
      : Math.max(0, vd * s.h - wDd * tribEnd);
  const da = Td / ka;
  const bend = (8 * vd * s.h ** 3) / (E * A * s.b);
  const vdShear = ftao ? Math.max(dem.QE / (ftao.L1 + ftao.L2), (dem.QE * s.h) / s.b / (ftao.ha + ftao.hb)) : vd;
  const shear = (vdShear * s.h) / (1000 * Gac);
  const slip = (s.h * da) / s.b;
  const dxe = bend + shear + slip;
  const dx = (dem.Cd * dxe) / dem.Ie;
  const allow = dem.driftFactor * dem.hsx * 12;
  checks.push({
    name: `Seismic drift δ_x = C_d δ_xe / I_e (ASCE 7 Eq. 12.8-15, Table 12.12-1)`,
    category: "serviceability",
    demand: dx,
    capacity: allow,
    ratio: dx / allow,
    pass: dx <= allow,
    combo: "Q_E",
    CD: 1,
    unit: "in",
  });
  const vwd = (s.windService.factor * dem.W) / s.b;
  const Tw0 = Math.max(
    0,
    s.overturning === "full"
      ? (s.windService.factor * dem.W * s.h - (0.6 * g.D * s.b * s.b) / 2) / arm
      : vwd * s.h - 0.6 * g.D * tribEnd,
  );
  const dw = (8 * vwd * s.h ** 3) / (E * A * s.b) + (vwd * s.h) / (1000 * Gac) + (s.h * (Tw0 / ka)) / s.b;
  const allowW = (s.h * 12) / s.windService.limitN;
  checks.push({
    name: `Wind deflection (${fmt(s.windService.factor, 2)}W) ≤ h/${fmt(s.windService.limitN, 0)}`,
    category: "serviceability",
    demand: dw,
    capacity: allowW,
    ratio: dw / allowW,
    pass: dw <= allowW,
    combo: `${fmt(s.windService.factor, 2)}W`,
    CD: 1,
    unit: "in",
  });

  if (sides.some((x) => x.spacing <= 2))
    flags.push(
      "Edge nailing at 2 in. o.c.: 3x nominal framing at adjoining panel edges and staggered nails (SDPWS 4.3.7.1)",
    );
  flags.push(
    `Blocked panels; edge nailing at all panel edges, ${sides.map((x) => `${x.row.nail} @ ${x.spacing} in. edge / 12 in. field`).join("; ")}`,
  );
  if (dem.stacked) flags.push(`Uplift from ${dem.stacked.mark} above added to the hold-down force`);
  assumptions.push(
    fromDefault(
      "Distribution",
      `${dem.lineName}: line force shared between its walls in proportion to their allowable capacity (equal construction → by length)`,
      "flexible diaphragm, tributary",
    ),
    fromDefault(
      "Overturning",
      s.overturning === "full"
        ? "Dead load of the whole segment resists overturning about the compression chord (rigid body); arm = b − end-post thickness"
        : "Dead load tributary to the end post only (s / 2) resists overturning; arm = b (Tedds method)",
      "statics",
    ),
  );

  const governing = governingCheck(checks);
  const sideText = sides.map((x) => `${x.row.label}, ${x.row.nail} @ ${x.spacing} in.`).join(" + ");
  return {
    id: s.id,
    mark: s.mark,
    kind: "shearWall",
    title: ftao ? "Wood shear wall — force transfer around opening" : "Wood shear wall",
    callout: `${fmtFtIn(s.b)} × ${fmtFtIn(s.h)}: ${sideText}${hdItem ? `; ${hdItem.model}` : ""}`,
    pass: checks.every((c) => c.pass),
    governing,
    checks,
    reactions: [],
    loadLines: lines,
    assumptions,
    flags,
    input: s,
    demand: dem,
    sides,
    vsc,
    vwc,
    windSum,
    Gac,
    aspect,
    maxAspect,
    Car,
    vAllowS,
    vAllowW,
    vS,
    vW,
    selfPlf,
    arm,
    chord,
    Tmax: { seismic: Ts, wind: Tw },
    post,
    Aen,
    tension: { T: Math.max(0, tRow.T), ft, Ft, ratio: ft / Ft, combo: tRow.combo },
    compression: { C: cRow.C, col, combo: cRow.combo },
    holdown,
    hdAnchor,
    sill,
    drift: { v: vd, Td, da, ka, bend, shear, slip, dxe, dx, allow, ratio: dx / allow },
    windDefl: { v: vwd, d: dw, allow: allowW, ratio: dw / allowW },
    ftao,
  };
}
