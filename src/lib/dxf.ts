import type { SheetEntry } from "@/components/report/package";
import { generateNotes, type Project, type ProjectDesign } from "@/engine/project";
import { layoutPackage } from "./exportLayout";

/**
 * Schedules and general notes as an AutoCAD R12 ASCII DXF (no dependency): TEXT and LINE
 * entities in model space, inches, 1:1 for paper space (3/32 in. text). Tables are drawn as
 * a grid with wrapped cell text; notes as numbered paragraphs. Layers follow the US National
 * CAD Standard: S-ANNO-SCHD (schedule grid and text), S-ANNO-NOTE (notes), S-ANNO-TTLB (titles).
 */

export interface DxfTable {
  title: string;
  head: string[];
  rows: string[][];
}

export interface DxfNotes {
  title: string;
  lines: string[];
}

const H = 3 / 32;
const CHAR_W = 0.9 * H;
const PAD = 0.05;
const ROW = 1.9 * H;
const MAX_CHARS = 38;

/** Symbols mapped to plain text / AutoCAD control codes that every CAD font can show. */
const CAD_SYMBOLS: Record<string, string> = {
  "′": "'",
  "″": '"',
  "×": "x",
  "≤": "<=",
  "≥": ">=",
  "—": "-",
  "–": "-",
  "−": "-",
  "·": "-",
  "°": "%%d",
  "±": "%%p",
  "⌀": "%%c",
  Ø: "%%c",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  Ω: "Omega",
  ρ: "rho",
  φ: "phi",
  Δ: "Delta",
  δ: "delta",
  θ: "theta",
  γ: "gamma",
  β: "beta",
  λ: "lambda",
  Σ: "Sum ",
  "²": "^2",
  "³": "^3",
};

/** Text for a DXF TEXT entity: CAD symbols mapped, any other non-ASCII as AutoCAD \U+XXXX. */
export const dxfText = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /[^\x20-\x7e]/g,
      (c) => CAD_SYMBOLS[c] ?? `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
    );

function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.replace(/\s+/g, " ").trim().split(" ")) {
    if (line && (line + " " + w).length > n) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

class Writer {
  out: string[] = [];
  text(layer: string, x: number, y: number, h: number, s: string) {
    this.out.push(
      "0",
      "TEXT",
      "8",
      layer,
      "10",
      x.toFixed(4),
      "20",
      y.toFixed(4),
      "30",
      "0",
      "40",
      h.toFixed(4),
      "1",
      dxfText(s),
    );
  }
  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.out.push(
      "0",
      "LINE",
      "8",
      layer,
      "10",
      x1.toFixed(4),
      "20",
      y1.toFixed(4),
      "30",
      "0",
      "11",
      x2.toFixed(4),
      "21",
      y2.toFixed(4),
      "31",
      "0",
    );
  }
}

/** Draws one table with its top-left corner at (x, y); returns its bottom y and width. */
function drawTable(w: Writer, t: DxfTable, x: number, y: number): { bottom: number; width: number } {
  const L = "S-ANNO-SCHD";
  const n = t.head.length;
  const cells = [t.head, ...t.rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ""))];
  const chars = t.head.map((_, i) => Math.min(MAX_CHARS, Math.max(...cells.map((r) => r[i].length), 3)));
  const widths = chars.map((c) => c * CHAR_W + 2 * PAD);
  const xs = [x];
  for (const wd of widths) xs.push(xs[xs.length - 1] + wd);
  w.text("S-ANNO-TTLB", x, y + 0.08, 1.33 * H, t.title);
  let top = y;
  w.line(L, x, top, xs[n], top);
  for (const r of cells) {
    const wrapped = r.map((c, i) => wrap(c, chars[i]));
    const lines = Math.max(...wrapped.map((c) => c.length));
    const h = lines * ROW + ROW * 0.4;
    wrapped.forEach((c, i) => c.forEach((s, k) => w.text(L, xs[i] + PAD, top - ROW * (k + 1), H, s)));
    top -= h;
    w.line(L, x, top, xs[n], top);
  }
  for (const xx of xs) w.line(L, xx, y, xx, top);
  return { bottom: top, width: xs[n] - x };
}

function drawNotes(w: Writer, n: DxfNotes, x: number, y: number, width: number): number {
  const chars = Math.floor(width / CHAR_W);
  w.text("S-ANNO-TTLB", x, y, 1.33 * H, n.title.toUpperCase());
  let at = y - 2 * ROW;
  n.lines.forEach((l, i) => {
    const tag = `${i + 1}. `;
    wrap(l, chars - tag.length).forEach((s, k) => {
      w.text("S-ANNO-NOTE", x + (k ? tag.length * CHAR_W : 0), at, H, k ? s : tag + s);
      at -= ROW;
    });
    at -= ROW * 0.5;
  });
  return at;
}

/** DXF text: schedules in a column on the left, notes in a 7 in. column to their right. */
export function dxfDocument(tables: DxfTable[], notes: DxfNotes[]): string {
  const w = new Writer();
  let y = 0;
  let right = 0;
  for (const t of tables) {
    const d = drawTable(w, t, 0, y);
    right = Math.max(right, d.width);
    y = d.bottom - 0.5;
  }
  let ny = 0;
  for (const n of notes) ny = drawNotes(w, n, right + 1, ny, 7) - 0.3;
  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...w.out,
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
}

/** Schedule tables (with a header row) from a rendered sheet. */
export function sheetTables(sheet: HTMLElement): DxfTable[] {
  const txt = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ").trim();
  const out: DxfTable[] = [];
  let section = "";
  const outer = sheet.querySelector(":scope > table");
  for (const tr of outer?.querySelectorAll(":scope > tbody > tr") ?? []) {
    const inner = tr.querySelector("table");
    if (!inner) {
      const td = tr.querySelector("td.font-bold");
      if (td) section = txt(td);
      continue;
    }
    const hr = Array.from(inner.tHead?.rows ?? []);
    if (!hr.length) continue;
    const head = Array.from(hr[hr.length - 1].cells).map(txt);
    const caption = hr.length > 1 ? txt(hr[0]) : section;
    const rows = Array.from(inner.tBodies[0]?.rows ?? []).map((r) => Array.from(r.cells).map(txt));
    out.push({ title: caption || "Schedule", head, rows });
  }
  return out;
}

/** The schedules and general notes of the package as DXF text. */
export async function scheduleDxf(project: Project, design: ProjectDesign, entries: SheetEntry[]): Promise<string> {
  const lay = await layoutPackage(
    project,
    design,
    entries.filter((e) => e.kind === "schedules" || e.kind === "general-notes"),
  );
  try {
    const tables = lay.sheets.flatMap(sheetTables);
    const n = generateNotes(project, design);
    const notes: DxfNotes[] = n.sections.map((s) => ({ title: s.title, lines: s.notes }));
    const own = project.notes
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (own.length) notes.push({ title: "Project notes", lines: own });
    return dxfDocument(tables, notes);
  } finally {
    lay.done();
  }
}
