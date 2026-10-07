/**
 * F-# continuous (strip) footings and PF-# pad (spread) footings.
 *
 * Loads: walls (line, per foot) and posts (point) carried by load-path links,
 * plus entered loads; footing, stem and soil weights added as dead load.
 *
 * Checks:
 *  - Soil bearing, service (every ASCE 7 §2.4 ASD combination), gross pressure
 *    including footing and soil weight vs the allowable value (IBC 1806.2 or
 *    geotechnical report)
 *  - Net uplift (0.6D + 0.6W)
 *  - Concrete, strength (ASCE 7 §2.3 combinations), net factored soil pressure:
 *      plain concrete (ACI 318-19 Ch. 14, φ = 0.60, h reduced 2 in. cast against soil) or
 *      reinforced: flexure at the face (13.2.7.1), A_s,min = 0.0018 A_g (7.6.1.1 / 24.4.3.2),
 *      spacing ≤ min(3h, 18 in.), one-way shear at d (22.5), two-way shear at d / 2 (22.6)
 *  - Minimum size (IBC Table 1809.7, IBC 1809.8 plain footings) and depth (IBC 1809.4, frost)
 */

import { asdCombinations, combine, relevantCombinations, strengthCombinations, type Combination } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, addLoads, loadVector, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import {
  bar,
  flexure,
  oneWayShear,
  plainFlexure,
  plainOneWayShear,
  plainTwoWayShear,
  twoWayShearStress,
  type FlexureResult,
} from "../design/concrete";
import { governingCheck, type Check } from "../design/wood";
import { MIN_FOOTING_DEPTH, minFooting } from "../data/soil";
import type { DesignContext, ExtraLoad, LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface FootingRebar {
  size: string;
  /** strip: transverse bar spacing, in; pad: bars each way (count) */
  spacing?: number;
  count?: number;
}

export interface FootingInput {
  id: string;
  mark: string;
  description: string;
  type: "strip" | "pad";
  /** strip: width; pad: dimension B (x), ft */
  B: number;
  /** pad: dimension L (y), ft */
  L?: number;
  /** thickness, in */
  h: number;
  /** bottom of footing below lowest adjacent grade, in */
  depth: number;
  /** soil over the footing, in (default depth − h) */
  soilOver?: number;
  /** strip: wall / stem width on the footing, in; pad: post base / pier dimension c1 × c2, in */
  c1: number;
  c2?: number;
  stem?: { width: number; height: number };
  fc: number;
  fy: number;
  cover: number;
  /** strip: transverse bars (optional — plain if omitted); pad: bars each way (optional) */
  rebar?: FootingRebar;
  /** strip: continuous longitudinal bars, e.g. (2) #4 top and bottom */
  longitudinal?: { size: string; top: number; bottom: number };
  extra: ExtraLoad[];
  /** allowable soil pressure, psf, and its basis */
  qa: number;
  qaSource: string;
  /** allowable value needs confirmation (presumptive value above the soil class, or no report) */
  qaVerify?: boolean;
  soilDensity: number;
  frostDepth?: number;
  stories: number;
}

export interface FootingRow {
  combo: Combination;
  P: number;
  q: number;
  ratio: number;
}

export interface FootingResult extends MemberResultBase {
  kind: "footing";
  /** strip footings: governing segment along the footing, ft */
  segment?: { x1: number; x2: number };
  input: FootingInput;
  /** applied loads: per ft (strip, plf) or total (pad, lb) by type */
  applied: LoadVector;
  weights: { footing: number; stem: number; soil: number; total: number };
  area: number;
  service: FootingRow[];
  serviceGov: FootingRow;
  uplift?: { P: number; combo: string };
  strength: Array<{ combo: Combination; Pu: number; qu: number }>;
  quGov: { combo: Combination; Pu: number; qu: number };
  concrete: {
    plain: boolean;
    hEff: number;
    d?: number;
    cantilever: number;
    Mu: number;
    phiMn: number;
    flex?: FlexureResult;
    As?: number;
    AsMin?: number;
    sMax?: number;
    oneWay: { Vu: number; phiVn: number; at: number };
    twoWay?: { Vu: number; phiVn: number; bo: number; vc?: number };
  };
}

/**
 * Loads on the footing. Pad: point loads summed. Strip: line loads placed over
 * their extent along the footing and point loads (stud packs, posts) spread over
 * the bearing width plus a 45° spread through the footing depth, l = 1 ft + 2h;
 * the footing is designed for the governing segment (largest D + L + max(Lr, S)).
 */
function totalsByType(
  extra: ExtraLoad[],
  type: "strip" | "pad",
  h: number,
): { v: LoadVector; lines: LoadLine[]; at?: { x1: number; x2: number }; spread?: number } {
  const v = zeroLoads();
  const lines: LoadLine[] = [];
  if (type === "pad") {
    for (const e of extra) {
      if (e.kind !== "point") throw new Error(`${e.label}: pad footings take point loads — use a point link`);
      v[e.type] += e.P ?? 0;
      lines.push({ type: e.type, label: e.label, expr: `${fmt(e.P ?? 0, 0)} lb`, value: e.P ?? 0, unit: "lb" });
    }
    return { v, lines };
  }
  const spread = 1 + (2 * h) / 12;
  const segs: Array<{ x1: number; x2: number; type: LoadType; w: number }> = [];
  const BIG = 1e6;
  for (const e of extra) {
    if (e.kind === "line") {
      const x1 = e.x1 ?? 0;
      const x2 = e.x2 ?? BIG;
      segs.push({ x1, x2, type: e.type, w: e.w ?? 0 });
      lines.push({
        type: e.type,
        label: e.label,
        expr: `${fmt(e.w ?? 0, 1)} plf${e.x1 !== undefined || e.x2 !== undefined ? ` from ${fmt(x1, 2)} to ${e.x2 !== undefined ? fmt(x2, 2) : "end"} ft` : ""}`,
        value: e.w ?? 0,
        unit: "plf",
      });
    } else {
      const x = e.x ?? 0;
      const w = (e.P ?? 0) / spread;
      segs.push({ x1: x - spread / 2, x2: x + spread / 2, type: e.type, w });
      lines.push({
        type: e.type,
        label: `${e.label} (point load spread over ${fmt(spread, 2)} ft)`,
        expr: `${fmt(e.P ?? 0, 0)} lb / ${fmt(spread, 2)} ft at x = ${fmt(x, 2)} ft`,
        value: w,
        unit: "plf",
      });
    }
  }
  const xs = [...new Set(segs.flatMap((s) => [s.x1, s.x2]))].sort((a, b) => a - b);
  let best: { v: LoadVector; x1: number; x2: number } | undefined;
  const tot = (q: LoadVector) => q.D + q.L + Math.max(q.Lr, q.S);
  for (let i = 1; i < xs.length; i++) {
    const mid = (xs[i - 1] + xs[i]) / 2;
    const q = zeroLoads();
    for (const s of segs) if (mid >= s.x1 && mid <= s.x2) q[s.type] += s.w;
    if (!best || tot(q) > tot(best.v)) best = { v: q, x1: xs[i - 1], x2: xs[i] };
  }
  return { v: best?.v ?? v, lines, at: best ? { x1: best.x1, x2: Math.min(best.x2, BIG) } : undefined, spread };
}

export function designFooting(ctx: DesignContext, f: FootingInput): FootingResult {
  const strip = f.type === "strip";
  const B = f.B;
  const L = strip ? 1 : (f.L ?? f.B);
  const area = B * L;
  const { v: applied, lines, at: govSeg, spread } = totalsByType(f.extra, f.type, f.h);
  const soilOver = f.soilOver ?? Math.max(0, f.depth - f.h - (f.stem ? f.stem.height : 0));
  const wFooting = 150 * (f.h / 12) * area;
  const wStem = f.stem ? 150 * (f.stem.width / 12) * (f.stem.height / 12) * L : 0;
  const stemFoot = f.stem ? f.stem.width / 12 : strip ? f.c1 / 12 : 0;
  const wSoil = f.soilDensity * (soilOver / 12) * Math.max(0, area - (strip ? stemFoot * L : 0));
  const weights = { footing: wFooting, stem: wStem, soil: wSoil, total: wFooting + wStem + wSoil };
  const unit = strip ? "plf" : "lb";
  lines.push({
    type: "D",
    label: "Footing self weight",
    expr: `150 pcf × ${fmt(f.h / 12, 3)} ft × ${fmt(B, 2)} ft${strip ? "" : ` × ${fmt(L, 2)} ft`}`,
    value: wFooting,
    unit,
  });
  if (wStem > 0)
    lines.push({
      type: "D",
      label: "Stem wall",
      expr: `150 pcf × ${fmt(f.stem!.width / 12, 3)} ft × ${fmt(f.stem!.height / 12, 3)} ft`,
      value: wStem,
      unit,
    });
  if (wSoil > 0)
    lines.push({
      type: "D",
      label: "Soil over footing",
      expr: `${fmt(f.soilDensity, 0)} pcf × ${fmt(soilOver / 12, 3)} ft over ${fmt(area - (strip ? stemFoot : 0), 2)} ft²${strip ? " per ft" : ""}`,
      value: wSoil,
      unit,
    });
  const total = addLoads(applied, loadVector({ D: weights.total }));
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(applied[t]) > 1e-9) present[t] = true;
  const asd = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const service: FootingRow[] = asd.map((combo) => {
    const P = combine(total, combo);
    const q = P / area;
    return { combo, P, q, ratio: q / f.qa };
  });
  const serviceGov = service.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const minRow = service.reduce((a, b) => (b.P < a.P ? b : a));
  const uplift = minRow.P < 0 ? { P: minRow.P, combo: minRow.combo.label } : undefined;

  // strength design on net factored pressure (footing and soil weight excluded)
  const lrfd = relevantCombinations(
    strengthCombinations({ SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const strength = lrfd.map((combo) => {
    const Pu = Math.max(0, combine(applied, combo));
    return { combo, Pu, qu: Pu / area };
  });
  const quGov = strength.reduce((a, b) => (b.qu > a.qu ? b : a));
  const qu = quGov.qu; // psf (strip: per ft)
  const plain = !f.rebar;
  const hEff = plain ? f.h - 2 : f.h;
  const fc = f.fc;
  const checks: Check[] = [];
  const assumptions: AssumptionEntry[] = [];
  if (strip && govSeg)
    assumptions.push(
      fromDefault(
        "Governing segment",
        `Line loads placed over their extent; point loads spread over 1 ft + 2h = ${fmt(spread ?? 0, 2)} ft; governing segment ${fmt(govSeg.x1, 2)}–${govSeg.x2 > 1e5 ? "end" : fmt(govSeg.x2, 2)} ft`,
        "load spread through the footing (45°)",
      ),
    );
  assumptions.push(
    fromDefault("Allowable soil pressure", `${fmt(f.qa, 0)} psf — ${f.qaSource}`, f.qaSource, f.qaVerify ?? true),
    fromDefault(
      "Soil pressure",
      "Uniform pressure under concentric load; gross pressure (footing, stem and soil weight included) compared with the allowable value; no one-third increase taken",
      "IBC 1806.1",
    ),
  );

  checks.push({
    name: "Soil bearing pressure (service)",
    demand: serviceGov.q,
    capacity: f.qa,
    ratio: serviceGov.ratio,
    pass: serviceGov.ratio <= 1,
    combo: serviceGov.combo.label,
    CD: 1,
    unit: "psf",
  });
  if (uplift)
    checks.push({
      name: "Net uplift on footing",
      demand: -uplift.P,
      capacity: 0,
      ratio: Infinity,
      pass: false,
      combo: uplift.combo,
      CD: 1,
      unit: strip ? "plf" : "lb",
    });

  // geometry for concrete design (in.)
  const Bin = B * 12;
  const Lin = L * 12;
  const c1 = f.stem ? f.stem.width : f.c1;
  const c2 = strip ? Lin : (f.c2 ?? f.c1);
  const cant = Math.max(0, (Bin - c1) / 2); // in, from the face
  const quIn = qu / 144; // psi
  // flexure per strip of width Lin (strip footing: 12 in.)
  const Mu = (quIn * Lin * cant * cant) / 2; // lb-in
  let concrete: FootingResult["concrete"];
  if (plain) {
    const Sm = (Lin * hEff * hEff) / 6;
    const phiMn = plainFlexure(fc, Sm);
    const at = hEff;
    const Vu = Math.max(0, quIn * Lin * (cant - at));
    const phiVn = plainOneWayShear(fc, Lin, hEff);
    concrete = { plain, hEff, cantilever: cant, Mu, phiMn, oneWay: { Vu, phiVn, at } };
    if (!strip) {
      const bo = 2 * (c1 + hEff) + 2 * (c2 + hEff);
      const Vu2 = Math.max(0, quGov.Pu - quIn * (c1 + hEff) * (c2 + hEff));
      const beta = Math.max(c1, c2) / Math.min(c1, c2);
      concrete.twoWay = { Vu: Vu2, phiVn: plainTwoWayShear(fc, bo, hEff, beta), bo };
    }
  } else {
    const rb = bar(f.rebar!.size);
    const d = f.h - f.cover - rb.d / 2;
    const As = strip ? (rb.A * 12) / (f.rebar!.spacing ?? 12) : rb.A * (f.rebar!.count ?? 2);
    const flex = flexure(As, Lin, d, fc, f.fy);
    const AsMin = 0.0018 * Lin * f.h;
    const spacing = strip ? (f.rebar!.spacing ?? 12) : (Lin - 2 * f.cover) / Math.max(1, (f.rebar!.count ?? 2) - 1);
    const sMax = Math.min(3 * f.h, 18);
    const at = d;
    const Vu = Math.max(0, quIn * Lin * (cant - at));
    const ow = oneWayShear(Lin, d, As, fc);
    concrete = {
      plain,
      hEff,
      d,
      cantilever: cant,
      Mu,
      phiMn: flex.phiMn,
      flex,
      As,
      AsMin,
      sMax,
      oneWay: { Vu, phiVn: ow.phiVc, at },
    };
    checks.push({
      name: "Minimum reinforcement A_s,min = 0.0018 A_g (ACI 318 7.6.1.1)",
      category: "detailing",
      demand: AsMin,
      capacity: As,
      ratio: AsMin / As,
      pass: As >= AsMin,
      combo: "—",
      CD: 1,
      unit: "in²",
    });
    checks.push({
      name: "Bar spacing ≤ min(3h, 18 in.) (ACI 318 7.7.2.3)",
      category: "detailing",
      demand: spacing,
      capacity: sMax,
      ratio: spacing / sMax,
      pass: spacing <= sMax,
      combo: "—",
      CD: 1,
      unit: "in",
    });
    if (!strip) {
      const bo = 2 * (c1 + d) + 2 * (c2 + d);
      const Vu2 = Math.max(0, quGov.Pu - quIn * (c1 + d) * (c2 + d));
      const beta = Math.max(c1, c2) / Math.min(c1, c2);
      const tw = twoWayShearStress(fc, d, bo, beta);
      concrete.twoWay = { Vu: Vu2, phiVn: 0.75 * tw.vc * bo * d, bo, vc: tw.vc };
    }
  }
  const per = strip ? " per ft" : "";
  checks.push({
    name: `Flexure at face of ${f.stem ? "stem" : strip ? "wall" : "post base"} (${plain ? "ACI 318 14.5.2" : "ACI 318 22.2"})${per}`,
    demand: Mu / 12,
    capacity: concrete.phiMn / 12,
    ratio: Mu / concrete.phiMn,
    pass: Mu <= concrete.phiMn,
    combo: quGov.combo.label,
    CD: 1,
    unit: "lb-ft",
  });
  checks.push({
    name: `One-way shear at ${plain ? "h" : "d"} from face (${plain ? "ACI 318 14.5.5" : "ACI 318 22.5"})${per}`,
    demand: concrete.oneWay.Vu,
    capacity: concrete.oneWay.phiVn,
    ratio: concrete.oneWay.Vu / concrete.oneWay.phiVn,
    pass: concrete.oneWay.Vu <= concrete.oneWay.phiVn,
    combo: quGov.combo.label,
    CD: 1,
    unit: "lb",
  });
  if (concrete.twoWay)
    checks.push({
      name: `Two-way (punching) shear (${plain ? "ACI 318 14.5.5" : "ACI 318 22.6"})`,
      demand: concrete.twoWay.Vu,
      capacity: concrete.twoWay.phiVn,
      ratio: concrete.twoWay.Vu / concrete.twoWay.phiVn,
      pass: concrete.twoWay.Vu <= concrete.twoWay.phiVn,
      combo: quGov.combo.label,
      CD: 1,
      unit: "lb",
    });

  // minimum size and depth
  if (strip) {
    const min = minFooting(f.stories);
    checks.push({
      name: `Minimum width, ${f.stories}-story light frame (IBC Table 1809.7)`,
      category: "detailing",
      demand: min.width,
      capacity: Bin,
      ratio: min.width / Bin,
      pass: Bin >= min.width,
      combo: "—",
      CD: 1,
      unit: "in",
    });
    checks.push({
      name: `Minimum thickness (IBC Table 1809.7)`,
      category: "detailing",
      demand: min.thickness,
      capacity: f.h,
      ratio: min.thickness / f.h,
      pass: f.h >= min.thickness,
      combo: "—",
      CD: 1,
      unit: "in",
    });
  }
  if (plain && f.h < 8) {
    const projection = cant;
    checks.push({
      name: "Plain footing < 8 in.: projection ≤ thickness (IBC 1809.8 exception, Group R-3)",
      category: "detailing",
      demand: projection,
      capacity: f.h,
      ratio: projection / f.h,
      pass: projection <= f.h,
      combo: "—",
      CD: 1,
      unit: "in",
    });
  }
  const minDepth = Math.max(MIN_FOOTING_DEPTH, f.frostDepth ?? 0);
  checks.push({
    name: `Depth below grade ≥ ${fmt(minDepth, 0)} in. (IBC 1809.4${f.frostDepth ? ", frost" : ""})`,
    category: "detailing",
    demand: minDepth,
    capacity: f.depth,
    ratio: minDepth / f.depth,
    pass: f.depth >= minDepth,
    combo: "—",
    CD: 1,
    unit: "in",
  });

  const flags: string[] = [];
  if (f.longitudinal)
    flags.push(
      `Longitudinal reinforcement: (${f.longitudinal.top}) ${f.longitudinal.size} top and (${f.longitudinal.bottom}) ${f.longitudinal.size} bottom, continuous, lap splices per ACI 318 25.5`,
    );
  if (!plain)
    flags.push(
      `Reinforcing bars ASTM A615 Grade ${fmt(f.fy / 1000, 0)}; ${fmt(f.cover, 1)} in. clear cover cast against earth (ACI 318 20.5.1.3)`,
    );
  if (/presumptive|1806/i.test(f.qaSource))
    flags.push(
      "Allowable soil pressure is a presumptive value — confirm soil class in the field or by a geotechnical report",
    );
  const callout = strip
    ? `${fmt(Bin, 0)} in. W × ${fmt(f.h, 0)} in. D continuous footing${f.rebar ? `, ${f.rebar.size} @ ${fmt(f.rebar.spacing ?? 12, 0)} in. transverse` : ", plain"}${f.longitudinal ? `, (${f.longitudinal.top}) ${f.longitudinal.size} T & (${f.longitudinal.bottom}) B` : ""}`
    : `${fmt(Bin, 0)} × ${fmt(Lin, 0)} × ${fmt(f.h, 0)} in. pad footing${f.rebar ? `, (${f.rebar.count ?? 2}) ${f.rebar.size} each way` : ", plain"}`;
  return {
    id: f.id,
    mark: f.mark,
    kind: "footing",
    title: strip ? "Continuous footing" : "Pad footing",
    callout,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: lines,
    assumptions,
    flags,
    input: f,
    segment: govSeg,
    applied,
    weights,
    area,
    service,
    serviceGov,
    uplift,
    strength,
    quGov,
    concrete,
  };
}
