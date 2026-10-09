/**
 * CN-# — connector hardware at a member support: joist / beam hangers,
 * hurricane ties, post caps and bases, straps. The demand is the supported
 * member's reaction by load type; each ASD combination is checked against the
 * catalogue column for its load-duration factor (downward), and net uplift
 * against the 160 column (corrects JoistCalc's D + L-only hanger check).
 */

import { asdCombinations, combine, loadDurationFactor, relevantCombinations } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault } from "../core/provenance";
import { governingCheck, type Check } from "../design/wood";
import { HARDWARE_KIND_LABEL, downCapacity, hardwareLabel, type HardwareItem } from "../data/hardware";
import { asce7Of, type DesignContext, type LoadLine } from "./common";
import type { MemberResultBase } from "./types";

export interface ConnectorInput {
  id: string;
  mark: string;
  description: string;
  hardwareId: string;
  /** connectors per connection (e.g. 2 ties per rafter) */
  quantity: number;
  /** reaction carried, from the supported member */
  sourceMark: string;
  supportName: string;
  R: LoadVector;
  /** lateral demand on the connector (F1 direction), lb, C_D = 1.6 */
  lateral?: number;
}

export interface ConnectorRow {
  combo: string;
  CD: number;
  R: number;
  capacity: number;
  ratio: number;
  direction: "down" | "uplift";
}

export interface ConnectorResult extends MemberResultBase {
  kind: "connector";
  input: ConnectorInput;
  item: HardwareItem;
  rows: ConnectorRow[];
}

export function designConnector(ctx: DesignContext, c: ConnectorInput): ConnectorResult {
  const item = ctx.hardware?.find((h) => h.id === c.hardwareId);
  if (!item) throw new Error(`Hardware ${c.hardwareId} not in the project hardware list`);
  const n = Math.max(1, c.quantity);
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const t of LOAD_TYPES) if (Math.abs(c.R[t]) > 1e-9) present[t] = true;
  const combos = relevantCombinations(
    asdCombinations({ asce7: asce7Of(ctx), SDS: ctx.SDS, includeWind: !!present.W, includeSeismic: !!present.E }),
    present,
  );
  const rows: ConnectorRow[] = [];
  for (const combo of combos) {
    const R = combine(c.R, combo);
    const CD = loadDurationFactor(combo, present);
    if (R > 1e-6) {
      // ties, straps, angles and hold-downs carry uplift / tension only; gravity by direct bearing
      if (["tie", "strap", "holdown"].includes(item.kind)) continue;
      const cap1 = downCapacity(item, CD);
      if (cap1 === undefined)
        throw new Error(
          `${item.model}: allowable downward load not entered in the hardware list (needed for ${combo.label})`,
        );
      rows.push({ combo: combo.label, CD, R, capacity: cap1 * n, ratio: R / (cap1 * n), direction: "down" });
    } else if (R < -1e-6) {
      const up = item.uplift ?? item.tension;
      if (up === undefined)
        throw new Error(
          `${item.model}: allowable uplift not entered in the hardware list (net uplift ${fmt(-R, 0)} lb, ${combo.label})`,
        );
      const cap1 = up * Math.min(1, CD / 1.6);
      rows.push({ combo: combo.label, CD, R: -R, capacity: cap1 * n, ratio: -R / (cap1 * n), direction: "uplift" });
    }
  }
  const checks: Check[] = [];
  const worst = (dir: "down" | "uplift") =>
    rows
      .filter((r) => r.direction === dir)
      .reduce<ConnectorRow | undefined>((a, b) => (!a || b.ratio > a.ratio ? b : a), undefined);
  const down = worst("down");
  const up = worst("uplift");
  if (down)
    checks.push({
      name: `Downward load — ${item.model} (catalogue ${down.CD === 1.6 ? "160" : down.CD >= 1.25 ? "125" : down.CD >= 1.15 ? "115" : "100"} column)`,
      demand: down.R,
      capacity: down.capacity,
      ratio: down.ratio,
      pass: down.ratio <= 1,
      combo: down.combo,
      CD: down.CD,
      unit: "lb",
    });
  if (up)
    checks.push({
      name: `Uplift — ${item.model} (catalogue 160 column)`,
      demand: up.R,
      capacity: up.capacity,
      ratio: up.ratio,
      pass: up.ratio <= 1,
      combo: up.combo,
      CD: up.CD,
      unit: "lb",
    });
  if (c.lateral && c.lateral > 0) {
    if (item.F1 === undefined) throw new Error(`${item.model}: lateral F1 capacity not entered`);
    const cap = item.F1 * n;
    checks.push({
      name: `Lateral (F1) — ${item.model}`,
      demand: c.lateral,
      capacity: cap,
      ratio: c.lateral / cap,
      pass: c.lateral <= cap,
      combo: "W",
      CD: 1.6,
      unit: "lb",
    });
  }
  if (!checks.length)
    checks.push({
      name: "No net load at the connection",
      demand: 0,
      capacity: 1,
      ratio: 0,
      pass: true,
      combo: "—",
      CD: 1,
      unit: "lb",
    });
  const lines: LoadLine[] = LOAD_TYPES.filter((t) => Math.abs(c.R[t]) > 1e-9).map((t) => ({
    type: t,
    label: `${c.sourceMark} reaction ${c.supportName}`,
    expr: `${fmt(c.R[t], 0)} lb`,
    value: c.R[t],
    unit: "lb" as const,
  }));
  return {
    id: c.id,
    mark: c.mark,
    kind: "connector",
    title: HARDWARE_KIND_LABEL[item.kind],
    callout: `${n > 1 ? `(${n}) ` : ""}${hardwareLabel(item)} at ${c.sourceMark} ${c.supportName}`,
    pass: checks.every((k) => k.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: lines,
    assumptions: [
      fromDefault(
        "Connector capacity",
        `${hardwareLabel(item)} — ${item.report || "report no. not entered"}; DF-L / SP framing; installed with all specified fasteners`,
        item.source,
        !item.checked,
      ),
    ],
    flags: [`Install ${item.model} with ${item.fasteners} per manufacturer`],
    input: c,
    item,
    rows,
  };
}
