import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPackage } from "../src/components/report/ReportPackage";
import { buildPackage } from "../src/components/report/package";
import { buildTruss } from "../src/engine/analysis/trussGeometry";
import { steelShape } from "../src/engine/data/steel";
import { customLayoutError } from "../src/engine/members/woodTruss";
import {
  buildSteelTruss,
  designSteelTruss,
  STEEL_TRUSS_PATTERNS,
  type SteelTrussInput,
} from "../src/engine/members/steelTruss";
import {
  applyMarkdown,
  contextOf,
  designProject,
  exampleProject,
  newMemberSpec,
  newProject,
  projectSchema,
  projectToMarkdown,
} from "../src/engine/project";

const ctx = () => ({ ...contextOf(exampleProject()), SDS: 1 });

const base = (x: Partial<SteelTrussInput> = {}): SteelTrussInput => ({
  id: "s",
  mark: "STR-1",
  description: "",
  pattern: "pratt",
  span: 60,
  rise: 8,
  chordDepth: 4,
  overhang: 0,
  panels: 8,
  spacing: 6,
  method: "ASD",
  sections: {
    TC: { shape: "HSS8x4x3/8", grade: "A500C" },
    BC: { shape: "HSS4x4x1/4", grade: "A500C" },
    EV: { shape: "HSS4x4x1/4", grade: "A500C" },
    V: { shape: "HSS3x3x3/16", grade: "A500C" },
    D: { shape: "HSS3x3x3/16", grade: "A500C" },
  },
  topBracing: 0,
  bottomBracing: 0,
  roofDead: { psf: 20, basis: "horizontal" },
  ceilingDead: { psf: 0 },
  roofLive: false,
  snow: false,
  windDown: 0,
  windUplift: 0,
  selfWeight: false,
  netArea: 1,
  U: 1,
  deflection: { preset: "custom", live: 240, total: 180 },
  ...x,
});

describe("STR steel truss", () => {
  it("every roof pattern builds a stable truss", () => {
    for (const pattern of Object.keys(STEEL_TRUSS_PATTERNS) as SteelTrussInput["pattern"][]) {
      const r = designSteelTruss(ctx(), base({ pattern }));
      expect(r.rows.length).toBeGreaterThan(0);
      const total = 20 * 6 * 60;
      expect(r.reactions[0].byType.D + r.reactions[1].byType.D).toBeCloseTo(total, 3);
    }
  });

  it("D only, Pratt: bottom chord under the apex = M(L/2) / rise (method of sections)", () => {
    const r = designSteelTruss(ctx(), base());
    const w = 20 * 6; // plf
    const M = (w * 60 * 60) / 8; // lb-ft
    const g = r.geometry;
    const apex = g.nodes[g.apex];
    const mid = g.members.findIndex(
      (m) => m.group === "BC" && Math.abs(Math.max(g.nodes[m.a].x, g.nodes[m.b].x) - apex.x) < 1e-9,
    );
    expect(r.rows[mid].byType.D).toBeCloseTo(M / 8, 0);
    expect(r.reactions[0].byType.D).toBeCloseTo(w * 30, 3);
  });

  it("compression by AISC E3 with the out-of-plane bracing length; tension rupture on A_e", () => {
    const r = designSteelTruss(ctx(), base({ topBracing: 15, netArea: 0.85, U: 0.9, method: "LRFD" }));
    const tc = r.rows.find((x) => x.group === "TC" && x.mode === "compression")!;
    const s = steelShape("HSS8x4x3/8");
    const Lcy = 15 * 12;
    const SR = Math.max((tc.length * 12) / s.rx, Lcy / s.ry);
    const Fe = (Math.PI ** 2 * 29000) / SR ** 2;
    const Fcr = 50 / Fe <= 2.25 ? 0.658 ** (50 / Fe) * 50 : 0.877 * Fe;
    expect(tc.Pc).toBeCloseTo(0.9 * Fcr * s.A, 6);
    const bc = r.rows.find((x) => x.group === "BC" && x.mode === "tension")!;
    const A = steelShape("HSS4x4x1/4").A;
    expect(bc.Pt).toBeCloseTo(Math.min(0.9 * 50 * A, 0.75 * 62 * 0.9 * 0.85 * A), 6);
    expect(bc.tLimit).toContain("rupture");
  });

  it("wind uplift reverses the bottom chord and both W directions are combined", () => {
    const r = designSteelTruss(ctx(), base({ windDown: 10, windUplift: 40 }));
    expect(r.combosUsed.some((c) => c.includes("(W up)"))).toBe(true);
    expect(r.combosUsed.some((c) => c.includes("(W down)"))).toBe(true);
    expect(r.rows.some((x) => x.group === "BC" && x.Cmax > 0)).toBe(true);
    expect(r.reactions[0].minNet).toBeLessThan(0);
  });

  it("channels in compression are refused, not approximated", () => {
    const r = designSteelTruss(
      ctx(),
      base({ sections: { ...base().sections, TC: { shape: "C8x11.5", grade: "A36" } } }),
    );
    expect(r.pass).toBe(false);
    expect(r.checks.some((c) => c.name.includes("not designed"))).toBe(true);
  });

  it("panels round to an even count between 4 and 16", () => {
    expect(buildSteelTruss(base({ panels: 7 })).panels).toBe(8);
    expect(buildSteelTruss(base({ panels: 30 })).panels).toBe(16);
  });
});

