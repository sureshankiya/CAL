/**
 * SDPWS nominal unit shear capacities and apparent shear stiffness for
 * wood-frame shear walls (SDPWS Table 4.3A wood structural panels, blocked;
 * Table 4.3B particleboard; Table 4.3C gypsum). Nominal values: ASD capacity = v / 2.0 (SDPWS 4.3.3).
 *
 * Wind capacity v_w = 1.4 v_s for wood structural panels (Table 4.3A);
 * gypsum v_w = v_s (Table 4.3C).
 *
 * Status: VERIFY. Rows marked "portfolio" match the values printed on the Tedds
 * shear-wall sheets in the engineer's permit sets; the remaining cells were
 * entered from the 2015 / 2021 tables and must be confirmed against the
 * printed SDPWS of the adopted edition before issue.
 */

export type SheathingFamily = "wsp" | "gypsum";

export interface SheathingRow {
  key: string;
  family: SheathingFamily;
  /** printed description, e.g. "15/32 in. Structural I OSB" */
  label: string;
  nail: string;
  /** minimum fastener penetration into framing, in */
  penetration: number;
  /** panel thickness, in */
  t: number;
  /** nominal seismic unit shear v_s by edge spacing (in), plf */
  vs: Partial<Record<6 | 4 | 3 | 2, number>>;
  /** apparent shear stiffness G_a by edge spacing, kips/in (OSB / plywood for WSP) */
  Ga: Partial<Record<6 | 4 | 3 | 2, number>>;
  /** maximum aspect ratio h / b_s (SDPWS Table 4.3.4) */
  maxAspect: number;
  /** cells taken from the engineer's Tedds sheets, as "spacing" keys */
  portfolio?: Array<6 | 4 | 3 | 2>;
  table: "4.3A" | "4.3B" | "4.3C";
  note?: string;
}

const wsp = (
  key: string,
  label: string,
  nail: string,
  penetration: number,
  t: number,
  vs: [number, number, number, number],
  Ga: [number, number, number, number],
  portfolio?: Array<6 | 4 | 3 | 2>,
  note?: string,
): SheathingRow => ({
  key,
  family: "wsp",
  label,
  nail,
  penetration,
  t,
  vs: { 6: vs[0], 4: vs[1], 3: vs[2], 2: vs[3] },
  Ga: { 6: Ga[0], 4: Ga[1], 3: Ga[2], 2: Ga[3] },
  maxAspect: 3.5,
  portfolio,
  table: "4.3A",
  note,
});

