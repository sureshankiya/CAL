/**
 * Phase 3 modules: parity with the portfolio Tedds sheets (336 East Grand
 * steel lintel, HSS post, base plate and anchor bolts; 45324 Indian Well
 * ledger) and closed-form checks of the steel, diaphragm, FTAO, transfer and
 * uplift modules.
 */

import { describe, expect, it } from "vitest";
import { analyseBeam } from "@/engine/analysis/beam";
import { defaultHardware } from "@/engine/data/hardware";
import { C_SHAPES, W_SHAPES, steelShape } from "@/engine/data/steel";
import { ANCHOR_STEELS } from "@/engine/design/anchors";
import { designAnchorGroup } from "@/engine/design/anchorGroup";
import { designBasePlate } from "@/engine/design/basePlate";
import * as S from "@/engine/design/steel";
import { defaultAssemblies } from "@/engine/loads/dead";
import type { DesignContext } from "@/engine/members";
import { designSteelBeam, designSteelColumn } from "@/engine/members/steel";
import { designLedger } from "@/engine/members/ledger";
import { designShearWall, type ShearWallDemand } from "@/engine/members/shearWall";
import { designDiaphragm, type DiaphragmDemand } from "@/engine/members/diaphragm";
import { designTransfer } from "@/engine/members/transfer";
import { designUplift } from "@/engine/members/uplift";
import { rigidDistribution } from "@/engine/lateral/rigid";
import { computedTribs } from "@/engine/lateral/analysis";
import { dowelYieldSingle } from "@/engine/design/dowel";
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

describe("steel section data", () => {
  it("tabulated W / C rows agree with properties computed from their plate dimensions", () => {
    for (const s of [...W_SHAPES, ...C_SHAPES]) {
      const { d, bf, tf, tw } = s;
      const A = 2 * bf * tf + (d - 2 * tf) * tw;
      const Ix = (bf * d ** 3 - (bf - tw) * (d - 2 * tf) ** 3) / 12;
      const Zx = bf * tf * (d - tf) + (tw * (d - 2 * tf) ** 2) / 4;
      // fillets add 0–4 % to the plate-only values
      expect(s.A / A).toBeGreaterThan(0.99);
      expect(s.A / A).toBeLessThan(1.05);
      expect(s.Ix / Ix).toBeGreaterThan(0.99);
      expect(s.Ix / Ix).toBeLessThan(1.05);
      expect(s.Zx / Zx).toBeGreaterThan(0.99);
      expect(s.Zx / Zx).toBeLessThan(1.05);
      expect(s.Sx / (s.Ix / (d / 2))).toBeCloseTo(1, 1);
      expect(s.rx / Math.sqrt(s.Ix / s.A)).toBeCloseTo(1, 2);
      expect(s.ry / Math.sqrt(s.Iy / s.A)).toBeCloseTo(1, 2);
    }
  });

  it("HSS properties computed from geometry match AISC tabulated values", () => {
    const h = steelShape("HSS6x6x1/4"); // AISC: A 5.24, I 28.6, Z 11.2, r 2.34, J 45.6
    expect(h.tw).toBe(0.233);
    expect(h.A).toBeCloseTo(5.24, 1);
    expect(h.Ix).toBeCloseTo(28.6, 1);
    expect(h.Zx).toBeCloseTo(11.2, 1);
    expect(h.rx).toBeCloseTo(2.34, 2);
    expect(h.J / 45.6).toBeCloseTo(1, 1);
    const h4 = steelShape("HSS4x4x1/4"); // AISC: A 3.37, I 7.80, Z 4.69, J 12.8
    expect(h4.A).toBeCloseTo(3.37, 2);
    expect(h4.Ix).toBeCloseTo(7.8, 1);
    expect(h4.J).toBeCloseTo(12.8, 1);
  });
});

