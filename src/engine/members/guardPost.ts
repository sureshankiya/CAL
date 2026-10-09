/**
 * GP-# — deck guard post bolted to the rim / end joist.
 *
 * Load: concentrated P at the top of the guard in the outward direction (IRC Table R301.5,
 * IBC 1607.9.1.1: 200 lb), or the top-rail line load × post spacing where that applies,
 * whichever is greater; live load, C_D = 1.0.
 *
 * The post is attached with two through-bolts at spacing s; it rotates about the lower bolt:
 *   top-bolt tension T = P (H₁ + s) / s,   H₁ = guard height + distance from the deck surface
 *   to the top bolt; maximum post moment at the top bolt M = P H₁; shear above the top bolt P
 *   and between the bolts P H₁ / s.
 * Checks: post bending (NDS 3.3, C_L = 1.0 for d / b ≤ 2), post shear (3.4), plate-washer
 * bearing on the post perpendicular to grain (3.10, C_b), bolt tension (AISC 360 Ch. J3, Table J3.2,
 * A307, ASD), and the tension device that carries T into the deck framing (catalogue value).
 */

import { fmt } from "../core/fmt";
import { loadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { lumberData, type Grade, type Species } from "../data/sawn";
import { sawnDressed } from "../data/sections";
import { bearingAreaFactor, governingCheck, type Check } from "../design/wood";
import { ndsOf, type DesignContext, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface GuardPostInput {
  id: string;
  mark: string;
  description: string;
  post: { species: Species; grade: Grade; size: string };
  /** wide face against the rim (bolts through the narrow dimension); default: narrow face against the rim */
  wideFaceToRim?: boolean;
  wetService: boolean;
  incised: boolean;
  /** top of guard above the deck surface, in */
  guardHeight: number;
  /** deck surface to the top bolt, in */
  topBolt: number;
  /** bolt spacing, in */
  s: number;
  /** concentrated load at the top, lb */
  P: number;
  /** top-rail line load, plf, and post spacing, ft (0 = not applied) */
  rail: { w: number; spacing: number };
  bolt: { d: number; Fu: number; label: string };
  /** square plate washer under the bolt head on the post, in */
  washer: number;
  /** catalogue allowable tension and the load-duration column it is published for (Simpson hold-downs: 1.6) */
  device: { model: string; capacity: number; capacityCD?: number; source: string; verified: boolean };
}

export interface GuardPostResult extends MemberResultBase {
  kind: "guardPost";
  input: GuardPostInput;
  P: number;
  H1: number;
  M: number;
  T: number;
  V: number;
  section: { b: number; d: number; S: number; A: number };
  factors: { CD: number; CMb: number; CMv: number; CMp: number; Ci: number; CF: number; Cb: number };
  Fb: { ref: number; prime: number; fb: number };
  Fv: { ref: number; prime: number; fv: number };
  Fp: { ref: number; prime: number; fp: number; Aw: number };
  bolt: { Ab: number; Rn: number; allow: number };
  tableLabel: string;
}

export function designGuardPost(ctx: DesignContext, g: GuardPostInput): GuardPostResult {
  const nds = ndsOf(ctx);
  const ld = lumberData(g.post.species, g.post.grade, g.post.size, nds);
  const dr = sawnDressed(g.post.size);
  // d = dimension along the bolts (in the direction of the guard load)
  const { b, d } = g.wideFaceToRim ? { b: dr.d, d: dr.b } : dr;
  const S = (b * d * d) / 6;
  const A = b * d;
  const lines: LoadLine[] = [];
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [];

  const Prail = g.rail.w * g.rail.spacing;
  const P = Math.max(g.P, Prail);
  lines.push({
    type: "L",
    label: "Guard load at the top",
    expr:
      Prail > 0
        ? `max(${fmt(g.P, 0)} lb, ${fmt(g.rail.w, 0)} plf × ${fmt(g.rail.spacing, 2)} ft)`
        : `${fmt(g.P, 0)} lb concentrated`,
    value: P,
    unit: "lb",
    ref: "IRC Table R301.5 / IBC 1607.9.1",
  });
  const H1 = g.guardHeight + g.topBolt;
  const M = P * H1;
  const T = (P * (H1 + g.s)) / g.s;
  const V = Math.max(P, (P * H1) / g.s);

  // adjustment factors (live load, C_D = 1.0)
  const CD = 1.0;
  const CF = ld.CF.Fb;
  const CMb = g.wetService ? (ld.ref.Fb * CF <= 1150 ? 1 : ld.CM.Fb) : 1;
  const CMv = g.wetService ? ld.CM.Fv : 1;
  const CMp = g.wetService ? ld.CM.Fcperp : 1;
  const Ci = g.incised ? 0.8 : 1;
  const Cb = bearingAreaFactor(g.washer, false);
  const FbPrime = ld.ref.Fb * CD * CMb * CF * Ci;
  const FvPrime = ld.ref.Fv * CD * CMv * Ci;
  const FpPrime = ld.ref.Fcperp * CMp * Cb;
  const fb = M / S;
  const fv = (1.5 * V) / A;
  const holeD = g.bolt.d + 1 / 16;
  const Aw = g.washer * g.washer - (Math.PI / 4) * holeD * holeD;
  const fp = T / Aw;
  const Ab = (Math.PI / 4) * g.bolt.d * g.bolt.d;
  const Rn = 0.75 * g.bolt.Fu * Ab;
  const boltAllow = Rn / 2.0;

  const checks: Check[] = [];
  const ck = (c: Omit<Check, "CD" | "pass" | "combo"> & { combo?: string }) =>
    checks.push({ CD, combo: c.combo ?? "L (guard)", pass: c.ratio <= 1 + 1e-9, ...c });
  ck({
    name: "Post bending at the top bolt (NDS 3.3)",
    demand: fb,
    capacity: FbPrime,
    ratio: fb / FbPrime,
    unit: "psi",
  });
  ck({ name: "Post shear (NDS 3.4)", demand: fv, capacity: FvPrime, ratio: fv / FvPrime, unit: "psi" });
  ck({
    name: "Plate-washer bearing on the post ⊥ grain (NDS 3.10)",
    demand: fp,
    capacity: FpPrime,
    ratio: fp / FpPrime,
    unit: "psi",
  });
  ck({
    name: `Top-bolt tension, ${g.bolt.label} (AISC 360 Ch. J3, Table J3.2, Ω = 2.00)`,
    demand: T,
    capacity: boltAllow,
    ratio: T / boltAllow,
    unit: "lb",
  });
  // catalogue values published for C_D = 1.6 are reduced to the guard-load duration C_D = 1.0
  const devCD = g.device.capacityCD ?? CD;
  const devAllow = g.device.capacity * (CD / devCD);
  ck({
    name: `Tension device ${g.device.model} into the deck framing (catalogue × ${fmt(CD, 2)} / ${fmt(devCD, 2)})`,
    demand: T,
    capacity: devAllow,
    ratio: T / devAllow,
    unit: "lb",
  });
  if (g.wideFaceToRim && dr.d !== dr.b)
    flags.push("Wide face against the rim: bending about the weak axis; C_fu not applied (conservative)");
  if (d / b > 2) {
    flags.push(`d / b = ${fmt(d / b, 2)} > 2: lateral support of the post compression edge required (NDS 4.4.1)`);
  }
  if (g.s < 4 * g.bolt.d) flags.push(`Bolt spacing ${fmt(g.s, 2)} in. < 4D (NDS Table 12.5.1C) — increase the spacing`);
  flags.push("Do not notch the post at the rim; bolts through the post and the rim / end joist");
  assumptions.push(
    fromDefault(
      "Guard load",
      `${fmt(P, 0)} lb at ${fmt(g.guardHeight, 1)} in. above the deck, outward`,
      "IRC Table R301.5 / IBC 1607.9.1",
    ),
    fromDefault(
      "Service condition",
      `${g.wetService ? "Wet service" : "Dry service"}; ${g.incised ? "preservative treated, incised (C_i = 0.80)" : "not incised"}`,
      "exterior deck",
    ),
    fromDefault(
      "Tension device",
      `${g.device.model}: ${fmt(g.device.capacity, 0)} lb allowable at C_D = ${fmt(devCD, 2)}; at C_D = ${fmt(CD, 2)}: ${fmt(devAllow, 0)} lb`,
      g.device.source,
      !g.device.verified,
    ),
  );
  if (!g.device.verified)
    flags.push(`${g.device.model}: confirm the allowable tension with the current catalogue (VERIFY)`);

  return {
    id: g.id,
    mark: g.mark,
    kind: "guardPost",
    title: "Deck guard post",
    callout: `${g.post.size} ${g.post.species} ${g.post.grade}${g.incised ? " (PT)" : ""}, (2) ${g.bolt.label} @ ${fmt(g.s, 1)} in., ${g.device.model} at the top bolt`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Rim",
        x: 0,
        byType: loadVector({ L: T }),
        maxDown: 0,
        maxDownCombo: "—",
        minNet: -T,
        minNetCombo: "L (guard)",
      },
    ],
    loadLines: lines,
    assumptions,
    flags,
    input: g,
    P,
    H1,
    M,
    T,
    V,
    section: { b, d, S, A },
    factors: { CD, CMb, CMv, CMp, Ci, CF, Cb },
    Fb: { ref: ld.ref.Fb, prime: FbPrime, fb },
    Fv: { ref: ld.ref.Fv, prime: FvPrime, fv },
    Fp: { ref: ld.ref.Fcperp, prime: FpPrime, fp, Aw },
    bolt: { Ab, Rn, allow: boltAllow },
    tableLabel: ld.tableLabel,
  };
}
