/**
 * FJ-# — sawn-lumber floor joists (also decks and attic floors): repetitive
 * members at a spacing, simple or continuous, with optional cantilevers.
 * Area loads become line loads by the joist spacing; walls or posts above
 * enter as line / point loads. Design per NDS through the wood beam engine.
 */

import { memberLength, type BeamLoad } from "../analysis/beam";
import { fmt } from "../core/fmt";
import { loadVector, LOAD_TYPES, type LoadVector } from "../core/loads";
import { designWoodBeam, governingCheck, resolveWood, type WoodBeamInput, type WoodBeamResult } from "../design/wood";
import { plyConnection, type PlyConnectionInput } from "../design/plies";
import { firstPassing, maxPassing, maxPassingSpacing } from "../design/sizing";
import type { Grade, Species } from "../data/sawn";
import { vibrationCheck } from "../loads/vibration";
import { openingChecks, type MemberOpening } from "../design/openings";
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
  asce7Of,
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
  /** floor vibration check (serviceability guidance, f ≥ 15 Hz) */
  vibration?: boolean;
  /** notches and bored holes */
  openings?: MemberOpening[];
  /** existing joist sistered full length with a new joist bearing at both supports */
  sister?: { species: Species; grade: Grade; size: string; connection?: PlyConnectionInput };
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
  const ex = extraToBeamLoads(j.extra, total, ctx);
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
    asce7: asce7Of(ctx),
  };
}

function scaleReaction(r: MemberReaction, f: number): MemberReaction {
  if (f === 1) return r;
  const sc = (v: LoadVector) => loadVector(Object.fromEntries(LOAD_TYPES.map((t) => [t, v[t] * f])));
  return {
    ...r,
    byType: sc(r.byType),
    perFoot: r.perFoot && sc(r.perFoot),
    maxDown: r.maxDown * f,
    minNet: r.minNet * f,
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

const scaleLoads = (loads: BeamLoad[], f: number): BeamLoad[] =>
  loads.map((l) => ({
    ...l,
    w1: l.w1 === undefined ? undefined : l.w1 * f,
    w2: l.w2 === undefined ? undefined : l.w2 * f,
    P: l.P === undefined ? undefined : l.P * f,
  }));

export function designJoist(ctx: DesignContext, j: JoistInput): JoistResult {
  const b = buildLoads(ctx, j);
  let design = designWoodBeam(toWoodInput(ctx, j, b.loads));
  const flags: string[] = [];
  /** existing member's share of the load (1 without a sister) */
  let share = 1;
  const sisterLines: string[] = [];
  if (j.sister) {
    const sm = resolveWood({ kind: "sawn", ...j.sister, plies: 1 }, ndsOf(ctx));
    const EIe = design.mat.E * design.mat.I;
    const EIs = sm.E * sm.I;
    share = EIe / (EIe + EIs);
    design = designWoodBeam(toWoodInput(ctx, j, scaleLoads(b.loads, share)));
    const sd = designWoodBeam({
      ...toWoodInput(ctx, j, scaleLoads(b.loads, 1 - share)),
      material: { kind: "sawn", ...j.sister, plies: 1 },
    });
    sisterLines.push(
      `Load shared by stiffness: existing EI = ${EIe.toExponential(3)}, sister ${j.sister.size} ${j.sister.species} ${j.sister.grade} EI = ${EIs.toExponential(3)} lb·in²; existing ${fmt(share * 100, 1)} %, sister ${fmt((1 - share) * 100, 1)} % (equal deflection)`,
    );
    const pre = (who: string, cs: typeof design.checks) => cs.map((c) => ({ ...c, name: `${who} — ${c.name}` }));
    design.checks = [...pre("Existing joist", design.checks), ...pre(`Sister ${j.sister.size}`, sd.checks)];
    if (j.sister.connection) {
      const pc = plyConnection(
        design,
        { ...design.mat, plies: 2, bPly: Math.min(design.mat.bPly, sm.bPly) },
        j.sister.connection,
        (1 - share) / share,
      );
      design.checks.push(...pc.checks);
      sisterLines.push(`Sister fastening: ${pc.callout}; ${pc.lines.join("; ")}`);
    } else
      sisterLines.push(
        "Sister fastening not designed — enter the connection (load applied to the existing joist only)",
      );
    flags.push(
      `Sister ${j.sister.size} ${j.sister.species} ${j.sister.grade} full length, tight to the subfloor, bearing at both supports; existing joist free of decay, splits and notches — field verify`,
    );
  }
  if (j.spacing > 24) flags.push("Spacing exceeds 24 in.: repetitive-member factor not applied (NDS 4.3.9)");
  const assumptions = [...loadAssumptions(b.dead, b.live), ...design.assumptions];
  if (!j.addSelfWeight)
    assumptions.push({
      item: "Self weight",
      value: "Joist weight included in the dead-load assembly framing allowance",
      provenance: { kind: "default", source: "loads sheet" },
    });

  if (j.vibration) {
    const v = vibrationCheck((design.mat.E * design.mat.I) / share, b.wDead, Math.max(...j.spans));
    if (v) {
      design.checks.push(v.check);
      assumptions.push({
        item: "Floor vibration",
        value: v.expr,
        provenance: { kind: "default", source: "Dolan et al. (1999) — guidance; not an IBC / NDS requirement" },
      });
    }
  }

  if (j.openings?.length) {
    const op = openingChecks(design, j.openings);
    design.checks.push(...op.checks);
    for (const l of op.lines)
      assumptions.push({
        item: "Notches and holes",
        value: l,
        provenance: { kind: "default", source: "NDS 4.4.3; IRC R502.8.1" },
      });
  }

  for (const l of sisterLines)
    assumptions.push({
      item: "Sistered joist",
      value: l,
      provenance: { kind: "default", source: "equal deflection (EI)" },
    });

  let alternatives: JoistResult["alternatives"];
  if (!design.pass && !j.sister) {
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
    callout: `${j.size} ${j.species} ${j.grade} @ ${fmt(j.spacing, j.spacing % 1 ? 1 : 0)} in. o.c.${j.sister ? ` + sister ${j.sister.size} ${j.sister.species} ${j.sister.grade}` : ""}`,
    pass: design.checks.every((c) => c.pass),
    governing: governingCheck(design.checks),
    checks: design.checks,
    // linear analysis: the whole joist's reactions are the existing member's share / share
    reactions: reactionsFrom(design, j.spacing).map((r) => scaleReaction(r, 1 / share)),
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
