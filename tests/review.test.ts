/** Fixes from the 2026-10-27 package review (E1–E6) and the added checks. */

import { describe, expect, it } from "vitest";
import { asdCombinations } from "@/engine/core/combos";

describe("review fixes", () => {
  it("E2: ASCE 7-22 snow relabelling leaves S_DS intact", () => {
    const labels = asdCombinations({ asce7: "ASCE 7-22", includeSeismic: true, SDS: 1 }).map((c) => c.label);
    expect(labels.join(" ")).not.toMatch(/SD0|SD\d/);
    expect(labels).toContain("(1.0 + 0.105 SDS)D + 0.75L + 0.525E + 0.525S");
    expect(labels).toContain("D + 0.7S");
  });
});

import { driftHeight, snowDrift, snowLoads } from "@/engine/loads/snow";
import { designProject, exampleProject } from "@/engine/project";

describe("snow drifts (ASCE 7 §7.6.1, §7.7, §7.8)", () => {
  // pg = 30 psf, flat lower roof: pf = ps = 21 psf, γ = 17.9 pcf (hand values)
  it("roof step: leeward governs, hd ≤ hc", () => {
    const r = snowDrift({ edition: "ASCE 7-16", pg: 30, ps: 21, case: "step", luUpper: 50, luLower: 20, hr: 5 });
    expect(r.gamma).toBeCloseTo(17.9, 6);
    expect(r.hc).toBeCloseTo(3.8268, 3);
    expect(r.leeward!.hd).toBeCloseTo(2.4839, 3);
    expect(r.windward!.hd).toBeCloseTo(1.0765, 3);
    expect(r.governs).toBe("leeward");
    expect(r.w).toBeCloseTo(9.9355, 3);
    expect(r.pd).toBeCloseTo(44.46, 2);
  });

  it("roof step: hd > hc caps the height and limits w to 8 hc", () => {
    const r = snowDrift({ edition: "ASCE 7-16", pg: 30, ps: 21, case: "step", luUpper: 50, luLower: 20, hr: 2.5 });
    expect(r.hd).toBeCloseTo(1.3268, 3);
    expect(r.w).toBeCloseTo(10.6145, 3);
    expect(r.pd).toBeCloseTo(23.75, 2);
  });

  it("no drift where hc / hb < 0.2; parapet uses 0.75 hd", () => {
    expect(snowDrift({ edition: "ASCE 7-16", pg: 30, ps: 21, case: "step", luUpper: 50, hr: 1.3 }).required).toBe(
      false,
    );
    const p = snowDrift({ edition: "ASCE 7-16", pg: 30, ps: 21, case: "parapet", luUpper: 20, hr: 5 });
    expect(p.governs).toBe("windward");
    expect(p.hd).toBeCloseTo(1.0765, 3);
  });

  it("ASCE 7-22 drift height Eq. 7.6-1", () => {
    expect(driftHeight("ASCE 7-22", 30, 50, 0.5).hd).toBeCloseTo(2.7225, 3);
  });

  it("unbalanced gable W > 20 ft: surcharge hd γ / √S over 8 hd √S / 3", () => {
    const s = snowLoads({
      edition: "ASCE 7-16",
      pg: 30,
      Ce: 1,
      Ct: 1,
      Is: 1,
      rise: 6,
      slippery: false,
      W: 30,
      gable: true,
    });
    expect(s.unbalanced.windward).toBeCloseTo(0.3 * s.ps, 6);
    expect(s.unbalanced.surcharge!.pd).toBeCloseTo(23.544, 2);
    expect(s.unbalanced.surcharge!.length).toBeCloseTo(7.015, 2);
    expect(s.flags.join(" ")).not.toMatch(/not computed/);
  });

  it("a drift load on a beam adds the triangular snow load to the reactions", () => {
    const p = exampleProject();
    p.criteria.snow.pg = 30;
    const b = p.members.find((m) => m.kind === "beam")!;
    if (b.kind !== "beam") throw new Error();
    const before = designProject(p).outcomes.get(b.id)!.result!;
    b.extra.push({
      kind: "drift",
      type: "S",
      label: "Drift",
      x: 0,
      drift: { case: "step", luUpper: 50, luLower: 20, hr: 5, rise: 0, trib: 2, dir: "right" },
    });
    const after = designProject(p).outcomes.get(b.id);
    expect(after!.error).toBeUndefined();
    const sumS = (r: typeof before) =>
      "design" in r ? r.design.reactions.reduce((a, x) => a + x.maxByType.S, 0) : NaN;
    // 2025 cycle → ASCE 7-22, W2 default; span 6 ft < w: trapezoid from the peak to peak × (1 − 6 / w)
    const d = snowDrift({ edition: "ASCE 7-22", pg: 30, ps: 21, case: "step", luUpper: 50, luLower: 20, hr: 5 });
    const peak = d.pd * 2;
    const expected = ((peak + peak * (1 - 6 / d.w)) / 2) * 6;
    expect(sumS(after!.result!) - sumS(before)).toBeCloseTo(expected, 0);
  });
});

