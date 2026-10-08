/**
 * Structural steel member design to AISC 360-16 / 360-22 (LRFD or ASD).
 * Units: ksi, in, kip, kip-in. Results carry the printed equation, values and
 * the available strength (φRn or Rn/Ω).
 *
 *  - §B4.1 local buckling classification (Tables B4.1a / B4.1b)
 *  - Ch. E: E3 flexural buckling, E7 members with slender elements (HSS)
 *  - Ch. F: F2 (doubly symmetric compact I and channels), F3 (noncompact
 *    flanges), F6 (minor axis I / C), F7 (rectangular HSS), F8 (round HSS)
 *  - Ch. G: G2.1 (I and C webs), G4 (rectangular HSS), G5 (round HSS)
 *  - Ch. H: H1.1 combined flexure and axial force; App. 8 B1 amplifier
 *  - Ch. J: J10.2 web local yielding, J10.3 web local crippling
 *
 * Only cases covered here are designed; anything outside (slender webs,
 * singly symmetric shapes in compression, torsion of channels loaded off the
 * shear center) is reported as an error or a flag, never approximated.
 */

import type { SteelShape } from "../data/steel";

export type SteelMethod = "LRFD" | "ASD";

export interface ResistanceFactor {
  phi: number;
  omega: number;
}

export const PHI = {
  flexure: { phi: 0.9, omega: 1.67 },
  shearRolledI: { phi: 1.0, omega: 1.5 },
  shear: { phi: 0.9, omega: 1.67 },
  compression: { phi: 0.9, omega: 1.67 },
  webYield: { phi: 1.0, omega: 1.5 },
  webCrippling: { phi: 0.75, omega: 2.0 },
} satisfies Record<string, ResistanceFactor>;

export const available = (Rn: number, f: ResistanceFactor, m: SteelMethod) =>
  m === "LRFD" ? f.phi * Rn : Rn / f.omega;

export const factorText = (f: ResistanceFactor, m: SteelMethod) =>
  m === "LRFD" ? `φ = ${f.phi.toFixed(2)}` : `Ω = ${f.omega.toFixed(2)}`;

export type ElementClass = "compact" | "noncompact" | "slender";

export interface Classification {
  element: string;
  ratioText: string;
  ratio: number;
  lambdaP?: number;
  lambdaR: number;
  cls: ElementClass;
  ref: string;
}

const cls = (r: number, lp: number | undefined, lr: number): ElementClass =>
  lp !== undefined && r <= lp ? "compact" : r <= lr ? "noncompact" : "slender";

export interface StepLine {
  label: string;
  expr: string;
  value: number;
  unit: string;
}

/* -------------------------------- classification -------------------------------- */

export function flexureClasses(s: SteelShape, Fy: number, E: number, axis: "x" | "y" = "x"): Classification[] {
  const k = Math.sqrt(E / Fy);
  if (s.family === "W" || s.family === "C") {
    const fl = s.family === "W" ? s.bf / (2 * s.tf) : s.bf / s.tf;
    const h = s.d - 2 * s.kdes;
    const out: Classification[] = [
      {
        element: "Flange",
        ratioText: s.family === "W" ? "b_f / 2t_f" : "b_f / t_f",
        ratio: fl,
        lambdaP: 0.38 * k,
        lambdaR: 1.0 * k,
        cls: cls(fl, 0.38 * k, 1.0 * k),
        ref: "Table B4.1b case 10 / 13",
      },
    ];
    if (axis === "x")
      out.push({
        element: "Web",
        ratioText: "h / t_w = (d − 2k_des) / t_w",
        ratio: h / s.tw,
        lambdaP: 3.76 * k,
        lambdaR: 5.7 * k,
        cls: cls(h / s.tw, 3.76 * k, 5.7 * k),
        ref: "Table B4.1b case 15",
      });
    return out;
  }
  if (s.family === "HSS") {
    const t = s.tw;
    const fw = axis === "x" ? s.bf : s.d;
    const ww = axis === "x" ? s.d : s.bf;
    const bt = (fw - 3 * t) / t;
    const ht = (ww - 3 * t) / t;
    return [
      {
        element: "Flange (compression wall)",
        ratioText: "b / t = (B − 3t) / t",
        ratio: bt,
        lambdaP: 1.12 * k,
        lambdaR: 1.4 * k,
        cls: cls(bt, 1.12 * k, 1.4 * k),
        ref: "Table B4.1b case 17",
      },
      {
        element: "Web",
        ratioText: "h / t = (H − 3t) / t",
        ratio: ht,
        lambdaP: 2.42 * k,
        lambdaR: 5.7 * k,
        cls: cls(ht, 2.42 * k, 5.7 * k),
        ref: "Table B4.1b case 19",
      },
    ];
  }
  const Dt = s.d / s.tw;
  return [
    {
      element: "Wall",
      ratioText: "D / t",
      ratio: Dt,
      lambdaP: (0.07 * E) / Fy,
      lambdaR: (0.31 * E) / Fy,
      cls: cls(Dt, (0.07 * E) / Fy, (0.31 * E) / Fy),
      ref: "Table B4.1b case 20",
    },
  ];
}

