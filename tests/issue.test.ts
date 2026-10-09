/** Final issue: the printed package carries no design-aid disclaimer or VERIFY / review wording. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPackage } from "@/components/report/ReportPackage";
import { buildPackage } from "@/components/report/package";
import { scrubText } from "@/components/report/primitives";
import {
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

const PROJECTS = { exampleProject, sanMiguelProject, eastLincolnTrussProject, deckExampleProject };
const BANNED = (l: string) =>
  /VERIFY|[—–,]\s*verify\b/.test(l) ||
  /valid only when|items to verify|requiring verification|before the package is issued|template values|not valid until|design aid|not for issue|#c00000/i.test(
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
    expect(scrubText("Site Class D (default) — S_D1 assumed, verify; SDC D")).toBe(
      "Site Class D (default) — S_D1 assumed; SDC D",
    );
    expect(scrubText("Class 5 value (1,500 psf) is used. REQUIRED INPUT / VERIFY.")).toBe(
      "Class 5 value (1,500 psf) is used.",
    );
  });
});
