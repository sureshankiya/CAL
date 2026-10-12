/** Shear-wall elevation: the whole wall line with its doors / windows and every segment. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPackage } from "@/components/report/ReportPackage";
import { buildPackage } from "@/components/report/package";
import { designProject, exampleProject } from "@/engine/project";

describe("shear wall elevation", () => {
  it("draws the wall line with its openings when the line has them", () => {
    const p = exampleProject();
    const l1 = p.lateral!.lines.find((l) => l.id === "LN1")!;
    l1.length = 40;
    l1.openings = [{ id: "o1", label: "D1", type: "door", x: 22.5, w: 3, h: 7, sill: 0 }];
    const d = designProject(p);
    const html = renderToStaticMarkup(
      createElement(ReportPackage, { project: p, design: d, entries: buildPackage(p, d) }),
    );
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/g, " ")
      .replace(/\s+/g, " ");
    expect(text).toMatch(/Geometry — wall line Line 1/);
    expect(text).toMatch(/Openings: D1 door 3′-0″ × 7′-0″/);
    // the FTAO segment on the same line keeps its own opening on both sheets
    expect((text.match(/\(FTAO\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
