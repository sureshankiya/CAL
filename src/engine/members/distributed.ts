/**
 * Distributed loads from tributary areas (dead-load assemblies, floor live,
 * roof live with the ASCE 7 §4.8.2 reduction, snow) and from walls above, as
 * line loads along a member — shared by beams, headers and bearing walls.
 */

import type { BeamLoad } from "../analysis/beam";
import { fmt } from "../core/fmt";
import {
  resolveDead,
  resolveLive,
  resolveRoofLive,
  resolveSnow,
  type DeadRef,
  type DesignContext,
  type LiveRef,
  type LoadLine,
} from "./common";

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

export function areaWallLoads(
  ctx: DesignContext,
  area: AreaLoad[],
  walls: WallAbove[],
  total: number,
): { loads: BeamLoad[]; lines: LoadLine[] } {
  const loads: BeamLoad[] = [];
  const lines: LoadLine[] = [];
  for (const a of area) {
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
  for (const wl of walls) {
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
  return { loads, lines };
}