describe("portfolio parity — 336 East Grand (Tedds, AISC 360 LRFD)", () => {
  it("W10x22 lintel, 10 ft fixed–fixed, D = 0.400 + 0.022 kip/ft + self weight", () => {
    const r = designSteelBeam(ctx, {
      id: "sb",
      mark: "SB-1",
      description: "",
      role: "lintel",
      shape: "W10x22",
      grade: "A992",
      method: "LRFD",
      spans: [10],
      fixedLeft: true,
      fixedRight: true,
      area: [],
      walls: [],
      extra: [
        { kind: "line", type: "D", label: "Wall", w: 400 },
        { kind: "line", type: "D", label: "Additional", w: 22 },
      ],
      Lb: 0,
      deflection: { preset: "floor" },
      selfWeight: true,
      bearing: [{ lb: 4, support: "steel" }],
    });
    const row = r.rows.find((x) => x.combo.label.startsWith("1.2D"))!;
    expect(row.Mneg).toBeCloseTo(-4.441, 2); // Tedds Mmin = −4.441 kip-ft
    expect(row.Mpos).toBeCloseTo(2.22, 2); // Tedds Mmax = 2.220 kip-ft
    expect(row.V).toBeCloseTo(2.665, 2); // Tedds V = 2.665 kip
    expect(r.flexContinuous.Mn / 12).toBeCloseTo(108.333, 2); // Tedds Mn = 108.333 kip-ft
    expect(row.gov.Mc).toBeCloseTo(97.5, 2); // Tedds Mc = 97.500 kip-ft
    expect(r.shear.Aw).toBeCloseTo(2.448, 3); // Tedds Aw = 2.448 in²
    expect(r.shear.Vn).toBeCloseTo(73.44, 2); // Tedds Vn = 73.440 kip, φv = 1.00
    expect(r.shear.factor.phi).toBe(1);
    expect(r.flexContinuous.classes[0].ratio).toBeCloseTo(7.99, 2); // bf/2tf
    expect(r.flexContinuous.classes[1].ratio).toBeCloseTo(37.0, 1); // (d − 2k)/tw
    expect(r.deflection[0].total).toBeCloseTo(0.006, 3); // Tedds δ = 0.006 in
    expect(r.reactions[0].byType.D).toBeCloseTo(2220, 0); // Tedds R_A,Dead = 2.2 kip
    // 1.4D governs the dead-only lintel (Tedds lists 1.2D only)
    const u1 = r.rows.find((x) => x.combo.label === "1.4D")!;
    expect(u1.Mneg).toBeCloseTo(-5.181, 2);
  });

  it("HSS6x6x1/4 post, 138 in., P = 34 kip, Mx = ±5.0, My = ±2.5 kip-ft (reverse curvature)", () => {
    const h = steelShape("HSS6x6x1/4");
    const c = S.compression(h, 50, 29000, 138, 138);
    expect(c.SRx).toBeCloseTo(59.0, 1); // Tedds SRx = 59.0
    expect(c.Fe).toBeCloseTo(82.3, 0); // Tedds Fex = 82.3 ksi
    expect(c.Fcr).toBeCloseTo(38.8, 1); // Tedds Fcr = 38.8 ksi
    expect(c.slender).toBe(false);
    const Pc = 0.9 * c.Pn;
    expect(Pc / 182.9).toBeCloseTo(1, 2); // Tedds 182.9 kip (A = 5.24 tabulated)
    const fx = S.flexureMajor(h, 50, 29000, 138, 1);
    expect((0.9 * fx.Mn) / 12 / 42.0).toBeCloseTo(1, 2); // Tedds Mcx = 42.0 kip-ft
    const b1 = S.amplifierB1(34, h.Ix, 138, 29000, "LRFD", S.cmFromEnds(1));
    expect(b1.Cm).toBeCloseTo(0.2, 3); // Tedds Cm = 0.200
    expect(b1.Pe1 / 429.8).toBeCloseTo(1, 2); // Tedds Pe1 = 429.8 kip
    expect(b1.B1).toBe(1);
    const v = S.shearMajor(h, 50, 29000);
    expect(v.Aw).toBeCloseTo(2.47, 2); // Tedds Aw = 2.47 in²
    expect(v.Vn).toBeCloseTo(74.108, 2); // Tedds Vn = 74.108 kip
    const inter = S.interactionH1(34, Pc, 60, 0.9 * fx.Mn, 30, 0.9 * fx.Mn);
    expect(inter.eq).toBe("H1-1b");
    expect(inter.ratio).toBeCloseTo(0.272, 2); // Tedds UR = 0.272
  });

  it("12 × 12 × 3/4 base plate, HSS6x6x1/4, Pu = 3.0 kip, Mu = 60 kip-in, V = 3.0 kip (DG1)", () => {
    const r = designBasePlate(
      {
        method: "LRFD",
        col: steelShape("HSS6x6x1/4"),
        N: 12,
        B: 12,
        tp: 0.75,
        Fy: 36,
        fc: 4,
        A2: 2304,
        rod: { d: 0.75, Fu: 58, nTension: 2, nShear: 2, e1: 2, groutPad: true, washer: 0.75 },
        weld: { w: 0.3125, FEXX: 70 },
      },
      { P: 3, M: 60, V: 3 },
    );
    expect(r.Pp).toBeCloseTo(979.2, 1); // Tedds Pp = 979.2 kip
    expect(r.fpMax).toBeCloseTo(4.42, 2); // Tedds fp,max = 4.42 ksi
    expect(r.qMax).toBeCloseTo(53.04, 2); // Tedds qmax = 53.04 kip/in
    expect(r.m).toBeCloseTo(3.15, 3); // Tedds m = 3.150 in
    expect(r.ecrit).toBeCloseTo(5.972, 3); // Tedds ecrit = 5.972 in
    expect(r.regime).toBe("large");
    expect(r.Y).toBeCloseTo(0.137, 3); // Tedds Y = 0.137 in
    expect(r.T).toBeCloseTo(4.25, 1); // Tedds Tu = 4.2 kip (anchor sheet 4.25 kip)
    expect(r.Trod).toBeCloseTo(2.12, 1); // Tedds Trod = 2.1 kip
    expect(r.tReqBearing).toBeCloseTo(0.479, 3); // Tedds 0.479 in
    expect(r.x).toBeCloseTo(1.15, 3); // Tedds x = 1.150 in
    expect(r.tReqTension).toBeCloseTo(0.224, 3); // Tedds 0.224 in
    expect(r.rod.fv).toBeCloseTo(3.4, 2); // Tedds fv = 3.40 ksi
    expect(r.rod.ftb).toBeCloseTo(24.0, 1); // Tedds ftb = 24.0 ksi
    expect(r.rod.ft).toBeCloseTo(28.8, 1); // Tedds ft = 28.8 ksi
    expect(r.rod.FntPrime).toBeCloseTo(32.6, 1); // Tedds φF'nt = 32.6 ksi
  });

  it("base-plate anchor group, 4 – 3/4 in. F1554 Gr 36 headed, h_ef = 6 in., f'c = 4,000 psi (ACI 318)", () => {
    const a = designAnchorGroup(
      {
        d: 0.75,
        steel: ANCHOR_STEELS[0],
        type: "headed",
        Abrg: 1,
        hef: 6,
        nx: 2,
        ny: 2,
        sx: 8,
        sy: 8,
        edges: [24, 24, 24, 24],
        ha: 12,
        fc: 4000,
        cracked: true,
        condition: "B",
        seismic: false,
        groutPad: true,
        nShear: 2,
      },
      { Nua: 4250, nTension: 2, Vua: 3000 },
    );
    const m = (k: string) => [...a.tension, ...a.shear].find((x) => x.key === k)!;
    expect(a.Ase).toBeCloseTo(0.334, 3); // Tedds Ase = 0.334 in²
    expect(m("Nsa").nominal / 1000).toBeCloseTo(19.4, 1); // Tedds Nsa = 19.40 kip
    expect(m("Nsa").design / 1000).toBeCloseTo(14.55, 2); // Tedds φNsa = 14.55 kip
    expect(m("Ncbg").nominal / 1000).toBeCloseTo(32.22, 1); // Tedds Ncbg = 32.22 kip (A_Nc = 468 in²)
    expect(m("Npn").nominal / 1000).toBeCloseTo(32.0, 1); // Tedds Np = 32.00 kip
    expect(m("Vsa").nominal / 1000).toBeCloseTo(18.62, 1); // Tedds Vsa = 18.62 kip (0.8 grout pad)
    expect(m("Vsa").design / 1000).toBeCloseTo(12.1, 1); // Tedds φVsa = 12.10 kip
  });

  it("anchor bolt shear, 4 – 3/4 in. hooked, 12 in. grid, 36 in. pier, SDC D (Tedds ANCHOR BOLT sheet)", () => {
    const a = designAnchorGroup(
      {
        d: 0.75,
        steel: ANCHOR_STEELS[0],
        type: "hooked",
        eh: 3,
        hef: 6,
        nx: 2,
        ny: 2,
        sx: 12,
        sy: 12,
        edges: [18, 18, 18, 18],
        ha: 12,
        fc: 4000,
        cracked: true,
        condition: "A",
        seismic: true,
        groutPad: true,
        nShear: 2,
      },
      { Nua: 0, nTension: 0, Vua: 1300 },
    );
    const m = (k: string) => a.shear.find((x) => x.key === k)!;
    expect(m("Vcbg").nominal / 1000).toBeCloseTo(19.32, 1); // Tedds Vcbg = 19.32 kip (c'a1 = 8 in.)
    expect(m("Vcbg").design / 1000).toBeCloseTo(10.87, 1); // Tedds φVcbg = 0.75 × 0.75 × 19.32 = 10.87 kip
    expect(m("Vcpg").nominal / 1000).toBeCloseTo(74.36, 1); // Tedds Vcpg = 74.36 kip (A_Nc = 540 in²)
    expect(m("Vcpg").design / 1000).toBeCloseTo(39.04, 1); // Tedds φVcpg = 39.04 kip
  });
});

