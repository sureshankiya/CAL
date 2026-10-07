/**
 * FJ-# — sawn-lumber floor joists (also decks and attic floors): repetitive
 * members at a spacing, simple or continuous, with optional cantilevers.
 * Area loads become line loads by the joist spacing; walls or posts above
 * enter as line / point loads. Design per NDS through the wood beam engine.
 */

import { memberLength, type BeamLoad } from "../analysis/beam";
import { fmt } from "../core/fmt";
import { loadVector, LOAD_TYPES, type LoadVector } from "../core/loads";
import { designWoodBeam, type WoodBeamInput, type WoodBeamResult } from "../design/wood";
import { firstPassing, maxPassing, maxPassingSpacing } from "../design/sizing";
import type { Grade, Species } from "../data/sawn";
import {
  extraToBeamLoads,
  loadAssumptions,
  ndsOf,
  resolveDead,
  resolveDeflection,
  resolveLive,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type ExtraLoad,
  type LiveRef,
  type LoadLine,
} from "./common";
import { supportName, type MemberReaction, type MemberResultBase } from "./types";

export interface JoistInput {
  id: string;
  mark: string;
  description: string;
  species: Species;
  grade: Grade;
  size: string;
  /** joist spacing, in. o.c. */
  spacing: number;
  spans: number[];
  leftCantilever?: number;
  rightCantilever?: number;
  dead: DeadRef;
  live: LiveRef;
  extra: ExtraLoad[];
  /** bearing length at each support, in */
  bearing: number[];
  /** bottom-edge bracing interval for negative moment (bridging / blocking / ceiling), ft; 0 = continuous */
  luBottom: number;
  /** NDS 4.4.1.2 bracing provided (C_L = 1.0) */
  rule441: boolean;
  deflection: DeflectionInput;
  Kcr?: number;
  wetService?: boolean;
  incised?: boolean;
  /** member self weight added to the loads (default: carried by the assembly framing allowance) */
  addSelfWeight?: boolean;
}

export interface JoistResult extends MemberResultBase {
  kind: "joist";
  input: JoistInput;
  design: WoodBeamResult;
  trib: number;
  wDead: number;
  wLive: number;
}

const JOIST_SIZES = ["2x6", "2x8", "2x10", "2x12", "2x14"];

