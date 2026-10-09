/**
 * Structural steel shapes and materials.
 *
 *  - W and C shapes: tabulated properties from the AISC Shapes Database
 *    (v15.0 / v16.0). Entered from the AISC Manual; VERIFY against the current
 *    database before issue. A self-consistency test compares each row with
 *    properties computed from its plate dimensions to catch entry errors.
 *  - Rectangular / square HSS (ASTM A500 / A1085) and round HSS / pipe: computed
 *    from the nominal size with the AISC design wall thickness
 *    t_des = 0.93 t_nom (A500, AISC 360 §B4.2) and an outside corner radius of
 *    2 t_des (AISC Manual Part 1 convention for tabulated properties).
 *  - Materials: AISC Manual Table 2-4 preferred grades.
 */

export type ShapeFamily = "W" | "C" | "HSS" | "HSSR";

export interface SteelShape {
  name: string;
  family: ShapeFamily;
  /** weight, plf */
  wt: number;
  A: number;
  /** depth (W / C / rectangular HSS: overall depth; round: OD), in */
  d: number;
  /** flange width (rectangular HSS: overall width B) */
  bf: number;
  /** web thickness (HSS: design wall thickness) */
  tw: number;
  /** flange thickness (HSS: design wall thickness) */
  tf: number;
  /** design k distance (W, C), in */
  kdes: number;
  Ix: number;
  Sx: number;
  Zx: number;
  rx: number;
  Iy: number;
  Sy: number;
  Zy: number;
  ry: number;
  J: number;
  Cw: number;
  /** effective radius of gyration for LTB, in (Eq. F2-7) */
  rts: number;
  /** distance between flange centroids, in */
  ho: number;
  /** HSS nominal wall, in */
  tnom?: number;
  /** HSS torsional constant C, in³ */
  C?: number;
  source: string;
  checked: boolean;
}

type WRow = [
  string, // name
  number, // A
  number, // d
  number, // tw
  number, // bf
  number, // tf
  number, // kdes
  number, // Ix
  number, // Sx
  number, // Zx
  number, // rx
  number, // Iy
  number, // Sy
  number, // Zy
  number, // ry
  number, // J
  number, // Cw
  number, // rts
  number, // ho
];

const AISC_DB = "AISC Shapes Database v15.0 (AISC Manual 15th ed. Table 1-1 / 1-5)";