export function compressionClasses(s: SteelShape, Fy: number, E: number): Classification[] {
  const k = Math.sqrt(E / Fy);
  if (s.family === "W") {
    const h = s.d - 2 * s.kdes;
    return [
      {
        element: "Flange",
        ratioText: "b_f / 2t_f",
        ratio: s.bf / (2 * s.tf),
        lambdaR: 0.56 * k,
        cls: s.bf / (2 * s.tf) <= 0.56 * k ? "compact" : "slender",
        ref: "Table B4.1a case 1",
      },
      {
        element: "Web",
        ratioText: "h / t_w",
        ratio: h / s.tw,
        lambdaR: 1.49 * k,
        cls: h / s.tw <= 1.49 * k ? "compact" : "slender",
        ref: "Table B4.1a case 5",
      },
    ];
  }
  if (s.family === "HSS") {
    const t = s.tw;
    const walls: Array<[string, number]> = [
      ["Wall B", (s.bf - 3 * t) / t],
      ["Wall H", (s.d - 3 * t) / t],
    ];
    return walls.map(([el, r]) => ({
      element: el,
      ratioText: "b / t = (b − 3t) / t",
      ratio: r,
      lambdaR: 1.4 * k,
      cls: r <= 1.4 * k ? "compact" : "slender",
      ref: "Table B4.1a case 6",
    }));
  }
  if (s.family === "HSSR")
    return [
      {
        element: "Wall",
        ratioText: "D / t",
        ratio: s.d / s.tw,
        lambdaR: (0.11 * E) / Fy,
        cls: s.d / s.tw <= (0.11 * E) / Fy ? "compact" : "slender",
        ref: "Table B4.1a case 9",
      },
    ];
  throw new Error("Channels are not designed for axial compression (singly symmetric, AISC E4) in HouseCalc");
}

/* ------------------------------------ flexure ------------------------------------ */

export interface FlexureResult {
  axis: "x" | "y";
  Mp: number;
  Mn: number;
  limit: string;
  steps: StepLine[];
  classes: Classification[];
  Lp?: number;
  Lr?: number;
  Lb?: number;
  Cb?: number;
}

