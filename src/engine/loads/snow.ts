/**
 * Roof snow loads, ASCE 7 Chapter 7.
 *  - Flat-roof snow load: ASCE 7-16 Eq. 7.3-1 pf = 0.7 Ce Ct Is pg; ASCE 7-22 Eq. 7.3-1 pf = 0.7 Ce Ct pg
 *    (ASCE 7-22 ground snow loads are risk-targeted, so Is is not applied).
 *  - Sloped-roof snow load: ps = Cs pf (§7.4), Cs from Fig. 7.4-1 (formula form).
 *  - Minimum snow load for low-slope roofs (§7.3.4 in 7-16, §7.3.3 in 7-22): slopes < 15°.
 *  - Rain-on-snow surcharge (§7.10): 5 psf (ASCE 7-16) / 8 psf (ASCE 7-22, strength-level snow)
 *    where 0 < pg ≤ 20 psf and slope (deg) < W / 50.
 *  - Unbalanced snow on hip and gable roofs (§7.6.1): 2.38° ≤ slope ≤ 30.2°; for W ≤ 20 ft and
 *    simply supported prismatic members from ridge to eave the leeward side carries Is·pg (7-16) or
 *    pg (7-22) with the windward side unloaded. W > 20 ft: windward 0.3 ps, leeward ps plus the
 *    rectangular surcharge hd·γ/√S over 8·hd·√S/3 from the ridge, hd with lu = W (Fig. 7.6-2).
 *  - Drift height hd: ASCE 7-16 Fig. 7.6-1 hd = 0.43 lu^(1/3) (pg + 10)^(1/4) − 1.5;
 *    ASCE 7-22 Eq. 7.6-1 hd = 1.5 √(pg^0.74 lu^0.70 W2^1.7 / γ), W2 = winter wind parameter (Fig. 7.6-1).
 *    γ = 0.13 pg + 14 ≤ 30 pcf (Eq. 7.7-1).
 *  - Drifts on lower roofs (§7.7.1): leeward hd (lu = upper roof), windward 0.75 hd (lu = lower roof),
 *    larger governs; not required when hc / hb < 0.2; w = 4 hd (hd ≤ hc), else hd = hc and
 *    w = 4 hd² / hc ≤ 8 hc; pd = hd γ (triangular surcharge on the balanced load).
 *  - Parapets and roof projections (§7.8): windward drift, 0.75 hd with lu = roof length upwind.
 */

export type Asce7Edition = "ASCE 7-16" | "ASCE 7-22";

export interface SnowInput {
  edition: Asce7Edition;
  /** ground snow load, psf */
  pg: number;
  Ce: number;
  Ct: number;
  /** snow importance factor (ASCE 7-16 only; ignored for 7-22) */
  Is: number;
  /** roof slope as rise in inches per foot */
  rise: number;
  /** unobstructed slippery surface (metal, slate, membranes) per §7.4 */
  slippery: boolean;
  /** horizontal eave-to-ridge distance, ft */
  W: number;
  /** hip / gable roof (unbalanced case applies); false for monoslope */
  gable: boolean;
  /** ASCE 7-22 winter wind parameter W2 (Fig. 7.6-1 / ASCE Hazard Tool) */
  W2?: number;
}

/** ASCE 7-22 default W2 where none is entered: upper end of the Fig. 7.6-1 contours (conservative). */
export const W2_DEFAULT = 0.65;

/** Snow density, pcf — ASCE 7 Eq. 7.7-1. */
export const snowDensity = (pg: number) => Math.min(0.13 * pg + 14, 30);

