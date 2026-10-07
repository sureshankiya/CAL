/**
 * Anchorage to concrete and bolted sill plates.
 *
 * ACI 318-19 Ch. 17, single cast-in headed anchor (threaded rod or bolt with
 * nut / plate), strength design:
 *  - steel in tension N_sa = A_se,N f_uta (17.6.1.2), φ = 0.75 (ductile)
 *  - concrete breakout N_cb = (A_Nc / A_Nco) ψ_ed,N ψ_c,N ψ_cp,N N_b (17.6.2),
 *    N_b = k_c λ_a √f'c h_ef^1.5, k_c = 24 (cast-in), φ = 0.70 (Condition B)
 *  - pullout N_pn = ψ_c,P 8 A_brg f'c (17.6.3), φ = 0.70
 *  - side-face blowout N_sb = 160 c_a1 √A_brg λ_a √f'c when c_a1 < 0.4 h_ef (17.6.4)
 *  - seismic (SDC C–F): concrete tension strengths × 0.75 (17.10.5.4)
 *  - steel in shear V_sa = 0.6 A_se,V f_uta (17.7.1.2b), φ = 0.65
 *  - concrete breakout in shear, load parallel to the edge: 2 V_cb with ψ_ed,V = 1.0 (17.7.2.1c)
 *  - pryout V_cp = k_cp N_cb (17.7.3)
 *
 * NDS 12.3 yield limit equations for a bolt through a wood sill plate into
 * concrete (single shear), loaded parallel to the sill grain.
 */

/** UNC threads per inch. */
const THREADS: Record<string, number> = {
  "0.5": 13,
  "0.625": 11,
  "0.75": 10,
  "0.875": 9,
  "1": 8,
  "1.125": 7,
  "1.25": 7,
};

/** Effective tensile stress area A_se = π/4 (d − 0.9743 / n_t)². */
export function effectiveArea(d: number): number {
  const nt = THREADS[String(d)];
  if (!nt) throw new Error(`No thread data for ${d} in. anchor`);
  return (Math.PI / 4) * (d - 0.9743 / nt) ** 2;
}

export interface AnchorSteel {
  label: string;
  fya: number;
  futa: number;
}

export const ANCHOR_STEELS: AnchorSteel[] = [
  { label: "ASTM F1554 Grade 36", fya: 36000, futa: 58000 },
  { label: "ASTM A307 Grade A / C", fya: 36000, futa: 60000 },
  { label: "ASTM F1554 Grade 55", fya: 55000, futa: 75000 },
];

export interface ConcreteAnchorInput {
  d: number;
  steel: AnchorSteel;
  /** effective embedment, in */
  hef: number;
  /** edge distances to the four sides, in (Infinity when far) */
  edges: [number, number, number, number];
  /** bearing area of the head / nut / plate, in² */
  Abrg: number;
  fc: number;
  cracked: boolean;
  seismic: boolean;
  lambda?: number;
}

export interface ConcreteTension {
  Ase: number;
  futa: number;
  Nsa: number;
  phiNsa: number;
  ANc: number;
  ANco: number;
  caMin: number;
  psiEd: number;
  psiC: number;
  Nb: number;
  Ncb: number;
  phiNcb: number;
  Np: number;
  psiCP: number;
  phiNpn: number;
  Nsb?: number;
  phiNsb?: number;
  seismicFactor: number;
  phiNn: number;
  governs: string;
}

export function anchorTension(i: ConcreteAnchorInput): ConcreteTension {
  const lam = i.lambda ?? 1;
  const Ase = effectiveArea(i.d);
  const futa = Math.min(i.steel.futa, 1.9 * i.steel.fya, 125000);
  const Nsa = Ase * futa;
  const phiNsa = 0.75 * Nsa;
  const c = i.edges.map((e) => Math.min(e, 1.5 * i.hef));
  const ANc = (c[0] + c[1]) * (c[2] + c[3]);
  const ANco = 9 * i.hef * i.hef;
  const caMin = Math.min(...i.edges);
  const psiEd = caMin >= 1.5 * i.hef ? 1 : 0.7 + (0.3 * caMin) / (1.5 * i.hef);
  const psiC = i.cracked ? 1.0 : 1.25;
  const Nb = i.hef <= 11 ? 24 * lam * Math.sqrt(i.fc) * i.hef ** 1.5 : 16 * lam * Math.sqrt(i.fc) * i.hef ** (5 / 3);
  const Ncb = (Math.min(ANc, ANco) / ANco) * psiEd * psiC * Nb;
  const sf = i.seismic ? 0.75 : 1;
  const phiNcb = 0.7 * Ncb * sf;
  const psiCP = i.cracked ? 1.0 : 1.4;
  const Np = 8 * i.Abrg * i.fc;
  const phiNpn = 0.7 * psiCP * Np * sf;
  let Nsb: number | undefined;
  let phiNsb: number | undefined;
  if (caMin < 0.4 * i.hef) {
    Nsb = 160 * caMin * Math.sqrt(i.Abrg) * lam * Math.sqrt(i.fc);
    phiNsb = 0.7 * Nsb * sf;
  }
  const cands: Array<[string, number]> = [
    ["steel (17.6.1)", phiNsa],
    ["concrete breakout (17.6.2)", phiNcb],
    ["pullout (17.6.3)", phiNpn],
  ];
  if (phiNsb !== undefined) cands.push(["side-face blowout (17.6.4)", phiNsb]);
  const gov = cands.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    Ase,
    futa,
    Nsa,
    phiNsa,
    ANc,
    ANco,
    caMin,
    psiEd,
    psiC,
    Nb,
    Ncb,
    phiNcb,
    Np,
    psiCP,
    phiNpn,
    Nsb,
    phiNsb,
    seismicFactor: sf,
    phiNn: gov[1],
    governs: gov[0],
  };
}

