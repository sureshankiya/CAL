/**
 * T-# — manufactured wood trusses, imported reactions (deferred submittal).
 * The truss designer's reactions by load type at each bearing (per truss) are
 * entered from the truss design drawings and carried down the load path:
 * typical trusses as line loads (reaction × 12 / spacing), girder trusses as
 * point loads. Uplift is carried as negative wind reaction.
 *
 * HouseCalc checks the bearing of each reaction on the wall plate
 * (NDS 3.10.2, C_b 3.10.4); the truss itself is designed by the manufacturer.
 */

import { asdCombinations, combine, relevantCombinations } from "../core/combos";
import { fmt } from "../core/fmt";
import { LOAD_TYPES, loadVector, type LoadType, type LoadVector } from "../core/loads";
import { fromDefault } from "../core/provenance";
import { bearingAreaFactor, governingCheck, type Check } from "../design/wood";
import { lumberData, type Grade, type Species } from "../data/sawn";
import { ndsOf, type DesignContext, type LoadLine } from "./common";
import type { MemberReaction, MemberResultBase } from "./types";

export interface TrussBearing {
  name: string;
  /** position from the left heel, ft (for the load-path summary) */
  x: number;
  /** reactions per truss by load type, lb (W negative = uplift) */
  D: number;
  L: number;
  Lr: number;
  S: number;
  W: number;
  /** truss bearing width along the plate (truss ply thickness), in */
  width: number;
}

export interface TrussInput {
  id: string;
  mark: string;
  description: string;
  /** truss spacing, in. o.c. (girder trusses: 0) */
  spacing: number;
  girder: boolean;
  plies: number;
  span: number;
  /** truss manufacturer / design drawing reference */
  designRef: string;
  bearings: TrussBearing[];
  plate: { species: Species; grade: Grade; size: string };
}

export interface TrussResult extends MemberResultBase {
  kind: "truss";
  input: TrussInput;
  bearingChecks: Array<{
    name: string;
    R: number;
    combo: string;
    lb: number;
    Cb: number;
    A: number;
    fcperp: number;
    Fprime: number;
    ratio: number;
  }>;
}

export function designTruss(ctx: DesignContext, t: TrussInput): TrussResult {
  if (!t.bearings.length) throw new Error("Enter at least one truss bearing reaction");
  const nds = ndsOf(ctx);
  const plate = lumberData(t.plate.species, t.plate.grade, t.plate.size, nds);
  const plateWidth =
    Number(t.plate.size.split("x")[1]) <= 4 ? 3.5 : Number(t.plate.size.split("x")[1]) === 6 ? 5.5 : 7.25;
  const vec = (b: TrussBearing): LoadVector => loadVector({ D: b.D, L: b.L, Lr: b.Lr, S: b.S, W: b.W });
  const present: Partial<Record<LoadType, boolean>> = { D: true };
  for (const b of t.bearings) for (const k of LOAD_TYPES) if (Math.abs(vec(b)[k]) > 1e-9) present[k] = true;
  const combos = relevantCombinations(asdCombinations({ SDS: ctx.SDS, includeWind: !!present.W }), present);
  const lines: LoadLine[] = [];
  const checks: Check[] = [];
  const bearingChecks: TrussResult["bearingChecks"] = [];
  const reactions: MemberReaction[] = t.bearings.map((b, i) => {
    const v = vec(b);
    for (const k of LOAD_TYPES)
      if (Math.abs(v[k]) > 1e-9)
        lines.push({
          type: k,
          label: `Bearing ${b.name} — truss reaction (truss design drawings)`,
          expr: `${fmt(v[k], 0)} lb per ${t.girder ? "girder" : "truss"}`,
          value: v[k],
          unit: "lb",
        });
    let maxDown = -Infinity;
    let maxDownCombo = "";
    let minNet = Infinity;
    let minNetCombo = "";
    for (const c of combos) {
      const x = combine(v, c);
      if (x > maxDown) {
        maxDown = x;
        maxDownCombo = c.label;
      }
      if (x < minNet) {
        minNet = x;
        minNetCombo = c.label;
      }
    }
    const lb = b.width;
    const Cb = bearingAreaFactor(lb, false);
    const A = lb * plateWidth;
    const fcperp = maxDown / A;
    const Fprime = plate.ref.Fcperp * Cb;
    bearingChecks.push({
      name: b.name,
      R: maxDown,
      combo: maxDownCombo,
      lb,
      Cb,
      A,
      fcperp,
      Fprime,
      ratio: fcperp / Fprime,
    });
    checks.push({
      name: `Bearing ${b.name} on ${t.plate.size} plate (NDS 3.10.2)`,
      demand: fcperp,
      capacity: Fprime,
      ratio: fcperp / Fprime,
      pass: fcperp <= Fprime,
      combo: maxDownCombo,
      CD: 1,
      unit: "psi",
    });
    const perFoot =
      !t.girder && t.spacing > 0
        ? loadVector(Object.fromEntries(LOAD_TYPES.map((k) => [k, (v[k] * 12) / t.spacing])))
        : undefined;
    return { support: i, name: b.name, x: b.x, byType: v, perFoot, maxDown, maxDownCombo, minNet, minNetCombo };
  });
  const flags: string[] = [
    "Trusses designed by the truss manufacturer (deferred submittal); reactions above are taken from the truss design drawings and must be updated when the final truss design is received",
  ];
  if (reactions.some((r) => r.minNet < -1))
    flags.push("Net uplift at truss bearings — tie each truss to the plate; see connector schedule");
  return {
    id: t.id,
    mark: t.mark,
    kind: "truss",
    title: t.girder ? "Girder truss (imported)" : "Roof truss (imported)",
    callout: t.girder
      ? `${t.plies}-ply girder truss, ${fmt(t.span, 2)} ft span`
      : `Trusses @ ${fmt(t.spacing, t.spacing % 1 ? 1 : 0)} in. o.c., ${fmt(t.span, 2)} ft span`,
    pass: checks.every((c) => c.pass),
    governing: governingCheck(checks),
    checks,
    reactions,
    loadLines: lines,
    assumptions: [
      fromDefault(
        "Truss reactions",
        `Entered from ${t.designRef || "the truss design drawings"}`,
        "truss manufacturer",
        !t.designRef,
      ),
      fromDefault(
        "Plate bearing",
        "Truss bearing checked on the top plate only; truss chord bearing by the truss designer",
        "NDS 3.10.2",
      ),
    ],
    flags,
    input: t,
    bearingChecks,
  };
}
