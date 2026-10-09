/**
 * Column base plates — AISC Design Guide 1 (2nd ed.) with AISC 360 J8 concrete
 * bearing. Units: kip, in, ksi. Moment about the plate N direction.
 *
 *  - Bearing: f_p,max = φ_c 0.85 f'c √(A2/A1) ≤ 2 (LRFD φ_c = 0.65; ASD Ω_c = 2.31)
 *  - Cantilevers m = (N − 0.95d)/2, n = (B − 0.80b_f)/2 (W) or (B − 0.95B_col)/2 (HSS);
 *    round HSS / pipe m = (N − 0.80D)/2, n = (B − 0.80D)/2 (AISC Design Guide 1),
 *    λn' = λ √(d b_f)/4 (DG1 Eq. 3.1.3); l = max(m, n, λn')
 *  - Small moment (e ≤ e_crit): Y = N − 2e, q = P/Y
 *  - Large moment (e > e_crit): Y = (f + N/2) − √((f + N/2)² − 2P(e + f)/q_max), T = q_max Y − P (DG1 3.4)
 *  - Plate at bearing interface: t_req = √(4 f_p Y (l − Y/2) / (φ_b F_y)) for Y < l, else √(2 f_p l² / (φ_b F_y))
 *  - Plate at tension interface: t_req = √(4 T x / (φ_b B F_y)), x = f − 0.95d/2 (HSS; 0.80D round) or f − d/2 + t_f/2 (W)
 *  - Anchor rods with built-up grout pad: bending over z = t_p + t_washer/2, f_t = M/Z + T/A_b against the
 *    Ch. J3 combined tension–shear strength, Table J3.2: F_nt = 0.75F_u, F_nv = 0.45F_u (J3.7 in 360-16)
 *  - Column-to-plate fillet weld all round: elastic line method, f_r = √(f_n² + f_v²) ≤ φ 0.60 F_EXX 0.707 w
 *    (directional increase not taken)
 */

import type { SteelShape } from "../data/steel";
import type { SteelMethod } from "./steel";

export interface BasePlateInput {
  method: SteelMethod;
  col: SteelShape;
  /** plate dimension parallel to the moment (N) and perpendicular (B), thickness, in */
  N: number;
  B: number;
  tp: number;
  Fy: number;
  fc: number;
  /** supporting concrete area A2, in² */
  A2: number;
  /** anchor rods: diameter, number per side in tension, edge distance from plate edge to rod centre e1 */
  rod: { d: number; Fu: number; nTension: number; nShear: number; e1: number; groutPad: boolean; washer: number };
  weld: { w: number; FEXX: number };
}

export interface BasePlateForces {
  P: number; // + compression, kip
  M: number; // kip-in
  V: number; // kip
}

export interface BasePlateResult {
  A1: number;
  Pp: number;
  fpMax: number;
  qMax: number;
  m: number;
  n: number;
  lambdaN: number;
  l: number;
  e: number;
  ecrit: number;
  f: number;
  regime: "axial" | "small" | "large" | "uplift";
  Y: number;
  q: number;
  fp: number;
  T: number;
  Trod: number;
  tReqBearing: number;
  x: number;
  tReqTension: number;
  tReq: number;
  bearingRatio: number;
  rod: {
    Ab: number;
    fv: number;
    z: number;
    Ml: number;
    Z: number;
    ftb: number;
    fta: number;
    ft: number;
    Fnt: number;
    Fnv: number;
    FntPrime: number;
    ratio: number;
  };
  weld: { Aw: number; Sw: number; fn: number; fv: number; fr: number; cap: number; ratio: number };
  lines: string[];
  ratio: number;
  governs: string;
}

