/**
 * B-# / H-# / RB-# — beams, headers and ridge beams in sawn lumber, built-up
 * plies, glulam or SCL (incl. multi-ply LVL). Loads are assembled from
 * tributary widths of dead-load assemblies, floor live, roof live (with the
 * ASCE 7 §4.8.2 reduction on the beam's tributary area when enabled), snow,
 * walls above and point / line loads — including reactions carried from other
 * members (load-path links). Design per NDS through the wood beam engine.
 */

import { memberLength, type BeamLoad } from "../analysis/beam";
import { fmt, fmtInFraction } from "../core/fmt";
import { designWoodBeam, type WoodBeamInput, type WoodBeamResult, type WoodMaterial } from "../design/wood";
import { firstPassing } from "../design/sizing";
import { GLULAM_WIDTHS, PSL_WIDTHS, SCL_DEPTHS, SCL_PLY_WIDTH, sawnSection } from "../data/sections";
import { assemblyDesignValue } from "../loads/dead";
import {
  extraToBeamLoads,
  ndsOf,
  resolveDead,
  resolveDeflection,
  resolveLive,
  resolveRoofLive,
  resolveSnow,
  type DeadRef,
  type DeflectionInput,
  type DesignContext,
  type ExtraLoad,
  type LiveRef,
  type LoadLine,
} from "./common";
import { reactionsFrom } from "./joist";
import type { MemberResultBase } from "./types";

export type BeamRole = "beam" | "header" | "ridge" | "flush" | "dropped";

export const ROLE_TITLE: Record<BeamRole, string> = {
  beam: "Beam",
  header: "Header",
  ridge: "Ridge beam",
  flush: "Flush beam",
  dropped: "Dropped beam",
};

export interface AreaLoad {
  label: string;
  /** tributary width perpendicular to the beam, ft */
  trib: number;
  dead?: DeadRef;
  /** floor live use (L); a roof use is treated as roof live */
  live?: LiveRef;
  roofLive?: boolean;
  snow?: boolean;
  /** roof pitch (rise / 12) for sloped dead loads, the Lr reduction factor R2 and snow C_s */
  rise?: number;
  /** extent along the beam, ft (default full length) */
  x1?: number;
  x2?: number;
}

export interface WallAbove {
  label: string;
  dead: DeadRef;
  /** wall height, ft */
  height: number;
  x1?: number;
  x2?: number;
}

export interface BeamInput {
  id: string;
  mark: string;
  description: string;
  role: BeamRole;
  material: WoodMaterial;
  spans: number[];
  leftCantilever?: number;
  rightCantilever?: number;
  area: AreaLoad[];
  walls: WallAbove[];
  extra: ExtraLoad[];
  bearing: number[];
  /** unbraced length of the top / bottom edge, ft (0 = continuously braced) */
  luTop: number;
  luBottom: number;
  deflection: DeflectionInput;
  Kcr?: number;
  selfWeight: boolean;
  wetService?: boolean;
  incised?: boolean;
  crOverride?: number;
}

export interface BeamResult extends MemberResultBase {
  kind: "beam";
  input: BeamInput;
  design: WoodBeamResult;
}

export function materialCallout(m: WoodMaterial): string {
  if (m.kind === "sawn") return `${m.plies > 1 ? `(${m.plies}) ` : ""}${m.size} ${m.species} ${m.grade}`;
  if (m.kind === "glulam") return `${fmtInFraction(m.b)} × ${fmtInFraction(m.d)} GLB ${m.combo}`;
  return `${m.plies > 1 ? `(${m.plies}) ` : ""}${fmtInFraction(m.plyWidth)} × ${fmtInFraction(m.d)} ${m.product}`;
}

