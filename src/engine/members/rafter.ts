/**
 * R-# — sawn-lumber rafters.
 * Geometry: pitch (rise in 12), horizontal run from the plate to the ridge
 * support and horizontal eave overhang. The rafter is analysed along its
 * slope with load components perpendicular to it:
 *   dead on the sloped surface   w⊥ = D·s·cos θ          (D on plan: D·s·cos² θ)
 *   roof live and snow on plan   w⊥ = (Lr or S)·s·cos² θ
 *   wind normal to the surface   w⊥ = p·s
 * Bending, shear (V at d, birdsmouth notch per NDS 3.4.3.2), deflection along
 * the sloped length and the plate bearing (vertical reaction on the seat) are
 * checked. With a ridge board the rafter pair is a tied three-hinged frame:
 * thrust H = w·run / (2 tan θ) per rafter, axial compression at the plate
 * N = H cos θ + w·run·sin θ, combined compression and bending per NDS 3.9.2
 * and tie tension T = H·(tie spacing / rafter spacing).
 */

import type { BeamLoad } from "../analysis/beam";
import { fmt } from "../core/fmt";
import type { Combination } from "../core/combos";
import { LOAD_TYPES, loadVector, type LoadType, type LoadVector } from "../core/loads";
import {
  columnStabilityFactor,
  comboMomentAt,
  designWoodBeam,
  type Check,
  type WoodBeamInput,
  type WoodBeamResult,
} from "../design/wood";
import { firstPassing, maxPassing, maxPassingSpacing } from "../design/sizing";
import type { Grade, Species } from "../data/sawn";
import { sawnDressed } from "../data/sections";
import type { SnowResult } from "../loads/snow";
import {
  loadAssumptions,
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

export type RidgeSupport = "beam" | "board";

export interface RafterInput {
  id: string;
  mark: string;
  description: string;
  species: Species;
  grade: Grade;
  size: string;
  /** rafter spacing, in. o.c. */
  spacing: number;
  /** roof pitch, rise in inches per 12 in. run */
  rise: number;
  /** horizontal run from the plate bearing to the ridge support, ft */
  run: number;
  /** horizontal eave overhang beyond the plate, ft */
  overhang: number;
  ridge: RidgeSupport;
  /** horizontal seat length on the wall plate, in */
  plateSeat: number;
  /** seat length on a ridge beam, in (0 = hanger, checked with the hanger) */
  ridgeSeat: number;
  /** birdsmouth seat-cut depth measured perpendicular to the rafter, in (0 = none) */
  seatCut: number;
  dead: DeadRef;
  roofLive: boolean;
  snow: boolean;
  /** net C&C wind pressure normal to the roof, strength level, psf (negative = uplift) */
  windPressure?: number;
  deflection: DeflectionInput;
  Kcr?: number;
  /** bracing interval of the bottom edge (ceiling / blocking) for negative moment, ft */
  luBottom: number;
  rule441: boolean;
  /** rafter-tie / ceiling-joist spacing for a ridge board, in (default: rafter spacing) */
  tieSpacing?: number;
  /** hip or gable roof (unbalanced snow applies); false for a monoslope roof */
  gable: boolean;
}

export interface RafterGeometry {
  theta: number;
  thetaDeg: number;
  cos: number;
  sin: number;
  tan: number;
  slopedSpan: number;
  slopedOverhang: number;
  rise: number;
  /** vertical rise from plate to ridge, ft */
  height: number;
}

export interface ThrustCheck {
  combo: string;
  CD: number;
  H: number;
  N: number;
  T: number;
  fc: number;
  FcPrime: number;
  CP: number;
  FcE: number;
  fb: number;
  FbPrime: number;
  interaction: number;
}

export interface RafterResult extends MemberResultBase {
  kind: "rafter";
  input: RafterInput;
  design: WoodBeamResult;
  geom: RafterGeometry;
  snow?: SnowResult;
  /** vertical support reactions (gravity) by type, lb per rafter: [plate, ridge] */
  vertical: LoadVector[];
  thrust?: {
    /** per rafter, unfactored by type, lb */
    H: LoadVector;
    N: LoadVector;
    /** per tie, unfactored by type, lb */
    T: LoadVector;
    le: number;
    leOverD: number;
    rows: ThrustCheck[];
    governing: ThrustCheck;
  };
}

export function rafterGeometry(r: Pick<RafterInput, "rise" | "run" | "overhang">): RafterGeometry {
  const theta = Math.atan(r.rise / 12);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    theta,
    thetaDeg: (theta * 180) / Math.PI,
    cos,
    sin,
    tan: Math.tan(theta),
    slopedSpan: r.run / cos,
    slopedOverhang: r.overhang / cos,
    rise: r.rise,
    height: (r.run * r.rise) / 12,
  };
}

