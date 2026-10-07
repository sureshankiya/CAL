/**
 * Phase 2 modules: parity with the portfolio Tedds sheets (shear wall, post,
 * footing) and closed-form checks of the seismic, wind, wall, connector and
 * truss modules.
 */

import { describe, expect, it } from "vitest";
import { asdCombinations } from "@/engine/core/combos";
import { columnStabilityFactor } from "@/engine/design/wood";
import { defaultHardware } from "@/engine/data/hardware";
import { defaultAssemblies } from "@/engine/loads/dead";
import { seismicCoefficient, verticalDistribution } from "@/engine/loads/seismic";
import { Kz, gcpfCaseA, velocityPressure, wallGCp } from "@/engine/loads/wind";
import type { DesignContext } from "@/engine/members";
import { designConnector } from "@/engine/members/connector";
import { designFooting } from "@/engine/members/footing";
import { designPost } from "@/engine/members/post";
import { designShearWall, type ShearWallDemand } from "@/engine/members/shearWall";
import { designTruss } from "@/engine/members/truss";
import { designWall } from "@/engine/members/wall";
import { loadVector } from "@/engine/core/loads";

const ctx: DesignContext = {
  cycleId: "2025",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1,
  SDS: 1,
  hardware: defaultHardware(),
  concrete: { fc: 2500, fy: 60000 },
};

describe("portfolio parity — Phase 2", () => {
  it("215 Paden POST 1 (Tedds): 6x6 DF-L No.1, 8 ft, P = 16,120 lb, M = 805 lb-ft, C_D = 0.9", () => {
    const r = designPost(ctx, {
      id: "p",
      mark: "P-1",
      description: "",
      material: { kind: "sawn", species: "DF-L", grade: "No.1", size: "6x6", plies: 1 },
      height: 8,
      Ke: 1,
      extra: [{ kind: "point", type: "D", label: "Beam", P: 16120 }],
      eccentricity: (805 * 12) / 16120,
      bearing: { on: "concrete" },
      selfWeight: false,
    });
    const row = r.col.governing;
    expect(row.CD).toBe(0.9);
    expect(row.FcE1).toBeCloseTo(1565, 0); // Tedds 1565 psi
    expect(row.CP).toBeCloseTo(0.842, 3); // Tedds 0.84
    expect(row.FcPrime).toBeCloseTo(758, 0); // Tedds 758 psi
    expect(row.fc).toBeCloseTo(533, 0); // Tedds 533 psi
    expect(row.fb).toBeCloseTo(348, 0); // Tedds 348 psi
    expect(row.FbPrime).toBeCloseTo(1080, 0); // Tedds 1080 psi
    expect(row.interaction).toBeCloseTo(0.984, 2); // Tedds 0.984
  });

  it("1002 3rd St SW1 (Tedds): 24.913 ft × 9 ft, 7/16 Str I + 5/8 gypsum sheathing, W = 135 lb, E = 40 lb", () => {
    const dem: ShearWallDemand = {
      lineName: "Line 1",
      share: 1,
      Eh: 40,
      QE: 40,
      W: 135,
      rho: 1,
      SDS: 1,
      Cd: 4,
      Ie: 1.25,
      Omega0: 3,
      hsx: 9,
      driftFactor: 0.02,
      seismicSDC: "D",
    };
    const r = designShearWall(
      ctx,
      {
        id: "sw",
        mark: "SW1",
        description: "",
        lineId: "l1",
        b: 24.913,
        h: 9,
        sides: [
          { key: "SI-7/16-8d", spacing: 4, vsOverride: 860, GaOverride: 21 },
          { key: "GSH-5/8-4/7-blocked", spacing: 4 },
        ],
        stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: 16 },
        endPost: { size: "2x4", plies: 2, holeDia: 1 },
        top: { D: 135, L: 140, Lr: 180, S: 0 },
        self: { psf: 12 },
        overturning: "endpost",
        sill: { type: "cast-in", d: 0.625, spacing: 48, embed: 7, edge: 1.75 },
        sillSize: "2x4",
        ka: 30000,
        windService: { factor: 1, limitN: 600 },
      },
      dem,
    );
    expect(r.vsc).toBe(860);
    expect(r.vwc).toBe(1205);
    expect(r.Gac).toBe(30.5);
    expect((r.vAllowS * 24.913) / 1000).toBeCloseTo(10.713, 2); // Tedds Vs = 10.713 kips
    expect((r.vAllowW * 24.913) / 1000).toBeCloseTo(15.01, 1); // Tedds Vw = 15.01 kips
    const col = r.compression.col.governing;
    expect(col.FcStar).toBeCloseTo(2484, 0); // Tedds Fc* = 2484 psi
    expect(col.FcE1).toBeCloseTo(501, 0); // Tedds FcE = 501 psi
    expect(col.CP).toBeCloseTo(0.19, 2); // Tedds CP = 0.19
    expect(col.FcPrime).toBeCloseTo(478, 0); // Tedds Fc' = 478 psi
    expect(r.compression.C).toBeCloseTo(344, 0); // Tedds C = 0.344 kips
    expect(col.fc).toBeCloseTo(33, 0);
    const tRow = r.chord.find((c) => c.combo === "(0.6 − 0.14 SDS)D + 0.7E")!;
    expect(tRow.T).toBeCloseTo(-64.4, 0); // Tedds T = −0.064 kips
    expect(r.drift.dx).toBeCloseTo(0.0016, 3); // Tedds 0.002 in
    expect(r.drift.allow).toBeCloseTo(2.16, 2); // Tedds Δ = 2.16 in
  });

  it("1109 San Miguel strip footing (Tedds): 1.6 ft × 10 in., #4 @ 6 in., f'c 3,000 psi — flexure", () => {
    const r = designFooting(
      { ...ctx, concrete: { fc: 3000, fy: 60000 } },
      {
        id: "f",
        mark: "F-1",
        description: "",
        type: "strip",
        B: 1.6,
        h: 10,
        depth: 46,
        soilOver: 36,
        c1: 8,
        fc: 3000,
        fy: 60000,
        cover: 3,
        rebar: { size: "#4", spacing: 6 },
        extra: [
          { kind: "line", type: "D", label: "Wall", w: 1500 },
          { kind: "line", type: "L", label: "Wall", w: 1300 },
        ],
        qa: 3500,
        qaSource: "soils report",
        soilDensity: 120,
        stories: 1,
      },
    );
    const c = r.concrete;
    expect(c.d).toBeCloseTo(6.75, 3); // Tedds d = 6.750 in
    expect(c.flex!.a).toBeCloseTo(0.784, 3); // Tedds a = 0.784 in
    expect(c.flex!.epsT).toBeCloseTo(0.01895, 4); // Tedds εt = 0.01895
    expect(c.phiMn / 12000).toBeCloseTo(11.444, 2); // Tedds φMn = 11.444 kip-ft
    expect(c.AsMin).toBeCloseTo(0.216, 3); // Tedds As,min = 0.216 in²
    expect(c.Mu / 12000).toBeCloseTo(0.259, 1); // Tedds Mu = 0.259 kip-ft (HouseCalc 0.264, face of wall)
    expect(r.pass).toBe(true);
  });
});

