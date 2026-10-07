import { describe, expect, it } from "vitest";
import { defaultAssemblies } from "@/engine/loads/dead";
import { nailSingleShear, nailDef } from "@/engine/design/dowel";
import {
  designBeam,
  designCeilingJoist,
  designIJoist,
  designJoist,
  designRafter,
  type BeamInput,
  type DesignContext,
  type RafterInput,
} from "@/engine/members";

const ctx: DesignContext = {
  cycleId: "2022",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1.0,
  SDS: 1.0,
};

describe("FJ — floor joist", () => {
  it("2x10 DF-L No.2 @ 16 in., 14 ft, FD1 15 psf + 40 psf", () => {
    const r = designJoist(ctx, {
      id: "fj1",
      mark: "FJ-1",
      description: "",
      species: "DF-L",
      grade: "No.2",
      size: "2x10",
      spacing: 16,
      spans: [14],
      dead: { assemblyId: "FD1" },
      live: { use: "living" },
      extra: [],
      bearing: [1.5, 1.5],
      luBottom: 0,
      rule441: false,
      deflection: { preset: "floor" },
    });
    // M = 73.33 × 14² / 8 = 1,796.7 lb-ft; S = 21.39 in³; Fb' = 900 × 1.1 × 1.15 = 1,138.5 psi
    expect(r.design.bending.demand).toBeCloseTo((((55 * 16) / 12) * 196 * 12) / 8 / 21.390625, 1);
    expect(r.design.bending.capacity).toBeCloseTo(1138.5, 2);
    expect(r.reactions[0].byType.D).toBeCloseTo(20 * 7, 3);
    expect(r.reactions[0].byType.L).toBeCloseTo(53.3333 * 7, 2);
    expect(r.reactions[0].perFoot!.L).toBeCloseTo((53.3333 * 7 * 12) / 16, 2);
    expect(r.pass).toBe(true);
    expect(r.loadLines.map((l) => l.type)).toEqual(["D", "L"]);
  });
});

const rafterBase: RafterInput = {
  id: "r1",
  mark: "R-1",
  description: "",
  species: "DF-L",
  grade: "No.2",
  size: "2x8",
  spacing: 24,
  rise: 6,
  run: 12,
  overhang: 0,
  ridge: "beam",
  plateSeat: 3.5,
  ridgeSeat: 0,
  seatCut: 0,
  dead: { assemblyId: "RD1" },
  roofLive: true,
  snow: false,
  deflection: { preset: "roof-nonplaster" },
  luBottom: 0,
  rule441: false,
  gable: true,
};

describe("R — rafter", () => {
  it("6:12, 12 ft run, ridge beam: M equals the plan-projection value, vertical plate reaction", () => {
    const r = designRafter(ctx, rafterBase);
    const row = r.design.combos.find((c) => c.combo.label === "D + Lr")!;
    // w_h = 10 × 2 / cos θ + 20 × 2 = 62.36 plf → M = 62.36 × 12² / 8 = 1,122.5 lb-ft
    expect(row.Mpos).toBeCloseTo(((20 / Math.cos(Math.atan(0.5)) + 40) * 144) / 8, 1);
    expect(r.design.bending.capacity).toBeCloseTo(900 * 1.2 * 1.25 * 1.15, 2);
    expect(r.vertical[0].D).toBeCloseTo((20 / Math.cos(Math.atan(0.5))) * 6, 2);
    expect(r.vertical[0].Lr).toBeCloseTo(240, 2);
    const live = r.design.deflection[0].live;
    const Ls = (12 / Math.cos(Math.atan(0.5))) * 12;
    expect(live).toBeCloseTo((5 * (32 / 12) * Ls ** 4) / (384 * 1_600_000 * ((1.5 * 7.25 ** 3) / 12)), 3);
    expect(r.pass).toBe(true);
  });

  it("ridge board: thrust, axial compression and NDS 3.9.2 interaction", () => {
    const r = designRafter(ctx, { ...rafterBase, ridge: "board" });
    const t = r.thrust!;
    expect(t.H.D).toBeCloseTo((20 / Math.cos(Math.atan(0.5))) * 12, 2); // w·run / (2 tan θ), tan θ = 0.5
    expect(t.H.Lr).toBeCloseTo(480, 2);
    const row = t.rows.find((x) => x.combo === "D + Lr")!;
    expect(row.N).toBeCloseTo(1004.0, 0);
    expect(row.CP).toBeCloseTo(0.4648, 3);
    expect(row.interaction).toBeCloseTo(0.7426, 3);
    expect(r.vertical[1].D).toBe(0);
    expect(r.vertical[0].Lr).toBeCloseTo(480, 2);
  });
});