function build(ctx: DesignContext, b: BeamInput) {
  const total = memberLength({ spans: b.spans, leftCantilever: b.leftCantilever, rightCantilever: b.rightCantilever });
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  for (const a of b.area) {
    const x1 = a.x1 ?? 0;
    const x2 = a.x2 ?? total;
    const len = x2 - x1;
    const rise = a.rise ?? 0;
    const cos = Math.cos(Math.atan(rise / 12));
    const where = x1 > 0 || x2 < total ? ` (${fmt(x1, 2)}–${fmt(x2, 2)} ft)` : "";
    if (a.dead) {
      const d = resolveDead(ctx, a.dead, rise > 0 ? "sloped" : "horizontal");
      const sloped = d.basis === "sloped" && rise > 0;
      const w = (d.psf * a.trib) / (sloped ? cos : 1);
      if (w) {
        loads.push({ type: "D", kind: "udl", x1, x2, w1: w, label: a.label });
        lines.push({
          type: "D",
          label: `${a.label} — dead, ${d.label}${where}`,
          expr: `${fmt(d.psf, 2)} psf × ${fmt(a.trib, 2)} ft${sloped ? ` / cos(${fmt((Math.atan(rise / 12) * 180) / Math.PI, 2)}°)` : ""}`,
          value: w,
          unit: "plf",
          ref: d.ref,
        });
      }
    }
    const lv = a.live ? resolveLive(ctx, a.live) : undefined;
    if (lv && lv.psf && !lv.roof) {
      const w = lv.psf * a.trib;
      loads.push({ type: "L", kind: "udl", x1, x2, w1: w, label: a.label });
      lines.push({
        type: "L",
        label: `${a.label} — live, ${lv.label}${where}`,
        expr: `${fmt(lv.psf, 2)} psf × ${fmt(a.trib, 2)} ft`,
        value: w,
        unit: "plf",
        ref: lv.ref,
        verify: lv.override,
      });
    }
    if (a.roofLive || lv?.roof) {
      const lr = resolveRoofLive(ctx, a.trib * len, rise);
      const w = lr.psf * a.trib;
      loads.push({ type: "Lr", kind: "udl", x1, x2, w1: w, label: a.label });
      lines.push({
        type: "Lr",
        label: `${a.label} — roof live, ${lr.expr}${where}`,
        expr: `${fmt(lr.psf, 2)} psf × ${fmt(a.trib, 2)} ft`,
        value: w,
        unit: "plf",
        ref: lr.ref,
      });
    }
    if (a.snow && ctx.snow.pg > 0) {
      const sn = resolveSnow(ctx, rise, a.trib, false);
      const psf = Math.max(sn.balanced, sn.pmApplies ? sn.pm : 0);
      const w = psf * a.trib;
      if (w) {
        loads.push({ type: "S", kind: "udl", x1, x2, w1: w, label: a.label });
        lines.push({
          type: "S",
          label: `${a.label} — snow${where}`,
          expr: `${fmt(psf, 2)} psf × ${fmt(a.trib, 2)} ft`,
          value: w,
          unit: "plf",
          ref: sn.refs.ps,
        });
      }
    }
  }
  for (const wl of b.walls) {
    const d = resolveDead(ctx, wl.dead);
    const x1 = wl.x1 ?? 0;
    const x2 = wl.x2 ?? total;
    const w = d.psf * wl.height;
    loads.push({ type: "D", kind: "udl", x1, x2, w1: w, label: wl.label });
    lines.push({
      type: "D",
      label: `${wl.label} — wall dead, ${d.label}`,
      expr: `${fmt(d.psf, 2)} psf × ${fmt(wl.height, 2)} ft`,
      value: w,
      unit: "plf",
      ref: d.ref,
    });
  }
  const ex = extraToBeamLoads(b.extra, total);
  loads.push(...ex.loads);
  lines.push(...ex.lines);
  return { total, loads, lines };
}

function woodInput(ctx: DesignContext, b: BeamInput, loads: BeamLoad[], material = b.material): WoodBeamInput {
  const lim = resolveDeflection(b.deflection);
  return {
    material,
    geometry: { spans: b.spans, leftCantilever: b.leftCantilever, rightCantilever: b.rightCantilever },
    loads,
    includeSelfWeight: b.selfWeight,
    conditions: { wetService: !!b.wetService, incised: !!b.incised, repetitive: false, flatUse: false },
    lu: { top: b.luTop, bottom: b.luBottom },
    bearingLengths: b.bearing,
    defl: { live: lim.live, total: lim.total },
    Kcr: b.Kcr ?? ctx.Kcr,
    crOverride: b.crOverride,
    SDS: ctx.SDS,
    nds: ndsOf(ctx),
  };
}

