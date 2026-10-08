/**
 * TI-# — tie-ins to existing concrete: drilled reinforcing dowels or threaded rods set in
 * adhesive along a new-to-existing joint (new footing to existing footing, infill wall,
 * slab extension), ACI 318-19 Ch. 17 (src/engine/design/adhesive.ts) with the adhesive's
 * ICC-ES bond values, plus shear friction across the cold joint (22.9):
 *
 *   φV_n = 0.75 μ A_vf f_y,  μ = 1.0λ (roughened to ¼ in. amplitude) or 0.6λ (not roughened),
 *   V_n ≤ min(0.2 f'c A_c, 800 A_c) (not roughened) / min(0.2 f'c A_c, (480 + 0.08 f'c) A_c, 1600 A_c) (roughened)
 *
 * Demands are strength level per foot of joint (entered, or zero for a prescriptive tie-in,
 * in which case the capacity per foot is reported).
 */

import { fmt } from "../core/fmt";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { dowelRow, interaction17, type AdhesiveProduct } from "../design/adhesive";
import { effectiveArea } from "../design/anchors";
import { bar } from "../design/concrete";
import { governingCheck, type Check } from "../design/wood";
import type { DesignContext } from "./common";
import type { MemberResultBase } from "./types";

export interface TieInInput {
  id: string;
  mark: string;
  description: string;
  joint: string;
  anchor: { kind: "rebar" | "rod"; size: string; fya: number; futa: number; steelLabel: string };
  hef: number;
  spacing: number;
  ca1: number;
  ha: number;
  existing: { fc: number; cracked: boolean; verified: boolean };
  product: AdhesiveProduct & { verified: boolean };
  shearDir: "toward-edge" | "parallel-edge";
  /** strength-level demand per foot of joint */
  demand: { Nu: number; Vu: number; source: string };
  shearFriction?: { Vu: number; roughened: boolean; Ac: number };
  seismic: boolean;
}

export interface TieInResult extends MemberResultBase {
  kind: "tieIn";
  input: TieInInput;
  d: number;
  Ase: number;
  row: ReturnType<typeof dowelRow>;
  perAnchor: { Nua: number; Vua: number };
  perFoot: { phiNn: number; phiVn: number };
  inter: { ratio: number; text: string };
  sf?: { Avf: number; mu: number; phiVn: number; limit: number; Vu: number; ratio: number };
}

