/**
 * Phase 5: fixes found by the portfolio validation (SDPWS combination rule, sheathing
 * rows, 15/32 in. footnote), the optional modules (RW retaining walls, GP guard posts,
 * CS cold-formed steel studs) and the deck options project.
 */

import { describe, expect, it } from "vitest";
import { asdCombinations, strengthCombinations } from "@/engine/core/combos";
import { defaultHardware } from "@/engine/data/hardware";
import { lumberData } from "@/engine/data/sawn";
import { steelShape } from "@/engine/data/steel";
import { designBasePlate } from "@/engine/design/basePlate";
import { shearMajor } from "@/engine/design/steel";
import { panel1532Shear, sheathingRow, sideValues } from "@/engine/data/sdpws";
import { defaultAssemblies } from "@/engine/loads/dead";
import type { DesignContext } from "@/engine/members";
import { designCfsWall, ssmaSection } from "@/engine/members/cfsWall";
import { designGuardPost, type GuardPostInput } from "@/engine/members/guardPost";
import { designRetainingWall, hookDevelopment, type RetainingWallInput } from "@/engine/members/retainingWall";
import { designShearWall, type ShearWallDemand, type ShearWallInput } from "@/engine/members/shearWall";
import { deckExampleProject, designProject, generateNotes } from "@/engine/project";

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

const dem: ShearWallDemand = {
  lineName: "L",
  share: 1,
  Eh: 40,
  QE: 40,
  W: 18,
  rho: 1,
  SDS: 1,
  Cd: 4,
  Ie: 1,
  Omega0: 3,
  hsx: 8,
  driftFactor: 0.02,
  seismicSDC: "D",
};
const wall = (sides: ShearWallInput["sides"], studSpacing = 16): ShearWallInput => ({
  id: "w",
  mark: "SW1",
  description: "",
  lineId: "l",
  b: 10,
  h: 8,
  sides,
  stud: { species: "DF-L", grade: "No.2", size: "2x4", spacing: studSpacing },
  endPost: { size: "2x4", plies: 2, holeDia: 1 },
  top: { D: 25, L: 20, Lr: 10, S: 0 },
  self: { psf: 12 },
  overturning: "endpost",
  sill: { type: "cast-in", d: 0.625, spacing: 48, embed: 7, edge: 1.75 },
  sillSize: "2x4",
  ka: 30000,
  windService: { factor: 1, limitN: 600 },
});

describe("SDPWS fixes from the portfolio validation", () => {
  it("wind: wood structural panel + gypsum wallboard on opposite faces is additive (4.3.3.2.1 exception)", () => {
    const r = designShearWall(
      ctx,
      wall([
        { key: "SH-7/16-8d-across", spacing: 4 },
        { key: "GWB-5/8-4-blocked", spacing: 4 },
      ]),
      dem,
    );
    // La Presa 1SW1 (Tedds): vsc = max(2 × 350, 760) = 760; vwc = 1065 + 350 = 1415
    expect(r.vsc).toBe(760);
    expect(r.vwc).toBe(1415);
    expect(r.windSum).toBe(true);
    // gypsum sheathing (not wallboard) is not additive: 1002 3rd St SW1 vwc = 1205
    const s = designShearWall(
      ctx,
      wall([
        { key: "SI-7/16-8d", spacing: 4, vsOverride: 860 },
        { key: "GSH-5/8-4/7-blocked", spacing: 4 },
      ]),
      dem,
    );
    expect(s.vwc).toBe(1205);
    expect(s.windSum).toBe(false);
  });

  it("unblocked gypsum is limited to 1.5:1; portfolio rows for 1/2 in. gypsum sheathing and particleboard", () => {
    expect(sheathingRow("GWB-1/2-4").maxAspect).toBe(1.5);
    expect(sideValues("GSH-1/2-2x8-4", 4)).toMatchObject({ vs: 150, vw: 150, Ga: 4 });
    expect(sideValues("GSH-1/2-4-blocked", 4)).toMatchObject({ vs: 350, vw: 350, Ga: 8.5 });
    expect(sideValues("PB-5/8-10d", 4)).toMatchObject({ vs: 610, vw: 855, Ga: 23 });
  });

  it("3/8 and 7/16 in. panels may take the 15/32 in. shear (Table 4.3A footnote), opt-in and flagged", () => {
    expect(panel1532Shear("SI-7/16-8d", 4)).toEqual({ vs: 860, key: "SI-15/32-8d" });
    expect(panel1532Shear("SH-3/8-6d", 4)).toBeUndefined(); // no 15/32 in. row with 6d nails
    const r = designShearWall(ctx, wall([{ key: "SI-7/16-8d", spacing: 4, panel1532: true }]), dem);
    expect(r.vsc).toBe(860);
    expect(r.vwc).toBe(1205);
    expect(r.Gac).toBe(21); // stiffness of the 7/16 in. panel
    expect(r.assumptions.some((a) => a.verify && /15\/32/.test(a.value))).toBe(true);
    expect(() => designShearWall(ctx, wall([{ key: "SI-7/16-8d", spacing: 4, panel1532: true }], 24), dem)).toThrow(
      /16 in/,
    );
  });
});