/** Drift height hd, ft (ASCE 7-16 Fig. 7.6-1 / ASCE 7-22 Eq. 7.6-1), with the expression printed. */
export function driftHeight(
  edition: Asce7Edition,
  pg: number,
  lu: number,
  W2 = W2_DEFAULT,
): { hd: number; expr: string } {
  if (pg <= 0 || lu <= 0) return { hd: 0, expr: "hd = 0 (no snow)" };
  if (edition === "ASCE 7-16") {
    const hd = Math.max(0.43 * Math.cbrt(lu) * Math.pow(pg + 10, 0.25) - 1.5, 0);
    return {
      hd,
      expr: `hd = 0.43 lu^(1/3) (pg + 10)^(1/4) − 1.5 = 0.43 × ${lu.toFixed(1)}^(1/3) × ${(pg + 10).toFixed(1)}^(1/4) − 1.5 = ${hd.toFixed(2)} ft (Fig. 7.6-1)`,
    };
  }
  const g = snowDensity(pg);
  const hd = 1.5 * Math.sqrt((Math.pow(pg, 0.74) * Math.pow(lu, 0.7) * Math.pow(W2, 1.7)) / g);
  return {
    hd,
    expr: `hd = 1.5 √(pg^0.74 lu^0.70 W2^1.7 / γ) = 1.5 √(${pg.toFixed(1)}^0.74 × ${lu.toFixed(1)}^0.70 × ${W2.toFixed(2)}^1.7 / ${g.toFixed(1)}) = ${hd.toFixed(2)} ft (Eq. 7.6-1)`,
  };
}

export type DriftCase = "step" | "parapet";

export interface DriftInput {
  edition: Asce7Edition;
  pg: number;
  /** balanced snow load on the lower (drifted) roof, psf */
  ps: number;
  W2?: number;
  case: DriftCase;
  /** step: upper roof length (leeward fetch); parapet / projection: roof length upwind, ft */
  luUpper: number;
  /** step: lower roof length (windward fetch), ft */
  luLower?: number;
  /** height of the step / parapet / projection above the lower roof surface, ft */
  hr: number;
}

export interface DriftResult {
  input: DriftInput;
  gamma: number;
  hb: number;
  hc: number;
  required: boolean;
  leeward?: { hd: number; expr: string };
  windward?: { hd: number; expr: string };
  governs: "leeward" | "windward" | "none";
  /** design drift height, ft (≤ hc) */
  hd: number;
  /** drift width, ft */
  w: number;
  /** peak surcharge at the step, psf */
  pd: number;
  lines: string[];
  ref: string;
}

/** Snow drift on a lower roof against a step (§7.7) or at a parapet / projection (§7.8). */
export function snowDrift(i: DriftInput): DriftResult {
  const gamma = snowDensity(i.pg);
  const hb = i.ps / gamma;
  const hc = Math.max(i.hr - hb, 0);
  const lines = [
    `γ = 0.13 pg + 14 ≤ 30 = ${gamma.toFixed(1)} pcf (Eq. 7.7-1)`,
    `hb = ps / γ = ${i.ps.toFixed(1)} / ${gamma.toFixed(1)} = ${hb.toFixed(2)} ft; hc = hr − hb = ${i.hr.toFixed(2)} − ${hb.toFixed(2)} = ${hc.toFixed(2)} ft`,
  ];
  const ref = i.case === "step" ? "ASCE 7 §7.7.1" : "ASCE 7 §7.8";
  const none = (why: string): DriftResult => {
    lines.push(why);
    return { input: i, gamma, hb, hc, required: false, governs: "none", hd: 0, w: 0, pd: 0, lines, ref };
  };
  if (i.pg <= 0) return none("No ground snow — no drift");
  if (hb > 0 && hc / hb < 0.2)
    return none(`hc / hb = ${(hc / hb).toFixed(2)} < 0.2 — drift load not required (§7.7.1)`);
  let leeward: { hd: number; expr: string } | undefined;
  let windward: { hd: number; expr: string } | undefined;
  if (i.case === "step") {
    leeward = driftHeight(i.edition, i.pg, i.luUpper, i.W2);
    lines.push(`Leeward (lu = upper roof ${i.luUpper.toFixed(1)} ft): ${leeward.expr}`);
  }
  const luW = i.case === "step" ? (i.luLower ?? 0) : i.luUpper;
  if (luW > 0) {
    const h = driftHeight(i.edition, i.pg, luW, i.W2);
    windward = { hd: 0.75 * h.hd, expr: `0.75 × ${h.hd.toFixed(2)} = ${(0.75 * h.hd).toFixed(2)} ft` };
    lines.push(
      `Windward (lu = ${i.case === "step" ? "lower roof" : "roof upwind"} ${luW.toFixed(1)} ft): ${h.expr}; 0.75 hd = ${windward.expr}`,
    );
  }
  const lw = leeward?.hd ?? 0;
  const ww = windward?.hd ?? 0;
  const governs = lw >= ww ? "leeward" : "windward";
  let hd = Math.max(lw, ww);
  let w: number;
  if (hd <= hc) {
    w = 4 * hd;
    lines.push(`hd = ${hd.toFixed(2)} ft ≤ hc: w = 4 hd = ${w.toFixed(2)} ft`);
  } else {
    w = Math.min((4 * hd * hd) / hc, 8 * hc);
    lines.push(
      `hd = ${hd.toFixed(2)} ft > hc: hd = hc = ${hc.toFixed(2)} ft; w = 4 hd² / hc ≤ 8 hc = ${w.toFixed(2)} ft`,
    );
    hd = hc;
  }
  const pd = hd * gamma;
  lines.push(`pd = hd γ = ${hd.toFixed(2)} × ${gamma.toFixed(1)} = ${pd.toFixed(1)} psf at the step, to 0 at w`);
  return { input: i, gamma, hb, hc, required: true, leeward, windward, governs, hd, w, pd, lines, ref };
}

