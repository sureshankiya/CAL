/**
 * Diagram colours, shared by every sheet diagram (screen, PDF and Word export).
 * Each quantity keeps one colour across the package: shear blue, moment red, deflection
 * green, axial purple; loads by type. Fills are light tints of the line colour so the
 * diagrams still read when printed in grayscale.
 */

import type { LoadType } from "@/engine/core/loads";

export const DC = {
  ink: "#1a1a1a",
  member: "#37474f",
  support: "#455a64",
  dim: "#616161",
  axis: "#9e9e9e",
  shear: "#1565c0",
  moment: "#c62828",
  defl: "#2e7d32",
  axial: "#6a1b9a",
  tension: "#1565c0",
  compression: "#c62828",
  zero: "#9e9e9e",
  concrete: "#757575",
  concreteFill: "#e0e0e0",
  soil: "#8d6e63",
  pressure: "#ef6c00",
  rebar: "#b3261e",
  /** fill opacity of a diagram area under its outline */
  tint: 0.16,
} as const;

/** load colour by type (D, L, Lr, S, W, E) */
export const LOAD_COLOR: Record<LoadType, string> = {
  D: "#455a64",
  L: "#c62828",
  Lr: "#ef6c00",
  S: "#0097a7",
  W: "#2e7d32",
  E: "#6a1b9a",
};

export const loadColor = (t: string) => LOAD_COLOR[t as LoadType] ?? DC.ink;
