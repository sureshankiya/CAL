import type { SheetEntry } from "@/components/report/package";
import { generateNotes, type GeneralNotesSheet, type Project, type ProjectDesign } from "@/engine/project";
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
  "§": "Sec. ",
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

/* ---------------------------------------------------------------- general notes sheet */

/** Title-block fields for the drawing sheet. */
export interface SheetInfo {
  project: string;
  address: string;
  client: string;
  jobRef: string;
  date: string;
  revision: string;
  preparedBy: string;
}

/** ARCH D sheet, inches: border margin, title-block strip on the right, five note columns. */
const SH = { w: 36, h: 24, m: 0.5, tb: 3, cols: 5, gutter: 0.3 };

class SheetFlow {
  k = -1;
  col = 0;
  y = 0;
  readonly cw: number;
  readonly top = SH.h - SH.m - 0.35;
  readonly bottom = SH.m + 0.35;
  constructor(
    private w: Writer,
    private info: SheetInfo,
    private title: string,
  ) {
    const usable = SH.w - 2 * SH.m - SH.tb - 0.5;
    this.cw = (usable - (SH.cols - 1) * SH.gutter) / SH.cols;
    this.sheet();
  }
  get ox() {
    return this.k * (SH.w + 2);
  }
  x(col = this.col) {
    return this.ox + SH.m + 0.25 + col * (this.cw + SH.gutter);
  }
  private sheet() {
    this.k++;
    this.col = 0;
    this.y = this.top;
    const { w } = this;
    const o = this.ox;
    const B = "S-ANNO-TTLB";
    const [x0, x1, y0, y1] = [o + SH.m, o + SH.w - SH.m, SH.m, SH.h - SH.m];
    w.line(B, x0, y0, x1, y0);
    w.line(B, x1, y0, x1, y1);
    w.line(B, x1, y1, x0, y1);
    w.line(B, x0, y1, x0, y0);
    const tx = x1 - SH.tb;
    w.line(B, tx, y0, tx, y1);
    const chars = Math.floor((SH.tb - 0.3) / CHAR_W);
    let ty = y1 - 0.35;
    const field = (label: string, value: string, h = H) => {
      w.text(B, tx + 0.15, ty, 0.07, label.toUpperCase());
      ty -= 0.18;
      for (const s of wrap(value || "-", Math.floor(chars * (H / h)))) {
        w.text(B, tx + 0.15, ty, h, s);
        ty -= h * 1.6;
      }
      ty -= 0.12;
      w.line(B, tx, ty + 0.06, x1, ty + 0.06);
      ty -= 0.12;
    };
    field("Prepared by", this.info.preparedBy);
    field("Project", this.info.project, 1.33 * H);
    field("Address", this.info.address);
    field("Client", this.info.client);
    field("Job no.", this.info.jobRef);
    field("Date", this.info.date);
    field("Revision", this.info.revision);
    // engineer's stamp
    const s0 = ty - 2.7;
    w.text(B, tx + 0.15, ty, 0.07, "ENGINEER'S STAMP");
    w.line(B, tx + 0.15, ty - 0.15, x1 - 0.15, ty - 0.15);
    w.line(B, x1 - 0.15, ty - 0.15, x1 - 0.15, s0);
    w.line(B, x1 - 0.15, s0, tx + 0.15, s0);
    w.line(B, tx + 0.15, s0, tx + 0.15, ty - 0.15);
    // sheet title and number
    w.line(B, tx, y0 + 1.6, x1, y0 + 1.6);
    w.text(B, tx + 0.15, y0 + 1.35, 0.07, "SHEET TITLE");
    w.text(B, tx + 0.15, y0 + 1.05, 0.16, this.title);
    w.text(B, tx + 0.15, y0 + 0.7, 0.07, "SHEET");
    w.text(B, tx + 0.15, y0 + 0.2, 0.4, `S0.${this.k}`);
  }
  /** room for h below the cursor, else the next column / sheet */
  ensure(h: number): boolean {
    if (this.y - h >= this.bottom) return false;
    this.col++;
    if (this.col >= SH.cols) this.sheet();
    else this.y = this.top;
    return true;
  }
  heading(t: string) {
    this.ensure(4 * ROW);
    if (this.y < this.top - 1e-6) this.y -= 0.5 * ROW;
    const h = 1.33 * H;
    this.w.text("S-ANNO-TTLB", this.x(), this.y - h, h, t.toUpperCase());
    this.w.line("S-ANNO-TTLB", this.x(), this.y - h - 0.05, this.x() + t.length * 0.9 * h, this.y - h - 0.05);
    this.y -= h + 2 * ROW * 0.6;
  }
  notes(items: string[], numbered = true) {
    const chars = Math.floor(this.cw / CHAR_W);
    items.forEach((it, i) => {
      const tag = numbered ? `${i + 1}. ` : "";
      const lines = wrap(it, chars - tag.length);
      lines.forEach((s, k) => {
        this.ensure(ROW);
        this.w.text("S-ANNO-NOTE", this.x() + (k ? tag.length * CHAR_W : 0), this.y - H, H, k ? s : tag + s);
        this.y -= ROW;
      });
      this.y -= 0.35 * ROW;
    });
  }
  /** table across the column; fr = column width fractions */
  table(head: string[], fr: number[], rows: string[][]) {
    const L = "S-ANNO-SCHD";
    const widths = fr.map((f) => f * this.cw);
    const chars = widths.map((wd) => Math.max(3, Math.floor((wd - 2 * PAD) / CHAR_W)));
    const row = (cells: string[], header: boolean) => {
      const wrapped = cells.map((c, i) => wrap(c, chars[i]));
      const h = Math.max(...wrapped.map((c) => c.length)) * ROW + 0.4 * ROW;
      if (this.ensure(h) && !header) row(head, true);
      const x0 = this.x();
      const xs = [x0];
      for (const wd of widths) xs.push(xs[xs.length - 1] + wd);
      const top = this.y;
      wrapped.forEach((c, i) =>
        c.forEach((s, k) => this.w.text(L, xs[i] + PAD, top - ROW * (k + 1) + 0.2 * ROW, H, s)),
      );
      this.y -= h;
      this.w.line(L, x0, top, xs[xs.length - 1], top);
      this.w.line(L, x0, this.y, xs[xs.length - 1], this.y);
      for (const xx of xs) this.w.line(L, xx, top, xx, this.y);
      if (header) this.w.line(L, x0, this.y + 0.02, xs[xs.length - 1], this.y + 0.02);
    };
    row(head, true);
    for (const r of rows) row(r, false);
    this.y -= 0.5 * ROW;
  }
}