export function designBasePlate(i: BasePlateInput, F: BasePlateForces): BasePlateResult {
  const lrfd = i.method === "LRFD";
  const lines: string[] = [];
  const A1 = i.B * i.N;
  const root = Math.min(Math.sqrt(i.A2 / A1), 2);
  const Pp = 0.85 * i.fc * A1 * root;
  const fpMax = lrfd ? 0.65 * 0.85 * i.fc * root : (0.85 * i.fc * root) / 2.31;
  const qMax = fpMax * i.B;
  const d = i.col.d;
  const bf = i.col.bf;
  const hss = i.col.family === "HSS" || i.col.family === "HSSR";
  const round = i.col.family === "HSSR";
  // DG1 bend-line factors: W 0.95d / 0.80b_f; rectangular HSS 0.95; round HSS / pipe 0.80D both ways
  const kd = round ? 0.8 : 0.95;
  const kb = round ? 0.8 : hss ? 0.95 : 0.8;
  const m = (i.N - kd * d) / 2;
  const n = (i.B - kb * bf) / 2;
  const phiB = 0.9;
  const omB = 1.67;
  const plateCap = (Mpl: number) => (lrfd ? Math.sqrt((4 * Mpl) / (phiB * i.Fy)) : Math.sqrt((4 * Mpl * omB) / i.Fy));
  const P = F.P;
  const Pc = lrfd ? 0.65 * Pp : Pp / 2.31;
  const X = P > 0 ? Math.min(1, ((4 * d * bf) / (d + bf) ** 2) * (P / Pc)) : 0;
  const lam = X > 0 ? Math.min(1, (2 * Math.sqrt(X)) / (1 + Math.sqrt(1 - X))) : 0;
  const lambdaN = (lam * Math.sqrt(d * bf)) / 4;
  const l = Math.max(m, n, lambdaN);
  const f = i.N / 2 - i.rod.e1;
  let e = 0;
  let ecrit = i.N / 2;
  let regime: BasePlateResult["regime"] = "axial";
  let Y = i.N;
  let q = 0;
  let T = 0;
  if (P <= 0) {
    regime = "uplift";
    T = -P + (Math.abs(F.M) > 0 ? Math.abs(F.M) / (2 * f) : 0);
    Y = 0;
  } else {
    e = Math.abs(F.M) / P;
    ecrit = i.N / 2 - P / (2 * qMax);
    if (e <= 1e-9) {
      regime = "axial";
      Y = i.N;
      q = P / i.N;
    } else if (e <= ecrit) {
      regime = "small";
      Y = i.N - 2 * e;
      q = P / Y;
    } else {
      regime = "large";
      const a = f + i.N / 2;
      const disc = a * a - (2 * P * (e + f)) / qMax;
      if (disc < 0) throw new Error("Base plate: no real bearing length — increase the plate size (DG1 Eq. 3.4.4)");
      Y = a - Math.sqrt(disc);
      q = qMax;
      T = qMax * Y - P;
    }
  }
  const fp = Y > 0 ? q / i.B : 0;
  const tReqBearing = Y <= 0 ? 0 : Y >= l ? plateCap((fp * l * l) / 2) : plateCap(fp * Y * (l - Y / 2));
  const x = hss ? f - (kd * d) / 2 : f - d / 2 + i.col.tf / 2;
  const tReqTension =
    T > 0 ? (lrfd ? Math.sqrt((4 * T * x) / (phiB * i.B * i.Fy)) : Math.sqrt((4 * T * x * omB) / (i.B * i.Fy))) : 0;
  const tReq = Math.max(tReqBearing, tReqTension);
  const Trod = T / Math.max(1, i.rod.nTension);
  lines.push(
    `A1 = B N = ${A1.toFixed(1)} in²; A2 = ${i.A2.toFixed(0)} in²; P_p = 0.85 f'c A1 min(√(A2/A1), 2) = ${Pp.toFixed(1)} kip (J8-2)`,
    `f_p,max = ${lrfd ? "φ_c" : "1/Ω_c ×"} 0.85 f'c min(√(A2/A1), 2) = ${fpMax.toFixed(2)} ksi; q_max = f_p,max B = ${qMax.toFixed(2)} kip/in`,
    `m = (N − ${kd.toFixed(2)}d)/2 = ${m.toFixed(3)} in; n = (B − ${kb.toFixed(2)}${round ? "D" : "b_f"})/2 = ${n.toFixed(3)} in; λn' = ${lambdaN.toFixed(3)} in; l = ${l.toFixed(3)} in`,
  );
  // anchor rods: tension + bending through the grout pad / washer
  const Ab = (Math.PI * i.rod.d ** 2) / 4;
  const fv = F.V / (Math.max(1, i.rod.nShear) * Ab);
  const z = i.rod.groutPad ? i.tp + i.rod.washer / 2 : 0;
  const Ml = (F.V * z) / Math.max(1, i.rod.nShear);
  const Zr = i.rod.d ** 3 / 6;
  const ftb = Zr > 0 ? Ml / Zr : 0;
  const fta = Trod / Ab;
  const ft = ftb + fta;
  const Fnt = 0.75 * i.rod.Fu;
  const Fnv = 0.45 * i.rod.Fu;
  const phiR = 0.75;
  const omR = 2.0;
  const FntPrime = lrfd
    ? Math.min(phiR * (1.3 * Fnt - (Fnt / (phiR * Fnv)) * fv), phiR * Fnt)
    : Math.min((1.3 * Fnt - ((omR * Fnt) / Fnv) * fv) / omR, Fnt / omR);
  const fvCap = lrfd ? phiR * Fnv : Fnv / omR;
  const rodRatio = Math.max(FntPrime > 0 ? ft / FntPrime : Infinity, fv / fvCap);
  // weld all round (rectangular HSS / W outline approximated by the column perimeter)
  const w = i.weld.w;
  const Aw = hss ? 2 * (d + bf) : 2 * bf + 2 * (d - 2 * i.col.tf);
  const Sw = hss ? d * bf + (d * d) / 3 : bf * d + (d * d) / 3;
  const Pn = Math.max(0, -P); // weld tension only from uplift; compression bears
  const fn = Pn / Aw + Math.abs(F.M) / Sw;
  const fvw = F.V / (hss ? 2 * d : 2 * (d - 2 * i.col.tf));
  const fr = Math.sqrt(fn * fn + fvw * fvw);
  const RnW = 0.6 * i.weld.FEXX * 0.707 * w;
  const capW = lrfd ? 0.75 * RnW : RnW / 2.0;
  // bearing: small moment q / q_max; large moment — the DG1 Eq. 3.4.4 existence ratio 2P(e + f)/q_max ÷ (f + N/2)²
  const bearingRatio = P <= 0 ? 0 : regime === "large" ? (2 * P * (e + f)) / qMax / (f + i.N / 2) ** 2 : q / qMax;
  const parts: Array<[string, number]> = [
    ["Plate thickness", tReq / i.tp],
    ["Concrete bearing", bearingRatio],
    ["Anchor rods, tension + bending", rodRatio],
    ["Column weld", fr / capW],
  ];
  const gov = parts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return {
    A1,
    Pp,
    fpMax,
    qMax,
    m,
    n,
    lambdaN,
    l,
    e,
    ecrit,
    f,
    regime,
    Y,
    q,
    fp,
    T,
    Trod,
    tReqBearing,
    x,
    tReqTension,
    tReq,
    bearingRatio,
    rod: { Ab, fv, z, Ml, Z: Zr, ftb, fta, ft, Fnt, Fnv, FntPrime, ratio: rodRatio },
    weld: { Aw, Sw, fn, fv: fvw, fr, cap: capW, ratio: fr / capW },
    lines,
    ratio: gov[1],
    governs: gov[0],
  };
}
