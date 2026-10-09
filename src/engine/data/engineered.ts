/**
 * Glulam (NDS Supplement Table 5A) and structural composite lumber defaults.
 * SCL values are manufacturer-specific: the defaults below are typical
 * published values and must be replaced with the specified product's ESR.
 */

export interface GlulamData {
  id: string;
  label: string;
  /** bending, tension zone stressed in tension (positive bending) */
  Fbx_pos: number;
  /** bending, compression zone stressed in tension (negative bending) */
  Fbx_neg: number;
  Fcperp_x: number;
  Fvx: number;
  Ex: number;
  Ex_min: number;
  /** weak-axis modulus for lateral-torsional stability (NDS 3.3.3.8 uses E'y,min for glulam) */
  Ey_min: number;
  Fc: number;
  Ft: number;
  G: number;
  density: number;
  /** volume-factor exponent x: 10 for Western species, 20 for Southern Pine (NDS 5.3.6) */
  x: number;
}

export const GLULAM: Record<string, GlulamData> = {
  "24F-V4": {
    id: "24F-V4",
    label: "24F-V4 DF/DF (unbalanced)",
    Fbx_pos: 2400,
    Fbx_neg: 1850,
    Fcperp_x: 650,
    Fvx: 265,
    Ex: 1_800_000,
    Ex_min: 950_000,
    Ey_min: 850_000,
    Fc: 1650,
    Ft: 1100,
    G: 0.5,
    density: 35,
    x: 10,
  },
  "24F-V8": {
    id: "24F-V8",
    label: "24F-V8 DF/DF (balanced)",
    Fbx_pos: 2400,
    Fbx_neg: 2400,
    Fcperp_x: 650,
    Fvx: 265,
    Ex: 1_800_000,
    Ex_min: 950_000,
    Ey_min: 850_000,
    Fc: 1650,
    Ft: 1100,
    G: 0.5,
    density: 35,
    x: 10,
  },
};

export interface SclData {
  id: string;
  label: string;
  Fb: number;
  /** depth effect: Fb × (12 / d)^exp */
  fbDepthExp: number;
  Fv: number;
  Fcperp: number;
  Fc: number;
  Ft: number;
  E: number;
  Emin: number;
  G: number;
  density: number;
  esr: string;
}

export const SCL: Record<string, SclData> = {
  "LVL 2.0E": {
    id: "LVL 2.0E",
    label: "LVL 2.0E (e.g. Microllam®)",
    Fb: 2600,
    fbDepthExp: 0.136,
    Fv: 285,
    Fcperp: 750,
    Fc: 2510,
    Ft: 1555,
    E: 2_000_000,
    Emin: 1_016_535,
    G: 0.5,
    density: 42,
    esr: "ESR per specified product",
  },
  "PSL 2.2E": {
    id: "PSL 2.2E",
    label: "PSL 2.2E (e.g. Parallam®)",
    Fb: 2900,
    fbDepthExp: 0.111,
    Fv: 290,
    Fcperp: 625,
    Fc: 2900,
    Ft: 2300,
    E: 2_200_000,
    Emin: 1_118_190,
    G: 0.5,
    density: 45,
    esr: "ESR per specified product",
  },
  "LSL 1.55E": {
    id: "LSL 1.55E",
    label: "LSL 1.55E (e.g. TimberStrand®)",
    Fb: 2325,
    fbDepthExp: 0.092,
    Fv: 310,
    Fcperp: 900,
    Fc: 2170,
    Ft: 1070,
    E: 1_550_000,
    Emin: 787_815,
    G: 0.5,
    density: 42,
    esr: "ESR per specified product",
  },
};
