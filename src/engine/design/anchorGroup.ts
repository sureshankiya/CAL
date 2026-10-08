/**
 * Cast-in anchor groups (base plates), ACI 318-19 Ch. 17, strength design.
 * Units: lb, in, psi.
 *
 * Group: n_x × n_y anchors on a rectangle (spacing s_x, s_y), centred on the
 * plate; edge distances are measured from the group centre to the four
 * concrete edges (x−, x+, y−, y+), as on the Tedds sheets.
 *
 *  - Steel in tension N_sa = A_se f_uta (17.6.1.2), φ = 0.75
 *  - Concrete breakout of the anchors in tension N_cbg = (A_Nc/A_Nco) ψ_ec ψ_ed ψ_c ψ_cp N_b (17.6.2.1b)
 *  - Pullout: headed N_p = 8 A_brg f'c (17.6.3.2.2a); hooked N_p = 0.9 f'c e_h d_a (17.6.3.2.2b), 3d_a ≤ e_h ≤ 4.5d_a
 *  - Side-face blowout (17.6.4) only when c_a1 < 0.4 h_ef
 *  - Steel in shear V_sa = 0.6 A_se f_uta (17.7.1.2b), × 0.8 with a built-up grout pad (17.7.1.2.1), φ = 0.65
 *  - Concrete breakout in shear perpendicular to the edge V_cbg = (A_Vc/A_Vco) ψ_ec ψ_ed ψ_c ψ_h V_b (17.7.2.1b),
 *    c_a1 limited per 17.7.2.1.2 for narrow, thin members; parallel to the edge: 2 × with ψ_ed,V = 1.0 (17.7.2.1(c))
 *  - Pryout V_cpg = k_cp N_cpg (17.7.3), N_cpg from the breakout area of all anchors
 *  - Tension–shear interaction (17.8)
 *  - φ for concrete modes: Condition A 0.75, Condition B 0.70 (Table 17.5.3(c)); pullout / pryout 0.70
 *  - Seismic (SDC C–F): concrete-governed tension and shear × 0.75 (17.10.5.4 / 17.10.6.4)
 */

import { effectiveArea, type AnchorSteel } from "./anchors";

export interface AnchorGroupInput {
  d: number;
  steel: AnchorSteel;
  type: "headed" | "hooked";
  /** headed: bearing area of head / nut, in² */
  Abrg?: number;
  /** hooked: hook length e_h, in */
  eh?: number;
  hef: number;
  nx: number;
  ny: number;
  sx: number;
  sy: number;
  /** distances from the group centre to the concrete edges: x−, x+, y−, y+, in */
  edges: [number, number, number, number];
  /** member thickness h_a, in */
  ha: number;
  fc: number;
  cracked: boolean;
  /** concrete φ: A = supplementary reinforcement (0.75), B = none (0.70) */
  condition: "A" | "B";
  seismic: boolean;
  groutPad: boolean;
  /** anchors taking shear (steel strength), default all */
  nShear?: number;
  lambda?: number;
}

export interface AnchorDemand {
  /** total tension on the tension anchors, lb */
  Nua: number;
  /** number of anchors in tension */
  nTension: number;
  /** total shear on the group, lb, acting in the x direction toward the x+ edge */
  Vua: number;
}

export interface AnchorMode {
  key: string;
  label: string;
  ref: string;
  nominal: number;
  phi: number;
  factor: number;
  design: number;
  demand: number;
  ratio: number;
  lines: string[];
}

export interface AnchorGroupResult {
  Ase: number;
  futa: number;
  tension: AnchorMode[];
  shear: AnchorMode[];
  phiNn: number;
  phiVn: number;
  tensionGov?: AnchorMode;
  shearGov?: AnchorMode;
  interaction: { ratio: number; limit: number; text: string };
  ratio: number;
  notes: string[];
}

const k = (v: number) => (v / 1000).toFixed(2);

