/**
 * P-# — wood posts and columns: sawn, built-up (NDS 15.3), glulam and SCL.
 *
 * Axial loads come from load-path links (beam / girder-truss reactions as
 * point loads) and entered loads; optional eccentricity and wind on an exposed
 * post produce bending about the strong axis.
 *
 * Checks (ASD, every ASCE 7 §2.4 combination with its C_D):
 *  - compression with C_P about both axes (NDS 3.7.1), built-up K_f (15.3.2)
 *  - combined bending and axial compression (NDS Eq. 3.9-3)
 *  - slenderness l_e / d ≤ 50 (3.7.1.4)
 *  - end-grain bearing on the post (NDS 3.10.1); f_c > 0.75 F_c* requires a steel plate
 *  - bearing perpendicular to grain on a wood support below (NDS 3.10.2, C_b 3.10.4)
 */

import { asdCombinations, combine, relevantCombinations } from "../core/combos";
import { fmt, fmtFtIn } from "../core/fmt";
import { LOAD_TYPES, loadVector, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { designColumn, type ColumnResult } from "../design/column";
import { firstPassing } from "../design/sizing";
import { bearingAreaFactor, governingCheck, resolveWood, type Check, type ResolvedWood, type WoodMaterial } from "../design/wood";
import { lumberData, type Grade, type Species } from "../data/sawn";
import { ndsOf, type DesignContext, type ExtraLoad, type LoadLine } from "./common";
import { materialCallout } from "./beam";
import type { MemberReaction, MemberResultBase } from "./types";

export interface PostBearing {
  /** what the post bears on */
  on: "wood" | "concrete" | "steel";
  species?: Species;
  grade?: Grade;
  /** supporting member size, for its Table 4A / 4D values */
  size?: string;
  /** bearing length measured along the grain of the support, in (default: post dimension b) */
  lb?: number;
  /** bearing within 3 in. of the end of the supporting member */
  atEnd?: boolean;
}

export interface PostInput {
  id: string;
  mark: string;
  description: string;
  material: WoodMaterial;
  builtUp?: "nailed" | "bolted";
  /** unbraced post height, ft */
  height: number;
  /** effective length factor K_e (NDS Appendix G) */
  Ke: number;
  /** intermediate bracing interval about the weak axis, ft (0 = full height) */
  braceWeak?: number;
  /** intermediate bracing interval about the strong axis, ft (0 = full height) */
  braceStrong?: number;
  extra: ExtraLoad[];
  /** eccentricity of the axial load about the strong axis, in */
  eccentricity?: number;
  /** wind on an exposed post, strength-level psf × exposed width, ft */
  wind?: { psf: number; width: number };
  bearing: PostBearing;
  selfWeight: boolean;
  wetService?: boolean;
  incised?: boolean;
}

export interface PostResult extends MemberResultBase {
  kind: "post";
  input: PostInput;
  mat: ResolvedWood;
  col: ColumnResult;
  le1: number;
  le2: number;
  P: LoadVector;
  selfWeightLb: number;
  endGrain: { fc: number; FcStar: number; ratio: number; combo: string; plateRequired: boolean };
  bearingPerp?: {
    support: string;
    Fcperp: number;
    Cb: number;
    lb: number;
    A: number;
    fcperp: number;
    Fprime: number;
    ratio: number;
    combo: string;
  };
}

const POST_SIZES = ["4x4", "4x6", "4x8", "6x6", "6x8", "8x8"];

function evaluate(ctx: DesignContext, p: PostInput, material = p.material) {
  const nds = ndsOf(ctx);
  const mat = resolveWood(material, nds);
  const lines: LoadLine[] = [];
  const P = zeroLoads();
  for (const e of p.extra) {
    if (e.kind !== "point") throw new Error(`${e.label}: posts take point loads only — use a point link`);
    P[e.type] += e.P ?? 0;
    lines.push({ type: e.type, label: e.label, expr: `${fmt(e.P ?? 0, 0)} lb at post top`, value: e.P ?? 0, unit: "lb" });
  }
  const selfWeightLb = p.selfWeight ? mat.selfWeight * p.height : 0;
  if (selfWeightLb > 0) {
    P.D += selfWeightLb;
    lines.push({
      type: "D",
      label: "Post self weight",
      expr: `${fmt(mat.selfWeight, 2)} plf × ${fmt(p.height, 2)} ft`,
      value: selfWeightLb,
      unit: "lb",
    });
  }
  const H = p.height * 12;
  const le1 = p.Ke * (p.braceStrong && p.braceStrong > 0 ? Math.min(p.braceStrong * 12, H) : H);
  const le2 = p.Ke * (p.braceWeak && p.braceWeak > 0 ? Math.min(p.braceWeak * 12, H) : H);
  const windPlf = p.wind ? p.wind.psf * p.wind.width : 0;
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(P[t]) > 1e-9) present[t] = true;
  if (windPlf > 0) present.W = true;
  const combos = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const builtUp = material.kind === "sawn" && material.plies > 1 ? (p.builtUp ?? "nailed") : undefined;
  const col = designColumn({
    mat,
    cond: { wetService: !!p.wetService, incised: !!p.incised, repetitive: false },
    length: H,
    le1,
    le2,
    builtUp,
    P,
    w: windPlf > 0 ? loadVector({ W: windPlf }) : undefined,
    e: p.eccentricity,
    lu: windPlf > 0 ? H : 0,
    combos,
    present,
  });

  // end-grain bearing (NDS 3.10.1): F_c* without C_P
  let eg = { fc: 0, FcStar: 1, ratio: 0, combo: "", plateRequired: false };
  for (const r of col.rows) {
    const ratio = r.fc / r.FcStar;
    if (ratio > eg.ratio) eg = { fc: r.fc, FcStar: r.FcStar, ratio, combo: r.combo.label, plateRequired: r.fc > 0.75 * r.FcStar };
  }

  // bearing perpendicular to grain on a wood support
  let bearingPerp: PostResult["bearingPerp"];
  if (p.bearing.on === "wood") {
    const sp = p.bearing.species ?? (material.kind === "sawn" ? material.species : "DF-L");
    const gr = p.bearing.grade ?? "No.2";
    const sz = p.bearing.size ?? "2x6";
    const sup = lumberData(sp, gr, sz, nds);
    const lb = p.bearing.lb ?? Math.min(mat.b, mat.d);
    const Cb = bearingAreaFactor(lb, !!p.bearing.atEnd);
    const CMperp = p.wetService ? sup.CM.Fcperp : 1;
    const A = mat.b * mat.d;
    let Pmax = 0;
    let combo = "";
    for (const c of combos) {
      const v = combine(P, c);
      if (v > Pmax) {
        Pmax = v;
        combo = c.label;
      }
    }
    const fcperp = Pmax / A;
    const Fprime = sup.ref.Fcperp * CMperp * Cb;
    bearingPerp = {
      support: `${sz} ${sp} ${gr}`,
      Fcperp: sup.ref.Fcperp,
      Cb,
      lb,
      A,
      fcperp,
      Fprime,
      ratio: fcperp / Fprime,
      combo,
    };
  }
  return { mat, lines, P, selfWeightLb, le1, le2, combos, col, endGrain: eg, bearingPerp, builtUp };
}

