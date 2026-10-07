/**
 * Lateral analysis (LD): seismic and wind story forces for each direction and
 * their distribution to wall lines by tributary width (flexible diaphragm).
 *
 *  - Seismic: ASCE 7 §12.8 ELF with T = Ta; seismic weight per diaphragm from
 *    itemised dead loads; Fx (Eq. 12.8-11); story shear Vx; Eh = ρ Q_E (§12.4.2.1)
 *  - Wind: ASCE 7 Ch. 28 Part 1 envelope procedure, qh at mean roof height;
 *    each diaphragm takes the wall band from mid-height of the story below to
 *    mid-height of the story above (roof: upper half story + roof projection);
 *    Load Case A normal to the ridge, Load Case B parallel to it; §28.3.4 minimum
 *  - Wall lines: V_line = (trib_line / Σ trib) × V_story in the same direction
 * All forces here are strength level; ASD demands are 0.7E and 0.6W.
 */

import { fmt } from "../core/fmt";
import { getCycle, type CycleId } from "../core/codes";
import { assemblyDesignValue, type DeadAssembly } from "../loads/dead";
import {
  IMPORTANCE_SEISMIC,
  seismicCoefficient,
  seismicSystem,
  verticalDistribution,
  type BaseShearResult,
  type SeismicSystem,
  type VerticalDistribution,
} from "../loads/seismic";
import {
  endZoneA,
  mwfrsBandForce,
  velocityPressure,
  type Exposure,
  type VelocityPressure,
  type WindForce,
} from "../loads/wind";

export type Dir = "X" | "Y";

export interface WeightItem {
  label: string;
  kind: "area" | "wall" | "lump";
  /** area: ft² of plan; wall: length, ft */
  qty: number;
  /** wall: tributary height, ft */
  height?: number;
  assemblyId?: string;
  psf?: number;
  /** area items on a sloped roof: assembly psf of roof surface → / cos θ on plan */
  sloped?: boolean;
  /** lump: weight, lb */
  W?: number;
}

export interface Story {
  id: string;
  name: string;
  /** story height, floor to the diaphragm above, ft */
  height: number;
  /** diaphragm weight items at the top of this story */
  items: WeightItem[];
}

export interface WallLine {
  id: string;
  name: string;
  storyId: string;
  dir: Dir;
  /** tributary diaphragm width, ft */
  trib: number;
}

export interface LateralInput {
  enabled: boolean;
  system: "wsp" | "other";
  rho: number;
  TL: number;
  S1?: number;
  /** ASCE 7 Table 12.12-1, structures ≤ 4 stories with systems designed to accommodate drift */
  driftLowRise: boolean;
  /** plan dimensions, ft: Lx along X, Ly along Y */
  Lx: number;
  Ly: number;
  ridge: Dir;
  /** roof pitch, in 12 */
  pitch: number;
  /** roof rise, eave plate to ridge, ft */
  roofRise: number;
  Ke: number;
  stories: Story[];
  lines: WallLine[];
}

export interface Site {
  cycleId: CycleId;
  riskCategory: "I" | "II" | "III" | "IV";
  SDS: number;
  SD1: number;
  V: number;
  exposure: Exposure;
  Kzt: number;
}

export interface StoryForces {
  storyId: string;
  name: string;
  /** level height above base, ft */
  hx: number;
  w: number;
  Fx: number;
  /** seismic story shear, strength (Q_E, without ρ) */
  VE: number;
  /** wind force at the diaphragm and story shear by direction, strength */
  windF: Record<Dir, number>;
  VW: Record<Dir, number>;
  windBands: Record<Dir, WindForce & { wallHeight: number; roofHeight: number; width: number }>;
}

export interface LineForce {
  line: WallLine;
  share: number;
  sumTrib: number;
  /** strength level: Eh = ρ Q_E share, W share */
  Eh: number;
  W: number;
  /** ASD: 0.7 Eh, 0.6 W */
  Easd: number;
  Wasd: number;
  governs: "seismic" | "wind";
}

export interface LateralResult {
  system: SeismicSystem;
  Ie: number;
  hn: number;
  cs: BaseShearResult;
  dist: VerticalDistribution;
  weights: Array<{
    storyId: string;
    items: Array<WeightItem & { psfUsed: number; W: number; text: string }>;
    W: number;
  }>;
  vp: VelocityPressure;
  h: number;
  thetaDeg: number;
  a: number;
  stories: StoryForces[];
  lines: LineForce[];
  warnings: string[];
  rho: number;
}

function itemWeight(it: WeightItem, assemblies: DeadAssembly[], cos: number) {
  let psf = it.psf ?? 0;
  let src = "entered";
  if (it.assemblyId) {
    const a = assemblies.find((x) => x.id === it.assemblyId);
    if (!a) throw new Error(`Weight item ${it.label}: assembly ${it.assemblyId} not found`);
    psf = assemblyDesignValue(a);
    src = a.id;
  }
  if (it.kind === "lump") return { psfUsed: 0, W: it.W ?? 0, text: `${fmt(it.W ?? 0, 0)} lb (entered)` };
  if (it.kind === "wall") {
    const W = psf * it.qty * (it.height ?? 0);
    return {
      psfUsed: psf,
      W,
      text: `${fmt(psf, 1)} psf (${src}) × ${fmt(it.qty, 1)} ft × ${fmt(it.height ?? 0, 2)} ft`,
    };
  }
  const p = it.sloped ? psf / cos : psf;
  return {
    psfUsed: p,
    W: p * it.qty,
    text: `${fmt(psf, 1)} psf (${src})${it.sloped ? ` / cos θ` : ""} × ${fmt(it.qty, 0)} ft²`,
  };
}

