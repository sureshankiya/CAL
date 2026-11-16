/**
 * Fire design of exposed wood members — NDS Chapter 16 (calculated fire resistance).
 *
 *  - Char depth: a_char = β_t t^0.813, β_t = β_n / t_n^0.187 with t_n = 1 hr (Eq. 16.2-1),
 *    β_n = 1.5 in./hr (Table 16.2.1A); effective char depth a_eff = 1.2 a_char
 *    (1 hr 1.8 in., 1.5 hr 2.5 in., 2 hr 3.2 in.)
 *  - Residual section: each exposed face loses a_eff (beam: 3 sides = both sides and the
 *    bottom, 4 sides; post: 4 sides)
 *  - Design stresses (Table 16.2.2): F_b × 2.85, F_c × 2.58, F_bE and F_cE × 2.03; size,
 *    volume and flat-use factors apply; C_D, C_M, C_t and C_i do not (16.2.2)
 *  - Beam stability (C_L, Eq. 3.3-6) and column stability (C_P, Eq. 3.7-1) on the residual section
 *  - Loads: the governing ASD gravity combination without C_D (conservative)
 */

import { fmt } from "../core/fmt";
import type { Check, ResolvedWood } from "./wood";

export interface FireInput {
  /** required fire resistance, hours */
  hours: number;
  /** exposed faces: beams 3 (sides and bottom) or 4; posts 4 */
  sides: 3 | 4;
}

export const BETA_N = 1.5;

export function charDepth(hours: number): { aChar: number; aEff: number } {
  const aChar = BETA_N * Math.pow(hours, 0.813);
  return { aChar, aEff: 1.2 * aChar };
}

const stability = (ratio: number, c: number) => {
  const a = (1 + ratio) / (2 * c);
  return a - Math.sqrt(a * a - ratio / c);
};

export interface FireResult {
  check: Check;
  lines: string[];
}

/** Flexure of a beam with M (lb·ft, ASD gravity) on the residual section; le = effective unbraced length, in (0 = braced). */
export function fireBeam(mat: ResolvedWood, f: FireInput, M: number, le: number, CV?: number): FireResult {
  const { aChar, aEff } = charDepth(f.hours);
  const b = mat.b - 2 * aEff;
  const d = mat.d - (f.sides === 4 ? 2 : 1) * aEff;
  const lines = [
    `a_char = β_t t^0.813 = 1.5 × ${fmt(f.hours, 2)}^0.813 = ${fmt(aChar, 3)} in; a_eff = 1.2 a_char = ${fmt(aEff, 3)} in (NDS 16.2.1)`,
    `Residual section (${f.sides} sides exposed): b = ${fmt(mat.b, 3)} − 2 × ${fmt(aEff, 3)} = ${fmt(b, 3)} in; d = ${fmt(mat.d, 3)} − ${f.sides === 4 ? "2 × " : ""}${fmt(aEff, 3)} = ${fmt(d, 3)} in`,
  ];
  const name = `Fire resistance ${fmt(f.hours, 1)} h — flexure, residual section (NDS 16.2)`;
  if (!(b > 0) || !(d > 0)) {
    lines.push("Section fully charred");
    return {
      check: { name, demand: M, capacity: 0, ratio: Infinity, pass: false, combo: "D + L (ASD)", CD: 1, unit: "psi" },
      lines,
    };
  }
  const S = (b * d * d) / 6;
  const fb = (M * 12) / S;
  const FbStar = 2.85 * mat.Fb * mat.CF;
  let CL = 1;
  if (le > 0) {
    const RB = Math.sqrt((le * d) / (b * b));
    const FbE = (2.03 * 1.2 * mat.EminStab) / (RB * RB);
    CL = stability(FbE / FbStar, 0.95);
    lines.push(
      `R_B = √(l_e d / b²) = ${fmt(RB, 2)}; F_bE = 2.03 × 1.20 E_min / R_B² = ${fmt(FbE, 0)} psi; C_L = ${fmt(CL, 3)}`,
    );
  } else lines.push("Compression edge braced: C_L = 1.0");
  const Cfac = CV !== undefined ? Math.min(CL, CV) : CL;
  const Fb = FbStar * Cfac;
  lines.push(
    `f_b = M / S = ${fmt(M, 0)} × 12 / ${fmt(S, 2)} = ${fmt(fb, 0)} psi ≤ 2.85 F_b C_F ${CV !== undefined ? "min(C_L, C_V)" : "C_L"} = 2.85 × ${fmt(mat.Fb, 0)} × ${fmt(mat.CF, 3)} × ${fmt(Cfac, 3)} = ${fmt(Fb, 0)} psi`,
  );
  return {
    check: { name, demand: fb, capacity: Fb, ratio: fb / Fb, pass: fb <= Fb, combo: "D + L (ASD)", CD: 1, unit: "psi" },
    lines,
  };
}

/** Axial compression of a post with P (lb, ASD gravity) on the residual section; le1 / le2 in (about d / b). */
export function fireColumn(mat: ResolvedWood, f: FireInput, P: number, le1: number, le2: number): FireResult {
  const { aChar, aEff } = charDepth(f.hours);
  const b = mat.b - 2 * aEff;
  const d = mat.d - 2 * aEff;
  const lines = [
    `a_char = β_t t^0.813 = 1.5 × ${fmt(f.hours, 2)}^0.813 = ${fmt(aChar, 3)} in; a_eff = 1.2 a_char = ${fmt(aEff, 3)} in (NDS 16.2.1)`,
    `Residual section (4 sides exposed): ${fmt(b, 3)} × ${fmt(d, 3)} in`,
  ];
  const name = `Fire resistance ${fmt(f.hours, 1)} h — compression, residual section (NDS 16.2)`;
  if (!(b > 0) || !(d > 0)) {
    lines.push("Section fully charred");
    return {
      check: { name, demand: P, capacity: 0, ratio: Infinity, pass: false, combo: "D + L (ASD)", CD: 1, unit: "psi" },
      lines,
    };
  }
  const A = b * d;
  const FcStar = 2.58 * mat.Fc * mat.CFc;
  const slender = Math.max(le1 / d, le2 / b);
  const FcE = (2.03 * 0.822 * mat.Emin) / (slender * slender);
  const c = mat.kind === "sawn" ? 0.8 : 0.9;
  const CP = stability(FcE / FcStar, c);
  const fc = P / A;
  const Fc = FcStar * CP;
  lines.push(
    `l_e / d = ${fmt(slender, 1)}; F_cE = 2.03 × 0.822 E_min / (l_e/d)² = ${fmt(FcE, 0)} psi; F_c* = 2.58 F_c C_F = ${fmt(FcStar, 0)} psi; C_P = ${fmt(CP, 3)} (c = ${c})`,
    `f_c = P / A = ${fmt(P, 0)} / ${fmt(A, 2)} = ${fmt(fc, 0)} psi ≤ F_c* C_P = ${fmt(Fc, 0)} psi`,
  );
  return {
    check: { name, demand: fc, capacity: Fc, ratio: fc / Fc, pass: fc <= Fc, combo: "D + L (ASD)", CD: 1, unit: "psi" },
    lines,
  };
}
