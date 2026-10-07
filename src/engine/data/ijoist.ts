/**
 * TJI® I-joist allowable design properties (100 % load duration), ported from
 * the JoistCalc Lovable app. Manufacturer data — confirm against the current
 * Weyerhaeuser TJ-4000 specifier's guide / ICC-ES ESR-1153 before issue.
 */

export type TjiSeries = "TJI 110" | "TJI 210" | "TJI 230" | "TJI 360" | "TJI 560";
export type TjiDepth = '9-1/2"' | '11-7/8"' | '14"' | '16"' | '18"';

export interface TjiProps {
  d: number;
  bf: number;
  tw: number;
  /** allowable moment, lb-ft */
  Mr: number;
  /** allowable shear, lb */
  Vr: number;
  /** stiffness, lb-in² */
  EI: number;
  /** shear deflection coefficient, lb */
  K: number;
  /** allowable end reaction at 1-3/4 in. bearing, lb */
  Rend: number;
  /** self weight, plf */
  weight: number;
}

export const TJI: Record<TjiSeries, Partial<Record<TjiDepth, TjiProps>>> = {
  "TJI 110": {
    '9-1/2"': { d: 9.5, bf: 1.75, tw: 0.375, Mr: 2500, Vr: 1220, EI: 185e6, K: 4.4e6, Rend: 1220, weight: 2.3 },
    '11-7/8"': { d: 11.875, bf: 1.75, tw: 0.375, Mr: 3160, Vr: 1435, EI: 289e6, K: 5.1e6, Rend: 1435, weight: 2.5 },
  },
  "TJI 210": {
    '9-1/2"': { d: 9.5, bf: 2.3, tw: 0.375, Mr: 3195, Vr: 1315, EI: 222e6, K: 4.6e6, Rend: 1315, weight: 2.7 },
    '11-7/8"': { d: 11.875, bf: 2.3, tw: 0.375, Mr: 4045, Vr: 1560, EI: 348e6, K: 5.3e6, Rend: 1560, weight: 2.9 },
    '14"': { d: 14, bf: 2.3, tw: 0.375, Mr: 4830, Vr: 1790, EI: 485e6, K: 5.9e6, Rend: 1790, weight: 3.1 },
  },
  "TJI 230": {
    '9-1/2"': { d: 9.5, bf: 2.3, tw: 0.375, Mr: 3705, Vr: 1360, EI: 258e6, K: 4.7e6, Rend: 1360, weight: 2.9 },
    '11-7/8"': { d: 11.875, bf: 2.3, tw: 0.375, Mr: 4695, Vr: 1615, EI: 405e6, K: 5.4e6, Rend: 1615, weight: 3.1 },
    '14"': { d: 14, bf: 2.3, tw: 0.375, Mr: 5615, Vr: 1855, EI: 565e6, K: 6.0e6, Rend: 1855, weight: 3.3 },
    '16"': { d: 16, bf: 2.3, tw: 0.375, Mr: 6510, Vr: 2090, EI: 738e6, K: 6.7e6, Rend: 2090, weight: 3.5 },
  },
  "TJI 360": {
    '11-7/8"': { d: 11.875, bf: 3.5, tw: 0.375, Mr: 6180, Vr: 1975, EI: 524e6, K: 5.6e6, Rend: 1975, weight: 3.8 },
    '14"': { d: 14, bf: 3.5, tw: 0.375, Mr: 7385, Vr: 2270, EI: 732e6, K: 6.2e6, Rend: 2270, weight: 4.0 },
    '16"': { d: 16, bf: 3.5, tw: 0.375, Mr: 8570, Vr: 2555, EI: 957e6, K: 6.9e6, Rend: 2555, weight: 4.2 },
  },
  "TJI 560": {
    '11-7/8"': { d: 11.875, bf: 3.5, tw: 0.4375, Mr: 7855, Vr: 2050, EI: 651e6, K: 5.8e6, Rend: 2050, weight: 4.6 },
    '14"': { d: 14, bf: 3.5, tw: 0.4375, Mr: 9400, Vr: 2355, EI: 911e6, K: 6.4e6, Rend: 2355, weight: 4.8 },
    '16"': { d: 16, bf: 3.5, tw: 0.4375, Mr: 10910, Vr: 2655, EI: 1192e6, K: 7.1e6, Rend: 2655, weight: 5.0 },
    '18"': { d: 18, bf: 3.5, tw: 0.4375, Mr: 12310, Vr: 2940, EI: 1500e6, K: 7.7e6, Rend: 2940, weight: 5.3 },
  },
};

export const TJI_SERIES = Object.keys(TJI) as TjiSeries[];
export const tjiDepths = (s: TjiSeries) => Object.keys(TJI[s]) as TjiDepth[];
export const tjiProps = (s: TjiSeries, d: TjiDepth): TjiProps | undefined => TJI[s][d];
