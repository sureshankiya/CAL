/**
 * Versioned code cycles. Every calculation sheet stamps the cycle in its
 * Design-basis block, and every data table belongs to one cycle's standards.
 *
 * Pairings: the 2025 CBC / CRC adopt the 2024 IBC / IRC; the 2022 CBC / CRC
 * adopt the 2021 IBC / IRC. Referenced-standard editions are recorded here and
 * must be confirmed against IBC Chapter 35 of the adopted edition.
 *
 * Model-code (IBC / IRC) and other-state cycles reuse the referenced standards
 * of the same I-code edition; the engine's equations are those standards', so
 * only the governing-code names printed on the sheets differ. State amendments
 * are not modelled.
 */

import { DATA_VERSION } from "../version";

export type CycleId = "2025" | "2022" | "IBC2024" | "IBC2021" | "OR2022" | "WA2021";

export interface CodeCycle {
  id: CycleId;
  label: string;
  /** Model I-code edition the cycle is based on; drives edition-dependent equations (TMS, IRC section numbers). */
  edition: "2024" | "2021";
  /** California amendments in force (CALGreen etc. cited in the notes). */
  california: boolean;
  building: string;
  residential: string;
  asce7: "ASCE 7-22" | "ASCE 7-16";
  nds: "NDS-2024" | "NDS-2018";
  ndsSupplement: string;
  sdpws: string;
  aci318: string;
  aisc360: string;
  tms402: string;
  /** IBC Table 1604.3 deflection limits as adopted by the CBC. */
  deflectionTable: string;
  liveLoadTable: string;
  /** ASCE 7-16 flat-roof snow includes Is; ASCE 7-22 does not (risk-targeted pg). */
  snowIncludesIs: boolean;
}

export const CODE_CYCLES = {
  "2025": {
    id: "2025",
    label: "2025 CBC / CRC (2024 IBC / IRC)",
    edition: "2024",
    california: true,
    building: "2025 CBC / 2024 IBC",
    residential: "2025 CRC / 2024 IRC",
    asce7: "ASCE 7-22",
    nds: "NDS-2024",
    ndsSupplement: "NDS Supplement 2024",
    sdpws: "SDPWS-2021",
    aci318: "ACI 318-19",
    aisc360: "AISC 360-22",
    tms402: "TMS 402/602-22",
    deflectionTable: "CBC 2025 Table 1604.3",
    liveLoadTable: "CBC 2025 Table 1607.1",
    snowIncludesIs: false,
  },
  "2022": {
    id: "2022",
    label: "2022 CBC / CRC (2021 IBC / IRC)",
    edition: "2021",
    california: true,
    building: "2022 CBC / 2021 IBC",
    residential: "2022 CRC / 2021 IRC",
    asce7: "ASCE 7-16",
    nds: "NDS-2018",
    ndsSupplement: "NDS Supplement 2018",
    sdpws: "SDPWS-2021",
    aci318: "ACI 318-19",
    aisc360: "AISC 360-16",
    tms402: "TMS 402/602-16",
    deflectionTable: "CBC 2022 Table 1604.3",
    liveLoadTable: "CBC 2022 Table 1607.1",
    snowIncludesIs: true,
  },
} as Record<CycleId, CodeCycle>;

/** Same referenced standards as a base cycle; only the governing-code names change. */
const basedOn = (
  base: CodeCycle,
  c: Pick<CodeCycle, "id" | "label" | "building" | "residential"> & { california?: boolean },
): CodeCycle => {
  const short = c.building.split(" / ")[0];
  return {
    ...base,
    california: false,
    ...c,
    deflectionTable: `${short} Table 1604.3`,
    liveLoadTable: `${short} Table 1607.1`,
  };
};

CODE_CYCLES.IBC2024 = basedOn(CODE_CYCLES["2025"], {
  id: "IBC2024",
  label: "2024 IBC / IRC (model code)",
  building: "2024 IBC",
  residential: "2024 IRC",
});
CODE_CYCLES.IBC2021 = basedOn(CODE_CYCLES["2022"], {
  id: "IBC2021",
  label: "2021 IBC / IRC (model code)",
  building: "2021 IBC",
  residential: "2021 IRC",
});
// shortcut: state editions as known at release; confirm the edition in force on the permit date before issue.
CODE_CYCLES.OR2022 = basedOn(CODE_CYCLES["2022"], {
  id: "OR2022",
  label: "Oregon 2022 OSSC / 2023 ORSC (2021 IBC / IRC)",
  building: "2022 OSSC / 2021 IBC",
  residential: "2023 ORSC / 2021 IRC",
});
CODE_CYCLES.WA2021 = basedOn(CODE_CYCLES["2022"], {
  id: "WA2021",
  label: "Washington 2021 IBC / IRC (WAC 51-50 / 51-51)",
  building: "2021 IBC (WAC 51-50)",
  residential: "2021 IRC (WAC 51-51)",
});

export const CYCLE_IDS = Object.keys(CODE_CYCLES) as [CycleId, ...CycleId[]];
export const CYCLE_LIST = CYCLE_IDS.map((id) => CODE_CYCLES[id]);

export const getCycle = (id?: string): CodeCycle => CODE_CYCLES[(id as CycleId) ?? "2025"] ?? CODE_CYCLES["2025"];

/** Engine and data-library versions printed on every sheet (src/engine/version.ts). */
export { ENGINE_VERSION } from "../version";
export const dataLibraryVersion = (id: CycleId) => `${id}-cycle v${DATA_VERSION}`;