/** Nominal flexural strength about the major axis. Lb in inches (0 = continuously braced). */
export function flexureMajor(s: SteelShape, Fy: number, E: number, Lb: number, Cb: number): FlexureResult {
  const classes = flexureClasses(s, Fy, E, "x");
  const steps: StepLine[] = [];
  const Mp = Fy * s.Zx;
  steps.push({
    label: "Plastic moment",
    expr: `M_p = F_y Z_x = ${Fy} × ${s.Zx.toFixed(2)}`,
    value: Mp / 12,
    unit: "kip-ft",
  });
  const cands: Array<[string, number]> = [["Yielding", Mp]];
  let Lp: number | undefined;
  let Lr: number | undefined;
  if (classes.some((c) => c.element === "Web" && c.cls !== "compact"))
    throw new Error(`${s.name}: noncompact / slender web in flexure is outside HouseCalc (AISC F4 / F5)`);
  if (s.family === "W" || s.family === "C") {
    const c = s.family === "W" ? 1 : (s.ho / 2) * Math.sqrt(s.Iy / s.Cw);
    Lp = 1.76 * s.ry * Math.sqrt(E / Fy);
    const jc = (s.J * c) / (s.Sx * s.ho);
    Lr = 1.95 * s.rts * (E / (0.7 * Fy)) * Math.sqrt(jc + Math.sqrt(jc * jc + 6.76 * ((0.7 * Fy) / E) ** 2));
    steps.push({
      label: "Limiting length, yielding",
      expr: `L_p = 1.76 r_y √(E/F_y) (F2-5)`,
      value: Lp / 12,
      unit: "ft",
    });
    steps.push({
      label: "Limiting length, inelastic LTB",
      expr: `L_r = 1.95 r_ts E/(0.7F_y) √(Jc/(S_x h_o) + √((Jc/(S_x h_o))² + 6.76(0.7F_y/E)²)) (F2-6), c = ${c.toFixed(3)}`,
      value: Lr / 12,
      unit: "ft",
    });
    if (Lb > Lp) {
      let Mltb: number;
      if (Lb <= Lr) {
        Mltb = Math.min(Mp, Cb * (Mp - (Mp - 0.7 * Fy * s.Sx) * ((Lb - Lp) / (Lr - Lp))));
        steps.push({
          label: "Lateral-torsional buckling (L_p < L_b ≤ L_r)",
          expr: `M_n = C_b [M_p − (M_p − 0.7F_y S_x)(L_b − L_p)/(L_r − L_p)] ≤ M_p (F2-2)`,
          value: Mltb / 12,
          unit: "kip-ft",
        });
      } else {
        const lr = Lb / s.rts;
        const Fcr = ((Cb * Math.PI ** 2 * E) / lr ** 2) * Math.sqrt(1 + 0.078 * jc * lr * lr);
        Mltb = Math.min(Mp, Fcr * s.Sx);
        steps.push({
          label: "Elastic LTB stress (L_b > L_r)",
          expr: `F_cr = C_b π² E/(L_b/r_ts)² √(1 + 0.078 Jc/(S_x h_o)(L_b/r_ts)²) (F2-4)`,
          value: Fcr,
          unit: "ksi",
        });
        steps.push({
          label: "Lateral-torsional buckling",
          expr: `M_n = F_cr S_x ≤ M_p (F2-3)`,
          value: Mltb / 12,
          unit: "kip-ft",
        });
      }
      cands.push(["Lateral-torsional buckling", Mltb]);
    }
    const fl = classes[0];
    if (fl.cls === "noncompact") {
      const Mflb = Mp - (Mp - 0.7 * Fy * s.Sx) * ((fl.ratio - fl.lambdaP!) / (fl.lambdaR - fl.lambdaP!));
      steps.push({
        label: "Compression flange local buckling (noncompact)",
        expr: `M_n = M_p − (M_p − 0.7F_y S_x)(λ − λ_pf)/(λ_rf − λ_pf) (F3-1)`,
        value: Mflb / 12,
        unit: "kip-ft",
      });
      cands.push(["Flange local buckling", Mflb]);
    } else if (fl.cls === "slender") throw new Error(`${s.name}: slender flange (F3-2) is outside HouseCalc`);
  } else if (s.family === "HSS") {
    const [fl, web] = classes;
    if (fl.cls === "noncompact") {
      const Mflb = Math.min(Mp, Mp - (Mp - Fy * s.Sx) * (3.57 * fl.ratio * Math.sqrt(Fy / E) - 4.0));
      steps.push({
        label: "Flange local buckling (noncompact)",
        expr: `M_n = M_p − (M_p − F_y S)(3.57 (b/t)√(F_y/E) − 4.0) ≤ M_p (F7-2)`,
        value: Mflb / 12,
        unit: "kip-ft",
      });
      cands.push(["Flange local buckling", Mflb]);
    } else if (fl.cls === "slender")
      throw new Error(`${s.name}: slender HSS flange in flexure (F7-3) is outside HouseCalc`);
    if (web.cls === "noncompact") {
      const Mwlb = Math.min(Mp, Mp - (Mp - Fy * s.Sx) * (0.305 * web.ratio * Math.sqrt(Fy / E) - 0.738));
      cands.push(["Web local buckling", Mwlb]);
    }
    if (s.d > s.bf && Lb > 0) {
      const LpH = (0.13 * E * s.ry * Math.sqrt(s.J * s.A)) / Mp;
      const LrH = (2 * E * s.ry * Math.sqrt(s.J * s.A)) / (0.7 * Fy * s.Sx);
      Lp = LpH;
      Lr = LrH;
      if (Lb > LpH) {
        const M =
          Lb <= LrH
            ? Math.min(Mp, Cb * (Mp - (Mp - 0.7 * Fy * s.Sx) * ((Lb - LpH) / (LrH - LpH))))
            : Math.min(Mp, (2 * E * Cb * Math.sqrt(s.J * s.A)) / (Lb / s.ry));
        steps.push({
          label: "Lateral-torsional buckling (rectangular HSS)",
          expr:
            Lb <= LrH
              ? `M_n = C_b[M_p − (M_p − 0.7F_y S_x)(L_b − L_p)/(L_r − L_p)] (F7-10)`
              : `M_n = 2EC_b√(JA_g)/(L_b/r_y) (F7-11)`,
          value: M / 12,
          unit: "kip-ft",
        });
        cands.push(["Lateral-torsional buckling", M]);
      }
    }
  } else {
    const [w] = classes;
    if (w.cls === "noncompact") {
      const M = ((0.021 * E) / w.ratio + Fy) * s.Sx;
      steps.push({
        label: "Local buckling (noncompact)",
        expr: `M_n = (0.021E/(D/t) + F_y) S (F8-2)`,
        value: M / 12,
        unit: "kip-ft",
      });
      cands.push(["Local buckling", M]);
    } else if (w.cls === "slender") throw new Error(`${s.name}: slender round HSS wall (F8-3) is outside HouseCalc`);
  }
  let limit = cands[0][0];
  let Mn = cands[0][1];
  for (const [k, v] of cands)
    if (v < Mn) {
      Mn = v;
      limit = k;
    }
  return { axis: "x", Mp, Mn, limit, steps, classes, Lp, Lr, Lb, Cb };
}

