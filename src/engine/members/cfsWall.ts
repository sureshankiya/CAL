/**
 * CS-# — cold-formed steel stud wall (optional module), per stud.
 *
 * Allowable strengths come from the stud manufacturer's / SSMA load tables for the
 * section, height and bracing (P_a, M_a, V_a, web crippling at the track), entered with
 * their source — the AISI S100 section strength (effective width, distortional buckling)
 * is not computed here. HouseCalc computes the demands and the checks:
 *
 *  - Axial per stud from the line loads above × stud spacing; wind (C&C) on the stud
 *    as a simple span, w = W s.
 *  - ASCE 7 §2.4 ASD combinations; P / P_a, M / M_a, V / V_a, track bearing.
 *  - Combined axial and bending (AISI S100-16 Eq. H1.2-1): P / P_a + B₁ M / M_a ≤ 1.0, with
 *    the second-order amplifier B₁ = C_m / (1 − α P / P_e), α = 1.6 (ASD), C_m = 1.0,
 *    P_e = π² E I_x / (K L)².
 *  - Deflection under the wind (IBC Table 1604.3 note: 0.42 × C&C permitted) against
 *    the chosen H / n limit.
 *  - Gross I_x from the SSMA designation (linear method, rounded corners R = 1.5t, SSMA design
 *    thickness) unless entered.
 */

import { asdCombinations, relevantCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, loadVector, zeroLoads, type LoadType } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { governingCheck, type Check } from "../design/wood";
import { asce7Of, type DesignContext, type ExtraLoad, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface CfsWallInput {
  id: string;
  mark: string;
  description: string;
  /** SSMA designation, e.g. 350S162-54 */
  designation: string;
  /** lip length, in (SSMA S162: 0.500 in) */
  lip: number;
  Fy: number;
  /** stud height, ft */
  height: number;
  /** stud spacing, in */
  spacing: number;
  /** line loads at the top of the wall, plf (links + entries) */
  extra: ExtraLoad[];
  /** wind on the wall, C&C strength-level, psf */
  W: number;
  /** wind load factor for deflection (IBC Table 1604.3 note: 0.42) */
  deflWindFactor: number;
  /** deflection limit H / n */
  deflLimit: number;
  /** allowable strengths from the load table (ASD) */
  table: {
    Pa: number;
    Ma: number;
    Va?: number;
    /** web crippling / track bearing allowable per stud end, lb */
    Pwc?: number;
    source: string;
    verified: boolean;
  };
  /** gross moment of inertia from the table, in⁴ (overrides the computed value) */
  IxTable?: number;
  /** effective length factor for P_e */
  K: number;
}

export interface CfsSection {
  D: number;
  B: number;
  d: number;
  t: number;
  mils: number;
  A: number;
  Ix: number;
  Sx: number;
}

export interface CfsComboRow {
  combo: Combination;
  P: number;
  M: number;
  V: number;
  B1: number;
  ratio: number;
}

export interface CfsWallResult extends MemberResultBase {
  kind: "cfsWall";
  input: CfsWallInput;
  section: CfsSection;
  Ix: number;
  Pe: number;
  perStud: Record<LoadType, number>;
  w: number;
  rows: CfsComboRow[];
  gov: CfsComboRow;
  axialGov: CfsComboRow;
  bendGov: CfsComboRow;
  defl: { w: number; d: number; allow: number };
}

const E_STEEL = 29_500_000;

/**
 * SSMA design thickness = minimum base-metal thickness / 0.95 (SSMA Product Technical Guide,
 * ICC-ES ER-3064P): 33 mil 0.0346, 43 mil 0.0451, 54 mil 0.0566, 68 mil 0.0713, 97 mil 0.1017 in.
 */
export const SSMA_DESIGN_THICKNESS: Record<number, number> = {
  33: 0.0346,
  43: 0.0451,
  54: 0.0566,
  68: 0.0713,
  97: 0.1017,
};

/**
 * SSMA designation "350S162-54" → gross section by the linear (centre-line) method with
 * rounded corners, inside bend radius 1.5 t (reproduces the SSMA tabulated A and I_x —
 * 350S162-54: A = 0.415 in², I_x = 0.804 in⁴).
 */
export function ssmaSection(designation: string, lip: number): CfsSection {
  const m = /^(\d{3,4})S(\d{3})-(\d{2,3})$/.exec(designation.trim());
  if (!m) throw new Error(`${designation}: not an SSMA stud designation (e.g. 350S162-54)`);
  const D = Number(m[1]) / 100;
  const flangeCode = Number(m[2]);
  const B = flangeCode === 162 ? 1.625 : flangeCode === 137 ? 1.375 : flangeCode === 125 ? 1.25 : flangeCode / 100;
  const mils = Number(m[3]);
  const t = SSMA_DESIGN_THICKNESS[mils] ?? mils / 1000 / 0.95;
  const rc = 1.5 * t + t / 2; // centre-line corner radius
  const h = D - t;
  const b = B - t;
  const c = lip - t / 2;
  // integrate along the centre line of the upper half (web, corner, flange, corner, lip); mirror
  let A = 0;
  let Ix = 0;
  const n = 400;
  const add = (y: number, ds: number) => {
    A += 2 * t * ds;
    Ix += 2 * t * ds * y * y;
  };
  const line = (y0: number, y1: number, len: number) => {
    for (let k = 0; k < n; k++) add(y0 + ((y1 - y0) * (k + 0.5)) / n, len / n);
  };
  const arc = (yc: number, a0: number, a1: number) => {
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * (k + 0.5)) / n;
      add(yc + rc * Math.sin(a), (rc * Math.abs(a1 - a0)) / n);
    }
  };
  line(0, h / 2 - rc, h / 2 - rc);
  arc(h / 2 - rc, Math.PI, Math.PI / 2);
  line(h / 2, h / 2, b - 2 * rc);
  arc(h / 2 - rc, Math.PI / 2, 0);
  line(h / 2 - rc, h / 2 - c, c - rc);
  return { D, B, d: lip, t, mils, A, Ix, Sx: Ix / (D / 2) };
}

