/**
 * Floor vibration — serviceability guidance, not a code requirement: fundamental frequency
 * of the joist as a simple span under its dead load,
 *   f = (π / 2) √(g EI / (w L⁴)) ≥ 15 Hz
 * (Dolan, Murray, Johnson, Runte and Shue, "Preventing annoying wood floor vibrations",
 * J. Struct. Eng. 125(1), 1999). g = 386.1 in/s², EI lb·in², w lb/in, L in.
 */

import { fmt } from "../core/fmt";
import type { Check } from "../design/wood";

export const VIBRATION_MIN_HZ = 15;

export function floorFrequency(EI: number, wPlf: number, Lft: number): number {
  const w = wPlf / 12;
  const L = Lft * 12;
  return (Math.PI / 2) * Math.sqrt((386.1 * EI) / (w * L ** 4));
}

/** The check and the expression printed with it; undefined when there is no dead load. */
export function vibrationCheck(EI: number, wPlf: number, Lft: number): { check: Check; expr: string } | undefined {
  if (!(wPlf > 0) || !(Lft > 0)) return undefined;
  const f = floorFrequency(EI, wPlf, Lft);
  return {
    check: {
      name: `Floor vibration, f ≥ ${VIBRATION_MIN_HZ} Hz (Dolan et al. 1999; serviceability guidance)`,
      category: "serviceability",
      demand: VIBRATION_MIN_HZ,
      capacity: f,
      ratio: VIBRATION_MIN_HZ / f,
      pass: f >= VIBRATION_MIN_HZ,
      combo: "D",
      CD: 1,
      unit: "Hz",
    },
    expr: `f = (π/2) √(g EI / (w L⁴)) = (π/2) √(386.1 × ${EI.toExponential(3)} / (${fmt(wPlf / 12, 3)} × ${fmt(Lft * 12, 1)}⁴)) = ${fmt(f, 1)} Hz (simple span L = ${fmt(Lft, 2)} ft, dead load w = ${fmt(wPlf, 1)} plf)`,
  };
}
