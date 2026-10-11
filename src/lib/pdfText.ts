/**
 * Text layer of every page of a drawing PDF (pdf.js, in the browser — no AI, no upload).
 * Text items are rebuilt into lines by position so schedule rows read left to right; rotated
 * text (vertical labels) is read along its own direction after the horizontal lines.
 */

import type { DrawingPageText } from "@/engine/project/drawingText";
import { loadPdfJs } from "./pdfStore";

interface Item {
  str: string;
  x: number;
  y: number;
  size: number;
  w: number;
}

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

function toLines(items: Item[]): string[] {
  const rows: Array<{ y: number; size: number; items: Item[] }> = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(1, 0.45 * Math.min(r.size, it.size)));
    if (row) row.items.push(it);
    else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  return rows.map((r) => joinLine(r.items)).filter((l) => l.trim());
}

export async function pdfPagesText(
  data: ArrayBuffer,
  onPage?: (n: number, of: number) => void,
): Promise<DrawingPageText[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const out: DrawingPageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage?.(n, doc.numPages);
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    const flat: Item[] = [];
    const vert: Item[] = [];
    for (const raw of tc.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const [a, b, c, d, e, f] = raw.transform as number[];
      const size = Math.hypot(c, d) || Math.hypot(a, b) || 1;
      if (Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3) flat.push({ str: raw.str, x: e, y: f, size, w: raw.width });
      else if (Math.abs(a) < 1e-3 && Math.abs(d) < 1e-3)
        // 90° text: swap axes so it reads along the label
        vert.push({ str: raw.str, x: b > 0 ? f : -f, y: b > 0 ? -e : e, size, w: raw.width });
    }
    out.push({ page: n, text: [...toLines(flat), ...toLines(vert)].join("\n") });
    pg.cleanup();
  }
  await doc.destroy();
  return out;
}
