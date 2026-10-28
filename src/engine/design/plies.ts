/**
 * Multi-ply (built-up) beam connection — load transfer between plies by nails or
 * through-bolts (NDS 12.3, 15.3 principles; manufacturer guidelines for SCL).
 *
 *  - Plies share the load equally (equal plies and stiffness); load applied on one
 *    side face must cross the first interface: q = w (n − 1) / n; loads on both side
 *    faces: q = w (1/2 − 1/n) (≥ 0); top-loaded beams transfer no load (q = 0) and
 *    take the minimum fastening only
 *  - w = total gravity load on the member / its length, per ASD gravity combination
 *  - Capacity per foot: rows × (12 / s) × Z', Z' = Z C_D; nails in single shear (side
 *    member = one ply, main member = the next ply), driven from each outer face for
 *    three or more plies; bolts in single shear at one interface, load perpendicular to
 *    grain (θ = 90°), F_yb = 45,000 psi
 *  - Concentrated side loads (hangers, girder trusses) need their own fastening at the
 *    load — flagged, not checked here
 */

import { loadDurationFactor, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES } from "../core/loads";
import { dowelBearingAngle, dowelYieldSingle, nailDef, nailSingleShear } from "./dowel";
import type { Check, ResolvedWood, WoodBeamResult } from "./wood";

export interface PlyConnectionInput {
  fastener: "nail" | "bolt";
  /** nail key (NAILS) */
  nail?: string;
  /** bolt diameter, in */
  boltDia?: number;
  /** fastener rows along the member (per face for nails) */
  rows: number;
  /** spacing along the member, in */
  spacing: number;
  load: "top" | "one-side" | "both-sides";
}

export interface PlyConnectionResult {
  checks: Check[];
  lines: string[];
  /** schedule text */
  callout: string;
}

const transferFraction = (n: number, load: PlyConnectionInput["load"]) =>
  load === "one-side" ? (n - 1) / n : load === "both-sides" ? Math.max(0, 0.5 - 1 / n) : 0;

export function plyConnection(
  design: WoodBeamResult,
  mat: ResolvedWood,
  i: PlyConnectionInput,
  /** transfer fraction of the member's load, replacing the equal-ply rule (sistered members) */
  fraction?: number,
): PlyConnectionResult {
  const n = mat.plies;
  if (n < 2) throw new Error("Ply connection: the member has a single ply");
  if (!(i.rows >= 1) || !(i.spacing > 0)) throw new Error("Ply connection: enter rows and spacing");
  const t = mat.bPly;
  const lines: string[] = [];
  let Z: number;
  let callout: string;
  if (i.fastener === "nail") {
    const nail = nailDef(i.nail ?? "16d-common");
    const r = nailSingleShear({ nail, ts: t, tm: t, Gs: mat.G, Gm: mat.G });
    if (!r.penetrationOk)
      throw new Error(`Ply connection: ${nail.label} penetration ${fmt(r.p, 2)} in. < 6D into the next ply`);
    Z = r.Z;
    callout = `${i.rows} rows ${nail.label} @ ${fmt(i.spacing, 0)} in. o.c.${n >= 3 ? ", from each face" : ""}, staggered`;
    lines.push(
      `Nail ${nail.label}, single shear ply to ply (t = ${fmt(t, 3)} in., G = ${fmt(mat.G, 2)}): Z = ${fmt(Z, 0)} lb, Mode ${r.mode} (NDS 12.3.1)`,
    );
  } else {
    const D = i.boltDia ?? 0.5;
    const Fe = dowelBearingAngle(mat.G, D, 90).Fe;
    const r = dowelYieldSingle({ D, Fyb: 45_000, ls: t, Fes: Fe, lm: t, Fem: Fe, thetaDeg: 90 });
    Z = r.Z;
    callout = `${i.rows} rows ${fmt(D, 3)} in. dia. through-bolts @ ${fmt(i.spacing, 0)} in. o.c., staggered`;
    lines.push(
      `Bolt ${fmt(D, 3)} in., single shear at one interface, load ⊥ grain: F_e = ${fmt(Fe, 0)} psi; Z = ${fmt(Z, 0)} lb, Mode ${r.mode} (NDS 12.3.1)`,
    );
  }
  const frac = fraction ?? transferFraction(n, i.load);
  const a = design.analysis;
  const L = a.totalLength;
  const gravity = design.combos.map((r) => r.combo).filter((c) => !c.factors.W && !c.factors.E);
  const checks: Check[] = [];
  let worst: { q: number; cap: number; c: Combination; CD: number } | undefined;
  for (const c of gravity) {
    let W = 0;
    for (const lt of LOAD_TYPES) W += (c.factors[lt] ?? 0) * a.byType[lt].R.reduce((s, v) => s + v, 0);
    const q = (frac * W) / L;
    const CD = loadDurationFactor(c);
    const cap = i.rows * (12 / i.spacing) * Z * CD;
    if (!worst || q / cap > worst.q / worst.cap) worst = { q, cap, c, CD };
  }
  lines.push(
    fraction !== undefined
      ? `Load transfer at the interface q = ${fmt(frac, 3)} × w (sister share of the load applied to the existing member)`
      : i.load === "top"
        ? "Top-loaded: no load transfer between plies; minimum fastening per IBC Table 2304.10.2 / manufacturer"
        : `Load transfer at the first interface q = w × ${i.load === "one-side" ? `(n − 1) / n = ${fmt(frac, 3)}` : `(1/2 − 1/n) = ${fmt(frac, 3)}`} (n = ${n})`,
  );
  if (worst && frac > 0) {
    lines.push(
      `q = ${fmt(worst.q, 0)} plf (${worst.c.label}) ≤ ${i.rows} × 12 / ${fmt(i.spacing, 0)} × Z × C_D = ${fmt(worst.cap, 0)} plf`,
    );
    checks.push({
      name: `Ply connection — ${callout} (NDS 12.3)`,
      demand: worst.q,
      capacity: worst.cap,
      ratio: worst.q / worst.cap,
      pass: worst.q <= worst.cap,
      combo: worst.c.label,
      CD: worst.CD,
      unit: "plf",
    });
  }
  return { checks, lines, callout };
}