describe("seismic and wind loads", () => {
  it("ELF: Cs = SDS / (R / Ie), Ta = 0.02 hn^0.75, Fx distribution", () => {
    const cs = seismicCoefficient({ SDS: 1.0, SD1: 0.6, R: 6.5, Ie: 1, hn: 20, TL: 8 });
    expect(cs.Ta).toBeCloseTo(0.02 * 20 ** 0.75, 6);
    expect(cs.Cs).toBeCloseTo(1 / 6.5, 6);
    expect(cs.governs).toBe("12.8-2");
    const d = verticalDistribution(
      [
        { id: "1", w: 40000, h: 10 },
        { id: "2", w: 30000, h: 20 },
      ],
      cs.Cs,
      cs.T,
    );
    expect(d.V).toBeCloseTo(70000 / 6.5, 3);
    const top = d.rows.find((r) => r.id === "2")!;
    expect(top.Fx).toBeCloseTo((d.V * 30000 * 20) / (40000 * 10 + 30000 * 20), 3);
    expect(d.rows.find((r) => r.id === "1")!.Vx).toBeCloseTo(d.V, 6);
  });

  it("Kz (Table 26.10-1) and qh; GCpf interpolation; wall C&C GCp", () => {
    expect(Kz(15, "B")).toBeCloseTo(0.575, 3);
    expect(Kz(15, "B", true)).toBe(0.7);
    expect(Kz(15, "C")).toBeCloseTo(0.849, 3);
    expect(Kz(15, "D")).toBeCloseTo(1.03, 2);
    const vp = velocityPressure("ASCE 7-16", 110, 15, "C", 1, 1, false);
    expect(vp.q).toBeCloseTo(0.00256 * Kz(15, "C") * 0.85 * 110 * 110, 6);
    const vp22 = velocityPressure("ASCE 7-22", 110, 15, "C", 1, 1, false);
    expect(vp22.qEff).toBeCloseTo(vp.q, 6);
    const g = gcpfCaseA(12.5);
    expect(g["1"]).toBeCloseTo((0.4 + 0.53) / 2, 6);
    const w = wallGCp(10, 5, 20);
    expect(w.neg).toBeCloseTo(-1.4, 6);
    expect(wallGCp(500, 4, 20).pos).toBeCloseTo(0.7, 6);
  });
});

