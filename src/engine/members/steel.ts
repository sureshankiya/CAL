/**
 * Steel members (AISC 360, LRFD or ASD):
 *  - SB-# steel beams, headers and lintels (W, C, rectangular / round HSS):
 *    simple, continuous, cantilevered or fixed-end; loads from the load path;
 *    flexure with LTB per unbraced segment (C_b by Eq. F1-1), shear, deflection
 *    (IBC Table 1604.3), web local yielding / crippling at bearings (J10.2 /
 *    J10.3) and bearing on wood supports (NDS 3.10)
 *  - SC-# steel columns (HSS / pipe, W): axial with eccentric beam reaction and
 *    wind on the column, B1 amplification (App. 8), H1-1 interaction, shear;
 *    bearing of the wood beam on the cap plate (NDS 3.10.2)
 *  - BP-# column base plates: DG1 plate, J8 bearing, anchor rods (J3.7 with
 *    grout-pad bending) and ACI 318 Ch. 17 anchor group, column weld
 *
 * Loads arrive by type (lb, plf) from the load path; steel checks run in kip.
 * Reactions to the members below are unfactored by type, with ASD maxima for
 * wood supports.
 */

import { analyseBeam, memberLength, patternEnvelope, type BeamLoad } from "../analysis/beam";
import {
  asdCombinations,
  combine,
  relevantCombinations,
  strengthCombinations,
  loadDurationFactor,
  type Combination,
} from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, loadVector, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { lumberData, type Grade, type Species } from "../data/sawn";
import { E_STEEL, steelGrade, steelShape, type SteelShape } from "../data/steel";
import { ANCHOR_STEELS } from "../design/anchors";
import { designAnchorGroup, type AnchorGroupResult } from "../design/anchorGroup";
import { designBasePlate, type BasePlateResult } from "../design/basePlate";
import {
  PHI,
  amplifierB1,
  available,
  cbFactor,
  compression,
  flexureMajor,
  flexureMinor,
  interactionH1,
  shearMajor,
  webLocalAtEnd,
  type CompressionResult,
  type FlexureResult,
  type InteractionResult,
  type ShearResult,
  type SteelMethod,
} from "../design/steel";
import { bearingAreaFactor, governingCheck, type Check } from "../design/wood";
import {
  extraToBeamLoads,
  ndsOf,
  resolveDeflection,
  type DeflectionInput,
  type DesignContext,
  type ExtraLoad,
  type LoadLine,
  asce7Of,
} from "./common";
import { areaWallLoads, type AreaLoad, type WallAbove } from "./distributed";
import { supportName, type MemberReaction, type MemberResultBase } from "./types";

const TRANSIENT: LoadType[] = ["L", "Lr", "S"];

function presentOf(loads: BeamLoad[]): Partial<Record<LoadType, boolean>> {
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES)
    if (
      loads.some(
        (l) => l.type === t && (l.kind === "point" ? (l.P ?? 0) : Math.abs(l.w1 ?? 0) + Math.abs(l.w2 ?? 0)) !== 0,
      )
    )
      present[t] = true;
  return present;
}

export function steelCombos(ctx: DesignContext, method: SteelMethod, present: Partial<Record<LoadType, boolean>>) {
  const opts = { asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E };
  return relevantCombinations(method === "LRFD" ? strengthCombinations(opts) : asdCombinations(opts), present);
}

const methodRef = (m: SteelMethod) => (m === "LRFD" ? "LRFD, ASCE 7 §2.3" : "ASD, ASCE 7 §2.4");

/* ===================================== SB ===================================== */

export interface SteelBearing {
  /** bearing length along the beam, in */
  lb: number;
  support: "wood" | "post" | "steel" | "concrete";
  species?: Species;
  grade?: Grade;
  size?: string;
}

export interface SteelBeamInput {
  id: string;
  mark: string;
  description: string;
  role: "beam" | "header" | "lintel" | "ridge" | "flush" | "dropped";
  shape: string;
  grade: string;
  method: SteelMethod;
  spans: number[];
  leftCantilever?: number;
  rightCantilever?: number;
  fixedLeft?: boolean;
  fixedRight?: boolean;
  area: AreaLoad[];
  walls: WallAbove[];
  extra: ExtraLoad[];
  /** unbraced length of the compression flange, ft (0 = continuously braced) */
  Lb: number;
  CbOverride?: number;
  deflection: DeflectionInput;
  selfWeight: boolean;
  bearing: SteelBearing[];
}

export interface SteelSegment {
  a: number;
  b: number;
  Lb: number;
  Mmax: number;
  Cb: number;
  flex: FlexureResult;
  Mc: number;
  ratio: number;
}

export interface SteelBeamRow {
  combo: Combination;
  Mpos: number;
  Mneg: number;
  V: number;
  gov: SteelSegment;
  Vc: number;
  ratioM: number;
  ratioV: number;
}

export interface SteelBearingCheck {
  support: number;
  x: number;
  Ru: number;
  combo: string;
  lb: number;
  atEnd: boolean;
  webYield?: { Rn: number; Rc: number; expr: string; ratio: number };
  webCrip?: { Rn: number; Rc: number; expr: string; ratio: number };
  wood?: { R: number; combo: string; A: number; f: number; Fprime: number; ratio: number; text: string };
}

export interface SteelDeflection {
  segment: [number, number];
  cantilever: boolean;
  live: number;
  liveSource: string;
  liveLimit: number;
  total: number;
  totalLimit: number;
}

