/**
 * SDPWS Table 4.2A — nominal unit shear capacities of wood structural panel
 * diaphragms, 2x nominal framing (minimum 1-1/2 in. width), field nailing 12 in.
 * Blocked: boundary and continuous panel edges parallel to load (cases 3 & 4)
 * / other panel edges spacing pairs 6/6, 4/6, 2-1/2/4, 2/3 in. Unblocked: case 1
 * (no unblocked edges or continuous joints parallel to load) and cases 2–6,
 * nails at 6 in. on supported edges.
 *
 * Nominal values; ASD = v / 2.0 (SDPWS-2021 4.2, Table 4.2A). Wind v_w = 1.4 v_s.
 *
 * Status: VERIFY — entered from SDPWS-2015 / 2021 Table 4.2A; confirm every
 * cell against the printed table of the adopted edition before issue.
 */

export type DiaphragmEdge = "6/6" | "4/6" | "2.5/4" | "2/3";

export interface DiaphragmRow {
  key: string;
  label: string;
  grade: "Structural I" | "Sheathing / Single-Floor";
  t: number;
  nail: string;
  penetration: number;
  blocked: Record<DiaphragmEdge, number>;
  unblocked: { case1: number; other: number };
}

const row = (
  key: string,
  grade: DiaphragmRow["grade"],
  t: string,
  nail: string,
  penetration: number,
  b: [number, number, number, number],
  u: [number, number],
): DiaphragmRow => ({
  key,
  label: `${t} in. ${grade === "Structural I" ? "Structural I" : "rated sheathing"}, ${nail}`,
  grade,
  t: eval_(t),
  nail,
  penetration,
  blocked: { "6/6": b[0], "4/6": b[1], "2.5/4": b[2], "2/3": b[3] },
  unblocked: { case1: u[0], other: u[1] },
});

function eval_(t: string) {
  const [n, d] = t.split("/").map(Number);
  return d ? n / d : n;
}

export const DIAPHRAGM_ROWS: DiaphragmRow[] = [
  row("SI-5/16-6d", "Structural I", "5/16", "6d common", 1.25, [370, 500, 750, 840], [330, 250]),
  row("SI-3/8-8d", "Structural I", "3/8", "8d common", 1.375, [540, 720, 1060, 1200], [480, 360]),
  row("SI-15/32-10d", "Structural I", "15/32", "10d common", 1.5, [640, 850, 1280, 1460], [570, 430]),
  row("SH-3/8-8d", "Sheathing / Single-Floor", "3/8", "8d common", 1.375, [480, 640, 960, 1090], [430, 320]),
  row("SH-7/16-8d", "Sheathing / Single-Floor", "7/16", "8d common", 1.375, [510, 680, 1010, 1150], [460, 340]),
  row("SH-15/32-8d", "Sheathing / Single-Floor", "15/32", "8d common", 1.375, [540, 720, 1060, 1200], [480, 360]),
  row("SH-15/32-10d", "Sheathing / Single-Floor", "15/32", "10d common", 1.5, [580, 770, 1150, 1310], [510, 380]),
  row("SH-19/32-10d", "Sheathing / Single-Floor", "19/32", "10d common", 1.5, [640, 850, 1280, 1460], [570, 430]),
];

export const diaphragmRow = (key: string): DiaphragmRow => {
  const r = DIAPHRAGM_ROWS.find((x) => x.key === key);
  if (!r) throw new Error(`Unknown diaphragm sheathing ${key}`);
  return r;
};

/** Nominal seismic / wind unit shear for a diaphragm construction. */
export function diaphragmValues(
  key: string,
  blocked: boolean,
  edge: DiaphragmEdge,
  unblockedCase: 1 | 2,
): { vs: number; vw: number; row: DiaphragmRow; text: string } {
  const r = diaphragmRow(key);
  const vs = blocked ? r.blocked[edge] : unblockedCase === 1 ? r.unblocked.case1 : r.unblocked.other;
  const vw = Math.round((1.4 * vs) / 5) * 5;
  const text = blocked
    ? `${r.label}, blocked, ${edge.replace("2.5", "2-1/2")} in. edge nailing, 12 in. field`
    : `${r.label}, unblocked (load case ${unblockedCase === 1 ? "1" : "2–6"}), 6 in. edge nailing, 12 in. field`;
  return { vs, vw, row: r, text };
}

/** SDPWS maximum diaphragm aspect ratio L/W (wood structural panels; Table 4.2.4 in 2015). */
export const diaphragmMaxAspect = (blocked: boolean) => (blocked ? 4 : 3);