describe("gravity load path members", () => {
  it("stud wall: typical stud axial with C_P, bearing with C_b, wind interaction", () => {
    const r = designWall(ctx, {
      id: "w",
      mark: "1W-1",
      description: "",
      species: "DF-L",
      grade: "Stud",
      size: "2x6",
      spacing: 16,
      plateHeight: 9,
      topPlates: 2,
      bottomPlates: 1,
      length: 12,
      sheathing: "both",
      self: { psf: 22 },
      area: [],
      walls: [],
      extra: [
        { kind: "line", type: "D", label: "Roof", w: 300 },
        { kind: "line", type: "Lr", label: "Roof", w: 240 },
        { kind: "point", type: "D", label: "Header", P: 1200, x: 4 },
        { kind: "point", type: "Lr", label: "Header", P: 900, x: 4 },
      ],
      wind: { mode: "entered", psf: 20 },
      deflN: 240,
      packs: [{ x: 4, studs: 2 }],
      openings: [],
    });
    const s = 16 / 12;
    const PD = (300 + 22 * 9) * s;
    const PLr = 240 * s;
    expect(r.typical.P.D).toBeCloseTo(PD, 6);
    expect(r.typical.P.Lr).toBeCloseTo(PLr, 6);
    const l = 9 * 12 - 4.5;
    const FcE = (0.822 * 510000) / (l / 5.5) ** 2;
    const row = r.typical.col.rows.find((x) => x.combo.label === "D + Lr")!;
    expect(row.FcE1).toBeCloseTo(FcE, 3);
    expect(row.CP).toBeCloseTo(columnStabilityFactor(FcE, 850 * 1.25, 0.8), 6);
    expect(row.fc).toBeCloseTo((PD + PLr) / 8.25, 6);
    expect(r.typical.bearing.Cb).toBeCloseTo((1.5 + 0.375) / 1.5, 6);
    // pack carries the point load plus one stud spacing of line load
    expect(r.packs[0].P.D).toBeCloseTo(1200 + PD, 6);
    expect(r.reactions[0].perFoot!.D).toBeCloseTo(300 + 198, 6);
    expect(r.reactions[1].byType.D).toBeCloseTo(1200, 6);
    const wind = r.typical.col.rows.find((x) => x.combo.label === "D + 0.6W")!;
    expect(wind.M).toBeCloseTo((0.6 * 20 * s * (l / 12) ** 2) / 8, 6);
  });

  it("connector: downward checked per duration column, uplift on the 160 column", () => {
    const hw = defaultHardware().map((h) => (h.id === "LUS210" ? { ...h, down: { "100": 1000, "125": 1200 }, uplift: 400 } : h));
    const r = designConnector(
      { ...ctx, hardware: hw },
      {
        id: "c",
        mark: "CN-1",
        description: "",
        hardwareId: "LUS210",
        quantity: 1,
        sourceMark: "FJ-1",
        supportName: "A",
        R: loadVector({ D: 300, Lr: 700, W: -900 }),
      },
    );
    const lr = r.rows.find((x) => x.combo === "D + Lr")!;
    expect(lr.capacity).toBe(1200);
    const d = r.rows.find((x) => x.combo === "D")!;
    expect(d.capacity).toBeCloseTo(900, 6);
    const up = r.rows.find((x) => x.combo === "0.6D + 0.6W")!;
    expect(up.direction).toBe("uplift");
    expect(up.R).toBeCloseTo(-(0.6 * 300 - 0.6 * 900), 6);
    expect(up.capacity).toBe(400);
  });

  it("truss import: per-foot reactions for typical trusses, plate bearing", () => {
    const r = designTruss(ctx, {
      id: "t",
      mark: "T-1",
      description: "",
      spacing: 24,
      girder: false,
      plies: 1,
      span: 24,
      designRef: "TDD job 123",
      bearings: [{ name: "Left", x: 0, D: 480, L: 0, Lr: 480, S: 0, W: -300, width: 1.5 }],
      plate: { species: "DF-L", grade: "No.2", size: "2x6" },
    });
    expect(r.reactions[0].perFoot!.D).toBeCloseTo(240, 6);
    expect(r.bearingChecks[0].A).toBeCloseTo(1.5 * 5.5, 6);
    expect(r.bearingChecks[0].Fprime).toBeCloseTo(625 * 1.25, 6);
  });

  it("ASD combinations include 0.6D + 0.6W for uplift", () => {
    expect(asdCombinations({ includeWind: true }).some((c) => c.label === "0.6D + 0.6W")).toBe(true);
  });
});