import { perforatedCo } from "@/engine/members/shearWall";

describe("perforated shear walls (SDPWS-2021 4.3.3.5)", () => {
  it("C_o by Eq. 4.3-5 / 4.3-6 (hand: r = 0.75, C_o = 0.8333)", () => {
    const { r, Co } = perforatedCo(20, 8, 12, 32);
    expect(r).toBeCloseTo(0.75, 6);
    expect(Co).toBeCloseTo(0.5 * (20 / 12), 6);
  });

  it("a perforated wall in the example: v_max on the aspect-adjusted segments, deflection / C_o", () => {
    const p = exampleProject();
    const w = p.members.find((m) => m.kind === "shearWall" && m.mark === "1SW-2");
    if (!w || w.kind !== "shearWall") throw new Error();
    w.perforated = { segments: [4, 4], openings: [{ width: 6, height: 4 }] };
    const o = designProject(p).outcomes.get(w.id)!;
    expect(o.error).toBeUndefined();
    const r = o.result!;
    if (r.kind !== "shearWall") throw new Error();
    const Co = perforatedCo(14, 9, 8, 24).Co;
    expect(r.psw!.Co).toBeCloseTo(Co, 6);
    const Car = 1.25 - 0.125 * (9 / 4);
    expect(r.psw!.sumLadj).toBeCloseTo(8 * Car, 6);
    expect(r.vS).toBeCloseTo((0.7 * r.demand.Eh) / (Co * 8 * Car), 6);
    expect(r.title).toMatch(/perforated/);
    // the bad geometry is rejected
    w.perforated = { segments: [4, 4], openings: [{ width: 5, height: 4 }] };
    expect(designProject(p).outcomes.get(w.id)!.error).toMatch(/must equal the wall length/);
  });
});

import { semiRigidDistribution } from "@/engine/lateral/semiRigid";
import { directionalBandForce, leewardWallCp, roofCp27 } from "@/engine/loads/wind";

