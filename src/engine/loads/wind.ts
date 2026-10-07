/**
 * Wind loads — ASCE 7 Ch. 26 velocity pressure, Ch. 28 Part 1 envelope
 * procedure (MWFRS, low-rise buildings) and Ch. 30 Part 1 wall components and
 * cladding (h ≤ 60 ft).
 *
 *  - Kz = 2.01 (z / zg)^(2/α), z ≥ 15 ft (Table 26.10-1 note); Exposure B, Ch. 28,
 *    z < 30 ft: Kz = 0.70 (Table 26.10-1 note a)
 *  - ASCE 7-16: qz = 0.00256 Kz Kzt Kd Ke V²     (Eq. 26.10-1)
 *    ASCE 7-22: qz = 0.00256 Kz Kzt Ke V², p uses qh Kd (Eq. 26.10-1, 28.3-1)
 *  - MWFRS: p = qh [(GCpf) − (GCpi)] (Eq. 28.3-1); horizontal force from windward minus
 *    leeward surfaces (GCpi cancels), Fig. 28.3-1 Load Cases A and B; minimum 16 psf
 *    on walls and 8 psf on the roof vertical projection (§28.3.4)
 *  - C&C walls: p = qh [(GCp) − (GCpi)], Fig. 30.3-1 zones 4 / 5, GCpi = ±0.18
 * Strength-level pressures (ASD combinations use 0.6W).
 */

import type { Asce7Edition } from "./snow";

export type Exposure = "B" | "C" | "D";

const EXPOSURE_CONST: Record<Exposure, { alpha: number; zg: number }> = {
  B: { alpha: 7.0, zg: 1200 },
  C: { alpha: 9.5, zg: 900 },
  D: { alpha: 11.5, zg: 700 },
};

export const KD_BUILDING = 0.85;

/** Velocity pressure exposure coefficient. */
export function Kz(z: number, exposure: Exposure, mwfrsCh28 = false): number {
  const { alpha, zg } = EXPOSURE_CONST[exposure];
  const zz = Math.max(z, 15);
  const k = 2.01 * Math.pow(zz / zg, 2 / alpha);
  if (mwfrsCh28 && exposure === "B" && z < 30) return Math.max(k, 0.7);
  return k;
}

export interface VelocityPressure {
  edition: Asce7Edition;
  V: number;
  Kz: number;
  Kzt: number;
  Kd: number;
  Ke: number;
  /** qh as defined by the edition's Eq. 26.10-1, psf */
  q: number;
  /** pressure multiplier: qh·Kd for ASCE 7-22, qh for ASCE 7-16 (Kd inside qh) */
  qEff: number;
  expr: string;
}

export function velocityPressure(
  edition: Asce7Edition,
  V: number,
  z: number,
  exposure: Exposure,
  Kzt: number,
  Ke: number,
  mwfrsCh28: boolean,
): VelocityPressure {
  const kz = Kz(z, exposure, mwfrsCh28);
  const Kd = KD_BUILDING;
  if (edition === "ASCE 7-16") {
    const q = 0.00256 * kz * Kzt * Kd * Ke * V * V;
    return {
      edition,
      V,
      Kz: kz,
      Kzt,
      Kd,
      Ke,
      q,
      qEff: q,
      expr: `qh = 0.00256 Kh Kzt Kd Ke V² = 0.00256 × ${kz.toFixed(3)} × ${Kzt.toFixed(2)} × ${Kd.toFixed(2)} × ${Ke.toFixed(2)} × ${V.toFixed(0)}²`,
    };
  }
  const q = 0.00256 * kz * Kzt * Ke * V * V;
  return {
    edition,
    V,
    Kz: kz,
    Kzt,
    Kd,
    Ke,
    q,
    qEff: q * Kd,
    expr: `qh = 0.00256 Kh Kzt Ke V² = 0.00256 × ${kz.toFixed(3)} × ${Kzt.toFixed(2)} × ${Ke.toFixed(2)} × ${V.toFixed(0)}²; pressures use qh Kd (Kd = ${Kd.toFixed(2)})`,
  };
}

type ZoneA = "1" | "2" | "3" | "4" | "1E" | "2E" | "3E" | "4E";
type ZoneB = "1" | "2" | "3" | "4" | "5" | "6" | "1E" | "2E" | "3E" | "4E" | "5E" | "6E";

const CASE_A: Array<[number, Record<ZoneA, number>]> = [
  [0, { "1": 0.4, "2": -0.69, "3": -0.37, "4": -0.29, "1E": 0.61, "2E": -1.07, "3E": -0.53, "4E": -0.43 }],
  [5, { "1": 0.4, "2": -0.69, "3": -0.37, "4": -0.29, "1E": 0.61, "2E": -1.07, "3E": -0.53, "4E": -0.43 }],
  [20, { "1": 0.53, "2": -0.69, "3": -0.48, "4": -0.43, "1E": 0.8, "2E": -1.07, "3E": -0.69, "4E": -0.64 }],
  [30, { "1": 0.56, "2": 0.21, "3": -0.43, "4": -0.37, "1E": 0.69, "2E": 0.27, "3E": -0.53, "4E": -0.48 }],
  [45, { "1": 0.56, "2": 0.21, "3": -0.43, "4": -0.37, "1E": 0.69, "2E": 0.27, "3E": -0.53, "4E": -0.48 }],
  [90, { "1": 0.56, "2": 0.56, "3": -0.37, "4": -0.37, "1E": 0.69, "2E": 0.69, "3E": -0.48, "4E": -0.48 }],
];