export interface SnowResult {
  input: SnowInput;
  slopeDeg: number;
  IsUsed: number;
  pf: number;
  Cs: number;
  ps: number;
  pmApplies: boolean;
  pm: number;
  rainOnSnow: number;
  /** balanced design value incl. rain-on-snow */
  balanced: number;
  unbalanced: {
    applies: boolean;
    leeward: number;
    windward: number;
    /** W > 20 ft: rectangular surcharge pd (psf, horizontal projection) over `length` (ft, horizontal) from the ridge */
    surcharge?: { pd: number; length: number; hd: number; gamma: number; S: number; expr: string };
    note: string;
  };
  /** governing uniform load for simply supported rafters (ridge to eave) */
  rafterUniform: number;
  rafterCase: string;
  flags: string[];
  refs: { pf: string; ps: string; pm: string; unbal: string };
}

/** Thermal-factor dependent Cs (ASCE 7 Fig. 7.4-1, formula form). */
export function slopeFactor(slopeDeg: number, Ct: number, slippery: boolean): number {
  // breakpoints: slope at which Cs starts to drop; all curves reach 0 at 70°
  let start: number;
  if (Ct <= 1.0) start = slippery ? 5 : 30;
  else if (Ct <= 1.1) start = slippery ? 10 : 37.5;
  else start = slippery ? 15 : 45;
  if (slopeDeg <= start) return 1;
  if (slopeDeg >= 70) return 0;
  return 1 - (slopeDeg - start) / (70 - start);
}

