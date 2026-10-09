/**
 * Post-installed adhesive anchors and drilled-in reinforcing dowels in a single row
 * at spacing s, near one edge (ACI 318-19 Ch. 17, strength design). Bond values
 * τ_cr / τ_uncr, k_c and φ come from the adhesive's ICC-ES report (entered, VERIFY).
 *
 *  Tension
 *   - steel N_sa = A_se,N f_uta (17.6.1.2), f_uta ≤ min(1.9 f_ya, 125 ksi), φ = 0.75
 *   - breakout N_cb = (A_Nc / A_Nco) ψ_ed,N ψ_c,N ψ_cp,N N_b, N_b = k_c λ_a √f'c h_ef^1.5 (17.6.2),
 *     A_Nco = 9 h_ef², per anchor A_Nc = min(s, 3 h_ef) × (min(c_a1, 1.5 h_ef) + 1.5 h_ef)
 *   - bond N_a = (A_Na / A_Nao) ψ_ed,Na ψ_cp,Na N_ba, N_ba = λ_a τ π d_a h_ef (17.6.5),
 *     c_Na = 10 d_a √(τ_uncr / 1100), A_Nao = (2 c_Na)², per anchor A_Na = min(s, 2 c_Na) × (min(c_a1, c_Na) + c_Na)
 *   - splitting in uncracked concrete: ψ_cp,N = max(c_a,min, 1.5 h_ef) / c_ac, ψ_cp,Na = max(c_a,min, c_Na) / c_ac ≤ 1
 *   - φ in tension (breakout and bond) by anchor category; φ in shear breakout / pryout by condition
 *   - seismic (SDC C–F): concrete-governed tension × 0.75 (17.10.5.4)
 *  Shear
 *   - steel V_sa = 0.6 A_se,V f_uta (17.7.1.2b), φ = 0.65
 *   - breakout toward the edge V_cb = (A_Vc / A_Vco) ψ_ed,V ψ_c,V ψ_h,V V_b (17.7.2), A_Vco = 4.5 c_a1²,
 *     per anchor A_Vc = min(s, 3 c_a1) × min(1.5 c_a1, h_a); parallel to the edge: 2 V_cb with ψ_ed,V = 1 (17.7.2.1c)
 *   - pryout V_cp = k_cp min(N_a, N_cb) (17.7.3)
 *  Interaction 17.8 (trilinear: full strength when the other ratio ≤ 0.2, else sum ≤ 1.2)
 */

export interface AdhesiveProduct {
  name: string;
  report: string;
  /** characteristic bond stresses, psi */
  tauCr: number;
  tauUncr: number;
  /** breakout coefficient (post-installed: 17 cracked / 24 uncracked unless the report says otherwise) */
  kcCr: number;
  kcUncr: number;
  /**
   * strength reduction factors (ACI 318-19 Table 17.5.3): phiBond — tension, applied to both
   * concrete breakout and bond (anchor category from the ESR; Condition B: Cat. 1 0.65, Cat. 2
   * 0.55, Cat. 3 0.45); phiConcrete — shear breakout and pryout (Condition B 0.70, A 0.75)
   */
  phiBond: number;
  phiConcrete: number;
  /** critical edge distance c_ac, in (ESR; default 2 h_ef, ACI 318-19 17.9.5) — splitting factor ψ_cp in uncracked concrete */
  cac?: number;
}

export interface DowelRowInput {
  kind: "rebar" | "rod";
  /** nominal diameter, in */
  d: number;
  /** effective tensile area, in² */
  Ase: number;
  fya: number;
  futa: number;
  hef: number;
  /** spacing along the row, in */
  s: number;
  /** edge distance perpendicular to the row (toward the free edge), in */
  ca1: number;
  /** member thickness in the shear direction, in */
  ha: number;
  fc: number;
  cracked: boolean;
  seismic: boolean;
  shearDir: "toward-edge" | "parallel-edge";
  product: AdhesiveProduct;
  lambda?: number;
}

