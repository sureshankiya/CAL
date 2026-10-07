/**
 * Engine vs. independent reference (verification/reference.py → reference.json).
 * The Python reference uses closed-form solutions and the three-moment
 * equation, not the finite-element solver, so agreement checks the engine
 * end to end. Tolerance: 0.1 % (relative) unless noted.
 */

import { describe, expect, it } from "vitest";
import ref from "../verification/reference.json";
import { nailDef, nailSingleShear } from "@/engine/design/dowel";
import { designWoodBeam, type WoodBeamInput } from "@/engine/design/wood";
import { defaultAssemblies } from "@/engine/loads/dead";
import { roofLiveReduction } from "@/engine/loads/live";
import { slopeFactor, snowLoads } from "@/engine/loads/snow";
import { designBeam, designIJoist, designRafter, type DesignContext } from "@/engine/members";

const close = (actual: number, expected: number, rel = 1e-3) => {
  const tol = Math.max(Math.abs(expected) * rel, 1e-6);
  expect(Math.abs(actual - expected), `actual ${actual} vs reference ${expected}`).toBeLessThanOrEqual(tol);
};

const base = (over: Partial<WoodBeamInput>): WoodBeamInput => ({
  material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x12", plies: 1 },
  geometry: { spans: [14] },
  loads: [],
  includeSelfWeight: false,
  conditions: { wetService: false, incised: false, repetitive: true, flatUse: false },
  lu: { top: 0, bottom: 0 },
  bearingLengths: [1.5, 1.5],
  defl: { live: 360, total: 240 },
  Kcr: 1.0,
  nds: "NDS-2018",
  ...over,
});

const ctx: DesignContext = {
  cycleId: "2022",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1.0,
  SDS: 1.0,
};