export const CASE_B: Record<ZoneB, number> = {
  "1": -0.45,
  "2": -0.69,
  "3": -0.37,
  "4": -0.45,
  "5": 0.4,
  "6": -0.29,
  "1E": -0.48,
  "2E": -1.07,
  "3E": -0.53,
  "4E": -0.48,
  "5E": 0.61,
  "6E": -0.43,
};

/** Fig. 28.3-1 Load Case A GCpf at roof angle θ (deg), linear interpolation. */
export function gcpfCaseA(thetaDeg: number): Record<ZoneA, number> {
  const t = Math.min(Math.max(thetaDeg, 0), 90);
  for (let i = 1; i < CASE_A.length; i++) {
    const [t0, a] = CASE_A[i - 1];
    const [t1, b] = CASE_A[i];
    if (t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      const out = {} as Record<ZoneA, number>;
      for (const k of Object.keys(a) as ZoneA[]) out[k] = a[k] + f * (b[k] - a[k]);
      return out;
    }
  }
  return CASE_A[CASE_A.length - 1][1];
}

/** End-zone dimension a (Fig. 28.3-1 note 9): min(0.1 least dim, 0.4h) ≥ max(0.04 least dim, 3 ft). */
export function endZoneA(leastDim: number, h: number): number {
  return Math.max(Math.min(0.1 * leastDim, 0.4 * h), 0.04 * leastDim, 3);
}

export interface WindBand {
  /** face width normal to the wind, ft */
  width: number;
  /** tributary wall height in this band, ft */
  wallHeight: number;
  /** roof vertical projection in this band, ft (top level only) */
  roofHeight: number;
}

export interface WindForce {
  case: "A" | "B";
  /** net horizontal GCpf, interior and end zones (walls) */
  wallInt: number;
  wallEnd: number;
  roofInt: number;
  roofEnd: number;
  a: number;
  /** horizontal force, lb (strength level) */
  F: number;
  /** §28.3.4 minimum force, lb */
  Fmin: number;
  governs: "envelope" | "minimum";
}

/**
 * Horizontal MWFRS force on a band of the building, strength level.
 * transverse = wind normal to the ridge (Load Case A); otherwise Load Case B
 * (wind parallel to the ridge; roof planes carry no horizontal component).
 */
export function mwfrsBandForce(
  qEff: number,
  band: WindBand,
  thetaDeg: number,
  transverse: boolean,
  a: number,
): WindForce {
  const end = Math.min(2 * a, band.width);
  const rest = Math.max(0, band.width - end);
  let wallInt: number;
  let wallEnd: number;
  let roofInt = 0;
  let roofEnd = 0;
  if (transverse) {
    const g = gcpfCaseA(thetaDeg);
    wallInt = g["1"] - g["4"];
    wallEnd = g["1E"] - g["4E"];
    roofInt = g["2"] - g["3"];
    roofEnd = g["2E"] - g["3E"];
  } else {
    wallInt = CASE_B["5"] - CASE_B["6"];
    wallEnd = CASE_B["5E"] - CASE_B["6E"];
  }
  // Load Case B: the gable-end / hip-end triangle (band.roofHeight = equivalent height) acts as end wall
  const wallH = transverse ? band.wallHeight : band.wallHeight + band.roofHeight;
  const walls = qEff * wallH * (wallEnd * end + wallInt * rest);
  const roof = transverse ? qEff * band.roofHeight * (roofEnd * end + roofInt * rest) : 0;
  const F = walls + roof;
  const Fmin = transverse
    ? 16 * band.wallHeight * band.width + 8 * band.roofHeight * band.width
    : 16 * (band.wallHeight + band.roofHeight) * band.width;
  return {
    case: transverse ? "A" : "B",
    wallInt,
    wallEnd,
    roofInt,
    roofEnd,
    a,
    F: Math.max(F, 0),
    Fmin,
    governs: F >= Fmin ? "envelope" : "minimum",
  };
}

/** Fig. 30.3-1 wall GCp (zones 4 / 5) for effective wind area A (ft²); 10 % reduction for θ ≤ 10°. */
export function wallGCp(A: number, zone: 4 | 5, thetaDeg: number): { pos: number; neg: number } {
  const lerp = (a10: number, a500: number) => {
    if (A <= 10) return a10;
    if (A >= 500) return a500;
    return a10 + ((a500 - a10) * Math.log10(A / 10)) / Math.log10(50);
  };
  const red = thetaDeg <= 10 ? 0.9 : 1;
  const pos = lerp(1.0, 0.7) * red;
  const neg = (zone === 4 ? lerp(-1.1, -0.8) : lerp(-1.4, -0.8)) * red;
  return { pos, neg };
}

export const GCPI_ENCLOSED = 0.18;

/** Net C&C wall pressure magnitude (strength level), psf. */
export function wallCCPressure(qEff: number, A: number, zone: 4 | 5, thetaDeg: number) {
  const g = wallGCp(A, zone, thetaDeg);
  const pPos = qEff * (g.pos + GCPI_ENCLOSED);
  const pNeg = qEff * (-g.neg + GCPI_ENCLOSED);
  return { ...g, pPos, pNeg, p: Math.max(pPos, pNeg) };
}
