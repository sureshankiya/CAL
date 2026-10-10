/** Plain-language input sheets: engineering labels, values with units, schedule tables, flexible headings. */
import { describe, expect, it } from "vitest";
import {
  applyMarkdown,
  designProject,
  newProject,
  type BeamSpec,
  type FootingSpec,
  type JoistSpec,
} from "@/engine/project";
import { STARTER_SHEET, quantity, woodMaterial } from "@/engine/project/mdFriendly";

const SHEET = `# 22 Oak Street — input

## Project information

- Project name: 22 Oak Street addition
- Address: 22 Oak Street, Escondido, CA
- Job no: 2026-118
- Engineer: S. Ankiya, PE
- Date: 2/2/2026
- Code: 2025 CBC
- Risk category: II

## Design criteria

| Parameter | Value | Unit |
|---|---|---|
| Roof live load | 20 | psf |
| Ground snow load | 0 | psf |
| SDS / SD1 | 1.10 / 0.62 | |
| Site class | D | |
| Seismic design category | D | |
| Wind speed | 95 | mph |
| Exposure | C | |
| Allowable soil bearing | 1,500 | psf |
| f'c | 2,500 | psi |
| Rebar | Grade 60 | |

## B-1 (beam)

- Description: Garage door header
- Size: (3) 1-3/4 x 11-7/8 LVL 2.0E
- Span: 16'-6"
- Tributary width: 6 ft
- Dead load: 15 psf
- Live load: 40 psf
- Point load: 1,200 lb L at 8 ft
- Bearing length: 3 in
- Deflection: L/360 live, L/240 total

## Floor joist FJ-1

- Size: 2x10 DF-L No.2 @ 16 in. o.c.
- Spans: 13'-4", 11'-0"
- Dead load: 12 psf
- Live load: sleeping
- Wind spd: 90

### Beam schedule

| Mark | Size | Span (ft) | Trib (ft) | Dead load | Live load |
|---|---|---|---|---|---|
| B-2 | 4x12 DF-L No.1 | 10.5 | 4 | 15 psf | 40 psf |
| H-1 | 4x8 | 6'-0" | 2 | 15 psf | — |

## Footing schedule

| Mark | Size | Reinforcement | Depth below grade |
|---|---|---|---|
| F-1 | 15 in W x 12 in D | (2) #4 top & bottom | 18 in |
| PF-1 | 24 x 24 x 12 in | (3) #4 each way | 18 in |
`;

