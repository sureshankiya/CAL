/**
 * AI-assisted drawing extraction (plan §10): shared types, the output schema, the
 * cost estimate shown before a run, and the mapping of extracted items into
 * unconfirmed review-table rows. The model call itself is a server function
 * (src/server/extract.ts); nothing extracted is applied to a member until the
 * engineer confirms it in the review table.
 */

import { targetFields } from "./review";
import type { MemberSpec, Project, ReviewItem } from "./schema";

export const EXTRACTION_MODEL = "claude-opus-5-5";
/** USD per million tokens (input, output) for the extraction model. */
export const EXTRACTION_PRICE = { input: 4, output: 20 };

export interface ExtractionMember {
  mark: string;
  kind: string;
  description: string;
  fields: Array<{ field: string; label: string }>;
}

export interface ExtractionRequest {
  /** base64 PNG of the rendered page (no data: prefix) */
  image: string;
  imageWidth: number;
  imageHeight: number;
  /** vector text of the page from the PDF (pdf.js text content) */
  text: string;
  sheet: string;
  page: number;
  members: ExtractionMember[];
}

export interface ExtractedItem {
  item: string;
  value: string;
  memberMark: string;
  field: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface ExtractionResult {
  sheet: string;
  items: ExtractedItem[];
  notes: string;
  usage: { input: number; output: number; cost: number };
  model: string;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    sheet: { type: "string", description: "Sheet number from the title block, e.g. S-2; empty if not shown" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "What the value is, e.g. 'Rafter size R-1' or 'Span of B-2'" },
          value: { type: "string", description: "The value exactly as written on the drawing" },
          memberMark: { type: "string", description: "Mark of the project member it feeds, or empty" },
          field: { type: "string", description: "Field key from that member's field list, or empty" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string", description: "Verbatim text from the drawing that shows the value" },
        },
        required: ["item", "value", "memberMark", "field", "confidence", "evidence"],
        additionalProperties: false,
      },
    },
    notes: { type: "string", description: "Anything unreadable, ambiguous or conflicting" },
  },
  required: ["sheet", "items", "notes"],
  additionalProperties: false,
} as const;

/** Members and their settable fields, sent with the page so items can be linked. */
export function extractionMembers(p: Project): ExtractionMember[] {
  return p.members.map((m: MemberSpec) => ({
    mark: m.mark,
    kind: m.kind,
    description: m.description,
    fields: targetFields(m).map((f) => ({ field: f.field, label: f.label })),
  }));
}

/**
 * Cost estimate before the run. Image tokens ≈ width × height / 750; text ≈ 1 token per
 * 3.5 characters; fixed prompt ≈ 1,500 tokens plus the member list; output (with
 * thinking) taken as 6,000 tokens. Shown as an estimate — the actual usage is reported
 * after the run.
 */
export function estimateExtractionCost(r: Pick<ExtractionRequest, "imageWidth" | "imageHeight" | "text" | "members">) {
  const image = Math.ceil((r.imageWidth * r.imageHeight) / 750);
  const text = Math.ceil(r.text.length / 3.5);
  const members = Math.ceil(JSON.stringify(r.members).length / 3.5);
  const input = image + text + members + 1500;
  const output = 6000;
  const cost = (input * EXTRACTION_PRICE.input + output * EXTRACTION_PRICE.output) / 1e6;
  return { input, output, cost };
}

/** Turn extracted items into unconfirmed review rows (targets only when mark and field are valid). */
export function reviewItemsFrom(
  p: Project,
  res: ExtractionResult,
  drawingId: string,
  page: number,
  sheet: string,
  newId: () => string,
): ReviewItem[] {
  return res.items
    .filter((x) => x.item.trim() && x.value.trim())
    .map((x) => {
      const m = p.members.find((y) => y.mark === x.memberMark);
      const ok = m && targetFields(m).some((f) => f.field === x.field);
      return {
        id: newId(),
        drawingId,
        page,
        sheet: res.sheet || sheet,
        item: x.item.trim(),
        value: x.value.trim(),
        target: ok ? { memberId: m!.id, field: x.field } : undefined,
        confirmed: false,
        note: `AI-extracted (${x.confidence} confidence${x.evidence ? `; "${x.evidence.slice(0, 120)}"` : ""})${m && !ok && x.field ? `; field "${x.field}" not recognised` : ""}`,
      };
    });
}
