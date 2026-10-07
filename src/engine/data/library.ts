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
};

export const tableRef = (id: string) => TABLES[id];

export function tableStatusText(id: string): string {
  const t = TABLES[id];
  if (!t) return "—";
  return t.status === "verified" ? `${t.source} (${t.edition}) — checked` : `${t.source} (${t.edition}) — VERIFY`;
}
