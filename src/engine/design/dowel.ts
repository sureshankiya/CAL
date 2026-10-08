/**
 * Dowel-type fasteners, NDS Chapter 12 — single-shear wood-to-wood nail
 * connections by the yield limit equations (NDS 12.3.1, Table 12.3.1A).
 *  - Dowel bearing strength, D < 1/4 in.: Fe = 16,600 G^1.84 psi (NDS Table 12.3.3 note)
 *  - Reduction term Rd = K_D: 2.2 for D ≤ 0.17 in.; 10D + 0.5 for 0.17 < D < 0.25 in. (Table 12.3.1B)
 *  - Nail bending yield strength by diameter (NDS Table 12N notes)
 *  - Main-member bearing length taken as the lesser of the member thickness and the
 *    penetration less a tapered tip of 2D (conservative); minimum penetration 6D
 */

export interface NailDef {
  key: string;
  label: string;
  D: number;
  L: number;
}

export const NAILS: NailDef[] = [
  { key: "8d-common", label: "8d common (0.131 × 2-1/2 in.)", D: 0.131, L: 2.5 },
  { key: "10d-common", label: "10d common (0.148 × 3 in.)", D: 0.148, L: 3.0 },
  { key: "12d-common", label: "12d common (0.148 × 3-1/4 in.)", D: 0.148, L: 3.25 },
  { key: "16d-common", label: "16d common (0.162 × 3-1/2 in.)", D: 0.162, L: 3.5 },
  { key: "16d-sinker", label: "16d sinker (0.148 × 3-1/4 in.)", D: 0.148, L: 3.25 },
  { key: "16d-box", label: "16d box (0.135 × 3-1/2 in.)", D: 0.135, L: 3.5 },
  { key: "pneu-131x3.25", label: "0.131 × 3-1/4 in. pneumatic (16d)", D: 0.131, L: 3.25 },
  { key: "pneu-131x3", label: "0.131 × 3 in. pneumatic (10d)", D: 0.131, L: 3.0 },
  { key: "20d-common", label: "20d common (0.192 × 4 in.)", D: 0.192, L: 4.0 },
];

export const nailDef = (key: string): NailDef => {
  const n = NAILS.find((x) => x.key === key);
  if (!n) throw new Error(`Unknown nail ${key}`);
  return n;
};

/** Nail bending yield strength Fyb, psi (NDS Table 12N notes). */
export function nailFyb(D: number): number {
  if (D <= 0.142) return 100_000;
  if (D <= 0.177) return 90_000;
  if (D <= 0.236) return 80_000;
  return 70_000;
}

/** Dowel bearing strength for D < 1/4 in., psi. */
export const dowelBearing = (G: number) => 16_600 * Math.pow(G, 1.84);

export interface NailShearInput {
  nail: NailDef;
  /** side-member thickness (member the head bears on), in */
  ts: number;
  /** main-member thickness, in */
  tm: number;
  Gs: number;
  Gm: number;
}

export interface NailShearResult {
  Z: number;
  mode: string;
  modes: Record<"Im" | "Is" | "II" | "IIIm" | "IIIs" | "IV", number>;
  Fes: number;
  Fem: number;
  Fyb: number;
  Rd: number;
  p: number;
  lm: number;
  ls: number;
  /** penetration below 6D: no lateral design value */
  penetrationOk: boolean;
}

/** Reference lateral design value Z for one nail in single shear (NDS 12.3.1). */
export function nailSingleShear(i: NailShearInput): NailShearResult {
  const D = i.nail.D;
  const Fes = dowelBearing(i.Gs);
  const Fem = dowelBearing(i.Gm);
  const Fyb = nailFyb(D);
  const Rd = D <= 0.17 ? 2.2 : 10 * D + 0.5;
  const ls = i.ts;
  const p = i.nail.L - i.ts;
  const lm = Math.max(0, Math.min(i.tm, p - 2 * D));
  const penetrationOk = p >= 6 * D;
  const Re = Fem / Fes;
  const Rt = lm / ls;
  const k1 = (Math.sqrt(Re + 2 * Re * Re * (1 + Rt + Rt * Rt) + Rt * Rt * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D * D) / (3 * Fem * lm * lm));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D * D) / (3 * Fem * ls * ls));
  const modes = {
    Im: (D * lm * Fem) / Rd,
    Is: (D * ls * Fes) / Rd,
    II: (k1 * D * ls * Fes) / Rd,
    IIIm: (k2 * D * lm * Fem) / ((1 + 2 * Re) * Rd),
    IIIs: (k3 * D * ls * Fem) / ((2 + Re) * Rd),
    IV: ((D * D) / Rd) * Math.sqrt((2 * Fem * Fyb) / (3 * (1 + Re))),
  };
  let mode = "Im";
  let Z = Infinity;
  for (const [k, v] of Object.entries(modes)) {
    if (v < Z) {
      Z = v;
      mode = k;
    }
  }
  return { Z: penetrationOk ? Z : 0, mode, modes, Fes, Fem, Fyb, Rd, p, lm, ls, penetrationOk };
}

