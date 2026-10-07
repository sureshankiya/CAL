import { describe, expect, it } from "vitest";
import { assemblyDesignValue, assemblySum, defaultAssemblies } from "@/engine/loads/dead";
import { liveLoad, roofLiveReduction } from "@/engine/loads/live";
import { slopeFactor, snowLoads, type SnowInput } from "@/engine/loads/snow";

describe("dead-load assemblies", () => {
  it("sums itemised components and keeps the rounded design value at or above the sum", () => {
    const a = defaultAssemblies();
    for (const x of a) expect(assemblyDesignValue(x)).toBeGreaterThanOrEqual(assemblySum(x));
    const rd1 = a.find((x) => x.id === "RD1")!;
    expect(assemblySum(rd1)).toBeCloseTo(9.6, 6);
    expect(() => assemblyDesignValue({ ...rd1, designValue: 9 })).toThrow(/less than the itemised sum/);
  });
});

describe("live loads", () => {
  it("returns IRC / IBC values for dwellings", () => {
    expect(liveLoad("sleeping", "IRC").psf).toBe(30);
    expect(liveLoad("living", "IBC").psf).toBe(40);
    expect(liveLoad("deck", "IRC").psf).toBe(40);
    expect(liveLoad("deck", "IBC").psf).toBe(60);
    expect(liveLoad("garage", "IRC").psf).toBe(50);
  });

  it("reduces roof live load per ASCE 7 §4.8.2", () => {
    expect(roofLiveReduction(20, 150, 4).Lr).toBe(20);
    const r = roofLiveReduction(20, 400, 6); // R1 = 0.8, R2 = 0.9
    expect(r.R1).toBeCloseTo(0.8, 9);
    expect(r.R2).toBeCloseTo(0.9, 9);
    expect(r.Lr).toBeCloseTo(14.4, 9);
    expect(roofLiveReduction(20, 800, 12).Lr).toBe(12); // 20 × 0.6 × 0.6 = 7.2 → 12 minimum
    expect(roofLiveReduction(20, 800, 12).bounded).toBe("min");
  });
});

describe("snow loads", () => {
  const base: SnowInput = {
    edition: "ASCE 7-16",
    pg: 30,
    Ce: 1.0,
    Ct: 1.0,
    Is: 1.1,
    rise: 6,
    slippery: false,
    W: 16,
    gable: true,
  };

  it("ASCE 7-16 includes Is in pf; ASCE 7-22 does not", () => {
    expect(snowLoads(base).pf).toBeCloseTo(0.7 * 1.1 * 30, 9);
    expect(snowLoads({ ...base, edition: "ASCE 7-22" }).pf).toBeCloseTo(0.7 * 30, 9);
  });

  it("uses Fig. 7.4-1 slope factors", () => {
    expect(slopeFactor(26.57, 1.0, false)).toBe(1);
    expect(slopeFactor(45, 1.0, false)).toBeCloseTo(1 - 15 / 40, 9);
    expect(slopeFactor(26.57, 1.0, true)).toBeCloseTo(1 - (26.57 - 5) / 65, 9);
    expect(slopeFactor(20, 1.2, true)).toBeCloseTo(1 - 5 / 55, 9);
  });

  it("applies the minimum load below 15° and unbalanced leeward Is·pg for W ≤ 20 ft", () => {
    const low = snowLoads({ ...base, rise: 2 }); // 9.46°
    expect(low.pmApplies).toBe(true);
    expect(low.pm).toBeCloseTo(20 * 1.1, 9); // pg > 20 psf → 20 Is
    const r = snowLoads(base); // 26.57°, ≤ 30.2°
    expect(r.unbalanced.applies).toBe(true);
    expect(r.unbalanced.leeward).toBeCloseTo(1.1 * 30, 9);
    expect(r.rafterUniform).toBeCloseTo(33, 9); // leeward Is·pg = 33 psf > ps = 23.1 psf
    expect(r.rafterCase).toBe("Unbalanced, leeward side");
  });

  it("adds rain-on-snow for low-slope roofs with pg ≤ 20 psf", () => {
    const r = snowLoads({ ...base, pg: 15, rise: 0.125, W: 40, gable: false }); // 0.6° < 40/50 = 0.8°
    expect(r.rainOnSnow).toBe(5);
    expect(r.balanced).toBeCloseTo(0.7 * 1.1 * 15 + 5, 9);
  });

  it("returns zero design snow when pg = 0", () => {
    const r = snowLoads({ ...base, pg: 0 });
    expect(r.rafterUniform).toBe(0);
    expect(r.pmApplies).toBe(false);
  });
});