/** S0.0 general notes sheet (continues on S0.1 … when the content overflows). */
export function generalNotesDxf(g: GeneralNotesSheet, info: SheetInfo): string {
  const w = new Writer();
  const f = new SheetFlow(w, info, "GENERAL NOTES");
  f.heading("Drawing index");
  f.table(
    ["Sheet", "Title"],
    [0.22, 0.78],
    g.index.map(([a, b]) => [a, b]),
  );
  f.heading("Codes and standards");
  f.notes(g.codes);
  f.heading("Structural design criteria");
  f.table(
    ["Item", "Design value"],
    [0.36, 0.64],
    g.criteria.map(([a, b]) => [a, b]),
  );
  for (const s of g.notes) {
    f.heading(s.title);
    f.notes(s.notes);
  }
  if (g.deferred.length) {
    f.heading("Deferred submittals");
    f.notes(g.deferred);
  }
  if (g.nailing.length) {
    f.heading("Nailing schedule — designed connections");
    f.table(["Mark", "Connection", "Fastener", "Spacing"], [0.13, 0.3, 0.3, 0.27], g.nailing);
  }
  f.heading("Fastening schedule — typical framing");
  f.table(
    ["Connection", "Fastener", "Location / spacing"],
    [0.44, 0.27, 0.29],
    g.typicalNailing.map((r) => [...r]),
  );
  f.notes(
    [
      "Common wire nails unless noted. Other fasteners permitted by IBC / CBC Table 2304.10.2 may be substituted as listed there. Scheduled connections on the plans and calculations govern.",
    ],
    false,
  );
  if (g.hardware.length) {
    f.heading("Hardware schedule");
    f.table(["Product", "Description", "Fasteners", "Location"], [0.24, 0.24, 0.24, 0.28], g.hardware);
    f.notes(
      [
        "Install all connectors with the full number and size of fasteners listed by the manufacturer; substitutions require the engineer's approval.",
      ],
      false,
    );
  }
  if (g.inspections.length) {
    f.heading("Special inspections (IBC / CBC Ch. 17)");
    f.table(["Item", "Type", "Members"], [0.5, 0.2, 0.3], g.inspections);
  }
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
