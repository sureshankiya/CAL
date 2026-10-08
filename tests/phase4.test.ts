import { describe, expect, it } from "vitest";
import { analysePanel } from "../src/engine/analysis/panel";
import { buildParallelChord, buildTruss } from "../src/engine/analysis/trussGeometry";
import { solveTruss } from "../src/engine/analysis/trussSolver";
import { dowelRow } from "../src/engine/design/adhesive";
import { asdMomentCapacity, cmuSelfWeight } from "../src/engine/design/masonry";
import { designMasonryWall, type MasonryWallInput } from "../src/engine/members/masonryWall";
import { designWoodTruss, type WoodTrussInput } from "../src/engine/members/woodTruss";
import {
  contextOf,
  designProject,
  eastLincolnTrussProject,
  estimateExtractionCost,
  exampleProject,
  generateNotes,
  hardwareSchedule,
  projectSchema,
  reviewItemsFrom,
  sanMiguelProject,
} from "../src/engine/project";

const near = (a: number, b: number, rel = 0.001) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-9);
const ctx = () => ({ ...contextOf(exampleProject()), SDS: 1 });

/** 1109 San Miguel Tedds "Masonry wall panel design to MSJC-13" inputs. */
const sanMiguelCmu = (): MasonryWallInput => ({
  id: "x",
  mark: "CW-1",
  description: "",
  material: "cmu",
  L: 12,
  h: 3,
  support: "pinned-fixed",
  t: 8,
  cmu: {
    fm: 2000,
    fmSource: "Tedds",
    mortar: "M",
    FbFactor: 1 / 3,
    shearDeformation: true,
    block: { hb: 8, lb: 16, tf: 1.25, tw: 1.25, te: 1.25, nWeb: 1, nEnd: 2, gammaBlock: 115, gammaGrout: 140 },
  },
  fy: 60000,
  vertical: { size: "#5", spacing: 8, layout: "center" },
  horizontal: { size: "#4", count: 2, spacing: 8 },
  extra: [
    { kind: "line", type: "D", label: "DL", w: 50 },
    { kind: "line", type: "L", label: "LL", w: 60 },
  ],
  eccentricity: 0,
  wind: { W: 18, Wp: 18 },
  seismic: { include: true, Eadd: 40, SDC: "D", Ie: 1, SDS: 1 },
});

describe("wall panel solver", () => {
  it("Euler-Bernoulli propped cantilever: 5wL/8, 3wL/8, wL²/8", () => {
    const r = analysePanel({ h: 10, base: "fixed", top: "pinned", EI: 1e12 }, [{ x1: 0, x2: 10, q1: 100, q2: 100 }]);
    near(r.Rbase, 625);
    near(r.Rtop, 375);
    near(r.M[0], 1250 * 12);
  });
  it("cantilever with triangular load and a top moment", () => {
    const r = analysePanel({ h: 10, base: "fixed", top: "free", EI: 1e12 }, [{ x1: 0, x2: 10, q1: 100, q2: 0 }], 1200);
    near(r.Rbase, 500);
    near(r.M[0], ((100 * 100) / 6) * 12 + 1200);
  });
  it("Timoshenko propped cantilever reproduces the San Miguel Tedds diagram", () => {
    const w = 0.7 * (0.4 * 88.125 + 40);
    const r = analysePanel({ h: 3, base: "fixed", top: "pinned", EI: 1.8e6 * 512, GAv: 720000 * 48 }, [
      { x1: 0, x2: 3, q1: w, q2: w },
    ]);
    near(r.Rtop, 60.4, 0.002);
    near(r.Rbase, 97.6, 0.002);
    near(r.M[0], 669.8, 0.001);
    near(-Math.min(...r.M), 415.7, 0.002);
  });
});