/* ------------------------------------------------------------------------- */

/** Dowel bearing strength of wood for D ≥ 1/4 in. at an angle θ to grain (NDS Table 12.3.3, Eq. 12.3-11), psi. */
export function dowelBearingAngle(G: number, D: number, thetaDeg: number) {
  const Fpar = 11200 * G;
  const Fperp = (6100 * G ** 1.45) / Math.sqrt(D);
  const t = (thetaDeg * Math.PI) / 180;
  const Fe = (Fpar * Fperp) / (Fpar * Math.sin(t) ** 2 + Fperp * Math.cos(t) ** 2);
  return { Fpar, Fperp, Fe };
}

export interface DowelYieldInput {
  D: number;
  Fyb: number;
  /** side member: bearing length and dowel bearing strength */
  ls: number;
  Fes: number;
  /** main member: bearing length (dowel penetration) and dowel bearing strength */
  lm: number;
  Fem: number;
  /** largest angle of load to grain in either member, degrees (K_θ = 1 + 0.25 θ/90) */
  thetaDeg: number;
}

export interface DowelYieldResult {
  Z: number;
  mode: "Im" | "Is" | "II" | "IIIm" | "IIIs" | "IV";
  modes: Record<"Im" | "Is" | "II" | "IIIm" | "IIIs" | "IV", number>;
  Re: number;
  Rt: number;
  Ktheta: number;
  k1: number;
  k2: number;
  k3: number;
  Rd: { I: number; II: number; III: number };
}

/**
 * Single-shear yield limit equations (NDS 12.3.1, Table 12.3.1A) for bolts and
 * lag screws, D ≥ 1/4 in.: R_d = 4K_θ (Modes I), 3.6K_θ (II), 3.2K_θ (III, IV),
 * Table 12.3.1B.
 */
export function dowelYieldSingle(i: DowelYieldInput): DowelYieldResult {
  const { D, Fyb, ls, lm, Fes, Fem } = i;
  const Kt = 1 + (0.25 * Math.min(90, Math.abs(i.thetaDeg))) / 90;
  const Rd = { I: 4 * Kt, II: 3.6 * Kt, III: 3.2 * Kt };
  const Re = Fem / Fes;
  const Rt = lm / ls;
  const k1 = (Math.sqrt(Re + 2 * Re * Re * (1 + Rt + Rt * Rt) + Rt * Rt * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D * D) / (3 * Fem * lm * lm));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D * D) / (3 * Fem * ls * ls));
  const modes = {
    Im: (D * lm * Fem) / Rd.I,
    Is: (D * ls * Fes) / Rd.I,
    II: (k1 * D * ls * Fes) / Rd.II,
    IIIm: (k2 * D * lm * Fem) / ((1 + 2 * Re) * Rd.III),
    IIIs: (k3 * D * ls * Fem) / ((2 + Re) * Rd.III),
    IV: ((D * D) / Rd.III) * Math.sqrt((2 * Fem * Fyb) / (3 * (1 + Re))),
  };
  let mode: DowelYieldResult["mode"] = "Im";
  let Z = Infinity;
  for (const [k, v] of Object.entries(modes))
    if (v < Z) {
      Z = v;
      mode = k as DowelYieldResult["mode"];
    }
  return { Z, mode, modes, Re, Rt, Ktheta: Kt, k1, k2, k3, Rd };
}
