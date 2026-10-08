/**
 * Phase 3 engine vs. independent reference (verification/reference_p3.py →
 * reference_p3.json, written from the code text without reading the engine).
 * Tolerance 0.1 % relative unless noted.
 */

import { describe, expect, it } from "vitest";
import ref from "../verification/reference_p3.json";
import { steelShape } from "@/engine/data/steel";
import { ANCHOR_STEELS } from "@/engine/design/anchors";
import { designAnchorGroup } from "@/engine/design/anchorGroup";
import { designBasePlate } from "@/engine/design/basePlate";
import { dowelBearingAngle, dowelYieldSingle } from "@/engine/design/dowel";
import * as S from "@/engine/design/steel";
import { defaultHardware } from "@/engine/data/hardware";
import { defaultAssemblies } from "@/engine/loads/dead";
import { rigidDistribution } from "@/engine/lateral/rigid";
import type { DesignContext } from "@/engine/members";
import { designDiaphragm } from "@/engine/members/diaphragm";
import { designShearWall } from "@/engine/members/shearWall";
import { designSteelBeam, designSteelColumn } from "@/engine/members/steel";

const close = (actual: number, expected: number, rel = 1e-3) => {
  const tol = Math.max(Math.abs(expected) * rel, 1e-6);
  expect(Math.abs(actual - expected), `actual ${actual} vs reference ${expected}`).toBeLessThanOrEqual(tol);
};

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

