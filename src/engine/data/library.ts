/**
 * Data-library registry. Every table used by a calculation carries its source
 * document, edition and entry-check status. Sheets print the table reference
 * and status in the Design-basis block; tables that are not yet checked
 * against the printed source print as VERIFY.
 */

export type CheckStatus = "unverified" | "verified";

export interface TableMeta {
  id: string;
  title: string;
  source: string;
  edition: string;
  status: CheckStatus;
  note?: string;
}

export const TABLES: Record<string, TableMeta> = {
  "nds2018-4A": {
    id: "nds2018-4A",
    title: "Visually graded dimension lumber (DF-L, HF, SPF)",
    source: "NDS Supplement Table 4A",
    edition: "NDS-2018",
    status: "unverified",
  },
  "nds2024-4A": {
    id: "nds2024-4A",
    title: "Visually graded dimension lumber (DF-L, HF, SPF)",
    source: "NDS Supplement Table 4A",
    edition: "NDS-2024",
    status: "unverified",
    note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement.",
  },
  "nds2018-4B": {
    id: "nds2018-4B",
    title: "Visually graded Southern Pine dimension lumber (size-specific)",
    source: "NDS Supplement Table 4B",
    edition: "NDS-2018",
    status: "unverified",
  },
  "nds2024-4B": {
    id: "nds2024-4B",
    title: "Visually graded Southern Pine dimension lumber (size-specific)",
    source: "NDS Supplement Table 4B",
    edition: "NDS-2024",
    status: "unverified",
    note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement.",
  },
  "nds2018-4D": {
    id: "nds2018-4D",
    title: "Visually graded timbers 5 in. × 5 in. and larger (DF-L)",
    source: "NDS Supplement Table 4D",
    edition: "NDS-2018",
    status: "unverified",
  },
  "nds2024-4D": {
    id: "nds2024-4D",
    title: "Visually graded timbers 5 in. × 5 in. and larger (DF-L)",
    source: "NDS Supplement Table 4D",
    edition: "NDS-2024",
    status: "unverified",
    note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement.",
  },
  "nds-5A": {
    id: "nds-5A",
    title: "Structural glued laminated softwood timber (24F-V4, 24F-V8 DF)",
    source: "NDS Supplement Table 5A",
    edition: "NDS-2018 / NDS-2024",
    status: "unverified",
  },
  "scl-generic": {
    id: "scl-generic",
    title: "Structural composite lumber — LVL 2.0E, PSL 2.2E, LSL 1.55E",
    source: "Manufacturer literature / ICC-ES ESR (Weyerhaeuser TJ-9000 values used as defaults)",
    edition: "current catalogue",
    status: "unverified",
    note: "Manufacturer-specific. Replace with the specified product's ESR values.",
  },
  "tji-4000": {
    id: "tji-4000",
    title: "TJI® joist design properties",
    source: "Weyerhaeuser TJ-4000 / ICC-ES ESR-1153 (ported from JoistCalc)",
    edition: "current catalogue",
    status: "unverified",
    note: "Confirm series / depth values against the current TJ-4000 specifier's guide.",
  },
  "asce7-C3.1": {
    id: "asce7-C3.1",
    title: "Minimum design dead loads (component weights)",
    source: "ASCE 7 Commentary Table C3.1-1a",
    edition: "ASCE 7-16 / 7-22",
    status: "unverified",
  },
  "ibc-1607.1": {
    id: "ibc-1607.1",
    title: "Minimum uniformly distributed live loads",
    source: "IBC / CBC Table 1607.1",
    edition: "2021 / 2024 IBC",
    status: "unverified",
  },
  "ibc-1604.3": {
    id: "ibc-1604.3",
    title: "Deflection limits",
    source: "IBC / CBC Table 1604.3",
    edition: "2021 / 2024 IBC",
    status: "unverified",
  },
  "sdpws-4.3A": {
    id: "sdpws-4.3A",
    title: "Nominal unit shear capacities — wood structural panel shear walls (blocked)",
    source: "SDPWS Table 4.3A",
    edition: "SDPWS-2021",
    status: "unverified",
    note: "Cells shown on the engineer's Tedds sheets match; other cells to be confirmed against the printed table.",
  },
  "sdpws-4.3B": {
    id: "sdpws-4.3B",
    title: "Nominal unit shear capacities — particleboard shear walls",
    source: "SDPWS Table 4.3B",
    edition: "SDPWS-2021",
    status: "unverified",
    note: "Cell entered from the value printed on the portfolio Tedds sheets.",
  },
  "sdpws-4.3C": {
    id: "sdpws-4.3C",
    title: "Nominal unit shear capacities — gypsum shear walls",
    source: "SDPWS Table 4.3C",
    edition: "SDPWS-2021",
    status: "unverified",
  },
  hardware: {
    id: "hardware",
    title: "Connector hardware allowable loads",
    source: "Manufacturer catalogue / ICC-ES reports (project hardware list)",
    edition: "current catalogue",
    status: "unverified",
    note: "Each item prints VERIFY until marked checked in the project hardware list.",
  },
  "ibc-1806.2": {
    id: "ibc-1806.2",
    title: "Presumptive load-bearing values",
    source: "IBC / CBC Table 1806.2",
    edition: "2021 / 2024 IBC",
    status: "unverified",
  },
  "ibc-1809.7": {
    id: "ibc-1809.7",
    title: "Prescriptive footings for light-frame construction",
    source: "IBC / CBC Table 1809.7",
    edition: "2021 / 2024 IBC",
    status: "unverified",
  },
  "asce7-12.2-1": {
    id: "asce7-12.2-1",
    title: "Design coefficients for seismic force-resisting systems",
    source: "ASCE 7 Table 12.2-1",
    edition: "ASCE 7-16 / 7-22",
    status: "unverified",
  },
  "asce7-28.3-1": {
    id: "asce7-28.3-1",
    title: "External pressure coefficients GCpf — low-rise MWFRS (envelope procedure)",
    source: "ASCE 7 Figure 28.3-1",
    edition: "ASCE 7-16 / 7-22",
    status: "unverified",
  },
  "asce7-30.3-1": {
    id: "asce7-30.3-1",
    title: "External pressure coefficients GCp — walls, components and cladding",
    source: "ASCE 7 Figure 30.3-1",
    edition: "ASCE 7-16 / 7-22",
    status: "unverified",
  },
  "asce7-26.10-1": {
    id: "asce7-26.10-1",
    title: "Velocity pressure exposure coefficients Kz",
    source: "ASCE 7 Table 26.10-1 (formula, 7-16 constants)",
    edition: "ASCE 7-16 / 7-22",
    status: "unverified",
    note: "ASCE 7-22 exposure constants to be confirmed; 7-16 constants used for both editions.",
  },
  "aisc-shapes": {
    id: "aisc-shapes",
    title: "W and C shape properties",
    source: "AISC Shapes Database v15.0 (Manual Tables 1-1, 1-5)",
    edition: "AISC Manual 15th ed.",
    status: "unverified",
    note: "Tabulated rows checked for internal consistency against their plate dimensions; confirm against the database.",
  },
  "aisc-hss": {
    id: "aisc-hss",
    title: "HSS and pipe properties (computed)",
    source: "Computed from t_des = 0.93 t_nom, corner radius 2t (AISC Manual Part 1)",
    edition: "AISC 360 §B4.2",
    status: "unverified",
  },
  "aisc-2-4": {
    id: "aisc-2-4",
    title: "Structural steel material properties",
    source: "AISC Manual Table 2-4 / ASTM A992, A36, A500, A53, F1554",
    edition: "AISC Manual 15th ed.",
    status: "unverified",
  },
  "sdpws-4.2A": {
    id: "sdpws-4.2A",
    title: "Nominal unit shear capacities — wood structural panel diaphragms",
    source: "SDPWS Table 4.2A",
    edition: "SDPWS-2021",
    status: "unverified",
  },
  "nds-12.3.3": {
    id: "nds-12.3.3",
    title: "Dowel bearing strengths",
    source: "NDS Table 12.3.3 / Eq. 12.3-11; masonry / concrete value entered",
    edition: "NDS-2018 / 2024",
    status: "unverified",
  },
  "tms602-2": {
    id: "tms602-2",
    title: "Compressive strength of masonry (unit strength method)",
    source: "TMS 602 Table 2 (f'm from unit strength and mortar type) or prism tests",
    edition: "TMS 602-16 / 602-22",
    status: "unverified",
    note: "f'm is entered with its basis on each wall; confirm against the specification.",
  },
  "tms402-8.3": {
    id: "tms402-8.3",
    title: "Allowable stresses, reinforced masonry (ASD)",
    source: "TMS 402 §8.3 (F_s, F_b, F_v, P_a) and §4.2 (E_m = 900 f'm)",
    edition: "TMS 402-16 / 402-22",
    status: "unverified",
  },
};

export const tableRef = (id: string) => TABLES[id];

export function tableStatusText(id: string): string {
  const t = TABLES[id];
  if (!t) return "—";
  return t.status === "verified" ? `${t.source} (${t.edition}) — checked` : `${t.source} (${t.edition}) — VERIFY`;
}
