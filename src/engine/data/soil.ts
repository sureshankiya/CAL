/**
 * IBC / CBC Table 1806.2 presumptive load-bearing values, lateral bearing and
 * sliding resistance; IBC Table 1809.7 prescriptive footings for light-frame
 * construction.
 */

export type SoilClass = "1" | "2" | "3" | "4" | "5";

export interface SoilClassDef {
  id: SoilClass;
  label: string;
  /** allowable foundation pressure, psf */
  bearing: number;
  /** lateral bearing pressure, psf per ft below natural grade */
  lateral: number;
  /** coefficient of friction (sliding), or undefined where cohesion applies */
  friction?: number;
  /** cohesion, psf (class 5) */
  cohesion?: number;
}

export const SOIL_CLASSES: SoilClassDef[] = [
  { id: "1", label: "Crystalline bedrock", bearing: 12000, lateral: 1200, friction: 0.7 },
  { id: "2", label: "Sedimentary and foliated rock", bearing: 4000, lateral: 400, friction: 0.35 },
  { id: "3", label: "Sandy gravel and/or gravel (GW and GP)", bearing: 3000, lateral: 200, friction: 0.35 },
  {
    id: "4",
    label: "Sand, silty sand, clayey sand, silty gravel and clayey gravel (SW, SP, SM, SC, GM and GC)",
    bearing: 2000,
    lateral: 150,
    friction: 0.25,
  },
  {
    id: "5",
    label: "Clay, sandy clay, silty clay, clayey silt, silt and sandy silt (CL, ML, MH and CH)",
    bearing: 1500,
    lateral: 100,
    cohesion: 130,
  },
];

export const soilClass = (id: string) => SOIL_CLASSES.find((s) => s.id === id) ?? SOIL_CLASSES[4];

/** IBC Table 1809.7 — prescriptive footings for light-frame bearing walls. */
export const LIGHT_FRAME_FOOTING: Array<{ stories: number; width: number; thickness: number }> = [
  { stories: 1, width: 12, thickness: 6 },
  { stories: 2, width: 15, thickness: 6 },
  { stories: 3, width: 18, thickness: 8 },
];

export function minFooting(stories: number) {
  return LIGHT_FRAME_FOOTING.find((r) => r.stories >= stories) ?? LIGHT_FRAME_FOOTING[2];
}

/** IBC 1809.4 minimum depth below undisturbed ground, in. */
export const MIN_FOOTING_DEPTH = 12;