export interface ShearParallelInput {
  d: number;
  steel: AnchorSteel;
  hef: number;
  /** edge distance perpendicular to the load direction (sill edge), in */
  ca1: number;
  /** member thickness (footing depth), in */
  ha: number;
  /** load-bearing length l_e = min(h_ef, 8 d), in */
  fc: number;
  cracked: boolean;
  lambda?: number;
  /** breakout strength in tension for pryout, lb (nominal N_cb) */
  Ncb: number;
}

export function anchorShearParallel(i: ShearParallelInput) {
  const lam = i.lambda ?? 1;
  const Ase = effectiveArea(i.d);
  const futa = Math.min(i.steel.futa, 1.9 * i.steel.fya, 125000);
  const Vsa = 0.6 * Ase * futa;
  const phiVsa = 0.65 * Vsa;
  const le = Math.min(i.hef, 8 * i.d);
  const ca1 = i.ca1;
  const Vb = Math.min(
    7 * (le / i.d) ** 0.2 * Math.sqrt(i.d) * lam * Math.sqrt(i.fc) * ca1 ** 1.5,
    9 * lam * Math.sqrt(i.fc) * ca1 ** 1.5,
  );
  const AVco = 4.5 * ca1 * ca1;
  const AVc = 3 * ca1 * Math.min(1.5 * ca1, i.ha);
  const psiH = Math.max(1, Math.sqrt((1.5 * ca1) / i.ha));
  const psiC = i.cracked ? 1.0 : 1.4;
  const Vcb = (AVc / AVco) * 1.0 * psiC * psiH * Vb;
  const VcbPar = 2 * Vcb;
  const phiVcb = 0.7 * VcbPar;
  const kcp = i.hef < 2.5 ? 1 : 2;
  const Vcp = kcp * i.Ncb;
  const phiVcp = 0.7 * Vcp;
  const cands: Array<[string, number]> = [
    ["steel (17.7.1)", phiVsa],
    ["concrete breakout, parallel to edge (17.7.2.1c)", phiVcb],
    ["pryout (17.7.3)", phiVcp],
  ];
  const gov = cands.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    Ase,
    Vsa,
    phiVsa,
    le,
    Vb,
    AVc,
    AVco,
    psiH,
    psiC,
    Vcb,
    VcbPar,
    phiVcb,
    Vcp,
    phiVcp,
    phiVn: gov[1],
    governs: gov[0],
  };
}

/**
 * NDS 12.3.1 yield limit equations, single shear, bolt through a wood side
 * member (sill) into concrete (main member), load parallel to the sill grain.
 * Fe∥ = 11,200 G (Table 12.3.3); bolt F_yb = 45,000 psi; R_d per Table 12.3.1B
 * with K_θ = 1.0 (θ = 0). The dowel bearing strength of the concrete is an input
 * (default 7,500 psi — VERIFY).
 */
export function boltInConcrete(D: number, ts: number, G: number, lm: number, FeConcrete = 7500) {
  const Fes = 11200 * G;
  const Fem = FeConcrete;
  const Fyb = 45000;
  const Re = Fem / Fes;
  const Rt = lm / ts;
  const k1 = (Math.sqrt(Re + 2 * Re * Re * (1 + Rt + Rt * Rt) + Rt * Rt * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D * D) / (3 * Fem * lm * lm));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D * D) / (3 * Fem * ts * ts));
  const modes = {
    Im: (D * lm * Fem) / 4,
    Is: (D * ts * Fes) / 4,
    II: (k1 * D * ts * Fes) / 3.6,
    IIIm: (k2 * D * lm * Fem) / ((1 + 2 * Re) * 3.2),
    IIIs: (k3 * D * ts * Fem) / ((2 + Re) * 3.2),
    IV: ((D * D) / 3.2) * Math.sqrt((2 * Fem * Fyb) / (3 * (1 + Re))),
  };
  let mode = "Im";
  let Z = Infinity;
  for (const [k, v] of Object.entries(modes))
    if (v < Z) {
      Z = v;
      mode = k;
    }
  return { Z, mode, modes, Fes, Fem, Fyb };
}