describe("steel members — closed form", () => {
  it("simple-span W8x18, 16 ft, L_b = 16 ft: LTB with C_b = 1.14 under uniform load", () => {
    const r = designSteelBeam(ctx, {
      id: "b",
      mark: "SB-2",
      description: "",
      role: "beam",
      shape: "W8x18",
      grade: "A992",
      method: "LRFD",
      spans: [16],
      area: [],
      walls: [],
      extra: [
        { kind: "line", type: "D", label: "D", w: 300 },
        { kind: "line", type: "L", label: "L", w: 400 },
      ],
      Lb: 16,
      deflection: { preset: "floor" },
      selfWeight: false,
      bearing: [{ lb: 3.5, support: "wood", species: "DF-L", grade: "No.1", size: "6x6" }],
    });
    const row = r.rows.find((x) => x.combo.label.startsWith("1.2D + 1.6L"))!;
    const w = 1.2 * 0.3 + 1.6 * 0.4;
    expect(row.Mpos).toBeCloseTo((w * 256) / 8, 2);
    expect(row.gov.Cb).toBeCloseTo(1.136, 2);
    // L_b = 16 ft > L_r → elastic LTB (F2-3)
    expect(row.gov.flex.Lr! / 12).toBeLessThan(16);
    // deflection under L: 5wL⁴/384EI
    const dL = (5 * (400 / 12) * (16 * 12) ** 4) / (384 * 29e6 * 61.9);
    expect(r.deflection[0].live).toBeCloseTo(dL, 3);
    expect(r.bearingChecks[0].wood!.f).toBeCloseTo((700 * 8) / (5.25 * 3.5), 0);
  });

  it("HSS column with eccentric top load: M = P e at the top, C_m = 0.6", () => {
    const r = designSteelColumn(ctx, {
      id: "c",
      mark: "SC-1",
      description: "",
      shape: "HSS4x4x1/4",
      grade: "A500C",
      method: "LRFD",
      height: 10,
      Kx: 1,
      Ky: 1,
      extra: [
        { kind: "point", type: "D", label: "Beam", P: 6000 },
        { kind: "point", type: "L", label: "Beam", P: 8000 },
      ],
      ex: 0,
      ey: 2,
      selfWeight: false,
    });
    const row = r.rows.find((x) => x.combo.label.startsWith("1.2D + 1.6L"))!;
    const Pu = 1.2 * 6 + 1.6 * 8;
    expect(row.Pr).toBeCloseTo(Pu, 3);
    expect(row.Mx).toBeCloseTo((Pu * 2) / 12, 3);
    expect(row.B1x).toBe(1);
    expect(r.reactions[0].byType.D).toBe(6000);
  });

  it("fixed-end solver: propped cantilever reaction 5wL/8 and fixed-end moment wL²/8", () => {
    const a = analyseBeam({ spans: [10], fixedLeft: true }, 1e9, [{ type: "D", kind: "udl", x1: 0, x2: 10, w1: 1000 }]);
    expect(a.byType.D.R[0]).toBeCloseTo(6250, 1);
    expect(a.byType.D.R[1]).toBeCloseTo(3750, 1);
    expect(a.byType.D.Mr[0]).toBeCloseTo(12500, 0);
    expect(Math.min(...a.byType.D.M)).toBeCloseTo(-12500, 0);
  });
});

