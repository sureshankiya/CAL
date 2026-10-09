/**
 * Connector hardware catalogue — hold-downs, hurricane ties, hangers, post
 * caps / bases and straps. The catalogue is copied into each project so the
 * engineer can enter or correct values; every item carries a "checked" flag
 * and prints VERIFY until it is checked against the current manufacturer
 * catalogue / ICC-ES report.
 *
 * Capacities are allowable (ASD) loads for DF-L / SP framing, by load-duration
 * column as published (100 = floor, 115 = snow, 125 = roof, 160 = wind / seismic).
 * Values are entered only where the published value is known; blank values must
 * be entered by the engineer before the connector can be checked.
 */

export type HardwareKind = "holdown" | "tie" | "hanger" | "post-cap" | "post-base" | "strap" | "angle";

export const HARDWARE_KIND_LABEL: Record<HardwareKind, string> = {
  holdown: "Hold-down",
  tie: "Hurricane / rafter tie",
  hanger: "Joist / beam hanger",
  "post-cap": "Post cap",
  "post-base": "Post base",
  strap: "Strap tie",
  angle: "Framing angle / clip",
};

export interface HardwareItem {
  id: string;
  model: string;
  kind: HardwareKind;
  manufacturer: string;
  description: string;
  fasteners: string;
  report: string;
  /** downward allowable load by duration column, lb */
  down?: Partial<Record<"100" | "115" | "125" | "160", number>>;
  /** uplift allowable load, C_D = 1.6, lb */
  uplift?: number;
  /** lateral allowable loads, C_D = 1.6, lb */
  F1?: number;
  F2?: number;
  /** tension allowable load (hold-downs, straps), C_D = 1.6, lb */
  tension?: number;
  /** device deflection at the allowable tension (hold-downs), in */
  deflection?: number;
  /** anchor diameter (hold-downs), in */
  anchorDia?: number;
  /** minimum post / end-member thickness (hold-downs), in */
  minPost?: number;
  checked: boolean;
  source: string;
}

const SIMPSON = "Simpson Strong-Tie";
const CAT = "Simpson Strong-Tie Wood Construction Connectors catalogue (DF/SP)";
/** checked 2026-10-09 against the Simpson catalogue pages (C-C-2019 / C-C-2017 HDU, HTT, CS tables, DF/SP) */
const CAT19 = "Simpson Strong-Tie C-C-2019 catalogue (DF/SP) — checked 2026-10-09; confirm against the current edition";

const hd = (
  model: string,
  tension: number,
  deflection: number,
  anchorDia: number,
  fasteners: string,
  minPost: number,
  checked = true,
): HardwareItem => ({
  id: model,
  model,
  kind: "holdown",
  manufacturer: SIMPSON,
  description: `${model} hold-down`,
  fasteners,
  report: "ICC-ES ESR-2330",
  tension,
  deflection,
  anchorDia,
  minPost,
  checked,
  source: checked ? CAT19 : CAT,
});

const blank = (
  model: string,
  kind: HardwareKind,
  description: string,
  fasteners: string,
  report = "",
): HardwareItem => ({
  id: model,
  model,
  kind,
  manufacturer: SIMPSON,
  description,
  fasteners,
  report,
  checked: false,
  source: `${CAT} — enter the published values`,
});

export function defaultHardware(): HardwareItem[] {
  return [
    hd("HDU2-SDS2.5", 3075, 0.088, 0.625, "(6) SDS 1/4 × 2-1/2 in.", 3),
    hd("HDU4-SDS2.5", 4565, 0.114, 0.625, "(10) SDS 1/4 × 2-1/2 in.", 3),
    hd("HDU5-SDS2.5", 5645, 0.115, 0.625, "(14) SDS 1/4 × 2-1/2 in.", 3),
    hd("HDU8-SDS2.5", 6970, 0.116, 0.875, "(20) SDS 1/4 × 2-1/2 in.", 3),
    hd("HDU11-SDS2.5", 9335, 0.137, 1.0, "(30) SDS 1/4 × 2-1/2 in. (3-1/2 × 5-1/2 in. post)", 3.5),
    {
      ...hd("HDU14-SDS2.5", 14390, 0.177, 1.0, "(36) SDS 1/4 × 2-1/2 in. (3-1/2 × 7-1/4 in. post)", 3.5),
      description: "HDU14 hold-down (on a 6x6 post: 14,445 lb, 0.172 in.)",
    },
    {
      ...hd("HTT4", 4235, 0.123, 0.625, "(18) 0.162 × 2-1/2 in. nails", 3),
      description: "HTT4 tension tie (nailed; 4,455 lb with (18) #10 × 1-1/2 in. SD screws)",
      report: "ICC-ES ESR-2613",
    },
    {
      id: "H2.5A",
      model: "H2.5A",
      kind: "tie",
      manufacturer: SIMPSON,
      description: "H2.5A hurricane tie, rafter / truss to plate",
      fasteners: "(10) 8d × 1-1/2 in. nails",
      report: "ICC-ES ESR-2613",
      uplift: 535,
      F1: 110,
      F2: 110,
      checked: false,
      source: `${CAT} — F1 / F2 110 lb confirmed (C-C-2019); uplift 535 lb (C-2008) is below the C-C-2019 value of 565 lb with 0.131 × 2-1/2 in. nails — confirm the fastener used`,
    },
    {
      id: "CS16",
      model: "CS16",
      kind: "strap",
      manufacturer: SIMPSON,
      description: "CS16 coiled strap, 16 ga",
      fasteners: "(20) 0.148 × 2-1/2 in. nails (11 in. end length) or (22) 0.131 × 2-1/2 in. (13 in.)",
      report: "ICC-ES ESR-2105",
      tension: 1705,
      checked: true,
      source: CAT19,
    },
    blank("LUS26", "hanger", "LUS26 face-mount hanger, 2x6", "per catalogue"),
    blank("LUS28", "hanger", "LUS28 face-mount hanger, 2x8", "per catalogue"),
    blank("LUS210", "hanger", "LUS210 face-mount hanger, 2x10", "per catalogue"),
    blank("HUS210", "hanger", "HUS210 face-mount hanger, 2x10", "per catalogue"),
    blank("BC4", "post-cap", "BC4 post cap, 4x post", "per catalogue"),
    blank("BC6", "post-cap", "BC6 post cap, 6x post", "per catalogue"),
    blank("ABU44", "post-base", "ABU44 adjustable post base, 4x4", "per catalogue"),
    blank("ABU66", "post-base", "ABU66 adjustable post base, 6x6", "per catalogue"),
    blank("A35", "angle", "A35 framing angle", "per catalogue"),
    blank("H1", "tie", "H1 hurricane tie", "per catalogue"),
  ];
}

/**
 * Allowable downward load for a load-duration factor. Published columns are
 * used directly; C_D = 0.9 takes 0.9 × the 100 column; a missing column falls
 * back to the next lower published column (conservative).
 */
export function downCapacity(h: HardwareItem, CD: number): number | undefined {
  const d = h.down;
  if (!d) return undefined;
  const cols: Array<[number, "100" | "115" | "125" | "160"]> = [
    [1.0, "100"],
    [1.15, "115"],
    [1.25, "125"],
    [1.6, "160"],
  ];
  if (CD < 1) return d["100"] !== undefined ? d["100"] * CD : undefined;
  let best: number | undefined;
  for (const [cd, k] of cols) if (cd <= CD + 1e-9 && d[k] !== undefined) best = d[k];
  return best;
}

export const hardwareLabel = (h: HardwareItem) => `${h.manufacturer} ${h.model}`;