describe("CMU wall — 1109 San Miguel parity (Tedds MSJC-13)", () => {
  const r = designMasonryWall(ctx(), sanMiguelCmu());
  it("block geometry and self weight", () => {
    const w = cmuSelfWeight(
      { t: 8, hb: 8, lb: 16, tf: 1.25, tw: 1.25, te: 1.25, nWeb: 1, nEnd: 2, gammaBlock: 115, gammaGrout: 140 },
      8,
    );
    near(w.Ablock, 45.47, 0.001);
    near(w.Agrout, 50.53, 0.001);
    near(w.wWall, 85.44, 0.001);
    near(r.self.w, 88.13, 0.001);
  });
  it("loads: F_p 0.4, E_wall 35.3, E 75.3 psf", () => {
    near(r.lateral.Fp, 0.4);
    near(r.lateral.Ewall, 35.25, 0.002);
    near(r.lateral.E, 75.25, 0.002);
  });
  it("governing section at the base, combination 10", () => {
    expect(r.flex.combo.label).toBe("(0.6 − 0.14 SDS)D + 0.7E");
    expect(r.flex.x).toBe(0);
    near(r.flex.P, 144.6, 0.001);
    near(Math.abs(r.flex.M), 669.8, 0.001);
    near(r.flex.V, 97.6, 0.001);
  });
  it("balance point and interaction", () => {
    near(r.balance!.k, 0.251, 0.002);
    near(r.balance!.M, 14736, 0.001);
    near(r.flex.Mc, 23462, 0.005); // Tedds 23,462 lb-in/ft (bar area 0.31 in² vs πD²/4 in Tedds)
    near(r.flex.ratio, 0.029, 0.03);
  });
  it("axial: F_a 493.8 psi; P_a on A_n (Tedds 47,178 on A_n − A_s)", () => {
    near(r.axial.Fa!, 493.8, 0.001);
    near(r.axial.sr, 15.588, 0.001);
    near(r.axial.cap, 47178, 0.006);
  });
  it("out-of-plane shear F_v ≈ 50.8 psi, f_v / F_v = 0.040", () => {
    near(r.shear.cap / r.section.Anv, 50.8, 0.005);
    near(r.shear.ratio, 0.04, 0.01);
  });
  it("combination utilizations match the Tedds list", () => {
    const max = Math.max(...r.combos.map((c) => c.ratio));
    near(max, 0.04, 0.03);
    expect(r.pass).toBe(true);
  });
  it("cracked-section capacity is continuous across the balance point", () => {
    const bars = [{ d: 4, A: 0.465 }];
    const a = asdMomentCapacity(-10859, 12, 8, bars, 16.111, 666.67, 32000);
    const b = asdMomentCapacity(-10860, 12, 8, bars, 16.111, 666.67, 32000);
    near(a.Mc, b.Mc, 0.002);
  });
});

describe("concrete stem wall (ACI 318)", () => {
  const r = designMasonryWall(ctx(), {
    ...sanMiguelCmu(),
    material: "concrete",
    cmu: undefined,
    concrete: { fc: 2500, gamma: 150, cover: 1.5 },
    L: 20,
    h: 4,
    support: "cantilever",
    vertical: { size: "#5", spacing: 16, layout: "offset", d: 6.1875 },
    horizontal: { size: "#4", count: 1, spacing: 12 },
    extra: [
      { kind: "line", type: "D", label: "DL", w: 300 },
      { kind: "line", type: "L", label: "LL", w: 200 },
    ],
    wind: { W: 0, Wp: 0 },
    seismic: { include: false, Eadd: 0, SDC: "D", Ie: 1, SDS: 1 },
    soil: { height: 3.5, efp: 45, surcharge: 0 },
  });
  it("retaining moment 1.6 × γ h³/6 at the base, shear 1.6 γ h²/2", () => {
    const M0 = 1.6 * ((45 * 3.5 ** 3) / 6) * 12;
    near((r.flex.cap as { Mu0: number }).Mu0, M0, 0.002);
    near(r.shear.V, 1.6 * 0.5 * 45 * 3.5 * 3.5, 0.002);
    near(r.shear.cap, 3259, 0.002);
  });
  it("minimum reinforcement and spacing pass with #4 @ 12 horizontal", () => {
    expect(r.checks.filter((c) => c.category === "detailing").every((c) => c.pass)).toBe(true);
  });
});