describe("portfolio parity — 45324 Indian Well 2x12 ledger (Tedds Simple ledger design, NDS 2018)", () => {
  const base = {
    id: "lg",
    mark: "LG-1",
    description: "",
    ledger: { species: "DF-L" as const, grade: "No.2" as const, size: "2x12" },
    extra: [
      { kind: "line" as const, type: "D" as const, label: "Roof dead", w: 15 },
      { kind: "line" as const, type: "L" as const, label: "Live", w: 20 },
    ],
    lateral: { W: 150, E: 50 },
    support: { kind: "cmu" as const, Fe: 6000, embed: 6 },
    continuity: 1.25,
  };
  it("1/2 in. A307 bolt @ 24 in. into grouted CMU, D + L: yield modes and Z reproduce Tedds with F_yb = 22.5 ksi", () => {
    const r = designLedger(ctx, { ...base, fastener: { type: "bolt", D: 0.5, Fyb: 22500, spacing: 24 } });
    const row = r.rows.find((x) => x.combo === "D + L")!;
    expect(row.Rv).toBeCloseTo(87.5, 2); // Tedds V_v,bolt = 87.5 lb
    expect(row.theta).toBeCloseTo(90, 3);
    expect(row.Fes).toBeCloseTo(3157.56, 1); // Tedds Fe⊥ = 3157.56 psi
    expect(row.yield.Re).toBeCloseTo(1.9, 2);
    expect(row.yield.Ktheta).toBeCloseTo(1.25, 3);
    expect(row.yield.k1).toBeCloseTo(2.32, 2);
    expect(row.yield.k2).toBeCloseTo(1.43, 2);
    expect(row.yield.k3).toBeCloseTo(1.03, 2);
    expect(row.yield.modes.Im).toBeCloseTo(3600.01, 0);
    expect(row.yield.modes.Is).toBeCloseTo(473.63, 1);
    expect(row.yield.modes.II).toBeCloseTo(1220.56, 0);
    expect(row.yield.modes.IIIm).toBeCloseTo(1336.43, 0);
    expect(row.yield.modes.IIIs).toBeCloseTo(298.17, 1); // Tedds Z = 298.17 lb (Mode IIIs)
    expect(row.yield.modes.IV).toBeCloseTo(348.17, 1);
    expect(row.ratio).toBeCloseTo(0.293, 3); // Tedds V/Z' = 0.293
    expect(row.M * 12).toBeCloseTo(210, 1); // Tedds M = 210 lb-in
    expect(row.fb).toBeCloseTo(6.64, 2); // Tedds fb = 6.64 psi
  });
  it("same bolt with the NDS bolt bending yield strength F_yb = 45 ksi: Z = 370.6 lb (Tedds result is conservative)", () => {
    const r = designLedger(ctx, { ...base, fastener: { type: "bolt", D: 0.5, Fyb: 45000, spacing: 24 } });
    const row = r.rows.find((x) => x.combo === "D + L")!;
    expect(row.yield.Z).toBeCloseTo(370.6, 0);
    expect(row.yield.mode).toBe("IIIs");
    // lateral combination: D + 0.6W → resultant at a small angle to grain, C_D = 1.6
    const w = r.rows.find((x) => x.combo === "D + 0.6W")!;
    expect(w.Rh).toBeCloseTo(0.6 * 150 * 2, 3);
    expect(w.CD).toBe(1.6);
  });
});

