/**
 * Lateral model defaults: a one-story building with a generated seismic
 * weight list (roof, ceiling, half the exterior walls of the stories above and
 * below each diaphragm) that the engineer edits.
 */

import type { WeightItem } from "../lateral/analysis";
import type { LateralSpec, Project } from "./schema";

export function generateWeights(p: Pick<Project, "assemblies">, lat: LateralSpec, index: number): WeightItem[] {
  const area = lat.Lx * lat.Ly;
  const perim = 2 * (lat.Lx + lat.Ly);
  const top = index === lat.stories.length - 1;
  const has = (id: string) => p.assemblies.some((a) => a.id === id);
  const items: WeightItem[] = [];
  if (top) {
    const roof = p.assemblies.find((a) => a.kind === "roof");
    const ceil = p.assemblies.find((a) => a.kind === "ceiling");
    if (roof)
      items.push({
        label: `Roof (${roof.id}), plan area`,
        kind: "area",
        qty: area,
        assemblyId: roof.id,
        sloped: roof.basis === "sloped",
      });
    if (ceil) items.push({ label: `Ceiling (${ceil.id})`, kind: "area", qty: area, assemblyId: ceil.id });
  } else {
    const floor = p.assemblies.find((a) => a.kind === "floor");
    if (floor) items.push({ label: `Floor (${floor.id})`, kind: "area", qty: area, assemblyId: floor.id });
    items.push({ label: "Partition allowance (ASCE 7 §12.7.2)", kind: "area", qty: area, psf: 10 });
  }
  const below = lat.stories[index].height / 2;
  const above = top ? 0 : lat.stories[index + 1].height / 2;
  if (has("WD1"))
    items.push({
      label: "Exterior walls, half story above and below",
      kind: "wall",
      qty: perim,
      height: below + above,
      assemblyId: "WD1",
    });
  if (has("WD2"))
    items.push({
      label: "Interior walls (estimated length = half the perimeter)",
      kind: "wall",
      qty: perim / 2,
      height: below + above,
      assemblyId: "WD2",
    });
  return items;
}

export function defaultLateral(p: Pick<Project, "assemblies">): LateralSpec {
  const lat: LateralSpec = {
    enabled: false,
    system: "wsp",
    rho: 1.3,
    TL: 8,
    driftLowRise: false,
    Lx: 40,
    Ly: 30,
    ridge: "X",
    pitch: 4,
    roofRise: 5,
    Ke: 1,
    stories: [{ id: "ST1", name: "First story", height: 9, items: [] }],
    lines: [],
  };
  lat.stories[0].items = generateWeights(p, lat, 0);
  return lat;
}