describe("tie-in dowels (ACI 318 Ch. 17 adhesive)", () => {
  const row = dowelRow({
    kind: "rebar",
    d: 0.5,
    Ase: 0.2,
    fya: 60000,
    futa: 90000,
    hef: 6,
    s: 16,
    ca1: 6,
    ha: 12,
    fc: 2500,
    cracked: true,
    seismic: false,
    shearDir: "toward-edge",
    product: {
      name: "x",
      report: "x",
      tauCr: 200,
      tauUncr: 650,
      kcCr: 17,
      kcUncr: 24,
      phiBond: 0.55,
      phiConcrete: 0.65,
    },
  });
  it("bond governs tension with the ACI minimum bond stress", () => {
    near(row.cNa, 10 * 0.5 * Math.sqrt(650 / 1100), 1e-6);
    near(row.Nba, 200 * Math.PI * 0.5 * 6, 1e-6);
    expect(row.tGov).toContain("bond");
    near(row.phiNsa, 0.75 * 0.2 * 90000, 1e-9);
  });
});

describe("designed wood truss (TrussCalc port)", () => {
  it("parallel chord: statics close — reactions equal the applied load", () => {
    const g = buildParallelChord(45, 2.5, 9, "warren");
    const loads = g.nodes.map((n) => ({ fx: 0, fy: n.onTopChord ? (n.x === 0 || n.x === 45 ? -175 : -350) : 0 }));
    const s = solveTruss(g, loads);
    near(s.reactionLeftY + s.reactionRightY, 3150, 1e-6);
    near(s.reactionLeftY, 1575, 1e-6);
  });
  it("mid-span chord force ≈ M / d for a uniform load", () => {
    const g = buildParallelChord(45, 2.5, 9, "warren");
    const loads = g.nodes.map((n) => ({ fx: 0, fy: n.onTopChord ? (n.x === 0 || n.x === 45 ? -175 : -350) : 0 }));
    const s = solveTruss(g, loads);
    const i = g.members.findIndex((m) => m.group === "BC" && Math.abs(g.nodes[m.a].x - 20) < 1e-6);
    // M at x = 22.5 ft by statics on the lumped loads / depth
    near(s.forces[i], (1575 * 20 - 175 * 20 - 350 * (15 + 10 + 5)) / 2.5, 0.001);
  });
  it("Fink truss is symmetric under symmetric load", () => {
    const g = buildTruss("fink", 28, 4);
    const s = solveTruss(
      g,
      g.nodes.map((n) => ({ fx: 0, fy: n.onTopChord ? -100 : 0 })),
    );
    near(s.reactionLeftY, s.reactionRightY, 1e-6);
  });
  it("East Lincoln 45 ft truss: first compression diagonal overstressed, chords pass", () => {
    const p = projectSchema.parse(eastLincolnTrussProject());
    const d = designProject(p);
    const r = d.outcomes.get("el-t1")!.result!;
    expect(r.kind).toBe("woodTruss");
    const web = r.checks.find((c) => c.name.startsWith("Web compression"))!;
    expect(web.pass).toBe(false);
    expect(web.ratio).toBeGreaterThan(2);
    expect(r.checks.find((c) => c.name.startsWith("Bottom chord tension"))!.pass).toBe(true);
  });
  it("unbalanced snow case is analysed when it applies", () => {
    const t: WoodTrussInput = {
      id: "t",
      mark: "T-1",
      description: "",
      type: "fink",
      span: 28,
      pitch: 6,
      overhang: 0,
      spacing: 24,
      bearingLen: 3.5,
      tc: { species: "DF-L", grade: "No.2", size: "2x6" },
      bc: { species: "DF-L", grade: "No.2", size: "2x6" },
      web: { species: "DF-L", grade: "No.2", size: "2x4" },
      webBracing: "none",
      roofDead: { psf: 15, basis: "sloped" },
      ceilingDead: { psf: 10 },
      atticLive: 0,
      roofLive: true,
      snow: true,
      windUplift: 0,
      netSection: 0.85,
      joint: { type: "plate", value: 100, zone: 12, source: "x" },
      deflection: { preset: "custom", live: 360, total: 240 },
    };
    const c = { ...ctx(), snow: { pg: 40, Ce: 1, Ct: 1.1, Is: 1, slippery: false } };
    const r = designWoodTruss(c, t);
    expect(r.combosUsed.some((x) => x.includes("unbalanced"))).toBe(true);
  });
});