export function designCfsWall(ctx: DesignContext, w: CfsWallInput): CfsWallResult {
  const sec = ssmaSection(w.designation, w.lip);
  const Ix = w.IxTable ?? sec.Ix;
  const L = w.height * 12;
  const lines: LoadLine[] = [];
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [];
  const top = zeroLoads();
  for (const e of w.extra) {
    if (e.kind !== "line") throw new Error(`${e.label}: stud walls take line loads (plf)`);
    top[e.type] += e.w ?? 0;
    lines.push({
      type: e.type,
      label: e.label,
      expr: `${fmt(e.w ?? 0, 1)} plf at the top`,
      value: e.w ?? 0,
      unit: "plf",
    });
  }
  const perStud = zeroLoads();
  for (const tp of LOAD_TYPES) perStud[tp] = (top[tp] * w.spacing) / 12;
  const wW = (w.W * w.spacing) / 12; // plf on the stud, strength-level wind
  if (w.W)
    lines.push({
      type: "W",
      label: "Wind on the stud (C&C)",
      expr: `${fmt(w.W, 1)} psf × ${fmt(w.spacing / 12, 3)} ft`,
      value: wW,
      unit: "plf",
    });
  const Pe = (Math.PI ** 2 * E_STEEL * Ix) / (w.K * L) ** 2;
  const present: Partial<Record<LoadType, boolean>> = { D: true, W: w.W > 0 };
  for (const tp of LOAD_TYPES) if (perStud[tp] > 0) present[tp] = true;
  const combos = relevantCombinations(
    asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: w.W > 0, includeSeismic: false }),
    present,
  );
  const rows: CfsComboRow[] = combos.map((c) => {
    let P = 0;
    for (const tp of LOAD_TYPES) if (tp !== "W" && tp !== "E") P += (c.factors[tp] ?? 0) * perStud[tp];
    const wq = (c.factors.W ?? 0) * wW; // plf
    const M = (wq * w.height * w.height * 12) / 8; // lb-in
    const V = (wq * w.height) / 2;
    const B1 = P > 0 ? (P >= Pe / 1.6 ? Infinity : 1 / (1 - (1.6 * P) / Pe)) : 1;
    const ratio = Math.max(0, P) / w.table.Pa + (B1 * M) / w.table.Ma;
    return { combo: c, P, M, V, B1, ratio };
  });
  const gov = rows.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const axialGov = rows.reduce((a, b) => (b.P > a.P ? b : a));
  const bendGov = rows.reduce((a, b) => (b.M > a.M ? b : a));
  const dw = w.deflWindFactor * wW; // plf
  const d = (5 * (dw / 12) * L ** 4) / (384 * E_STEEL * Ix);
  const allow = L / w.deflLimit;

  const checks: Check[] = [];
  const ck = (c: Omit<Check, "CD" | "pass">) => checks.push({ CD: 1, pass: c.ratio <= 1 + 1e-9, ...c });
  ck({
    name: "Axial P / P_a (table)",
    demand: axialGov.P,
    capacity: w.table.Pa,
    ratio: axialGov.P / w.table.Pa,
    combo: axialGov.combo.label,
    unit: "lb",
  });
  if (bendGov.M > 0)
    ck({
      name: "Bending M / M_a (table)",
      demand: bendGov.M,
      capacity: w.table.Ma,
      ratio: bendGov.M / w.table.Ma,
      combo: bendGov.combo.label,
      unit: "lb-in",
    });
  if (w.table.Va && bendGov.V > 0)
    ck({
      name: "Shear V / V_a (table)",
      demand: bendGov.V,
      capacity: w.table.Va,
      ratio: bendGov.V / w.table.Va,
      combo: bendGov.combo.label,
      unit: "lb",
    });
  if (w.table.Pwc)
    ck({
      name: "Web crippling / track bearing (table)",
      demand: Math.max(axialGov.P, bendGov.V),
      capacity: w.table.Pwc,
      ratio: Math.max(axialGov.P, bendGov.V) / w.table.Pwc,
      combo: axialGov.P >= bendGov.V ? axialGov.combo.label : bendGov.combo.label,
      unit: "lb",
    });
  ck({
    name: "Combined P / P_a + B₁ M / M_a (AISI S100-16 H1.2)",
    demand: gov.ratio,
    capacity: 1,
    ratio: gov.ratio,
    combo: gov.combo.label,
    unit: "",
  });
  if (w.W)
    ck({
      name: `Deflection ≤ H / ${fmt(w.deflLimit, 0)} (${fmt(w.deflWindFactor, 2)} W)`,
      category: "serviceability",
      demand: d,
      capacity: allow,
      ratio: d / allow,
      combo: `${fmt(w.deflWindFactor, 2)}W`,
      unit: "in",
    });
  assumptions.push(
    fromDefault(
      "Allowable strengths",
      `P_a = ${fmt(w.table.Pa, 0)} lb, M_a = ${fmt(w.table.Ma, 0)} lb-in${w.table.Va ? `, V_a = ${fmt(w.table.Va, 0)} lb` : ""} at ${fmt(w.height, 2)} ft`,
      w.table.source,
      !w.table.verified,
    ),
    fromDefault(
      "Section",
      `${w.designation}: D = ${fmt(sec.D, 3)} in, B = ${fmt(sec.B, 3)} in, lip ${fmt(sec.d, 3)} in, t = ${fmt(sec.t, 4)} in (SSMA design thickness, ${sec.mils} mil), F_y = ${fmt(w.Fy / 1000, 0)} ksi; I_x = ${fmt(Ix, 3)} in⁴ ${w.IxTable ? "(table)" : "(linear method, inside radius 1.5t — SSMA basis)"}`,
      w.IxTable ? w.table.source : "SSMA designation",
      !w.IxTable,
    ),
    fromDefault(
      "Bracing",
      "Studs braced against weak-axis and torsional buckling by sheathing or bridging as assumed in the load table; tracks fastened to the structure",
      "manufacturer / SSMA load table basis",
      true,
    ),
  );
  if (!w.table.verified)
    flags.push(`${w.designation}: confirm P_a, M_a with the current manufacturer / SSMA table (VERIFY)`);
  if (w.Fy < 50000 && sec.mils >= 54)
    flags.push(`${sec.mils} mil studs are commonly 50 ksi — confirm F_y with the specification`);
  return {
    id: w.id,
    mark: w.mark,
    kind: "cfsWall",
    title: "Cold-formed steel stud wall",
    callout: `${w.designation} (F_y ${fmt(w.Fy / 1000, 0)} ksi) @ ${fmt(w.spacing, 0)} in. o.c., ${fmt(w.height, 2)} ft`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Base (line)",
        x: 0,
        byType: loadVector({ ...top }),
        perFoot: loadVector({ ...top }),
        maxDown: Math.max(...rows.map((r) => (r.P * 12) / w.spacing)),
        maxDownCombo: axialGov.combo.label,
        minNet: Math.min(...rows.map((r) => (r.P * 12) / w.spacing)),
        minNetCombo: rows.reduce((a, b) => (b.P < a.P ? b : a)).combo.label,
      },
    ],
    loadLines: lines,
    assumptions,
    flags,
    input: w,
    section: sec,
    Ix,
    Pe,
    perStud,
    w: wW,
    rows,
    gov,
    axialGov,
    bendGov,
    defl: { w: dw, d, allow },
  };
}