/** Nominal flexural strength about the minor axis (F6 I / C, F7 rectangular HSS, F8 round). */
export function flexureMinor(s: SteelShape, Fy: number, E: number): FlexureResult {
  const steps: StepLine[] = [];
  if (s.family === "HSSR") {
    const r = flexureMajor(s, Fy, E, 0, 1);
    return { ...r, axis: "y" };
  }
  const classes = flexureClasses(s, Fy, E, "y");
  if (s.family === "HSS") {
    const Mp = Fy * s.Zy;
    steps.push({
      label: "Plastic moment",
      expr: `M_p = F_y Z_y = ${Fy} × ${s.Zy.toFixed(2)}`,
      value: Mp / 12,
      unit: "kip-ft",
    });
    let Mn = Mp;
    let limit = "Yielding";
    const [fl, web] = classes;
    if (fl.cls === "noncompact") {
      Mn = Math.min(Mn, Mp - (Mp - Fy * s.Sy) * (3.57 * fl.ratio * Math.sqrt(Fy / E) - 4.0));
      limit = "Flange local buckling";
    } else if (fl.cls === "slender") throw new Error(`${s.name}: slender HSS flange in minor-axis flexure`);
    if (web.cls === "noncompact") {
      const Mw = Mp - (Mp - Fy * s.Sy) * (0.305 * web.ratio * Math.sqrt(Fy / E) - 0.738);
      if (Mw < Mn) {
        Mn = Mw;
        limit = "Web local buckling";
      }
    }
    return { axis: "y", Mp, Mn, limit, steps, classes };
  }
  const Mp = Math.min(Fy * s.Zy, 1.6 * Fy * s.Sy);
  steps.push({ label: "Yielding", expr: `M_n = M_p = F_y Z_y ≤ 1.6 F_y S_y (F6-1)`, value: Mp / 12, unit: "kip-ft" });
  let Mn = Mp;
  let limit = "Yielding";
  const fl = classes[0];
  if (fl.cls === "noncompact") {
    Mn = Mp - (Mp - 0.7 * Fy * s.Sy) * ((fl.ratio - fl.lambdaP!) / (fl.lambdaR - fl.lambdaP!));
    limit = "Flange local buckling";
    steps.push({
      label: "Flange local buckling",
      expr: `M_n = M_p − (M_p − 0.7F_y S_y)(λ − λ_pf)/(λ_rf − λ_pf) (F6-2)`,
      value: Mn / 12,
      unit: "kip-ft",
    });
  }
  return { axis: "y", Mp, Mn, limit, steps, classes };
}