function checksOf(ev: ReturnType<typeof evaluate>): Check[] {
  const { col } = ev;
  const a = col.axialGov;
  const g = col.governing;
  const checks: Check[] = [
    {
      name: "Axial compression with C_P (NDS 3.6, 3.7)",
      demand: a.fc,
      capacity: a.FcPrime,
      ratio: a.axial,
      pass: a.axial <= 1,
      combo: a.combo.label,
      CD: a.CD,
      unit: "psi",
    },
    {
      name: "Slenderness l_e/d (NDS 3.7.1.4)",
      category: "detailing",
      demand: Math.max(col.le1d1, col.le2d2),
      capacity: 50,
      ratio: Math.max(col.le1d1, col.le2d2) / 50,
      pass: Math.max(col.le1d1, col.le2d2) <= 50,
      combo: "—",
      CD: 1,
      unit: "",
    },
    {
      name: "End-grain bearing (NDS 3.10.1)",
      demand: ev.endGrain.fc,
      capacity: ev.endGrain.FcStar,
      ratio: ev.endGrain.ratio,
      pass: ev.endGrain.ratio <= 1,
      combo: ev.endGrain.combo,
      CD: 1,
      unit: "psi",
    },
  ];
  if (g.fb > 0)
    checks.push({
      name: "Combined bending and axial compression (NDS Eq. 3.9-3)",
      demand: g.interaction,
      capacity: 1,
      ratio: g.interaction,
      pass: g.interaction <= 1,
      combo: g.combo.label,
      CD: g.CD,
      unit: "",
    });
  if (ev.bearingPerp)
    checks.push({
      name: `Bearing on ${ev.bearingPerp.support} (NDS 3.10.2)`,
      demand: ev.bearingPerp.fcperp,
      capacity: ev.bearingPerp.Fprime,
      ratio: ev.bearingPerp.ratio,
      pass: ev.bearingPerp.ratio <= 1,
      combo: ev.bearingPerp.combo,
      CD: 1,
      unit: "psi",
    });
  return checks;
}

