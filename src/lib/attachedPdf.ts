/**
 * Attached PDFs kept in the project file as base64 (the ASCE 7 hazard report):
 * decode / encode and page rendering for the report view and the Word export.
 */

import { loadPdfJs } from "./pdfStore";

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  // chunked: String.fromCharCode over a whole file overflows the call stack
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface PagePng {
  png: Uint8Array;
  url: string;
  /** page size, pt */
  w: number;
  h: number;
}

/** Every page rendered to PNG at `scale` × 72 dpi. */
export async function pdfPagesPng(data: Uint8Array, scale = 2): Promise<PagePng[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  const out: PagePng[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      const url = canvas.toDataURL("image/png");
      out.push({ png: fromBase64(url.slice(url.indexOf(",") + 1)), url, w: base.width, h: base.height });
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
