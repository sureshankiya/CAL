import { describe, expect, it } from "vitest";
import {
  beamStabilityFactor,
  designWoodBeam,
  effectiveLength,
  nds441Rule,
  volumeFactor,
  type WoodBeamInput,
} from "@/engine/design/wood";

const base = (over: Partial<WoodBeamInput>): WoodBeamInput => ({
  material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x12", plies: 1 },
  geometry: { spans: [14] },
  loads: [],
  includeSelfWeight: false,
  conditions: { wetService: false, incised: false, repetitive: true, flatUse: false },
  lu: { top: 0, bottom: 0 },
  bearingLengths: [1.5, 1.5],
  defl: { live: 360, total: 480 },
  Kcr: 1.5,
  nds: "NDS-2018",
  ...over,
});

describe("NDS wood beam design", () => {
  it("matches the JoistCalc default joist (2x12 DF-L No.2 @ 16 in., 14 ft, 15/40 psf): governing D/C 0.723", () => {
    const trib = 16 / 12;
    const r = designWoodBeam(
      base({
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 14, w1: 15 * trib },
          { type: "L", kind: "udl", x1: 0, x2: 14, w1: 40 * trib },
        ],
      }),
    );
    expect(r.factors.Cr).toBe(1.15);
    expect(r.bending.capacity).toBeCloseTo(1035, 1); // 900 × 1.0 × 1.0 × 1.15
    expect(r.bending.demand).toBeCloseTo(681.4, 0);
    expect(r.bending.combo).toBe("D + L");
    expect(r.shear.demand).toBeCloseTo(39.5, 0); // V at d
    expect(r.deflection[0].live).toBeCloseTo(0.1619, 3);
    expect(r.deflection[0].total).toBeCloseTo(0.2529, 3);
    expect(r.governing.ratio).toBeCloseTo(0.723, 3);
    expect(r.bearing[0].lbReq).toBeCloseTo(0.5476, 3);
  });

  it("reproduces the N Lugo Tedds 2x10 dropped beam (DF-L Sel Str, 22 ft)", () => {
    const r = designWoodBeam(
      base({
        material: { kind: "sawn", species: "DF-L", grade: "Sel Str", size: "2x10", plies: 1 },
        geometry: { spans: [22] },
        conditions: { wetService: false, incised: false, repetitive: false, flatUse: false },
        // Tedds: dead 13 plf + self weight (≈2.48 plf as used on that sheet), live 3 plf
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 22, w1: 15.48 },
          { type: "L", kind: "udl", x1: 0, x2: 22, w1: 3 },
        ],
        bearingLengths: [4, 4],
        defl: { live: 360, total: 1 / 0.003 },
        Kcr: 1.0,
      }),
    );
    const Mmax = r.combos.find((c) => c.combo.label === "D + L")!.Mpos;
    expect(Mmax).toBeCloseTo(1118, 0);
    expect(r.bending.capacity).toBeCloseTo(1650, 1);
    expect(r.bending.demand).toBeCloseTo(627, 0);
    expect(r.bearing[1].fcperp).toBeCloseTo(33.9, 1);
    expect(r.deflection[0].total).toBeCloseTo(0.518, 3);
    expect(r.deflection[0].totalRatio).toBeCloseTo(0.654, 3);
  });

  it("computes C_L per NDS 3.3.3 for an unbraced 2x12 (lu = 10 ft)", () => {
    const le = effectiveLength(120, 11.25);
    expect(le).toBeCloseTo(229.35, 2);
    const RB2 = (le * 11.25) / (1.5 * 1.5);
    const FbE = (1.2 * 580000) / RB2;
    expect(beamStabilityFactor(FbE, 900)).toBeCloseTo(0.623, 3);
    const r = designWoodBeam(
      base({
        conditions: { wetService: false, incised: false, repetitive: false, flatUse: false },
        lu: { top: 10, bottom: 10 },
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 14, w1: 20 },
          { type: "L", kind: "udl", x1: 0, x2: 14, w1: 50 },
        ],
      }),
    );
    const row = r.combos.find((c) => c.combo.label === "D + L")!;
    expect(row.CLpos).toBeCloseTo(0.623, 3);
  });

  it("checks the tension-face notch shear (NDS 3.4.3.2): V'r = 2/3 Fv' b dn (dn/d)²", () => {
    const r = designWoodBeam(
      base({
        material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x8", plies: 1 },
        geometry: { spans: [12] },
        notchDepth: 5.5,
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 12, w1: 30 },
          { type: "Lr", kind: "udl", x1: 0, x2: 12, w1: 40 },
        ],
      }),
    );
    // D + Lr governs: C_D = 1.25, Fv' = 225 psi, V = 70 × 12 / 2 = 420 lb
    const Vr = (2 / 3) * 225 * 1.5 * 5.5 * (5.5 / 7.25) ** 2;
    expect(r.notch!.capacity).toBeCloseTo(Vr, 1);
    expect(r.notch!.demand).toBeCloseTo(420, 1);
    expect(r.notch!.CD).toBe(1.25);
  });

  it("applies the glulam volume factor C_V (NDS 5.3.6)", () => {
    expect(volumeFactor(20, 12, 5.125, 10)).toBe(1);
    expect(volumeFactor(20, 24, 5.125, 10)).toBeCloseTo(Math.pow(21 / 20, 0.1) * Math.pow(0.5, 0.1), 4);
  });

  it("pattern-loads live load on a two-span joist and reports interior negative moment", () => {
    const r = designWoodBeam(
      base({
        geometry: { spans: [12, 12] },
        bearingLengths: [1.5, 3.5, 1.5],
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 24, w1: 20 },
          { type: "L", kind: "udl", x1: 0, x2: 24, w1: 53.33 },
        ],
      }),
    );
    expect(r.bendingNeg).toBeDefined();
    // −M at the interior support = (wD + wL) L² / 8 with both spans loaded
    expect(r.bendingNeg!.demand).toBeCloseTo(((((20 + 53.33) * 144) / 8) * 12) / 31.641, 0);
    // interior reaction includes pattern maximum 1.25 wL for both
    expect(r.reactions[1].maxDown).toBeCloseTo(1.25 * (20 + 53.33) * 12, 0);
  });

  it("checks live deflection of a floor + roof member under 0.75L + 0.75S (ASCE 7 §2.4.1 (4))", () => {
    const r = designWoodBeam(
      base({
        material: { kind: "sawn", species: "DF-L", grade: "No.1", size: "4x10", plies: 1 },
        geometry: { spans: [10] },
        conditions: { wetService: false, incised: false, repetitive: false, flatUse: false },
        loads: [
          { type: "D", kind: "udl", x1: 0, x2: 10, w1: 100 },
          { type: "L", kind: "udl", x1: 0, x2: 10, w1: 100 },
          { type: "S", kind: "udl", x1: 0, x2: 10, w1: 100 },
        ],
        Kcr: 1.0,
      }),
    );
    const EI = 1_700_000 * ((3.5 * 9.25 ** 3) / 12);
    const d100 = (5 * (100 / 12) * 120 ** 4) / (384 * EI);
    expect(r.deflection[0].live).toBeCloseTo(1.5 * d100, 4);
    expect(r.deflection[0].liveSource).toBe("0.75L + 0.75S");
    expect(r.deflection[0].total).toBeCloseTo(2.5 * d100, 4);
  });

  it("applies C_L = 1.0 under the NDS 4.4.1.2 rules and reports the bracing condition", () => {
    const common = {
      geometry: { spans: [12, 12] },
      bearingLengths: [1.5, 3.5, 1.5],
      lu: { top: 0, bottom: 8 },
      loads: [
        { type: "D" as const, kind: "udl" as const, x1: 0, x2: 24, w1: 20 },
        { type: "L" as const, kind: "udl" as const, x1: 0, x2: 24, w1: 53.33 },
      ],
    };
    const calc = designWoodBeam(base(common));
    const row = calc.combos.find((c) => c.combo.label === "D + L")!;
    // le = 1.63(96) + 3(11.25) = 190.23 in; R_B² = 951.2; F_bE = 1.2(580,000)/951.2 = 731.7 psi; F_b* = 1035 psi
    expect(row.CLneg).toBeCloseTo(0.6476, 3);
    const rule = designWoodBeam(base({ ...common, rule441: true }));
    expect(rule.factors.stability).toBe("rule-4.4.1");
    expect(rule.combos.find((c) => c.combo.label === "D + L")!.CLneg).toBe(1);
    expect(rule.mat.nominalRatio).toBe(6);
    expect(nds441Rule(6).text).toContain("8 ft");
    expect(nds441Rule(8).ok).toBe(false);
  });

  it("reports R_B > 50 as a failed check instead of stopping (NDS 3.3.3.7)", () => {
    const r = designWoodBeam(
      base({
        conditions: { wetService: false, incised: false, repetitive: false, flatUse: false },
        geometry: { spans: [30] },
        lu: { top: 30, bottom: 30 },
        loads: [{ type: "D", kind: "udl", x1: 0, x2: 30, w1: 5 }],
      }),
    );
    const c = r.checks.find((k) => k.name.startsWith("Beam slenderness"))!;
    expect(c.demand).toBeCloseTo(Math.sqrt((1.84 * 360 * 11.25) / 2.25), 2);
    expect(c.pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  it("limits the end-notch depth to d/4 for sawn lumber (NDS 4.4.3.2)", () => {
    const run = (dn: number) =>
      designWoodBeam(
        base({
          material: { kind: "sawn", species: "DF-L", grade: "No.2", size: "2x8", plies: 1 },
          geometry: { spans: [12] },
          notchDepth: dn,
          loads: [{ type: "D", kind: "udl", x1: 0, x2: 12, w1: 10 }],
        }),
      ).checks.find((k) => k.name.startsWith("End notch depth"))!;
    expect(run(5.5).pass).toBe(true); // 1.75 in. ≤ 1.8125 in.
    expect(run(5.0).pass).toBe(false); // 2.25 in. > 1.8125 in.
  });

  it("checks a cantilever with ℓ = 2 × overhang (IBC Table 1604.3 note)", () => {
    const r = designWoodBeam(
      base({
        geometry: { spans: [12], rightCantilever: 3 },
        bearingLengths: [3.5, 3.5],
        loads: [{ type: "L", kind: "udl", x1: 12, x2: 15, w1: 60 }],
      }),
    );
    const cant = r.deflection.find((d) => d.kind === "cantilever")!;
    expect(cant.limitLength).toBe(6);
    expect(cant.liveLimit).toBeCloseTo((6 * 12) / 360, 6);
    const EI = 1_600_000 * ((1.5 * 11.25 ** 3) / 12);
    const w = 60 / 12;
    const a = 36;
    const l = 144;
    expect(cant.live).toBeCloseTo((w * a * (4 * a * a * l + 3 * a ** 3)) / (24 * EI), 4);
  });
});

describe("sizing helpers", () => {
  it("finds the lightest passing joist, the longest passing span and the largest spacing", async () => {
    const { firstPassing, maxPassing, maxPassingSpacing } = await import("@/engine/design/sizing");
    const joist = (size: string, span: number, spacing: number) =>
      designWoodBeam(
        base({
          material: { kind: "sawn", species: "DF-L", grade: "No.2", size, plies: 1 },
          geometry: { spans: [span] },
          loads: [
            { type: "D", kind: "udl", x1: 0, x2: span, w1: (15 * spacing) / 12 },
            { type: "L", kind: "udl", x1: 0, x2: span, w1: (40 * spacing) / 12 },
          ],
        }),
      );
    const out = firstPassing(["2x6", "2x8", "2x10", "2x12"], (s) => joist(s, 14, 16));
    // L/480 total with K_cr = 1.5 governs: 2x10 total δ ≈ 0.455 in. > 0.350 in.
    expect(out.chosen?.candidate).toBe("2x12");
    expect(out.trials.map((t) => t.result?.pass)).toEqual([false, false, false, true]);
    const L = maxPassing((span) => joist("2x12", span, 16), 4, 30)!;
    expect(joist("2x12", L, 16).pass).toBe(true);
    expect(joist("2x12", L + 1 / 12, 16).pass).toBe(false);
    expect(maxPassingSpacing((s) => joist("2x12", 14, s))).toBe(19.2);
    expect(maxPassingSpacing((s) => joist("2x10", 14, s))).toBe(12);
  });
});
