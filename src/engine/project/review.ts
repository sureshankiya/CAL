/**
 * Manual review table: values read from the drawings, tagged with drawing,
 * page and sheet, confirmed by the engineer, then applied to member inputs.
 * Unconfirmed items are never applied (plan §10: nothing calculates from a
 * drawing value until it is confirmed).
 */

import type { MemberSpec, Project, ReviewItem } from "./schema";

export interface TargetField {
  field: string;
  label: string;
  numeric: boolean;
}

/** Fields a review item may set, by member kind. */
export function targetFields(m: MemberSpec): TargetField[] {
  const common: TargetField[] = [{ field: "description", label: "Description", numeric: false }];
  const spans = (n: number): TargetField[] =>
    Array.from({ length: n }, (_, i) => ({ field: `spans.${i}`, label: `Span ${i + 1} (ft)`, numeric: true }));
  switch (m.kind) {
    case "joist":
    case "ijoist":
      return [
        ...common,
        ...spans(m.spans.length),
        { field: "spacing", label: "Spacing (in)", numeric: true },
        { field: "leftCantilever", label: "Left cantilever (ft)", numeric: true },
        { field: "rightCantilever", label: "Right cantilever (ft)", numeric: true },
        ...(m.kind === "joist" ? [{ field: "size", label: "Nominal size", numeric: false }] : []),
      ];
    case "ceilingJoist":
      return [
        ...common,
        ...spans(m.spans.length),
        { field: "spacing", label: "Spacing (in)", numeric: true },
        { field: "size", label: "Nominal size", numeric: false },
      ];
    case "rafter":
      return [
        ...common,
        { field: "run", label: "Horizontal run (ft)", numeric: true },
        { field: "rise", label: "Pitch (in 12)", numeric: true },
        { field: "overhang", label: "Overhang (ft)", numeric: true },
        { field: "spacing", label: "Spacing (in)", numeric: true },
        { field: "size", label: "Nominal size", numeric: false },
      ];
    case "beam":
      return [
        ...common,
        ...spans(m.spans.length),
        { field: "area.0.trib", label: "Tributary width, first area load (ft)", numeric: true },
      ];
    case "wall":
      return [
        ...common,
        { field: "plateHeight", label: "Plate height (ft)", numeric: true },
        { field: "length", label: "Wall length (ft)", numeric: true },
        { field: "spacing", label: "Stud spacing (in)", numeric: true },
        { field: "size", label: "Stud size", numeric: false },
      ];
    case "post":
      return [...common, { field: "height", label: "Post height (ft)", numeric: true }];
    case "truss":
      return [
        ...common,
        { field: "span", label: "Truss span (ft)", numeric: true },
        { field: "spacing", label: "Truss spacing (in)", numeric: true },
        ...m.bearings.flatMap((b, i) =>
          (["D", "L", "Lr", "S", "W"] as const).map((t) => ({
            field: `bearings.${i}.${t}`,
            label: `Bearing ${b.name} — ${t} reaction (lb)`,
            numeric: true,
          })),
        ),
      ];
    case "footing":
      return [
        ...common,
        { field: "B", label: "Width B (ft)", numeric: true },
        { field: "h", label: "Thickness (in)", numeric: true },
        { field: "depth", label: "Depth below grade (in)", numeric: true },
      ];
    case "shearWall":
      return [
        ...common,
        { field: "b", label: "Segment length (ft)", numeric: true },
        { field: "h", label: "Wall height (ft)", numeric: true },
      ];
    case "steelBeam":
      return [...common, ...spans(m.spans.length), { field: "shape", label: "Steel shape", numeric: false }];
    case "steelColumn":
      return [
        ...common,
        { field: "height", label: "Column height (ft)", numeric: true },
        { field: "shape", label: "Steel shape", numeric: false },
      ];
    case "basePlate":
      return [
        ...common,
        { field: "plate.N", label: "Plate N (in)", numeric: true },
        { field: "plate.B", label: "Plate B (in)", numeric: true },
        { field: "plate.tp", label: "Plate thickness (in)", numeric: true },
      ];
    case "ledger":
      return [
        ...common,
        { field: "ledger.size", label: "Ledger size", numeric: false },
        { field: "fastener.spacing", label: "Fastener spacing (in)", numeric: true },
      ];
    case "transfer":
      return [...common, { field: "spacing", label: "Connector spacing (in)", numeric: true }];
    case "connector":
    case "diaphragm":
    case "uplift":
      return [...common];
  }
}

/** Parse a drawing value: feet-inches (12'-6"), fractions (11-7/8), decimals. */
export function parseDrawingNumber(text: string): number | undefined {
  const t = text.trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  const ftIn = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?(?:\s+(\d+)\/(\d+))?\s*"?$/);
  if (ftIn) {
    const ft = Number(ftIn[1]);
    const inch = Number(ftIn[2] ?? 0) + (ftIn[3] ? Number(ftIn[3]) / Number(ftIn[4]) : 0);
    return ft + inch / 12;
  }
  const mixed = t.match(/^(\d+)[-\s](\d+)\/(\d+)\s*"?$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(/[^\d.+-]/g, ""));
  return t !== "" && Number.isFinite(n) ? n : undefined;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = (cur as Record<string, unknown>)[k];
    if (next === undefined || next === null || typeof next !== "object")
      throw new Error(`Field ${path} is not available on this member`);
    cur = next as Record<string, unknown>;
  }
  (cur as Record<string, unknown>)[keys[keys.length - 1]] = value;
}

/** Apply a confirmed review item to its target member; returns the updated project. */
export function applyReviewItem(p: Project, item: ReviewItem): Project {
  if (!item.confirmed) throw new Error("Confirm the value before applying it");
  if (!item.target) throw new Error("No target member / field selected");
  const m = p.members.find((x) => x.id === item.target!.memberId);
  if (!m) throw new Error("Target member not found");
  const def = targetFields(m).find((f) => f.field === item.target!.field);
  if (!def) throw new Error("Field not editable from the review table");
  const value = def.numeric ? parseDrawingNumber(item.value) : item.value.trim();
  if (
    def.numeric &&
    (value === undefined ||
      !Number.isFinite(value as number) ||
      (!/\.(D|L|Lr|S|W)$/.test(def.field) && (value as number) < 0))
  )
    throw new Error(`"${item.value}" is not a valid number`);
  const copy = structuredClone(m) as unknown as Record<string, unknown>;
  setPath(copy, def.field, value);
  return { ...p, members: p.members.map((x) => (x.id === m.id ? (copy as unknown as MemberSpec) : x)) };
}

/** Review items feeding a member, for the member sheet's input-source rows. */
export const reviewItemsFor = (p: Project, memberId: string) => p.review.filter((r) => r.target?.memberId === memberId);