describe("FTAO shear wall (Diekmann)", () => {
  it("12 ft wall, 6 ft opening, 3 ft piers, h = 9 ft: v_p, v_ab, H and strap force", () => {
    const dem: ShearWallDemand = {
      lineName: "Line 1",
      share: 1,
      Eh: 3000,
      QE: 3000,
      W: 0,
      rho: 1,
      SDS: 1,
      Cd: 4,
      Ie: 1,
      Omega0: 3,
      hsx: 9,
      driftFactor: 0.02,
      seismicSDC: "D",
    };
    const r = designShearWall(
      ctx,
      {
        id: "sw",
        mark: "1SW-9",
        description: "",
        lineId: "l1",
        b: 12,
        h: 9,
        sides: [{ key: "SI-15/32-8d", spacing: 4 }],
        stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: 16 },
        endPost: { size: "2x4", plies: 2, holeDia: 1 },
        top: { D: 100, L: 0, Lr: 0, S: 0 },
        self: { psf: 10 },
        overturning: "full",
        holdownId: "HDU2-SDS2.5",
        sill: { type: "cast-in", d: 0.625, spacing: 32, embed: 7, edge: 1.75 },
        sillSize: "2x4",
        windService: { factor: 0.42, limitN: 600 },
        opening: { L1: 3, Lo: 6, L2: 3, ha: 1.5, hb: 3, strapId: "CS16" },
      },
      dem,
    );
    const f = r.ftao!;
    expect(f.ho).toBe(4.5);
    expect(f.v.s).toBeCloseTo(175, 6); // 0.7 × 3000 / 12
    expect(f.vp.s).toBeCloseTo(350, 6); // 2100 / 6
    expect(f.H.s).toBeCloseTo(1575, 6); // 2100 × 9 / 12
    expect(f.vab.s).toBeCloseTo(350, 6); // 1575 / 4.5
    expect(f.F.s).toBeCloseTo(525, 6); // (350 − 175) × 3
    expect(f.pierAspect).toBeCloseTo(1.5, 6);
    expect(r.vS).toBeCloseTo(350, 6);
    expect(f.strap!.ratio).toBeCloseTo(525 / 1705, 4);
  });
});