export interface SteelBeamResult extends MemberResultBase {
  kind: "steelBeam";
  input: SteelBeamInput;
  shape: SteelShape;
  Fy: number;
  Fu: number;
  gradeLabel: string;
  method: SteelMethod;
  rows: SteelBeamRow[];
  shear: ShearResult;
  flexContinuous: FlexureResult;
  bearingChecks: SteelBearingCheck[];
  deflection: SteelDeflection[];
  limits: { live: number; total: number };
  selfWeight: number;
  totalLength: number;
  supports: number[];
  diagram: { x: number[]; M: number[]; V: number[] };
}

function envelope(analysis: ReturnType<typeof analyseBeam>, c: Combination, field: "M" | "VL" | "VR", sign: 1 | -1) {
  const n = analysis.x.length;
  const arr = new Array(n).fill(0);
  for (const t of LOAD_TYPES) {
    const f = c.factors[t] ?? 0;
    if (!f) continue;
    const env = patternEnvelope(analysis, t, field);
    const src = f > 0 === sign > 0 ? env.max : env.min;
    for (let i = 0; i < n; i++) arr[i] += f * src[i];
  }
  return arr;
}

function comboReaction(analysis: ReturnType<typeof analyseBeam>, c: Combination, i: number, sign: 1 | -1) {
  let r = 0;
  for (const t of LOAD_TYPES) {
    const f = c.factors[t] ?? 0;
    if (!f) continue;
    const pats = analysis.patterns[t];
    if (pats) {
      const vals = pats.map((p) => p.R[i]);
      const pos = vals.filter((v) => v > 0).reduce((s, v) => s + v, 0);
      const neg = vals.filter((v) => v < 0).reduce((s, v) => s + v, 0);
      r += f * (f > 0 === sign > 0 ? pos : neg);
    } else r += f * analysis.byType[t].R[i];
  }
  return r;
}

