/** Result shape shared by every member module, consumed by schedules, load path and sheets. */

import type { Check } from "../design/wood";
import type { LoadVector } from "../core/loads";
import type { AssumptionEntry } from "../core/provenance";
import type { LoadLine } from "./common";

export type MemberKind =
  | "joist"
  | "rafter"
  | "ceilingJoist"
  | "ijoist"
  | "beam"
  | "wall"
  | "post"
  | "truss"
  | "connector"
  | "footing"
  | "shearWall";

export interface MemberReaction {
  support: number;
  /** support letter, A, B, C ... */
  name: string;
  x: number;
  /** unfactored reaction by load type (pattern maximum for L / Lr), lb */
  byType: LoadVector;
  /** reaction per foot of supporting member for repetitive members (lb / spacing), plf */
  perFoot?: LoadVector;
  maxDown: number;
  maxDownCombo: string;
  /** most negative (uplift) net reaction over the combinations, lb */
  minNet: number;
  minNetCombo: string;
}

export interface MemberAlternatives {
  /** lightest passing size in the same grade at the same spacing */
  lightest?: string;
  /** largest standard spacing that passes, in */
  maxSpacing?: number;
  /** longest single span that passes, ft */
  maxSpan?: number;
}

export interface MemberResultBase {
  id: string;
  mark: string;
  kind: MemberKind;
  /** e.g. "Floor joist" */
  title: string;
  /** e.g. "2x10 DF-L No.2 @ 16 in. o.c." */
  callout: string;
  pass: boolean;
  governing: Check;
  checks: Check[];
  reactions: MemberReaction[];
  loadLines: LoadLine[];
  assumptions: AssumptionEntry[];
  flags: string[];
  alternatives?: MemberAlternatives;
}

export const supportName = (i: number) => String.fromCharCode(65 + i);
