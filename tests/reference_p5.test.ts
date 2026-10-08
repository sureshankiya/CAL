/**
 * Phase 5 modules against the independent Python reference (verification/reference_p5.py,
 * written from the stated equations without the HouseCalc source): retaining-wall
 * stability, bearing, footing and stem, deck guard post, CFS stud demand checks.
 * Tolerance 0.1 %.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultAssemblies } from "@/engine/loads/dead";
import type { DesignContext } from "@/engine/members";
import { designCfsWall } from "@/engine/members/cfsWall";
import { designGuardPost } from "@/engine/members/guardPost";
import { designRetainingWall, type RetainingWallInput } from "@/engine/members/retainingWall";

const ref = JSON.parse(
  readFileSync(fileURLToPath(new URL("../verification/reference_p5.json", import.meta.url)), "utf8"),
);
const close = (a: number, b: number, tol = 1e-3) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

const ctx: DesignContext = {
  cycleId: "2025",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1,
  SDS: 1,
};

const rw = (seismic: boolean): RetainingWallInput => ({
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
    h: 14,
    fc: 2500,
    fy: 60000,
    coverBottom: 3,
    coverTop: 2,
    bottom: { size: "#5", spacing: 12 },
    top: { size: "#5", spacing: 12 },
    longitudinal: { size: "#4", count: 6 },
  },
  soil: {
    gamma: 120,
    efp: 35,
    efpSource: "reference",
    surcharge: 100,
    seismic: seismic ? { shape: "inverted", k: 20 } : undefined,
    toeCover: 1,
    countToeSoil: false,
    neglectPassive: 1,
    passive: 150,
    friction: 0.25,
    qa: 1500,
    qaSource: "reference",
    soilSource: "reference",
  },
  extra: [],
  seismicSDC: "D",
});

describe("reference — retaining wall RW-1", () => {
  const r = designRetainingWall(ctx, rw(true));
  const R = ref.rw1;
  it("geometry and lateral loads", () => {
    close(r.geo.B, R.B);
    close(r.geo.Ht, R.Ht);
    close(r.geo.Ka, R.Ka);
    close(r.lateral.find((l) => l.type === "H")!.P, R.PH);
    close(r.lateral.find((l) => l.type === "Hq")!.P, R.Pq);
    close(r.lateral.find((l) => l.type === "E")!.P, R.PE);
    close(r.passive.Pp, R.Pp);
  });
  it("stability per IBC 1807.2.3, four cases", () => {
    const find = (sq: boolean, sc: boolean) =>
      r.stability.find((s) => s.seismic === sc && s.label.includes("surcharge") === sq)!;
    const cases: Array<[string, boolean, boolean]> = [
      ["static", false, false],
      ["static_surcharge", true, false],
      ["seismic", false, true],
      ["seismic_surcharge", true, true],
    ];
    for (const [k, sq, sc] of cases) {
      const s = find(sq, sc);
      close(s.H, R.stability[k].H);
      close(s.Mo, R.stability[k].Mo);
      close(s.Wr, R.stability[k].Wr);
      close(s.Mr, R.stability[k].Mr);
      close(s.FSs, R.stability[k].FS_sliding);
      close(s.FSo, R.stability[k].FS_OT);
    }
  });
  it("soil bearing: D + L + H and (1 + 0.14 SDS)D + 0.7E + H", () => {
    const dl = r.bearing.find((b) => b.combo.id === "A2")!;
    close(dl.P, R.bearing_D_L_H.P);
    close(dl.xbar, R.bearing_D_L_H.xbar);
    close(dl.qmax, R.bearing_D_L_H.qmax);
    const se = r.bearing.find((b) => b.combo.id === "A8")!;
    close(se.P, R.bearing_seismic.P);
    close(se.xbar, R.bearing_seismic.xbar);
    close(se.qmax, R.bearing_seismic.qmax);
  });
  it("hook development and stem base moment", () => {
    close(r.dowel.ldh, R.hook.ldh_final);
    // stem: governing strength combination includes 1.6H (with the lateral surcharge) + 1.0E
    close(Math.abs(r.stem.flex.M) / 12, R.stem.Mu_stem, 2e-3);
  });
});

describe("reference — retaining wall footing (1.2D + 1.6L + 1.6H)", () => {
  const r = designRetainingWall(ctx, rw(false));
  const R = ref.rw1;
  it("toe and heel moments, heel shear, flexure capacity", () => {
    const row = r.footing.rows.find((x) => x.combo.factors.L === 1.6 && x.combo.factors.D === 1.2)!;
    close(row.Pu, R.strength.Pu);
    close(row.xbar, R.strength.xbar);
    close(row.MuToe / 12, R.strength.Mu_toe);
    close(-row.MuHeel / 12, R.strength.Mu_heel);
    close(row.VuHeel, R.strength.Vu_heel);
    // the governing rows are the envelope over the combinations
    expect(r.footing.toe.MuPos.Mu).toBeGreaterThanOrEqual(row.MuToe);
    expect(-r.footing.heel.MuNeg.Mu).toBeGreaterThanOrEqual(-row.MuHeel - 1e-9);
    close(r.footing.toe.dBot, R.flexure.d);
    close(r.footing.toe.phiMnBot, R.flexure.phiMn_lbin);
  });
});

describe("reference — guard post GP-1", () => {
  const g = designGuardPost(ctx, {
    id: "g",
    mark: "GP-1",
    description: "",
    post: { species: "DF-L", grade: "No.1", size: "4x6" },
    wetService: true,
    incised: true,
    guardHeight: 36,
    topBolt: 2,
    s: 8,
    P: 200,
    rail: { w: 0, spacing: 0 },
    bolt: { d: 0.5, Fu: 60000, label: "1/2 in. A307" },
    washer: 2,
    device: { model: "device", capacity: 1825, source: "x", verified: true },
  });
  const R = ref.gp1;
  it("forces, stresses and capacities", () => {
    close(g.H1, R.H1);
    close(g.M, R.M);
    close(g.T, R.T);
    close(g.V, R.V);
    close(g.section.S, R.S);
    close(g.Fb.fb, R.fb);
    close(g.Fv.fv, R.fv);
    close(g.Fb.prime, R.Fb_prime);
    close(g.Fv.prime, R.Fv_prime);
    close(g.Fp.Aw, R.Aw);
    close(g.factors.Cb, R.Cb);
    close(g.Fp.prime, R.Fcperp_prime);
    close(g.Fp.fp, R.fcperp);
    close(g.bolt.allow, R.bolt_Rn_over_Omega);
  });
});

describe("reference — CFS stud CS-1 (East Grand 350S162-54)", () => {
  const c = designCfsWall(ctx, {
    id: "c",
    mark: "CS-1",
    description: "",
    designation: "350S162-54",
    lip: 0.5,
    Fy: 50000,
    height: 10,
    spacing: 16,
    extra: [{ kind: "line", type: "D", label: "Above", w: (1760 * 12) / 16 }],
    W: 5,
    deflWindFactor: 0.42,
    deflLimit: 720,
    table: { Pa: 2440, Ma: 3000, source: "x", verified: true },
    K: 1,
  });
  const R = ref.cs1;
  it("section, amplification, interaction and deflection", () => {
    close(c.section.t, R.t);
    close(c.section.Ix, R.Ix);
    close(c.section.A, R.A);
    close(c.Pe, R.Pe);
    const row = c.rows.find((x) => x.combo.label === "D + 0.6W")!;
    close(row.P, R.P);
    close(row.M, R.M);
    close(row.B1, R.B1);
    close(row.ratio, R.interaction);
    close(c.defl.d, R.delta);
    close(c.defl.allow, R.delta_limit);
    close(c.axialGov.P / 2440, R.P_over_Pa);
  });
});