export function dowelRow(i: DowelRowInput) {
  const lam = i.lambda ?? 1;
  const p = i.product;
  const futa = Math.min(i.futa, 1.9 * i.fya, 125000);
  const Nsa = i.Ase * futa;
  const phiNsa = 0.75 * Nsa;
  const sf = i.seismic ? 0.75 : 1;
  // breakout
  const ANco = 9 * i.hef * i.hef;
  const ANc = Math.min(i.s, 3 * i.hef) * (Math.min(i.ca1, 1.5 * i.hef) + 1.5 * i.hef);
  const psiEdN = i.ca1 >= 1.5 * i.hef ? 1 : 0.7 + (0.3 * i.ca1) / (1.5 * i.hef);
  const kc = i.cracked ? p.kcCr : p.kcUncr;
  const Nb = kc * lam * Math.sqrt(i.fc) * i.hef ** 1.5;
  // splitting (uncracked concrete, no supplementary reinforcement): ψ_cp,N, ψ_cp,Na (17.6.2.6, 17.6.5.5)
  const cac = p.cac ?? 2 * i.hef;
  const psiCpN = i.cracked || i.ca1 >= cac ? 1 : Math.min(1, Math.max(i.ca1, 1.5 * i.hef) / cac);
  const Ncb = (Math.min(ANc, ANco) / ANco) * psiEdN * psiCpN * Nb;
  const phiNcb = p.phiBond * Ncb * sf;
  // bond
  const tau = i.cracked ? p.tauCr : p.tauUncr;
  const cNa = 10 * i.d * Math.sqrt(p.tauUncr / 1100);
  const ANao = (2 * cNa) ** 2;
  const ANa = Math.min(i.s, 2 * cNa) * (Math.min(i.ca1, cNa) + cNa);
  const psiEdNa = i.ca1 >= cNa ? 1 : 0.7 + (0.3 * i.ca1) / cNa;
  const Nba = lam * tau * Math.PI * i.d * i.hef;
  const psiCpNa = i.cracked || i.ca1 >= cac ? 1 : Math.min(1, Math.max(i.ca1, cNa) / cac);
  const Na = (Math.min(ANa, ANao) / ANao) * psiEdNa * psiCpNa * Nba;
  const phiNa = p.phiBond * Na * sf;
  const tension: Array<[string, number]> = [
    ["steel (17.6.1)", phiNsa],
    ["concrete breakout (17.6.2)", phiNcb],
    ["bond (17.6.5)", phiNa],
  ];
  const tGov = tension.reduce((a, b) => (b[1] < a[1] ? b : a));
  // shear
  const Vsa = 0.6 * i.Ase * futa;
  const phiVsa = 0.65 * Vsa;
  const le = Math.min(i.hef, 8 * i.d);
  const Vb = Math.min(
    7 * (le / i.d) ** 0.2 * Math.sqrt(i.d) * lam * Math.sqrt(i.fc) * i.ca1 ** 1.5,
    9 * lam * Math.sqrt(i.fc) * i.ca1 ** 1.5,
  );
  const AVco = 4.5 * i.ca1 * i.ca1;
  const AVc = Math.min(i.s, 3 * i.ca1) * Math.min(1.5 * i.ca1, i.ha);
  const psiH = Math.max(1, Math.sqrt((1.5 * i.ca1) / i.ha));
  const psiCV = i.cracked ? 1.0 : 1.4;
  const Vcb1 = (Math.min(AVc, AVco) / AVco) * psiCV * psiH * Vb;
  const Vcb = i.shearDir === "parallel-edge" ? 2 * Vcb1 : Vcb1;
  const phiVcb = p.phiConcrete * Vcb;
  const kcp = i.hef < 2.5 ? 1 : 2;
  const Vcp = kcp * Math.min(Na, Ncb);
  const phiVcp = p.phiConcrete * Vcp;
  const shear: Array<[string, number]> = [
    ["steel (17.7.1)", phiVsa],
    [
      i.shearDir === "parallel-edge" ? "breakout, parallel to edge (17.7.2.1c)" : "breakout toward edge (17.7.2)",
      phiVcb,
    ],
    ["pryout (17.7.3)", phiVcp],
  ];
  const vGov = shear.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    futa,
    Nsa,
    phiNsa,
    ANc,
    ANco,
    psiEdN,
    kc,
    Nb,
    Ncb,
    phiNcb,
    tau,
    cNa,
    ANa,
    ANao,
    psiEdNa,
    Nba,
    Na,
    phiNa,
    seismicFactor: sf,
    phiNn: tGov[1],
    tGov: tGov[0],
    Vsa,
    phiVsa,
    le,
    Vb,
    AVc,
    AVco,
    psiH,
    Vcb,
    phiVcb,
    Vcp,
    phiVcp,
    phiVn: vGov[1],
    vGov: vGov[0],
  };
}

/** ACI 318-19 17.8 interaction; returns the governing ratio (≤ 1.0 passes). */
export function interaction17(rN: number, rV: number) {
  if (rN <= 0.2) return { ratio: rV, text: "N_ua / φN_n ≤ 0.2: full shear strength (17.8.1)" };
  if (rV <= 0.2) return { ratio: rN, text: "V_ua / φV_n ≤ 0.2: full tension strength (17.8.2)" };
  return { ratio: (rN + rV) / 1.2, text: `N_ua/φN_n + V_ua/φV_n = ${(rN + rV).toFixed(3)} ≤ 1.2 (17.8.3)` };
}
