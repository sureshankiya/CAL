/**
 * Drawing-data documents → input sheet (convertDrawingData): recognition, values read from
 * the criteria / schedule tables, conflicts and missing inputs reported, REQUIRED INPUT
 * carried as pendingInputs (VERIFY on the sheet).
 */

import { describe, expect, it } from "vitest";
import { applyMarkdown, convertDrawingData, designProject, looksLikeDrawingData, newProject } from "@/engine/project";

const DOC = `# 12 Test Court - Full-house calculation data extraction

## 1. Source and scope

- Printed project: 12 Test Court, San Diego, CA 92101.
- Printed issue date: 3/4/2026. Filename revision: RV01.

## 3. Design basis and loads as printed

- 2022 CBC; ASCE 7-16.

| Input | Printed value | Source/qualification |
|---|---|---|
| Roof live | 20 psf | S-0 |
| Roof dead | 15 psf | S-0 |
| Floor live | 10 psf [LIVING] | VERIFY |
| Floor dead | 12 psf | S-0 |

| Parameter | Value |
|---|---|
| Seismic design category / site class | D / D |
| Occupancy category | II |
| SDS / SD1 | 1.00 / 0.60 |

| Parameter | Value |
|---|---|
| Basic wind speed | 95 mph |
| Exposure | B |

| Item | Stated requirement |
|---|---|
| General concrete f'c | 3000 psi; CONFLICT with 2500 psi plan notes |
| Rebar | Grade 60 ASTM A615 |

## 5. Foundations

| Mark | Size/description | Reinforcement | Source/status |
|---|---|---|---|
| F1 | 24 x 24 x 12 in | (3) #4 continuous top and bottom | S-1 |
| F2 | 15 x 18 in strip-footing cross-section | (2) #4 continuous top/bottom | S-1 |

## 7. Beams

| Mark | Size | Material | Support/notes | Source |
|---|---|---|---|---|
| B101 | (3) 1-3/4 x 11-7/8 in LVL | 2.0E | Flush, posts | S-2.1 |
| B201 | (2) 2x12 DF No.2 | Built-up wood | Flush, bearing walls | S-3.1 |

| Area | Callouts |
|---|---|
| Second floor | New 2x10 floor joists 16 in OC; 2x10 blocking |
| House roof | New 2x12 roof joists 24 in OC upper zone |

## 8. Walls

| Marks | Framing | Use |
|---|---|---|
| First 1BW1 | 2x6 No.2 at 16 in | Exterior bearing |
| First 1SW1/1SW2 | 2x6 No.2 at 16 in, 7/16 in OSB | Shear types 1-2 |
| NBW typical | 2x4 at 16 in | Nonbearing interior |

New wood posts: nominal 6x6. New/existing steel: HSS 6x6x1/4 in.

| Item | Value |
|---|---|
| Roof live / total deflection | L/360 / L/240 |
| Floor live / total deflection | L/480 / L/360 |

## 9. Openings

| Area | Opening | Labels | Sheet |
|---|---|---|---|
| First | 9 ft x 6 ft | 3 windows | S-3 |
| Second | 4 ft x 2 ft | 2 windows | S-4 |
| Master | Existing windows | 2 labels | S-2 |

| Clear opening | Header | Remark |
|---|---|---|
| To 4 ft | 4x4 or 4x6 | - |
| 8 ft 1 in to 10 ft | 4x10 or 6x8 | Double trimmers |
`;

