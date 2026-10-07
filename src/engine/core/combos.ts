/**
 * ASCE 7 load combinations.
 *  - ASD: §2.4.1 basic combinations and §2.4.5 seismic combinations (Ev = 0.2 SDS D, §12.4.2.2).
 *  - Strength: §2.3.1 basic combinations and §2.3.6 seismic combinations.
 * ASCE 7-16 and ASCE 7-22 use the same factors for these combinations.
 *
 * C_D for a combination is that of the shortest-duration load it contains
 * (NDS Table 2.3.2): D 0.9, L 1.0, S 1.15, Lr 1.25, W / E 1.6.
 */

import { LOAD_TYPES, type LoadType, type LoadVector } from "./loads";

export type ComboKind = "ASD" | "LRFD";

export interface Combination {
  id: string;
  kind: ComboKind;
  /** Printed form, e.g. "D + 0.75L + 0.75Lr". */
  label: string;
  /** Load factors; D factor already includes the vertical seismic term for E combinations. */
  factors: Partial<Record<LoadType, number>>;
  /** ASCE 7 section reference. */
  ref: string;
}

const C = (
  id: string,
  kind: ComboKind,
  label: string,
  factors: Partial<Record<LoadType, number>>,
  ref: string,
): Combination => ({ id, kind, label, factors, ref });

/** Gravity + wind ASD combinations (§2.4.1). Roof term enumerates Lr and S separately. */
function asdBasic(): Combination[] {
  return [
    C("A1", "ASD", "D", { D: 1 }, "§2.4.1 (1)"),
    C("A2", "ASD", "D + L", { D: 1, L: 1 }, "§2.4.1 (2)"),
    C("A3r", "ASD", "D + Lr", { D: 1, Lr: 1 }, "§2.4.1 (3)"),
    C("A3s", "ASD", "D + S", { D: 1, S: 1 }, "§2.4.1 (3)"),
    C("A4r", "ASD", "D + 0.75L + 0.75Lr", { D: 1, L: 0.75, Lr: 0.75 }, "§2.4.1 (4)"),
    C("A4s", "ASD", "D + 0.75L + 0.75S", { D: 1, L: 0.75, S: 0.75 }, "§2.4.1 (4)"),
    C("A5", "ASD", "D + 0.6W", { D: 1, W: 0.6 }, "§2.4.1 (5)"),
    C("A6r", "ASD", "D + 0.75L + 0.45W + 0.75Lr", { D: 1, L: 0.75, W: 0.45, Lr: 0.75 }, "§2.4.1 (6)"),
    C("A6s", "ASD", "D + 0.75L + 0.45W + 0.75S", { D: 1, L: 0.75, W: 0.45, S: 0.75 }, "§2.4.1 (6)"),
    C("A7", "ASD", "0.6D + 0.6W", { D: 0.6, W: 0.6 }, "§2.4.1 (7)"),
  ];
}

/** ASD seismic combinations (§2.4.5) with Ev = 0.2 SDS D folded into the D factor. */
function asdSeismic(SDS: number): Combination[] {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return [
    C("A8", "ASD", `(1.0 + 0.14 SDS)D + 0.7E`, { D: r(1 + 0.14 * SDS), E: 0.7 }, "§2.4.5 (8)"),
    C("A9", "ASD", `(1.0 + 0.105 SDS)D + 0.75L + 0.525E + 0.75S`, { D: r(1 + 0.105 * SDS), L: 0.75, E: 0.525, S: 0.75 }, "§2.4.5 (9)"),
    C("A10", "ASD", `(0.6 − 0.14 SDS)D + 0.7E`, { D: r(0.6 - 0.14 * SDS), E: 0.7 }, "§2.4.5 (10)"),
  ];
}

