/**
 * Markdown input sheet (Fill from .md / Export .md): round trip of every example project,
 * new members from the template, text / number coercion, missing required fields.
 */

import { describe, expect, it } from "vitest";
import {
  applyMarkdown,
  projectSchema,
  deckExampleProject,
  eastLincolnTrussProject,
  exampleProject,
  newProject,
  projectToMarkdown,
  sanMiguelProject,
  type Project,
} from "@/engine/project";

const strip = (p: Project) => {
  const { software: _s, ...rest } = p;
  return JSON.parse(JSON.stringify(rest));
};

describe("Markdown input sheet", () => {
  for (const [name, make] of [
    ["example house", exampleProject],
    ["San Miguel", sanMiguelProject],
    ["East Lincoln truss", eastLincolnTrussProject],
    ["deck + RW", deckExampleProject],
  ] as const) {
    it(`round trip reproduces every field — ${name}`, () => {
      const p = make();
      const md = projectToMarkdown(p);
      // new project from the sheet: everything must come from the .md
      const r = applyMarkdown(newProject("blank"), md, { mode: "new" });
      expect(r.report.errors).toEqual([]);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.report.ignored).toEqual([]);
      const got = strip(r.project);
      const want = strip(projectSchema.parse(p));
      // members: same order, marks and every field (ids kept from the sheet)
      expect(got).toEqual(want);
    });
  }

  it("fill mode on the same project changes nothing", () => {
    const p = projectSchema.parse(sanMiguelProject());
    const r = applyMarkdown(p, projectToMarkdown(p));
    if (!r.ok) throw new Error(r.report.errors.join("; "));
    expect(strip(r.project)).toEqual(strip(p));
    expect(r.report.added).toEqual([]);
  });

  it("updates an existing member by mark and adds a new one from the template", () => {
    const p = exampleProject();
    const first = p.members[0];
    const md = [
      "## Project",
      "- info.name: 12 Oak Lane",
      "- info.jobRef: 1234",
      "- criteria.wind.V: 110",
      "",
      `## Member ${first.mark} (${first.kind})`,
      "- description: Revised by sheet",
      "",
      "## Member B-99 (beam)",
      "- description: New garage header",
      "- spans: [16]",
    ].join("\n");
    const r = applyMarkdown(p, md);
    expect(r.report.errors).toEqual([]);
    if (!r.ok) throw new Error("not ok");
    expect(r.project.info.name).toBe("12 Oak Lane");
    expect(r.project.info.jobRef).toBe("1234"); // text field keeps text
    expect(r.project.criteria.wind.V).toBe(110);
    expect(r.project.members[0].description).toBe("Revised by sheet");
    const b = r.project.members.find((m) => m.mark === "B-99")!;
    expect(b.kind).toBe("beam");
    expect(b.description).toBe("New garage header");
    expect(r.report.added).toEqual(["B-99"]);
    expect(r.report.updated).toEqual([first.mark]);
    expect(r.report.defaulted.find((d) => d.mark === "B-99")!.fields.length).toBeGreaterThan(0);
  });

  it("table rows are read like bullet lines; unknown keys are reported, not applied", () => {
    const r = applyMarkdown(
      exampleProject(),
      ["## Project", "| Field | Value |", "|---|---|", "| info.client | A. Owner |", "| info.colour | red |"].join(
        "\n",
      ),
    );
    if (!r.ok) throw new Error(r.report.errors.join("; "));
    expect(r.project.info.client).toBe("A. Owner");
    expect(r.report.ignored).toEqual(["info.colour"]);
  });

  it("invalid or missing required values block the fill and are named", () => {
    const r = applyMarkdown(
      exampleProject(),
      ["## Project", "- criteria.wind.exposure: Q", "- assemblies.9.name: x"].join("\n"),
    );
    expect(r.ok).toBe(false);
    expect(r.report.errors.some((e) => e.startsWith("criteria.wind.exposure"))).toBe(true);
    expect(r.report.errors.some((e) => e.includes("assemblies.9") && e.includes("required"))).toBe(true);
  });

  it("unknown member kind and empty sheets are rejected", () => {
    expect(applyMarkdown(exampleProject(), "## Member X-1 (spaceframe)\n- spans: [1]").report.errors[0]).toMatch(
      /not known/,
    );
    expect(applyMarkdown(exampleProject(), "hello").ok).toBe(false);
  });
});
