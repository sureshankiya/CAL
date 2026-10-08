/**
 * LG-# — ledgers bolted or lagged to a wood rim, concrete or CMU wall
 * (NDS-2018 / 2024, ASD).
 *
 *  - Vertical load per foot from the members bearing on the ledger (load-path
 *    links, e.g. joist reactions through hangers) and entered loads; horizontal
 *    load along the ledger (diaphragm wind / seismic shear) entered, strength level
 *  - Ledger as a continuous member over the fasteners: M = 0.125 w s², V = 0.625 w s;
 *    fastener reaction R_v = k_c w s with k_c = 1.25 (two-span interior reaction, Tedds
 *    "Simple ledger design" convention), R_h = h s
 *  - Fastener lateral value by the yield limit equations (NDS 12.3.1) at the angle of the
 *    resultant to the ledger grain, K_θ; wood main member at the same angle; concrete / CMU
 *    main member with an entered dowel bearing strength (VERIFY); Z' = Z C_D C_M C_t C_Δ
 *  - Edge distance of the fastener row in the ledger (NDS Table 12.5.1A, loaded edge 4D)
 */

import { asdCombinations, loadDurationFactor, relevantCombinations } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, zeroLoads, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { SPECIFIC_GRAVITY, type Grade, type Species } from "../data/sawn";
import { dowelBearingAngle, dowelYieldSingle, type DowelYieldResult } from "../design/dowel";
import { governingCheck, resolveWood, type Check } from "../design/wood";
import { ndsOf, type DesignContext, type ExtraLoad, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface LedgerInput {
  id: string;
  mark: string;
  description: string;
  ledger: { species: Species; grade: Grade; size: string };
  /** line loads on the ledger (plf by type) from links and entries; point loads are not used */
  extra: ExtraLoad[];
  /** horizontal load along the ledger, plf, strength level */
  lateral: { W: number; E: number };
  fastener: { type: "bolt" | "lag"; D: number; Fyb: number; spacing: number; label?: string };
  support:
    { kind: "wood"; species: Species; thickness: number } | { kind: "concrete" | "cmu"; Fe: number; embed: number };
  continuity: number;
  wetService?: boolean;
}

export interface LedgerRow {
  combo: string;
  CD: number;
  w: number;
  h: number;
  Rv: number;
  Rh: number;
  R: number;
  theta: number;
  Fes: number;
  Fem: number;
  yield: DowelYieldResult;
  Zprime: number;
  ratio: number;
  M: number;
  V: number;
  fb: number;
  Fb: number;
  fv: number;
  Fv: number;
}

export interface LedgerResult extends MemberResultBase {
  kind: "ledger";
  input: LedgerInput;
  rows: LedgerRow[];
  gov: LedgerRow;
  govBeam: LedgerRow;
  section: { b: number; d: number; A: number; S: number; G: number };
  perFoot: LoadVector;
  edge: { provided: number; required: number };
  supportText: string;
}

export function designLedger(ctx: DesignContext, l: LedgerInput): LedgerResult {
  const nds = ndsOf(ctx);
  const mat = resolveWood(
    { kind: "sawn", species: l.ledger.species, grade: l.ledger.grade, size: l.ledger.size, plies: 1 },
    nds,
  );
  const G = SPECIFIC_GRAVITY[l.ledger.species];
  const w = zeroLoads();
  const lines: LoadLine[] = [];
  for (const e of l.extra) {
    if (e.kind !== "line") continue;
    w[e.type] += e.w ?? 0;
    lines.push({ type: e.type, label: e.label, expr: `${fmt(e.w ?? 0, 1)} plf`, value: e.w ?? 0, unit: "plf" });
  }
  const lat = { ...w, W: w.W + l.lateral.W, E: w.E + l.lateral.E };
  if (l.lateral.W)
    lines.push({
      type: "W",
      label: "Wind shear along the ledger (strength)",
      expr: "entered",
      value: l.lateral.W,
      unit: "plf",
    });
  if (l.lateral.E)
    lines.push({
      type: "E",
      label: "Seismic shear along the ledger (strength)",
      expr: "entered",
      value: l.lateral.E,
      unit: "plf",
    });
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(lat[t]) > 1e-9) present[t] = true;
  const combos = relevantCombinations(
    asdCombinations({ SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const s = l.fastener.spacing / 12;
  const D = l.fastener.D;
  const CM = l.wetService ? 0.7 : 1;
  const support = l.support;
  const supportText =
    support.kind === "wood"
      ? `${fmt(support.thickness, 2)} in. ${support.species} rim (G = ${SPECIFIC_GRAVITY[support.species]})`
      : `${support.kind === "cmu" ? "grouted CMU" : "concrete"} wall, dowel bearing F_e = ${fmt(support.Fe, 0)} psi, embedment ${fmt(support.embed, 2)} in.`;
  const rows: LedgerRow[] = combos.map((c) => {
    const CD = loadDurationFactor(c, present);
    // vertical: gravity part of the combination (wind / seismic act along the ledger)
    let wv = 0;
    for (const t of ["D", "L", "Lr", "S"] as const) wv += (c.factors[t] ?? 0) * w[t];
    if (c.factors.E) wv += 0; // E_v already in the D factor
    const h = Math.abs((c.factors.W ?? 0) * lat.W) + Math.abs((c.factors.E ?? 0) * lat.E);
    const Rv = l.continuity * wv * s;
    const Rh = h * s;
    const R = Math.hypot(Rv, Rh);
    const theta = R > 0 ? (Math.atan2(Math.abs(Rv), Rh) * 180) / Math.PI : 90;
    const side = dowelBearingAngle(G, D, theta);
    const Fem =
      support.kind === "wood" ? dowelBearingAngle(SPECIFIC_GRAVITY[support.species], D, theta).Fe : support.Fe;
    const lm = support.kind === "wood" ? support.thickness : support.embed;
    const y = dowelYieldSingle({ D, Fyb: l.fastener.Fyb, ls: mat.bPly, Fes: side.Fe, lm, Fem, thetaDeg: theta });
    const Zprime = y.Z * CD * CM;
    const M = 0.125 * Math.abs(wv) * s * s;
    const V = 0.625 * Math.abs(wv) * s;
    const fb = (M * 12) / mat.S;
    const Fb = mat.Fb * CD * mat.CF * (l.wetService ? mat.CM.Fb : 1);
    const fv = (1.5 * V) / mat.A;
    const Fv = mat.Fv * CD * (l.wetService ? mat.CM.Fv : 1);
    return {
      combo: c.label,
      CD,
      w: wv,
      h,
      Rv,
      Rh,
      R,
      theta,
      Fes: side.Fe,
      Fem,
      yield: y,
      Zprime,
      ratio: R / Zprime,
      M,
      V,
      fb,
      Fb,
      fv,
      Fv,
    };
  });
  const gov = rows.reduce((a, r) => (r.ratio > a.ratio ? r : a), rows[0]);
  const govBeam = rows.reduce(
    (a, r) => (Math.max(r.fb / r.Fb, r.fv / r.Fv) > Math.max(a.fb / a.Fb, a.fv / a.Fv) ? r : a),
    rows[0],
  );
  const edge = { provided: mat.d / 2, required: 4 * D };
  const checks: Check[] = [
    {
      name: `Fastener lateral capacity, ${l.fastener.type === "bolt" ? "bolt" : "lag screw"} (NDS 12.3, mode ${gov.yield.mode})`,
      demand: gov.R,
      capacity: gov.Zprime,
      ratio: gov.ratio,
      pass: gov.ratio <= 1,
      combo: gov.combo,
      CD: gov.CD,
      unit: "lb",
    },
    {
      name: "Ledger bending between fasteners (NDS 3.3)",
      demand: govBeam.fb,
      capacity: govBeam.Fb,
      ratio: govBeam.fb / govBeam.Fb,
      pass: govBeam.fb <= govBeam.Fb,
      combo: govBeam.combo,
      CD: govBeam.CD,
      unit: "psi",
    },
    {
      name: "Ledger shear between fasteners (NDS 3.4)",
      demand: govBeam.fv,
      capacity: govBeam.Fv,
      ratio: govBeam.fv / govBeam.Fv,
      pass: govBeam.fv <= govBeam.Fv,
      combo: govBeam.combo,
      CD: govBeam.CD,
      unit: "psi",
    },
    {
      name: "Loaded-edge distance of the fastener row, 4D (NDS Table 12.5.1A)",
      category: "detailing",
      demand: edge.required,
      capacity: edge.provided,
      ratio: edge.required / edge.provided,
      pass: edge.provided >= edge.required,
      combo: "—",
      CD: 1,
      unit: "in",
    },
  ];
  const assumptions: AssumptionEntry[] = [
    fromDefault(
      "Fastener reaction",
      `R_v = ${fmt(l.continuity, 2)} w s (continuous ledger over the fasteners)`,
      l.continuity === 1.25 ? "two-span interior reaction (Tedds convention)" : "engineer",
    ),
    fromDefault(
      "Bending yield strength",
      `F_yb = ${fmt(l.fastener.Fyb, 0)} psi`,
      "NDS Table 12.3.3 note / ASTM",
      l.fastener.Fyb !== 45000,
    ),
    fromDefault(
      "Group action / geometry",
      "C_g = 1.0 (single row), C_Δ = 1.0 (NDS 12.5 spacing, end and edge distances provided)",
      "NDS 12.5",
      true,
    ),
  ];
  if (support.kind !== "wood")
    assumptions.push(
      fromDefault(
        "Dowel bearing strength of the wall",
        `F_e = ${fmt(support.Fe, 0)} psi`,
        "entered — VERIFY basis",
        true,
      ),
    );
  const perFoot = zeroLoads();
  for (const t of LOAD_TYPES) perFoot[t] = w[t];
  return {
    id: l.id,
    mark: l.mark,
    kind: "ledger",
    title: "Ledger",
    callout: `${l.ledger.size} ${l.ledger.species} ${l.ledger.grade} ledger, ${fmt(D, 3).replace(/0+$/, "").replace(/\.$/, "")} in. ${l.fastener.type === "bolt" ? "bolts" : "lag screws"} @ ${fmt(l.fastener.spacing, 0)} in. o.c.`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [
      {
        support: 0,
        name: "Wall",
        x: 0,
        byType: perFoot,
        perFoot,
        maxDown: Math.max(...rows.map((r) => r.w)),
        maxDownCombo: rows.reduce((a, r) => (r.w > a.w ? r : a)).combo,
        minNet: Math.min(...rows.map((r) => r.w)),
        minNetCombo: rows.reduce((a, r) => (r.w < a.w ? r : a)).combo,
      },
    ],
    loadLines: lines,
    assumptions,
    flags: [],
    input: l,
    rows,
    gov,
    govBeam,
    section: { b: mat.bPly, d: mat.d, A: mat.A, S: mat.S, G },
    perFoot,
    edge,
    supportText,
  };
}
