/**
 * ST-# — shear transfer connections along a wall line or shear wall (ASD):
 * diaphragm blocking / rim to the top plate, sole plate to the floor framing
 * below, rim to sill. Demand is the unit shear of the source (shear wall unit
 * shear, or the wall-line force over the line length); capacity per fastener
 * from the hardware list (F1 / F2, catalogue allowable at C_D = 1.6) or by the
 * nail yield limit equations (NDS 12.3, C_D = 1.6, toe-nail C_tn = 0.83 per
 * NDS 12.5.4).
 */

import { fmt } from "../core/fmt";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { SPECIFIC_GRAVITY, type Species } from "../data/sawn";
import { nailDef, nailSingleShear } from "../design/dowel";
import { governingCheck, type Check } from "../design/wood";
import type { DesignContext } from "./common";
import type { MemberResultBase } from "./types";

export interface TransferInput {
  id: string;
  mark: string;
  description: string;
  interface: "diaphragm-to-wall" | "sole-plate" | "rim-to-sill" | "other";
  connector:
    | { type: "clip"; hardwareId: string; direction: "F1" | "F2" }
    | { type: "nails"; nail: string; ts: number; tm: number; species: Species; toenail: boolean; rows: number };
  /** provided spacing, in */
  spacing: number;
}

export interface TransferDemand {
  sourceText: string;
  /** ASD unit shears, plf */
  vS: number;
  vW: number;
}

export interface TransferResult extends MemberResultBase {
  kind: "transfer";
  input: TransferInput;
  demand: TransferDemand;
  capacity: number;
  capacityText: string;
  v: number;
  perFastener: number;
  sReq: number;
}

export function designTransfer(ctx: DesignContext, t: TransferInput, dem: TransferDemand): TransferResult {
  const assumptions: AssumptionEntry[] = [];
  let capacity: number;
  let capacityText: string;
  if (t.connector.type === "clip") {
    const c = t.connector;
    const item = ctx.hardware?.find((x) => x.id === c.hardwareId);
    if (!item) throw new Error("Shear transfer: select a clip from the hardware list");
    const v = c.direction === "F1" ? item.F1 : item.F2;
    if (v === undefined) throw new Error(`${item.model}: ${c.direction} allowable not entered in the hardware list`);
    capacity = v;
    capacityText = `${item.model} ${c.direction} = ${fmt(v, 0)} lb (catalogue allowable, C_D = 1.6; ${item.report || item.source})`;
    if (!item.checked) assumptions.push(fromDefault("Clip capacity", capacityText, item.source, true));
  } else {
    const c = t.connector;
    const nail = nailDef(c.nail);
    const G = SPECIFIC_GRAVITY[c.species];
    const z = nailSingleShear({ nail, ts: c.ts, tm: c.tm, Gs: G, Gm: G });
    const Ctn = c.toenail ? 0.83 : 1;
    capacity = z.Z * 1.6 * Ctn * c.rows;
    capacityText = `${c.rows > 1 ? `${c.rows} rows × ` : ""}${nail.label}: Z = ${fmt(z.Z, 0)} lb (mode ${z.mode}) × C_D 1.6${c.toenail ? " × C_tn 0.83" : ""} = ${fmt(capacity, 0)} lb per spacing`;
    if (!z.penetrationOk) throw new Error(`${nail.label}: penetration below 6D into the main member (NDS 12.1.6.2)`);
  }
  const v = Math.max(dem.vS, dem.vW);
  const perFastener = (v * t.spacing) / 12;
  const sReq = (capacity * 12) / Math.max(v, 1e-9);
  const checks: Check[] = [
    {
      name: `Shear transfer @ ${fmt(t.spacing, 0)} in. o.c. (required ≤ ${fmt(sReq, 1)} in.)`,
      demand: perFastener,
      capacity,
      ratio: perFastener / capacity,
      pass: perFastener <= capacity,
      combo: dem.vS >= dem.vW ? "0.7E" : "0.6W",
      CD: 1.6,
      unit: "lb",
    },
  ];
  return {
    id: t.id,
    mark: t.mark,
    kind: "transfer",
    title: "Shear transfer connection",
    callout: `${t.connector.type === "clip" ? (ctx.hardware?.find((x) => x.id === (t.connector as { hardwareId: string }).hardwareId)?.model ?? "clip") : nailDef(t.connector.nail).label} @ ${fmt(t.spacing, 0)} in. o.c.`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: [
      {
        type: "E",
        label: `${dem.sourceText} — seismic unit shear (ASD)`,
        expr: "0.7 E_h / L",
        value: dem.vS,
        unit: "plf",
      },
      { type: "W", label: `${dem.sourceText} — wind unit shear (ASD)`, expr: "0.6 W / L", value: dem.vW, unit: "plf" },
    ],
    assumptions,
    flags: [],
    input: t,
    demand: dem,
    capacity,
    capacityText,
    v,
    perFastener,
    sReq,
  };
}