export function snowLoads(i: SnowInput): SnowResult {
  const slopeDeg = (Math.atan(i.rise / 12) * 180) / Math.PI;
  const is716 = i.edition === "ASCE 7-16";
  const IsUsed = is716 ? i.Is : 1;
  const flags: string[] = [];
  const pf = 0.7 * i.Ce * i.Ct * IsUsed * i.pg;
  const Cs = slopeFactor(slopeDeg, i.Ct, i.slippery);
  const ps = Cs * pf;
  const pmApplies = slopeDeg < 15 && i.pg > 0;
  const pm = !pmApplies ? 0 : i.pg <= 20 ? IsUsed * i.pg : 20 * IsUsed;
  const rainOnSnow = i.pg > 0 && i.pg <= 20 && slopeDeg < i.W / 50 ? (is716 ? 5 : 8) : 0;
  const balanced = ps + rainOnSnow;

  const unbalApplies = i.gable && i.pg > 0 && slopeDeg >= 2.38 - 1e-9 && slopeDeg <= 30.2 + 1e-9;
  let unbalanced: SnowResult["unbalanced"] = { applies: false, leeward: 0, windward: 0, note: "Not required (§7.6.1)" };
  if (unbalApplies) {
    if (i.W <= 20) {
      unbalanced = {
        applies: true,
        leeward: IsUsed * i.pg,
        windward: 0,
        note: `W = ${i.W} ft ≤ 20 ft: leeward ${is716 ? "Is·pg" : "pg"}, windward unloaded (§7.6.1)`,
      };
    } else {
      const S = 12 / i.rise;
      const g = snowDensity(i.pg);
      const h = driftHeight(i.edition, i.pg, i.W, i.W2);
      const pd = (h.hd * g) / Math.sqrt(S);
      const length = (8 * h.hd * Math.sqrt(S)) / 3;
      unbalanced = {
        applies: true,
        leeward: ps,
        windward: 0.3 * ps,
        surcharge: { pd, length, hd: h.hd, gamma: g, S, expr: h.expr },
        note: `W = ${i.W} ft > 20 ft: windward 0.3 ps; leeward ps + surcharge hd γ / √S = ${h.hd.toFixed(2)} × ${g.toFixed(1)} / √${S.toFixed(2)} = ${pd.toFixed(1)} psf over 8 hd √S / 3 = ${length.toFixed(2)} ft from the ridge (§7.6.1, Fig. 7.6-2); ${h.expr}`,
      };
    }
  }

  const cands: Array<[number, string]> = [[balanced, rainOnSnow ? "Balanced ps + rain-on-snow" : "Balanced ps"]];
  if (pmApplies) cands.push([pm, "Minimum pm"]);
  if (unbalanced.applies) cands.push([unbalanced.leeward, "Unbalanced, leeward side"]);
  const gov = cands.reduce((a, b) => (b[0] > a[0] ? b : a));
  if (!is716) flags.push("ASCE 7-22: confirm pg (risk-targeted, ASCE Hazard Tool) and Ct from Table 7.3-2");
  if (!is716 && unbalanced.surcharge && i.W2 === undefined)
    flags.push(`ASCE 7-22 winter wind parameter W2 not entered — ${W2_DEFAULT} used — VERIFY (Fig. 7.6-1)`);

  return {
    input: i,
    slopeDeg,
    IsUsed,
    pf,
    Cs,
    ps,
    pmApplies,
    pm,
    rainOnSnow,
    balanced,
    unbalanced,
    rafterUniform: i.pg > 0 ? gov[0] : 0,
    rafterCase: i.pg > 0 ? gov[1] : "No ground snow (pg = 0)",
    flags,
    refs: {
      pf: is716 ? "ASCE 7-16 Eq. 7.3-1" : "ASCE 7-22 Eq. 7.3-1",
      ps: "ASCE 7 Eq. 7.4-1, Fig. 7.4-1",
      pm: is716 ? "ASCE 7-16 §7.3.4" : "ASCE 7-22 §7.3.3",
      unbal: "ASCE 7 §7.6.1",
    },
  };
}

/** ASCE 7 Table 7.3-1 exposure factor Ce. */
export const CE_TABLE: Record<"B" | "C" | "D", Record<"fully" | "partially" | "sheltered", number>> = {
  B: { fully: 0.9, partially: 1.0, sheltered: 1.2 },
  C: { fully: 0.9, partially: 1.0, sheltered: 1.1 },
  D: { fully: 0.8, partially: 0.9, sheltered: 1.0 },
};

/** ASCE 7-16 Table 1.5-2 snow importance factor. */
export const IS_TABLE: Record<"I" | "II" | "III" | "IV", number> = { I: 0.8, II: 1.0, III: 1.1, IV: 1.2 };
