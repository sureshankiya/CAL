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
  "nds2018-4A": { id: "nds2018-4A", title: "Visually graded dimension lumber (DF-L, HF, SPF)", source: "NDS Supplement Table 4A", edition: "NDS-2018", status: "unverified" },
  "nds2024-4A": { id: "nds2024-4A", title: "Visually graded dimension lumber (DF-L, HF, SPF)", source: "NDS Supplement Table 4A", edition: "NDS-2024", status: "unverified", note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement." },
  "nds2018-4B": { id: "nds2018-4B", title: "Visually graded Southern Pine dimension lumber (size-specific)", source: "NDS Supplement Table 4B", edition: "NDS-2018", status: "unverified" },
  "nds2024-4B": { id: "nds2024-4B", title: "Visually graded Southern Pine dimension lumber (size-specific)", source: "NDS Supplement Table 4B", edition: "NDS-2024", status: "unverified", note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement." },
  "nds2018-4D": { id: "nds2018-4D", title: "Visually graded timbers 5 in. × 5 in. and larger (DF-L)", source: "NDS Supplement Table 4D", edition: "NDS-2018", status: "unverified" },
  "nds2024-4D": { id: "nds2024-4D", title: "Visually graded timbers 5 in. × 5 in. and larger (DF-L)", source: "NDS Supplement Table 4D", edition: "NDS-2024", status: "unverified", note: "Values carried from the 2018 Supplement — confirm against the printed 2024 Supplement." },
  "nds-5A": { id: "nds-5A", title: "Structural glued laminated softwood timber (24F-V4, 24F-V8 DF)", source: "NDS Supplement Table 5A", edition: "NDS-2018 / NDS-2024", status: "unverified" },
  "scl-generic": { id: "scl-generic", title: "Structural composite lumber — LVL 2.0E, PSL 2.2E, LSL 1.55E", source: "Manufacturer literature / ICC-ES ESR (Weyerhaeuser TJ-9000 values used as defaults)", edition: "current catalogue", status: "unverified", note: "Manufacturer-specific. Replace with the specified product's ESR values." },
  "tji-4000": { id: "tji-4000", title: "TJI® joist design properties", source: "Weyerhaeuser TJ-4000 / ICC-ES ESR-1153 (ported from JoistCalc)", edition: "current catalogue", status: "unverified", note: "Confirm series / depth values against the current TJ-4000 specifier's guide." },
  "asce7-C3.1": { id: "asce7-C3.1", title: "Minimum design dead loads (component weights)", source: "ASCE 7 Commentary Table C3.1-1a", edition: "ASCE 7-16 / 7-22", status: "unverified" },
  "ibc-1607.1": { id: "ibc-1607.1", title: "Minimum uniformly distributed live loads", source: "IBC / CBC Table 1607.1", edition: "2021 / 2024 IBC", status: "unverified" },
  "ibc-1604.3": { id: "ibc-1604.3", title: "Deflection limits", source: "IBC / CBC Table 1604.3", edition: "2021 / 2024 IBC", status: "unverified" },
};

export const tableRef = (id: string) => TABLES[id];

export function tableStatusText(id: string): string {
  const t = TABLES[id];
  if (!t) return "—";
  return t.status === "verified" ? `${t.source} (${t.edition}) — checked` : `${t.source} (${t.edition}) — VERIFY`;
}