export function designTieIn(ctx: DesignContext, t: TieInInput): TieInResult {
  void ctx;
  const rebar = t.anchor.kind === "rebar";
  const d = rebar ? bar(t.anchor.size).d : Number(t.anchor.size);
  const Ase = rebar ? bar(t.anchor.size).A : effectiveArea(d);
  const row = dowelRow({
    kind: t.anchor.kind,
    d,
    Ase,
    fya: t.anchor.fya,
    futa: t.anchor.futa,
    hef: t.hef,
    s: t.spacing,
    ca1: t.ca1,
    ha: t.ha,
    fc: t.existing.fc,
    cracked: t.existing.cracked,
    seismic: t.seismic,
    shearDir: t.shearDir,
    product: t.product,
  });
  const k = t.spacing / 12;
  const Nua = t.demand.Nu * k;
  const Vua = t.demand.Vu * k;
  const rN = Nua / row.phiNn;
  const rV = Vua / row.phiVn;
  const inter = interaction17(rN, rV);
  const checks: Check[] = [];
  const label = rebar ? `${t.anchor.size} dowel` : `${fmt(d, 3)} in. rod`;
  checks.push(
    {
      name: `Tension per ${label}, ${row.tGov} (ACI 318 17.6)`,
      demand: Nua,
      capacity: row.phiNn,
      ratio: rN,
      pass: rN <= 1,
      combo: t.demand.source || "entered",
      CD: 1,
      unit: "lb",
    },
    {
      name: `Shear per ${label}, ${row.vGov} (ACI 318 17.7)`,
      demand: Vua,
      capacity: row.phiVn,
      ratio: rV,
      pass: rV <= 1,
      combo: t.demand.source || "entered",
      CD: 1,
      unit: "lb",
    },
    {
      name: "Tension–shear interaction (ACI 318 17.8)",
      demand: inter.ratio,
      capacity: 1,
      ratio: inter.ratio,
      pass: inter.ratio <= 1,
      combo: t.demand.source || "entered",
      CD: 1,
      unit: "",
    },
  );
  // minimum geometry for post-installed anchors (17.9.2 / Table 17.9.2a: s_min = 6 d_a, c_min = 6 d_a for torque-controlled; adhesive per report)
  checks.push(
    {
      name: "Minimum spacing 6 d_a (ACI 318 17.9.2, adhesive: unless the report allows less)",
      category: "detailing",
      demand: 6 * d,
      capacity: t.spacing,
      ratio: (6 * d) / t.spacing,
      pass: t.spacing >= 6 * d,
      combo: "—",
      CD: 1,
      unit: "in",
    },
    {
      name: "Minimum edge distance 6 d_a (ACI 318 17.9.2, adhesive: unless the report allows less)",
      category: "detailing",
      demand: 6 * d,
      capacity: t.ca1,
      ratio: (6 * d) / t.ca1,
      pass: t.ca1 >= 6 * d,
      combo: "—",
      CD: 1,
      unit: "in",
    },
    {
      name: "Member thickness h_a ≥ h_min = h_ef + 2 d_o (ACI 355.4 / ICC-ES report, hole d_o ≈ d_a + 1/8 in.)",
      category: "detailing",
      demand: t.hef + 2 * (d + 0.125),
      capacity: t.ha,
      ratio: (t.hef + 2 * (d + 0.125)) / t.ha,
      pass: t.ha >= t.hef + 2 * (d + 0.125),
      combo: "—",
      CD: 1,
      unit: "in",
    },
  );
  let sf: TieInResult["sf"];
  if (t.shearFriction && rebar) {
    const Avf = (Ase * 12) / t.spacing;
    const mu = t.shearFriction.roughened ? 1.0 : 0.6;
    const fy = Math.min(t.anchor.fya, 60000);
    const Ac = t.shearFriction.Ac;
    const fc = t.existing.fc;
    const limit = t.shearFriction.roughened
      ? Math.min(0.2 * fc * Ac, (480 + 0.08 * fc) * Ac, 1600 * Ac)
      : Math.min(0.2 * fc * Ac, 800 * Ac);
    const phiVn = 0.75 * Math.min(mu * Avf * fy, limit);
    const ratio = t.shearFriction.Vu / phiVn;
    sf = { Avf, mu, phiVn, limit, Vu: t.shearFriction.Vu, ratio };
    checks.push({
      name: `Shear friction across the joint, μ = ${mu} (ACI 318 22.9)`,
      demand: t.shearFriction.Vu,
      capacity: phiVn,
      ratio,
      pass: ratio <= 1,
      combo: t.demand.source || "entered",
      CD: 1,
      unit: "plf",
    });
    checks.push({
      name: "Dowel develops f_y on both sides of the joint: bond N_a ≥ A_s f_y (ACI 318 22.9, 25.4)",
      category: "detailing",
      demand: Ase * fy,
      capacity: row.Na,
      ratio: (Ase * fy) / row.Na,
      pass: row.Na >= Ase * fy,
      combo: "—",
      CD: 1,
      unit: "lb",
    });
  }
  const assumptions: AssumptionEntry[] = [
    fromDefault(
      "Existing concrete",
      `f'c = ${fmt(t.existing.fc, 0)} psi, ${t.existing.cracked ? "cracked" : "uncracked"}`,
      t.existing.verified ? "field verified / record drawings" : "assumed — field verify (cores or record drawings)",
      !t.existing.verified,
    ),
    fromDefault(
      "Adhesive",
      `${t.product.name}: τ_cr = ${fmt(t.product.tauCr, 0)} psi, τ_uncr = ${fmt(t.product.tauUncr, 0)} psi, k_c = ${fmt(t.product.kcCr, 0)} / ${fmt(t.product.kcUncr, 0)}, φ = ${fmt(t.product.phiBond, 2)} (bond) / ${fmt(t.product.phiConcrete, 2)} (concrete)`,
      t.product.report,
      !t.product.verified,
    ),
    fromDefault(
      "Dowel steel",
      `${t.anchor.steelLabel}: f_ya = ${fmt(t.anchor.fya, 0)} psi, f_uta = ${fmt(t.anchor.futa, 0)} psi`,
      rebar ? "ASTM A615 / A706" : "ASTM",
    ),
  ];
  const flags = [
    `Install ${label}s per ${t.product.report}: drill, clean (blow–brush–blow) and inject per the manufacturer's instructions; special inspection per IBC 1705.1.1 and the ICC-ES report`,
  ];
  if (t.seismic)
    flags.push("Seismic (SDC C–F): adhesive must be qualified for seismic tension and shear in its ICC-ES report");
  return {
    id: t.id,
    mark: t.mark,
    kind: "tieIn",
    title: "Tie-in to existing concrete",
    callout: `${label}s @ ${fmt(t.spacing, 0)} in. o.c., ${fmt(t.hef, 1)} in. embedment in adhesive (${t.product.name})`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: [],
    assumptions,
    flags,
    input: t,
    d,
    Ase,
    row,
    perAnchor: { Nua, Vua },
    perFoot: { phiNn: row.phiNn / k, phiVn: row.phiVn / k },
    inter,
    sf,
  };
}
