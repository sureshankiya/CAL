/**
 * Text of every page of a drawing PDF (pdf.js, in the browser — no AI, no upload).
 * Text items are rebuilt into lines by position so schedule rows read left to right; rotated
 * text (vertical labels) is read along its own direction after the horizontal lines.
 * AutoCAD plots SHX lettering as line work and keeps the words as hidden "AutoCAD SHX Text"
 * comments — those comments are read as text too.
 */

import { VERTICAL_TEXT, type DrawingPageText } from "@/engine/project/drawingText";
import { loadPdfJs } from "./pdfStore";

interface Item {
  str: string;
  x: number;
  y: number;
  size: number;
  w: number;
}

export interface PdfPageText extends DrawingPageText {
  /** text items from the text layer and from text comments */
  items: number;
  comments: number;
  /** reading the page took too long and was stopped */
  timedOut?: boolean;
}

/** one page may not hold the reader longer than this */
const PAGE_LIMIT_MS = 45_000;

function joinLine(items: Item[]): string {
  items.sort((a, b) => a.x - b.x);
  let out = "";
  let end = -Infinity;
  for (const it of items) {
    if (out) {
      const gap = it.x - end;
      out += gap > it.size * 2.5 ? "  " : gap > it.size * 0.15 ? " " : "";
    }
    out += it.str;
    end = it.x + it.w;
  }
  return out.replace(/\s+$/, "");
}

/** items → lines, top to bottom; one sweep over items sorted by height on the sheet */
function toLines(items: Item[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: Array<{ y: number; size: number; items: Item[] }> = [];
  for (const it of sorted) {
    // rows close in height are the only candidates (items are visited in descending y)
    let hit: (typeof rows)[number] | undefined;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 8; k--) {
      const r = rows[k];
      if (Math.abs(r.y - it.y) <= Math.max(1, 0.45 * Math.min(r.size, it.size))) {
        hit = r;
        break;
      }
    }
    if (hit) hit.items.push(it);
    else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  return rows.map((r) => joinLine(r.items)).filter((l) => l.trim());
}

/** let the browser repaint (progress) between pages — pdf.js may run on this thread */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

function within<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
}

interface PdfAnnotation {
  subtype?: string;
  rect?: number[];
  contentsObj?: { str?: string };
  contents?: string;
  titleObj?: { str?: string };
}

/** words kept as PDF comments (AutoCAD SHX Text, FreeText, text notes) */
function commentItems(annots: PdfAnnotation[], flat: Item[], vert: Item[]): number {
  let n = 0;
  for (const a of annots) {
    if (a.subtype === "Link" || a.subtype === "Widget" || a.subtype === "Popup") continue;
    const str = (a.contentsObj?.str ?? a.contents ?? "").replace(/\s+/g, " ").trim();
    if (!str || !a.rect || a.rect.length < 4) continue;
    const [x1, y1, x2, y2] = a.rect;
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    n++;
    if (str.length > 2 && h > w * 2) vert.push({ str, x: y, y: -x, size: Math.max(1, w), w: h });
    else flat.push({ str, x, y, size: Math.max(1, Math.min(h, 24)), w });
  }
  return n;
}

export async function pdfPagesText(
  data: ArrayBuffer,
  onPage?: (n: number, of: number) => void,
): Promise<PdfPageText[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const out: PdfPageText[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      await breathe();
      const pg = await doc.getPage(n);
      const flat: Item[] = [];
      const vert: Item[] = [];
      const tc = await within(pg.getTextContent(), PAGE_LIMIT_MS);
      let items = 0;
      if (tc !== "timeout") {
        for (const raw of tc.items) {
          if (!("str" in raw) || !raw.str.trim()) continue;
          const [a, b, c, d, e, f] = raw.transform as number[];
          const size = Math.hypot(c, d) || Math.hypot(a, b) || 1;
          items++;
          if (Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3) flat.push({ str: raw.str, x: e, y: f, size, w: raw.width });
          else if (Math.abs(a) < 1e-3 && Math.abs(d) < 1e-3)
            // 90° text: swap axes so it reads along the label
            vert.push({ str: raw.str, x: b > 0 ? f : -f, y: b > 0 ? -e : e, size, w: raw.width });
          else flat.push({ str: raw.str, x: e, y: f, size, w: raw.width });
        }
      }
      let comments = 0;
      const an = await within(pg.getAnnotations() as Promise<PdfAnnotation[]>, 15_000).catch(() => "timeout" as const);
      if (an !== "timeout") comments = commentItems(an, flat, vert);
      out.push({
        page: n,
        text: [...toLines(flat), ...(vert.length ? [VERTICAL_TEXT, ...toLines(vert)] : [])].join("\n"),
        items: items + comments,
        comments,
        timedOut: tc === "timeout" || undefined,
      });
      pg.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
