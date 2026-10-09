/**
 * RD-# / FD-# — wood structural panel diaphragms (SDPWS-2021 §4.2, ASD),
 * flexible idealisation (ASCE 7 §12.3.1.1(c)), one story and load direction.
 *
 *  - Seismic force F_px (ASCE 7 Eq. 12.10-1, limits 12.10-2 / 12.10-3, ρ = 1.0), wind force at
 *    the diaphragm level (Ch. 28 envelope band); both spread uniformly across the plan
 *    dimension perpendicular to the load: w = F / D_span
 *  - Each diaphragm segment spans between adjacent wall lines (simple span) or cantilevers
 *    past the end lines: R = wL/2 (wL), M = wL²/8 (wL²/2)
 *  - Unit shear v = R / D (D = diaphragm depth parallel to the load) vs v_s / 2.0, v_w / 2.0
 *    (SDPWS Table 4.2A, 4.2.3); aspect ratio L / D (Table 4.2.4)
 *  - Chord force T = M / D on the double top plate: tension on one ply at the splice (NDS 3.8),
 *    splice by nails (NDS 12.3, C_D = 1.6) or a strap (catalogue allowable)
 *  - Collectors along each wall line: F(x) = v_d x − v_w × (shear-wall length left of x),
 *    v_d = R_line / D, v_w = R_line / ΣL_w; with wall positions the exact profile, otherwise
 *    the bound v_d (D − ΣL_w). Ω0 (§12.10.2.1) unless the exception for structures braced
 *    entirely by light-frame shear walls applies
 */

