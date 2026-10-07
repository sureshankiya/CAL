/**
 * Provenance of every input value, and the assumption log built from it.
 * The log prints on each sheet (Assumptions & overrides) and at the end of
 * the house report.
 */

export type Provenance =
  | { kind: "default"; source: string }
  | { kind: "user" }
  | { kind: "drawing"; sheet: string; page: number; confirmed: boolean }
  | { kind: "override"; replaces: string; note?: string };

export interface AssumptionEntry {
  /** Short item name, e.g. "Load duration factor". */
  item: string;
  /** What was assumed or overridden, e.g. "C_D = 1.25 (roof live, auto)". */
  value: string;
  provenance: Provenance;
  /** Field verification or EOR attention required. */
  verify?: boolean;
}

export const fromDefault = (item: string, value: string, source: string, verify = false): AssumptionEntry => ({
  item,
  value,
  provenance: { kind: "default", source },
  verify,
});

export const fromOverride = (item: string, value: string, replaces: string, note?: string): AssumptionEntry => ({
  item,
  value,
  provenance: { kind: "override", replaces, note },
  verify: true,
});

export function provenanceLabel(p: Provenance): string {
  switch (p.kind) {
    case "default":
      return `Default — ${p.source}`;
    case "user":
      return "Entered by engineer";
    case "drawing":
      return `Drawing ${p.sheet}, p.${p.page}${p.confirmed ? " (confirmed)" : " (UNCONFIRMED)"}`;
    case "override":
      return `Override of ${p.replaces}${p.note ? ` — ${p.note}` : ""}`;
  }
}