const GRAVITY: LoadType[] = ["D", "Lr", "S"];

interface Built {
  geom: RafterGeometry;
  trib: number;
  loads: BeamLoad[];
  lines: LoadLine[];
  /** vertical load per horizontal ft by type (gravity), plf */
  wVert: LoadVector;
  dead: ReturnType<typeof resolveDead>;
  snow?: SnowResult;
}

function build(ctx: DesignContext, r: RafterInput): Built {
  const geom = rafterGeometry(r);
  const { cos } = geom;
  const trib = r.spacing / 12;
  const total = geom.slopedSpan + geom.slopedOverhang;
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  const wVert = loadVector({});
  const ang = `${fmt(geom.thetaDeg, 2)}°`;

  const dead = resolveDead(ctx, r.dead);
  if (dead.psf) {
    const sloped = dead.basis !== "horizontal";
    const w = sloped ? dead.psf * trib * cos : dead.psf * trib * cos * cos;
    wVert.D = sloped ? (dead.psf * trib) / cos : dead.psf * trib;
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: w, label: "Dead" });
    lines.push({
      type: "D",
      label: `Dead — ${dead.label} (${sloped ? "sloped surface" : "plan area"})`,
      expr: `${fmt(dead.psf, 2)} psf × ${fmt(trib, 3)} ft × cos${sloped ? "" : "²"}(${ang})`,
      value: w,
      unit: "plf",
      ref: dead.ref,
    });
  }
  if (r.roofLive) {
    const At = (r.run + r.overhang) * trib;
    const lr = resolveRoofLive(ctx, At, r.rise);
    const w = lr.psf * trib * cos * cos;
    wVert.Lr = lr.psf * trib;
    loads.push({ type: "Lr", kind: "udl", x1: 0, x2: total, w1: w, label: "Roof live" });
    lines.push({
      type: "Lr",
      label: `Roof live — ${lr.expr}`,
      expr: `${fmt(lr.psf, 2)} psf × ${fmt(trib, 3)} ft × cos²(${ang})`,
      value: w,
      unit: "plf",
      ref: lr.ref,
    });
  }
  let snow: SnowResult | undefined;
  if (r.snow && ctx.snow.pg > 0) {
    snow = resolveSnow(ctx, r.rise, r.run + r.overhang, r.gable);
    const w = snow.rafterUniform * trib * cos * cos;
    wVert.S = snow.rafterUniform * trib;
    if (w) {
      loads.push({ type: "S", kind: "udl", x1: 0, x2: total, w1: w, label: "Snow" });
      lines.push({
        type: "S",
        label: `Snow — ${snow.rafterCase}`,
        expr: `${fmt(snow.rafterUniform, 2)} psf × ${fmt(trib, 3)} ft × cos²(${ang})`,
        value: w,
        unit: "plf",
        ref: snow.refs.ps,
      });
    }
  }
  if (r.windPressure) {
    const w = r.windPressure * trib;
    loads.push({ type: "W", kind: "udl", x1: 0, x2: total, w1: w, label: "Wind (C&C)" });
    lines.push({
      type: "W",
      label: "Wind — C&C pressure normal to roof (strength level)",
      expr: `${fmt(r.windPressure, 2)} psf × ${fmt(trib, 3)} ft`,
      value: w,
      unit: "plf",
      ref: "ASCE 7 Ch. 30",
    });
  }
  return { geom, trib, loads, lines, wVert, dead, snow };
}

