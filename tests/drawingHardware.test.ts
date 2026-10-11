/** Hardware and building geometry from the drawings → project hardware list and lateral geometry. */
import { describe, expect, it } from "vitest";
import { applyMarkdown, convertDrawingData, exampleProject, newProject } from "@/engine/project";
import { buildingGeometry, feetOf } from "@/engine/project/drawingData";
import { findHardware, hardwareFromDrawings } from "@/engine/project/drawingHardware";
import { readDrawingText, VERTICAL_TEXT } from "@/engine/project/drawingText";

describe("hardware called out on the drawings", () => {
  const TEXT = `### PDF page 16 - S-8
HPAHD22-2P TWO POUR HOLDOWN; HPAHD22 ONE POUR AT 4X6 CORNER POST
SIMPSON CBSQ POST BASE DRYPACKED
### PDF page 18 - S-8.3
(2) LSTA24 EACH SIDE; MST27 STRAP; HUC412 OR TRUSS MANUFACTURER; CC66 CAP
2X8 BLOCKS W/ (2) A35/BLK
SIMPSON H1 AT EACH ROOF TRUSS END
ASTM A307 BOLTS, A615 GRADE 60, ICC-ES ESR-2508
H1 HEADER 4X6`;

  it("finds the sized models with their sheets, ignores ASTM designations and marks without connector context", () => {
    const hw = findHardware(TEXT);
    expect(hw.models.map((h) => h.model).sort()).toEqual(
      ["A35", "CC66", "H1", "HPAHD22", "HPAHD22-2P", "HUC412", "LSTA24", "MST27"].sort(),
    );
    expect(hw.models.find((h) => h.model === "HPAHD22-2P")).toMatchObject({ kind: "holdown", sheets: ["S-8"] });
    expect(hw.models.find((h) => h.model === "LSTA24")).toMatchObject({ kind: "strap", sheets: ["S-8.3"] });
    // "CBSQ" has no size → reported, not added
    expect(hw.bare.map((b) => b.family)).toEqual(["CBSQ"]);
  });

  it("uses catalogue values where HouseCalc has the model and blank capacities otherwise", () => {
    const items = hardwareFromDrawings(findHardware(TEXT).models);
    const h1 = items.find((h) => h.model === "H1")!;
    expect(h1.source).toMatch(/on the drawings \(S-8\.3\)/);
    const mst = items.find((h) => h.model === "MST27")!;
    expect(mst).toMatchObject({ kind: "strap", checked: false, report: "" });
    expect(mst.tension).toBeUndefined();
    const hdu = hardwareFromDrawings([{ model: "HDU4", kind: "holdown", what: "hold-down", sheets: ["S-2"] }])[0];
    expect(hdu).toMatchObject({ model: "HDU4-SDS2.5", tension: 4565 });
  });
});

describe("building geometry from the drawings", () => {
  it("reads feet-inches", () => {
    expect(feetOf("66 ft 6 in")).toBe(66.5);
    expect(feetOf(`34'-4"`)).toBe(34.33);
    expect(feetOf("24 ft")).toBe(24);
  });

  it("takes the bounding rectangle of the overall figured dimensions, not carport / deck / segment rows", () => {
    const g = buildingGeometry("12 ft 7 in upper-story annotation\nROOF PITCH 5:12", [
      {
        heading: "4.4 Roof",
        header: ["Feature", "Dimension"],
        rows: [
          ["Carport width / depth", "124 ft / 20 ft"],
          ["House roof right longitudinal dimension", "66 ft 6 in"],
          ["Right exterior overall segment", "71 ft 9 in"],
          ["Cross-plan width below upper enclosed area", "34 ft 4 in"],
          ["Bottom deck right-side depth", "40 ft"],
        ],
      },
    ]);
    expect(g).toMatchObject({ Lx: 66.5, Ly: 34.33, ridge: "X", pitch: 5, upperStory: 12.58 });
    expect(g.roofRise).toBeCloseTo((5 / 12) * (34.33 / 2), 2);
  });

  it("PDF text: longest horizontal plan dimension → L_x, longest rotated one → L_y; pitch; hardware table", () => {
    const r = readDrawingText("x.pdf", [
      {
        page: 1,
        text: `PROPOSED FIRST FLOOR FRAMING PLAN\n12'-6" 41'-3"\nROOF PITCH 4:12\nSIMPSON LUS210 HANGERS\nSCALE 1/4"=1'-0"\nS-3.1\n${VERTICAL_TEXT}\n28'-0"\n9'-0"`,
      },
      { page: 2, text: `PROPOSED CARPORT FRAMING PLAN\n96'-0"\nS-7.2` },
    ]);
    expect(r.found).toEqual(expect.arrayContaining(["Building: 41 ft 3 in × 28 ft 0 in (overall plan dimensions)", "Roof pitch: 4:12", "Hardware: LUS210"]));
    const c = convertDrawingData(r.document);
    expect(c.sheet).toMatch(/- lateral\.Lx: 41\.25/);
    expect(c.sheet).toMatch(/- lateral\.Ly: 28/);
    expect(c.sheet).toMatch(/- lateral\.pitch: 4/);
  });
});

describe("applying the converted sheet", () => {
  const DOC = `# 9 Test Way - Full-house calculation data extraction

## 3. Design basis

| Parameter | Value |
|---|---|
| Basic wind speed | 95 mph |

## 4. Figured geometry

| Location | Dimension |
|---|---|
| Overall longitudinal dimension | 50 ft |
| Overall width | 30 ft |

## 7. Beams

| Mark | Size | Material | Support/notes | Source |
|---|---|---|---|---|
| B101 | (2) 2x12 DF No.2 | Built-up wood | Flush, bearing walls | S-3.1 |

Simpson HDU4 hold-downs at shear wall ends; MST27 straps.
`;

  it("replaces the hardware list with the drawing models and regenerates the story weights from L_x × L_y", () => {
    const c = convertDrawingData(DOC);
    const a = applyMarkdown(newProject(), c.sheet, { mode: "new" });
    expect(a.report.errors).toEqual([]);
    if (!a.ok) throw new Error("not applied");
    expect(a.project.hardware.map((h) => h.model)).toEqual(["HDU4-SDS2.5", "MST27"]);
    const lat = a.project.lateral!;
    expect([lat.Lx, lat.Ly, lat.ridge, lat.roofRise]).toEqual([50, 30, "X", 5]);
    expect(lat.stories.map((s) => s.name)).toEqual(["First story", "Second story"]);
    const top = lat.stories[1].items.find((i) => /^Roof/.test(i.label))!;
    expect(top.qty).toBe(1500);
    expect(a.project.importLog?.some((x) => /story height not figured|first-story height/.test(x))).toBe(true);
  });

  it("keeps hardware that members of the current project still use", () => {
    const cur = exampleProject();
    const used = cur.members.flatMap((m) => ("hardwareId" in m && m.hardwareId ? [m.hardwareId] : []));
    const a = applyMarkdown(cur, convertDrawingData(DOC).sheet, { mode: "fill" });
    if (!a.ok) throw new Error(a.report.errors.join("; "));
    for (const id of used) expect(a.project.hardware.some((h) => h.id === id)).toBe(true);
    expect(a.project.hardware.some((h) => h.model === "MST27")).toBe(true);
  });
});