import { fmt } from "../core/fmt";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { diaphragmMaxAspect, diaphragmValues, type DiaphragmEdge } from "../data/diaphragm";
import { SPECIFIC_GRAVITY, type Grade, type Species } from "../data/sawn";
import { nailDef, nailSingleShear } from "../design/dowel";
import { governingCheck, resolveWood, type Check } from "../design/wood";
import { ndsOf, type DesignContext, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface DiaphragmInput {
  id: string;
  mark: string;
  description: string;
  level: "roof" | "floor";
  storyId: string;
  dir: "X" | "Y";
  sheathing: string;
  blocked: boolean;
  edge: DiaphragmEdge;
  unblockedCase: 1 | 2;
  chord: {
    species: Species;
    grade: Grade;
    size: string;
    splice: { type: "nails" | "strap"; nail: string; nails: number; strapId?: string };
  };
  /** design collectors for Ω0 even where the light-frame exception applies */
  collectorOmega: boolean;
}

export interface DiaphragmLineInput {
  id: string;
  name: string;
  pos: number;
  /** shear walls on the line: effective length (ft) and start position along the line (ft) */
  walls: Array<{ mark: string; L: number; x?: number }>;
}

export interface DiaphragmDemand {
  storyName: string;
  Fpx: number;
  FpxCalc: number;
  FpxMin: number;
  FpxMax: number;
  /** wind force at this diaphragm level, strength, lb */
  Fw: number;
  /** plan dimension perpendicular to the load (span direction) and parallel to it (depth), ft */
  Dspan: number;
  Dpar: number;
  lines: DiaphragmLineInput[];
  Omega0: number;
  lightFrame: boolean;
  SDC: string;
}

export interface DiaphragmSegment {
  label: string;
  a: number;
  b: number;
  L: number;
  cantilever: boolean;
  RE: number;
  RW: number;
  vE: number;
  vW: number;
  ME: number;
  MW: number;
  TE: number;
  TW: number;
  aspect: number;
}

export interface CollectorResult {
  line: string;
  RE: number;
  RW: number;
  Lw: number;
  vdE: number;
  vwE: number;
  FE: number;
  FW: number;
  exact: boolean;
  omega: number;
  /** ASD design force incl. Ω0 where required */
  Fasd: number;
  basis: string;
}

export interface DiaphragmResult extends MemberResultBase {
  kind: "diaphragm";
  input: DiaphragmInput;
  demand: DiaphragmDemand;
  values: { vs: number; vw: number; text: string; row: import("../data/diaphragm").DiaphragmRow };
  vAllowS: number;
  vAllowW: number;
  wE: number;
  wW: number;
  segments: DiaphragmSegment[];
  collectors: CollectorResult[];
  chord: {
    T: number;
    combo: string;
    An: number;
    ft: number;
    Ft: number;
    ratio: number;
    Z?: number;
    Zprime?: number;
    spliceCap: number;
    spliceText: string;
  };
  maxAspect: number;
}

export function designDiaphragm(ctx: DesignContext, d: DiaphragmInput, dem: DiaphragmDemand): DiaphragmResult {
  const nds = ndsOf(ctx);
  if (dem.lines.length < 1) throw new Error("Diaphragm: no wall lines in this story and direction");
  const lines = [...dem.lines].sort((a, b) => a.pos - b.pos);
  const values = diaphragmValues(d.sheathing, d.blocked, d.edge, d.unblockedCase);
  const vAllowS = values.vs / 2;
  const vAllowW = values.vw / 2;
  const wE = dem.Fpx / dem.Dspan;
  const wW = dem.Fw / dem.Dspan;
  const D = dem.Dpar;
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];

  // segments
  const segs: Array<{ a: number; b: number; cant: "left" | "right" | false; label: string }> = [];
  if (lines[0].pos > 0.01) segs.push({ a: 0, b: lines[0].pos, cant: "left", label: `Edge – ${lines[0].name}` });
  for (let i = 0; i < lines.length - 1; i++)
    segs.push({ a: lines[i].pos, b: lines[i + 1].pos, cant: false, label: `${lines[i].name} – ${lines[i + 1].name}` });
  const last = lines[lines.length - 1];
  if (last.pos < dem.Dspan - 0.01)
    segs.push({ a: last.pos, b: dem.Dspan, cant: "right", label: `${last.name} – edge` });
  if (lines.length === 1 && segs.length)
    flags.push("Single wall line in this direction: the diaphragm cantilevers — rigid / torsional system, EOR review");

  const lineR = new Map<string, { E: number; W: number }>(lines.map((l) => [l.id, { E: 0, W: 0 }]));
  const segments: DiaphragmSegment[] = segs.map((s) => {
    const L = s.b - s.a;
    const cant = !!s.cant;
    const RE = cant ? wE * L : (wE * L) / 2;
    const RW = cant ? wW * L : (wW * L) / 2;
    const ME = cant ? (wE * L * L) / 2 : (wE * L * L) / 8;
    const MW = cant ? (wW * L * L) / 2 : (wW * L * L) / 8;
    if (cant) {
      const ln = s.cant === "left" ? lines[0] : last;
      const r = lineR.get(ln.id)!;
      r.E += RE;
      r.W += RW;
    } else {
      const i = lines.findIndex((l) => Math.abs(l.pos - s.a) < 1e-9);
      for (const ln of [lines[i], lines[i + 1]]) {
        const r = lineR.get(ln.id)!;
        r.E += RE;
        r.W += RW;
      }
    }
    return {
      label: s.label,
      a: s.a,
      b: s.b,
      L,
      cantilever: cant,
      RE,
      RW,
      vE: RE / D,
      vW: RW / D,
      ME,
      MW,
      TE: ME / D,
      TW: MW / D,
      aspect: L / D,
    };
  });
  if (segments.some((s) => s.cantilever && s.L > D / 4))
    flags.push("Cantilevered diaphragm beyond the end wall line — check the SDPWS cantilevered-diaphragm limits (EOR review)");

  const checks: Check[] = [];
  const gs = segments.reduce((a, s) => (s.vE > a.vE ? s : a), segments[0]);
  checks.push({
    name: "Diaphragm unit shear, seismic 0.7F_px (SDPWS-2021 Table 4.2A, v_s / 2.0)",
    demand: 0.7 * gs.vE,
    capacity: vAllowS,
    ratio: (0.7 * gs.vE) / vAllowS,
    pass: 0.7 * gs.vE <= vAllowS,
    combo: "0.7E",
    CD: 1.6,
    unit: "plf",
  });
  const gw = segments.reduce((a, s) => (s.vW > a.vW ? s : a), segments[0]);
  checks.push({
    name: "Diaphragm unit shear, wind 0.6W (SDPWS-2021 Table 4.2A, v_w / 2.0)",
    demand: 0.6 * gw.vW,
    capacity: vAllowW,
    ratio: (0.6 * gw.vW) / vAllowW,
    pass: 0.6 * gw.vW <= vAllowW,
    combo: "0.6W",
    CD: 1.6,
    unit: "plf",
  });
  const maxAspect = diaphragmMaxAspect(d.blocked);
  const ga = segments.reduce((a, s) => (s.aspect > a.aspect ? s : a), segments[0]);
  checks.push({
    name: `Diaphragm aspect ratio L/W (SDPWS max. diaphragm aspect ratio) — ${ga.label}`,
    category: "detailing",
    demand: ga.aspect,
    capacity: maxAspect,
    ratio: ga.aspect / maxAspect,
    pass: ga.aspect <= maxAspect,
    combo: "—",
    CD: 1,
    unit: "",
  });

  // collectors
  const collectors: CollectorResult[] = lines.map((ln) => {
    const R = lineR.get(ln.id)!;
    const Lw = ln.walls.reduce((s, w) => s + w.L, 0);
    const vdE = R.E / D;
    const vwE = Lw > 0 ? R.E / Lw : Infinity;
    const exact = ln.walls.length > 0 && ln.walls.every((w) => w.x !== undefined);
    const profile = (Rv: number) => {
      if (Lw <= 0) return Rv;
      const vd = Rv / D;
      const vw = Rv / Lw;
      if (!exact) return vd * Math.max(0, D - Lw);
      // walk the line: breakpoints at wall ends
      const pts = new Set<number>([0, D]);
      for (const w of ln.walls) {
        pts.add(Math.min(D, Math.max(0, w.x!)));
        pts.add(Math.min(D, Math.max(0, w.x! + w.L)));
      }
      let Fmax = 0;
      for (const x of [...pts].sort((a, b) => a - b)) {
        const inWalls = ln.walls.reduce((s, w) => s + Math.max(0, Math.min(x, w.x! + w.L) - w.x!), 0);
        Fmax = Math.max(Fmax, Math.abs(vd * x - vw * inWalls));
      }
      return Fmax;
    };
    const FE = profile(R.E);
    const FW = profile(R.W);
    const needOmega = !dem.lightFrame || d.collectorOmega;
    const highSDC = ["C", "D", "E", "F"].includes(dem.SDC);
    const omega = needOmega && highSDC ? dem.Omega0 : 1;
    const Fasd = Math.max(0.7 * omega * FE, 0.6 * FW);
    return {
      line: ln.name,
      RE: R.E,
      RW: R.W,
      Lw,
      vdE,
      vwE,
      FE,
      FW,
      exact,
      omega,
      Fasd,
      basis:
        Lw <= 0
          ? "no shear walls assigned — whole line reaction"
          : exact
            ? "collector force profile from the wall positions"
            : "upper bound v_d (D − ΣL_w) — enter wall positions for the actual profile",
    };
  });
  for (const c of collectors) if (c.Lw <= 0) flags.push(`${c.line}: no shear walls assigned to the line`);

  // chord (and collector) on the double top plate
  const plate = resolveWood(
    { kind: "sawn", species: d.chord.species, grade: d.chord.grade, size: d.chord.size, plies: 1 },
    nds,
  );
  const An = plate.bPly * plate.d;
  const Ft = plate.Ft * 1.6 * plate.CFt;
  const TE = Math.max(...segments.map((s) => s.TE));
  const TW = Math.max(...segments.map((s) => s.TW));
  const Tchord = Math.max(0.7 * TE, 0.6 * TW);
  const Tcoll = Math.max(0, ...collectors.map((c) => c.Fasd));
  const T = Math.max(Tchord, Tcoll);
  const combo = T === Tchord ? (0.7 * TE >= 0.6 * TW ? "0.7E (chord)" : "0.6W (chord)") : "collector";
  const ft = T / An;
  checks.push({
    name: `Chord / collector tension on one ${d.chord.size} top-plate ply at the splice (NDS 3.8)`,
    demand: ft,
    capacity: Ft,
    ratio: ft / Ft,
    pass: ft <= Ft,
    combo,
    CD: 1.6,
    unit: "psi",
  });
  let Z: number | undefined;
  let Zprime: number | undefined;
  let spliceCap: number;
  let spliceText: string;
  if (d.chord.splice.type === "nails") {
    const G = SPECIFIC_GRAVITY[d.chord.species];
    const nail = nailDef(d.chord.splice.nail);
    const z = nailSingleShear({ nail, ts: plate.bPly, tm: plate.bPly, Gs: G, Gm: G });
    Z = z.Z;
    Zprime = z.Z * 1.6;
    spliceCap = d.chord.splice.nails * Zprime;
    spliceText = `(${d.chord.splice.nails}) ${nail.label} each side of the splice: n Z' = ${d.chord.splice.nails} × ${fmt(Zprime, 0)} lb (Z = ${fmt(Z, 0)} lb, mode ${z.mode}, C_D = 1.6)`;
  } else {
    const item = ctx.hardware?.find((x) => x.id === d.chord.splice.strapId);
    if (!item) throw new Error("Chord splice: select a strap from the hardware list");
    if (item.tension === undefined) throw new Error(`${item.model}: allowable tension not entered`);
    spliceCap = item.tension;
    spliceText = `${item.model} strap, allowable tension ${fmt(item.tension, 0)} lb (${item.report || item.source})`;
    if (!item.checked) assumptions.push(fromDefault("Strap capacity", spliceText, item.source, true));
  }
  checks.push({
    name: "Top-plate splice (chord / collector force)",
    demand: T,
    capacity: spliceCap,
    ratio: T / spliceCap,
    pass: T <= spliceCap,
    combo,
    CD: 1.6,
    unit: "lb",
  });
  const loadLines: LoadLine[] = [
    {
      type: "E",
      label: `Seismic diaphragm force F_px (${dem.storyName}), ρ = 1.0`,
      expr: `max(${fmt(dem.FpxCalc, 0)}, 0.2 S_DS I_e w_px = ${fmt(dem.FpxMin, 0)}) ≤ ${fmt(dem.FpxMax, 0)} lb → w = F_px / ${fmt(dem.Dspan, 1)} ft`,
      value: wE,
      unit: "plf",
    },
    {
      type: "W",
      label: `Wind force at the ${d.level} diaphragm (${dem.storyName})`,
      expr: `${fmt(dem.Fw, 0)} lb / ${fmt(dem.Dspan, 1)} ft`,
      value: wW,
      unit: "plf",
    },
  ];
  assumptions.push(
    fromDefault("Diaphragm sheathing", values.text, "SDPWS Table 4.2A", true),
    fromDefault(
      "Flexibility",
      "Flexible diaphragm (ASCE 7 §12.3.1.1(c): wood structural panels, light-frame shear walls); deflection not calculated",
      "ASCE 7 §12.3.1.1",
    ),
    fromDefault(
      "Collectors",
      dem.lightFrame && !d.collectorOmega
        ? "Collectors designed for F_px forces — ASCE 7 §12.10.2.1 exception (structure braced entirely by light-frame shear walls)"
        : `Collectors designed with Ω0 = ${dem.Omega0} (ASCE 7 §12.10.2.1)`,
      "ASCE 7 §12.10.2.1",
    ),
  );
  flags.push(
    `${d.blocked ? "Blocked" : "Unblocked"} diaphragm: ${values.text}; boundary nailing to blocking / rim at all wall lines`,
  );
  return {
    id: d.id,
    mark: d.mark,
    kind: "diaphragm",
    title: `${d.level === "roof" ? "Roof" : "Floor"} diaphragm — ${d.dir}-direction load`,
    callout: values.text,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines,
    assumptions,
    flags,
    input: d,
    demand: dem,
    values,
    vAllowS,
    vAllowW,
    wE,
    wW,
    segments,
    collectors,
    chord: { T, combo, An, ft, Ft, ratio: ft / Ft, Z, Zprime, spliceCap, spliceText },
    maxAspect,
  };
}