// prettier-ignore
const W_ROWS: WRow[] = [
  ["W6x9", 2.68, 5.9, 0.17, 3.94, 0.215, 0.465, 16.4, 5.56, 6.23, 2.47, 2.2, 1.11, 1.72, 0.905, 0.0405, 17.7, 1.06, 5.69],
  ["W6x12", 3.55, 6.03, 0.23, 4.0, 0.28, 0.53, 22.1, 7.31, 8.3, 2.49, 2.99, 1.5, 2.32, 0.918, 0.0903, 24.7, 1.08, 5.75],
  ["W6x15", 4.43, 5.99, 0.23, 5.99, 0.26, 0.51, 29.1, 9.72, 10.8, 2.56, 9.32, 3.11, 4.75, 1.45, 0.101, 76.5, 1.64, 5.73],
  ["W8x10", 2.96, 7.89, 0.17, 3.94, 0.205, 0.505, 30.8, 7.81, 8.87, 3.22, 2.09, 1.06, 1.66, 0.841, 0.0426, 30.9, 1.01, 7.69],
  ["W8x13", 3.84, 7.99, 0.23, 4.0, 0.255, 0.555, 39.6, 9.91, 11.4, 3.21, 2.73, 1.37, 2.15, 0.843, 0.0871, 40.8, 1.03, 7.74],
  ["W8x15", 4.44, 8.11, 0.245, 4.02, 0.315, 0.615, 48.0, 11.8, 13.6, 3.29, 3.41, 1.7, 2.67, 0.876, 0.137, 51.8, 1.06, 7.8],
  ["W8x18", 5.26, 8.14, 0.23, 5.25, 0.33, 0.63, 61.9, 15.2, 17.0, 3.43, 7.97, 3.04, 4.66, 1.23, 0.172, 122, 1.43, 7.81],
  ["W8x21", 6.16, 8.28, 0.25, 5.27, 0.4, 0.7, 75.3, 18.2, 20.4, 3.49, 9.77, 3.71, 5.69, 1.26, 0.282, 152, 1.45, 7.88],
  ["W8x24", 7.08, 7.93, 0.245, 6.5, 0.4, 0.7, 82.7, 20.9, 23.1, 3.42, 18.3, 5.63, 8.57, 1.61, 0.346, 259, 1.79, 7.53],
  ["W8x31", 9.13, 8.0, 0.285, 8.0, 0.435, 0.829, 110, 27.5, 30.4, 3.47, 37.1, 9.27, 14.1, 2.02, 0.536, 530, 2.26, 7.57],
  ["W10x12", 3.54, 9.87, 0.19, 3.96, 0.21, 0.51, 53.8, 10.9, 12.6, 3.9, 2.18, 1.1, 1.74, 0.785, 0.0547, 50.9, 0.983, 9.66],
  ["W10x15", 4.41, 9.99, 0.23, 4.0, 0.27, 0.57, 68.9, 13.8, 16.0, 3.95, 2.89, 1.45, 2.3, 0.81, 0.104, 68.3, 1.01, 9.72],
  ["W10x17", 4.99, 10.1, 0.24, 4.01, 0.33, 0.63, 81.9, 16.2, 18.7, 4.05, 3.56, 1.78, 2.8, 0.845, 0.156, 84.9, 1.05, 9.77],
  ["W10x19", 5.62, 10.2, 0.25, 4.02, 0.395, 0.695, 96.3, 18.8, 21.6, 4.14, 4.29, 2.14, 3.35, 0.874, 0.233, 104, 1.06, 9.81],
  ["W10x22", 6.49, 10.2, 0.24, 5.75, 0.36, 0.66, 118, 23.2, 26.0, 4.27, 11.4, 3.97, 6.1, 1.33, 0.239, 275, 1.55, 9.81],
  ["W10x26", 7.61, 10.3, 0.26, 5.77, 0.44, 0.74, 144, 27.9, 31.3, 4.35, 14.1, 4.89, 7.5, 1.36, 0.402, 345, 1.58, 9.89],
  ["W10x30", 8.84, 10.5, 0.3, 5.81, 0.51, 0.81, 170, 32.4, 36.6, 4.38, 16.7, 5.75, 8.84, 1.37, 0.622, 414, 1.6, 9.99],
  ["W10x33", 9.71, 9.73, 0.29, 7.96, 0.435, 0.935, 171, 35.0, 38.8, 4.19, 36.6, 9.2, 14.0, 1.94, 0.583, 791, 2.2, 9.3],
  ["W12x14", 4.16, 11.9, 0.2, 3.97, 0.225, 0.525, 88.6, 14.9, 17.4, 4.62, 2.36, 1.19, 1.9, 0.753, 0.0704, 80.4, 0.97, 11.7],
  ["W12x16", 4.71, 12.0, 0.22, 3.99, 0.265, 0.565, 103, 17.1, 20.1, 4.67, 2.82, 1.41, 2.26, 0.773, 0.103, 96.9, 0.994, 11.7],
  ["W12x19", 5.57, 12.2, 0.235, 4.01, 0.35, 0.65, 130, 21.3, 24.7, 4.82, 3.76, 1.88, 2.98, 0.822, 0.18, 131, 1.03, 11.8],
  ["W12x22", 6.48, 12.3, 0.26, 4.03, 0.425, 0.725, 156, 25.4, 29.3, 4.91, 4.66, 2.31, 3.66, 0.848, 0.293, 164, 1.04, 11.9],
  ["W12x26", 7.65, 12.2, 0.23, 6.49, 0.38, 0.68, 204, 33.4, 37.2, 5.17, 17.3, 5.34, 8.17, 1.51, 0.3, 607, 1.75, 11.8],
  ["W12x30", 8.79, 12.3, 0.26, 6.52, 0.44, 0.74, 238, 38.6, 43.1, 5.21, 20.3, 6.24, 9.56, 1.52, 0.457, 720, 1.77, 11.9],
  ["W12x35", 10.3, 12.5, 0.3, 6.56, 0.52, 0.82, 285, 45.6, 51.2, 5.25, 24.5, 7.47, 11.5, 1.54, 0.741, 879, 1.79, 12.0],
  ["W14x22", 6.49, 13.7, 0.23, 5.0, 0.335, 0.735, 199, 29.0, 33.2, 5.54, 7.0, 2.8, 4.39, 1.04, 0.208, 314, 1.27, 13.4],
  ["W14x26", 7.69, 13.9, 0.255, 5.03, 0.42, 0.82, 245, 35.3, 40.2, 5.65, 8.91, 3.55, 5.54, 1.08, 0.358, 405, 1.3, 13.5],
  ["W14x30", 8.85, 13.8, 0.27, 6.73, 0.385, 0.785, 291, 42.0, 47.3, 5.73, 19.6, 5.82, 8.99, 1.49, 0.38, 887, 1.77, 13.4],
];