const interp = (xs: number[], ys: number[], x: number) => {
  for (let i = 0; i < xs.length - 1; i++)
    if (x >= xs[i] - 1e-9 && x <= xs[i + 1] + 1e-9) {
      const t = xs[i + 1] - xs[i] < 1e-12 ? 0 : (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  return ys[ys.length - 1];
};

export function designSteelBeam(ctx: DesignContext, b: SteelBeamInput): SteelBeamResult {
  const shape = steelShape(b.shape);
  const gr = steelGrade(b.grade);
  const Fy = gr.Fy;
  const E = E_STEEL;
  const g = {
    spans: b.spans,
    leftCantilever: b.leftCantilever,
    rightCantilever: b.rightCantilever,
    fixedLeft: b.fixedLeft,
    fixedRight: b.fixedRight,
  };
  const total = memberLength(g);
  const { loads, lines } = areaWallLoads(ctx, b.area, b.walls, total);
  const ex = extraToBeamLoads(b.extra, total);
  loads.push(...ex.loads);
  lines.push(...ex.lines);
  if (b.selfWeight) {
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: shape.wt, label: "Self weight" });
    lines.push({
      type: "D",
      label: `Self weight — ${shape.name}`,
      expr: `${fmt(shape.wt, 1)} plf`,
      value: shape.wt,
      unit: "plf",
    });
  }
  const EI = E * 1000 * shape.Ix;
  const analysis = analyseBeam(g, EI, loads);
  const present = presentOf(loads);
  const combos = steelCombos(ctx, b.method, present);
  const asd = relevantCombinations(
    asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );

  // unbraced segments: supports, cantilever tips and brace points at L_b from the left support of each span
  const sup = analysis.supports;
  const segs: Array<{ a: number; b: number; cant: boolean }> = [];
  if ((b.leftCantilever ?? 0) > 0) segs.push({ a: 0, b: sup[0], cant: true });
  for (let i = 0; i < sup.length - 1; i++) {
    const a = sup[i];
    const e = sup[i + 1];
    if (b.Lb > 0 && b.Lb < e - a - 1e-9) {
      let x = a;
      while (x < e - 1e-9) {
        const nx = Math.min(e, x + b.Lb);
        segs.push({ a: x, b: nx, cant: false });
        x = nx;
      }
    } else segs.push({ a, b: e, cant: false });
  }
  if ((b.rightCantilever ?? 0) > 0) segs.push({ a: sup[sup.length - 1], b: total, cant: true });

  const shear = shearMajor(shape, Fy, E);
  const Vc = available(shear.Vn, shear.factor, b.method);
  const flexContinuous = flexureMajor(shape, Fy, E, 0, 1);
  const xs = analysis.x;
  const rows: SteelBeamRow[] = combos.map((c) => {
    const Mp = envelope(analysis, c, "M", 1);
    const Mn = envelope(analysis, c, "M", -1);
    const Mabs = Mp.map((v, i) => Math.max(Math.abs(v), Math.abs(Mn[i])) / 1000);
    const VL = envelope(analysis, c, "VL", 1).map(Math.abs);
    const VL2 = envelope(analysis, c, "VL", -1).map(Math.abs);
    const VR = envelope(analysis, c, "VR", 1).map(Math.abs);
    const VR2 = envelope(analysis, c, "VR", -1).map(Math.abs);
    const V = Math.max(...VL, ...VL2, ...VR, ...VR2) / 1000;
    let gov: SteelSegment | undefined;
    for (const s of segs) {
      const inSeg = xs.map((x, i) => (x >= s.a - 1e-9 && x <= s.b + 1e-9 ? Mabs[i] : 0));
      const Mmax = Math.max(...inSeg);
      const L = s.b - s.a;
      const at = (f: number) => interp(xs, Mabs, s.a + f * L);
      const Lb = b.Lb > 0 ? Math.min(b.Lb, L) : 0;
      const Cb = b.CbOverride ?? (s.cant || Lb === 0 ? 1 : cbFactor(Mmax, at(0.25), at(0.5), at(0.75)));
      const flex = Lb > 0 ? flexureMajor(shape, Fy, E, Lb * 12, Cb) : flexContinuous;
      const Mc = available(flex.Mn, PHI.flexure, b.method) / 12;
      const seg: SteelSegment = { a: s.a, b: s.b, Lb, Mmax, Cb, flex, Mc, ratio: Mmax / Mc };
      if (!gov || seg.ratio > gov.ratio) gov = seg;
    }
    return {
      combo: c,
      Mpos: Math.max(0, ...Mp) / 1000 + 0,
      Mneg: Math.min(0, ...Mn) / 1000 + 0,
      V,
      gov: gov!,
      Vc,
      ratioM: gov!.ratio,
      ratioV: V / Vc,
    };
  });

  const checks: Check[] = [];
  const gm = rows.reduce((a, r) => (r.ratioM > a.ratioM ? r : a), rows[0]);
  checks.push({
    name: `Flexure (AISC Ch. F, ${gm.gov.flex.limit.toLowerCase()})`,
    demand: Math.max(gm.Mpos, -gm.Mneg),
    capacity: gm.gov.Mc,
    ratio: gm.ratioM,
    pass: gm.ratioM <= 1,
    combo: gm.combo.label,
    CD: 1,
    unit: "kip-ft",
  });
  const gv = rows.reduce((a, r) => (r.ratioV > a.ratioV ? r : a), rows[0]);
  checks.push({
    name: "Shear (AISC Ch. G)",
    demand: gv.V,
    capacity: gv.Vc,
    ratio: gv.ratioV,
    pass: gv.ratioV <= 1,
    combo: gv.combo.label,
    CD: 1,
    unit: "kip",
  });

  // bearings
  const bearingChecks: SteelBearingCheck[] = sup.map((xsup, i) => {
    const br = b.bearing[i] ?? b.bearing[b.bearing.length - 1] ?? { lb: 3.5, support: "steel" };
    let Ru = 0;
    let combo = "";
    for (const c of combos) {
      const v = comboReaction(analysis, c, i, 1) / 1000;
      if (v > Ru) {
        Ru = v;
        combo = c.label;
      }
    }
    const atEnd = xsup <= shape.d / 12 + 1e-6 || xsup >= total - shape.d / 12 - 1e-6;
    const out: SteelBearingCheck = { support: i, x: xsup, Ru, combo, lb: br.lb, atEnd };
    if ((shape.family === "W" || shape.family === "C") && br.support !== "steel") {
      const wl = webLocalAtEnd(shape, Fy, E, br.lb);
      // interior bearing (more than d from the end): 5k + l_b, crippling coefficient 0.80
      const RnY = atEnd ? wl.yielding : Fy * shape.tw * (5 * shape.kdes + br.lb);
      const RnC = atEnd
        ? wl.crippling
        : 0.8 *
          shape.tw ** 2 *
          (1 + 3 * (br.lb / shape.d) * (shape.tw / shape.tf) ** 1.5) *
          Math.sqrt((E * Fy * shape.tf) / shape.tw);
      const RcY = available(RnY, PHI.webYield, b.method);
      const RcC = available(RnC, PHI.webCrippling, b.method);
      out.webYield = {
        Rn: RnY,
        Rc: RcY,
        expr: atEnd ? wl.yieldExpr : "R_n = F_y t_w (5k + l_b) (J10-2)",
        ratio: Ru / RcY,
      };
      out.webCrip = {
        Rn: RnC,
        Rc: RcC,
        expr: atEnd ? wl.cripExpr : "R_n = 0.80 t_w² [1 + 3(l_b/d)(t_w/t_f)^1.5] √(E F_y t_f / t_w) (J10-4)",
        ratio: Ru / RcC,
      };
      checks.push({
        name: `Web local yielding at ${supportName(i)} (J10.2)`,
        demand: Ru,
        capacity: RcY,
        ratio: Ru / RcY,
        pass: Ru <= RcY,
        combo,
        CD: 1,
        unit: "kip",
      });
      checks.push({
        name: `Web local crippling at ${supportName(i)} (J10.3)`,
        demand: Ru,
        capacity: RcC,
        ratio: Ru / RcC,
        pass: Ru <= RcC,
        combo,
        CD: 1,
        unit: "kip",
      });
    }
    if (br.support === "wood" || br.support === "post") {
      const ld = lumberData(br.species ?? "DF-L", br.grade ?? "No.2", br.size ?? "4x4", ndsOf(ctx));
      let R = 0;
      let rc = "";
      let CDg = 1;
      for (const c of asd) {
        const v = comboReaction(analysis, c, i, 1);
        if (v > R) {
          R = v;
          rc = c.label;
          CDg = loadDurationFactor(c, present);
        }
      }
      const width = shape.family === "HSS" || shape.family === "HSSR" ? shape.bf : shape.bf;
      const A = width * br.lb;
      const f = R / A;
      let Fprime: number;
      let text: string;
      if (br.support === "post") {
        Fprime = ld.ref.Fc * CDg * ld.CF.Fc;
        text = `End-grain bearing on ${br.size} ${ld.species} ${ld.grade} post: F_c* = F_c C_D C_F (NDS 3.10.1)`;
      } else {
        const Cb = bearingAreaFactor(br.lb, atEnd);
        Fprime = ld.ref.Fcperp * Cb;
        text = `Bearing perpendicular to grain on ${br.size} ${ld.species} ${ld.grade}: F_c⊥' = F_c⊥ C_b, C_b = ${fmt(Cb, 3)} (NDS 3.10.2, 3.10.4)`;
      }
      out.wood = { R, combo: rc, A, f, Fprime, ratio: f / Fprime, text };
      checks.push({
        name: `Bearing on wood at ${supportName(i)} (NDS 3.10)`,
        demand: f,
        capacity: Fprime,
        ratio: f / Fprime,
        pass: f <= Fprime,
        combo: rc,
        CD: br.support === "post" ? CDg : 1,
        unit: "psi",
      });
    }
    return out;
  });

  // deflection (service): transient parts of the ASD gravity combinations and D + transient
  const lim = resolveDeflection(b.deflection);
  const Denv = patternEnvelope(analysis, "D", "defl");
  const Tenv = {} as Record<LoadType, { max: number[]; min: number[] }>;
  for (const t of TRANSIENT) Tenv[t] = patternEnvelope(analysis, t, "defl");
  const sets: Array<{ label: string; f: Partial<Record<LoadType, number>> }> = [];
  for (const c of asd) {
    const f: Partial<Record<LoadType, number>> = {};
    for (const t of TRANSIENT) if (present[t] && (c.factors[t] ?? 0) !== 0) f[t] = c.factors[t];
    if (!Object.keys(f).length) continue;
    const label = TRANSIENT.filter((t) => f[t])
      .map((t) => `${f[t] === 1 ? "" : f[t]}${t}`)
      .join(" + ");
    if (!sets.some((s) => s.label === label)) sets.push({ label, f });
  }
  const deflection: SteelDeflection[] = analysis.segments.map(([a, e], k) => {
    const cant =
      (k === 0 && (b.leftCantilever ?? 0) > 0) || (k === analysis.segments.length - 1 && (b.rightCantilever ?? 0) > 0);
    const L = (cant ? 2 : 1) * (e - a) * 12;
    let live = 0;
    let liveSource = "—";
    let tot = 0;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < a - 1e-9 || xs[i] > e + 1e-9) continue;
      const d = Denv.max[i];
      tot = Math.max(tot, Math.abs(d));
      for (const s of sets) {
        let down = 0;
        let up = 0;
        for (const t of TRANSIENT) {
          const f = s.f[t] ?? 0;
          down += f * Tenv[t].max[i];
          up += f * Tenv[t].min[i];
        }
        const lv = Math.max(Math.abs(down), Math.abs(up));
        if (lv > live) {
          live = lv;
          liveSource = s.label;
        }
        tot = Math.max(tot, Math.abs(d + down), Math.abs(d + up));
      }
    }
    return {
      segment: [a, e],
      cantilever: cant,
      live,
      liveSource,
      liveLimit: L / lim.live,
      total: tot,
      totalLimit: L / lim.total,
    };
  });
  for (const d of deflection) {
    if (d.live > 0)
      checks.push({
        name: `Deflection, transient (${d.liveSource}) — ${fmt(d.segment[0], 2)}–${fmt(d.segment[1], 2)} ft`,
        category: "serviceability",
        demand: d.live,
        capacity: d.liveLimit,
        ratio: d.live / d.liveLimit,
        pass: d.live <= d.liveLimit,
        combo: d.liveSource,
        CD: 1,
        unit: "in",
      });
    checks.push({
      name: `Deflection, total — ${fmt(d.segment[0], 2)}–${fmt(d.segment[1], 2)} ft`,
      category: "serviceability",
      demand: d.total,
      capacity: d.totalLimit,
      ratio: d.total / d.totalLimit,
      pass: d.total <= d.totalLimit,
      combo: "D + transient",
      CD: 1,
      unit: "in",
    });
  }

  // reactions by type (pattern maximum) and ASD extremes for wood supports
  const reactions: MemberReaction[] = sup.map((xsup, i) => {
    const v = zeroLoads();
    for (const t of LOAD_TYPES) {
      const pats = analysis.patterns[t];
      v[t] = pats ? pats.reduce((s, p) => s + Math.max(0, p.R[i]), 0) : analysis.byType[t].R[i];
    }
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of asd) {
      const up = comboReaction(analysis, c, i, 1);
      const dn = comboReaction(analysis, c, i, -1);
      if (up > maxDown) {
        maxDown = up;
        maxDownCombo = c.label;
      }
      if (dn < minNet) {
        minNet = dn;
        minNetCombo = c.label;
      }
    }
    return { support: i, name: supportName(i), x: xsup, byType: v, maxDown, maxDownCombo, minNet, minNetCombo };
  });

  const flags: string[] = [];
  if (shape.family === "C")
    flags.push(
      "Channel loaded through the web plane: load assumed applied at the shear center or the channel braced against twist — VERIFY connection detail (torsion not checked)",
    );
  if (b.fixedLeft || b.fixedRight)
    flags.push("Fixed end(s): the support connection must develop the end moment — design the moment connection");
  const assumptions: AssumptionEntry[] = [
    fromDefault("Section properties", `${shape.name}: ${shape.source}`, shape.source, !shape.checked),
    fromDefault("Material", `${gr.label}: F_y = ${Fy} ksi, F_u = ${gr.Fu} ksi`, "AISC Manual Table 2-4"),
    fromDefault("Design method", methodRef(b.method), "AISC 360 §B3"),
    fromDefault(
      "Lateral bracing",
      b.Lb > 0
        ? `Compression flange unbraced length L_b = ${fmt(b.Lb, 2)} ft (both flanges)`
        : "Compression flange continuously braced",
      "engineer",
      b.Lb === 0,
    ),
  ];
  const Mdiag = envelope(analysis, gm.combo, "M", 1).map((v, i) => {
    const n = envelope(analysis, gm.combo, "M", -1)[i];
    return Math.abs(n) > Math.abs(v) ? n / 1000 : v / 1000;
  });
  const Vdiag = analysis.x.map((_, i) => {
    let s = 0;
    for (const t of LOAD_TYPES) s += (gm.combo.factors[t] ?? 0) * analysis.byType[t].VR[i];
    return s / 1000;
  });
  return {
    id: b.id,
    mark: b.mark,
    kind: "steelBeam",
    title: `Steel ${b.role === "lintel" ? "lintel" : b.role === "header" ? "header" : "beam"}`,
    callout: `${shape.name} ${gr.label}`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: lines,
    assumptions,
    flags,
    input: b,
    shape,
    Fy,
    Fu: gr.Fu,
    gradeLabel: gr.label,
    method: b.method,
    rows,
    shear,
    flexContinuous,
    bearingChecks,
    deflection,
    limits: { live: lim.live, total: lim.total },
    selfWeight: b.selfWeight ? shape.wt : 0,
    totalLength: total,
    supports: sup,
    diagram: { x: analysis.x, M: Mdiag, V: Vdiag },
  };
}