describe("engine vs. independent Python reference", () => {
  it("V1 simple-span joist", () => {
    const t = 16 / 12;
    const r = designWoodBeam(
      base({
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 14, w1: 15 * t },
          { type: "L", kind: "udl", x1: 0, x2: 14, w1: 40 * t },
        ],
        Kcr: 1.5,
      }),
    );
    const v = ref.V1_joist;
    close(r.bending.demand, v.fb);
    close(r.bending.capacity, v.Fbp);
    close(r.shear.demand, v.fv);
    close(r.deflection[0].live, v.d_live);
    close(r.deflection[0].total, v.d_total_kcr15);
    close(r.reactions[0].maxDown, v.R);
  });

  it("V2 two equal spans with pattern live load (three-moment equation)", () => {
    const r = designWoodBeam(
      base({
        geometry: { spans: [12, 12] },
        bearingLengths: [1.5, 3.5, 1.5],
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 24, w1: 20 },
          { type: "L", kind: "udl", x1: 0, x2: 24, w1: 53.33 },
        ],
      }),
    );
    const v = ref.V2_two_span;
    const row = r.combos.find((c) => c.combo.label === "D + L")!;
    close(row.Mneg, v.Mneg);
    close(row.Mpos, v.Mpos, 2e-3);
    close(r.reactions[1].maxDown, v.R_B);
    close(r.reactions[0].minNet, v.R_A_min, 2e-3);
  });

  it("V3 ridge-board rafter: thrust, axial, C_P and NDS 3.9.2", () => {
    const r = designRafter(ctx, {
      id: "r",
      mark: "R-1",
      description: "",
      species: "DF-L",
      grade: "No.2",
      size: "2x8",
      spacing: 24,
      rise: 6,
      run: 12,
      overhang: 0,
      ridge: "board",
      plateSeat: 3.5,
      ridgeSeat: 0,
      seatCut: 0,
      dead: { psf: 10 },
      roofLive: true,
      snow: false,
      deflection: { preset: "roof-nonplaster" },
      luBottom: 0,
      rule441: false,
      gable: true,
    });
    const v = ref.V3_rafter_board;
    const row = r.thrust!.rows.find((x) => x.combo === "D + Lr")!;
    close(row.H, v.H);
    close(row.N, v.N);
    close(row.CP, v.CP);
    close(row.interaction, v.interaction, 2e-3);
    close(r.design.combos.find((c) => c.combo.label === "D + Lr")!.Mpos, v.M);
  });

  it("V4 16d common nail, single shear yield modes", () => {
    const z = nailSingleShear({ nail: nailDef("16d-common"), ts: 1.5, tm: 1.5, Gs: 0.5, Gm: 0.5 });
    const v = ref.V4_nail_16d;
    close(z.Z, v.Z);
    close(z.modes.IIIs, v.IIIs);
    close(z.modes.IV, v.IV);
  });

  it("V5 glulam volume and beam stability factors", () => {
    const r = designWoodBeam(
      base({
        material: { kind: "glulam", combo: "24F-V4", b: 5.125, d: 24 },
        geometry: { spans: [24] },
        conditions: { wetService: false, incised: false, repetitive: false, flatUse: false },
        lu: { top: 8, bottom: 0 },
        bearingLengths: [6, 6],
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 24, w1: 300 },
          { type: "L", kind: "udl", x1: 0, x2: 24, w1: 600 },
        ],
      }),
    );
    const v = ref.V5_glulam;
    close(r.factors.CV!, v.CV);
    close(r.factors.leTop, v.le);
    close(r.factors.RBTop, v.RB);
    const row = r.combos.find((c) => c.combo.label === "D + L")!;
    close(row.CLpos, v.CL);
    close(row.FbPrime, v.Fbp);
  });

  it("V6 TJI moment, shear and bending + shear deflection", () => {
    const r = designIJoist(ctx, {
      id: "ij",
      mark: "IJ-1",
      description: "",
      series: "TJI 210",
      depth: '11-7/8"',
      spacing: 16,
      spans: [16],
      dead: { psf: 15 },
      live: { use: "living" },
      extra: [],
      bearing: [1.75, 1.75],
      deflection: { preset: "floor" },
      addSelfWeight: true,
    });
    const v = ref.V6_tji;
    close(r.rows.find((x) => x.combo.label === "D + L")!.Mpos, v.M);
    close(r.rows.find((x) => x.combo.label === "D + L")!.V, v.V);
    close(r.deflection[0].live, v.d_live);
    close(r.deflection[0].total, v.d_total);
  });

  it("V7 overhang tip deflection and 2 × cantilever limit", () => {
    const r = designWoodBeam(
      base({
        geometry: { spans: [12], rightCantilever: 3 },
        bearingLengths: [3.5, 3.5],
        loads: [{ type: "L", kind: "udl", x1: 12, x2: 15, w1: 60 }],
      }),
    );
    const v = ref.V7_overhang;
    const c = r.deflection.find((d) => d.kind === "cantilever")!;
    close(c.live, v.tip);
    close(c.liveLimit, v.limit);
  });

  it("V8 snow (ASCE 7-16 / 7-22) and roof live reduction", () => {
    const v = ref.V8_snow;
    const s16 = snowLoads({
      edition: "ASCE 7-16",
      pg: 30,
      Ce: 1,
      Ct: 1,
      Is: 1.1,
      rise: 2,
      slippery: false,
      W: 16,
      gable: true,
    });
    const s22 = snowLoads({
      edition: "ASCE 7-22",
      pg: 30,
      Ce: 1,
      Ct: 1,
      Is: 1.1,
      rise: 2,
      slippery: false,
      W: 16,
      gable: true,
    });
    close(s16.pf, v.pf716);
    close(s22.pf, v.pf722);
    close(s16.pm, v.pm_low);
    close(slopeFactor(45, 1.0, false), v.Cs45);
    close(roofLiveReduction(20, 400, 6).Lr, v.Lr_400_6);
  });

  it("V9 header with sloped roof dead load and self weight", () => {
    const r = designBeam(ctx, {
      id: "h",
      mark: "H-1",
      description: "",
      role: "header",
      material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "4x10", plies: 1 },
      spans: [8],
      area: [{ label: "Roof", trib: 12, dead: { psf: 10 }, roofLive: true, rise: 4 }],
      walls: [],
      extra: [],
      bearing: [3, 3],
      luTop: 0,
      luBottom: 0,
      deflection: { preset: "roof-nonplaster" },
      selfWeight: true,
    });
    const v = ref.V9_header;
    close(r.design.mat.selfWeight, v.sw);
    close(r.design.bending.demand, v.fb);
    close(r.design.bending.capacity, v.Fbp);
    close(r.reactions[0].byType.D, v.R_D);
    close(r.reactions[0].byType.Lr, v.R_Lr);
  });
});