function woodInput(ctx: DesignContext, r: RafterInput, b: Built, size = r.size): WoodBeamInput {
  const lim = resolveDeflection(r.deflection);
  const dDressed = sawnDressed(size).d;
  return {
    material: { kind: "sawn", species: r.species, grade: r.grade, size, plies: 1 },
    geometry: { spans: [b.geom.slopedSpan], leftCantilever: b.geom.slopedOverhang || undefined },
    loads: b.loads,
    includeSelfWeight: false,
    conditions: { wetService: false, incised: false, repetitive: r.spacing <= 24, flatUse: false },
    lu: { top: 0, bottom: r.luBottom },
    bearingLengths: [r.plateSeat, r.ridgeSeat || 1.5],
    defl: { live: lim.live, total: lim.total },
    Kcr: r.Kcr ?? ctx.Kcr,
    notchDepth: r.seatCut > 0 ? dDressed - r.seatCut : undefined,
    notchSupports: [0],
    rule441: r.rule441,
    SDS: ctx.SDS,
    nds: ndsOf(ctx),
  };
}

function runDesign(ctx: DesignContext, r: RafterInput, size = r.size) {
  const b = build(ctx, r);
  return { b, design: designWoodBeam(woodInput(ctx, r, b, size)) };
}

/** Full rafter evaluation (used directly and by the sizing helpers). */
function evaluate(ctx: DesignContext, r: RafterInput, size = r.size) {
  const { b, design } = runDesign(ctx, r, size);
  const { geom } = b;
  const mat = design.mat;
  const checks: Check[] = design.checks.filter((c) => !c.name.startsWith("Bearing at support"));

  // vertical reactions by type (gravity): perpendicular reaction / cos θ; wind normal: vertical component R⊥ cos θ
  const vertical: LoadVector[] = design.reactions.map((rx) => {
    const v = loadVector({});
    for (const t of LOAD_TYPES) v[t] = t === "W" || t === "E" ? rx.maxByType[t] * geom.cos : rx.maxByType[t] / geom.cos;
    return v;
  });
  if (r.ridge === "board") {
    // ridge board: the ridge carries no vertical load; all gravity load goes to the plate
    const total = loadVector({});
    for (const t of GRAVITY) total[t] = b.wVert[t] * (r.run + r.overhang);
    vertical[0] = { ...vertical[0], D: total.D, Lr: total.Lr, S: total.S };
    vertical[1] = { ...vertical[1], D: 0, Lr: 0, S: 0 };
  }

  // plate bearing: vertical reaction on the horizontal seat (F_c⊥, conservative for loads at an angle to grain)
  const combos = design.combos.map((row) => row.combo);
  const bearingAt = (i: number, seat: number, label: string) => {
    let R = 0;
    let combo = "";
    for (const c of combos) {
      let v = 0;
      for (const t of LOAD_TYPES) v += (c.factors[t] ?? 0) * vertical[i][t];
      if (v > R) {
        R = v;
        combo = c.label;
      }
    }
    const atEnd = i === 0 ? r.overhang <= 0.25 : true;
    const Cb = !atEnd && seat < 6 ? (seat + 0.375) / seat : 1;
    const Fp = mat.Fcperp * design.factors.CM.Fcperp * Cb;
    const fc = R / (mat.b * seat);
    checks.push({
      name: `Bearing at ${label} (vertical reaction on seat)`,
      demand: fc,
      capacity: Fp,
      ratio: fc / Fp,
      pass: fc <= Fp,
      combo,
      CD: 1,
      unit: "psi",
    });
  };
  bearingAt(0, r.plateSeat, "plate");
  if (r.ridge === "beam" && r.ridgeSeat > 0) bearingAt(1, r.ridgeSeat, "ridge beam seat");

  // birdsmouth net section in bending where the overhang puts the plate in negative moment
  if (r.seatCut > 0 && r.overhang > 0) {
    const dn = mat.d - r.seatCut;
    const Sn = (mat.b * dn * dn) / 6;
    let worst = { ratio: 0, fb: 0, Fb: 0, combo: "", CD: 1 };
    for (const row of design.combos) {
      const m = comboMomentAt(design, row.combo, geom.slopedOverhang);
      const M = Math.max(Math.abs(m.min), Math.abs(m.max));
      const fb = (M * 12) / Sn;
      const Fb = Math.min(row.FbPrime, row.FbPrimeNeg);
      if (fb / Fb > worst.ratio) worst = { ratio: fb / Fb, fb, Fb, combo: row.combo.label, CD: row.CD };
    }
    checks.push({
      name: "Bending on net section at birdsmouth (NDS 3.1.2)",
      demand: worst.fb,
      capacity: worst.Fb,
      ratio: worst.ratio,
      pass: worst.ratio <= 1,
      combo: worst.combo,
      CD: worst.CD,
      unit: "psi",
    });
  }

  // ridge board: thrust, axial compression and combined stresses
  let thrust: RafterResult["thrust"];
  if (r.ridge === "board") {
    const tieS = r.tieSpacing ?? r.spacing;
    const H = loadVector({});
    const N = loadVector({});
    const T = loadVector({});
    for (const t of GRAVITY) {
      H[t] = (b.wVert[t] * r.run) / (2 * geom.tan);
      N[t] = H[t] * geom.cos + b.wVert[t] * r.run * geom.sin;
      T[t] = (H[t] * tieS) / r.spacing;
    }
    const le = geom.slopedSpan * 12;
    const leOverD = le / mat.d;
    const FcE = (0.822 * design.factors.EminPrime) / (leOverD * leOverD);
    const rows: ThrustCheck[] = design.combos.map((row) => {
      const c: Combination = row.combo;
      const CD = row.CD;
      const sum = (v: LoadVector) => GRAVITY.reduce((s, t) => s + (c.factors[t] ?? 0) * v[t], 0);
      const Hc = sum(H);
      const Nc = sum(N);
      const Tc = sum(T);
      const FcStar = mat.Fc * CD * design.factors.CM.Fc * mat.CFc * design.factors.Ci;
      const CP = columnStabilityFactor(FcE, FcStar, 0.8);
      const FcPrime = FcStar * CP;
      const fc = Nc / mat.A;
      const fb = (row.Mpos * 12) / mat.S;
      const amp = 1 - fc / FcE;
      const interaction = (fc / FcPrime) ** 2 + (amp > 0 ? fb / (row.FbPrime * amp) : Infinity);
      return { combo: c.label, CD, H: Hc, N: Nc, T: Tc, fc, FcPrime, CP, FcE, fb, FbPrime: row.FbPrime, interaction };
    });
    const governing = rows.reduce((a, x) => (x.interaction > a.interaction ? x : a), rows[0]);
    const gc = rows.reduce((a, x) => (x.fc / x.FcPrime > a.fc / a.FcPrime ? x : a), rows[0]);
    checks.push({
      name: "Column slenderness l_e/d (NDS 3.7.1.4)",
      demand: leOverD,
      capacity: 50,
      ratio: leOverD / 50,
      pass: leOverD <= 50,
      combo: "—",
      CD: 1,
      unit: "",
    });
    checks.push({
      name: "Axial compression at plate (NDS 3.6, 3.7)",
      demand: gc.fc,
      capacity: gc.FcPrime,
      ratio: gc.fc / gc.FcPrime,
      pass: gc.fc <= gc.FcPrime,
      combo: gc.combo,
      CD: gc.CD,
      unit: "psi",
    });
    checks.push({
      name: "Combined bending and axial compression (NDS Eq. 3.9-3)",
      demand: governing.interaction,
      capacity: 1,
      ratio: governing.interaction,
      pass: governing.interaction <= 1,
      combo: governing.combo,
      CD: governing.CD,
      unit: "",
    });
    thrust = { H, N, T, le, leOverD, rows, governing };
  }

  const governing = checks.reduce((a, c) => (c.ratio > a.ratio ? c : a));
  const pass = checks.every((c) => c.pass);
  return { b, design, checks, vertical, thrust, governing, pass };
}

