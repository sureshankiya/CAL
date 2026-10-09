/**
 * Uniform and concentrated live loads for one- and two-family dwellings.
 *  - Residential code basis: IRC / CRC Table R301.5 and R301.6.
 *  - Building code basis: IBC / CBC Table 1607.1 (residential, one- and two-family dwellings).
 * Roof live load reduction per ASCE 7 §4.8.2 (identical in ASCE 7-16 and 7-22).
 */

export type LiveBasis = "IRC" | "IBC";

export type LiveUse =
  | "attic-no-storage"
  | "attic-limited-storage"
  | "habitable-attic"
  | "sleeping"
  | "living"
  | "stairs"
  | "deck"
  | "balcony"
  | "garage"
  | "roof-ordinary"
  | "roof-garden"
  | "none";

export interface LiveLoadDef {
  use: LiveUse;
  label: string;
  /** IRC / CRC Table R301.5 (R301.6 for roofs), psf */
  irc: number;
  /** IBC / CBC Table 1607.1, psf */
  ibc: number;
  /** concentrated load, where the table requires one */
  concentrated?: string;
  /** printed reference for each basis */
  refIrc: string;
  refIbc: string;
  note?: string;
  /** roof live (Lr) rather than floor live (L) */
  roof?: boolean;
}

export const LIVE_LOADS: LiveLoadDef[] = [
  {
    use: "attic-no-storage",
    label: "Uninhabitable attic without storage",
    irc: 10,
    ibc: 10,
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1",
    note: "Not applied concurrently with other live loads",
  },
  {
    use: "attic-limited-storage",
    label: "Uninhabitable attic with limited storage",
    irc: 20,
    ibc: 20,
    refIrc: "Table R301.5 note g",
    refIbc: "Table 1607.1 notes i–k (2021 IBC); §1607.21.2 (2024 IBC)",
    note: "Applies where the clear height between joist and rafter is 42 in. or greater",
  },
  {
    use: "habitable-attic",
    label: "Habitable attic / attic served by fixed stairs",
    irc: 30,
    ibc: 30,
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1",
  },
  { use: "sleeping", label: "Sleeping rooms", irc: 30, ibc: 30, refIrc: "Table R301.5", refIbc: "Table 1607.1" },
  {
    use: "living",
    label: "Rooms other than sleeping rooms",
    irc: 40,
    ibc: 40,
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1",
  },
  {
    use: "stairs",
    label: "Stairs",
    irc: 40,
    ibc: 40,
    concentrated: "300 lb on 4 in.² (IRC) / 300 lb on 2 in. × 2 in. (IBC)",
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1",
  },
  {
    use: "deck",
    label: "Exterior decks",
    irc: 40,
    ibc: 60,
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1 (1.5 × area served, ≤ 100 psf)",
    note: "IBC: 1.5 times the live load of the area served",
  },
  {
    use: "balcony",
    label: "Exterior balconies",
    irc: 40,
    ibc: 60,
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1 (1.5 × area served, ≤ 100 psf)",
  },
  {
    use: "garage",
    label: "Garage — passenger vehicles only",
    irc: 50,
    ibc: 40,
    concentrated:
      "2,000 lb on 20 in.² (2021 IRC) / 4-1/2 in. × 4-1/2 in. (2024 IRC), elevated garage floors / per IBC 1607.7",
    refIrc: "Table R301.5",
    refIbc: "Table 1607.1",
  },
  {
    use: "roof-ordinary",
    label: "Roof — ordinary flat, pitched or curved",
    irc: 20,
    ibc: 20,
    refIrc: "Table R301.6",
    refIbc: "Table 1607.1",
    roof: true,
  },
  {
    use: "roof-garden",
    label: "Roof garden / occupiable roof",
    irc: 100,
    ibc: 100,
    refIrc: "R301.1.3 → IBC Table 1607.1",
    refIbc: "Table 1607.1",
    roof: false,
  },
  { use: "none", label: "No live load", irc: 0, ibc: 0, refIrc: "—", refIbc: "—" },
];

export const liveDef = (use: LiveUse): LiveLoadDef => {
  const d = LIVE_LOADS.find((l) => l.use === use);
  if (!d) throw new Error(`Unknown live-load use ${use}`);
  return d;
};

export function liveLoad(use: LiveUse, basis: LiveBasis): { psf: number; ref: string; label: string } {
  const d = liveDef(use);
  return basis === "IRC"
    ? { psf: d.irc, ref: `IRC / CRC ${d.refIrc}`, label: d.label }
    : { psf: d.ibc, ref: `IBC / CBC ${d.refIbc}`, label: d.label };
}

/** Guard and handrail loads, both bases (IRC Table R301.5; IBC 1607.9). */
export const GUARD_LOADS = {
  concentrated: 200,
  infill: 50,
  ref: "IRC Table R301.5 / IBC 1607.9",
} as const;

export interface RoofLiveReduction {
  L0: number;
  At: number;
  /** rise in inches per foot */
  F: number;
  R1: number;
  R2: number;
  Lr: number;
  /** true where the 12 psf floor or the L0 cap governs */
  bounded: "min" | "max" | null;
  ref: string;
}

/**
 * ASCE 7 §4.8.2: Lr = L0 R1 R2, 12 ≤ Lr ≤ L0 (L0 = 20 psf for ordinary roofs).
 *  R1 = 1 for At ≤ 200 ft²; 1.2 − 0.001 At for 200 < At < 600; 0.6 for At ≥ 600.
 *  R2 = 1 for F ≤ 4; 1.2 − 0.05 F for 4 < F < 12; 0.6 for F ≥ 12.
 */
export function roofLiveReduction(L0: number, At: number, F: number): RoofLiveReduction {
  const R1 = At <= 200 ? 1 : At < 600 ? 1.2 - 0.001 * At : 0.6;
  const R2 = F <= 4 ? 1 : F < 12 ? 1.2 - 0.05 * F : 0.6;
  const raw = L0 * R1 * R2;
  let Lr = raw;
  let bounded: RoofLiveReduction["bounded"] = null;
  if (raw < 12) {
    Lr = Math.min(12, L0);
    bounded = "min";
  } else if (raw > L0) {
    Lr = L0;
    bounded = "max";
  }
  return { L0, At, F, R1, R2, Lr, bounded, ref: "ASCE 7 §4.8.2, Eq. 4.8-1" };
}
