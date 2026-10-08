import { describe, expect, it } from "vitest";
import {
  designOrder,
  designProject,
  duplicateMarks,
  exampleProject,
  formatMark,
  nextMark,
  parseProject,
  projectSchema,
  serializeProject,
} from "@/engine/project";

describe("project model", () => {
  it("the example project validates and round-trips through JSON", () => {
    const p = exampleProject();
    expect(projectSchema.safeParse(p).success).toBe(true);
    const back = parseProject(serializeProject(p));
    expect(back.ok).toBe(true);
    if (back.ok) {
      // the saved file adds the software stamp (engine / data-library versions)
      const { software, ...rest } = back.project;
      expect(software?.engine).toBeDefined();
      expect(rest).toEqual(p);
    }
  });

  it("rejects malformed files with readable messages", () => {
    const bad = parseProject('{"schemaVersion":1,"info":{}}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
    expect(parseProject("not json").ok).toBe(false);
  });

  it("orders members so sources are designed first and detects circular load paths", () => {
    const p = exampleProject();
    const { order, circular } = designOrder(p.members);
    expect(circular).toEqual([]);
    expect(order.indexOf("m-r1")).toBeLessThan(order.indexOf("m-cj1"));
    expect(order.indexOf("m-cj1")).toBeLessThan(order.indexOf("m-h1"));
    expect(order.indexOf("m-ij1")).toBeLessThan(order.indexOf("m-b1"));
    expect(order.indexOf("m-b1")).toBeLessThan(order.indexOf("m-p1"));
    expect(order.indexOf("m-p1")).toBeLessThan(order.indexOf("m-pf1"));
    expect(order.indexOf("m-w1")).toBeLessThan(order.indexOf("m-f1"));
    const loop = structuredClone(p);
    const ij = loop.members.find((m) => m.id === "m-ij1")!;
    ij.links = [{ id: "x", kind: "point", sourceId: "m-b1", support: 0, label: "", x: 1, factor: 1 }];
    expect(designOrder(loop.members).circular).toEqual(expect.arrayContaining(["m-b1", "m-ij1"]));
    expect(designProject(loop).outcomes.get("m-b1")!.error).toMatch(/Circular/);
  });

  it("designs the example house and carries reactions along the load path", () => {
    const p = exampleProject();
    const d = designProject(p);
    for (const [, o] of d.outcomes) expect(o.error).toBeUndefined();
    const fj = d.outcomes.get("m-fj1")!.result!;
    const ij = d.outcomes.get("m-ij1")!.result!;
    const b1 = d.outcomes.get("m-b1")!;
    // girder line load = I-joist reaction per foot
    expect(b1.linked.find((l) => l.type === "L")!.w!).toBeCloseTo(ij.reactions[1].perFoot!.L, 6);
    // interior footing: joists from both sides (factor 2) plus the bearing wall
    const f2 = d.outcomes.get("m-f2")!;
    expect(f2.linked.find((l) => l.type === "L" && l.label.includes("FJ-1"))!.w!).toBeCloseTo(
      2 * fj.reactions[1].perFoot!.L,
      6,
    );
    // stud pack under the header carries the header reaction to the footing
    const h1r = d.outcomes.get("m-h1")!.result!;
    const w1 = d.outcomes.get("m-w1")!.result!;
    expect(w1.reactions[1].byType.D).toBeCloseTo(h1r.reactions[0].byType.D, 6);
    // post → pad
    const p1 = d.outcomes.get("m-p1")!.result!;
    const b1r = b1.result!;
    expect(p1.reactions[0].byType.L).toBeCloseTo(b1r.reactions[0].byType.L, 6);
    // lateral: every shear wall has a demand from its wall line
    expect(d.lateral).toBeDefined();
    const sws = [...d.outcomes.values()].filter((o) => o.spec.kind === "shearWall");
    expect(sws.length).toBe(5);
    const line1 = d.lateral!.lines.find((l) => l.line.id === "LN1")!;
    const sumE = sws
      .filter((o) => o.spec.kind === "shearWall" && o.spec.lineId === "LN1")
      .reduce((s, o) => s + (o.result!.kind === "shearWall" ? o.result!.demand.Eh : 0), 0);
    expect(sumE).toBeCloseTo(line1.Eh, 6);
    // header carries the rafter plate reaction per foot
    const r1 = d.outcomes.get("m-r1")!.result!;
    const h1 = d.outcomes.get("m-h1")!;
    const lrLine = h1.linked.find((l) => l.type === "Lr" && l.label.includes("R-1"))!;
    expect(lrLine.w).toBeCloseTo(r1.reactions[0].perFoot!.Lr, 6);
    // ceiling joist sees the rafter thrust as tension
    const cj = d.outcomes.get("m-cj1")!.result!;
    expect(cj.kind).toBe("ceilingJoist");
    if (cj.kind === "ceilingJoist") expect(cj.tension).toBeDefined();
    for (const [, o] of d.outcomes) expect(o.result!.pass).toBe(true);
  });

  it("formats marks from templates and finds the next free mark", () => {
    expect(formatMark("B{L}{nn}", 1, 1)).toBe("B101");
    expect(formatMark("{L}W-{n}", 2, 3)).toBe("2W-3");
    const p = exampleProject();
    expect(nextMark(p, "joist", 1)).toBe("FJ-2");
    expect(duplicateMarks(p)).toEqual([]);
  });
});