const rwBase = (): RetainingWallInput => ({
  id: "rw",
  mark: "RW-1",
  description: "",
  Hr: 4,
  stem: {
    material: "concrete",
    height: 4,
    t: 8,
    concrete: { fc: 2500, gamma: 150, cover: 2 },
    fy: 60000,
    vertical: { size: "#4", spacing: 12, layout: "offset", d: 5.75 },
    horizontal: { size: "#4", count: 1, spacing: 12 },
  },
  footing: {
    toe: 1,
    heel: 2,
    h: 12,
    fc: 2500,
    fy: 60000,
    coverBottom: 3,
    coverTop: 2,
    bottom: { size: "#4", spacing: 12 },
    top: { size: "#4", spacing: 12 },
    longitudinal: { size: "#4", count: 4 },
  },
  soil: {
    gamma: 120,
    efp: 35,
    efpSource: "test",
    surcharge: 0,
    seismic: { shape: "inverted", k: 20 },
    toeCover: 1,
    countToeSoil: false,
    neglectPassive: 1,
    passive: 150,
    friction: 0.25,
    qa: 1500,
    qaSource: "test",
    soilSource: "test",
  },
  extra: [],
  seismicSDC: "D",
});

describe("RW — cantilever retaining wall", () => {
  it("hand calculation: H_t = 5 ft, B = 3.667 ft, FS sliding 1.61 / OT 5.63, seismic 1.15 / 3.13", () => {
    const r = designRetainingWall(ctx, rwBase());
    // P_H = ½ × 35 × 5² = 437.5 lb/ft; W_r = 400 + 550 + 960 = 1,910 lb/ft; P_p = ½ × 150 × (2² − 1²) = 225
    const st = r.stability[0];
    expect(st.H).toBeCloseTo(437.5, 6);
    expect(st.Wr).toBeCloseTo(1910, 6);
    expect(st.passive).toBeCloseTo(225, 6);
    expect(st.FSs).toBeCloseTo(702.5 / 437.5, 6);
    expect(st.Mo).toBeCloseTo(437.5 * (5 / 3), 6);
    expect(st.Mr).toBeCloseTo(400 * (1 + 1 / 3) + 550 * (3.6667 / 2) + 960 * (1 + 2 / 3 + 1), 0);
    const se = r.stability[1];
    expect(se.FSreq).toBe(1.1);
    expect(se.H).toBeCloseTo(437.5 + 0.7 * 250, 6); // ½ × 20 × 5² = 250 at 2H/3
    // (1 + 0.14 S_DS) D + 0.7E + H: P = 1.14 × 2,030; q_max = 993 psf
    const b = r.bearing.find((x) => x.combo.id === "A8")!;
    expect(b.P).toBeCloseTo(1.14 * 2030, 6);
    expect(b.qmax).toBeCloseTo(993.03, 1);
  });

  it("concrete stem uses the one-way slab minimums (ACI 318-19 13.3.6.1), not wall Table 11.6.1", () => {
    const r = designRetainingWall(ctx, rwBase());
    expect(r.checks.some((c) => /Table 11\.6\.1/.test(c.name))).toBe(false);
    const v = r.checks.find((c) => /Stem — vertical A_s ≥ 0\.0018/.test(c.name))!;
    expect(v.demand).toBeCloseTo(0.0018 * 12 * 8, 6);
    expect(v.capacity).toBeCloseTo(0.2, 6);
  });

  it("hook development ACI 318-19 25.4.3.1(a); missing seismic increment flagged for SDC D over 6 ft", () => {
    const h = hookDevelopment("#4", 60000, 2500);
    expect(h.psi.c).toBeCloseTo(2500 / 15000 + 0.6, 9);
    expect(h.ldh).toBeCloseTo(((60000 * 1.6 * h.psi.c) / (55 * 50)) * 0.5 ** 1.5, 6);
    const tall = { ...rwBase(), Hr: 7, stem: { ...rwBase().stem, height: 7 } };
    tall.soil = { ...tall.soil, seismic: undefined };
    const r = designRetainingWall(ctx, tall);
    expect(r.flags.some((f) => /1803\.5\.12/.test(f))).toBe(true);
    expect(() => designRetainingWall(ctx, { ...rwBase(), Hr: 5 })).toThrow(/less than the retained height/);
  });
});

