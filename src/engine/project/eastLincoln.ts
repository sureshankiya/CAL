/**
 * Truss check project: 130 East Lincoln Avenue, Escondido — 45 ft storage-building truss
 * from the portfolio's written truss report (Warren truss with verticals, 30 in. deep,
 * 2x6 DF-L No.1 chords, 2x4 DF-L No.1 webs, 24 in. o.c., 15 psf dead, 20 psf roof live,
 * 1/4 in. per ft roof slope). Nine 5 ft panels span the 45 ft (the report's "8 panels at
 * 5 ft" covers 40 ft only). The truss is designed by HouseCalc for comparison with the
 * report; supporting walls are outside this check.
 */

import { newProject } from "./example";
import type { Project } from "./schema";

export function eastLincolnTrussProject(): Project {
  const p = newProject("130 East Lincoln Avenue — storage building truss");
  p.info = { ...p.info, address: "130 East Lincoln Avenue, Escondido, CA", jobRef: "EL-130", date: "2026-03-18" };
  p.criteria = {
    ...p.criteria,
    riskCategory: "I",
    wind: { V: 95, exposure: "C", Kzt: 1 },
  };
  p.structures = [{ id: "S1", name: "Storage building", levels: [{ id: "RF", name: "Roof", number: 1 }] }];
  p.members = [
    {
      kind: "woodTruss",
      id: "el-t1",
      mark: "T-1",
      description: "45 ft parallel-chord Warren truss with verticals, 30 in. deep",
      structureId: "S1",
      levelId: "RF",
      status: "new",
      links: [],
      type: "parallel",
      span: 45,
      pitch: 0,
      depth: 2.5,
      panels: 9,
      pattern: "warren",
      overhang: 0,
      spacing: 24,
      bearingLen: 3.5,
      tc: { species: "DF-L", grade: "No.1", size: "2x6" },
      bc: { species: "DF-L", grade: "No.1", size: "2x6" },
      web: { species: "DF-L", grade: "No.1", size: "2x4" },
      webBracing: "none",
      roofDead: { psf: 15, basis: "horizontal" },
      ceilingDead: { psf: 0 },
      atticLive: 0,
      roofLive: true,
      snow: false,
      windUplift: 20,
      netSection: 0.85,
      joint: { type: "plate", value: 100, zone: 12, source: "18 ga plates per manufacturer — enter the ESR value" },
      deflection: { preset: "custom", live: 360, total: 240 },
    },
  ];
  p.lateral = undefined;
  p.notes = "Truss-only check of the East Lincoln written truss report (see the Phase 4 findings in PLAN.md).";
  return p;
}