describe("STR and custom T in a project", () => {
  const project = () => {
    const p = exampleProject();
    const s = p.structures[0];
    const lv = s.levels[s.levels.length - 1];
    const str = newMemberSpec(p, "steelTruss", s.id, lv.id);
    const wt = newMemberSpec(p, "woodTruss", s.id, lv.id);
    if (wt.kind !== "woodTruss") throw new Error("woodTruss");
    const g = buildTruss("fink", wt.span, wt.pitch, wt.overhang);
    p.members.push(str, {
      ...wt,
      type: "custom",
      customLayout: {
        nodes: g.nodes.map(({ x, y, onTopChord, onBottomChord }) => ({ x, y, top: onTopChord, bottom: onBottomChord })),
        members: g.members.map(({ a, b, group }) => ({ a, b, group })),
      },
    });
    return { p: projectSchema.parse(p), str, wt };
  };

  it("designs both without errors; a custom copy of the Fink gives the Fink forces", () => {
    const { p, str, wt } = project();
    const d = designProject(p);
    expect(d.outcomes.get(str.id)?.error).toBeUndefined();
    expect(d.outcomes.get(wt.id)?.error).toBeUndefined();
    expect(str.mark).toBe("STR-1");
    const custom = d.outcomes.get(wt.id)!.result!;
    const fink = designProject({
      ...p,
      members: p.members.map((m) => (m.id === wt.id ? { ...m, type: "fink" } : m)) as typeof p.members,
    }).outcomes.get(wt.id)!.result!;
    expect(custom.kind === "woodTruss" && fink.kind === "woodTruss").toBe(true);
    if (custom.kind === "woodTruss" && fink.kind === "woodTruss")
      custom.rows.forEach((r, i) => expect(r.byType.D).toBeCloseTo(fink.rows[i].byType.D, 6));
  });

  it("an unstable custom layout is refused before analysis", () => {
    expect(
      customLayoutError(
        {
          nodes: [
            { x: 0, y: 0, top: true, bottom: true },
            { x: 10, y: 3, top: true, bottom: false },
            { x: 10, y: 0, top: false, bottom: true },
            { x: 20, y: 0, top: true, bottom: true },
          ],
          members: [
            { a: 0, b: 1, group: "TC" },
            { a: 1, b: 3, group: "TC" },
            { a: 0, b: 2, group: "BC" },
            { a: 2, b: 3, group: "BC" },
            { a: 0, b: 3, group: "WEB" },
          ],
        },
        20,
      ),
    ).toMatch(/unstable/);
  });

  it("the report carries the STR sheet and schedule; the .md round trip keeps both trusses", () => {
    const { p } = project();
    const design = designProject(p);
    const html = renderToStaticMarkup(
      createElement(ReportPackage, { project: p, design, entries: buildPackage(p, design) }),
    );
    expect(html).toContain("Steel roof truss design");
    expect(html).toContain("Steel truss schedule");
    const r = applyMarkdown(newProject("blank"), projectToMarkdown(p), { mode: "new" });
    expect(r.ok && r.report.errors).toEqual([]);
    if (r.ok) expect(JSON.parse(JSON.stringify(r.project.members))).toEqual(JSON.parse(JSON.stringify(p.members)));
  });
});