export function analyseLateral(inp: LateralInput, site: Site, assemblies: DeadAssembly[]): LateralResult {
  if (!inp.stories.length) throw new Error("Lateral: define at least one story");
  const warnings: string[] = [];
  const cycle = getCycle(site.cycleId);
  const system = seismicSystem(inp.system);
  const Ie = IMPORTANCE_SEISMIC[site.riskCategory];
  const theta = Math.atan(inp.pitch / 12);
  const thetaDeg = (theta * 180) / Math.PI;
  const cos = Math.cos(theta);

  // heights
  let acc = 0;
  const hx = inp.stories.map((s) => (acc += s.height));
  const plate = acc;
  const hn = plate + inp.roofRise / 2;
  const h = thetaDeg <= 10 ? plate : plate + inp.roofRise / 2;

  // seismic
  const weights = inp.stories.map((s) => {
    const items = s.items.map((it) => ({ ...it, ...itemWeight(it, assemblies, cos) }));
    return { storyId: s.id, items, W: items.reduce((x, y) => x + y.W, 0) };
  });
  const cs = seismicCoefficient({ SDS: site.SDS, SD1: site.SD1, S1: inp.S1, R: system.R, Ie, hn, TL: inp.TL });
  const dist = verticalDistribution(
    inp.stories.map((s, i) => ({ id: s.id, w: weights[i].W, h: hx[i] })),
    cs.Cs,
    cs.T,
  );

  // wind
  const vp = velocityPressure(cycle.asce7, site.V, h, site.exposure, site.Kzt, inp.Ke, true);
  const a = endZoneA(Math.min(inp.Lx, inp.Ly), h);
  const n = inp.stories.length;
  const windAt = (i: number, dir: Dir) => {
    const width = dir === "X" ? inp.Ly : inp.Lx;
    const transverse = dir !== inp.ridge; // force along the direction normal to the ridge
    const upper = inp.stories[i].height / 2;
    const above = i < n - 1 ? inp.stories[i + 1].height / 2 : 0;
    const wallHeight = upper + above;
    const roofHeight = i === n - 1 ? (transverse ? inp.roofRise : inp.roofRise / 2) : 0;
    const f = mwfrsBandForce(vp.qEff, { width, wallHeight, roofHeight }, thetaDeg, transverse, a);
    return { ...f, F: Math.max(f.F, f.Fmin), wallHeight, roofHeight, width };
  };

  const stories: StoryForces[] = inp.stories.map((s, i) => {
    const row = dist.rows.find((r) => r.id === s.id)!;
    const bx = windAt(i, "X");
    const by = windAt(i, "Y");
    return {
      storyId: s.id,
      name: s.name,
      hx: hx[i],
      w: row.w,
      Fx: row.Fx,
      VE: row.Vx,
      windF: { X: bx.F, Y: by.F },
      VW: { X: 0, Y: 0 },
      windBands: { X: bx, Y: by },
    };
  });
  for (let i = n - 1; i >= 0; i--) {
    const up = i < n - 1 ? stories[i + 1].VW : { X: 0, Y: 0 };
    stories[i].VW = { X: up.X + stories[i].windF.X, Y: up.Y + stories[i].windF.Y };
  }

  // wall lines
  const lines: LineForce[] = [];
  for (const s of inp.stories) {
    for (const dir of ["X", "Y"] as Dir[]) {
      const ls = inp.lines.filter((l) => l.storyId === s.id && l.dir === dir);
      if (!ls.length) {
        warnings.push(`${s.name}: no wall lines resisting ${dir}-direction forces`);
        continue;
      }
      const sumTrib = ls.reduce((x, l) => x + l.trib, 0);
      const depth = dir === "X" ? inp.Ly : inp.Lx;
      if (Math.abs(sumTrib - depth) > 0.05 * depth)
        warnings.push(
          `${s.name}, ${dir} lines: Σ tributary width ${fmt(sumTrib, 1)} ft differs from the building depth ${fmt(depth, 1)} ft`,
        );
      const sf = stories.find((x) => x.storyId === s.id)!;
      for (const l of ls) {
        const share = sumTrib > 0 ? l.trib / sumTrib : 0;
        const Eh = inp.rho * sf.VE * share;
        const W = sf.VW[dir] * share;
        lines.push({
          line: l,
          share,
          sumTrib,
          Eh,
          W,
          Easd: 0.7 * Eh,
          Wasd: 0.6 * W,
          governs: 0.7 * Eh >= 0.6 * W ? "seismic" : "wind",
        });
      }
    }
  }
  return { system, Ie, hn, cs, dist, weights, vp, h, thetaDeg, a, stories, lines, warnings, rho: inp.rho };
}