/* ===================================== SC ===================================== */

export interface SteelColumnInput {
  id: string;
  mark: string;
  description: string;
  shape: string;
  grade: string;
  method: SteelMethod;
  /** column height, ft */
  height: number;
  Kx: number;
  Ky: number;
  /** weak-axis unbraced length, ft (default: height) */
  Ly?: number;
  /** point loads at the top (links and entered); line loads are not used */
  extra: ExtraLoad[];
  /** eccentricity of the top load from the column axis, in: e_x causes M_y, e_y causes M_x */
  ex: number;
  ey: number;
  /** wind on the column (bending about x): pressure, psf × tributary width, ft */
  wind?: { psf: number; width: number };
  selfWeight: boolean;
  /** wood beam bearing on the cap plate */
  cap?: { length: number; width: number; species: Species; grade: Grade };
}

export interface SteelColumnRow {
  combo: Combination;
  Pr: number;
  Mx: number;
  My: number;
  V: number;
  B1x: number;
  B1y: number;
  Mrx: number;
  Mry: number;
  inter: InteractionResult;
  ratioV: number;
}

export interface SteelColumnResult extends MemberResultBase {
  kind: "steelColumn";
  input: SteelColumnInput;
  shape: SteelShape;
  Fy: number;
  Fu: number;
  gradeLabel: string;
  method: SteelMethod;
  comp: CompressionResult;
  Pc: number;
  fx: FlexureResult;
  fy: FlexureResult;
  Mcx: number;
  Mcy: number;
  shear: ShearResult;
  Vc: number;
  rows: SteelColumnRow[];
  P: LoadVector;
  wplf: number;
  cap?: { R: number; combo: string; A: number; f: number; Fprime: number; ratio: number };
}