describe("CJ — ceiling joist acting as rafter tie", () => {
  const T = { D: (20 / Math.cos(Math.atan(0.5))) * 12, L: 0, Lr: 480, S: 0, W: 0, E: 0 };
  const cj = (count: number) =>
    designCeilingJoist(ctx, {
      id: "cj1",
      mark: "CJ-1",
      description: "",
      species: "DF-L",
      grade: "No.2",
      size: "2x6",
      spacing: 24,
      spans: [12],
      dead: { assemblyId: "CD1" },
      live: { use: "attic-no-storage" },
      extra: [],
      bearing: [3.5, 3.5],
      deflection: { preset: "roof-nonplaster" },
      luTop: 0,
      rule441: true,
      tension: { T, source: "R-1" },
      heel: { nail: "16d-common", count, rafterThickness: 1.5 },
    });

  it("16d common, 1-1/2 in. members, G = 0.50: Z = 141 lb (Mode IV)", () => {
    const z = nailSingleShear({ nail: nailDef("16d-common"), ts: 1.5, tm: 1.5, Gs: 0.5, Gm: 0.5 });
    expect(z.mode).toBe("IV");
    expect(z.Z).toBeCloseTo(140.7, 1);
  });

  it("checks tension, combined stresses and heel nailing over the joint combinations", () => {
    const r = cj(4);
    const g = r.tension!.governing;
    expect(g.combo).toBe("D + L");
    expect(Math.max(g.eq1, g.eq2)).toBeCloseTo(0.7652, 3);
    const heel = r.checks.find((c) => c.name.startsWith("Heel joint"))!;
    expect(heel.demand).toBeCloseTo(748.33 / (140.7 * 1.25), 2);
    expect(heel.pass).toBe(false);
    expect(cj(5).checks.find((c) => c.name.startsWith("Heel joint"))!.pass).toBe(true);
  });
});

describe("IJ — TJI I-joist", () => {
  it("matches the JoistCalc formulas: TJI 210 11-7/8 @ 16 in., 16 ft, 15 + 40 psf + self weight", () => {
    const r = designIJoist(ctx, {
      id: "ij1",
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
    const m = r.checks.find((c) => c.name.startsWith("Moment, positive"))!;
    expect(m.demand).toBeCloseTo(((55 * 16) / 12 + 2.9) * 32, 1);
    expect(m.capacity).toBe(4045);
    expect(r.checks.find((c) => c.name.startsWith("Shear"))!.demand).toBeCloseTo(((55 * 16) / 12 + 2.9) * 8, 1);
    expect(r.deflection[0].live).toBeCloseTo(0.22599 + 0.030913, 3);
    const wT = (55 * 16) / 12 + 2.9;
    const bend = (5 * (wT / 12) * 192 ** 4) / (384 * 348e6);
    const shear = ((wT / 12) * 192 ** 2) / 5.3e6;
    expect(r.deflection[0].total).toBeCloseTo(bend + shear, 3);
  });
});

describe("B / H — beams and headers", () => {
  const header: BeamInput = {
    id: "h1",
    mark: "H-1",
    description: "",
    role: "header",
    material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "4x10", plies: 1 },
    spans: [8],
    area: [{ label: "Roof", trib: 12, dead: { assemblyId: "RD1" }, roofLive: true, rise: 4 }],
    walls: [],
    extra: [],
    bearing: [3, 3],
    luTop: 0,
    luBottom: 0,
    deflection: { preset: "roof-nonplaster" },
    selfWeight: true,
  };

  it("4x10 header, 8 ft, 12 ft roof tributary at 4:12", () => {
    const r = designBeam(ctx, header);
    const wD = 120 / Math.cos(Math.atan(4 / 12));
    const sw = r.design.mat.selfWeight;
    const M = ((wD + sw + 240) * 64) / 8;
    expect(r.design.bending.demand).toBeCloseTo((M * 12) / ((3.5 * 9.25 ** 2) / 6), 1);
    expect(r.design.bending.capacity).toBeCloseTo(900 * 1.2 * 1.25, 2);
    expect(r.reactions[0].byType.Lr).toBeCloseTo(960, 2);
    expect(r.reactions[0].byType.D).toBeCloseTo((wD + sw) * 4, 2);
    expect(r.title).toBe("Header");
  });

  it("multi-ply LVL with the SCL depth factor", () => {
    const r = designBeam(ctx, {
      ...header,
      role: "beam",
      material: { kind: "scl", product: "LVL 2.0E", plies: 2, plyWidth: 1.75, d: 11.875 },
      spans: [14],
      area: [],
      extra: [
        { kind: "line", type: "D", label: "Floor dead", w: 150 },
        { kind: "line", type: "L", label: "Floor live", w: 300 },
      ],
      deflection: { preset: "floor" },
    });
    expect(r.design.bending.capacity).toBeCloseTo(2600 * Math.pow(12 / 11.875, 0.136), 1);
    const sw = (42 * 3.5 * 11.875) / 144;
    expect(r.design.bending.demand).toBeCloseTo(((((450 + sw) * 196) / 8) * 12) / ((3.5 * 11.875 ** 2) / 6), 1);
  });

  it("failing glulam offers the lightest passing section", () => {
    const r = designBeam(ctx, {
      ...header,
      role: "beam",
      material: { kind: "glulam", combo: "24F-V4", b: 5.125, d: 12 },
      spans: [24],
      area: [],
      extra: [
        { kind: "line", type: "D", label: "D", w: 200 },
        { kind: "line", type: "L", label: "L", w: 400 },
      ],
      deflection: { preset: "floor" },
    });
    expect(r.pass).toBe(false);
    expect(r.design.factors.CV).toBeCloseTo(Math.pow(21 / 24, 0.1), 4);
    expect(r.alternatives?.lightest).toMatch(/GLB 24F-V4/);
  });
});
