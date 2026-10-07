/**
 * NDS wood bending-member design (ASD) for sawn, built-up, glulam and SCL members.
 *
 *  - Bending  — NDS 3.3: Fb' = Fb·C_D·C_M·C_t·C_L·C_F·C_fu·C_i·C_r (glulam: lesser of C_L and C_V, 5.3.6)
 *  - Beam stability — NDS 3.3.3, Table 3.3.3 (loading not specified), R_B ≤ 50
 *  - Shear    — NDS 3.4: f_v = 1.5 V / A, V taken at d from the support face (3.4.3.1);
 *               tension-face notch at bearing (3.4.3.2) when a remaining depth is given
 *  - Bearing  — NDS 3.10.2 with C_b (3.10.4); C_D does not apply to F_c⊥
 *  - Deflection — NDS 3.5 with long-term creep K_cr (3.5.2); limits per IBC Table 1604.3,
 *               cantilevers checked with ℓ = 2 × cantilever length
 * Every ASD combination of ASCE 7 §2.4 is evaluated with its own C_D (NDS Table 2.3.2);
 * floor and roof live loads are pattern-loaded on continuous members (ASCE 7 §4.3.3).
 */

import {
  analyseBeam,
  memberLength,
  patternEnvelope,
  staticsAt,
  type BeamAnalysis,
  type BeamGeometry,
  type BeamLoad,
} from "../analysis/beam";
import { asdCombinations, loadDurationFactor, relevantCombinations, type Combination } from "../core/combos";
import { LOAD_TYPES, type LoadType, type LoadVector, zeroLoads } from "../core/loads";
import { fromDefault, fromOverride, type AssumptionEntry } from "../core/provenance";
import { fmt, fmtInFraction } from "../core/fmt";
import { lumberData, type Grade, type Species } from "../data/sawn";
import { GLULAM, SCL } from "../data/engineered";
import { parseNominal, sawnSection, woodDensity } from "../data/sections";

export type WoodMaterial =
  | { kind: "sawn"; species: Species; grade: Grade; size: string; plies: number }
  | { kind: "glulam"; combo: string; b: number; d: number }
  | { kind: "scl"; product: string; plies: number; plyWidth: number; d: number };

export interface ResolvedWood {
  kind: "sawn" | "glulam" | "scl";
  label: string;
  speciesLabel: string;
  b: number;
  d: number;
  plies: number;
  bPly: number;
  A: number;
  S: number;
  I: number;
  Fb: number;
  FbNeg: number;
  Fv: number;
  Fcperp: number;
  Fc: number;
  Ft: number;
  E: number;
  Emin: number;
  /** modulus for lateral-torsional stability: E_min (glulam: E_y,min, NDS 3.3.3.8) */
  EminStab: number;
  /** nominal depth / breadth for the NDS 4.4.1.2 approximate rules (sawn lumber only) */
  nominalRatio?: number;
  /** bending size / depth factor (sawn C_F; SCL depth factor). Glulam uses C_V instead. */
  CF: number;
  Cfu: number;
  CM: { Fb: number; Fv: number; Fcperp: number; E: number };
  density: number;
  selfWeight: number;
  G: number;
  tableId: string;
  tableLabel: string;
  sizeClass: string;
  volumeX?: number;
}

export interface WoodConditions {
  wetService: boolean;
  incised: boolean;
  /** repetitive-member eligibility (NDS 4.3.9) — joists, rafters, studs ≤ 24 in. o.c. */
  repetitive: boolean;
  flatUse: boolean;
}

export interface WoodBeamInput {
  material: WoodMaterial;
  geometry: BeamGeometry;
  loads: BeamLoad[];
  includeSelfWeight: boolean;
  conditions: WoodConditions;
  /** unbraced length of the compression edge, ft (0 = continuously braced): top for +M, bottom for −M */
  lu: { top: number; bottom: number };
  /** bearing length at each support, in */
  bearingLengths: number[];
  /** span / limit denominators — live (L, Lr or S) and total (K_cr·D + live) */
  defl: { live: number; total: number };
  Kcr: number;
  /** remaining depth at a tension-face notch over the supports (birdsmouth), in */
  notchDepth?: number;
  /** manual C_D override (flagged on the sheet) */
  cdOverride?: number;
  /** manual C_r override (flagged on the sheet) */
  crOverride?: number;
  /** sawn lumber braced per the NDS 4.4.1.2 approximate rules → C_L = 1.0 (bracing noted on the sheet) */
  rule441?: boolean;
  /** S_DS for the ASCE 7 §2.4.5 seismic combinations, when E acts on the member */
  SDS?: number;
  nds: "NDS-2018" | "NDS-2024";
}

export interface Check {
  name: string;
  demand: number;
  capacity: number;
  ratio: number;
  pass: boolean;
  combo: string;
  CD: number;
  unit: string;
}

export interface ComboRow {
  combo: Combination;
  CD: number;
  Mpos: number;
  Mneg: number;
  V: number;
  Rmax: number;
  FbPrime: number;
  FbPrimeNeg: number;
  FvPrime: number;
  CLpos: number;
  CLneg: number;
  fbRatio: number;
  fbRatioNeg: number;
  fvRatio: number;
}