export const SHEATHING: SheathingRow[] = [
  wsp(
    "SI-5/16-6d",
    "5/16 in. Structural I OSB",
    "6d common",
    1.25,
    0.3125,
    [400, 600, 780, 1020],
    [13, 18, 23, 35],
    [4],
  ),
  wsp("SI-3/8-8d", "3/8 in. Structural I OSB", "8d common", 1.375, 0.375, [460, 720, 920, 1220], [19, 24, 30, 43]),
  wsp(
    "SI-7/16-8d",
    "7/16 in. Structural I OSB",
    "8d common",
    1.375,
    0.4375,
    [510, 790, 1010, 1340],
    [16, 21, 27, 40],
    undefined,
    "Portfolio Tedds sheets print v_s = 860 plf at 4 in. for this panel (15/32 in. values) — confirm the adopted SDPWS row",
  ),
  wsp(
    "SI-15/32-8d",
    "15/32 in. Structural I OSB",
    "8d common",
    1.375,
    0.46875,
    [560, 860, 1100, 1460],
    [14, 20, 26, 38],
  ),
  wsp(
    "SI-15/32-10d",
    "15/32 in. Structural I OSB",
    "10d common",
    1.5,
    0.46875,
    [680, 1020, 1330, 1740],
    [22, 29, 36, 51],
  ),
  wsp(
    "SH-3/8-6d",
    "3/8 in. rated sheathing OSB",
    "6d common",
    1.25,
    0.375,
    [400, 600, 780, 1020],
    [11, 15, 19, 26],
    [6],
  ),
  wsp("SH-3/8-8d", "3/8 in. rated sheathing OSB", "8d common", 1.375, 0.375, [440, 640, 820, 1060], [14, 20, 25, 34]),
  wsp(
    "SH-7/16-8d",
    "7/16 in. rated sheathing OSB",
    "8d common",
    1.375,
    0.4375,
    [480, 700, 900, 1170],
    [15, 21, 26, 36],
  ),
  wsp(
    "SH-7/16-8d-across",
    "7/16 in. rated sheathing OSB, long dimension across studs",
    "8d common",
    1.375,
    0.4375,
    [520, 760, 980, 1280],
    [16, 22, 27, 37],
    [4],
    "SDPWS Table 4.3A note: 15/32 in. values for 3/8 and 7/16 in. panels applied across studs",
  ),
  wsp(
    "SH-15/32-8d",
    "15/32 in. rated sheathing OSB",
    "8d common",
    1.375,
    0.46875,
    [520, 760, 980, 1280],
    [16, 22, 27, 37],
    [4],
  ),
  wsp(
    "SH-15/32-10d",
    "15/32 in. rated sheathing OSB",
    "10d common",
    1.5,
    0.46875,
    [620, 920, 1200, 1540],
    [20, 26, 33, 46],
  ),
  wsp(
    "SH-19/32-10d",
    "19/32 in. rated sheathing OSB",
    "10d common",
    1.5,
    0.59375,
    [680, 1020, 1330, 1740],
    [22, 29, 36, 51],
  ),
  {
    key: "PB-5/8-10d",
    family: "wsp",
    label: "5/8 in. particleboard sheathing",
    nail: "10d common",
    penetration: 1.5,
    t: 0.625,
    vs: { 4: 610 },
    Ga: { 4: 23 },
    maxAspect: 2,
    portfolio: [4],
    table: "4.3B",
    note: "Particleboard (SDPWS Table 4.3B); v_w = 1.4 v_s; maximum aspect ratio 2:1 as printed on the portfolio Tedds sheets",
  },
  {
    key: "PS-3/8-8dcasing",
    family: "wsp",
    label: "3/8 in. plywood panel siding",
    nail: "8d galvanized casing",
    penetration: 1.375,
    t: 0.375,
    vs: { 4: 480 },
    Ga: { 4: 18 },
    maxAspect: 3.5,
    portfolio: [4],
    table: "4.3A",
  },
  {
    key: "GWB-1/2-4",
    family: "gypsum",
    label: "1/2 in. gypsum wallboard, unblocked",
    nail: "5d cooler or 0.120 in. nail",
    penetration: 1,
    t: 0.5,
    vs: { 4: 250 },
    Ga: { 4: 6.5 },
    maxAspect: 1.5,
    portfolio: [4],
    table: "4.3C",
    note: "Unblocked gypsum: maximum aspect ratio 1.5:1 (SDPWS Table 4.3.4, as printed on the portfolio Tedds sheets)",
  },
  {
    key: "GSH-1/2-2x8-4",
    family: "gypsum",
    label: "1/2 in. × 2 ft × 8 ft gypsum sheathing, unblocked",
    nail: "0.120 in. nail",
    penetration: 1,
    t: 0.5,
    vs: { 4: 150 },
    Ga: { 4: 4 },
    maxAspect: 1.5,
    portfolio: [4],
    table: "4.3C",
  },
  {
    key: "GSH-1/2-4-blocked",
    family: "gypsum",
    label: "1/2 in. × 4 ft gypsum sheathing, blocked",
    nail: "0.120 in. nail",
    penetration: 1,
    t: 0.5,
    vs: { 4: 350 },
    Ga: { 4: 8.5 },
    maxAspect: 2,
    portfolio: [4],
    table: "4.3C",
  },
  {
    key: "GWB-5/8-4-blocked",
    family: "gypsum",
    label: "5/8 in. gypsum wallboard, blocked",
    nail: "6d cooler or 0.120 in. nail",
    penetration: 1,
    t: 0.625,
    vs: { 4: 350 },
    Ga: { 4: 8.5 },
    maxAspect: 2,
    portfolio: [4],
    table: "4.3C",
  },
  {
    key: "GSH-5/8-4/7-blocked",
    family: "gypsum",
    label: "5/8 in. × 4 ft gypsum sheathing, blocked (4 in. edge / 7 in. field)",
    nail: "0.120 in. nail",
    penetration: 1,
    t: 0.625,
    vs: { 4: 400 },
    Ga: { 4: 9.5 },
    maxAspect: 2,
    portfolio: [4],
    table: "4.3C",
  },
];

export const sheathingRow = (key: string): SheathingRow => {
  const r = SHEATHING.find((s) => s.key === key);
  if (!r) throw new Error(`Unknown sheathing ${key}`);
  return r;
};

export const edgeSpacings = (r: SheathingRow) => ([6, 4, 3, 2] as const).filter((s) => r.vs[s] !== undefined);

/** Nominal unit shears and stiffness for a side; throws when the spacing is not tabulated. */
export function sideValues(key: string, spacing: number): { vs: number; vw: number; Ga: number; row: SheathingRow } {
  const row = sheathingRow(key);
  const s = spacing as 6 | 4 | 3 | 2;
  const vs = row.vs[s];
  const Ga = row.Ga[s];
  if (vs === undefined || Ga === undefined) throw new Error(`${row.label}: ${spacing} in. edge spacing not tabulated`);
  const vw = row.family === "wsp" ? Math.round((1.4 * vs) / 5) * 5 : vs;
  return { vs, vw, Ga, row };
}

/**
 * SDPWS Table 4.3A footnote: 3/8 in. and 7/16 in. wood structural panels on studs spaced
 * 16 in. o.c. or less, or applied with the long dimension across studs, may use the shear
 * values of 15/32 in. panels with the same nailing. Returns the 15/32 in. v_s, or undefined
 * when the row does not qualify or no 15/32 in. row has the same nail (VERIFY the footnote
 * in the adopted edition).
 */
export function panel1532Shear(key: string, spacing: number): { vs: number; key: string } | undefined {
  const row = sheathingRow(key);
  if (row.table !== "4.3A" || !(row.t === 0.375 || row.t === 0.4375)) return undefined;
  const k = key.replace(/-(3\/8|7\/16)-/, "-15/32-").replace(/-across$/, "");
  const alt = SHEATHING.find((r) => r.key === k);
  const vs = alt?.vs[spacing as 6 | 4 | 3 | 2];
  return alt && vs !== undefined ? { vs, key: k } : undefined;
}

/**
 * SDPWS-2021 4.3.4.2 aspect ratio factor for wood structural panel shear walls,
 * 2 < h/b_s ≤ 3.5: 1.25 − 0.125 h/b_s (wind and seismic). Gypsum walls are
 * limited to 2:1 without reduction.
 */
export function aspectFactor(family: SheathingFamily, hOverB: number): number {
  if (family === "wsp") return hOverB <= 2 ? 1 : 1.25 - 0.125 * hOverB;
  return 1;
}