export function designSteelColumn(ctx: DesignContext, c: SteelColumnInput): SteelColumnResult {
  const shape = steelShape(c.shape);
  const gr = steelGrade(c.grade);
  const Fy = gr.Fy;
  const E = E_STEEL;
  const L = c.height * 12;
  const P = zeroLoads();
  const lines: LoadLine[] = [];
  for (const e of c.extra) {
    if (e.kind !== "point") continue;
    P[e.type] += e.P ?? 0;
    lines.push({ type: e.type, label: e.label, expr: `${fmt(e.P ?? 0, 0)} lb`, value: e.P ?? 0, unit: "lb" });
  }
  if (c.selfWeight) {
    const w = shape.wt * c.height;
    P.D += w;
    lines.push({
      type: "D",
      label: `Self weight — ${shape.name}`,
      expr: `${fmt(shape.wt, 1)} plf × ${fmt(c.height, 2)} ft`,
      value: w,
      unit: "lb",
    });
  }
  const wplf = c.wind ? c.wind.psf * c.wind.width : 0;
  const W = loadVector({ W: wplf });
  if (wplf)
    lines.push({
      type: "W",
      label: "Wind on the column (strength level)",
      expr: `${fmt(c.wind!.psf, 1)} psf × ${fmt(c.wind!.width, 2)} ft`,
      value: wplf,
      unit: "plf",
    });
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(P[t]) > 1e-9) present[t] = true;
  if (wplf) present.W = true;
  const combos = steelCombos(ctx, c.method, present);
  const Lcx = c.Kx * L;
  const Lcy = c.Ky * (c.Ly ?? c.height) * 12;
  const comp = compression(shape, Fy, E, Lcx, Lcy);
  const Pc = available(comp.Pn, PHI.compression, c.method);
  const fx = flexureMajor(shape, Fy, E, shape.family === "W" ? Lcy : L, 1);
  const fy = flexureMinor(shape, Fy, E);
  const Mcx = available(fx.Mn, PHI.flexure, c.method) / 12;
  const Mcy = available(fy.Mn, PHI.flexure, c.method) / 12;
  const shear = shearMajor(shape, Fy, E);
  const Vc = available(shear.Vn, shear.factor, c.method);
  const rows: SteelColumnRow[] = combos.map((k) => {
    const Pr = combine(P, k) / 1000;
    const w = combine(W, k) / 1000; // kip/ft
    const Hl = c.height;
    // moment along the height: eccentric top moment varying linearly to zero at the pinned base, plus wind
    let Mx = 0;
    for (let s = 0; s <= 20; s++) {
      const x = (s / 20) * Hl;
      Mx = Math.max(Mx, Math.abs((Pr * c.ey) / 12) * (x / Hl) + (Math.abs(w) * x * (Hl - x)) / 2);
    }
    const My = Math.abs((Pr * c.ex) / 12);
    const V = Math.max((Math.abs(w) * Hl) / 2 + Math.abs((Pr * c.ey) / 12) / Hl, Math.abs((Pr * c.ex) / 12) / Hl);
    const CmX = wplf ? 1.0 : 0.6;
    const ax = amplifierB1(Math.max(Pr, 0), shape.Ix, Lcx, E, c.method, CmX);
    const ay = amplifierB1(Math.max(Pr, 0), shape.Iy, Lcy, E, c.method, 0.6);
    const Mrx = ax.B1 * Mx;
    const Mry = ay.B1 * My;
    const inter = interactionH1(Math.max(Pr, 0), Pc, Mrx, Mcx, Mry, Mcy);
    return { combo: k, Pr, Mx, My, V, B1x: ax.B1, B1y: ay.B1, Mrx, Mry, inter, ratioV: V / Vc };
  });
  const checks: Check[] = [];
  const ga = rows.reduce((a, r) => (r.Pr > a.Pr ? r : a), rows[0]);
  checks.push({
    name: "Axial compression (AISC Ch. E)",
    demand: ga.Pr,
    capacity: Pc,
    ratio: ga.Pr / Pc,
    pass: ga.Pr <= Pc,
    combo: ga.combo.label,
    CD: 1,
    unit: "kip",
  });
  const gi = rows.reduce((a, r) => (r.inter.ratio > a.inter.ratio ? r : a), rows[0]);
  checks.push({
    name: `Combined axial and flexure (AISC ${gi.inter.eq})`,
    demand: gi.inter.ratio,
    capacity: 1,
    ratio: gi.inter.ratio,
    pass: gi.inter.ratio <= 1,
    combo: gi.combo.label,
    CD: 1,
    unit: "",
  });
  const gs = rows.reduce((a, r) => (r.ratioV > a.ratioV ? r : a), rows[0]);
  if (gs.V > 0)
    checks.push({
      name: "Shear (AISC Ch. G)",
      demand: gs.V,
      capacity: Vc,
      ratio: gs.ratioV,
      pass: gs.ratioV <= 1,
      combo: gs.combo.label,
      CD: 1,
      unit: "kip",
    });
  const SR = Math.max(comp.SRx, comp.SRy);
  checks.push({
    name: "Slenderness L_c/r ≤ 200 (AISC E2 user note)",
    category: "detailing",
    demand: SR,
    capacity: 200,
    ratio: SR / 200,
    pass: SR <= 200,
    combo: "—",
    CD: 1,
    unit: "",
  });
  let cap: SteelColumnResult["cap"];
  if (c.cap) {
    const ld = lumberData(c.cap.species, c.cap.grade, "4x4", ndsOf(ctx));
    const asd = relevantCombinations(
      asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W }),
      present,
    );
    let R = 0;
    let rc = "";
    for (const k of asd) {
      const v = combine(P, k);
      if (v > R) {
        R = v;
        rc = k.label;
      }
    }
    const A = c.cap.length * c.cap.width;
    const Cb = bearingAreaFactor(c.cap.length, false);
    const Fprime = ld.ref.Fcperp * Cb;
    cap = { R, combo: rc, A, f: R / A, Fprime, ratio: R / A / Fprime };
    checks.push({
      name: "Wood beam bearing on cap plate (NDS 3.10.2)",
      demand: R / A,
      capacity: Fprime,
      ratio: cap.ratio,
      pass: cap.ratio <= 1,
      combo: rc,
      CD: 1,
      unit: "psi",
    });
  }
  const asdAll = relevantCombinations(
    asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W }),
    present,
  );
  let maxDown = -Infinity;
  let maxDownCombo = "";
  let minNet = Infinity;
  let minNetCombo = "";
  for (const k of asdAll) {
    const v = combine(P, k);
    if (v > maxDown) {
      maxDown = v;
      maxDownCombo = k.label;
    }
    if (v < minNet) {
      minNet = v;
      minNetCombo = k.label;
    }
  }
  const baseShear = loadVector({ W: (wplf * c.height) / 2 });
  return {
    id: c.id,
    mark: c.mark,
    kind: "steelColumn",
    title: "Steel column",
    callout: `${shape.name} ${gr.label}, ${fmt(c.height, 2)} ft`,
    pass: checks.every((x) => x.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      { support: 0, name: "Base", x: 0, byType: P, maxDown, maxDownCombo, minNet, minNetCombo },
      {
        support: 1,
        name: "Base shear",
        x: 0,
        byType: baseShear,
        maxDown: 0,
        maxDownCombo: "—",
        minNet: 0,
        minNetCombo: "—",
      },
    ],
    loadLines: lines,
    assumptions: [
      fromDefault("Section properties", `${shape.name}: ${shape.source}`, shape.source, !shape.checked),
      fromDefault("Material", `${gr.label}: F_y = ${Fy} ksi, F_u = ${gr.Fu} ksi`, "AISC Manual Table 2-4"),
      fromDefault("Design method", methodRef(c.method), "AISC 360 §B3"),
      fromDefault(
        "End conditions",
        `Pinned top and base; K_x = ${c.Kx}, K_y = ${c.Ky}; base moment not developed (pinned base plate)`,
        "engineer",
      ),
    ],
    flags: c.ex || c.ey ? ["Eccentric beam bearing included as an end moment at the top of the column"] : [],
    input: c,
    shape,
    Fy,
    Fu: gr.Fu,
    gradeLabel: gr.label,
    method: c.method,
    comp,
    Pc,
    fx,
    fy,
    Mcx,
    Mcy,
    shear,
    Vc,
    rows,
    P,
    wplf,
    cap,
  };
}