function buildLoads(ctx: DesignContext, j: JoistInput) {
  const total = memberLength({ spans: j.spans, leftCantilever: j.leftCantilever, rightCantilever: j.rightCantilever });
  const trib = j.spacing / 12;
  const dead = resolveDead(ctx, j.dead);
  const live = resolveLive(ctx, j.live);
  const liveType = live.roof ? "Lr" : "L";
  const wDead = dead.psf * trib;
  const wLive = live.psf * trib;
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  if (wDead) {
    loads.push({ type: "D", kind: "udl", x1: 0, x2: total, w1: wDead, label: "Dead" });
    lines.push({
      type: "D",
      label: `Dead — ${dead.label}`,
      expr: `${fmt(dead.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: wDead,
      unit: "plf",
      ref: dead.ref,
    });
  }
  if (wLive) {
    loads.push({ type: liveType, kind: "udl", x1: 0, x2: total, w1: wLive, label: live.label });
    lines.push({
      type: liveType,
      label: `${liveType === "L" ? "Live" : "Roof live"} — ${live.label}`,
      expr: `${fmt(live.psf, 2)} psf × ${fmt(trib, 3)} ft`,
      value: wLive,
      unit: "plf",
      ref: live.ref,
      verify: live.override,
    });
  }
  const ex = extraToBeamLoads(j.extra, total);
  loads.push(...ex.loads);
  lines.push(...ex.lines);
  return { total, trib, dead, live, wDead, wLive, loads, lines };
}

function toWoodInput(ctx: DesignContext, j: JoistInput, loads: BeamLoad[], size = j.size): WoodBeamInput {
  const lim = resolveDeflection(j.deflection);
  return {
    material: { kind: "sawn", species: j.species, grade: j.grade, size, plies: 1 },
    geometry: { spans: j.spans, leftCantilever: j.leftCantilever, rightCantilever: j.rightCantilever },
    loads,
    includeSelfWeight: !!j.addSelfWeight,
    conditions: { wetService: !!j.wetService, incised: !!j.incised, repetitive: j.spacing <= 24, flatUse: false },
    lu: { top: 0, bottom: j.luBottom },
    bearingLengths: j.bearing,
    defl: { live: lim.live, total: lim.total },
    Kcr: j.Kcr ?? ctx.Kcr,
    rule441: j.rule441,
    SDS: ctx.SDS,
    nds: ndsOf(ctx),
  };
}

export function reactionsFrom(design: WoodBeamResult, spacingIn?: number): MemberReaction[] {
  return design.reactions.map((r) => {
    const byType: LoadVector = loadVector({});
    for (const t of LOAD_TYPES) byType[t] = r.maxByType[t];
    const perFoot = spacingIn
      ? loadVector(Object.fromEntries(LOAD_TYPES.map((t) => [t, (byType[t] * 12) / spacingIn])))
      : undefined;
    return {
      support: r.support,
      name: supportName(r.support),
      x: r.x,
      byType,
      perFoot,
      maxDown: r.maxDown,
      maxDownCombo: r.maxDownCombo,
      minNet: r.minNet,
      minNetCombo: r.minNetCombo,
    };
  });
}

export function designJoist(ctx: DesignContext, j: JoistInput): JoistResult {
  const b = buildLoads(ctx, j);
  const design = designWoodBeam(toWoodInput(ctx, j, b.loads));
  const flags: string[] = [];
  if (j.spacing > 24) flags.push("Spacing exceeds 24 in.: repetitive-member factor not applied (NDS 4.3.9)");
  const assumptions = [...loadAssumptions(b.dead, b.live), ...design.assumptions];
  if (!j.addSelfWeight)
    assumptions.push({
      item: "Self weight",
      value: "Joist weight included in the dead-load assembly framing allowance",
      provenance: { kind: "default", source: "loads sheet" },
    });

  let alternatives: JoistResult["alternatives"];
  if (!design.pass) {
    const runSize = (size: string) => designWoodBeam(toWoodInput(ctx, j, b.loads, size));
    const sizes = JOIST_SIZES.filter((s) => s !== j.size);
    const lightest = firstPassing(sizes, runSize).chosen?.candidate;
    const atSpacing = (s: number) => {
      const jj = { ...j, spacing: s };
      return designWoodBeam(toWoodInput(ctx, jj, buildLoads(ctx, jj).loads));
    };
    const maxSpacing = maxPassingSpacing(atSpacing);
    let maxSpan: number | undefined;
    if (j.spans.length === 1 && !j.leftCantilever && !j.rightCantilever && !j.extra.length) {
      const atSpan = (L: number) => {
        const jj = { ...j, spans: [L] };
        return designWoodBeam(toWoodInput(ctx, jj, buildLoads(ctx, jj).loads));
      };
      maxSpan = maxPassing(atSpan, 2, j.spans[0]);
    }
    alternatives = { lightest, maxSpacing, maxSpan };
  }

  return {
    id: j.id,
    mark: j.mark,
    kind: "joist",
    title: "Floor joist",
    callout: `${j.size} ${j.species} ${j.grade} @ ${fmt(j.spacing, j.spacing % 1 ? 1 : 0)} in. o.c.`,
    pass: design.pass,
    governing: design.governing,
    checks: design.checks,
    reactions: reactionsFrom(design, j.spacing),
    loadLines: b.lines,
    assumptions,
    flags,
    alternatives,
    input: j,
    design,
    trib: b.trib,
    wDead: b.wDead,
    wLive: b.wLive,
  };
}
