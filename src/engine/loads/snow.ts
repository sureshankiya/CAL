/**
 * Roof snow loads, ASCE 7 Chapter 7.
 *  - Flat-roof snow load: ASCE 7-16 Eq. 7.3-1 pf = 0.7 Ce Ct Is pg; ASCE 7-22 Eq. 7.3-1 pf = 0.7 Ce Ct pg
 *    (ASCE 7-22 ground snow loads are risk-targeted, so Is is not applied).
 *  - Sloped-roof snow load: ps = Cs pf (§7.4), Cs from Fig. 7.4-1 (formula form).
 *  - Minimum snow load for low-slope roofs (§7.3.4 in 7-16, §7.3.3 in 7-22): slopes < 15°.
 *  - Rain-on-snow surcharge (§7.10): 5 psf where 0 < pg ≤ 20 psf and slope (deg) < W / 50.
 *  - Unbalanced snow on hip and gable roofs (§7.6.1): 2.38° ≤ slope ≤ 30.2°; for W ≤ 20 ft and
 *    simply supported prismatic members from ridge to eave the leeward side carries Is·pg (7-16) or
 *    pg (7-22) with the windward side unloaded. Wider roofs need the drift surcharge (not in this version).
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
  unbalanced: { applies: boolean; leeward: number; windward: number; note: string };
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
  const rainOnSnow = i.pg > 0 && i.pg <= 20 && slopeDeg < i.W / 50 ? 5 : 0;
  const balanced = ps + rainOnSnow;

  const unbalApplies = i.gable && i.pg > 0 && slopeDeg >= 2.38 - 1e-9 && slopeDeg <= 30.2 + 1e-9;
  let unbalanced = { applies: false, leeward: 0, windward: 0, note: "Not required (§7.6.1)" };
  if (unbalApplies) {
    if (i.W <= 20) {
      unbalanced = {
        applies: true,
        leeward: IsUsed * i.pg,
        windward: 0,
        note: `W = ${i.W} ft ≤ 20 ft: leeward ${is716 ? "Is·pg" : "pg"}, windward unloaded (§7.6.1)`,
      };
    } else {
      unbalanced = {
        applies: true,
        leeward: ps,
        windward: 0.3 * ps,
        note: "W > 20 ft: leeward ps plus drift surcharge hd·γ/√S — surcharge not computed in this version",
      };
      flags.push("Unbalanced snow drift surcharge for W > 20 ft not computed — VERIFY (ASCE 7 §7.6.1)");
    }
  }

  const cands: Array<[number, string]> = [[balanced, rainOnSnow ? "Balanced ps + rain-on-snow" : "Balanced ps"]];
  if (pmApplies) cands.push([pm, "Minimum pm"]);
  if (unbalanced.applies) cands.push([unbalanced.leeward, "Unbalanced, leeward side"]);
  const gov = cands.reduce((a, b) => (b[0] > a[0] ? b : a));
  if (!is716) flags.push("ASCE 7-22: confirm pg (risk-targeted, ASCE Hazard Tool) and Ct from Table 7.3-2");

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