/* ===================================== BP ===================================== */

export interface BasePlateMemberInput {
  id: string;
  mark: string;
  description: string;
  method: SteelMethod;
  column: string;
  sourceMark?: string;
  /** unfactored base forces by type: axial (lb, + compression), moment (lb-ft), shear (lb) */
  P: LoadVector;
  M: LoadVector;
  V: LoadVector;
  plate: { N: number; B: number; tp: number; grade: string };
  rod: {
    d: number;
    steel: number;
    nx: number;
    ny: number;
    sx: number;
    sy: number;
    /** rod centre to plate edge in the moment direction, in */
    e1: number;
    hef: number;
    type: "headed" | "hooked";
    Abrg: number;
    eh: number;
    washer: number;
    groutPad: boolean;
    nShear?: number;
  };
  foundation: { edges: [number, number, number, number]; ha: number; cracked: boolean; condition: "A" | "B" };
  weld: { w: number; FEXX: number };
  fc: number;
  seismic: boolean;
}

export interface BasePlateRow {
  combo: Combination;
  P: number;
  M: number;
  V: number;
  plate: BasePlateResult;
  anchors: AnchorGroupResult;
  ratio: number;
}

export interface BasePlateMemberResult extends MemberResultBase {
  kind: "basePlate";
  input: BasePlateMemberInput;
  col: SteelShape;
  rows: BasePlateRow[];
  govPlate: BasePlateRow;
  govAnchor: BasePlateRow;
  A2: number;
  FyPlate: number;
  rodSteel: (typeof ANCHOR_STEELS)[number];
}