describe("validation projects", () => {
  it("1109 San Miguel designs without errors; F1 transverse steel below A_s,min", () => {
    const p = projectSchema.parse(sanMiguelProject());
    const d = designProject(p);
    const errors = [...d.outcomes.values()].filter((o) => o.error);
    expect(errors.map((o) => `${o.spec.mark}: ${o.error}`)).toEqual([]);
    const failing = [...d.outcomes.values()].filter((o) => o.result && !o.result.pass).map((o) => o.spec.mark);
    expect(failing).toEqual(["F1"]);
    const f1 = d.outcomes.get("sm-f1")!.result!;
    expect(f1.governing.name).toContain("A_s,min");
    const cw = d.outcomes.get("sm-cw1")!.result!;
    expect(cw.kind).toBe("masonryWall");
    expect(cw.pass).toBe(true);
  });
  it("notes generator covers masonry, slab, special inspections and the hardware schedule", () => {
    const p = projectSchema.parse(sanMiguelProject());
    const d = designProject(p);
    const n = generateNotes(p, d);
    const titles = n.sections.map((s) => s.title);
    expect(titles).toContain("Masonry");
    expect(titles).toContain("Slab on grade");
    expect(n.inspections.some((i) => i.item.startsWith("Masonry"))).toBe(true);
    expect(n.inspections.some((i) => i.item.startsWith("Wood shear walls"))).toBe(true);
    const hw = hardwareSchedule(p, d);
    expect(hw.map((h) => h.model)).toEqual(expect.arrayContaining(["H2.5A", "HDU2-SDS2.5"]));
    expect(n.fieldVerify.length).toBeGreaterThan(5);
  });
  it("example house still passes every member", () => {
    const d = designProject(exampleProject());
    expect([...d.outcomes.values()].filter((o) => o.error || !o.result?.pass).map((o) => o.spec.mark)).toEqual([]);
  });
});

describe("AI extraction plumbing (no API call)", () => {
  it("cost estimate and review rows stay unconfirmed; targets only for valid fields", () => {
    const p = exampleProject();
    const est = estimateExtractionCost({ imageWidth: 1568, imageHeight: 1015, text: "x".repeat(3500), members: [] });
    expect(est.input).toBeGreaterThan(3000);
    expect(est.cost).toBeGreaterThan(0);
    const rows = reviewItemsFrom(
      p,
      {
        sheet: "S-2",
        notes: "",
        model: "m",
        usage: { input: 1, output: 1, cost: 0 },
        items: [
          {
            item: "R-1 size",
            value: "2x8",
            memberMark: "R-1",
            field: "size",
            confidence: "high",
            evidence: "2x8 @ 24",
          },
          { item: "Bad field", value: "12", memberMark: "R-1", field: "nonsense", confidence: "low", evidence: "" },
          { item: "", value: "", memberMark: "", field: "", confidence: "low", evidence: "" },
        ],
      },
      "d1",
      2,
      "",
      () => "id",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.confirmed)).toBe(true);
    expect(rows[0].target).toEqual({ memberId: "m-r1", field: "size" });
    expect(rows[1].target).toBeUndefined();
    expect(rows[0].sheet).toBe("S-2");
  });
});