export function designRafter(ctx: DesignContext, r: RafterInput): RafterResult {
  const ev = evaluate(ctx, r);
  const { b, design } = ev;
  const flags: string[] = [];
  if (ev.b.snow) flags.push(...ev.b.snow.flags);
  if (r.ridge === "board") flags.push("Rafter ties assumed at the top-plate level (heel); raised ties are not covered");
  if (r.windPressure && r.windPressure < 0) flags.push("Net uplift: rafter-to-plate tie-down per connection schedule");
  const assumptions = [...loadAssumptions(b.dead), ...design.assumptions];
  assumptions.push({
    item: "Rafter analysis",
    value: `Analysed along the slope (θ = ${fmt(b.geom.thetaDeg, 2)}°), loads resolved perpendicular to the rafter; deflection limits on sloped length`,
    provenance: { kind: "default", source: "method" },
  });
  if (r.seatCut > 0)
    assumptions.push({
      item: "Birdsmouth",
      value: "Notch shear per NDS 3.4.3.2(a) (tension-face form, conservative)",
      provenance: { kind: "default", source: "NDS 3.4.3.2" },
    });

  let alternatives: RafterResult["alternatives"];
  if (!ev.pass) {
    const sizes = ["2x6", "2x8", "2x10", "2x12"].filter((s) => s !== r.size);
    const lightest = firstPassing(sizes, (s) => evaluate(ctx, r, s)).chosen?.candidate;
    const maxSpacing = maxPassingSpacing((s) =>
      evaluate(ctx, { ...r, spacing: s, tieSpacing: r.tieSpacing ? (r.tieSpacing * s) / r.spacing : undefined }),
    );
    const maxSpan = maxPassing((run) => evaluate(ctx, { ...r, run }), 2, r.run);
    alternatives = { lightest, maxSpacing, maxSpan };
  }

  const reactions: MemberReaction[] = design.reactions.map((rx, i) => {
    const byType = ev.vertical[i];
    const perFoot = loadVector(Object.fromEntries(LOAD_TYPES.map((t) => [t, (byType[t] * 12) / r.spacing])));
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const row of design.combos) {
      let v = 0;
      for (const t of LOAD_TYPES) v += (row.combo.factors[t] ?? 0) * byType[t];
      if (v > maxDown) {
        maxDown = v;
        maxDownCombo = row.combo.label;
      }
      if (v < minNet) {
        minNet = v;
        minNetCombo = row.combo.label;
      }
    }
    return {
      support: i,
      name: i === 0 ? "Plate" : "Ridge",
      x: rx.x,
      byType,
      perFoot,
      maxDown,
      maxDownCombo,
      minNet,
      minNetCombo,
    };
  });

  return {
    id: r.id,
    mark: r.mark,
    kind: "rafter",
    title: "Rafter",
    callout: `${r.size} ${r.species} ${r.grade} @ ${fmt(r.spacing, r.spacing % 1 ? 1 : 0)} in. o.c.`,
    pass: ev.pass,
    governing: ev.governing,
    checks: ev.checks,
    reactions,
    loadLines: b.lines,
    assumptions,
    flags,
    alternatives,
    input: r,
    design,
    geom: b.geom,
    snow: b.snow,
    vertical: ev.vertical,
    thrust: ev.thrust,
  };
}
