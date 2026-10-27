/**
 * Notches and holes in sawn joists and beams.
 *
 * Limits (NDS 4.4.3; IRC R502.8.1 for joists):
 *  - Notches in the top or bottom: depth ≤ d/6, length ≤ d/3, not in the middle third of a span
 *  - End notches at a support (tension face): depth ≤ d/4
 *  - Bored holes: diameter ≤ d/3, ≥ 2 in. from the top and bottom edges
 * Strength (ASD, each gravity combination with its C_D):
 *  - Hole: net section I_n = I − b D³/12 − b D e² (hole as a square of side D, e = offset of
 *    its centre from mid-depth); f_b = M c / I_n, c = d/2 (NDS 3.1.2); f_v = 1.5 V / (b (d − D))
 *  - Interior notch: net depth d_n; f_b = 6M / (b d_n²); f_v = 1.5 V / (b d_n)
 *  - End notch on the tension face: V'_r = (2/3) F_v' b d_n (d_n / d)² (NDS Eq. 3.4-3)
 * Glulam and SCL: the manufacturer's hole and notch rules govern — net-section check only, flagged.
 */

import { fmt } from "../core/fmt";
import { LOAD_TYPES } from "../core/loads";
import { patternEnvelope } from "../analysis/beam";
import { comboMomentAt, type Check, type WoodBeamResult } from "./wood";

export interface MemberOpening {
  type: "hole" | "notch-top" | "notch-bottom";
  /** position along the member, ft from the left end */
  x: number;
  /** hole diameter or notch depth, in */
  size: number;
  /** hole: offset of the centre from mid-depth, in (+ up); notch: length along the member, in */
  offset?: number;
}

function comboShearAt(r: WoodBeamResult, factors: Partial<Record<string, number>>, x: number): number {
  const a = r.analysis;
  let i = 0;
  for (let k = 1; k < a.x.length; k++) if (Math.abs(a.x[k] - x) < Math.abs(a.x[i] - x)) i = k;
  let vmax = 0;
  for (const field of ["VL", "VR"] as const) {
    let hi = 0;
    let lo = 0;
    for (const t of LOAD_TYPES) {
      const f = factors[t] ?? 0;
      if (!f) continue;
      const env = patternEnvelope(a, t, field);
      hi += f * (f > 0 ? env.max[i] : env.min[i]);
      lo += f * (f > 0 ? env.min[i] : env.max[i]);
    }
    vmax = Math.max(vmax, Math.abs(hi), Math.abs(lo));
  }
  return vmax;
}

