/** Final issue: the printed package carries no design-aid disclaimer or VERIFY / review wording. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPackage } from "@/components/report/ReportPackage";
import { buildPackage } from "@/components/report/package";
import { scrubText } from "@/components/report/primitives";
import {
  applyMarkdown,
  convertDrawingData,
  newProject,
  deckExampleProject,
  designProject,
  eastLincolnTrussProject,
  exampleProject,
  sanMiguelProject,
  type Project,
} from "@/engine/project";

const text = (p: Project) => {
  const design = designProject(p);
  const html = renderToStaticMarkup(
    createElement(ReportPackage, { project: p, design, entries: buildPackage(p, design) }),
  );
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&[a-z#0-9]+;/g, " ");
};

const DRAWING_DATA = `# 9 Test Way - Full-house calculation data extraction

## 3. Design basis

| Parameter | Value |
|---|---|
| Basic wind speed | 95 mph |

## 4. Figured geometry

| Location | Dimension |
|---|---|
| Overall longitudinal dimension | 50 ft |
| Overall width | 30 ft |

## 6. Wood materials

| Material | Data | Source |
|---|---|---|
| Bar mats | ASTM A184; source cites A515 or A706 for bars - verify reference | S-0 |

## 7. Beams

| Mark | Size | Material | Support/notes | Source |
|---|---|---|---|---|
| B101 | (2) 2x12 DF No.2 | Built-up wood | Flush, bearing walls | S-3.1 |
| B102 | (2) 1-3/4 x 11-7/8 in LVL | 2.0E | Flush; notes cell blank | S-4.1 |

New wood posts: nominal 6x6. Simpson HDU4 hold-downs; MST27 straps.
`;
const fromDrawings = () => {
  const a = applyMarkdown(newProject(), convertDrawingData(DRAWING_DATA).sheet, { mode: "new" });
  if (!a.ok) throw new Error(a.report.errors.join("; "));
  return a.project;
};

const PROJECTS = { exampleProject, sanMiguelProject, eastLincolnTrussProject, deckExampleProject, fromDrawings };
const BANNED = (l: string) =>
  /VERIFY|[—–,]\s*verify\b/.test(l) ||
  /valid only when|items to verify|requiring verification|before the package is issued|template values|not valid until|design aid|not for issue|#c00000/i.test(
    l,
  ) ||
  /from the drawings|default|assumed|assumption|\(entered|entered directly|to be confirmed|required input|not yet entered|enter width|unconfirmed|notes cell blank|not stated/i.test(
    l,
  );

describe("final issue", () => {
  for (const [name, make] of Object.entries(PROJECTS)) {
    it(`${name}: no VERIFY / review wording when issued as final`, () => {
      const p = make();
      const lines = text(p).split("\n").filter(BANNED);
      expect(lines).toEqual([]);
    });
    it(`${name}: the check copy still flags VERIFY items`, () => {
      const p = make();
      p.info.issue = "check";
      expect(text(p)).toMatch(/VERIFY/);
    });
  }
  it("scrubText removes the VERIFY wording and keeps the rest", () => {
    expect(scrubText("Typical value — VERIFY with product")).toBe("Typical value");
    expect(scrubText("(override — VERIFY)")).toBe("(override)");
    expect(scrubText("design values per manufacturer ESR — VERIFY")).toBe("design values per manufacturer ESR");
    expect(scrubText("NDS Supplement (2024) — corroborated; VERIFY")).toBe("NDS Supplement (2024)");
    expect(scrubText("entered plate value (manufacturer ESR, VERIFY)")).toBe("entered plate value (manufacturer ESR)");
    expect(scrubText(" — VERIFY")).toBe("");
    expect(scrubText("Field verify size")).toBe("Field verify size");
    expect(scrubText("Presumptive, CBC Table 1806.2, Class 5 — verify with geotechnical report")).toBe(
      "Presumptive, CBC Table 1806.2, Class 5",
    );
    expect(scrubText("Site Class D (default) — S_D1 assumed, verify; SDC D")).toBe("Site Class D; SDC D");
    expect(scrubText("From the drawings: B101: (3) 1-3/4 x 11-7/8 in LVL — Flush, posts")).toBe(
      "B101: (3) 1-3/4 x 11-7/8 in LVL — Flush, posts",
    );
    expect(scrubText("Tributary floor / roof (enter width) — dead, Dead load (entered, per ft² of plan area)")).toBe(
      "Tributary floor / roof — dead, Dead load (per ft² of plan area)",
    );
    expect(scrubText("span; tributary width — assumed values used")).toBe("span; tributary width");
    expect(scrubText("Special inspections (IBC Ch. 17) — to be confirmed by the Engineer of Record")).toBe(
      "Special inspections (IBC Ch. 17)",
    );
    expect(scrubText("Rafter ties assumed at the top-plate level (heel)")).toBe(
      "Rafter ties at the top-plate level (heel)",
    );
    expect(scrubText("= 2,500 psi, cracked — assumed, field verify")).toBe("= 2,500 psi, cracked — field verify");
    expect(scrubText("Class 5 value (1,500 psf) is used. REQUIRED INPUT / VERIFY.")).toBe(
      "Class 5 value (1,500 psf) is used.",
    );
  });
});