/* ------------------------------------- shear ------------------------------------- */

export interface ShearResult {
  Aw: number;
  kv: number;
  Cv: number;
  Vn: number;
  factor: ResistanceFactor;
  steps: StepLine[];
}

/** Shear strength for shear parallel to the web (major-axis bending). */
export function shearMajor(s: SteelShape, Fy: number, E: number): ShearResult {
  const steps: StepLine[] = [];
  if (s.family === "W" || s.family === "C") {
    const h = s.d - 2 * s.kdes;
    const ht = h / s.tw;
    const Aw = s.d * s.tw;
    const kv = 5.34;
    let Cv = 1;
    let factor = PHI.shear;
    if (ht <= 2.24 * Math.sqrt(E / Fy)) {
      factor = PHI.shearRolledI;
      steps.push({
        label: "Web slenderness",
        expr: `h/t_w = ${ht.toFixed(2)} ≤ 2.24√(E/F_y) = ${(2.24 * Math.sqrt(E / Fy)).toFixed(2)} → C_v1 = 1.0, φ_v = 1.00 / Ω_v = 1.50 (G2.1(a))`,
        value: ht,
        unit: "",
      });
    } else {
      const lim = 1.1 * Math.sqrt((kv * E) / Fy);
      Cv = ht <= lim ? 1 : lim / ht;
      steps.push({
        label: "Web shear coefficient",
        expr: `C_v1 = ${ht <= lim ? "1.0 (G2-3)" : "1.10√(k_v E/F_y)/(h/t_w) (G2-4)"}, k_v = 5.34`,
        value: Cv,
        unit: "",
      });
    }
    const Vn = 0.6 * Fy * Aw * Cv;
    steps.push({ label: "Web area", expr: `A_w = d t_w = ${s.d} × ${s.tw}`, value: Aw, unit: "in²" });
    steps.push({ label: "Nominal shear strength", expr: `V_n = 0.6 F_y A_w C_v1 (G2-1)`, value: Vn, unit: "kip" });
    return { Aw, kv, Cv, Vn, factor, steps };
  }
  if (s.family === "HSS") {
    const t = s.tw;
    const h = s.d - 3 * t;
    const ht = h / t;
    const kv = 5;
    const Aw = 2 * h * t;
    const a = 1.1 * Math.sqrt((kv * E) / Fy);
    const b = 1.37 * Math.sqrt((kv * E) / Fy);
    const Cv = ht <= a ? 1 : ht <= b ? a / ht : (1.51 * kv * E) / (ht * ht * Fy);
    const Vn = 0.6 * Fy * Aw * Cv;
    steps.push({ label: "Web area", expr: `A_w = 2 h t = 2 × (H − 3t) × t`, value: Aw, unit: "in²" });
    steps.push({
      label: "Web shear buckling coefficient",
      expr: `C_v2 (G2-9 to G2-11), h/t = ${ht.toFixed(2)}, k_v = 5`,
      value: Cv,
      unit: "",
    });
    steps.push({ label: "Nominal shear strength", expr: `V_n = 0.6 F_y A_w C_v2 (G4-1)`, value: Vn, unit: "kip" });
    return { Aw, kv, Cv, Vn, factor: PHI.shear, steps };
  }
  const Dt = s.d / s.tw;
  // G5: Lv conservatively taken large → Fcr from Eq. G5-2b; ≤ 0.6 Fy
  const Fcr = Math.min(0.6 * Fy, (0.78 * E) / Dt ** 1.5);
  const Vn = (Fcr * s.A) / 2;
  steps.push({
    label: "Shear buckling stress",
    expr: `F_cr = 0.78E/(D/t)^1.5 ≤ 0.6F_y (G5-2b)`,
    value: Fcr,
    unit: "ksi",
  });
  steps.push({ label: "Nominal shear strength", expr: `V_n = F_cr A_g / 2 (G5-1)`, value: Vn, unit: "kip" });
  return { Aw: s.A / 2, kv: 0, Cv: 1, Vn, factor: PHI.shear, steps };
}