/** Strength combinations (§2.3.1) — residential L factor 1.0 used throughout (conservative). */
function lrfdBasic(): Combination[] {
  return [
    C("U1", "LRFD", "1.4D", { D: 1.4 }, "§2.3.1 (1)"),
    C("U2r", "LRFD", "1.2D + 1.6L + 0.5Lr", { D: 1.2, L: 1.6, Lr: 0.5 }, "§2.3.1 (2)"),
    C("U2s", "LRFD", "1.2D + 1.6L + 0.5S", { D: 1.2, L: 1.6, S: 0.5 }, "§2.3.1 (2)"),
    C("U3r", "LRFD", "1.2D + 1.6Lr + 1.0L", { D: 1.2, Lr: 1.6, L: 1 }, "§2.3.1 (3)"),
    C("U3s", "LRFD", "1.2D + 1.6S + 1.0L", { D: 1.2, S: 1.6, L: 1 }, "§2.3.1 (3)"),
    C("U3w", "LRFD", "1.2D + 1.6Lr + 0.5W", { D: 1.2, Lr: 1.6, W: 0.5 }, "§2.3.1 (3)"),
    C("U4", "LRFD", "1.2D + 1.0W + 1.0L + 0.5Lr", { D: 1.2, W: 1, L: 1, Lr: 0.5 }, "§2.3.1 (4)"),
    C("U5", "LRFD", "0.9D + 1.0W", { D: 0.9, W: 1 }, "§2.3.1 (5)"),
  ];
}

function lrfdSeismic(SDS: number): Combination[] {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return [
    C("U6", "LRFD", "(1.2 + 0.2 SDS)D + 1.0E + 1.0L + 0.2S", { D: r(1.2 + 0.2 * SDS), E: 1, L: 1, S: 0.2 }, "§2.3.6 (6)"),
    C("U7", "LRFD", "(0.9 − 0.2 SDS)D + 1.0E", { D: r(0.9 - 0.2 * SDS), E: 1 }, "§2.3.6 (7)"),
  ];
}

export function asdCombinations(opts: { SDS?: number; includeSeismic?: boolean; includeWind?: boolean } = {}): Combination[] {
  const { SDS = 1.0, includeSeismic = false, includeWind = true } = opts;
  let list = asdBasic();
  if (!includeWind) list = list.filter((c) => !c.factors.W);
  if (includeSeismic) list = list.concat(asdSeismic(SDS));
  return list;
}

export function strengthCombinations(opts: { SDS?: number; includeSeismic?: boolean; includeWind?: boolean } = {}): Combination[] {
  const { SDS = 1.0, includeSeismic = false, includeWind = true } = opts;
  let list = lrfdBasic();
  if (!includeWind) list = list.filter((c) => !c.factors.W);
  if (includeSeismic) list = list.concat(lrfdSeismic(SDS));
  return list;
}

/** Apply a combination to a load-type vector of any effect (moment, shear, reaction...). */
export function combine(effect: LoadVector, combo: Combination): number {
  let v = 0;
  for (const t of LOAD_TYPES) v += (combo.factors[t] ?? 0) * effect[t];
  return v;
}

/** NDS Table 2.3.2 load duration factor for a combination, based on the loads actually present. */
export function loadDurationFactor(combo: Combination, present?: Partial<Record<LoadType, boolean>>): number {
  const has = (t: LoadType) => (combo.factors[t] ?? 0) !== 0 && (present ? present[t] !== false : true);
  if (has("W") || has("E")) return 1.6;
  if (has("Lr")) return 1.25;
  if (has("S")) return 1.15;
  if (has("L")) return 1.0;
  return 0.9;
}

export const CD_TABLE_NOTE = "NDS Table 2.3.2: permanent 0.90, occupancy live 1.00, snow 1.15, construction / roof live 1.25, wind / earthquake 1.60";

/**
 * Keep only the combinations that matter for the loads present on a member:
 * combinations written for wind or seismic are dropped when that load is
 * absent, and combinations that reduce to an identical set of factored loads
 * are listed once.
 */
export function relevantCombinations(combos: Combination[], present: Partial<Record<LoadType, boolean>>): Combination[] {
  const seen = new Set<string>();
  const out: Combination[] = [];
  for (const c of combos) {
    const lateral = (["W", "E"] as const).filter((t) => (c.factors[t] ?? 0) !== 0);
    if (lateral.length && !lateral.some((t) => present[t])) continue;
    const active = LOAD_TYPES.filter((t) => (c.factors[t] ?? 0) !== 0 && present[t]);
    if (!active.length) continue;
    const key = `${c.kind}:` + active.map((t) => `${t}${c.factors[t]}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
