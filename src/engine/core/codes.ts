/**
 * Versioned code cycles. Every calculation sheet stamps the cycle in its
 * Design-basis block, and every data table belongs to one cycle's standards.
 *
 * Pairings: the 2025 CBC / CRC adopt the 2024 IBC / IRC; the 2022 CBC / CRC
 * adopt the 2021 IBC / IRC. Referenced-standard editions are recorded here and
 * must be confirmed against IBC Chapter 35 of the adopted edition.
 */

export type CycleId = "2025" | "2022";

export interface CodeCycle {
  id: CycleId;
  label: string;
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

export const CODE_CYCLES: Record<CycleId, CodeCycle> = {
  "2025": {
    id: "2025",
    label: "2025 CBC / CRC (2024 IBC / IRC)",
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
};

export const CYCLE_LIST = [CODE_CYCLES["2025"], CODE_CYCLES["2022"]];

export const getCycle = (id?: string): CodeCycle => CODE_CYCLES[(id as CycleId) ?? "2025"] ?? CODE_CYCLES["2025"];

/** Engine and data-library versions printed on every sheet. */
export const ENGINE_VERSION = "0.1.0";
export const dataLibraryVersion = (id: CycleId) => `${id}-cycle v0.1`;
