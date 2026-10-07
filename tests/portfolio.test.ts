/**
 * Parity with sheets from the portfolio permit sets (PLAN.md §2A).
 * The N Lugo Tedds wood beam is in tests/wood.test.ts; JoistCalc parity in
 * tests/wood.test.ts and tests/reference.test.ts.
 */

import { describe, expect, it } from "vitest";
import { columnStabilityFactor } from "@/engine/design/wood";
import { lumberData } from "@/engine/data/sawn";
import { woodDensity } from "@/engine/data/sections";
import { defaultAssemblies } from "@/engine/loads/dead";
import { designRafter, type DesignContext } from "@/engine/members";

const ctx: DesignContext = {
  cycleId: "2025",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1.0,
  SDS: 1.0,
};

describe("portfolio parity", () => {
  it("1109 San Miguel — 2x8 DF-L No.2 rafters @ 24 in., 4:12, 8'-2\" horizontal span (D 10 psf + Lr 20 psf, plan basis)", () => {
    const r = designRafter(ctx, {
      id: "sm",
      mark: "R-1",
      description: "",
      species: "DF-L",
      grade: "No.2",
      size: "2x8",
      spacing: 24,
      rise: 4,
      run: 8 + 2 / 12,
      overhang: 0,
      ridge: "beam",
      plateSeat: 3.5,
      ridgeSeat: 0,
      seatCut: 0,
      dead: { psf: 10, basis: "horizontal" },
      roofLive: true,
      snow: false,
      deflection: { preset: "custom", live: 240, total: 240 },
      luBottom: 0,
      rule441: false,
      gable: true,
    });
    const row = r.design.combos.find((c) => c.combo.label === "D + Lr")!;
    // sheet: M = 60.0 × 8.167² / 8 = 500 lb-ft; fb = 457 psi; V = R = 245 lb
    expect(row.Mpos).toBeCloseTo(500.2, 0);
    expect(r.design.bending.demand).toBeCloseTo(456.8, 0);
    expect(r.reactions[0].maxDown).toBeCloseTo(245, 0);
    // sheet F'b = 900 × 1.25 × 1.2 = 1,350 psi (no C_r); HouseCalc applies C_r = 1.15 at 24 in. o.c. (NDS 4.3.9)
    expect(r.design.bending.capacity).toBeCloseTo(1350 * 1.15, 1);
    // sheet deflection 0.079 in. is on the horizontal span; along the slope it is 0.079 / cos² θ
    const cos2 = Math.cos(Math.atan(4 / 12)) ** 2;
    expect(r.design.deflection[0].total).toBeCloseTo(0.0789 / cos2, 3);
  });

  it("16619 Orchard / 215 Paden Tedds posts — Table 4D values, density and C_P", () => {
    const no2 = lumberData("DF-L", "No.2", "6x6", "NDS-2018");
    expect(no2.ref).toEqual({ Fb: 750, Ft: 475, Fv: 170, Fcperp: 625, Fc: 700, E: 1_300_000, Emin: 470_000 });
    expect(no2.sizeClass).toBe("Posts and timbers");
    const no1 = lumberData("DF-L", "No.1", "6x6", "NDS-2018");
    expect(no1.ref).toEqual({ Fb: 1200, Ft: 825, Fv: 170, Fcperp: 625, Fc: 1000, E: 1_600_000, Emin: 580_000 });
    // Tedds: density 34.204 lb/ft³ for G = 0.5
    expect(woodDensity(0.5)).toBeCloseTo(34.204, 3);
    // Tedds (Paden POST 1): FcE = 0.822 × 580,000 / (96 / 5.5)² = 1,565 psi; Fc* = 900 psi; C_P = 0.84
    const FcE = (0.822 * 580000) / (96 / 5.5) ** 2;
    expect(FcE).toBeCloseTo(1565, 0);
    expect(columnStabilityFactor(FcE, 900, 0.8)).toBeCloseTo(0.842, 3);
    // Tedds (Orchard POST 1): FcE = 1,268 psi with Emin 470,000 psi; Fc* = 700 psi; C_P = 0.85
    expect(columnStabilityFactor((0.822 * 470000) / (96 / 5.5) ** 2, 700, 0.8)).toBeCloseTo(0.85, 2);
  });
});