/** Candidate sections of the same material family, lightest first, for the FAIL alternative. */
export function candidateMaterials(m: WoodMaterial): WoodMaterial[] {
  const out: WoodMaterial[] = [];
  if (m.kind === "sawn") {
    const sizes = ["4x6", "4x8", "4x10", "4x12", "4x14", "6x8", "6x10", "6x12", "6x14", "8x10", "8x12"];
    for (const size of sizes) out.push({ ...m, size, plies: 1 });
    for (const plies of [2, 3, 4]) for (const size of ["2x8", "2x10", "2x12"]) out.push({ ...m, size, plies });
    const area = (x: WoodMaterial) =>
      x.kind === "sawn" ? sawnSection(x.size, x.plies).b * sawnSection(x.size, x.plies).d : 0;
    return out
      .filter((x) => !(x.kind === "sawn" && x.size === m.size && x.plies === m.plies))
      .sort((a, b) => area(a) - area(b));
  }
  if (m.kind === "scl") {
    const widths = m.product.startsWith("PSL")
      ? PSL_WIDTHS.map((w) => ({ plies: 1, plyWidth: w }))
      : [1, 2, 3, 4].map((p) => ({ plies: p, plyWidth: SCL_PLY_WIDTH }));
    for (const w of widths) for (const d of SCL_DEPTHS) out.push({ ...m, plies: w.plies, plyWidth: w.plyWidth, d });
    const area = (x: WoodMaterial) => (x.kind === "scl" ? x.plies * x.plyWidth * x.d : 0);
    return out
      .filter((x) => !(x.kind === "scl" && x.plies === m.plies && x.d === m.d && x.plyWidth === m.plyWidth))
      .sort((a, b) => area(a) - area(b));
  }
  for (const b of GLULAM_WIDTHS) for (let n = 4; n <= 16; n++) out.push({ ...m, b, d: n * 1.5 });
  const area = (x: WoodMaterial) => (x.kind === "glulam" ? x.b * x.d : 0);
  return out.filter((x) => !(x.kind === "glulam" && x.b === m.b && x.d === m.d)).sort((a, b) => area(a) - area(b));
}

export function designBeam(ctx: DesignContext, b: BeamInput): BeamResult {
  const built = build(ctx, b);
  const design = designWoodBeam(woodInput(ctx, b, built.loads));
  const flags: string[] = [];
  if (b.material.kind === "sawn" && b.material.plies > 1)
    flags.push("Built-up plies fastened per the multi-ply connection schedule (Phase 2 check)");
  if (b.material.kind === "scl") flags.push("SCL design values per manufacturer ESR — VERIFY");
  if (
    b.area.some(
      (a) =>
        a.dead?.assemblyId &&
        ctx.assemblies.find((x) => x.id === a.dead!.assemblyId) &&
        assemblyDesignValue(ctx.assemblies.find((x) => x.id === a.dead!.assemblyId)!) === 0,
    )
  )
    flags.push("Assembly with zero dead load referenced");
  let alternatives: BeamResult["alternatives"];
  if (!design.pass) {
    const found = firstPassing(candidateMaterials(b.material), (m) =>
      designWoodBeam(woodInput(ctx, b, built.loads, m)),
    );
    alternatives = { lightest: found.chosen ? materialCallout(found.chosen.candidate) : undefined };
  }
  return {
    id: b.id,
    mark: b.mark,
    kind: "beam",
    title: ROLE_TITLE[b.role],
    callout: materialCallout(b.material),
    pass: design.pass,
    governing: design.governing,
    checks: design.checks,
    reactions: reactionsFrom(design),
    loadLines: built.lines,
    assumptions: design.assumptions,
    flags,
    alternatives,
    input: b,
    design,
  };
}