export interface BearingCheck {
  support: number;
  x: number;
  R: number;
  combo: string;
  lb: number;
  Cb: number;
  fcperp: number;
  FcperpPrime: number;
  lbReq: number;
  ratio: number;
  pass: boolean;
}

export interface DeflectionCheck {
  segment: number;
  kind: "span" | "cantilever";
  length: number;
  dead: number;
  live: number;
  liveSource: string;
  total: number;
  totalSource: string;
  liveLimit: number;
  totalLimit: number;
  liveRatio: number;
  totalRatio: number;
  livePass: boolean;
  totalPass: boolean;
  limitLength: number;
}

export interface SupportReaction {
  support: number;
  x: number;
  /** unfactored reaction by load type (full loading), lb */
  byType: LoadVector;
  /** pattern-envelope maximum by type, lb */
  maxByType: LoadVector;
  maxDown: number;
  maxDownCombo: string;
  minNet: number;
  minNetCombo: string;
}

export interface WoodBeamResult {
  input: WoodBeamInput;
  mat: ResolvedWood;
  analysis: BeamAnalysis;
  present: Partial<Record<LoadType, boolean>>;
  combos: ComboRow[];
  factors: {
    CM: ResolvedWood["CM"];
    Ct: number;
    Ci: number;
    CiE: number;
    Cr: number;
    CF: number;
    Cfu: number;
    CV?: number;
    luTop: number;
    luBottom: number;
    leTop: number;
    leBottom: number;
    RBTop: number;
    RBBottom: number;
    EminPrime: number;
    FbE_top: number;
    FbE_bottom: number;
    Eprime: number;
    /** "rational" = NDS 3.3.3 from l_u; "rule-4.4.1" = C_L = 1.0 by NDS 4.4.1.2 */
    stability: "rational" | "rule-4.4.1";
    rule441Text?: string;
    /** glulam shear reduction factor at notches (NDS 5.3.10) */
    Cvr?: number;
  };
  bending: Check;
  bendingNeg?: Check;
  shear: Check & { x: number; method: string };
  notch?: Check & { dn: number };
  bearing: BearingCheck[];
  deflection: DeflectionCheck[];
  reactions: SupportReaction[];
  governing: Check;
  checks: Check[];
  pass: boolean;
  assumptions: AssumptionEntry[];
  /** governing-combination diagrams — max / min envelopes where live load is pattern-loaded */
  diagrams: {
    x: number[];
    Mmax: number[];
    Mmin: number[];
    /** shear polyline: stations repeated (left / right of each station) */
    shearX: number[];
    Vmax: number[];
    Vmin: number[];
    /** total deflection for the governing deflection set, in (down +) */
    defl: number[];
    comboLabel: string;
    deflLabel: string;
    patterned: boolean;
  };
  simpleUDL: boolean;
  wTotalUDL?: number;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function resolveWood(m: WoodMaterial, nds: "NDS-2018" | "NDS-2024"): ResolvedWood {
  if (m.kind === "sawn") {
    const data = lumberData(m.species, m.grade, m.size, nds);
    const sec = sawnSection(m.size, Math.max(1, m.plies));
    const A = sec.b * sec.d;
    const density = woodDensity(data.G);
    return {
      kind: "sawn",
      label: `${m.plies > 1 ? `(${m.plies}) ` : ""}${m.size} ${m.species} ${m.grade}`,
      speciesLabel: `${m.species} ${m.grade}`,
      b: sec.b,
      d: sec.d,
      plies: sec.plies,
      bPly: sec.bPly,
      A,
      S: (sec.b * sec.d ** 2) / 6,
      I: (sec.b * sec.d ** 3) / 12,
      Fb: data.ref.Fb,
      FbNeg: data.ref.Fb,
      Fv: data.ref.Fv,
      Fcperp: data.ref.Fcperp,
      Fc: data.ref.Fc,
      Ft: data.ref.Ft,
      E: data.ref.E,
      Emin: data.ref.Emin,
      EminStab: data.ref.Emin,
      nominalRatio: nominalRatio(m.size, m.plies),
      CF: data.CF.Fb,
      Cfu: data.Cfu,
      CM: { Fb: data.CM.Fb, Fv: data.CM.Fv, Fcperp: data.CM.Fcperp, E: data.CM.E },
      density,
      selfWeight: (density * A) / 144,
      G: data.G,
      tableId: data.tableId,
      tableLabel: data.tableLabel,
      sizeClass: data.sizeClass,
    };
  }
  if (m.kind === "glulam") {
    const g = GLULAM[m.combo];
    if (!g) throw new Error(`Unknown glulam combination ${m.combo}`);
    const A = m.b * m.d;
    return {
      kind: "glulam",
      label: `${fmtInFraction(m.b)}″ × ${fmtInFraction(m.d)}″ GLB ${g.id}`,
      speciesLabel: g.label,
      b: m.b,
      d: m.d,
      plies: 1,
      bPly: m.b,
      A,
      S: (m.b * m.d ** 2) / 6,
      I: (m.b * m.d ** 3) / 12,
      Fb: g.Fbx_pos,
      FbNeg: g.Fbx_neg,
      Fv: g.Fvx,
      Fcperp: g.Fcperp_x,
      Fc: g.Fc,
      Ft: g.Ft,
      E: g.Ex,
      Emin: g.Ex_min,
      EminStab: g.Ey_min,
      CF: 1,
      Cfu: 1,
      CM: { Fb: 1, Fv: 1, Fcperp: 1, E: 1 },
      density: g.density,
      selfWeight: (g.density * A) / 144,
      G: g.G,
      tableId: "nds-5A",
      tableLabel: "NDS Supplement Table 5A — structural glued laminated timber",
      sizeClass: "Glued laminated timber, bending about x–x",
      volumeX: g.x,
    };
  }
  const s = SCL[m.product];
  if (!s) throw new Error(`Unknown SCL product ${m.product}`);
  const b = m.plies * m.plyWidth;
  const A = b * m.d;
  const depthFactor = Math.pow(12 / m.d, s.fbDepthExp);
  return {
    kind: "scl",
    label: `${m.plies > 1 ? `(${m.plies}) ` : ""}${fmtInFraction(m.plyWidth)}″ × ${fmtInFraction(m.d)}″ ${s.id}`,
    speciesLabel: s.label,
    b,
    d: m.d,
    plies: m.plies,
    bPly: m.plyWidth,
    A,
    S: (b * m.d ** 2) / 6,
    I: (b * m.d ** 3) / 12,
    Fb: s.Fb,
    FbNeg: s.Fb,
    Fv: s.Fv,
    Fcperp: s.Fcperp,
    Fc: s.Fc,
    Ft: s.Ft,
    E: s.E,
    Emin: s.Emin,
    EminStab: s.Emin,
    CF: depthFactor,
    Cfu: 1,
    CM: { Fb: 1, Fv: 1, Fcperp: 1, E: 1 },
    density: s.density,
    selfWeight: (s.density * A) / 144,
    G: s.G,
    tableId: "scl-generic",
    tableLabel: `Manufacturer values — ${s.label} (${s.esr})`,
    sizeClass: "Structural composite lumber, edgewise bending",
  };
}

/** Nominal depth / breadth of a sawn section (all plies), as used by NDS 4.4.1.2. */
export function nominalRatio(size: string, plies = 1): number {
  const { t, w } = parseNominal(size);
  return w / (t * Math.max(1, plies));
}

/** NDS 4.4.1.2 approximate lateral-support rules for rectangular sawn lumber (nominal d/b). */
export function nds441Rule(ratio: number): { ok: boolean; text: string } {
  if (ratio <= 2) return { ok: true, text: "d/b ≤ 2: no lateral support required" };
  if (ratio <= 4)
    return {
      ok: true,
      text: "2 < d/b ≤ 4: ends held in position by full-depth blocking, bridging, hangers, nailing or bolting to other framing",
    };
  if (ratio <= 5)
    return {
      ok: true,
      text: "4 < d/b ≤ 5: compression edge held in line for its entire length by sheathing or subflooring; ends held in position at bearing",
    };
  if (ratio <= 6)
    return {
      ok: true,
      text: "5 < d/b ≤ 6: bridging, full-depth solid blocking or diagonal cross bracing at intervals ≤ 8 ft; compression edge held in line by sheathing or subflooring; ends held in position at bearing",
    };
  if (ratio <= 7)
    return {
      ok: true,
      text: "6 < d/b ≤ 7: both edges held in line for their entire length; ends held in position at bearing",
    };
  return { ok: false, text: "d/b > 7: NDS 4.4.1.2 rules do not apply — C_L calculated per NDS 3.3.3" };
}

/** NDS Table 3.3.3 effective length — loading conditions not specified (conservative general case). */
export function effectiveLength(luIn: number, dIn: number): number {
  if (luIn <= 0) return 0;
  const r = luIn / dIn;
  if (r < 7) return 2.06 * luIn;
  if (r <= 14.3) return 1.63 * luIn + 3 * dIn;
  return 1.84 * luIn;
}

/** NDS Eq. 3.3-6 beam stability factor. */
export function beamStabilityFactor(FbE: number, FbStar: number): number {
  if (!(FbE > 0) || !(FbStar > 0)) return 1;
  const a = FbE / FbStar;
  const t = (1 + a) / 1.9;
  return t - Math.sqrt(t * t - a / 0.95);
}

/** NDS 5.3.6 volume factor for glulam (L between zero-moment points ≈ span, ft). */
export function volumeFactor(L: number, d: number, b: number, x: number): number {
  const f = Math.pow(21 / L, 1 / x) * Math.pow(12 / d, 1 / x) * Math.pow(5.125 / Math.min(b, 10.75), 1 / x);
  return Math.min(1, f);
}

/** NDS 3.10.4 bearing-area factor; 1.0 when bearing ≥ 6 in. or within 3 in. of the member end. */
export function bearingAreaFactor(lb: number, atEnd: boolean): number {
  if (atEnd || lb >= 6) return 1;
  return (lb + 0.375) / lb;
}

const TRANSIENT: LoadType[] = ["L", "Lr", "S"];

/** Printed transient part of a combination, e.g. "0.75L + 0.75S". */
function transientLabel(f: Partial<Record<LoadType, number>>): string {
  const parts = TRANSIENT.filter((t) => (f[t] ?? 0) !== 0).map(
    (t) => `${f[t] === 1 ? "" : fmt(f[t]!, 2).replace(/0+$/, "").replace(/\.$/, "")}${t}`,
  );
  return parts.length ? parts.join(" + ") : "—";
}

export function designWoodBeam(input: WoodBeamInput): WoodBeamResult {
  const mat = resolveWood(input.material, input.nds);
  const assumptions: AssumptionEntry[] = [];
  const g = input.geometry;
  const total = memberLength(g);

  const loads: BeamLoad[] = [...input.loads];
  if (input.includeSelfWeight)
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: mat.selfWeight, label: "Self weight" });

  // service factors
  const wet = input.conditions.wetService;
  if (wet && mat.kind !== "sawn") throw new Error("Wet service is not supported for glulam / SCL in this version");
  const CMFb = wet ? (mat.Fb * mat.CF <= 1150 ? 1 : mat.CM.Fb) : 1;
  const CM = wet ? { Fb: CMFb, Fv: mat.CM.Fv, Fcperp: mat.CM.Fcperp, E: mat.CM.E } : { Fb: 1, Fv: 1, Fcperp: 1, E: 1 };
  const Ct = 1;
  const incised = input.conditions.incised && mat.kind === "sawn";
  const Ci = incised ? 0.8 : 1;
  const CiE = incised ? 0.95 : 1;
  const CiPerp = 1;
  const crAuto = mat.kind === "sawn" && input.conditions.repetitive && mat.sizeClass.startsWith("Dimension") ? 1.15 : 1;
  const Cr = input.crOverride ?? crAuto;
  if (input.crOverride !== undefined && input.crOverride !== crAuto)
    assumptions.push(
      fromOverride(
        "Repetitive member factor",
        `C_r = ${fmt(Cr, 2)}`,
        `auto C_r = ${fmt(crAuto, 2)}`,
        "verify NDS 4.3.9 applicability",
      ),
    );
  const Cfu = input.conditions.flatUse ? mat.Cfu : 1;
  const Eprime = mat.E * CM.E * Ct * CiE;
  const EminPrime = mat.EminStab * CM.E * Ct * CiE;

  const analysis = analyseBeam(g, Eprime * mat.I, loads);
  const present: Partial<Record<LoadType, boolean>> = {};
  for (const t of LOAD_TYPES)
    present[t] = loads.some(
      (l) => l.type === t && (l.kind === "point" ? (l.P ?? 0) : Math.abs(l.w1 ?? 0) + Math.abs(l.w2 ?? 0)) !== 0,
    );
  present.D = true;
  const SDS = input.SDS ?? 1.0;
  if (present.E && input.SDS === undefined)
    assumptions.push(fromDefault("S_DS for seismic combinations", "S_DS = 1.00 (not given)", "assumed", true));
  const combos = relevantCombinations(
    asdCombinations({ SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );

  // beam stability: NDS 3.3.3 from l_u, or C_L = 1.0 by the NDS 4.4.1.2 rules for sawn lumber
  const rule = mat.kind === "sawn" && mat.nominalRatio !== undefined ? nds441Rule(mat.nominalRatio) : undefined;
  const useRule = !!input.rule441 && !!rule?.ok;
  if (input.rule441 && !useRule)
    assumptions.push(
      fromDefault("Lateral support", "NDS 4.4.1.2 rules not applicable — C_L calculated from l_u", "NDS 3.3.3", true),
    );
  if (useRule)
    assumptions.push(fromDefault("Lateral support", `C_L = 1.00 by NDS 4.4.1.2 — ${rule!.text}`, "NDS 4.4.1.2", true));
  const luTop = useRule ? 0 : input.lu.top * 12;
  const luBottom = useRule ? 0 : input.lu.bottom * 12;
  const leTop = effectiveLength(luTop, mat.d);
  const leBottom = effectiveLength(luBottom, mat.d);
  const RBTop = leTop > 0 ? Math.sqrt((leTop * mat.d) / (mat.b * mat.b)) : 0;
  const RBBottom = leBottom > 0 ? Math.sqrt((leBottom * mat.d) / (mat.b * mat.b)) : 0;
  const FbE_top = RBTop > 0 ? (1.2 * EminPrime) / (RBTop * RBTop) : Infinity;
  const FbE_bottom = RBBottom > 0 ? (1.2 * EminPrime) / (RBBottom * RBBottom) : Infinity;
  const spanForCV = Math.max(...g.spans, g.leftCantilever ?? 0, g.rightCantilever ?? 0);
  const CV = mat.kind === "glulam" ? volumeFactor(spanForCV, mat.d, mat.b, mat.volumeX ?? 10) : undefined;

  // envelopes per type
  const typeArrays = (field: "M" | "VL" | "VR" | "defl") => {
    const out = {} as Record<LoadType, { max: number[]; min: number[] }>;
    for (const t of LOAD_TYPES) out[t] = patternEnvelope(analysis, t, field);
    return out;
  };
  const Menv = typeArrays("M");
  const VLenv = typeArrays("VL");
  const VRenv = typeArrays("VR");
  const n = analysis.x.length;

  const comboField = (c: Combination, env: Record<LoadType, { max: number[]; min: number[] }>, sign: 1 | -1) => {
    const arr = new Array(n).fill(0);
    for (const t of LOAD_TYPES) {
      const f = c.factors[t] ?? 0;
      if (!f) continue;
      const src = f > 0 === sign > 0 ? env[t].max : env[t].min;
      for (let i = 0; i < n; i++) arr[i] += f * src[i];
    }
    return arr;
  };

  // shear check sections: at d from each support face on each loaded side
  const dFt = mat.d / 12;
  const sections: Array<{ x: number; side: "L" | "R"; support: number }> = [];
  analysis.supports.forEach((xs, i) => {
    if (xs + dFt < total - 1e-6) sections.push({ x: xs + dFt, side: "R", support: i });
    if (xs - dFt > 1e-6) sections.push({ x: xs - dFt, side: "L", support: i });
  });
  const pointWithinD = (support: number, side: "L" | "R") => {
    const xs = analysis.supports[support];
    return loads.some(
      (l) =>
        l.kind === "point" &&
        (side === "R" ? l.x! > xs + 1e-6 && l.x! < xs + dFt : l.x! < xs - 1e-6 && l.x! > xs - dFt),
    );
  };
  const shearAtSection = (c: Combination, x: number, side: "L" | "R") => {
    let vMax = 0;
    let vMin = 0;
    for (const t of LOAD_TYPES) {
      const f = c.factors[t] ?? 0;
      if (!f) continue;
      const pats = analysis.patterns[t];
      if (pats) {
        let pMax = 0;
        let pMin = 0;
        for (const p of pats) {
          const v = staticsAt(x, analysis.supports, p.R, p.loads, side).V;
          if (v > 0) pMax += v;
          else pMin += v;
        }
        vMax += f * pMax;
        vMin += f * pMin;
      } else {
        const r = analysis.byType[t];
        const v = staticsAt(x, analysis.supports, r.R, r.loads, side).V;
        vMax += f * v;
        vMin += f * v;
      }
    }
    return Math.max(Math.abs(vMax), Math.abs(vMin));
  };

  // reactions
  const reactionsByType = analysis.supports.map((_, i) => {
    const v = zeroLoads();
    const vmax = zeroLoads();
    for (const t of LOAD_TYPES) {
      v[t] = analysis.byType[t].R[i];
      const pats = analysis.patterns[t];
      vmax[t] = pats ? pats.reduce((s, p) => s + Math.max(0, p.R[i]), 0) : v[t];
    }
    return { v, vmax };
  });
  const comboReaction = (c: Combination, i: number, sign: 1 | -1) => {
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
  };

  const within = (x: number) => analysis.supports.some((xs) => Math.abs(x - xs) < dFt - 1e-9);

  const rows: Array<ComboRow & { Vx: number }> = combos.map((c) => {
    const CD = input.cdOverride ?? loadDurationFactor(c, present);
    const Mp = comboField(c, Menv, 1);
    const Mn = comboField(c, Menv, -1);
    const Mpos = Math.max(0, ...Mp);
    const Mneg = Math.min(0, ...Mn);
    const FbStarPos = mat.Fb * CD * CM.Fb * Ct * mat.CF * Ci * Cr;
    const FbStarNeg = mat.FbNeg * CD * CM.Fb * Ct * mat.CF * Ci * Cr;
    const CLpos = Number.isFinite(FbE_top) ? beamStabilityFactor(FbE_top, FbStarPos) : 1;
    const CLneg = Number.isFinite(FbE_bottom) ? beamStabilityFactor(FbE_bottom, FbStarNeg) : 1;
    const stabPos = mat.kind === "glulam" ? Math.min(CLpos, CV ?? 1) : CLpos;
    const stabNeg = mat.kind === "glulam" ? Math.min(CLneg, CV ?? 1) : CLneg;
    const FbPrime = FbStarPos * stabPos * Cfu;
    const FbPrimeNeg = FbStarNeg * stabNeg * Cfu;
    const FvPrime = mat.Fv * CD * CM.Fv * Ct * Ci;
    let V = 0;
    let Vx = 0;
    for (const s of sections) {
      // a point load inside d is not relieved — take the shear at the support face on that side
      const xs = analysis.supports[s.support];
      const at = pointWithinD(s.support, s.side) ? xs : s.x;
      const v = shearAtSection(c, at, s.side);
      if (v > V) {
        V = v;
        Vx = at;
      }
    }
    // shear anywhere beyond d from the supports (point loads inside spans)
    for (let i = 0; i < n; i++) {
      if (within(analysis.x[i])) continue;
      for (const env of [VLenv, VRenv]) {
        let vmax = 0;
        let vmin = 0;
        for (const t of LOAD_TYPES) {
          const f = c.factors[t] ?? 0;
          if (!f) continue;
          vmax += f * env[t].max[i];
          vmin += f * env[t].min[i];
        }
        const v = Math.max(Math.abs(vmax), Math.abs(vmin));
        if (v > V + 1e-9) {
          V = v;
          Vx = analysis.x[i];
        }
      }
    }
    const Rmax = Math.max(...analysis.supports.map((_, i) => comboReaction(c, i, 1)));
    const fb = (Mpos * 12) / mat.S;
    const fbN = (Math.abs(Mneg) * 12) / mat.S;
    const fv = (1.5 * V) / mat.A;
    return {
      combo: c,
      CD,
      Mpos,
      Mneg,
      V,
      Vx,
      Rmax,
      FbPrime,
      FbPrimeNeg,
      FvPrime,
      CLpos,
      CLneg,
      fbRatio: fb / FbPrime,
      fbRatioNeg: fbN / FbPrimeNeg,
      fvRatio: fv / FvPrime,
    };
  });

  const govBy = (k: "fbRatio" | "fbRatioNeg" | "fvRatio") => rows.reduce((a, b) => (b[k] > a[k] ? b : a), rows[0]);
  const gb = govBy("fbRatio");
  const bending: Check = {
    name: "Bending (positive moment)",
    demand: (gb.Mpos * 12) / mat.S,
    capacity: gb.FbPrime,
    ratio: gb.fbRatio,
    pass: gb.fbRatio <= 1,
    combo: gb.combo.label,
    CD: gb.CD,
    unit: "psi",
  };
  const anyNeg = rows.some((r) => r.Mneg < -1e-6);
  const gbn = govBy("fbRatioNeg");
  const bendingNeg: Check | undefined = anyNeg
    ? {
        name: "Bending (negative moment)",
        demand: (Math.abs(gbn.Mneg) * 12) / mat.S,
        capacity: gbn.FbPrimeNeg,
        ratio: gbn.fbRatioNeg,
        pass: gbn.fbRatioNeg <= 1,
        combo: gbn.combo.label,
        CD: gbn.CD,
        unit: "psi",
      }
    : undefined;
  const gv = govBy("fvRatio");
  const shear = {
    name: "Shear (NDS 3.4)",
    demand: (1.5 * gv.V) / mat.A,
    capacity: gv.FvPrime,
    ratio: gv.fvRatio,
    pass: gv.fvRatio <= 1,
    combo: gv.combo.label,
    CD: gv.CD,
    unit: "psi",
    x: gv.Vx,
    method: "V at d from the support face (NDS 3.4.3.1); full shear used where a point load lies within d",
  };

  // tension-face notch at the supports (birdsmouth / end notch)
  let notch: WoodBeamResult["notch"];
  let notchDepthCheck: Check | undefined;
  const Cvr = mat.kind === "glulam" && input.notchDepth ? 0.72 : undefined;
  if (input.notchDepth && input.notchDepth < mat.d) {
    const dn = input.notchDepth;
    let worst = { ratio: 0, V: 0, Vr: 0, combo: "", CD: 1 };
    for (const r of rows) {
      let Vsup = 0;
      analysis.supports.forEach((xs) => {
        for (const side of ["L", "R"] as const) {
          if ((side === "R" && xs >= total - 1e-6) || (side === "L" && xs <= 1e-6)) continue;
          Vsup = Math.max(Vsup, shearAtSection(r.combo, xs, side));
        }
      });
      const Vr = (2 / 3) * r.FvPrime * (Cvr ?? 1) * mat.b * dn * (dn / mat.d) ** 2;
      if (Vsup / Vr > worst.ratio) worst = { ratio: Vsup / Vr, V: Vsup, Vr, combo: r.combo.label, CD: r.CD };
    }
    notch = {
      name: "Notched shear at bearing (NDS 3.4.3.2)",
      demand: worst.V,
      capacity: worst.Vr,
      ratio: worst.ratio,
      pass: worst.ratio <= 1,
      combo: worst.combo,
      CD: worst.CD,
      unit: "lb",
      dn,
    };
    // notch depth limits: sawn d/4 at the ends (NDS 4.4.3.2); glulam lesser of d/10 and 3 in. (NDS 5.4.4.1); SCL per manufacturer
    const depth = mat.d - dn;
    const limit = mat.kind === "sawn" ? mat.d / 4 : mat.kind === "glulam" ? Math.min(mat.d / 10, 3) : 0;
    const ref =
      mat.kind === "sawn"
        ? "NDS 4.4.3.2"
        : mat.kind === "glulam"
          ? "NDS 5.4.4.1"
          : "manufacturer — not permitted without approval";
    notchDepthCheck = {
      name: `End notch depth (${ref})`,
      demand: depth,
      capacity: limit,
      ratio: limit > 0 ? depth / limit : Infinity,
      pass: depth <= limit + 1e-9,
      combo: "—",
      CD: 1,
      unit: "in",
    };
  }

  // bearing at each support (C_D does not apply to F_c⊥)
  const bearing: BearingCheck[] = analysis.supports.map((xs, i) => {
    let R = 0;
    let combo = "";
    for (const c of combos) {
      const v = comboReaction(c, i, 1);
      if (v > R) {
        R = v;
        combo = c.label;
      }
    }
    const lb = input.bearingLengths[i] ?? input.bearingLengths[input.bearingLengths.length - 1] ?? 1.5;
    const atEnd = xs <= 0.25 + 1e-6 || xs >= total - 0.25 - 1e-6;
    const Cb = bearingAreaFactor(lb, atEnd);
    const FcperpPrime = mat.Fcperp * CM.Fcperp * Ct * CiPerp * Cb;
    const fcperp = R / (mat.b * lb);
    const lbReq = R / (mat.b * mat.Fcperp * CM.Fcperp * Ct * CiPerp);
    return {
      support: i,
      x: xs,
      R,
      combo,
      lb,
      Cb,
      fcperp,
      FcperpPrime,
      lbReq,
      ratio: fcperp / FcperpPrime,
      pass: fcperp <= FcperpPrime,
    };
  });

  // deflection: transient part of each ASD gravity combination (L, Lr, S, 0.75L + 0.75Lr, 0.75L + 0.75S),
  // total = K_cr·D + transient part, checked per segment (cantilevers with ℓ = 2 × overhang)
  const Denv = patternEnvelope(analysis, "D", "defl");
  const Tenv = {} as Record<LoadType, { max: number[]; min: number[] }>;
  for (const t of TRANSIENT) Tenv[t] = patternEnvelope(analysis, t, "defl");
  const deflSets: Array<{ label: string; f: Partial<Record<LoadType, number>> }> = [];
  for (const c of combos) {
    const f: Partial<Record<LoadType, number>> = {};
    for (const t of TRANSIENT) if (present[t] && (c.factors[t] ?? 0) !== 0) f[t] = c.factors[t];
    if (!Object.keys(f).length) continue;
    const label = transientLabel(f);
    if (!deflSets.some((d) => d.label === label)) deflSets.push({ label, f });
  }
  if (!deflSets.length) deflSets.push({ label: "—", f: {} });
  const setCurves = deflSets.map((set) => {
    const down = new Array(n).fill(0);
    const up = new Array(n).fill(0);
    for (const t of TRANSIENT) {
      const f = set.f[t] ?? 0;
      if (!f) continue;
      for (let i = 0; i < n; i++) {
        down[i] += f * Tenv[t].max[i];
        up[i] += f * Tenv[t].min[i];
      }
    }
    return { set, down, up };
  });

  let deflGov = setCurves[0];
  let deflGovRatio = -1;
  const deflection: DeflectionCheck[] = analysis.segments.map(([a, b], k) => {
    const isCant =
      (k === 0 && (g.leftCantilever ?? 0) > 0) || (k === analysis.segments.length - 1 && (g.rightCantilever ?? 0) > 0);
    const len = b - a;
    const limitLength = isCant ? 2 * len : len;
    const liveLimit = (limitLength * 12) / input.defl.live;
    const totalLimit = (limitLength * 12) / input.defl.total;
    let live = 0;
    let liveSource = "—";
    let tot = 0;
    let totalSource = "D";
    let dead = 0;
    for (const cur of setCurves) {
      for (let i = 0; i < n; i++) {
        const x = analysis.x[i];
        if (x < a - 1e-9 || x > b + 1e-9) continue;
        const dd = Denv.max[i];
        dead = Math.max(dead, Math.abs(dd));
        const lv = Math.max(Math.abs(cur.down[i]), Math.abs(cur.up[i]));
        if (lv > live) {
          live = lv;
          liveSource = cur.set.label;
        }
        const tv = Math.max(Math.abs(input.Kcr * dd + cur.down[i]), Math.abs(input.Kcr * dd + cur.up[i]));
        if (tv > tot) {
          tot = tv;
          totalSource = cur.set.label === "—" ? "D" : cur.set.label;
        }
      }
    }
    const ratio = Math.max(live / liveLimit, tot / totalLimit);
    if (ratio > deflGovRatio) {
      deflGovRatio = ratio;
      deflGov =
        setCurves.find((c) => c.set.label === (live / liveLimit >= tot / totalLimit ? liveSource : totalSource)) ??
        setCurves[0];
    }
    return {
      segment: k,
      kind: isCant ? "cantilever" : "span",
      length: len,
      dead,
      live,
      liveSource,
      total: tot,
      totalSource: `${fmt(input.Kcr, 2)}D${totalSource === "D" ? "" : ` + ${totalSource}`}`,
      liveLimit,
      totalLimit,
      liveRatio: live / liveLimit,
      totalRatio: tot / totalLimit,
      livePass: live <= liveLimit,
      totalPass: tot <= totalLimit,
      limitLength,
    };
  });

  const reactions: SupportReaction[] = analysis.supports.map((xs, i) => {
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of combos) {
      const up = comboReaction(c, i, 1);
      const lo = comboReaction(c, i, -1);
      if (up > maxDown) {
        maxDown = up;
        maxDownCombo = c.label;
      }
      if (lo < minNet) {
        minNet = lo;
        minNetCombo = c.label;
      }
    }
    return {
      support: i,
      x: xs,
      byType: reactionsByType[i].v,
      maxByType: reactionsByType[i].vmax,
      maxDown,
      maxDownCombo,
      minNet,
      minNetCombo,
    };
  });

  const checks: Check[] = [bending];
  if (bendingNeg) checks.push(bendingNeg);
  const RBmax = Math.max(RBTop, RBBottom);
  if (RBmax > 0)
    checks.push({
      name: "Beam slenderness R_B (NDS 3.3.3.7)",
      demand: RBmax,
      capacity: 50,
      ratio: RBmax / 50,
      pass: RBmax <= 50,
      combo: "—",
      CD: 1,
      unit: "",
    });
  checks.push(shear);
  if (notch) checks.push(notch);
  if (notchDepthCheck) checks.push(notchDepthCheck);
  bearing.forEach((b) =>
    checks.push({
      name: `Bearing at support ${String.fromCharCode(65 + b.support)}`,
      demand: b.fcperp,
      capacity: b.FcperpPrime,
      ratio: b.ratio,
      pass: b.pass,
      combo: b.combo,
      CD: 1,
      unit: "psi",
    }),
  );
  const spanNo = (k: number) => k + 1 - ((g.leftCantilever ?? 0) > 0 ? 1 : 0);
  deflection.forEach((d) => {
    const nm =
      d.kind === "cantilever"
        ? d.segment === 0
          ? "left cantilever"
          : "right cantilever"
        : `span ${spanNo(d.segment)}`;
    checks.push({
      name: `Deflection, live (${nm})`,
      demand: d.live,
      capacity: d.liveLimit,
      ratio: d.liveRatio,
      pass: d.livePass,
      combo: d.liveSource,
      CD: 1,
      unit: "in",
    });
    checks.push({
      name: `Deflection, total (${nm})`,
      demand: d.total,
      capacity: d.totalLimit,
      ratio: d.totalRatio,
      pass: d.totalPass,
      combo: d.totalSource,
      CD: 1,
      unit: "in",
    });
  });
  const governing = checks.reduce((a, b) => (b.ratio > a.ratio ? b : a));

  // diagrams for the governing bending combination
  const gc = gb.combo;
  const Mmax = comboField(gc, Menv, 1);
  const Mmin = comboField(gc, Menv, -1);
  const VLmax = comboField(gc, VLenv, 1);
  const VLmin = comboField(gc, VLenv, -1);
  const VRmax = comboField(gc, VRenv, 1);
  const VRmin = comboField(gc, VRenv, -1);
  const shearX: number[] = [];
  const Vmax: number[] = [];
  const Vmin: number[] = [];
  for (let i = 0; i < n; i++) {
    shearX.push(analysis.x[i], analysis.x[i]);
    Vmax.push(VLmax[i], VRmax[i]);
    Vmin.push(VLmin[i], VRmin[i]);
  }
  const defl = Denv.max.map((dd, i) => {
    const a = input.Kcr * dd + deflGov.down[i];
    const b = input.Kcr * dd + deflGov.up[i];
    return Math.abs(a) >= Math.abs(b) ? a : b;
  });

  // simple-span, full-UDL members get closed-form expressions on the sheet
  const simpleUDL =
    g.spans.length === 1 &&
    !(g.leftCantilever ?? 0) &&
    !(g.rightCantilever ?? 0) &&
    loads.every((l) => l.kind === "udl" && Math.abs(l.x1 ?? 0) < 1e-6 && Math.abs((l.x2 ?? 0) - total) < 1e-6);
  const wTotalUDL = simpleUDL ? loads.reduce((s, l) => s + (l.w1 ?? 0), 0) : undefined;

  assumptions.push(
    fromDefault(
      "Load duration factor",
      input.cdOverride ? `C_D = ${fmt(input.cdOverride, 2)} (manual)` : "C_D per combination, NDS Table 2.3.2",
      "NDS Table 2.3.2",
    ),
    fromDefault(
      "Service condition",
      wet ? "Wet service (C_M per Supplement)" : "Dry service, C_M = 1.00",
      "NDS 4.3.3 / Supplement",
    ),
    fromDefault("Temperature", "T ≤ 100 °F, C_t = 1.00", "NDS Table 2.3.3"),
    fromDefault("Long-term deflection", `K_cr = ${fmt(input.Kcr, 2)}`, "NDS 3.5.2"),
  );
  if (input.cdOverride !== undefined)
    assumptions.push(fromOverride("Load duration factor", `C_D = ${fmt(input.cdOverride, 2)}`, "C_D per combination"));

  return {
    input,
    mat,
    analysis,
    present,
    combos: rows,
    factors: {
      CM,
      Ct,
      Ci,
      CiE,
      Cr,
      CF: mat.CF,
      Cfu,
      CV,
      luTop,
      luBottom,
      leTop,
      leBottom,
      RBTop,
      RBBottom,
      EminPrime,
      FbE_top,
      FbE_bottom,
      Eprime,
      stability: useRule ? "rule-4.4.1" : "rational",
      rule441Text: rule?.text,
      Cvr,
    },
    bending,
    bendingNeg,
    shear,
    notch,
    bearing,
    deflection,
    reactions,
    governing,
    checks,
    pass: checks.every((c) => c.pass),
    assumptions,
    diagrams: {
      x: analysis.x,
      Mmax,
      Mmin,
      shearX,
      Vmax,
      Vmin,
      defl,
      comboLabel: gc.label,
      deflLabel: `${fmt(input.Kcr, 2)}D${deflGov.set.label === "—" ? "" : ` + ${deflGov.set.label}`}`,
      patterned: Object.keys(analysis.patterns).length > 0,
    },
    simpleUDL,
    wTotalUDL: wTotalUDL !== undefined ? r3(wTotalUDL) : undefined,
  };
}