describe("diaphragms and collectors", () => {
  const dem = (walls: Array<{ mark: string; L: number; x?: number }>): DiaphragmDemand => ({
    storyName: "First story",
    Fpx: 6000,
    FpxCalc: 5000,
    FpxMin: 6000,
    FpxMax: 12000,
    Fw: 4000,
    Dspan: 24,
    Dpar: 40,
    lines: [
      { id: "a", name: "LN1", pos: 0, walls },
      { id: "b", name: "LN2", pos: 24, walls: [{ mark: "SW-2", L: 40, x: 0 }] },
    ],
    Omega0: 3,
    lightFrame: true,
    SDC: "D",
  });
  const spec = {
    id: "rd",
    mark: "RD-1",
    description: "",
    level: "roof" as const,
    storyId: "ST1",
    dir: "X" as const,
    sheathing: "SH-15/32-8d",
    blocked: false,
    edge: "6/6" as const,
    unblockedCase: 1 as const,
    chord: {
      species: "DF-L" as const,
      grade: "No.2" as const,
      size: "2x6",
      splice: { type: "nails" as const, nail: "16d-common", nails: 12 },
    },
    collectorOmega: false,
  };
  it("simple span between two lines: v = wL/2D, chord T = wL²/8D, collector bound v_d (D − ΣL_w)", () => {
    const r = designDiaphragm(ctx, spec, dem([{ mark: "SW-1", L: 12 }]));
    expect(r.wE).toBeCloseTo(250, 6);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].RE).toBeCloseTo(3000, 6);
    expect(r.segments[0].vE).toBeCloseTo(75, 6);
    expect(r.segments[0].TE).toBeCloseTo(450, 6);
    expect(r.values.vs).toBe(480); // unblocked case 1, 15/32 rated sheathing 8d (VERIFY table value)
    const c = r.collectors[0];
    expect(c.FE).toBeCloseTo(75 * 28, 6);
    expect(c.omega).toBe(1); // light-frame exception
    expect(c.Fasd).toBeCloseTo(0.7 * 2100, 6);
  });
  it("collector profile from wall positions: two 6 ft walls at the ends of a 40 ft line", () => {
    const r = designDiaphragm(
      ctx,
      spec,
      dem([
        { mark: "SW-1", L: 6, x: 0 },
        { mark: "SW-3", L: 6, x: 34 },
      ]),
    );
    expect(r.collectors[0].exact).toBe(true);
    expect(r.collectors[0].FE).toBeCloseTo(1050, 6);
  });
  it("Ω0 on collectors when the exception is not taken", () => {
    const r = designDiaphragm(ctx, { ...spec, collectorOmega: true }, dem([{ mark: "SW-1", L: 12 }]));
    expect(r.collectors[0].omega).toBe(3);
  });
  it("tributary widths from line positions", () => {
    const t = computedTribs(
      [
        { id: "1", name: "A", storyId: "s", dir: "X", trib: 1, pos: 0 },
        { id: "2", name: "B", storyId: "s", dir: "X", trib: 1, pos: 10 },
        { id: "3", name: "C", storyId: "s", dir: "X", trib: 1, pos: 24 },
      ],
      24,
    );
    expect(t.map((x) => x.trib)).toEqual([5, 12, 7]);
  });
});