export function designAnchorGroup(i: AnchorGroupInput, dem: AnchorDemand): AnchorGroupResult {
  const lam = i.lambda ?? 1;
  const notes: string[] = [];
  const n = i.nx * i.ny;
  const Ase = effectiveArea(i.d);
  const futa = Math.min(i.steel.futa, 1.9 * i.steel.fya, 125000);
  const phiC = i.condition === "A" ? 0.75 : 0.7;
  const sf = i.seismic ? 0.75 : 1;
  const sqfc = Math.sqrt(i.fc);
  const Lx = (i.nx - 1) * i.sx;
  const Ly = (i.ny - 1) * i.sy;
  const [ex1, ex2, ey1, ey2] = i.edges;
  // edge distances from the outermost anchors
  const c = { x1: ex1 - Lx / 2, x2: ex2 - Lx / 2, y1: ey1 - Ly / 2, y2: ey2 - Ly / 2 };
  const tension: AnchorMode[] = [];
  const shear: AnchorMode[] = [];
  const mode = (
    list: AnchorMode[],
    key: string,
    label: string,
    ref: string,
    nominal: number,
    phi: number,
    factor: number,
    demand: number,
    lines: string[],
  ) => {
    const design = phi * factor * nominal;
    list.push({
      key,
      label,
      ref,
      nominal,
      phi,
      factor,
      design,
      demand,
      ratio: design > 0 ? demand / design : Infinity,
      lines,
    });
  };

  // tension
  const hef = i.hef;
  const Nb = hef <= 11 ? 24 * lam * sqfc * hef ** 1.5 : 16 * lam * sqfc * hef ** (5 / 3);
  const ANco = 9 * hef * hef;
  const breakoutArea = (nxT: number, nyT: number, cx1: number, cx2: number, cy1: number, cy2: number) => {
    const wx = Math.min(cx1, 1.5 * hef) + (nxT - 1) * i.sx + Math.min(cx2, 1.5 * hef);
    const wy = Math.min(cy1, 1.5 * hef) + (nyT - 1) * i.sy + Math.min(cy2, 1.5 * hef);
    return Math.min(wx * wy, nxT * nyT * ANco);
  };
  const psiC = i.cracked ? 1.0 : 1.25;
  const psiEdOf = (cmin: number) => (cmin >= 1.5 * hef ? 1 : 0.7 + (0.3 * cmin) / (1.5 * hef));
  let Ncbg = 0;
  if (dem.Nua > 0) {
    const perAnchor = dem.Nua / dem.nTension;
    // tension anchors: the row nearest the x+ edge (moment about y), all n_y anchors of it
    const nyT = i.ny;
    const nxT = Math.max(1, Math.round(dem.nTension / i.ny));
    // edge on the side away from the tension row(s): the x− edge measured from those anchors
    const inner = c.x1 + (i.nx - nxT) * i.sx;
    const ANc = breakoutArea(nxT, nyT, inner, c.x2, c.y1, c.y2);
    const cmin = Math.min(c.x2, c.y1, c.y2, inner);
    const psiEd = psiEdOf(cmin);
    const psiCp = 1.0;
    Ncbg = (ANc / ANco) * psiEd * psiC * psiCp * Nb;
    mode(tension, "Nsa", "Steel strength in tension", "17.6.1", Ase * futa, 0.75, 1, perAnchor, [
      `A_se = π/4 (d_a − 0.9743/n_t)² = ${Ase.toFixed(3)} in²; f_uta = ${k(futa)} ksi`,
      `N_sa = A_se f_uta = ${k(Ase * futa)} kip per anchor`,
    ]);
    mode(tension, "Ncbg", "Concrete breakout in tension", "17.6.2", Ncbg, phiC, sf, dem.Nua, [
      `N_b = k_c λ_a √f'c h_ef^1.5 = 24 × ${lam} × √${i.fc} × ${hef}^1.5 = ${k(Nb)} kip`,
      `A_Nc = ${ANc.toFixed(0)} in²; A_Nco = 9 h_ef² = ${ANco.toFixed(0)} in²; c_a,min = ${cmin === Infinity ? "far" : cmin.toFixed(1) + " in"}`,
      `ψ_ed,N = ${psiEd.toFixed(3)}; ψ_c,N = ${psiC.toFixed(2)}; ψ_ec,N = 1.000 (concentric on the tension anchors)`,
      `N_cbg = A_Nc/A_Nco ψ_ed,N ψ_c,N ψ_cp,N N_b = ${k(Ncbg)} kip`,
    ]);
    let Np: number;
    let pl: string;
    if (i.type === "headed") {
      Np = 8 * (i.Abrg ?? 1) * i.fc;
      pl = `N_p = 8 A_brg f'c = 8 × ${(i.Abrg ?? 1).toFixed(2)} × ${i.fc} = ${k(Np)} kip (17.6.3.2.2a)`;
    } else {
      const eh = Math.min(Math.max(i.eh ?? 3 * i.d, 3 * i.d), 4.5 * i.d);
      Np = 0.9 * i.fc * eh * i.d;
      pl = `N_p = 0.9 f'c e_h d_a = 0.9 × ${i.fc} × ${eh.toFixed(2)} × ${i.d} = ${k(Np)} kip (17.6.3.2.2b)`;
    }
    const psiCP = i.cracked ? 1.0 : 1.4;
    mode(tension, "Npn", "Pullout", "17.6.3", psiCP * Np, 0.7, sf, perAnchor, [pl, `ψ_c,P = ${psiCP.toFixed(2)}`]);
    const ca1 = Math.min(c.x2, c.y1, c.y2);
    if (i.type === "headed" && ca1 < 0.4 * hef) {
      const Nsb = 160 * ca1 * Math.sqrt(i.Abrg ?? 1) * lam * sqfc;
      mode(tension, "Nsb", "Side-face blowout", "17.6.4", Nsb, phiC, sf, perAnchor, [
        `N_sb = 160 c_a1 √A_brg λ_a √f'c = ${k(Nsb)} kip`,
      ]);
    } else notes.push(`Side-face blowout not applicable: c_a1 ≥ 0.4 h_ef (17.6.4.1)`);
  }

  // shear
  let Vcb = 0;
  if (dem.Vua > 0) {
    const nV = i.nShear ?? n;
    const Vsa = (i.groutPad ? 0.8 : 1) * nV * 0.6 * Ase * futa;
    mode(shear, "Vsa", "Steel strength in shear", "17.7.1", Vsa, 0.65, 1, dem.Vua, [
      `V_sa = ${i.groutPad ? "0.8 × " : ""}n × 0.6 A_se f_uta = ${i.groutPad ? "0.8 × " : ""}${nV} × 0.6 × ${Ase.toFixed(3)} × ${k(futa)} = ${k(Vsa)} kip${i.groutPad ? " (built-up grout pad, 17.7.1.2.1)" : ""}`,
    ]);
    // perpendicular to the x+ edge (ACI R17.7.2.1): Case 2 — the whole shear on the row farthest from the
    // edge; Case 1 (all anchors sharing shear, n_x > 1) — the front row with its share of the shear
    const le = Math.min(hef, 8 * i.d);
    const ca2a = c.y1;
    const ca2b = c.y2;
    const sPerp = Ly;
    const breakoutShear = (ca1Raw: number) => {
      let ca1 = ca1Raw;
      let limited = "";
      if (ca2a < 1.5 * ca1 && ca2b < 1.5 * ca1 && i.ha < 1.5 * ca1) {
        const lim = Math.max(Math.max(ca2a, ca2b) / 1.5, i.ha / 1.5, sPerp / 3);
        if (lim < ca1) {
          limited = `c_a1 limited to c'_a1 = max(c_a2,max/1.5, h_a/1.5, s/3) = ${lim.toFixed(2)} in (17.7.2.1.2)`;
          ca1 = lim;
        }
      }
      const Vb = Math.min(
        7 * (le / i.d) ** 0.2 * Math.sqrt(i.d) * lam * sqfc * ca1 ** 1.5,
        9 * lam * sqfc * ca1 ** 1.5,
      );
      const AVco = 4.5 * ca1 * ca1;
      const AVc = (Math.min(ca2a, 1.5 * ca1) + sPerp + Math.min(ca2b, 1.5 * ca1)) * Math.min(1.5 * ca1, i.ha);
      const ca2 = Math.min(ca2a, ca2b);
      const psiEdV = ca2 >= 1.5 * ca1 ? 1 : 0.7 + (0.3 * ca2) / (1.5 * ca1);
      const psiCV = i.cracked ? 1.0 : 1.4;
      const psiH = Math.max(1, Math.sqrt((1.5 * ca1) / i.ha));
      const V = (Math.min(AVc, AVco * i.ny) / AVco) * psiEdV * psiCV * psiH * Vb;
      const lines = [
        ...(limited ? [limited] : []),
        `c_a1 = ${ca1.toFixed(2)} in; l_e = min(h_ef, 8d_a) = ${le.toFixed(2)} in`,
        `V_b = min(7(l_e/d_a)^0.2 √d_a, 9) λ_a √f'c c_a1^1.5 = ${k(Vb)} kip (17.7.2.2.1)`,
        `A_Vc = ${AVc.toFixed(0)} in²; A_Vco = 4.5 c_a1² = ${AVco.toFixed(0)} in²`,
        `ψ_ed,V = ${psiEdV.toFixed(3)}; ψ_c,V = ${psiCV.toFixed(2)}; ψ_h,V = ${psiH.toFixed(3)}`,
        `V_cbg = A_Vc/A_Vco ψ_ec,V ψ_ed,V ψ_c,V ψ_h,V V_b = ${k(V)} kip`,
      ];
      return { V, lines };
    };
    const rear = breakoutShear(ex2 + Lx / 2);
    Vcb = rear.V;
    mode(
      shear,
      "Vcbg",
      i.nx > 1
        ? "Concrete breakout in shear, perpendicular to edge — Case 2 (rear row, full shear)"
        : "Concrete breakout in shear, perpendicular to edge",
      "17.7.2",
      rear.V,
      phiC,
      sf,
      dem.Vua,
      rear.lines,
    );
    if (i.nx > 1 && nV >= n) {
      const front = breakoutShear(ex2 - Lx / 2);
      mode(
        shear,
        "Vcbg1",
        "Concrete breakout in shear, perpendicular to edge — Case 1 (front row, its share)",
        "17.7.2",
        front.V,
        phiC,
        sf,
        (dem.Vua * i.ny) / n,
        [...front.lines, `Front-row share of the shear = V × n_y / n = ${k((dem.Vua * i.ny) / n)} kip`],
      );
    }
    // pryout: breakout area of the anchors resisting shear (rear rows when not all anchors take shear)
    const nxV = Math.min(i.nx, Math.max(1, Math.round(nV / i.ny)));
    const ANcAll = breakoutArea(nxV, i.ny, c.x1, c.x2 + (i.nx - nxV) * i.sx, c.y1, c.y2);
    const psiEdAll = psiEdOf(Math.min(c.x1, c.x2 + (i.nx - nxV) * i.sx, c.y1, c.y2));
    const Ncpg = (ANcAll / ANco) * psiEdAll * psiC * Nb;
    const kcp = hef < 2.5 ? 1 : 2;
    mode(shear, "Vcpg", "Pryout", "17.7.3", kcp * Ncpg, 0.7, sf, dem.Vua, [
      `N_cpg = (A_Nc/A_Nco) ψ_ed,N ψ_c,N N_b = (${ANcAll.toFixed(0)} / ${ANco.toFixed(0)}) × ${psiEdAll.toFixed(3)} × ${psiC.toFixed(2)} × ${k(Nb)} = ${k(Ncpg)} kip`,
      `V_cpg = k_cp N_cpg, k_cp = ${kcp} → ${k(kcp * Ncpg)} kip`,
    ]);
  }

  const gov = (l: AnchorMode[]) => (l.length ? l.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined);
  const tg = gov(tension);
  const vg = gov(shear);
  // interaction uses the design strengths of the governing (lowest φNn / φVn on a group basis)
  const nRatio = tg ? tg.ratio : 0;
  const vRatio = vg ? vg.ratio : 0;
  let interaction: AnchorGroupResult["interaction"];
  if (nRatio <= 0.2)
    interaction = { ratio: vRatio, limit: 1, text: "N_ua/φN_n ≤ 0.2 — full shear strength permitted (17.8.1)" };
  else if (vRatio <= 0.2)
    interaction = { ratio: nRatio, limit: 1, text: "V_ua/φV_n ≤ 0.2 — full tension strength permitted (17.8.2)" };
  else
    interaction = {
      ratio: nRatio + vRatio,
      limit: 1.2,
      text: `N_ua/φN_n + V_ua/φV_n = ${nRatio.toFixed(3)} + ${vRatio.toFixed(3)} ≤ 1.2 (17.8.3)`,
    };
  const ratio = Math.max(nRatio, vRatio, interaction.ratio / interaction.limit);
  return {
    Ase,
    futa,
    tension,
    shear,
    phiNn: tg?.design ?? 0,
    phiVn: vg?.design ?? 0,
    tensionGov: tg,
    shearGov: vg,
    interaction,
    ratio,
    notes,
  };
}
