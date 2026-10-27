/**
 * SSW-# — prefabricated shear panels and portal frames (Strong-Wall, Hardy Frame, Strong-Frame,
 * APA portal frames) in a wall line. Capacities are the manufacturer's / APA tabulated
 * allowable (ASD) values entered in the project hardware list (kind "panel") — never assumed.
 *
 *  - Demand: the member's share of its wall line (capacity-proportional, as for shear walls),
 *    divided equally between `count` identical panels
 *  - In-plane shear: 0.7 E_h ≤ V_s,allow; 0.6 W ≤ V_w,allow (per panel)
 *  - Height: panel height matches the wall height within 3 in.
 *  - Drift: linear from the tabulated drift at the allowable seismic load (which corresponds to
 *    the strength-level force V_s,allow / 0.7): δ_xe = δ_tab × Q_E,panel / (V_s,allow / 0.7);
 *    δ_x = C_d δ_xe / I_e ≤ Δ_a (ASCE 7 Eq. 12.8-15, Table 12.12-1)
 *  - Anchorage: overturning T = V h / b per panel (ASD) ≤ tabulated anchor tension when entered;
 *    otherwise the anchorage is listed for the manufacturer's foundation detail (flagged)
 */

import { fmt, fmtFtIn } from "../core/fmt";
import { fromDefault, type AssumptionEntry } from "../core/provenance";
import { governingCheck, type Check } from "../design/wood";
import type { HardwareItem } from "../data/hardware";
import type { DesignContext } from "./common";
import type { ShearWallDemand } from "./shearWall";
import type { MemberResultBase } from "./types";

export interface ShearPanelInput {
  id: string;
  mark: string;
  description: string;
  lineId: string;
  /** start position along the wall line, ft */
  x?: number;
  /** hardware-list item (kind "panel") */
  panelId: string;
  /** identical panels side by side at this mark */
  count: number;
  /** wall (plate) height, ft */
  h: number;
}

export interface ShearPanelResult extends MemberResultBase {
  kind: "shearPanel";
  input: ShearPanelInput;
  item: HardwareItem;
  demand: ShearWallDemand;
  /** per panel, ASD */
  Vs: number;
  Vw: number;
  /** overturning per panel end, ASD, lb */
  Tmax: { seismic: number; wind: number };
  drift: { dxe: number; dx: number; allow: number; ratio: number };
}

/** Capacity weight for sharing a wall line: allowable seismic shear of the panels, lb. */
export const shearPanelWeight = (s: Pick<ShearPanelInput, "count">, item?: HardwareItem) =>
  (item?.panel?.Vs ?? 0) * s.count;

