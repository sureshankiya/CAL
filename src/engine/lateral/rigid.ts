/**
 * Rigid-diaphragm distribution of a story force to the wall lines by relative
 * stiffness, with inherent and accidental torsion (ASCE 7 §12.8.4.1 /
 * §12.8.4.2: centre of mass displaced ±0.05 of the plan dimension
 * perpendicular to the force).
 *
 *  - Line stiffness k_i = Σ (V_wall / δ_wall) of its shear walls (SDPWS
 *    Eq. 4.3-1 at the wall's strength-level demand, i.e. a secant stiffness)
 *  - Centre of rigidity: x_cr = Σ k_y x / Σ k_y, y_cr = Σ k_x y / Σ k_x
 *  - J = Σ k_x (y − y_cr)² + Σ k_y (x − x_cr)²
 *  - Force on a line resisting the direction of loading: F = V k/Σk + T k d / J,
 *    T = V (e ± e_a). Torsion that would reduce a line's direct share is not
 *    subtracted (conservative); lines perpendicular to the load take T k d / J
 *  - Wind: the force acts at the plan centre (no accidental torsion; light-frame
 *    buildings of two stories or less need only ASCE 7 Fig. 28.3-1 load cases
 *    without torsion)
 *  - Torsional irregularity check: δ_max / δ_avg of the edge lines (Table 12.3-1 Type 1a)
 */

import type { Dir } from "./analysis";

export interface RigidLine {
  id: string;
  dir: Dir;
  pos: number;
  k: number;
}

export interface RigidLineForce {
  id: string;
  direct: number;
  torsion: number;
  total: number;
  /** displacement at the line for the governing torsion case, in (F / k) */
  delta: number;
}

export interface RigidStoryResult {
  dir: Dir;
  V: number;
  cr: { x: number; y: number };
  cm: { x: number; y: number };
  e: number;
  ea: number;
  J: number;
  lines: RigidLineForce[];
  /** δmax / δavg over the edge lines in the load direction */
  torsionRatio: number;
}

export function rigidDistribution(
  lines: RigidLine[],
  V: number,
  dir: Dir,
  cm: { x: number; y: number },
  plan: { Lx: number; Ly: number },
  accidental: boolean,
): RigidStoryResult {
  const X = lines.filter((l) => l.dir === "X");
  const Y = lines.filter((l) => l.dir === "Y");
  const sum = (a: RigidLine[]) => a.reduce((s, l) => s + l.k, 0);
  const kX = sum(X);
  const kY = sum(Y);
  const resisting = dir === "X" ? X : Y;
  const kR = dir === "X" ? kX : kY;
  if (!(kR > 0)) throw new Error(`Rigid distribution: no line stiffness in the ${dir} direction`);
  const ycr = kX > 0 ? X.reduce((s, l) => s + l.k * l.pos, 0) / kX : plan.Ly / 2;
  const xcr = kY > 0 ? Y.reduce((s, l) => s + l.k * l.pos, 0) / kY : plan.Lx / 2;
  const J = X.reduce((s, l) => s + l.k * (l.pos - ycr) ** 2, 0) + Y.reduce((s, l) => s + l.k * (l.pos - xcr) ** 2, 0);
  // force along X acts at y_cm; torsion arm in y
  const e = dir === "X" ? cm.y - ycr : cm.x - xcr;
  const ea = accidental ? 0.05 * (dir === "X" ? plan.Ly : plan.Lx) : 0;
  const cases = accidental ? [e + ea, e - ea] : [e];
  const out = new Map<string, RigidLineForce>();
  for (const l of lines) out.set(l.id, { id: l.id, direct: 0, torsion: 0, total: 0, delta: 0 });
  let torsionRatio = 1;
  for (const ecc of cases) {
    const T = V * ecc;
    const disp: Array<{ pos: number; d: number }> = [];
    for (const l of lines) {
      const d = l.dir === "X" ? l.pos - ycr : l.pos - xcr;
      // a line on the same side of the centre of rigidity as the eccentricity takes added force
      const tor = J > 0 ? (T * l.k * d) / J : 0;
      const direct = l.dir === dir ? (V * l.k) / kR : 0;
      const total = l.dir === dir ? direct + Math.max(0, tor) : Math.abs(tor);
      const r = out.get(l.id)!;
      if (total > r.total) {
        r.direct = direct;
        r.torsion = total - direct;
        r.total = total;
        r.delta = l.k > 0 ? (direct + tor) / l.k : 0;
      }
      if (l.dir === dir) disp.push({ pos: l.pos, d: l.k > 0 ? (direct + tor) / l.k : 0 });
    }
    if (disp.length >= 2) {
      disp.sort((a, b) => a.pos - b.pos);
      const d1 = Math.abs(disp[0].d);
      const d2 = Math.abs(disp[disp.length - 1].d);
      const avg = (d1 + d2) / 2;
      if (avg > 0) torsionRatio = Math.max(torsionRatio, Math.max(d1, d2) / avg);
    }
  }
  return {
    dir,
    V,
    cr: { x: xcr, y: ycr },
    cm,
    e,
    ea,
    J,
    lines: [...out.values()],
    torsionRatio,
  };
}
