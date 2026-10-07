/**
 * Phase 2 engine vs. independent reference (verification/reference_p2.py →
 * reference_p2.json, written from the code text without reading the engine).
 * Tolerance 0.1 % relative unless noted.
 */

import { describe, expect, it } from "vitest";
import ref from "../verification/reference_p2.json";
import { anchorTension, boltInConcrete, ANCHOR_STEELS } from "@/engine/design/anchors";
import { defaultHardware } from "@/engine/data/hardware";
import { defaultAssemblies } from "@/engine/loads/dead";
import { analyseLateral } from "@/engine/lateral/analysis";
import type { DesignContext } from "@/engine/members";
import { designFooting } from "@/engine/members/footing";
import { designPost } from "@/engine/members/post";
import { designShearWall } from "@/engine/members/shearWall";
import { designWall } from "@/engine/members/wall";

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

describe("Phase 2 engine vs. independent Python reference", () => {
  it("W1 stud wall", () => {
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
      ],
      wind: { mode: "entered", psf: 20 },
      deflN: 240,
      packs: [],
      openings: [],
    });
    const row = (l: string) => r.typical.col.rows.find((x) => x.combo.label === l)!;
    const a = row("D + Lr");
    close(a.P, ref.W1_DLr_P);
    close(a.fc, ref.W1_DLr_fc);
    close(a.FcStar, ref.W1_DLr_FcStar);
    close(a.FcE1, ref.W1_DLr_FcE);
    close(a.CP, ref.W1_DLr_CP);
    close(a.FcPrime, ref.W1_DLr_FcPrime);
    close(a.interaction, ref.W1_DLr_interaction);
    for (const [label, k] of [
      ["D + 0.6W", "DW"],
      ["D + 0.75L + 0.45W + 0.75Lr", "DLW"],
    ] as const) {
      const x = row(label);
      const g = (s: string) => (ref as Record<string, number>)[`W1_${k}_${s}`];
      close(x.P, g("P"));
      close(x.fc, g("fc"));
      close(x.CP, g("CP"));
      close(x.FcPrime, g("FcPrime"));
      close(x.fb, g("fb"));
      close(x.FbPrime, g("FbPrime"));
      close(x.interaction, g("interaction"));
    }
    close(r.typical.bearing.fcperp, ref.W1_fcperp);
    close(r.typical.bearing.Fprime, ref.W1_FcperpPrime);
    close(r.deflection.delta0, ref.W1_delta0);
    close(r.deflection.Pcr, ref.W1_Pcr);
    close(r.deflection.delta, ref.W1_delta);
    close(r.deflection.limit, ref.W1_limit);
  });

  it("P1 built-up nailed column, NDS 15.3", () => {
    const r = designPost(ctx, {
      id: "p",
      mark: "P-1",
      description: "",
      material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x6", plies: 3 },
      builtUp: "nailed",
      height: 10,
      Ke: 1,
      extra: [
        { kind: "point", type: "D", label: "Beam", P: 4000 },
        { kind: "point", type: "L", label: "Beam", P: 3000 },
      ],
      bearing: { on: "concrete" },
      selfWeight: false,
    });
    const row = r.col.rows.find((x) => x.combo.label === "D + L")!;
    close(row.FcE1, ref.P1_FcE_d);
    close(row.FcE2, ref.P1_FcE_b);
    close(row.CP, ref.P1_CP);
    close(row.FcPrime, ref.P1_FcPrime);
    close(row.fc, ref.P1_fc);
  });

  it("SW1 shear wall: unit shear, chord forces, end post, drift", () => {
    const r = designShearWall(
      ctx,
      {
        id: "sw",
        mark: "1SW-1",
        description: "",
        lineId: "l",
        b: 8,
        h: 9,
        sides: [{ key: "SI-15/32-8d", spacing: 4 }],
        stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: 16 },
        endPost: { size: "2x4", plies: 2, holeDia: 1 },
        top: { D: 200, L: 0, Lr: 0, S: 0 },
        self: { psf: 12 },
        overturning: "full",
        holdownId: "HDU5-SDS2.5",
        sill: { type: "cast-in", d: 0.625, spacing: 32, embed: 7, edge: 1.75 },
        sillSize: "2x4",
        windService: { factor: 0.42, limitN: 600 },
      },
      {
        lineName: "A",
        share: 1,
        Eh: 1.3 * 2308,
        QE: 2308,
        W: 2500,
        rho: 1.3,
        SDS: 1,
        Cd: 4,
        Ie: 1,
        Omega0: 3,
        hsx: 9,
        driftFactor: 0.02,
        seismicSDC: "D",
      },
    );
    close(r.vS, ref.SW1_vs);
    close(r.vW, ref.SW1_vw);
    const c = (l: string) => r.chord.find((x) => x.combo === l)!;
    close(c("(0.6 − 0.14 SDS)D + 0.7E").T, ref.SW1_T_seis);
    close(c("0.6D + 0.6W").T, ref.SW1_T_wind);
    close(c("(1.0 + 0.14 SDS)D + 0.7E").C, ref.SW1_C_seis);
    close(c("D + 0.6W").C, ref.SW1_C_wind);
    close(r.Tmax.seismic, ref.SW1_Tmax);
    close(r.compression.col.governing.FcPrime, ref.SW1_FcPrime);
    close(r.compression.col.governing.fc, ref.SW1_fc);
    close(r.drift.Td, ref.SW1_Td);
    close(r.drift.bend, ref.SW1_bend);
    close(r.drift.shear, ref.SW1_shear);
    close(r.drift.slip, ref.SW1_slip);
    close(r.drift.dxe, ref.SW1_dxe);
    close(r.drift.dx, ref.SW1_dx);
  });

  it("F1 plain strip footing, F2 reinforced pad", () => {
    const base = {
      description: "",
      depth: 18,
      fc: 2500,
      fy: 60000,
      cover: 3,
      qa: 1500,
      qaSource: "soils report",
      soilDensity: 110,
      stories: 1,
    };
    const f1 = designFooting(ctx, {
      ...base,
      id: "f1",
      mark: "F-1",
      type: "strip",
      B: 1.25,
      h: 12,
      soilOver: 6,
      c1: 5.5,
      extra: [
        { kind: "line", type: "D", label: "Wall", w: 800 },
        { kind: "line", type: "L", label: "Wall", w: 600 },
      ],
    });
    close(f1.quGov.qu, ref.F1_qu);
    close(f1.concrete.Mu / 12, ref.F1_Mu);
    close(f1.concrete.phiMn / 12, ref.F1_phiMn);
    close(f1.concrete.oneWay.Vu, ref.F1_Vu);
    close(f1.concrete.oneWay.phiVn, ref.F1_phiVn);
    close(f1.serviceGov.q, ref.F1_q);
    const f2 = designFooting(ctx, {
      ...base,
      id: "f2",
      mark: "PF-1",
      type: "pad",
      B: 2.5,
      L: 2.5,
      h: 12,
      c1: 5.5,
      c2: 5.5,
      rebar: { size: "#4", count: 3 },
      extra: [
        { kind: "point", type: "D", label: "Post", P: 6000 },
        { kind: "point", type: "L", label: "Post", P: 4000 },
      ],
    });
    close(f2.concrete.Mu, ref.F2_Mu);
    close(f2.concrete.phiMn, ref.F2_phiMn);
    close(f2.concrete.oneWay.Vu, ref.F2_Vu1);
    close(f2.concrete.oneWay.phiVn, ref.F2_phiVc1);
    close(f2.concrete.twoWay!.Vu, ref.F2_Vu2);
    close(f2.concrete.twoWay!.phiVn, ref.F2_phiVc2);
    // (3) #4 is below A_s,min = 0.0018 b h — the engine must flag it
    expect(f2.checks.find((c) => c.name.startsWith("Minimum reinforcement"))!.pass).toBe(false);
  });

  it("L1 seismic ELF and wind MWFRS (ASCE 7-16)", () => {
    const r = analyseLateral(
      {
        enabled: true,
        system: "wsp",
        rho: 1,
        TL: 8,
        driftLowRise: false,
        Lx: 40,
        Ly: 30,
        ridge: "X",
        pitch: 4,
        roofRise: 5,
        Ke: 1,
        stories: [{ id: "S1", name: "First", height: 9, items: [{ label: "All", kind: "lump", qty: 0, W: 30000 }] }],
        lines: [],
      },
      { cycleId: "2022", riskCategory: "II", SDS: 1, SD1: 0.6, V: 95, exposure: "B", Kzt: 1 },
      defaultAssemblies(),
    );
    close(r.cs.Ta, ref.L1_Ta);
    close(r.cs.Cs, ref.L1_Cs);
    close(r.dist.V, ref.L1_V);
    close(r.vp.Kz, ref.L1_Kh);
    close(r.vp.qEff, ref.L1_qh);
    close(r.a, ref.L1_a);
    const s = r.stories[0];
    close(s.windBands.Y.F, ref.L1_FY);
    close(s.windBands.Y.Fmin, ref.L1_FY_min);
    close(s.windBands.X.F, ref.L1_FX);
    close(s.windBands.X.Fmin, ref.L1_FX_min);
  });

  it("A1 ACI 318-19 anchor tension, B1 NDS bolt in concrete", () => {
    const t = anchorTension({
      d: 0.625,
      steel: ANCHOR_STEELS[0],
      hef: 10,
      edges: [6, 6, 30, 30],
      Abrg: 4 - (Math.PI / 4) * (0.625 + 1 / 16) ** 2,
      fc: 2500,
      cracked: true,
      seismic: true,
    });
    close(t.Ase, ref.A1_Ase);
    close(t.phiNsa, ref.A1_phiNsa);
    close(t.phiNcb, ref.A1_phiNcb);
    close(t.phiNpn, ref.A1_phiNpn);
    expect(t.phiNsb).toBeUndefined();
    close(t.phiNn, ref.A1_phiNn);
    const b = boltInConcrete(0.625, 1.5, 0.5, 7);
    close(b.modes.Im, ref.B1_Im);
    close(b.modes.Is, ref.B1_Is);
    close(b.modes.II, ref.B1_II);
    close(b.modes.IIIm, ref.B1_IIIm);
    close(b.modes.IIIs, ref.B1_IIIs);
    close(b.modes.IV, ref.B1_IV);
    close(b.Z, ref.B1_Z);
  });
});