export function designPost(ctx: DesignContext, p: PostInput): PostResult {
  const ev = evaluate(ctx, p);
  const checks = checksOf(ev);
  const pass = checks.every((c) => c.pass);
  const flags: string[] = [];
  const assumptions: AssumptionEntry[] = [
    fromDefault(
      "End conditions",
      `Pinned top and bottom, K_e = ${fmt(p.Ke, 2)}; ends held in position by the beam / cap and base connectors`,
      "NDS 3.7.1.2, Appendix G",
    ),
  ];
  if (ev.builtUp)
    assumptions.push(
      fromDefault(
        "Built-up column",
        `${ev.builtUp === "nailed" ? "Nailed" : "Bolted"} plies, K_f = ${fmt(ev.col.Kf, 2)}; fastening per NDS 15.3.3 / 15.3.4`,
        "NDS 15.3",
      ),
    );
  if (ev.endGrain.plateRequired)
    flags.push("f_c > 0.75 F_c* at the post end: 20 ga steel plate or equivalent bearing insert required (NDS 3.10.1.3)");
  if (p.bearing.on === "concrete")
    flags.push("Post bears on concrete through a post base; base clear of the concrete per manufacturer (decay protection, CBC 2304.12)");
  let alternatives: PostResult["alternatives"];
  if (!pass && p.material.kind === "sawn") {
    const base = p.material;
    const cands: WoodMaterial[] = POST_SIZES.filter((s) => s !== base.size).map((size) => ({
      ...base,
      size,
      plies: 1,
      grade: Number(size.split("x")[0]) >= 5 && !["Sel Str", "No.1", "No.2"].includes(base.grade) ? "No.2" : base.grade,
    }));
    const found = firstPassing(cands, (m) => {
      const e = evaluate(ctx, { ...p, material: m }, m);
      const c = checksOf(e);
      return { pass: c.every((k) => k.pass), governing: governingCheck(c) };
    });
    alternatives = { lightest: found.chosen ? materialCallout(found.chosen.candidate) : undefined };
  }
  let maxDown = -Infinity;
  let maxDownCombo = "";
  let minNet = Infinity;
  let minNetCombo = "";
  for (const c of ev.combos) {
    const v = combine(ev.P, c);
    if (v > maxDown) {
      maxDown = v;
      maxDownCombo = c.label;
    }
    if (v < minNet) {
      minNet = v;
      minNetCombo = c.label;
    }
  }
  const reactions: MemberReaction[] = [
    { support: 0, name: "Base", x: 0, byType: { ...ev.P }, maxDown, maxDownCombo, minNet, minNetCombo },
  ];
  return {
    id: p.id,
    mark: p.mark,
    kind: "post",
    title: "Post",
    callout: `${materialCallout(p.material)}${ev.builtUp ? ` built-up (${ev.builtUp})` : ""}, ${fmtFtIn(p.height)}`,
    pass,
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: ev.lines,
    assumptions,
    flags,
    alternatives,
    input: p,
    mat: ev.mat,
    col: ev.col,
    le1: ev.le1,
    le2: ev.le2,
    P: ev.P,
    selfWeightLb: ev.selfWeightLb,
    endGrain: ev.endGrain,
    bearingPerp: ev.bearingPerp,
  };
}