const gp = (x: Partial<GuardPostInput> = {}): GuardPostInput => ({
  id: "g",
  mark: "GP-1",
  description: "",
  post: { species: "DF-L", grade: "No.2", size: "4x4" },
  wetService: true,
  incised: true,
  guardHeight: 36,
  topBolt: 2,
  s: 6,
  P: 200,
  rail: { w: 0, spacing: 0 },
  bolt: { d: 0.5, Fu: 60000, label: "1/2 in. A307" },
  washer: 2,
  device: { model: "DTT", capacity: 1825, source: "test", verified: true },
  ...x,
});

describe("GP — deck guard post", () => {
  it("4x4 No.2 treated at 36 in.: M = 7,600 lb-in, T = 1,467 lb, f_b 1,064 > F'_b 918 psi — fails", () => {
    const g = designGuardPost(ctx, gp());
    expect(g.M).toBe(7600);
    expect(g.T).toBeCloseTo((200 * 44) / 6, 6);
    expect(g.Fb.prime).toBeCloseTo(900 * 1.5 * 0.85 * 0.8, 6);
    expect(g.Fb.fb).toBeCloseTo(7600 / (3.5 ** 3 / 6), 6);
    expect(g.pass).toBe(false);
  });
  it("wide face to the rim bends the post about its weak axis", () => {
    const strong = designGuardPost(ctx, gp({ post: { species: "DF-L", grade: "No.1", size: "4x6" }, s: 8 }));
    const weak = designGuardPost(
      ctx,
      gp({ post: { species: "DF-L", grade: "No.1", size: "4x6" }, s: 8, wideFaceToRim: true }),
    );
    expect(strong.section.d).toBe(5.5);
    expect(weak.section.d).toBe(3.5);
    expect(weak.Fb.fb).toBeGreaterThan(strong.Fb.fb);
    expect(strong.pass).toBe(true);
  });
});

describe("CS — cold-formed steel studs", () => {
  it("SSMA designation parsing and gross properties", () => {
    const s = ssmaSection("350S162-54", 0.5);
    expect(s.D).toBe(3.5);
    expect(s.B).toBe(1.625);
    expect(s.t).toBe(0.0566); // SSMA design thickness, 54 mil
    expect(s.Ix).toBeCloseTo(0.804, 3); // rounded corners, R = 1.5t
    expect(() => ssmaSection("2x4", 0.5)).toThrow(/SSMA/);
  });
  it("East Grand stud wall (Tedds / SSMA table): P = 1.76 kips ≤ P_allow 2.44 kips, ratio 0.721", () => {
    const c = designCfsWall(ctx, {
      id: "c",
      mark: "CS-1",
      description: "",
      designation: "350S162-54",
      lip: 0.5,
      Fy: 50000,
      height: 12,
      spacing: 16,
      extra: [{ kind: "line", type: "D", label: "Above", w: (1760 * 12) / 16 }],
      W: 5,
      deflWindFactor: 0.42,
      deflLimit: 720,
      table: { Pa: 2440, Ma: 3000, source: "SSMA table (East Grand sheet)", verified: false },
      K: 1,
    });
    const ax = c.checks.find((x) => x.name.startsWith("Axial"))!;
    expect(ax.ratio).toBeCloseTo(0.721, 3);
    expect(c.defl.allow).toBeCloseTo(144 / 720, 6); // Tedds δ = H/720 = 0.2 in
    expect(c.flags.some((f) => /VERIFY/.test(f))).toBe(true);
  });
});

