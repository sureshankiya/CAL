/**
 * Reference design values for sawn lumber, psi (NDS Supplement).
 *  - Table 4A: visually graded dimension lumber 2–4 in. thick (DF-L, HF, SPF), with C_F, C_fu, C_M.
 *  - Table 4B: Southern Pine dimension lumber — size-specific values; C_F only for
 *    4 in. thick 8 in.+ wide (Fb × 1.1) and widths over 12 in. (× 0.9).
 *  - Table 4D: timbers 5 in. × 5 in. and larger (DF-L), Beams & Stringers / Posts & Timbers.
 * NDS-2024 values are carried from the 2018 Supplement pending confirmation (see library.ts).
 */

import { parseNominal } from "./sections";

export interface RefValues {
  Fb: number;
  Ft: number;
  Fv: number;
  Fcperp: number;
  Fc: number;
  E: number;
  Emin: number;
}

export type Species = "DF-L" | "HF" | "SPF" | "SP";
export type Grade = "Sel Str" | "No.1 & Btr" | "No.1" | "No.2" | "No.3" | "Stud";

export const SPECIES_LABEL: Record<Species, string> = {
  "DF-L": "Douglas Fir-Larch",
  HF: "Hem-Fir",
  SPF: "Spruce-Pine-Fir",
  SP: "Southern Pine",
};

/** Specific gravity, NDS Table 12.3.3A. */
export const SPECIFIC_GRAVITY: Record<Species, number> = { "DF-L": 0.5, HF: 0.43, SPF: 0.42, SP: 0.55 };

const v = (Fb: number, Ft: number, Fv: number, Fcperp: number, Fc: number, E: number, Emin: number): RefValues => ({
  Fb,
  Ft,
  Fv,
  Fcperp,
  Fc,
  E,
  Emin,
});

/** Table 4A (2018). */
const T4A: Partial<Record<Species, Partial<Record<Grade, RefValues>>>> = {
  "DF-L": {
    "Sel Str": v(1500, 1000, 180, 625, 1700, 1_900_000, 690_000),
    "No.1 & Btr": v(1200, 800, 180, 625, 1550, 1_800_000, 660_000),
    "No.1": v(1000, 675, 180, 625, 1500, 1_700_000, 620_000),
    "No.2": v(900, 575, 180, 625, 1350, 1_600_000, 580_000),
    "No.3": v(525, 325, 180, 625, 775, 1_400_000, 510_000),
    Stud: v(700, 450, 180, 625, 850, 1_400_000, 510_000),
  },
  HF: {
    "Sel Str": v(1400, 925, 150, 405, 1500, 1_600_000, 580_000),
    "No.1 & Btr": v(1100, 725, 150, 405, 1350, 1_500_000, 550_000),
    "No.1": v(975, 625, 150, 405, 1350, 1_500_000, 550_000),
    "No.2": v(850, 525, 150, 405, 1300, 1_300_000, 470_000),
    "No.3": v(500, 300, 150, 405, 725, 1_200_000, 440_000),
    Stud: v(675, 400, 150, 405, 800, 1_200_000, 440_000),
  },
  SPF: {
    "Sel Str": v(1250, 700, 135, 425, 1400, 1_500_000, 550_000),
    "No.1": v(875, 450, 135, 425, 1150, 1_400_000, 510_000),
    "No.2": v(875, 450, 135, 425, 1150, 1_400_000, 510_000),
    "No.3": v(500, 250, 135, 425, 650, 1_200_000, 440_000),
    Stud: v(675, 350, 135, 425, 725, 1_200_000, 440_000),
  },
};

/**
 * Table 4B Southern Pine (2018 / 2024), keyed by nominal width class. No.1 F_c corrected
 * 2026-10-09 to the SPIB values (Supplement No. 13, 2013; SPIB 2021 rules) — the previous
 * entry was 150–200 psi high.
 */