// Channels: Sy / Zy are not used (minor-axis bending of channels is not checked)
// prettier-ignore
const C_ROWS: WRow[] = [
  ["C6x8.2", 2.39, 6.0, 0.2, 1.92, 0.343, 0.8125, 13.1, 4.35, 5.16, 2.34, 0.687, 0.488, 0, 0.536, 0.0745, 4.7, 0, 5.66],
  ["C8x11.5", 3.37, 8.0, 0.22, 2.26, 0.39, 0.9375, 32.5, 8.14, 9.63, 3.11, 1.31, 0.775, 0, 0.623, 0.13, 16.5, 0, 7.61],
  ["C8x13.75", 4.03, 8.0, 0.303, 2.34, 0.39, 0.9375, 36.1, 9.02, 11.0, 2.99, 1.53, 0.854, 0, 0.615, 0.186, 19.2, 0, 7.61],
  ["C10x15.3", 4.48, 10.0, 0.24, 2.6, 0.436, 1.0, 67.3, 13.5, 15.9, 3.87, 2.27, 1.15, 0, 0.711, 0.208, 45.2, 0, 9.56],
  ["C12x20.7", 6.08, 12.0, 0.282, 2.94, 0.501, 1.125, 129, 21.5, 25.6, 4.61, 3.86, 1.73, 0, 0.797, 0.369, 112, 0, 11.5],
];

function fromRow(r: WRow, family: "W" | "C"): SteelShape {
  const [name, A, d, tw, bf, tf, kdes, Ix, Sx, Zx, rx, Iy, Sy, Zy, ry, J, Cw, rts0, ho] = r;
  // rts from Eq. F2-7 (rts² = √(Iy Cw) / Sx) where not tabulated
  const rts = rts0 || Math.sqrt(Math.sqrt(Iy * Cw) / Sx);
  return {
    name,
    family,
    wt: Number(name.split("x")[1]),
    A,
    d,
    bf,
    tw,
    tf,
    kdes,
    Ix,
    Sx,
    Zx,
    rx,
    Iy,
    Sy,
    Zy,
    ry,
    J,
    Cw,
    rts,
    ho,
    source: AISC_DB,
    checked: false,
  };
}

/* ---------------- HSS computed from geometry ---------------- */

/**
 * Section properties of a rectangular tube with outside dimensions H × B,
 * wall t and outside corner radius ro = 2t (inside radius t), about the axis
 * parallel to B (bending in the H direction).
 */
function rectTube(H: number, B: number, t: number) {
  const ro = 2 * t;
  const ri = t;
  // solid rounded rectangle properties (area, I about centroid, plastic Z half-section first moment)
  const solid = (h: number, b: number, r: number) => {
    const A = h * b - (4 - Math.PI) * r * r;
    // corner: square r×r minus quarter circle, centroid located at distance from the outer edge
    const aq = (1 - Math.PI / 4) * r * r;
    // distance of the spandrel centroid from the corner along each axis: r(10 − 3π)/(12 − 3π)
    const c = (r * (10 - 3 * Math.PI)) / (12 - 3 * Math.PI);
    const yq = h / 2 - c;
    // spandrel second moment about its own centroid (axis parallel to side)
    const Iq_own = (1 / 3 - Math.PI / 16) * r ** 4 - aq * (r - c) ** 2;
    const I = (b * h ** 3) / 12 - 4 * (Iq_own + aq * yq * yq);
    // plastic modulus: 2 × first moment of half section about the centroidal axis
    const Zhalf = (b * (h / 2) ** 2) / 2 - 2 * aq * yq;
    return { A, I, Z: 2 * Zhalf };
  };
  const o = solid(H, B, ro);
  const i = solid(H - 2 * t, B - 2 * t, ri);
  return { A: o.A - i.A, I: o.I - i.I, Z: o.Z - i.Z };
}

