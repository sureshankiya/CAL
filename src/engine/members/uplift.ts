/**
 * UP-# — wind uplift load path from the roof to the foundation (ASD,
 * 0.6D + 0.6W, ASCE 7 §2.4.1 (7)). The uplift per foot comes from the net
 * reaction of a roof member (rafter, truss, ceiling joist; wind entered as
 * negative) and is followed down a chain of connections; at each level the dead
 * load above that level (member reaction plus the walls and floors entered for
 * each level) resists:
 *
 *   q_net,i = 0.6 (D_src + Σ_{j ≤ i} D_j) + 0.6 W_src   (plf, negative = uplift)
 *   force per connector = −q_net,i × s_i / 12
 *
 * Capacity per connector from the hardware list (tie: uplift; strap / hold-down:
 * tension) or an entered allowable with its source (e.g. anchor bolt with plate
 * washer, VERIFY).
 */

import { fmt } from "../core/fmt";
import { LOAD_TYPES, type LoadVector } from "../core/loads";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { governingCheck, type Check } from "../design/wood";
import type { DesignContext, LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface UpliftLevel {
  label: string;
  /** dead load added between the previous connection and this one, plf (e.g. wall self weight) */
  deadAbove: number;
  connector:
    { type: "hardware"; hardwareId: string } | { type: "entered"; capacity: number; source: string; model: string };
  /** connector spacing, in */
  spacing: number;
}

export interface UpliftInput {
  id: string;
  mark: string;
  description: string;
  sourceMark: string;
  /** source reaction per foot by type (plf) */
  perFoot: LoadVector;
  levels: UpliftLevel[];
}

export interface UpliftRow {
  label: string;
  D: number;
  qNet: number;
  F: number;
  capacity: number;
  model: string;
  ratio: number;
  spacing: number;
}

export interface UpliftResult extends MemberResultBase {
  kind: "uplift";
  input: UpliftInput;
  rows: UpliftRow[];
  W: number;
  Dsrc: number;
}

export function designUplift(ctx: DesignContext, u: UpliftInput): UpliftResult {
  if (!u.levels.length) throw new Error("Uplift path: add at least one connection level");
  const W = u.perFoot.W;
  const Dsrc = u.perFoot.D;
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];
  if (W >= 0) flags.push("Source reaction has no wind uplift — the path is checked for zero uplift");
  let D = Dsrc;
  const rows: UpliftRow[] = u.levels.map((lv) => {
    D += lv.deadAbove;
    const qNet = 0.6 * D + 0.6 * W;
    const F = Math.max(0, (-qNet * lv.spacing) / 12);
    let capacity: number;
    let model: string;
    if (lv.connector.type === "hardware") {
      const id = lv.connector.hardwareId;
      const item = ctx.hardware?.find((x) => x.id === id);
      if (!item) throw new Error(`${lv.label}: connector not in the hardware list`);
      const cap = item.kind === "tie" || item.kind === "angle" ? item.uplift : (item.tension ?? item.uplift);
      if (cap === undefined) throw new Error(`${item.model}: uplift / tension allowable not entered`);
      capacity = cap;
      model = item.model;
      if (!item.checked)
        assumptions.push(fromDefault(`${item.model} capacity`, `${fmt(cap, 0)} lb`, item.source, true));
    } else {
      capacity = lv.connector.capacity;
      model = lv.connector.model;
      assumptions.push(fromDefault(`${model} capacity`, `${fmt(capacity, 0)} lb`, lv.connector.source, true));
    }
    return { label: lv.label, D, qNet, F, capacity, model, ratio: F / capacity, spacing: lv.spacing };
  });
  const checks: Check[] = rows.map((r) => ({
    name: `${r.label}: ${r.model} @ ${fmt(r.spacing, 0)} in. o.c.`,
    demand: r.F,
    capacity: r.capacity,
    ratio: r.ratio,
    pass: r.F <= r.capacity,
    combo: "0.6D + 0.6W",
    CD: 1.6,
    unit: "lb",
  }));
  const lines: LoadLine[] = LOAD_TYPES.filter((t) => Math.abs(u.perFoot[t]) > 1e-9).map((t) => ({
    type: t,
    label: `${u.sourceMark} reaction per foot`,
    expr: "from the load path",
    value: u.perFoot[t],
    unit: "plf" as const,
  }));
  for (const lv of u.levels)
    if (lv.deadAbove)
      lines.push({
        type: "D",
        label: `Dead load above ${lv.label.toLowerCase()}`,
        expr: "entered",
        value: lv.deadAbove,
        unit: "plf",
      });
  return {
    id: u.id,
    mark: u.mark,
    kind: "uplift",
    title: "Wind uplift load path",
    callout: rows.map((r) => r.model).join(" → "),
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: lines,
    assumptions,
    flags,
    input: u,
    rows,
    W,
    Dsrc,
  };
}
