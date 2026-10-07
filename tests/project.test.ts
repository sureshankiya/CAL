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
    if (back.ok) expect(back.project).toEqual(p);
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
    expect(order.indexOf("m-fj1")).toBeLessThan(order.indexOf("m-b1"));
    const loop = structuredClone(p);
    const fj = loop.members.find((m) => m.id === "m-fj1")!;
    fj.links = [{ id: "x", kind: "point", sourceId: "m-b1", support: 0, label: "", x: 1, factor: 1 }];
    expect(designOrder(loop.members).circular.sort()).toEqual(["m-b1", "m-fj1"]);
    expect(designProject(loop).outcomes.get("m-b1")!.error).toMatch(/Circular/);
  });

  it("designs the example house and carries reactions along the load path", () => {
    const p = exampleProject();
    const d = designProject(p);
    for (const [, o] of d.outcomes) expect(o.error).toBeUndefined();
    const fj = d.outcomes.get("m-fj1")!.result!;
    const b1 = d.outcomes.get("m-b1")!;
    // girder line load = 2 × joist reaction per foot (joists both sides)
    const wL = b1.linked.find((l) => l.type === "L")!.w!;
    expect(wL).toBeCloseTo(2 * fj.reactions[1].perFoot!.L, 6);
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