export function designShearPanel(ctx: DesignContext, s: ShearPanelInput, dem: ShearWallDemand): ShearPanelResult {
  const item = ctx.hardware?.find((x) => x.id === s.panelId);
  if (!item) throw new Error(`Panel ${s.panelId} is not in the project hardware list`);
  const pn = item.panel;
  if (item.kind !== "panel" || !pn) throw new Error(`${item.model}: not a shear panel / portal frame item`);
  if (!(pn.Vs > 0) || !(pn.Vw > 0) || !(pn.width > 0) || !(pn.height > 0))
    throw new Error(
      `${item.model}: enter width, height and the allowable seismic and wind shears in the hardware list`,
    );
  if (!(s.count >= 1)) throw new Error("Enter the number of panels");
  const b = pn.width / 12;
  const n = s.count;
  const Vs = (0.7 * dem.Eh) / n;
  const Vw = (0.6 * dem.W) / n;
  const checks: Check[] = [];
  const assumptions: AssumptionEntry[] = [];
  const flags: string[] = [];
  const push = (
    name: string,
    demand: number,
    capacity: number,
    combo: string,
    unit: string,
    category?: Check["category"],
  ) =>
    checks.push({
      name,
      category,
      demand,
      capacity,
      ratio: demand / capacity,
      pass: demand <= capacity + 1e-9,
      combo,
      CD: 1.6,
      unit,
    });
  push(`In-plane shear, seismic — ${item.model} (tabulated allowable)`, Vs, pn.Vs, "0.7E", "lb");
  push(`In-plane shear, wind — ${item.model} (tabulated allowable)`, Vw, pn.Vw, "0.6W", "lb");
  const dh = Math.abs(pn.height / 12 - s.h);
  checks.push({
    name: `Panel height ${fmtFtIn(pn.height / 12)} matches the wall height ${fmtFtIn(s.h)}`,
    category: "detailing",
    demand: dh,
    capacity: 0.25,
    ratio: dh / 0.25,
    pass: dh <= 0.25,
    combo: "—",
    CD: 1,
    unit: "ft",
  });
  // drift: tabulated drift at V_s,allow (ASD) ≙ strength force V_s,allow / 0.7
  const QEp = dem.QE / n;
  let dxe = 0;
  if (pn.drift !== undefined && pn.drift > 0) {
    dxe = (pn.drift * QEp) / (pn.Vs / 0.7);
    const dx = (dem.Cd * dxe) / dem.Ie;
    const allow = dem.driftFactor * dem.hsx * 12;
    checks.push({
      name: "Seismic drift δ_x = C_d δ_xe / I_e (ASCE 7 Eq. 12.8-15, Table 12.12-1)",
      category: "serviceability",
      demand: dx,
      capacity: allow,
      ratio: dx / allow,
      pass: dx <= allow,
      combo: "Q_E",
      CD: 1,
      unit: "in",
    });
  } else flags.push(`${item.model}: tabulated drift not entered — drift not checked`);
  const Ts = (Vs * s.h) / b;
  const Tw = (Vw * s.h) / b;
  if (pn.anchorT !== undefined && pn.anchorT > 0)
    push(
      "Anchorage tension T = V h / b (tabulated allowable)",
      Math.max(Ts, Tw),
      pn.anchorT,
      Ts >= Tw ? "0.7E" : "0.6W",
      "lb",
    );
  else
    flags.push(
      `${item.model}: anchorage per the manufacturer's foundation detail for V = ${fmt(Math.max(Vs, Vw), 0)} lb, T ≈ ${fmt(Math.max(Ts, Tw), 0)} lb (ASD) per panel`,
    );
  assumptions.push(
    fromDefault(
      "Panel capacities",
      `${item.manufacturer} ${item.model}: V_s = ${fmt(pn.Vs, 0)} lb, V_w = ${fmt(pn.Vw, 0)} lb${pn.drift ? `, drift ${fmt(pn.drift, 3)} in. at V_s` : ""}${pn.anchorT ? `, anchor tension ${fmt(pn.anchorT, 0)} lb` : ""}`,
      item.source || item.report,
      !item.checked,
    ),
    fromDefault(
      "Drift",
      "Linear between zero and the tabulated drift at the allowable seismic load (that load taken as V_s / 0.7 at strength level)",
      "manufacturer table",
    ),
  );
  flags.push(
    `Install ${item.model} per ${item.report || "the manufacturer's evaluation report"}: anchorage, top connection to the beam / collector and the foundation detail as tabulated`,
    "Prefabricated panels in a line with wood structural panel walls share the line force by capacity here — confirm the compatibility of stiffness with the manufacturer (SDPWS 4.3.3.4.1)",
  );
  return {
    id: s.id,
    mark: s.mark,
    kind: "shearPanel",
    title: pn.type === "portal" ? "Portal frame" : "Prefabricated shear panel",
    callout: `${n > 1 ? `(${n}) ` : ""}${item.manufacturer} ${item.model}, ${fmtFtIn(b)} × ${fmtFtIn(pn.height / 12)}`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions: [],
    loadLines: [
      {
        type: "E",
        label: `Seismic — ${dem.lineName} share ${fmt(dem.share * 100, 1)} % (E_h = ρ Q_E)`,
        expr: `${fmt(dem.rho, 2)} × ${fmt(dem.QE, 0)} lb, ${n} panel(s)`,
        value: dem.Eh,
        unit: "lb",
      },
      {
        type: "W",
        label: `Wind — ${dem.lineName} share ${fmt(dem.share * 100, 1)} %`,
        expr: `${n} panel(s)`,
        value: dem.W,
        unit: "lb",
      },
    ],
    assumptions,
    flags,
    input: s,
    item,
    demand: dem,
    Vs,
    Vw,
    Tmax: { seismic: Ts, wind: Tw },
    drift: {
      dxe,
      dx: (dem.Cd * dxe) / dem.Ie,
      allow: dem.driftFactor * dem.hsx * 12,
      ratio: (dem.Cd * dxe) / dem.Ie / (dem.driftFactor * dem.hsx * 12),
    },
  };
}