describe("rigid diaphragm distribution", () => {
  it("symmetric plan: direct share 0.5 V plus accidental torsion T k d / J", () => {
    const r = rigidDistribution(
      [
        { id: "x1", dir: "X", pos: 0, k: 1 },
        { id: "x2", dir: "X", pos: 24, k: 1 },
        { id: "y1", dir: "Y", pos: 0, k: 1 },
        { id: "y2", dir: "Y", pos: 40, k: 1 },
      ],
      1000,
      "X",
      { x: 20, y: 12 },
      { Lx: 40, Ly: 24 },
      true,
    );
    const J = 2 * 144 + 2 * 400;
    const tor = (1000 * 1.2 * 12) / J;
    const x2 = r.lines.find((l) => l.id === "x2")!;
    expect(x2.direct).toBeCloseTo(500, 6);
    expect(x2.total).toBeCloseTo(500 + tor, 6);
    const y2 = r.lines.find((l) => l.id === "y2")!;
    expect(y2.total).toBeCloseTo((1000 * 1.2 * 20) / J, 6);
    expect(r.torsionRatio).toBeCloseTo((500 + tor) / 500, 6);
  });
  it("stiffer line attracts load and shifts the centre of rigidity", () => {
    const r = rigidDistribution(
      [
        { id: "x1", dir: "X", pos: 0, k: 3 },
        { id: "x2", dir: "X", pos: 24, k: 1 },
      ],
      1000,
      "X",
      { x: 20, y: 12 },
      { Lx: 40, Ly: 24 },
      false,
    );
    expect(r.cr.y).toBeCloseTo(6, 6);
    // e = 6 ft: T = 6000; J = 3 × 36 + 1 × 324 = 432; line x2 d = 18
    const x2 = r.lines.find((l) => l.id === "x2")!;
    expect(x2.total).toBeCloseTo(250 + (6000 * 18) / 432, 6);
  });
});