/** St. Venant torsion constant of a rounded rectangular tube (AISC Manual Part 1). */
function tubeTorsion(H: number, B: number, t: number) {
  const Rc = 1.5 * t; // mid-thickness corner radius (ro = 2t)
  const p = 2 * (H - t + (B - t)) - 2 * (4 - Math.PI) * Rc;
  const Ap = (H - t) * (B - t) - (4 - Math.PI) * Rc * Rc;
  return { J: (4 * Ap * Ap * t) / p, C: 2 * Ap * t };
}

const HSS_SRC =
  "Computed: t_des = 0.93 t_nom (AISC 360 §B4.2), outside corner radius 2 t_des (AISC Manual Part 1) — VERIFY against AISC Table 1-11 / 1-12";

/** Rectangular / square HSS, e.g. "HSS6x6x1/4". */
export function hssRect(name: string): SteelShape {
  const m = /^HSS(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+)\/(\d+)$/.exec(name);
  if (!m) throw new Error(`Unrecognised HSS designation ${name}`);
  const H = Number(m[1]);
  const B = Number(m[2]);
  const tnom = Number(m[3]) / Number(m[4]);
  const t = Math.round(0.93 * tnom * 1000) / 1000;
  const x = rectTube(H, B, t);
  const y = rectTube(B, H, t);
  const tor = tubeTorsion(H, B, t);
  const A = x.A;
  return {
    name,
    family: "HSS",
    wt: A * 3.4,
    A,
    d: H,
    bf: B,
    tw: t,
    tf: t,
    kdes: 0,
    Ix: x.I,
    Sx: x.I / (H / 2),
    Zx: x.Z,
    rx: Math.sqrt(x.I / A),
    Iy: y.I,
    Sy: y.I / (B / 2),
    Zy: y.Z,
    ry: Math.sqrt(y.I / A),
    J: tor.J,
    Cw: 0,
    rts: 0,
    ho: H - t,
    tnom,
    C: tor.C,
    source: HSS_SRC,
    checked: false,
  };
}

/** Round HSS / pipe: OD × t_nom, e.g. "HSS4.500x0.237" or a standard pipe ("Pipe4STD"). */
export const PIPES: Record<string, [number, number]> = {
  Pipe3STD: [3.5, 0.216],
  "Pipe3-1/2STD": [4.0, 0.226],
  Pipe4STD: [4.5, 0.237],
  Pipe5STD: [5.563, 0.258],
  Pipe6STD: [6.625, 0.28],
  Pipe3XS: [3.5, 0.3],
  Pipe4XS: [4.5, 0.337],
};