/* ---------------------------------- compression ---------------------------------- */

export interface CompressionResult {
  Lcx: number;
  Lcy: number;
  SRx: number;
  SRy: number;
  Fe: number;
  Fcr: number;
  Ae: number;
  Pn: number;
  slender: boolean;
  classes: Classification[];
  steps: StepLine[];
}

export function compression(s: SteelShape, Fy: number, E: number, Lcx: number, Lcy: number): CompressionResult {
  const classes = compressionClasses(s, Fy, E);
  const steps: StepLine[] = [];
  const SRx = Lcx / s.rx;
  const SRy = Lcy / s.ry;
  const SR = Math.max(SRx, SRy);
  if (SR > 200)
    steps.push({
      label: "Slenderness exceeds 200 (E2 user note)",
      expr: `L_c/r = ${SR.toFixed(1)}`,
      value: SR,
      unit: "",
    });
  const Fe = (Math.PI ** 2 * E) / (SR * SR);
  const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
  steps.push({
    label: "Slenderness",
    expr: `L_cx/r_x = ${SRx.toFixed(1)}, L_cy/r_y = ${SRy.toFixed(1)}`,
    value: SR,
    unit: "",
  });
  steps.push({ label: "Elastic buckling stress", expr: `F_e = π² E / (L_c/r)² (E3-4)`, value: Fe, unit: "ksi" });
  steps.push({
    label: "Flexural buckling stress",
    expr: Fy / Fe <= 2.25 ? `F_cr = 0.658^(F_y/F_e) F_y (E3-2)` : `F_cr = 0.877 F_e (E3-3)`,
    value: Fcr,
    unit: "ksi",
  });
  let Ae = s.A;
  const slender = classes.some((c) => c.cls === "slender");
  if (slender) {
    if (s.family === "HSS") {
      const t = s.tw;
      Ae = s.A;
      for (const c of classes) {
        const lr = c.lambdaR;
        if (c.ratio <= lr * Math.sqrt(Fy / Fcr)) continue;
        const b = c.ratio * t;
        const Fel = ((1.31 * lr) / c.ratio) ** 2 * Fy;
        const be = b * (1 - 0.18 * Math.sqrt(Fel / Fcr)) * Math.sqrt(Fel / Fcr);
        Ae -= 2 * (b - be) * t;
      }
      steps.push({
        label: "Effective area (slender walls)",
        expr: `b_e = b(1 − c₁√(F_el/F_cr))√(F_el/F_cr), c₁ = 0.18, c₂ = 1.31 (E7-3, Table E7.1)`,
        value: Ae,
        unit: "in²",
      });
    } else if (s.family === "HSSR") {
      const Dt = s.d / s.tw;
      if (Dt >= (0.45 * E) / Fy) throw new Error(`${s.name}: D/t ≥ 0.45E/F_y — outside AISC E7.2`);
      Ae = ((0.038 * E) / (Fy * Dt) + 2 / 3) * s.A;
      steps.push({
        label: "Effective area (round, slender)",
        expr: `A_e = [0.038E/(F_y D/t) + 2/3] A_g (E7-7)`,
        value: Ae,
        unit: "in²",
      });
    } else throw new Error(`${s.name}: slender W elements in compression are outside HouseCalc`);
  }
  const Pn = Fcr * Ae;
  steps.push({
    label: "Nominal compressive strength",
    expr: slender ? `P_n = F_cr A_e (E7-1)` : `P_n = F_cr A_g (E3-1)`,
    value: Pn,
    unit: "kip",
  });
  return { Lcx, Lcy, SRx, SRy, Fe, Fcr, Ae, Pn, slender, classes, steps };
}