export function designBasePlateMember(ctx: DesignContext, i: BasePlateMemberInput): BasePlateMemberResult {
  const col = steelShape(i.column);
  const pg = steelGrade(i.plate.grade);
  const rodSteel = ANCHOR_STEELS[i.rod.steel] ?? ANCHOR_STEELS[0];
  const { N, B } = i.plate;
  const [x1, x2, y1, y2] = i.foundation.edges;
  const lmin = Math.max(0, Math.min(x1 - N / 2, x2 - N / 2, y1 - B / 2, y2 - B / 2));
  const A2 = (N + 2 * lmin) * (B + 2 * lmin);
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(i.P[t]) + Math.abs(i.M[t]) + Math.abs(i.V[t]) > 1e-9) present[t] = true;
  const combos = steelCombos(ctx, i.method, present);
  const n = i.rod.nx * i.rod.ny;
  const rows: BasePlateRow[] = combos.map((c) => {
    const P = combine(i.P, c) / 1000;
    const M = (Math.abs(combine(i.M, c)) * 12) / 1000;
    const V = Math.abs(combine(i.V, c)) / 1000;
    const plate = designBasePlate(
      {
        method: i.method,
        col,
        N,
        B,
        tp: i.plate.tp,
        Fy: pg.Fy,
        fc: i.fc / 1000,
        A2,
        rod: {
          d: i.rod.d,
          Fu: rodSteel.futa / 1000,
          nTension: P <= 0 && M === 0 ? n : i.rod.ny,
          nShear: i.rod.nShear ?? n,
          e1: i.rod.e1,
          groutPad: i.rod.groutPad,
          washer: i.rod.washer,
        },
        weld: i.weld,
      },
      { P, M, V },
    );
    const nT = P <= 0 && M === 0 ? n : i.rod.ny;
    const anchors = designAnchorGroup(
      {
        d: i.rod.d,
        steel: rodSteel,
        type: i.rod.type,
        Abrg: i.rod.Abrg,
        eh: i.rod.eh,
        hef: i.rod.hef,
        nx: i.rod.nx,
        ny: i.rod.ny,
        sx: i.rod.sx,
        sy: i.rod.sy,
        edges: i.foundation.edges,
        ha: i.foundation.ha,
        fc: i.fc,
        cracked: i.foundation.cracked,
        condition: i.foundation.condition,
        seismic: i.seismic && !!present.E,
        groutPad: i.rod.groutPad,
        nShear: i.rod.nShear,
      },
      { Nua: plate.T * 1000, nTension: nT, Vua: V * 1000 },
    );
    if (i.method === "ASD") {
      // ACI 318 strength design: ASD forces are converted to strength level by 1.5 (conservative, noted)
      anchors.ratio *= 1.5;
    }
    return { combo: c, P, M, V, plate, anchors, ratio: Math.max(plate.ratio, anchors.ratio) };
  });
  const govPlate = rows.reduce((a, r) => (r.plate.ratio > a.plate.ratio ? r : a), rows[0]);
  const govAnchor = rows.reduce((a, r) => (r.anchors.ratio > a.anchors.ratio ? r : a), rows[0]);
  const gp = govPlate.plate;
  const checks: Check[] = [
    {
      name: "Plate thickness (AISC DG1)",
      demand: gp.tReq,
      capacity: i.plate.tp,
      ratio: gp.tReq / i.plate.tp,
      pass: gp.tReq <= i.plate.tp + 1e-9,
      combo: govPlate.combo.label,
      CD: 1,
      unit: "in",
    },
    {
      name: "Concrete bearing (AISC J8 / DG1)",
      demand: gp.bearingRatio,
      capacity: 1,
      ratio: Math.max(...rows.map((r) => r.plate.bearingRatio)),
      pass: rows.every((r) => r.plate.bearingRatio <= 1),
      combo: rows.reduce((a, r) => (r.plate.bearingRatio > a.plate.bearingRatio ? r : a)).combo.label,
      CD: 1,
      unit: "",
    },
    {
      name: "Anchor rods, tension + shear / bending (AISC J3.7)",
      demand: Math.max(...rows.map((r) => r.plate.rod.ratio)),
      capacity: 1,
      ratio: Math.max(...rows.map((r) => r.plate.rod.ratio)),
      pass: rows.every((r) => r.plate.rod.ratio <= 1),
      combo: rows.reduce((a, r) => (r.plate.rod.ratio > a.plate.rod.ratio ? r : a)).combo.label,
      CD: 1,
      unit: "",
    },
    {
      name: `Anchorage to concrete (ACI 318 Ch. 17${govAnchor.anchors.tensionGov || govAnchor.anchors.shearGov ? ", " + (govAnchor.anchors.ratio === govAnchor.anchors.tensionGov?.ratio ? govAnchor.anchors.tensionGov.label.toLowerCase() : (govAnchor.anchors.shearGov?.label.toLowerCase() ?? "interaction")) : ""})`,
      demand: govAnchor.anchors.ratio,
      capacity: 1,
      ratio: govAnchor.anchors.ratio,
      pass: govAnchor.anchors.ratio <= 1,
      combo: govAnchor.combo.label,
      CD: 1,
      unit: "",
    },
    {
      name: "Column-to-plate fillet weld (AISC J2.4)",
      demand: Math.max(...rows.map((r) => r.plate.weld.ratio)),
      capacity: 1,
      ratio: Math.max(...rows.map((r) => r.plate.weld.ratio)),
      pass: rows.every((r) => r.plate.weld.ratio <= 1),
      combo: rows.reduce((a, r) => (r.plate.weld.ratio > a.plate.weld.ratio ? r : a)).combo.label,
      CD: 1,
      unit: "",
    },
  ];
  const assumptions: AssumptionEntry[] = [
    fromDefault("Base plate", `${N} × ${B} × ${i.plate.tp} in. ${pg.label}`, "engineer"),
    fromDefault(
      "Anchor rods",
      `(${n}) ${i.rod.d} in. ${rodSteel.label}, ${i.rod.type === "headed" ? "headed / nut" : "hooked"}, h_ef = ${i.rod.hef} in.`,
      "engineer",
    ),
    fromDefault(
      "Concrete",
      `f'c = ${i.fc} psi, ${i.foundation.cracked ? "cracked" : "uncracked"}, Condition ${i.foundation.condition} (φ ${i.foundation.condition === "A" ? "0.75" : "0.70"})`,
      "ACI 318 Table 17.5.3",
    ),
  ];
  if (i.method === "ASD")
    assumptions.push(
      fromDefault(
        "Anchorage method",
        "ACI 318 Ch. 17 is strength design; ASD anchor demands × 1.5 for the anchor checks",
        "conservative conversion",
        true,
      ),
    );
  if (i.seismic && present.E)
    assumptions.push(
      fromDefault("Seismic anchorage", "Concrete-governed strengths × 0.75 (ACI 318 17.10.5.4)", "ACI 318 §17.10"),
    );
  return {
    id: i.id,
    mark: i.mark,
    kind: "basePlate",
    title: "Column base plate and anchor rods",
    callout: `${N} × ${B} × ${i.plate.tp} in. plate, (${n}) ${i.rod.d} in. anchor rods`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Foundation",
        x: 0,
        byType: i.P,
        maxDown: 0,
        maxDownCombo: "—",
        minNet: 0,
        minNetCombo: "—",
      },
    ],
    loadLines: LOAD_TYPES.flatMap((t) => {
      const from = i.sourceMark ? ` — from ${i.sourceMark}` : "";
      const out: LoadLine[] = [];
      if (Math.abs(i.P[t]) > 1e-9)
        out.push({
          type: t,
          label: `Axial P (+ compression)${from}`,
          expr: "base reaction",
          value: i.P[t],
          unit: "lb",
        });
      if (Math.abs(i.V[t]) > 1e-9)
        out.push({ type: t, label: `Shear V${from}`, expr: "base reaction", value: i.V[t], unit: "lb" });
      if (Math.abs(i.M[t]) > 1e-9)
        out.push({ type: t, label: "Moment M (entered)", expr: "base moment", value: i.M[t], unit: "lb-ft" });
      return out;
    }),
    assumptions,
    flags: [],
    input: i,
    col,
    rows,
    govPlate,
    govAnchor,
    A2,
    FyPlate: pg.Fy,
    rodSteel,
  };
}
