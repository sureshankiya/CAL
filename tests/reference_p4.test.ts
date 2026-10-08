/**
 * Engine vs the independent Phase 4 reference (verification/reference_p4.py, written from
 * the code text without the TypeScript engine): Timoshenko wall panel, TMS 402 ASD CMU
 * section, CMU self weight, ACI 318 P-M strength, adhesive dowel row, parallel-chord
 * truss forces, eccentric footing bearing. Tolerance 0.1 %.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { analysePanel } from "../src/engine/analysis/panel";
import { buildParallelChord } from "../src/engine/analysis/trussGeometry";
import { solveTruss } from "../src/engine/analysis/trussSolver";
import { dowelRow } from "../src/engine/design/adhesive";
import { momentAtAxial } from "../src/engine/design/concrete";
import {
  asdBalance,
  asdMomentCapacity,
  axialAllowable,
  cmuSelfWeight,
  masonryShear,
} from "../src/engine/design/masonry";
import { eccentricBearing } from "../src/engine/members/holdownFooting";

const ref = JSON.parse(fs.readFileSync(new URL("../verification/reference_p4.json", import.meta.url), "utf8"));
const near = (a: number, b: number, rel = 0.001) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-6);

describe("Phase 4 independent reference", () => {
  it("panel_tim", () => {
    const r = ref.panel_tim;
    const p = analysePanel({ h: 3, base: "fixed", top: "pinned", EI: 1.8e6 * 512, GAv: 720000 * 48 }, [
      { x1: 0, x2: 3, q1: r.w_plf, q2: r.w_plf },
    ]);
    near(p.Rtop, r.Rtop);
    near(p.Rbase, r.Rbase);
    near(Math.abs(p.M[0]), r.Mbase);
    near(-Math.min(...p.M), r.Mspan_max, 0.002); // mesh nodes vs exact zero-shear point
  });
  it("cmu_sm", () => {
    const r = ref.cmu_sm;
    const s = asdMomentCapacity(144.6125, 12, 8, [{ d: 4, A: r.As }], r.n, r.Fb, 32000);
    near(s.Mc, r.Mc);
    near(s.c, r.kd);
    const b = asdBalance(12, 8, 4, r.As, r.n, r.Fb, 32000);
    near(b.k, r.k_bal);
    near(b.M, r.M_bal);
    near(axialAllowable(2000, 96, 36, r.r).Pa, r.Pa);
    const v = masonryShear({ fm: 2000, An: 96, MVd: 669.76875 / (97.6171875 * 4), P: 144.6125 });
    near(v.Fvm, r.Fvm);
    near(v.Fv, r.Fv);
  });
  it("cmu_weight", () => {
    const r = ref.cmu_weight;
    const w = cmuSelfWeight(
      { t: 8, hb: 8, lb: 16, tf: 1.25, tw: 1.25, te: 1.25, nWeb: 1, nEnd: 2, gammaBlock: 115, gammaGrout: 140 },
      8,
    );
    near(w.Ablock, r.Ablock);
    near(w.Agrout, r.Agrout);
    near(w.wWall, r.w_wall);
    near(w.w, r.w);
  });
  it("conc_pm", () => {
    const r = ref.conc_pm;
    const s = momentAtAxial(490, 12, 8, [{ d: 6.1875, A: r.As }], 2500, 60000);
    near(s.c, r.c);
    near(s.phi, r.phi);
    near(s.phiMn, r.phiMn);
  });
  it("adhesive_row", () => {
    const r = ref.adhesive_row;
    const s = dowelRow({
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
        name: "",
        report: "",
        tauCr: 200,
        tauUncr: 650,
        kcCr: 17,
        kcUncr: 24,
        phiBond: 0.55,
        phiConcrete: 0.65,
      },
    });
    for (const k of ["phiNsa", "phiNcb", "phiNa", "phiVsa", "phiVcb", "phiVcp", "cNa", "phiNn", "phiVn"] as const)
      near(s[k], r[k]);
  });
  it("truss_parallel", () => {
    const r = ref.truss_parallel;
    const g = buildParallelChord(45, 2.5, 9, "warren");
    const s = solveTruss(
      g,
      g.nodes.map((n) => ({ fx: 0, fy: n.onTopChord ? (n.x === 0 || n.x === 45 ? -175 : -350) : 0 })),
    );
    near(s.reactionLeftY, r.Ry_B0);
    near(s.reactionRightY, r.Ry_B9);
    const at = (grp: string, x: number) =>
      s.forces[
        g.members.findIndex((m) => m.group === grp && Math.abs(Math.min(g.nodes[m.a].x, g.nodes[m.b].x) - x) < 1e-6)
      ];
    near(at("TC", 20), r.N_T4_T5);
    near(at("BC", 20), r.N_B4_B5);
    const diag = g.members.findIndex((m) => m.group === "WEB" && g.nodes[m.a].x === 0 && g.nodes[m.b].x === 5);
    near(s.forces[diag], r.N_B0_T1);
    near(at("EV", 0), r.N_T0_B0);
  });
  it("holdown_ftg", () => {
    const r = ref.holdown_ftg;
    const b = eccentricBearing(4000, 6000, 1.5, 13.167);
    near(b.e, r.e);
    near(b.qmax, r.q_max);
    near(b.otRatio, r.M_ratio);
  });
});