/* ----------------------------------- combined ------------------------------------ */

export interface AmplifierResult {
  Cm: number;
  Pe1: number;
  B1: number;
  alpha: number;
}

/** App. 8 §8.2.1 P-δ amplifier (Eq. A-8-3 / A-8-5). Pe1 with K1 = 1. Lc in inches, I in in⁴. */
export function amplifierB1(
  Pr: number,
  I: number,
  Lc: number,
  E: number,
  method: SteelMethod,
  Cm: number,
): AmplifierResult {
  const alpha = method === "LRFD" ? 1.0 : 1.6;
  const Pe1 = (Math.PI ** 2 * E * I) / (Lc * Lc);
  const B1 = Math.max(1, Cm / (1 - (alpha * Pr) / Pe1));
  return { Cm, Pe1, B1, alpha };
}

/** Cm for members without transverse loading (A-8-4): M1/M2 positive in reverse curvature. */
export const cmFromEnds = (M1overM2: number) => 0.6 - 0.4 * M1overM2;

export interface InteractionResult {
  eq: "H1-1a" | "H1-1b";
  ratio: number;
  expr: string;
}

export function interactionH1(
  Pr: number,
  Pc: number,
  Mrx: number,
  Mcx: number,
  Mry: number,
  Mcy: number,
): InteractionResult {
  const pr = Pc > 0 ? Pr / Pc : 0;
  const mx = Mcx > 0 ? Mrx / Mcx : 0;
  const my = Mcy > 0 ? Mry / Mcy : 0;
  if (pr >= 0.2) return { eq: "H1-1a", ratio: pr + (8 / 9) * (mx + my), expr: "P_r/P_c + 8/9 (M_rx/M_cx + M_ry/M_cy)" };
  return { eq: "H1-1b", ratio: pr / 2 + mx + my, expr: "P_r/(2P_c) + (M_rx/M_cx + M_ry/M_cy)" };
}

/* ----------------------------- concentrated forces ----------------------------- */

export interface WebLocalResult {
  yielding: number;
  crippling: number;
  yieldExpr: string;
  cripExpr: string;
}

/** J10.2 / J10.3 at a beam end reaction (load within d of the end; crippling within d/2). lb in inches. */
export function webLocalAtEnd(s: SteelShape, Fy: number, E: number, lb: number): WebLocalResult {
  if (s.family !== "W" && s.family !== "C") throw new Error("Web local checks apply to W and C shapes");
  const yielding = Fy * s.tw * (2.5 * s.kdes + lb);
  const r = lb / s.d;
  const base = 0.4 * s.tw * s.tw * Math.sqrt((E * Fy * s.tf) / s.tw);
  const crippling =
    r <= 0.2 ? base * (1 + 3 * r * (s.tw / s.tf) ** 1.5) : base * (1 + (4 * r - 0.2) * (s.tw / s.tf) ** 1.5);
  return {
    yielding,
    crippling,
    yieldExpr: "R_n = F_y t_w (2.5k + l_b) (J10-3)",
    cripExpr:
      r <= 0.2
        ? "R_n = 0.40 t_w² [1 + 3(l_b/d)(t_w/t_f)^1.5] √(E F_y t_f / t_w) (J10-5a)"
        : "R_n = 0.40 t_w² [1 + (4l_b/d − 0.2)(t_w/t_f)^1.5] √(E F_y t_f / t_w) (J10-5b)",
  };
}

/** Cb by Eq. F1-1 from moments at the segment ends and quarter points. */
export function cbFactor(Mmax: number, MA: number, MB: number, MC: number): number {
  const d = 2.5 * Mmax + 3 * MA + 4 * MB + 3 * MC;
  return d > 0 ? Math.min(3.0, (12.5 * Mmax) / d) : 1;
}
