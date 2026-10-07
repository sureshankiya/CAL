/**
 * Deflection limits, IBC / CBC Table 1604.3 (live = L, Lr or S; total = D + L).
 * Cantilevers are checked with ℓ = 2 × cantilever length (Table 1604.3 note h).
 * The total limit is compared with K_cr·D + live; K_cr = 1.0 is the code D + L check
 * and K_cr = 1.5 adds long-term creep per NDS 3.5.2 (seasoned lumber, glulam, SCL, I-joists).
 */

export type DeflectionPreset =
  "floor" | "roof-plaster" | "roof-nonplaster" | "roof-no-ceiling" | "floor-stiff" | "custom";

export interface DeflectionLimits {
  preset: DeflectionPreset;
  live: number;
  total: number;
  label: string;
  ref: string;
}

export const DEFLECTION_PRESETS: Record<Exclude<DeflectionPreset, "custom">, DeflectionLimits> = {
  floor: { preset: "floor", live: 360, total: 240, label: "Floor members", ref: "IBC Table 1604.3" },
  "floor-stiff": {
    preset: "floor-stiff",
    live: 480,
    total: 360,
    label: "Floor members — stiffer criterion (engineer's choice)",
    ref: "Project criterion (exceeds IBC Table 1604.3)",
  },
  "roof-plaster": {
    preset: "roof-plaster",
    live: 360,
    total: 240,
    label: "Roof members supporting plaster or stucco ceiling",
    ref: "IBC Table 1604.3",
  },
  "roof-nonplaster": {
    preset: "roof-nonplaster",
    live: 240,
    total: 180,
    label: "Roof members supporting nonplaster ceiling",
    ref: "IBC Table 1604.3",
  },
  "roof-no-ceiling": {
    preset: "roof-no-ceiling",
    live: 180,
    total: 120,
    label: "Roof members not supporting a ceiling",
    ref: "IBC Table 1604.3",
  },
};

export function deflectionLimits(preset: DeflectionPreset, custom?: { live: number; total: number }): DeflectionLimits {
  if (preset === "custom") {
    if (!custom) throw new Error("Custom deflection limits require live and total values");
    return { preset, live: custom.live, total: custom.total, label: "Custom limits", ref: "Engineer-specified" };
  }
  return DEFLECTION_PRESETS[preset];
}

export const KCR_OPTIONS = [
  { value: 1.0, label: "1.0 — D + L immediate (IBC Table 1604.3)" },
  { value: 1.5, label: "1.5 — long-term, seasoned lumber / glulam / SCL / I-joists, dry service (NDS 3.5.2)" },
  { value: 2.0, label: "2.0 — long-term, unseasoned lumber or wet service (NDS 3.5.2)" },
] as const;
