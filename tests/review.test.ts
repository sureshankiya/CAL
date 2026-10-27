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
