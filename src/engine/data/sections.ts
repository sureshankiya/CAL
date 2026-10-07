/**
 * Dressed section sizes and rectangular section properties.
 * Sawn lumber per NDS Supplement Table 1A (dressed, dry). SCL and glulam
 * widths are the common manufactured sizes.
 */

export interface RectSection {
  /** overall breadth (all plies), in */
  b: number;
  /** depth, in */
  d: number;
  plies: number;
  /** single-ply breadth, in */
  bPly: number;
}

/** Dressed depth for dimension lumber 2–4 in. thick (Table 1A). */
export function dressedDimensionWidth(nominal: number): number {
  const map: Record<number, number> = {
    2: 1.5,
    3: 2.5,
    4: 3.5,
    5: 4.5,
    6: 5.5,
    8: 7.25,
    10: 9.25,
    12: 11.25,
    14: 13.25,
    16: 15.25,
  };
  return map[nominal] ?? nominal - 0.75;
}

export const DIMENSION_SIZES = [
  "2x4",
  "2x6",
  "2x8",
  "2x10",
  "2x12",
  "2x14",
  "3x6",
  "3x8",
  "3x10",
  "3x12",
  "4x4",
  "4x6",
  "4x8",
  "4x10",
  "4x12",
  "4x14",
] as const;
export const TIMBER_SIZES = ["6x6", "6x8", "6x10", "6x12", "6x14", "8x8", "8x10", "8x12"] as const;
export const SAWN_SIZES = [...DIMENSION_SIZES, ...TIMBER_SIZES] as const;
export type SawnSize = (typeof SAWN_SIZES)[number];

export function parseNominal(size: string): { t: number; w: number } {
  const m = size.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`Bad nominal size ${size}`);
  return { t: Number(m[1]), w: Number(m[2]) };
}

/** Dressed thickness × depth for a nominal sawn size (dimension: Table 1A dry; timbers: Table 1B green, 1/2 in. off). */
export function sawnDressed(size: string): { b: number; d: number } {
  const { t, w } = parseNominal(size);
  if (t <= 4) return { b: dressedDimensionWidth(t), d: dressedDimensionWidth(w) };
  return { b: t - 0.5, d: w - 0.5 };
}

export function sawnSection(size: string, plies = 1): RectSection {
  const { b, d } = sawnDressed(size);
  return { b: b * plies, d, plies, bPly: b };
}

export const SCL_DEPTHS = [5.5, 7.25, 7.5, 9.25, 9.5, 11.25, 11.875, 14, 16, 18, 20, 24] as const;
export const SCL_PLY_WIDTH = 1.75;
export const PSL_WIDTHS = [3.5, 5.25, 7] as const;
export const GLULAM_WIDTHS = [3.125, 5.125, 6.75, 8.75] as const;

export const area = (s: { b: number; d: number }) => s.b * s.d;
export const sectionModulus = (s: { b: number; d: number }) => (s.b * s.d * s.d) / 6;
export const inertia = (s: { b: number; d: number }) => (s.b * s.d ** 3) / 12;
export const weakInertia = (s: RectSection) => (s.d * s.b ** 3) / 12;

/** NDS Supplement density formula, lb/ft³: 62.4 [G / (1 + G·0.009·m.c.)] [1 + m.c./100], m.c. = 19 %. */
export function woodDensity(G: number, mc = 19): number {
  return 62.4 * (G / (1 + G * 0.009 * mc)) * (1 + mc / 100);
}