export function hssRound(name: string): SteelShape {
  let D: number;
  let tnom: number;
  if (PIPES[name]) [D, tnom] = PIPES[name];
  else {
    const m = /^HSS(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(name);
    if (!m) throw new Error(`Unrecognised round HSS / pipe designation ${name}`);
    D = Number(m[1]);
    tnom = Number(m[2]);
  }
  const t = Math.round(0.93 * tnom * 1000) / 1000;
  const Di = D - 2 * t;
  const A = (Math.PI / 4) * (D * D - Di * Di);
  const I = (Math.PI / 64) * (D ** 4 - Di ** 4);
  const Z = (D ** 3 - Di ** 3) / 6;
  const J = 2 * I;
  return {
    name,
    family: "HSSR",
    wt: A * 3.4,
    A,
    d: D,
    bf: D,
    tw: t,
    tf: t,
    kdes: 0,
    Ix: I,
    Sx: I / (D / 2),
    Zx: Z,
    rx: Math.sqrt(I / A),
    Iy: I,
    Sy: I / (D / 2),
    Zy: Z,
    ry: Math.sqrt(I / A),
    J,
    Cw: 0,
    rts: 0,
    ho: D - t,
    tnom,
    C: J / (D / 2),
    source: HSS_SRC.replace("outside corner radius 2 t_des (AISC Manual Part 1)", "round section"),
    checked: false,
  };
}

export const W_SHAPES = W_ROWS.map((r) => fromRow(r, "W"));
export const C_SHAPES = C_ROWS.map((r) => fromRow(r, "C"));

const fr = (n: number, d: number) => `${n}/${d}`;
const HSS_WALLS = [fr(1, 8), fr(3, 16), fr(1, 4), fr(5, 16), fr(3, 8), fr(1, 2)];
const HSS_SIZES: Array<[number, number]> = [
  [3, 3],
  [3.5, 3.5],
  [4, 4],
  [4, 2],
  [5, 5],
  [5, 3],
  [6, 6],
  [6, 4],
  [6, 3],
  [7, 7],
  [8, 8],
  [8, 4],
  [8, 6],
  [10, 6],
  [10, 10],
  [12, 6],
  [12, 12],
];

export const HSS_NAMES: string[] = HSS_SIZES.flatMap(([H, B]) =>
  HSS_WALLS.filter((w) => {
    const t = Number(w.split("/")[0]) / Number(w.split("/")[1]);
    return Math.max(H, B) / t <= 64 && t <= Math.min(H, B) / 6;
  }).map((w) => `HSS${H}x${B}x${w}`),
);
export const ROUND_NAMES: string[] = Object.keys(PIPES);

export const STEEL_SHAPE_NAMES = [
  ...W_SHAPES.map((s) => s.name),
  ...C_SHAPES.map((s) => s.name),
  ...HSS_NAMES,
  ...ROUND_NAMES,
];

export function steelShape(name: string): SteelShape {
  const w = W_SHAPES.find((s) => s.name === name) ?? C_SHAPES.find((s) => s.name === name);
  if (w) return w;
  if (/^HSS[\d.]+x[\d.]+x\d+\/\d+$/.test(name)) return hssRect(name);
  if (PIPES[name] || /^HSS[\d.]+x[\d.]+$/.test(name)) return hssRound(name);
  throw new Error(`Unknown steel shape ${name}`);
}

/* ---------------- materials ---------------- */

export interface SteelGrade {
  id: string;
  label: string;
  Fy: number;
  Fu: number;
  families: ShapeFamily[] | "plate";
}

/** AISC Manual Table 2-4 preferred material (ksi). */
export const STEEL_GRADES: SteelGrade[] = [
  { id: "A992", label: "ASTM A992", Fy: 50, Fu: 65, families: ["W"] },
  { id: "A36", label: "ASTM A36", Fy: 36, Fu: 58, families: ["W", "C"] },
  { id: "A572-50", label: "ASTM A572 Gr. 50", Fy: 50, Fu: 65, families: ["W", "C"] },
  { id: "A500C", label: "ASTM A500 Gr. C (rect.)", Fy: 50, Fu: 62, families: ["HSS"] },
  { id: "A500B", label: "ASTM A500 Gr. B (rect.)", Fy: 46, Fu: 58, families: ["HSS"] },
  { id: "A500C-R", label: "ASTM A500 Gr. C (round)", Fy: 46, Fu: 62, families: ["HSSR"] },
  { id: "A53B", label: "ASTM A53 Gr. B (pipe)", Fy: 35, Fu: 60, families: ["HSSR"] },
  { id: "A36-PL", label: "ASTM A36 plate", Fy: 36, Fu: 58, families: "plate" },
];

export const steelGrade = (id: string): SteelGrade => {
  const g = STEEL_GRADES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown steel grade ${id}`);
  return g;
};

export const defaultGrade = (f: ShapeFamily) =>
  f === "W" ? "A992" : f === "C" ? "A36" : f === "HSS" ? "A500C" : "A53B";

export const E_STEEL = 29000;
export const G_STEEL = 11200;