describe("plain-language input sheet", () => {
  const r = applyMarkdown(newProject("blank"), SHEET, { mode: "new" });

  it("applies without errors and reports every conversion", () => {
    expect(r.report.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.report.added).toEqual(["B-1", "FJ-1", "B-2", "H-1", "F-1", "PF-1"]);
    expect(r.report.converted.some((c) => /Span: 16'-6" → spans = \[16\.5\]/.test(c))).toBe(true);
  });

  it("reads project labels with units", () => {
    if (!r.ok) throw new Error("not applied");
    const p = r.project;
    expect(p.info).toMatchObject({
      name: "22 Oak Street addition",
      jobRef: "2026-118",
      preparedBy: "S. Ankiya, PE",
      date: "2026-02-02",
    });
    expect(p.cycleId).toBe("2025");
    expect(p.criteria.seismic).toMatchObject({ SDS: 1.1, SD1: 0.62, siteClass: "D", SDC: "D" });
    expect(p.criteria.wind).toMatchObject({ V: 95, exposure: "C" });
    expect(p.criteria.soil.bearing).toBe(1500);
    expect(p.criteria.concrete).toMatchObject({ fc: 2500, fy: 60000 });
  });

  it("reads member labels: sizes, spans in ft-in, loads, deflection, bearing", () => {
    if (!r.ok) throw new Error("not applied");
    const b1 = r.project.members.find((m) => m.mark === "B-1") as BeamSpec;
    expect(b1.material).toEqual({ kind: "scl", product: "LVL 2.0E", plies: 3, plyWidth: 1.75, d: 11.875 });
    expect(b1.spans).toEqual([16.5]);
    expect(b1.area[0]).toMatchObject({ trib: 6, dead: { psf: 15 }, live: { psf: 40 } });
    expect(b1.extra).toEqual([{ kind: "point", type: "L", label: "1,200 lb L at 8 ft", P: 1200, x: 8 }]);
    expect(b1.bearing).toEqual([3, 3]);
    expect(b1.deflection).toEqual({ preset: "custom", live: 360, total: 240 });
    const fj = r.project.members.find((m) => m.mark === "FJ-1") as JoistSpec;
    expect(fj).toMatchObject({
      size: "2x10",
      species: "DF-L",
      grade: "No.2",
      spacing: 16,
      live: { use: "sleeping" },
      dead: { psf: 12 },
    });
    expect(fj.spans[0]).toBeCloseTo(13.3333, 3);
    expect(fj.bearing).toHaveLength(3); // one per support for two spans
  });

  it("reads schedule tables (kind from the heading or the mark)", () => {
    if (!r.ok) throw new Error("not applied");
    const b2 = r.project.members.find((m) => m.mark === "B-2") as BeamSpec;
    expect(b2.material).toMatchObject({ kind: "sawn", size: "4x12", grade: "No.1" });
    expect(b2.spans).toEqual([10.5]);
    const h1 = r.project.members.find((m) => m.mark === "H-1") as BeamSpec;
    expect(h1.role).toBe("header");
    expect(h1.spans).toEqual([6]);
    const f1 = r.project.members.find((m) => m.mark === "F-1") as FootingSpec;
    expect(f1).toMatchObject({
      type: "strip",
      B: 1.25,
      h: 12,
      depth: 18,
      longitudinal: { size: "#4", top: 2, bottom: 2 },
    });
    const pf = r.project.members.find((m) => m.mark === "PF-1") as FootingSpec;
    expect(pf).toMatchObject({ type: "pad", B: 2, L: 2, h: 12, rebar: { size: "#4", count: 3 } });
  });

  it("reports unknown labels with the nearest field instead of failing", () => {
    expect(r.report.ignored.some((x) => /"Wind spd" — not a field of a joist/.test(x))).toBe(true);
  });

  it("designs the members it built", () => {
    if (!r.ok) throw new Error("not applied");
    const d = designProject(r.project);
    for (const o of d.outcomes.values()) expect(o.error).toBeUndefined();
  });

  it("rejects a recognised field with a bad value", () => {
    const bad = applyMarkdown(newProject("x"), "## Project\n- Wind speed: fast\n", { mode: "new" });
    expect(bad.ok).toBe(false);
    expect(bad.report.errors[0]).toMatch(/Wind speed: "fast" is not a number/);
  });
});

describe("units and sizes", () => {
  it("parses feet-inches, fractions and thousands", () => {
    expect(quantity(`14'-6"`)).toEqual({ v: 14.5, u: "ft" });
    expect(quantity("14 ft 6 in")?.v).toBeCloseTo(14.5);
    expect(quantity(`12' 6 1/2"`)?.v).toBeCloseTo(12 + 6.5 / 12);
    expect(quantity("11-7/8 in")).toEqual({ v: 11.875, u: "in" });
    expect(quantity("1,500 psf")).toEqual({ v: 1500, u: "psf" });
    expect(quantity(`16" o.c.`)).toEqual({ v: 16, u: '"' });
  });
  it("reads wood sizes", () => {
    expect(woodMaterial("(2) 2x12 DF No.2")).toEqual({
      kind: "sawn",
      species: "DF-L",
      grade: "No.2",
      size: "2x12",
      plies: 2,
    });
    expect(woodMaterial("5-1/8 x 13-1/2 24F-V4 glulam")).toEqual({
      kind: "glulam",
      combo: "24F-V4",
      b: 5.125,
      d: 13.5,
    });
    expect(woodMaterial("3-1/2 x 11-7/8 PSL")).toMatchObject({
      kind: "scl",
      product: "PSL 2.2E",
      plyWidth: 3.5,
      d: 11.875,
    });
  });
});

describe("starter sheet", () => {
  it("applies to a new project and every member designs", () => {
    const r = applyMarkdown(newProject("x"), STARTER_SHEET, { mode: "new" });
    expect(r.report.errors).toEqual([]);
    expect(r.report.ignored).toEqual([]);
    if (!r.ok) throw new Error("not applied");
    expect(r.project.members.map((m) => m.mark)).toEqual(["B-1", "H-1", "FJ-1", "R-1", "1W-1", "P-1", "F-1", "PF-1"]);
    const d = designProject(r.project);
    for (const o of d.outcomes.values()) expect(o.error).toBeUndefined();
  });
});
