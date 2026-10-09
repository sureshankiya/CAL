/**
 * Lays the calculation package out off-screen at the printed text width (US Letter,
 * 0.6 in side margins) so the PDF and Word writers can read the sheets as the browser
 * set them: positions, fonts, borders and diagrams.
 */

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ReportPackage } from "@/components/report/ReportPackage";
import type { SheetEntry } from "@/components/report/package";
import { fileNameFor, type Project, type ProjectDesign } from "@/engine/project";

/** US Letter page and the print margins of styles.css (@page), in inches. */
export const PAGE = { w: 8.5, h: 11, top: 0.55, right: 0.6, bottom: 0.7, left: 0.6 };
export const PX_PER_IN = 96;

export interface LaidOut {
  /** one <article> per sheet */
  sheets: HTMLElement[];
  done(): void;
}

export async function layoutPackage(project: Project, design: ProjectDesign, entries: SheetEntry[]): Promise<LaidOut> {
  const host = document.createElement("div");
  host.className = "export-layout report-preview";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<ReportPackage project={project} design={design} entries={entries} />));
  await document.fonts?.ready;
  return {
    sheets: Array.from(host.querySelectorAll<HTMLElement>("article.report-root")),
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** Parsed CSS colour (rgb / rgba) → 0–1 components and alpha; null for transparent. */
export function cssColor(c: string): { r: number; g: number; b: number; a: number } | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c === "black" ? { r: 0, g: 0, b: 0, a: 1 } : null;
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const a = parts.length > 3 ? parts[3] : 1;
  if (!(a > 0)) return null;
  return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a };
}

export const hexOf = (c: { r: number; g: number; b: number }) =>
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

/** Diagram → PNG at `scale` × its laid-out size. */
export async function svgToPng(svg: SVGSVGElement, scale = 3): Promise<{ png: Uint8Array; w: number; h: number }> {
  const r = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(r.width));
  clone.setAttribute("height", String(r.height));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(r.width * scale));
    canvas.height = Math.max(1, Math.round(r.height * scale));
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok, bad) =>
      canvas.toBlob((b) => (b ? ok(b) : bad(new Error("PNG encode failed"))), "image/png"),
    );
    return { png: new Uint8Array(await blob.arrayBuffer()), w: r.width, h: r.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** File name for an exported report, e.g. "1550-bluebird-calculations.pdf". */
export const reportFileName = (p: Project, ext: string) =>
  fileNameFor(p).replace(/\.housecalc\.json$/, "") + `-calculations.${ext}`;
