/** Drawing PDF text layer → drawing-data document → input sheet → designed members (no AI). */
import { describe, expect, it } from "vitest";
import {
  applyMarkdown,
  convertDrawingData,
  designProject,
  newProject,
  type BeamSpec,
  type FootingSpec,
} from "@/engine/project";
import { normaliseDrawingText, readDrawingText } from "@/engine/project/drawingText";

const PAGES = [
  {
    page: 1,
    text: `GENERAL NOTES
STRUCTURAL CRITERIA
2022 CBC
ROOF LIVE LOAD = 20 PSF
ROOF DEAD LOAD = 15 PSF
FLOOR LIVE LOAD = 40 PSF
FLOOR DEAD LOAD = 12 PSF
RISK CATEGORY: II
SITE CLASS D
SEISMIC DESIGN CATEGORY D
SDS = 1.10 SD1 = 0.62
BASIC WIND SPEED (ULTIMATE) 95 MPH EXPOSURE C
ALLOWABLE SOIL BEARING PRESSURE 1500 PSF
F'c= 2500 PSI AT 28 DAYS
REINFORCEMENT ASTM A615 GRADE 60
DATE ISSUED
3/4/2026
S-0`,
  },
  {
    page: 2,
    text: `PROPOSED FIRST FLOOR FOUNDATION PLAN
NEW 6X6 POST
F1 24"X24"X18"
FOUNDATION SCHEDULE
TYPE MARK SIZE REINFORCEMENT
F1 24"X24"X12" (3) #4 CONT. TOP & BOTTOM
F3 15"X18" (2) #4 CONT. TOP & BOTTOM
NEW HSS 6X6X1" POST
S-1`,
  },
  {
    page: 3,
    text: `PROPOSED FIRST FLOOR FRAMING PLAN
BEAM SCHEDULE:- FIRST FLOOR
MARK MEMBER SIZE MATERIAL SUPPORT NOTES
(3) 1¾" x 11⅞" FLUSH
B101 LVL 2.0E LVL BEAM SUPPORTED BY POSTS
W
B
B201 (2) 2x12 DF #2 BEAM BEARING WALLS
2x10 FLOOR JOISTS @ 16" O.C. U.N.O.
(N)6'0''X4'0''
WINDOW
(N)6'0''X4'0''
WINDOW
FIRST FLOOR WALL SCHEDULE
MARK DESCRIPTION FRAMING
1BW1 Exterior Bearing Wall 2x6 DF-L No.2 @ 16" O.C.
1BW2 Interior Bearing Wall 2x4 DF-L No.2 @ 16" O.C.
S-3.1`,
  },
  { page: 4, text: "S-8" },
];