describe("shear transfer and uplift path", () => {
  it("clip transfer: required spacing = 12 F1 / v", () => {
    const r = designTransfer(
      ctx,
      {
        id: "st",
        mark: "ST-1",
        description: "",
        interface: "diaphragm-to-wall",
        connector: { type: "clip", hardwareId: "H2.5A", direction: "F1" },
        spacing: 16,
      },
      { sourceText: "LN1", vS: 60, vW: 40 },
    );
    expect(r.perFastener).toBeCloseTo(80, 6);
    expect(r.sReq).toBeCloseTo(22, 6);
  });
  it("uplift chain: 0.6D + 0.6W at each level with the dead load above", () => {
    const r = designUplift(ctx, {
      id: "up",
      mark: "UP-1",
      description: "",
      sourceMark: "R-1 A",
      perFoot: loadVector({ D: 60, W: -200 }),
      levels: [
        { label: "Rafter to plate", deadAbove: 0, connector: { type: "hardware", hardwareId: "H2.5A" }, spacing: 24 },
        { label: "Floor to floor", deadAbove: 100, connector: { type: "hardware", hardwareId: "CS16" }, spacing: 48 },
      ],
    });
    expect(r.rows[0].qNet).toBeCloseTo(-84, 6);
    expect(r.rows[0].F).toBeCloseTo(168, 6);
    expect(r.rows[1].qNet).toBeCloseTo(-24, 6);
    expect(r.rows[1].F).toBeCloseTo(96, 6);
    expect(r.rows[0].capacity).toBe(535);
  });
  it("general dowel yield: modes match the nail routine for a wood-to-wood bolt", () => {
    const y = dowelYieldSingle({ D: 0.5, Fyb: 45000, ls: 1.5, Fes: 5600, lm: 3.5, Fem: 5600, thetaDeg: 0 });
    // hand calculation, 1/2 in. bolt, 1-1/2 in. side / 3-1/2 in. main, G = 0.50, θ = 0: Mode IIIs
    // k3 = −1 + √(4 + 2·45000·3·0.25/(3·5600·2.25)) = 1.405; Z = k3 D ls Fem / (3 × 3.2) = 614.7 lb
    expect(y.mode).toBe("IIIs");
    expect(y.Z).toBeCloseTo(614.7, 0);
  });
});

describe("example house — Phase 3 load path", () => {
  it("designs every member, carries every reaction and applies the envelope distribution", async () => {
    const { exampleProject } = await import("@/engine/project/example");
    const { designProject } = await import("@/engine/project/design");
    const { packageChecks } = await import("@/components/report/package");
    const p = exampleProject();
    const d = designProject(p);
    const errors = [...d.outcomes.values()].filter((o) => o.error).map((o) => `${o.spec.mark}: ${o.error}`);
    expect(errors).toEqual([]);
    expect([...d.outcomes.values()].every((o) => o.result!.pass)).toBe(true);
    const checks = packageChecks(p, d);
    expect(checks.filter((c) => !c.ok).map((c) => c.text)).toEqual([expect.stringMatching(/VERIFY/)]);
    // envelope: rigid forces (with accidental torsion) govern on every line of the symmetric plan
    for (const l of d.lateral!.lines) {
      expect(l.rigid).toBeDefined();
      expect(l.Eh).toBeGreaterThanOrEqual(l.flex.Eh - 1e-6);
    }
    const sw1 = d.outcomes.get("m-sw1")!.result!;
    expect(sw1.kind === "shearWall" && sw1.ftao).toBeTruthy();
    const bp = d.outcomes.get("m-bp1")!.result!;
    const sc = d.outcomes.get("m-sc1")!.result!;
    expect(bp.kind === "basePlate" && sc.kind === "steelColumn").toBe(true);
    if (bp.kind === "basePlate" && sc.kind === "steelColumn")
      expect(bp.input.P.D).toBeCloseTo(sc.reactions[0].byType.D, 6);
  });
});
