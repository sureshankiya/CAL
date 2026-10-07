import { describe, expect, it } from "vitest";
import { analyseBeam, patternEnvelope, reactionEnvelope } from "@/engine/analysis/beam";

const EI = 1e9; // lb-in²
const max = (a: number[]) => Math.max(...a);
const min = (a: number[]) => Math.min(...a);

describe("beam solver — closed-form checks", () => {
  it("simple span, full UDL: R = wL/2, M = wL²/8, δ = 5wL⁴/384EI", () => {
    const a = analyseBeam({ spans: [20] }, EI, [{ type: "D", kind: "udl", x1: 0, x2: 20, w1: 100 }]);
    const r = a.byType.D;
    expect(r.R[0]).toBeCloseTo(1000, 3);
    expect(r.R[1]).toBeCloseTo(1000, 3);
    expect(max(r.M)).toBeCloseTo(5000, 3);
    const w = 100 / 12;
    const L = 240;
    expect(max(r.defl)).toBeCloseTo((5 * w * L ** 4) / (384 * EI), 4);
  });

  it("simple span, midspan point load: M = PL/4, δ = PL³/48EI", () => {
    const a = analyseBeam({ spans: [20] }, EI, [{ type: "L", kind: "point", x: 10, P: 1000 }]);
    const r = a.byType.L;
    expect(r.R[0]).toBeCloseTo(500, 3);
    expect(max(r.M)).toBeCloseTo(5000, 3);
    expect(max(r.defl)).toBeCloseTo((1000 * 240 ** 3) / (48 * EI), 4);
    // shear jump of P at the load
    const i = a.x.findIndex((x) => Math.abs(x - 10) < 1e-6);
    expect(r.VL[i] - r.VR[i]).toBeCloseTo(1000, 3);
  });

  it("two equal spans, full UDL: Rext = 0.375wL, Rint = 1.25wL, Mint = −wL²/8", () => {
    const a = analyseBeam({ spans: [10, 10] }, EI, [{ type: "D", kind: "udl", x1: 0, x2: 20, w1: 100 }]);
    const r = a.byType.D;
    expect(r.R[0]).toBeCloseTo(375, 3);
    expect(r.R[1]).toBeCloseTo(1250, 3);
    expect(r.R[2]).toBeCloseTo(375, 3);
    expect(min(r.M)).toBeCloseTo(-1250, 2);
    expect(max(r.M)).toBeCloseTo((9 / 128) * 100 * 100, 1);
  });

  it("overhang loaded only: backspan uplift, M at support = −wa²/2, tip δ = wa(4a²l + 3a³)/24EI", () => {
    const a = analyseBeam({ spans: [10], rightCantilever: 3 }, EI, [{ type: "D", kind: "udl", x1: 10, x2: 13, w1: 100 }]);
    const r = a.byType.D;
    expect(r.R[1]).toBeCloseTo((100 * 3 * (10 + 1.5)) / 10, 3);
    expect(r.R[0]).toBeCloseTo(-45, 3);
    expect(min(r.M)).toBeCloseTo(-450, 2);
    const w = 100 / 12;
    const aa = 36;
    const l = 120;
    const tip = r.defl[r.defl.length - 1];
    expect(tip).toBeCloseTo((w * aa * (4 * aa * aa * l + 3 * aa ** 3)) / (24 * EI), 4);
  });

  it("pattern live load on two spans: max +M with one span loaded ≈ 0.0957wL², −M with both", () => {
    const a = analyseBeam({ spans: [10, 10] }, EI, [{ type: "L", kind: "udl", x1: 0, x2: 20, w1: 100 }]);
    const env = patternEnvelope(a, "L", "M");
    expect(max(env.max)).toBeCloseTo(0.0957 * 100 * 100, 0);
    expect(min(env.min)).toBeCloseTo(-1250, 1);
    const re = reactionEnvelope(a, "L");
    expect(re.max[1]).toBeCloseTo(1250, 2);
    // exterior support sees uplift when only the far span is loaded: −wL/16
    expect(re.min[0]).toBeCloseTo(-62.5, 2);
  });

  it("linear (triangular) load on a simple span: R = wL/6 and wL/3, Mmax = wL²/(9√3)", () => {
    const a = analyseBeam({ spans: [12] }, EI, [{ type: "D", kind: "linear", x1: 0, x2: 12, w1: 0, w2: 300 }]);
    const r = a.byType.D;
    expect(r.R[0]).toBeCloseTo((300 * 12) / 6, 3);
    expect(r.R[1]).toBeCloseTo((300 * 12) / 3, 3);
    expect(max(r.M)).toBeCloseTo((300 * 144) / (9 * Math.sqrt(3)), 0);
  });
});