export function openingChecks(r: WoodBeamResult, list: MemberOpening[]): { checks: Check[]; lines: string[] } {
  const m = r.mat;
  const { b, d } = m;
  const a = r.analysis;
  const checks: Check[] = [];
  const lines: string[] = [];
  const sawn = m.kind === "sawn";
  const spans: Array<[number, number]> = [];
  for (let k = 1; k < a.supports.length; k++) spans.push([a.supports[k - 1], a.supports[k]]);
  const gravity = r.combos.filter((c) => !c.combo.factors.W && !c.combo.factors.E);
  list.forEach((o, n) => {
    const tag = `${o.type === "hole" ? "Hole" : "Notch"} ${n + 1} at x = ${fmt(o.x, 2)} ft`;
    const atSupport = a.supports.some((s) => Math.abs(s - o.x) * 12 <= Math.max(d, 3));
    const limit = (name: string, demand: number, capacity: number, unit: string) =>
      checks.push({
        name: `${tag} — ${name}`,
        category: "detailing",
        demand,
        capacity,
        ratio: demand / capacity,
        pass: demand <= capacity + 1e-9,
        combo: "—",
        CD: 1,
        unit,
      });
    if (o.type === "hole") {
      const e = o.offset ?? 0;
      const edge = d / 2 - Math.abs(e) - o.size / 2;
      if (sawn) {
        limit("diameter ≤ d/3 (IRC R502.8.1)", o.size, d / 3, "in");
        limit("edge distance ≥ 2 in. (IRC R502.8.1)", 2, Math.max(edge, 1e-6), "in");
      }
      const In = m.I - (m.b * o.size ** 3) / 12 - m.b * o.size * e * e;
      lines.push(
        `${tag}: D = ${fmt(o.size, 3)} in., offset ${fmt(e, 2)} in., edge ${fmt(edge, 2)} in.; I_n = I − b D³/12 − b D e² = ${fmt(In, 1)} in⁴; A_v = b (d − D) = ${fmt(b * (d - o.size), 2)} in²`,
      );
      for (const row of gravity) {
        const M = comboMomentAt(r, row.combo, o.x);
        const Mx = Math.max(Math.abs(M.max), Math.abs(M.min));
        const V = comboShearAt(r, row.combo.factors, o.x);
        checks.push(
          strength(`${tag} — net-section bending (NDS 3.1.2)`, (Mx * 12 * (d / 2)) / In, row.FbPrime, row, "psi"),
          strength(`${tag} — shear on the net depth`, (1.5 * V) / (b * (d - o.size)), row.FvPrime, row, "psi"),
        );
      }
      return;
    }
    const dn = d - o.size;
    const endNotch = atSupport && o.type === "notch-bottom";
    if (sawn) {
      if (endNotch) limit("end notch depth ≤ d/4 (NDS 4.4.3.2)", o.size, d / 4, "in");
      else if (!atSupport) {
        limit("notch depth ≤ d/6 (NDS 4.4.3.1)", o.size, d / 6, "in");
        if (o.offset) limit("notch length ≤ d/3 (IRC R502.8.1)", o.offset, d / 3, "in");
        const sp = spans.find(([s, e]) => o.x >= s && o.x <= e);
        if (sp) {
          const L = sp[1] - sp[0];
          const inMiddle = o.x > sp[0] + L / 3 && o.x < sp[1] - L / 3;
          checks.push({
            name: `${tag} — not in the middle third of the span (NDS 4.4.3.1)`,
            category: "detailing",
            demand: inMiddle ? 1 : 0,
            capacity: 1,
            ratio: inMiddle ? Infinity : 0,
            pass: !inMiddle,
            combo: "—",
            CD: 1,
            unit: "",
          });
        }
      }
    }
    lines.push(
      `${tag}: ${o.type === "notch-top" ? "top" : "bottom"} notch d_n = d − ${fmt(o.size, 3)} = ${fmt(dn, 3)} in.${endNotch ? " — end notch on the tension face, V'_r = (2/3) F_v' b d_n (d_n/d)² (NDS Eq. 3.4-3)" : ""}`,
    );
    for (const row of gravity) {
      const V = comboShearAt(r, row.combo.factors, o.x);
      if (endNotch) {
        const Vr = (2 / 3) * row.FvPrime * b * dn * (dn / d) ** 2;
        checks.push(strength(`${tag} — shear at end notch (NDS 3.4.3.2)`, V, Vr, row, "lb"));
        continue;
      }
      const M = comboMomentAt(r, row.combo, o.x);
      const Mx = Math.max(Math.abs(M.max), Math.abs(M.min));
      checks.push(
        strength(`${tag} — net-section bending (NDS 3.1.2)`, (6 * Mx * 12) / (b * dn * dn), row.FbPrime, row, "psi"),
        strength(`${tag} — shear on the net depth`, (1.5 * V) / (b * dn), row.FvPrime, row, "psi"),
      );
    }
  });
  if (!sawn && list.length)
    lines.push(`${m.kind === "glulam" ? "Glulam" : "SCL"}: holes and notches per the manufacturer — VERIFY`);
  // keep the governing combination per check name
  const best = new Map<string, Check>();
  for (const c of checks) if (!best.has(c.name) || c.ratio > best.get(c.name)!.ratio) best.set(c.name, c);
  return { checks: [...best.values()], lines };
}

function strength(
  name: string,
  demand: number,
  capacity: number,
  row: WoodBeamResult["combos"][number],
  unit: string,
): Check {
  return {
    name,
    demand,
    capacity,
    ratio: demand / capacity,
    pass: demand <= capacity,
    combo: row.combo.label,
    CD: row.CD,
    unit,
  };
}