type SPWidth = 4 | 6 | 8 | 10 | 12;
const T4B: Partial<Record<Grade, Record<SPWidth, RefValues>>> = {
  "No.1": {
    4: v(1500, 1000, 175, 565, 1650, 1_600_000, 580_000),
    6: v(1350, 875, 175, 565, 1550, 1_600_000, 580_000),
    8: v(1250, 800, 175, 565, 1500, 1_600_000, 580_000),
    10: v(1050, 700, 175, 565, 1450, 1_600_000, 580_000),
    12: v(1000, 650, 175, 565, 1400, 1_600_000, 580_000),
  },
  "No.2": {
    4: v(1100, 675, 175, 565, 1450, 1_400_000, 510_000),
    6: v(1000, 600, 175, 565, 1400, 1_400_000, 510_000),
    8: v(925, 550, 175, 565, 1350, 1_400_000, 510_000),
    10: v(800, 475, 175, 565, 1300, 1_400_000, 510_000),
    12: v(750, 450, 175, 565, 1250, 1_400_000, 510_000),
  },
};

/** Table 4D DF-L timbers (2018). */
const T4D: Record<"B&S" | "P&T", Partial<Record<Grade, RefValues>>> = {
  "B&S": {
    "Sel Str": v(1600, 950, 170, 625, 1100, 1_600_000, 580_000),
    "No.1": v(1350, 675, 170, 625, 925, 1_600_000, 580_000),
    "No.2": v(875, 425, 170, 625, 600, 1_300_000, 470_000),
  },
  "P&T": {
    "Sel Str": v(1500, 1000, 170, 625, 1150, 1_600_000, 580_000),
    "No.1": v(1200, 825, 170, 625, 1000, 1_600_000, 580_000),
    "No.2": v(750, 475, 170, 625, 700, 1_300_000, 470_000),
  },
};

export interface SizeFactors {
  Fb: number;
  Ft: number;
  Fc: number;
}

export interface LumberDesignData {
  species: Species;
  grade: Grade;
  size: string;
  ref: RefValues;
  CF: SizeFactors;
  /** flat use factor (bending about weak axis), Table 4A / 4B */
  Cfu: number;
  /** wet-service factors for this size class */
  CM: { Fb: number; Ft: number; Fv: number; Fcperp: number; Fc: number; E: number };
  G: number;
  tableId: string;
  tableLabel: string;
  sizeClass: string;
}

/** Table 4A C_F (Select Structural, No.1 & Btr, No.1, No.2, No.3). */
function cf4A(t: number, w: number, grade: Grade): SizeFactors {
  if (grade === "Stud") {
    if (w <= 4) return { Fb: 1.1, Ft: 1.1, Fc: 1.05 };
    return { Fb: 1.0, Ft: 1.0, Fc: 1.0 };
  }
  const four = t >= 4;
  if (w <= 4) return { Fb: 1.5, Ft: 1.5, Fc: 1.15 };
  if (w === 5) return { Fb: 1.4, Ft: 1.4, Fc: 1.1 };
  if (w === 6) return { Fb: 1.3, Ft: 1.3, Fc: 1.1 };
  if (w === 8) return { Fb: four ? 1.3 : 1.2, Ft: 1.2, Fc: 1.05 };
  if (w === 10) return { Fb: four ? 1.2 : 1.1, Ft: 1.1, Fc: 1.0 };
  if (w === 12) return { Fb: four ? 1.1 : 1.0, Ft: 1.0, Fc: 1.0 };
  return { Fb: four ? 1.0 : 0.9, Ft: 0.9, Fc: 0.9 };
}

/** Table 4A / 4B flat-use factor C_fu. */
function cfu(t: number, w: number): number {
  if (t >= 4) {
    if (w <= 4) return 1.0;
    if (w <= 8) return 1.05;
    return 1.1;
  }
  if (w <= 3) return 1.0;
  if (w <= 5) return 1.1;
  if (w <= 8) return 1.15;
  return 1.2;
}