describe("Phase 3 engine vs. independent Python reference", () => {
  it("W8x18 simple span, L_b = 16 ft, LRFD", () => {
    const r = designSteelBeam(ctx, {
      id: "b",
      mark: "SB",
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
      bearing: [{ lb: 4, support: "steel" }],
    });
    const x = ref.steel_beam;
    const row = r.rows.find((k) => k.combo.label.startsWith("1.2D + 1.6L"))!;
    close(row.Mpos, x.Mu_kipft);
    close(row.gov.Cb, x.Cb);
    close(row.gov.flex.Lp! / 12, x.Lp_ft);
    close(row.gov.flex.Lr! / 12, x.Lr_ft);
    close(row.gov.flex.Mn / 12, x.Mn_kipft);
    close(row.gov.Mc, x.phiMn_kipft);
    close(row.Vc, x.phiVn_kip);
    close(r.deflection[0].live, x.deltaL_in);
  });

  it("HSS properties from geometry", () => {
    for (const [name, v] of Object.entries(ref.hss_props)) {
      const s = steelShape(name);
      close(s.A, v.A);
      close(s.Ix, v.I);
      close(s.Zx, v.Z);
      close(s.J, v.J);
    }
  });

  it("HSS4x4x1/4 column, eccentric top load (H1)", () => {
    const r = designSteelColumn(ctx, {
      id: "c",
      mark: "SC",
      description: "",
      shape: "HSS4x4x1/4",
      grade: "A500C",
      method: "LRFD",
      height: 10,
      Kx: 1,
      Ky: 1,
      extra: [
        { kind: "point", type: "D", label: "D", P: 6000 },
        { kind: "point", type: "L", label: "L", P: 8000 },
      ],
      ex: 0,
      ey: 2,
      selfWeight: false,
    });
    const x = ref.hss_column;
    const row = r.rows.find((k) => k.combo.label.startsWith("1.2D + 1.6L"))!;
    close(row.Pr, x.Pu_kip);
    close(row.Mx, x.Mux_kipft);
    close(row.B1x, x.B1);
    close(r.Pc, x.Pc_kip);
    close(r.Mcx, x.Mcx_kipft);
    close(row.inter.ratio, x.H1_ratio);
  });

  it("HSS6x6x1/8 slender walls (E7)", () => {
    const c = S.compression(steelShape("HSS6x6x1/8"), 50, 29000, 120, 120);
    const x = ref.hss_slender;
    expect(c.slender).toBe(true);
    close(c.Fcr, x.Fcr_ksi);
    close(c.Ae, x.Ae_in2);
    close(c.Pn, x.Pn_kip);
  });

  it("base plate, small moment (DG1)", () => {
    const r = designBasePlate(
      {
        method: "LRFD",
        col: steelShape("HSS6x6x1/4"),
        N: 14,
        B: 14,
        tp: 1,
        Fy: 36,
        fc: 3,
        A2: 196,
        rod: { d: 0.75, Fu: 58, nTension: 2, nShear: 4, e1: 2, groutPad: false, washer: 0 },
        weld: { w: 0.25, FEXX: 70 },
      },
      { P: 60, M: 120, V: 0 },
    );
    const x = ref.base_plate_small;
    expect(r.regime).toBe("small");
    close(r.fpMax, x.fpmax_ksi);
    close(r.qMax, x.qmax_kipin);
    close(r.e, x.e_in);
    close(r.ecrit, x.ecrit_in);
    close(r.Y, x.Y_in);
    close(r.q, x.q_kipin);
    close(r.l, x.l_in);
    close(r.tReqBearing, x.tp_req_in);
  });

  it("anchor group: tension breakout, shear Cases 1 and 2, pryout", () => {
    const a = designAnchorGroup(
      {
        d: 0.75,
        steel: ANCHOR_STEELS[0],
        type: "headed",
        Abrg: 0.654,
        hef: 8,
        nx: 2,
        ny: 2,
        sx: 6,
        sy: 6,
        edges: [10, 8, 30, 30],
        ha: 18,
        fc: 3000,
        cracked: true,
        condition: "B",
        seismic: false,
        groutPad: false,
      },
      { Nua: 6000, nTension: 2, Vua: 4000 },
    );
    const x = ref.anchor_group;
    const m = (k: string) => [...a.tension, ...a.shear].find((y) => y.key === k)!;
    close(a.Ase, x.Ase);
    close(m("Nsa").nominal, x.Nsa_lb);
    close(m("Ncbg").nominal, x.Ncbg_lb);
    close(m("Npn").nominal, x.Np_lb);
    close(m("Vsa").nominal, x.Vsa_lb);
    close(m("Vcbg").nominal, x.Vcbg_case2_lb);
    close(m("Vcbg1").nominal, x.Vcbg_case1_lb);
    close(m("Vcbg1").demand, 2000);
    close(m("Vcpg").nominal, x.Vcpg_lb);
  });

  it("ledger: 1/2 in. lag into DF-L, θ = 90°, D + Lr", () => {
    const x = ref.ledger;
    const Fe = dowelBearingAngle(0.5, 0.5, 90).Fe;
    close(Fe, x.Fe_psi);
    const y = dowelYieldSingle({ D: 0.5, Fyb: 45000, ls: 1.5, Fes: Fe, lm: 3, Fem: Fe, thetaDeg: 90 });
    close(y.k1, x.k1);
    close(y.k2, x.k2);
    close(y.k3, x.k3);
    close(y.modes.Im, x.Z_Im);
    close(y.modes.Is, x.Z_Is);
    close(y.modes.II, x.Z_II);
    close(y.modes.IIIm, x.Z_IIIm);
    close(y.modes.IIIs, x.Z_IIIs);
    close(y.modes.IV, x.Z_IV);
    close(y.Z * 1.25, x.Zprime);
  });

  it("FTAO (Diekmann)", () => {
    const r = designShearWall(
      ctx,
      {
        id: "sw",
        mark: "SW",
        description: "",
        lineId: "l",
        b: 22,
        h: 9,
        sides: [{ key: "SI-15/32-8d", spacing: 4 }],
        stud: { species: "DF-L", grade: "No.2", size: "2x6", spacing: 16 },
        endPost: { size: "2x6", plies: 2, holeDia: 0.75 },
        top: { D: 100, L: 0, Lr: 0, S: 0 },
        self: { psf: 10 },
        overturning: "full",
        holdownId: "HDU2-SDS2.5",
        sill: { type: "cast-in", d: 0.625, spacing: 32, embed: 7, edge: 1.75 },
        sillSize: "2x6",
        windService: { factor: 0.42, limitN: 600 },
        opening: { L1: 4, Lo: 6, L2: 12, ha: 2.33, hb: 3 },
      },
      {
        lineName: "L",
        share: 1,
        Eh: 4000,
        QE: 4000,
        W: 2500,
        rho: 1,
        SDS: 1,
        Cd: 4,
        Ie: 1,
        Omega0: 3,
        hsx: 9,
        driftFactor: 0.02,
        seismicSDC: "D",
      },
    );
    const f = r.ftao!;
    const x = ref.ftao;
    close(f.v.s, x.v_s);
    close(f.v.w, x.v_w);
    close(f.vp.s, x.vp_s);
    close(f.vp.w, x.vp_w);
    close(f.H.s, x.H_s);
    close(f.H.w, x.H_w);
    close(f.vab.s, x.vab_s);
    close(f.vab.w, x.vab_w);
    close(f.F.s, x.F_s);
    close(f.F.w, x.F_w);
    close(f.pierAspect, x.pier_aspect);
  });

  it("diaphragm: two spans, line reactions, collectors", () => {
    const r = designDiaphragm(
      ctx,
      {
        id: "rd",
        mark: "RD",
        description: "",
        level: "roof",
        storyId: "s",
        dir: "X",
        sheathing: "SH-15/32-8d",
        blocked: false,
        edge: "6/6",
        unblockedCase: 1,
        chord: {
          species: "DF-L",
          grade: "No.2",
          size: "2x6",
          splice: { type: "nails", nail: "16d-common", nails: 12 },
        },
        collectorOmega: false,
      },
      {
        storyName: "s",
        Fpx: 7200,
        FpxCalc: 7200,
        FpxMin: 0,
        FpxMax: 1e9,
        Fw: 5000,
        Dspan: 24,
        Dpar: 40,
        lines: [
          { id: "a", name: "0", pos: 0, walls: [{ mark: "w0", L: 20 }] },
          {
            id: "b",
            name: "10",
            pos: 10,
            walls: [
              { mark: "w1", L: 8, x: 0 },
              { mark: "w2", L: 8, x: 32 },
            ],
          },
          { id: "c", name: "24", pos: 24, walls: [{ mark: "w3", L: 40, x: 0 }] },
        ],
        Omega0: 3,
        lightFrame: true,
        SDC: "D",
      },
    );
    const x = ref.diaphragm;
    r.segments.forEach((s, i) => {
      const e = x.segs[i];
      close(s.L, e.L);
      close(s.RE, e.RE);
      close(s.RW, e.RW);
      close(s.vE, e.vE);
      close(s.vW, e.vW);
      close(s.TE, e.TE);
      close(s.TW, e.TW);
    });
    const c = (name: string) => r.collectors.find((k) => k.line === name)!;
    for (const k of ["0", "10", "24"] as const) {
      close(c(k).RE, x.line_R[k].E);
      close(c(k).RW, x.line_R[k].W);
    }
    close(c("10").FE, x.collector_10.FE);
    close(c("10").FW, x.collector_10.FW);
    close(c("10").Fasd, x.collector_10.Fasd);
    close(c("0").FE, x.collector_0_bound.FE);
  });

  it("rigid diaphragm with accidental torsion", () => {
    const r = rigidDistribution(
      [
        { id: "y0", dir: "X", pos: 0, k: 2 },
        { id: "y10", dir: "X", pos: 10, k: 1.5 },
        { id: "y24", dir: "X", pos: 24, k: 1 },
        { id: "x0", dir: "Y", pos: 0, k: 1 },
        { id: "x40", dir: "Y", pos: 40, k: 2 },
      ],
      10000,
      "X",
      { x: 20, y: 12 },
      { Lx: 40, Ly: 24 },
      true,
    );
    const x = ref.rigid;
    const f = (id: string) => r.lines.find((l) => l.id === id)!.total;
    close(r.cr.y, x.y_cr);
    close(r.cr.x, x.x_cr);
    close(r.e, x.e);
    close(r.J, x.J);
    close(f("y0"), x.X_y0);
    close(f("y10"), x.X_y10);
    close(f("y24"), x.X_y24);
    close(f("x0"), x.Y_x0);
    close(f("x40"), x.Y_x40);
  });
});
