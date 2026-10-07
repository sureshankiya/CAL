/**
 * Load types carried separately through the whole load path so every member
 * can apply the ASCE 7 combinations itself. Wind (W) is signed: + toward the
 * member / downward, − uplift. E is the horizontal seismic effect Eh.
 */

export const LOAD_TYPES = ["D", "L", "Lr", "S", "W", "E"] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export type LoadVector = Record<LoadType, number>;

export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  D: "Dead",
  L: "Floor live",
  Lr: "Roof live",
  S: "Snow",
  W: "Wind",
  E: "Seismic",
};

export const zeroLoads = (): LoadVector => ({ D: 0, L: 0, Lr: 0, S: 0, W: 0, E: 0 });

export function addLoads(a: LoadVector, b: LoadVector, k = 1): LoadVector {
  const out = zeroLoads();
  for (const t of LOAD_TYPES) out[t] = a[t] + k * b[t];
  return out;
}

export function scaleLoads(a: LoadVector, k: number): LoadVector {
  const out = zeroLoads();
  for (const t of LOAD_TYPES) out[t] = a[t] * k;
  return out;
}

export const loadVector = (partial: Partial<LoadVector>): LoadVector => ({ ...zeroLoads(), ...partial });

export const isZeroVector = (a: LoadVector, tol = 1e-9) => LOAD_TYPES.every((t) => Math.abs(a[t]) <= tol);