describe("drawing-data documents", () => {
  it("is recognised and not treated as a broken input sheet", () => {
    expect(looksLikeDrawingData(DOC)).toBe(true);
    const r = applyMarkdown(newProject(), DOC);
    expect(r.ok).toBe(false);
    expect(r.report.drawingData).toBe(true);
    expect(r.report.errors).toHaveLength(1);
  });

  it("converts the tables into a valid project with every member flagged for its missing inputs", () => {
    const c = convertDrawingData(DOC);
    const r = applyMarkdown(newProject(), c.sheet, { mode: "new" });
    expect(r.report.errors).toEqual([]);
    if (!r.ok) return;
    const p = r.project;
    expect(p.info.name).toBe("12 Test Court");
    expect(p.info.address).toBe("12 Test Court, San Diego, CA 92101");
    expect(p.info.date).toBe("2026-03-04");
    expect(p.info.revision).toBe("RV01");
    expect(p.cycleId).toBe("2022");
    expect(p.criteria.seismic).toMatchObject({ SDC: "D", siteClass: "D", SDS: 1, SD1: 0.6 });
    expect(p.criteria.wind).toMatchObject({ V: 95, exposure: "B" });
    expect(p.criteria.concrete.fc).toBe(2500); // lowest printed value
    expect(c.notes.some((n) => n.includes("3000 / 2500"))).toBe(true);
    expect(c.notes.some((n) => n.startsWith("Floor live printed 10 psf"))).toBe(true);
    expect(c.notes.some((n) => n.startsWith("Shear walls 1SW1"))).toBe(true);

    const marks = p.members.map((m) => m.mark);
    expect(marks).toEqual(["B101", "B201", "1BW1", "F1", "F2", "P-1", "SC-1", "FJ-1", "RJ-1", "H-1", "H-2"]);
    const b101 = p.members.find((m) => m.mark === "B101")!;
    expect(b101.kind === "beam" && b101.material).toEqual({
      kind: "scl",
      product: "LVL 2.0E",
      plies: 3,
      plyWidth: 1.75,
      d: 11.875,
    });
    const b201 = p.members.find((m) => m.mark === "B201")!;
    expect(b201.kind === "beam" && b201.material).toMatchObject({
      kind: "sawn",
      size: "2x12",
      plies: 2,
      grade: "No.2",
    });
    const f1 = p.members.find((m) => m.mark === "F1")!;
    expect(f1.kind === "footing" && [f1.type, f1.B, f1.L, f1.h]).toEqual(["pad", 2, 2, 12]);
    const f2 = p.members.find((m) => m.mark === "F2")!;
    expect(f2.kind === "footing" && [f2.type, f2.B, f2.h]).toEqual(["strip", 1.25, 18]);
    const fj = p.members.find((m) => m.mark === "FJ-1")!;
    expect(fj.kind === "joist" && [fj.size, fj.spacing, fj.levelId, fj.dead.psf]).toEqual(["2x10", 16, "L2", 12]);
    for (const m of p.members) expect(m.pendingInputs?.length).toBeGreaterThan(0);

    // every member prints VERIFY for its missing inputs
    const d = designProject(p);
    for (const [, o] of d.outcomes) {
      expect(o.error).toBeUndefined();
      expect(o.result!.assumptions.some((a) => a.verify && a.item === "Inputs not yet entered")).toBe(true);
    }
  });

  it("reads deflection criteria and sizes headers from the openings and the typical header schedule", () => {
    const c = convertDrawingData(DOC);
    const r = applyMarkdown(newProject(), c.sheet, { mode: "new" });
    expect(r.report.errors).toEqual([]);
    if (!r.ok) return;
    const fj = r.project.members.find((m) => m.mark === "FJ-1")!;
    expect(fj.kind === "joist" && fj.deflection).toEqual({ preset: "custom", live: 480, total: 360 });
    const h = r.project.members.filter((m) => m.kind === "beam" && m.role === "header");
    expect(
      h.map(
        (m) => m.kind === "beam" && [m.mark, m.material.kind === "sawn" && m.material.size, m.spans[0], m.bearing[0]],
      ),
    ).toEqual([
      ["H-1", "4x10", 9.25, 3],
      ["H-2", "4x4", 4.125, 1.5],
    ]);
    expect(c.notes.some((n) => /Openings without a size .*Master Existing windows/.test(n))).toBe(true);
  });

  it("puts the drawing specifications, slab, cover, carport load path and open items into the project", () => {
    const extra = `${DOC}
### 5.2 Foundation notes - S-1

Undisturbed soil; minimum 12 in embedment U.N.O.; minimum 3 in cover against earth. No allowable soil bearing pressure or geotechnical parameters supplied.

### 5.6 Slab/base and generic footing details - S-8

- Slab: 1 in deep saw cuts, 1/4 in maximum width, maximum 15 ft interior joint spacing; 4 in aggregate.
- Both generic details: 3-1/2 in slab with #3 at 18 in each way or \`6x6/6x6 WWM\`; 10 mil Visqueen.

### 7.4 Carport

| Mark | Size | Material | Support/notes | Source |
|---|---|---|---|---|
| Carport unmarked | (2) 1-3/4 x 11-7/8 in LVL | Not separately stated | Flush, 6x6 posts/cantilever | S-7.2 |

| Feature | Dimension |
|---|---|
| Carport post/support dimension | 16 ft 9 in; verify exact support axes |

| Mark | Size/description | Reinforcement | Source/status |
|---|---|---|---|
| F1 carport | 24 x 24 x 12 in | (3) #4 each way | Four pads S-7 |

- Carport: four new 6x6 posts S-7.1 and four F1 pads S-7.
- Carport S-7.3: 9 ft clear-height annotation.

## 12. Conflicts and missing inputs

| ID | Unresolved issue | Source evidence / needed action for calculations |
|---|---|---|
| C01 | Concrete strength | 4500 vs 2500 psi; establish per element |
`;
    const c = convertDrawingData(extra);
    const r = applyMarkdown(newProject(), c.sheet, { mode: "new" });
    expect(r.report.errors).toEqual([]);
    if (!r.ok) return;
    const p = r.project;
    expect(p.slab).toMatchObject({
      thickness: 3.5,
      vaporRetarder: "10 mil",
      reinforcement: "#3 @ 18 in. o.c. each way or 6x6/6x6 WWM",
    });
    expect(p.criteria.concrete.cover).toBe(3);
    expect(p.criteria.soil.source).toMatch(/Presumptive/);
    expect(p.notes).toMatch(/Foundation notes:\n- Undisturbed soil/);
    expect(p.notes).not.toMatch(/open items/i);
    expect(p.importLog).toEqual(
      expect.arrayContaining(["C01 — Concrete strength: 4500 vs 2500 psi; establish per element"]),
    );
    const cp = p.members.find((m) => m.mark === "CPB1")!;
    expect(cp.kind === "beam" && cp.spans).toEqual([16.75]);
    const p2 = p.members.find((m) => m.mark === "P-2")!;
    expect(p2.kind === "post" && p2.height).toBe(9);
    expect(p2.links.map((l) => l.label)).toEqual(["CPB1 B"]);
    expect(p.members.find((m) => m.mark === "F1-CP")!.links.map((l) => l.label)).toEqual(["P-2 Base"]);
    const d = designProject(p);
    expect(d.outcomes.get(p2.id)?.error).toBeUndefined();
  });
});