const CM_DIMENSION = { Fb: 0.85, Ft: 1.0, Fv: 0.97, Fcperp: 0.67, Fc: 0.8, E: 0.9 };
const CM_TIMBER = { Fb: 1.0, Ft: 1.0, Fv: 1.0, Fcperp: 0.67, Fc: 0.91, E: 1.0 };

export const GRADES_BY_SPECIES: Record<Species, Grade[]> = {
  "DF-L": ["Sel Str", "No.1 & Btr", "No.1", "No.2", "No.3", "Stud"],
  HF: ["Sel Str", "No.1 & Btr", "No.1", "No.2", "No.3", "Stud"],
  SPF: ["Sel Str", "No.1", "No.2", "No.3", "Stud"],
  SP: ["No.1", "No.2"],
};

/** Timber grades available in Table 4D (DF-L only in this library). */
export const TIMBER_GRADES: Grade[] = ["Sel Str", "No.1", "No.2"];

/**
 * Reference design data for a species / grade / nominal size.
 * Throws a descriptive error when the combination is not in the library.
 */
export function lumberData(
  species: Species,
  grade: Grade,
  size: string,
  nds: "NDS-2018" | "NDS-2024",
): LumberDesignData {
  const { t, w } = parseNominal(size);
  const ed = nds === "NDS-2024" ? "2024" : "2018";
  const G = SPECIFIC_GRAVITY[species];
  if (t >= 5) {
    if (species !== "DF-L")
      throw new Error(`Timber values (Table 4D) are only in the library for DF-L — ${species} ${size} not available`);
    const cls = w > t + 2 ? "B&S" : "P&T";
    const ref = T4D[cls][grade];
    if (!ref) throw new Error(`${grade} is not a Table 4D grade (use Sel Str, No.1 or No.2)`);
    const d = w - 0.5;
    const CFb = d > 12 ? Math.pow(12 / d, 1 / 9) : 1.0;
    return {
      species,
      grade,
      size,
      ref,
      CF: { Fb: CFb, Ft: 1, Fc: 1 },
      Cfu: 1,
      CM: CM_TIMBER,
      G,
      tableId: `nds${ed}-4D`,
      tableLabel: `NDS Supplement ${ed} Table 4D — ${cls === "B&S" ? "Beams & Stringers" : "Posts & Timbers"}`,
      sizeClass: cls === "B&S" ? "Beams and stringers" : "Posts and timbers",
    };
  }
  if (species === "SP") {
    const g = T4B[grade];
    if (!g) throw new Error(`Southern Pine ${grade} is not in the library (No.1, No.2 available)`);
    const wc: SPWidth = w <= 4 ? 4 : w <= 6 ? 6 : w <= 8 ? 8 : w <= 10 ? 10 : 12;
    const ref = g[wc];
    let CF: SizeFactors = { Fb: 1, Ft: 1, Fc: 1 };
    if (t >= 4 && w >= 8) CF = { ...CF, Fb: 1.1 };
    if (w > 12) CF = { Fb: 0.9, Ft: 0.9, Fc: 0.9 };
    return {
      species,
      grade,
      size,
      ref,
      CF,
      Cfu: cfu(t, w),
      CM: CM_DIMENSION,
      G,
      tableId: `nds${ed}-4B`,
      tableLabel: `NDS Supplement ${ed} Table 4B — Southern Pine, size-specific values`,
      sizeClass: "Dimension lumber, 2–4 in. thick",
    };
  }
  const ref = T4A[species]?.[grade];
  if (!ref) throw new Error(`${SPECIES_LABEL[species]} ${grade} is not in Table 4A of the library`);
  return {
    species,
    grade,
    size,
    ref,
    CF: cf4A(t, w, grade),
    Cfu: cfu(t, w),
    CM: CM_DIMENSION,
    G,
    tableId: `nds${ed}-4A`,
    tableLabel: `NDS Supplement ${ed} Table 4A — visually graded dimension lumber`,
    sizeClass: "Dimension lumber, 2–4 in. thick",
  };
}

export const speciesGradeLabel = (s: Species, g: Grade) => `${s} ${g}`;