describe("drawing text reader", () => {
  const r = readDrawingText("12 Test Court DWG.pdf", PAGES);

  it("normalises CAD text (unicode fractions, double primes)", () => {
    expect(normaliseDrawingText(`(3) 1¾" x 11⅞"`)).toBe(`(3) 1-3/4" x 11-7/8"`);
    expect(normaliseDrawingText(`(N)6'0''X4'0''`)).toBe(`(N)6'0"X4'0"`);
    expect(normaliseDrawingText(`1¾" x 11 7/8"`)).toBe(`1-3/4" x 11-7/8"`);
  });

  it("reads criteria, schedules, callouts, posts and openings from the text layer", () => {
    expect(r.found).toEqual(
      expect.arrayContaining([
        "Roof live: 20 psf",
        "Basic wind speed: 95 mph",
        "Allowable soil bearing: 1500 psf",
        "Beams: B101, B201",
        "Walls: 1BW1, 1BW2",
        "Footings: F1, F3",
      ]),
    );
    expect(r.document).toMatch(/\| B101 \| \(3\) 1-3\/4 x 11-7\/8 in LVL \| LVL 2\.0E \| Flush, posts \|/);
    expect(r.document).toMatch(/\| F1 \| 24 x 24 x 12 in \| \(3\) #4 continuous top and bottom \|/); // schedule row, not the plan label
    expect(r.document).toMatch(/\| First floor \| 6 ft x 4 ft window \| 2 labels \|/);
  });

  it("reports what the text layer cannot give instead of completing it", () => {
    expect(r.issues.some((x) => /HSS post size reads "HSS 6X6X1"/.test(x))).toBe(true);
    expect(r.issues.some((x) => /F1: 24 x 24 x 18 in \/ 24 x 24 x 12 in/.test(x))).toBe(true);
    expect(r.emptyPages).toEqual([4]);
  });

  it("converts to an input sheet whose members design, with the open items in the import log", () => {
    const c = convertDrawingData(r.document);
    const a = applyMarkdown(newProject(), c.sheet, { mode: "new" });
    expect(a.report.errors).toEqual([]);
    if (!a.ok) throw new Error("not applied");
    const p = a.project;
    expect(p.criteria.wind).toMatchObject({ V: 95, exposure: "C" });
    expect(p.criteria.seismic).toMatchObject({ SDS: 1.1, SD1: 0.62, siteClass: "D", SDC: "D" });
    expect(p.criteria.soil.bearing).toBe(1500);
    const b101 = p.members.find((m) => m.mark === "B101") as BeamSpec;
    expect(b101.material).toMatchObject({ kind: "scl", plies: 3, d: 11.875 });
    const b201 = p.members.find((m) => m.mark === "B201") as BeamSpec;
    expect(b201.material).toMatchObject({ kind: "sawn", size: "2x12", plies: 2, grade: "No.2" });
    const f1 = p.members.find((m) => m.mark === "F1") as FootingSpec;
    expect(f1).toMatchObject({ type: "pad", B: 2, h: 12 });
    // load path: B101 (posts) → P-1 → F1 (pads at the new posts are not named here, so P-1 only)
    expect(p.members.find((m) => m.mark === "P-1")?.links.map((l) => l.label)).toEqual(["B101 B"]);
    expect(p.importLog?.some((x) => /^T0\d — HSS post size/.test(x))).toBe(true);
    const d = designProject(p);
    for (const o of d.outcomes.values()) expect(o.error).toBeUndefined();
  });
});

describe("load-path links in a sheet", () => {
  it('"Load from: B-1 B" links reactions by mark, point loads on posts and pads', () => {
    const sheet = `## Project
- Project name: Link test

## B-1 (beam)
- Size: 4x12 DF-L No.1
- Span: 12 ft
- Trib: 6 ft
- Dead load: 15 psf
- Live load: 40 psf

## P-1 (post)
- Size: 6x6 DF-L No.1
- Height: 8 ft
- Load from: B-1 B

## PF-1 (pad footing)
- Size: 24 x 24 x 12 in
- Load from: P-1
`;
    const a = applyMarkdown(newProject("x"), sheet, { mode: "new" });
    expect(a.report.errors).toEqual([]);
    if (!a.ok) throw new Error("not applied");
    const p = a.project;
    const b1 = p.members.find((m) => m.mark === "B-1")!;
    const p1 = p.members.find((m) => m.mark === "P-1")!;
    expect(p1.links).toEqual([
      expect.objectContaining({ kind: "point", sourceId: b1.id, support: 1, label: "B-1 B", x: 0 }),
    ]);
    const d = designProject(p);
    const post = d.outcomes.get(p1.id)!.result!;
    const beam = d.outcomes.get(b1.id)!.result!;
    expect(post.reactions[0].maxDown).toBeGreaterThanOrEqual(beam.reactions[1].maxDown);
    const bad = applyMarkdown(newProject("x"), sheet.replace("B-1 B", "B-9 B"), { mode: "new" });
    expect(bad.report.errors[0]).toMatch(/"B-9" is not a member mark/);
  });
});