describe("semi-rigid diaphragm (beam on wall-line springs)", () => {
  const lines = [
    { id: "a", pos: 0, k: 20000 },
    { id: "b", pos: 20, k: 20000 },
    { id: "c", pos: 40, k: 20000 },
  ];
  const F = (EI: number, GA: number) =>
    semiRigidDistribution(lines, 10000, 40, EI, GA, 0, 0).lines.map((l) => l.total / 10000);
  it("a very flexible diaphragm tends to the tributary split, a very stiff one to the rigid split", () => {
    // tributary of a continuous flexible beam on rigid supports: 0.25 / 0.5 / 0.25 is the simple-span split;
    // with springs and a flexible diaphragm the centre line takes the most
    const flex = F(1e6, 1e3);
    expect(flex[1]).toBeGreaterThan(0.45);
    const rigid = F(1e16, 1e14);
    for (const x of rigid) expect(x).toBeCloseTo(1 / 3, 3);
    expect(flex.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("two end lines share a centred load equally; accidental torsion raises one side", () => {
    const two = [lines[0], lines[2]];
    const r = semiRigidDistribution(two, 1000, 40, 1e12, 1e9, 0, 0);
    expect(r.lines[0].total).toBeCloseTo(500, 3);
    const t = semiRigidDistribution(two, 1000, 40, 1e16, 1e14, 0, 2);
    // rigid limit: V/2 + V e / L = 500 + 1000 × 2 / 40 = 550
    expect(t.lines[0].total).toBeCloseTo(550, 0);
  });
});

describe("ASCE 7 Ch. 27 directional procedure", () => {
  it("Fig. 27.3-1 coefficients", () => {
    expect(leewardWallCp(1)).toBe(-0.5);
    expect(leewardWallCp(2)).toBeCloseTo(-0.3, 6);
    expect(leewardWallCp(3)).toBeCloseTo(-0.25, 6);
    expect(leewardWallCp(5)).toBe(-0.2);
    expect(roofCp27(20, 0.25)).toEqual({ ww: 0.2, lw: -0.6 });
    expect(roofCp27(12.5, 0.25).ww).toBeCloseTo((-0.18 + 0) / 2, 6);
  });
  it("band force: G (qz 0.8 − qh Cp_lw) × wall area + G qh (Cp_ww − Cp_lw) × roof projection", () => {
    const f = directionalBandForce(14, 13, 15, { width: 40, wallHeight: 4.5, roofHeight: 4 }, 18.4, true, 24, 11);
    const lw = leewardWallCp(24 / 40);
    const roof = roofCp27(18.4, 11 / 24);
    const F = 0.85 * (14 * 0.8 - 13 * lw) * 4.5 * 40 + 0.85 * 13 * (roof.ww - roof.lw) * 4 * 40;
    expect(f.F).toBeCloseTo(Math.max(F, 0), 6);
    expect(f.Fmin).toBeCloseTo(16 * 4.5 * 40 + 8 * 4 * 40, 6);
  });
});

describe("lateral options in the example project", () => {
  it("Ch. 27 directional wind runs through the package", () => {
    const p = exampleProject();
    p.lateral!.windMethod = "directional";
    const d = designProject(p);
    expect(d.lateralError).toBeUndefined();
    expect(d.lateral!.windMethod).toBe("directional");
    expect(d.lateral!.stories[0].windBands.Y.directional).toBeDefined();
    expect(d.lateral!.stories[0].VW.Y).toBeGreaterThan(0);
  });

  it("semi-rigid distribution: line forces sum to ρ V per direction", () => {
    const p = exampleProject();
    p.lateral!.distribution = "semirigid";
    for (const s of p.lateral!.stories) s.diaphragmGa = 9.5;
    const d = designProject(p);
    const L = d.lateral!;
    expect(L.semiRigid?.length).toBeGreaterThan(0);
    const sr = L.semiRigid!.find((x) => x.kind === "seismic")!;
    const sum = sr.lines.reduce((a, l) => a + l.direct, 0);
    expect(sum).toBeCloseTo(sr.V, 3);
    expect(L.lines.some((l) => l.method === "semirigid")).toBe(true);
    for (const o of d.outcomes.values()) expect(o.error).toBeUndefined();
  });
});

import { charDepth, fireBeam, fireColumn } from "@/engine/design/fire";
import { floorFrequency } from "@/engine/loads/vibration";
import { resolveWood } from "@/engine/design/wood";

describe("NDS Ch. 16 fire design", () => {
  it("effective char depths match NDS Table 16.2.1A (1.8 / 2.5 / 3.2 in.)", () => {
    expect(charDepth(1).aEff).toBeCloseTo(1.8, 2);
    expect(charDepth(1.5).aEff).toBeCloseTo(2.5, 1);
    expect(charDepth(2).aEff).toBeCloseTo(3.2, 1);
  });
  it("6x12 beam, 1 hr, 3 sides, braced: residual 1.9 × 9.7 in.", () => {
    const mat = resolveWood({ kind: "sawn", species: "DF-L", grade: "No.1", size: "6x12", plies: 1 }, "NDS-2024");
    const r = fireBeam(mat, { hours: 1, sides: 3 }, 2000, 0);
    const S = (1.9 * 9.7 * 9.7) / 6;
    expect(r.check.demand).toBeCloseTo((2000 * 12) / S, 3);
    expect(r.check.capacity).toBeCloseTo(2.85 * mat.Fb * mat.CF, 6);
  });
  it("a 4x4 post is fully charred at 1 hr", () => {
    const mat = resolveWood({ kind: "sawn", species: "DF-L", grade: "No.1", size: "4x4", plies: 1 }, "NDS-2024");
    expect(fireColumn(mat, { hours: 1, sides: 4 }, 1000, 96, 96).check.pass).toBe(false);
  });
});

describe("floor vibration (Dolan et al. 1999)", () => {
  it("f = (π/2) √(g EI / (w L⁴)): 2x10 DF No.2 @ 16 in., 12 ft, 20 plf dead → 14.5 Hz", () => {
    // EI = 1.6e6 × 98.93 = 1.5829e8 lb·in²; w = 20 / 12 lb/in; L = 144 in (hand value 14.51 Hz)
    expect(floorFrequency(1.6e6 * 98.93, 20, 12)).toBeCloseTo(14.51, 1);
  });
  it("opt-in check appears on the joist sheet checks", () => {
    const p = exampleProject();
    const j = p.members.find((m) => m.kind === "joist")!;
    if (j.kind !== "joist") throw new Error();
    j.vibration = true;
    const r = designProject(p).outcomes.get(j.id)!.result!;
    expect(r.checks.some((c) => c.name.startsWith("Floor vibration"))).toBe(true);
  });
});

describe("notches and holes (NDS 3.1.2, 4.4.3; IRC R502.8.1)", () => {
  it("2 in. hole at mid-span of FJ-1 (2x10 @ 16, 12 ft, 15 + 40 psf): f_b = 748 psi (hand)", () => {
    const p = exampleProject();
    const j = p.members.find((m) => m.kind === "joist")!;
    if (j.kind !== "joist") throw new Error();
    j.openings = [{ type: "hole", x: 6, size: 2 }];
    const r = designProject(p).outcomes.get(j.id)!.result!;
    const bend = r.checks.find((c) => c.name.includes("Hole 1") && c.name.includes("bending"))!;
    expect(bend.combo).toBe("D + L");
    // M = 73.33 × 12² / 8 = 1,320 lb-ft; I_n = 98.93 − 1.5 × 2³ / 12 = 97.93 in⁴; c = 4.625 in
    expect(bend.demand).toBeCloseTo((1320 * 12 * 4.625) / 97.93, -1);
    expect(r.checks.find((c) => c.name.includes("diameter ≤ d/3"))!.pass).toBe(true);
  });
  it("a notch in the middle third fails the location rule", () => {
    const p = exampleProject();
    const j = p.members.find((m) => m.kind === "joist")!;
    if (j.kind !== "joist") throw new Error();
    j.openings = [{ type: "notch-top", x: 6, size: 1 }];
    const r = designProject(p).outcomes.get(j.id)!.result!;
    expect(r.checks.find((c) => c.name.includes("middle third"))!.pass).toBe(false);
    expect(r.pass).toBe(false);
  });
});

describe("multi-ply beam connection", () => {
  it("(2) 2x12 loaded on one side face: q = w / 2 at the interface", () => {
    const p = exampleProject();
    const b = p.members.find((m) => m.kind === "beam")!;
    if (b.kind !== "beam") throw new Error();
    b.material = { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x12", plies: 2 };
    b.plyConnection = { fastener: "nail", nail: "16d-common", rows: 2, spacing: 12, load: "one-side" };
    const r = designProject(p).outcomes.get(b.id)!.result!;
    if (r.kind !== "beam") throw new Error();
    const c = r.checks.find((x) => x.name.startsWith("Ply connection"))!;
    const combo = r.design.combos.find((x) => x.combo.label === c.combo)!.combo;
    const a = r.design.analysis;
    let W = 0;
    for (const t of Object.keys(a.byType) as Array<keyof typeof a.byType>)
      W += (combo.factors[t] ?? 0) * a.byType[t].R.reduce((s, v) => s + v, 0);
    expect(c.demand).toBeCloseTo(W / 2 / a.totalLength, 6);
  });
});

describe("existing lumber", () => {
  it("sister of equal EI: each member takes half, reactions unchanged", () => {
    const p = exampleProject();
    const j = p.members.find((m) => m.kind === "joist")!;
    if (j.kind !== "joist") throw new Error();
    const before = designProject(p).outcomes.get(j.id)!.result!;
    j.status = "existing";
    j.ungraded = true;
    j.sister = { species: j.species, grade: j.grade, size: j.size };
    const after = designProject(p).outcomes.get(j.id)!.result!;
    if (before.kind !== "joist" || after.kind !== "joist") throw new Error();
    expect(after.reactions[0].byType.L).toBeCloseTo(before.reactions[0].byType.L, 6);
    const fb = (r: typeof after, who: string) =>
      r.checks.find((c) => c.name.startsWith(who) && c.name.includes("Bending"))!;
    expect(fb(after, "Existing joist").demand).toBeCloseTo(
      before.checks.find((c) => c.name.includes("Bending"))!.demand / 2,
      3,
    );
    expect(fb(after, "Sister").ratio).toBeCloseTo(fb(after, "Existing joist").ratio, 6);
    expect(after.assumptions.some((a) => a.item === "Ungraded existing lumber")).toBe(true);
  });
});

describe("portal frames / prefabricated shear panels (SSW)", () => {
  it("shares the line by capacity and checks shear, drift and anchorage against the entered values", () => {
    const p = exampleProject();
    p.hardware.push({
      id: "hw-test-panel",
      model: "TEST-24x8",
      kind: "panel",
      manufacturer: "Test",
      description: "test panel",
      fasteners: "",
      report: "ESR-TEST",
      checked: false,
      source: "test values",
      panel: { type: "prefab", width: 24, height: 108, Vs: 2000, Vw: 2800, drift: 0.5, anchorT: 9000 },
    });
    const sw = p.members.find((m) => m.kind === "shearWall" && m.mark === "1SW-2")!;
    if (sw.kind !== "shearWall") throw new Error();
    p.members.push({
      kind: "shearPanel",
      id: "m-ssw",
      mark: "1SSW-1",
      description: "",
      structureId: sw.structureId,
      levelId: sw.levelId,
      status: "new",
      links: [],
      lineId: sw.lineId,
      panelId: "hw-test-panel",
      count: 1,
      h: 9,
    });
    const d = designProject(p);
    const o = d.outcomes.get("m-ssw")!;
    expect(o.error).toBeUndefined();
    const r = o.result!;
    if (r.kind !== "shearPanel") throw new Error();
    const lf = d.lateral!.lines.find((l) => l.line.id === sw.lineId)!;
    expect(r.Vs).toBeCloseTo(0.7 * lf.Eh * r.demand.share, 6);
    // drift: 0.5 in at 2000 lb ASD ≙ 2000 / 0.7 lb strength
    expect(r.drift.dxe).toBeCloseTo((0.5 * r.demand.QE) / (2000 / 0.7), 6);
    expect(r.Tmax.seismic).toBeCloseTo((r.Vs * 9) / 2, 6);
    // the wall in the same line now takes a smaller share
    const swr = d.outcomes.get(sw.id)!.result!;
    if (swr.kind !== "shearWall") throw new Error();
    expect(swr.demand.share + r.demand.share).toBeLessThan(1);
  });
});

import { rodTensileArea } from "@/engine/members/shearWall";

describe("continuous rod tie-down", () => {
  it("A_t (5/8 in. UNC) = 0.226 in²; T_a = 0.75 F_u A_b / 2 = 6,673 lb for F1554 Gr. 36", () => {
    expect(rodTensileArea(0.625)).toBeCloseTo(0.226, 3);
    const p = exampleProject();
    const w = p.members.find((m) => m.kind === "shearWall" && m.mark === "1SW-4")!;
    if (w.kind !== "shearWall") throw new Error();
    w.holdownId = undefined;
    w.rod = { d: 0.625, steel: "ASTM F1554 Grade 36", plate: { w: 3, l: 5.5 }, takeUp: 0.04, shrinkage: 0.05 };
    const r = designProject(p).outcomes.get(w.id)!.result!;
    if (r.kind !== "shearWall") throw new Error();
    expect(r.rod!.Ta).toBeCloseTo((0.75 * 58000 * Math.PI * 0.625 ** 2) / 4 / 2, 3);
    expect(r.rod!.delta.total).toBeCloseTo(r.rod!.delta.rod + 0.09, 6);
    expect(r.checks.some((c) => c.name.startsWith("Hold-down"))).toBe(false);
  });
});