describe("verification fixes (sign-off C / D)", () => {
  it("ASCE 7-22 snow factors: ASD 0.7S, strength 1.0S / 0.3S; ASCE 7-16 unchanged", () => {
    const a16 = asdCombinations({ asce7: "ASCE 7-16" });
    const a22 = asdCombinations({ asce7: "ASCE 7-22" });
    expect(a16.find((c) => c.id === "A3s")!.factors.S).toBe(1);
    expect(a22.find((c) => c.id === "A3s")!.factors.S).toBe(0.7);
    expect(a22.find((c) => c.id === "A3s")!.label).toBe("D + 0.7S");
    expect(a22.find((c) => c.id === "A4s")!.factors.S).toBeCloseTo(0.525, 9);
    const s22 = strengthCombinations({ asce7: "ASCE 7-22" });
    expect(s22.find((c) => c.id === "U3s")!.factors.S).toBe(1);
    expect(s22.find((c) => c.id === "U2s")!.factors.S).toBe(0.3);
    expect(strengthCombinations({ asce7: "ASCE 7-16" }).find((c) => c.id === "U3s")!.factors.S).toBe(1.6);
  });

  it("SDPWS-2021: gypsum seismic ASD = v / 2.8; WSP + gypsum combined on the ASD values", () => {
    const g = designShearWall(ctx, wall([{ key: "GWB-5/8-4-blocked", spacing: 4 }]), dem);
    expect(g.vAllowS).toBeCloseTo(350 / 2.8, 6);
    expect(g.vAllowW).toBeCloseTo(350 / 2, 6);
    const m = designShearWall(
      ctx,
      wall([
        { key: "SI-5/16-6d", spacing: 6 },
        { key: "GWB-5/8-4-blocked", spacing: 4 },
      ]),
      dem,
    );
    // max(2 × 125, 400 / 2) = 250 plf
    expect(m.vAllowS).toBeCloseTo(250, 6);
  });

  it("same material, different nailing on the two faces: v_c = K_min ΣG_a", () => {
    const r = designShearWall(
      ctx,
      wall([
        { key: "SI-7/16-8d", spacing: 6 },
        { key: "SI-7/16-8d", spacing: 4 },
      ]),
      dem,
    );
    expect(r.comboRule).toBe("kmin");
    expect(r.vsc).toBeCloseTo(Math.min(510 / 16, 790 / 21) * 37, 6);
  });

  it("Southern Pine No.1 F_c per SPIB (Table 4B)", () => {
    expect(lumberData("SP", "No.1", "2x4", "NDS-2018").ref.Fc).toBe(1650);
    expect(lumberData("SP", "No.1", "2x12", "NDS-2024").ref.Fc).toBe(1400);
  });
});

describe("deck options project", () => {
  it("designs end to end: every member passes, deck and retaining-wall notes and soils inspection generated", () => {
    const p = deckExampleProject();
    const d = designProject(p);
    for (const [, o] of d.outcomes) {
      expect(o.error).toBeUndefined();
      expect(o.result?.pass, `${o.result?.mark}: ${o.result?.governing.name}`).toBe(true);
    }
    const n = generateNotes(p, d);
    expect(n.sections.map((s) => s.title)).toEqual(expect.arrayContaining(["Exterior decks", "Retaining walls"]));
    expect(n.inspections.some((i) => /Soils/.test(i.item))).toBe(true);
    const lg = d.outcomes.get("dk-lg1")!.result!;
    expect(lg.governing.ratio).toBeLessThan(1);
  });
});

describe("verification fixes — AISC and manufacturer data (sign-off C5 / C7)", () => {
  it("channel shear uses G2.1(b) φ_v = 0.90 / Ω_v = 1.67; rolled W keeps G2.1(a) 1.00 / 1.50", () => {
    const c = shearMajor(steelShape("C8x11.5"), 36, 29000);
    const w = shearMajor(steelShape("W8x18"), 50, 29000);
    expect(c.factor.omega).toBe(1.67);
    expect(c.factor.phi).toBe(0.9);
    expect(w.factor.omega).toBe(1.5);
  });
  it("tabulated rts and C8x13.75 torsion properties (AISC Shapes Database)", () => {
    expect(steelShape("W8x31").rts).toBe(2.26);
    expect(steelShape("W14x22").rts).toBe(1.27);
    expect(steelShape("C8x13.75").J).toBe(0.186);
    expect(steelShape("C8x13.75").Cw).toBe(19.2);
  });
  it("round HSS / pipe base plate cantilevers use 0.80D (Design Guide 1)", () => {
    const col = steelShape("Pipe4STD");
    const r = designBasePlate(
      {
        method: "ASD",
        col,
        N: 10,
        B: 10,
        tp: 0.75,
        Fy: 36,
        fc: 2.5,
        A2: 100,
        rod: { d: 0.75, Fu: 58, nTension: 2, nShear: 4, e1: 1.5, groutPad: false, washer: 0.25 },
        weld: { w: 0.1875, FEXX: 70 },
      },
      { P: 10, M: 0, V: 0 },
    );
    expect(r.m).toBeCloseTo((10 - 0.8 * col.d) / 2, 9);
    expect(r.n).toBeCloseTo((10 - 0.8 * col.bf) / 2, 9);
  });
  it("guard-post tension device: catalogue value at C_D = 1.6 reduced to the guard-load C_D = 1.0", () => {
    const g = designGuardPost(
      ctx,
      gp({ device: { model: "DTT", capacity: 1825, capacityCD: 1.6, source: "x", verified: true } }),
    );
    const dev = g.checks.find((c) => c.name.startsWith("Tension device"))!;
    expect(dev.capacity).toBeCloseTo(1825 / 1.6, 6);
    const legacy = designGuardPost(ctx, gp());
    expect(legacy.checks.find((c) => c.name.startsWith("Tension device"))!.capacity).toBe(1825);
  });
});
