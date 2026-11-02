import type { SheetEntry } from "@/components/report/package";
import { generateNotes, type GeneralNotesSheet, type Project, type ProjectDesign } from "@/engine/project";
import { DETAIL_SHEETS, type Detail, type DetailCat, type Prim } from "./details";
import TEMPLATES from "./detailTemplates.json";
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
  /** rot: degrees; center: x, y is the middle-centre (TEXT 72 = 1, 73 = 2); right: x, y is the right end of the baseline; style: text style name */
  text(
    layer: string,
    x: number,
    y: number,
    h: number,
    s: string,
    o: { rot?: number; center?: boolean; right?: boolean; ha?: number; style?: string } = {},
  ) {
    const at = [x.toFixed(4), y.toFixed(4)];
    // width factor 0.85: wrapping assumes 0.9 h per character, which holds for txt.shx and romans.shx
    this.out.push(
      "0",
      "TEXT",
      "8",
      layer,
      "10",
      at[0],
      "20",
      at[1],
      "30",
      "0",
      "40",
      h.toFixed(4),
      "1",
      dxfText(s),
      "41",
      "0.85",
    );
    if (o.rot) this.out.push("50", o.rot.toFixed(1));
    if (o.style) this.out.push("7", o.style);
    if (o.center) this.out.push("72", "1", "73", "2", "11", at[0], "21", at[1], "31", "0");
    else if (o.right || o.ha) this.out.push("72", o.right ? "2" : String(o.ha), "11", at[0], "21", at[1], "31", "0");
  }
  /** filled quadrilateral (rebar dots, arrowheads) */
  solid(layer: string, p: Array<[number, number]>) {
    const q = p.length === 3 ? [p[0], p[1], p[2], p[2]] : [p[0], p[1], p[3], p[2]];
    this.out.push("0", "SOLID", "8", layer);
    q.forEach(([x, y], i) => this.out.push(`1${i}`, x.toFixed(4), `2${i}`, y.toFixed(4), `3${i}`, "0"));
  }
  /** polyline with a constant width (heavy lines) */
  pline(layer: string, pts: Array<[number, number]>, width: number) {
    this.out.push(
      "0",
      "POLYLINE",
      "8",
      layer,
      "66",
      "1",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "40",
      width.toFixed(4),
      "41",
      width.toFixed(4),
    );
    for (const [x, y] of pts)
      this.out.push("0", "VERTEX", "8", layer, "10", x.toFixed(4), "20", y.toFixed(4), "30", "0");
    this.out.push("0", "SEQEND", "8", layer);
  }
  circle(layer: string, x: number, y: number, r: number) {
    this.out.push("0", "CIRCLE", "8", layer, "10", x.toFixed(4), "20", y.toFixed(4), "30", "0", "40", r.toFixed(4));
  }
  rect(layer: string, x0: number, y0: number, x1: number, y1: number) {
    this.line(layer, x0, y0, x1, y0);
    this.line(layer, x1, y0, x1, y1);
    this.line(layer, x1, y1, x0, y1);
    this.line(layer, x0, y1, x0, y0);
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

/**
 * ARCH D sheet, inches, in the engineer's S0 format: four columns of boxed panels with a title
 * bar, the drawing index at the top of the last column, title block in a strip on the right.
 */
const SH = { w: 36, h: 24, m: 0.5, tb: 2, cols: 4, gutter: 0.15, gap: 0.12 };
const TOP = SH.h - SH.m - 0.25;
const BOTTOM = SH.m + 0.25;
const X0 = SH.m + 0.25;
const CW = (SH.w - SH.m - SH.tb - 0.25 - X0 - (SH.cols - 1) * SH.gutter) / SH.cols;
/** text heights tried, largest first: the largest that fits the sheet is used */
const T_MAX = 0.14;
const T_MIN = 0.07;
/** advance width of an upper-case character of the STANDARD (txt.shx) font, × text height */
const ADV = 0.9;

interface Row {
  h: number;
  draw(w: Writer, x: number, top: number): void;
}
interface Block {
  title: string;
  rows: Row[];
  /** table header, repeated where the panel continues in the next column */
  repeat: Row[];
}
interface Segment {
  sheet: number;
  col: number;
  top: number;
  bottom: number;
  title: string;
  rows: Row[];
}

function blocks(g: GeneralNotesSheet, t: number): Block[] {
  const ls = 1.5 * t;
  const pad = 0.6 * t;
  const chars = (wd: number) => Math.max(3, Math.floor((wd - 2 * pad) / (ADV * t)));
  const N = "S-ANNO-NOTE";
  const S = "S-ANNO-SCHD";
  const textRows = (s: string, after = 0.4 * t, layer = N): Row[] =>
    wrap(s, chars(CW)).map((l, i, a) => ({
      h: ls + (i === a.length - 1 ? after : 0),
      draw: (w, x, top) => w.text(layer, x + pad, top - 1.15 * t, t, l),
    }));
  /** table row: cells wrapped in their columns, grid lines on the row */
  const tableRow = (cells: string[], fr: number[], header = false): Row => {
    const wd = fr.map((f) => f * CW);
    const wrapped = cells.map((c, i) => wrap(c, chars(wd[i]) + 1));
    const h = Math.max(...wrapped.map((c) => c.length)) * ls + 0.5 * t;
    return {
      h,
      draw: (w, x, top) => {
        let cx = x;
        wrapped.forEach((c, i) => {
          c.forEach((l, k) => w.text(S, cx + 0.6 * pad, top - 0.25 * t - 1.15 * t - k * ls, t, l));
          if (i) w.line(S, cx, top, cx, top - h);
          cx += wd[i];
        });
        w.line(S, x, top - h, x + CW, top - h);
        if (header) w.line(S, x, top - h + 0.03, x + CW, top - h + 0.03);
      },
    };
  };
  const spacer = (h: number): Row => ({ h, draw: () => {} });
  return g.panels.map((p): Block => {
    if (p.kind === "notes")
      return { title: p.title, rows: [spacer(pad), ...p.lines.flatMap((l) => textRows(l))], repeat: [] };
    if (p.kind === "criteria")
      return {
        title: p.title,
        repeat: [],
        rows: [
          spacer(pad),
          ...p.groups.flatMap((gr) => [
            ...wrap(gr.head, chars(CW)).map((l): Row => ({
              h: ls,
              draw: (w, x, top) => {
                w.text(N, x + pad, top - 1.15 * t, t, l);
                w.line(N, x + pad, top - 1.35 * t, x + pad + l.length * ADV * t, top - 1.35 * t);
              },
            })),
            ...gr.rows.map(([a, b], i, all): Row => {
              const la = wrap(a, chars(0.56 * CW));
              const lb = wrap(b, chars(0.44 * CW));
              const n = Math.max(la.length, lb.length);
              return {
                h: n * ls + (i === all.length - 1 ? 0.6 * t : 0),
                draw: (w, x, top) => {
                  la.forEach((l, k) => w.text(N, x + pad + 0.15, top - 1.15 * t - k * ls, t, l));
                  lb.forEach((l, k) => w.text(N, x + 0.56 * CW, top - 1.15 * t - k * ls, t, l));
                },
              };
            }),
          ]),
          ...p.foot.flatMap((l) => textRows(l)),
        ],
      };
    const head = tableRow(p.head, p.widths, true);
    const caption = p.caption
      ? [
          {
            h: ls + 0.5 * t,
            draw: (w: Writer, x: number, top: number) => {
              w.text(S, x + CW / 2, top - (ls + 0.5 * t) / 2, t, p.caption!, { center: true });
              w.line(S, x, top - ls - 0.5 * t, x + CW, top - ls - 0.5 * t);
            },
          },
        ]
      : [];
    return {
      title: p.title,
      repeat: [...caption, head],
      rows: [
        ...caption,
        head,
        ...p.rows.map((r) => tableRow(r, p.widths)),
        ...(p.foot?.length ? [spacer(pad), ...p.foot.flatMap((l) => textRows(l))] : []),
      ],
    };
  });
}

/** Flows the panels down the columns; the drawing index sits at the top of the last column of the first sheet. */
function layout(bs: Block[], t: number): Segment[] {
  const hb = 2.4 * t;
  const pad = 0.6 * t;
  const segs: Segment[] = [];
  const sum = (rs: Row[]) => rs.reduce((a, r) => a + r.h, 0);
  const index = bs.find((b) => b.title === "DRAWING INDEX");
  let indexBottom = TOP;
  if (index) {
    const h = hb + sum(index.rows) + pad;
    segs.push({ sheet: 0, col: SH.cols - 1, top: TOP, bottom: TOP - h, title: index.title, rows: index.rows });
    indexBottom = TOP - h - SH.gap;
  }
  let col = 0;
  const colTop = (c: number) => (c === SH.cols - 1 && index ? indexBottom : TOP);
  let y = colTop(0);
  for (const b of bs) {
    if (b === index) continue;
    let seg: Segment | undefined;
    const close = () => {
      if (!seg) return;
      y -= pad;
      seg.bottom = y;
      segs.push(seg);
      seg = undefined;
    };
    let cont = false;
    // a panel starts in a column only with its first few rows (no title stranded at the foot)
    const lead = sum(b.rows.slice(0, 6));
    for (const r of b.rows) {
      const head = seg ? 0 : hb + (cont ? sum(b.repeat) : lead - r.h);
      if (y - head - r.h - pad < BOTTOM) {
        close();
        col++;
        y = colTop(col);
      }
      if (!seg) {
        seg = {
          sheet: Math.floor(col / SH.cols),
          col: col % SH.cols,
          top: y,
          bottom: y,
          title: cont ? `${b.title} (CONT.)` : b.title,
          rows: cont ? [...b.repeat] : [],
        };
        y -= hb + (cont ? sum(b.repeat) : 0);
        cont = true;
      }
      if (b.repeat.includes(r) && seg.rows.includes(r)) continue;
      seg.rows.push(r);
      y -= r.h;
    }
    close();
    y -= SH.gap;
  }
  // the last panel of each column runs to the bottom of the column: no blank space under it
  const last = new Map<string, Segment>();
  for (const s of segs) last.set(`${s.sheet}:${s.col}`, s);
  for (const s of last.values()) s.bottom = BOTTOM;
  return segs;
}

function titleBlock(w: Writer, ox: number, info: SheetInfo, sheetNo: string, title = "GENERAL NOTES") {
  const B = "S-ANNO-TTLB";
  const x1 = ox + SH.w - SH.m;
  const x0 = x1 - SH.tb;
  const xl = x0 + 0.1;
  const wd = SH.tb - 0.2;
  w.rect(B, ox + SH.m, SH.m, x1, SH.h - SH.m);
  w.line(B, x0, SH.m, x0, SH.h - SH.m);
  let y = SH.h - SH.m;
  const box = (h: number, label: string, fill: (top: number, bottom: number) => void) => {
    const bottom = y - h;
    if (label) w.text(B, xl, y - 0.14, 0.07, label);
    fill(y, bottom);
    w.line(B, x0, bottom, x1, bottom);
    y = bottom;
  };
  const lines = (s: string, h: number, top: number) =>
    wrap(s || "-", Math.floor(wd / (ADV * h))).forEach((l, k) => w.text(B, xl, top - k * 1.5 * h, h, l));
  box(0.55, "DATE ISSUED", (top) => w.text(B, x0 + SH.tb / 2, top - 0.36, 0.12, info.date || "-", { center: true }));
  box(1.55, "", (top, bottom) => {
    const cols = [0, 0.3, 0.9, 1.65, SH.tb];
    const heads = ["NO.", "DATE", "REVISION", "BY"];
    heads.forEach((s, i) => w.text(B, x0 + (cols[i] + cols[i + 1]) / 2, top - 0.12, 0.07, s, { center: true }));
    for (let r = top - 0.24; r > bottom + 0.01; r -= 0.26) w.line(B, x0, r, x1, r);
    for (const c of cols.slice(1, -1)) w.line(B, x0 + c, top, x0 + c, bottom);
    if (info.revision && info.revision !== "0") {
      w.text(B, x0 + 0.15, top - 0.42, 0.08, info.revision, { center: true });
      w.text(B, x0 + 0.6, top - 0.42, 0.07, info.date, { center: true });
    }
  });
  box(1.3, "PREPARED BY", (top) => lines(info.preparedBy, 0.1, top - 0.38));
  box(1.9, "PLAN CHECK / PERMIT", () => {});
  box(2.5, "ENGINEER'S STAMP", () => {});
  const rest = y - (SH.m + 2.9);
  box(rest, "", (_top, bottom) => {
    // job address and client, read from the bottom as on the issued sheets
    const xs = [xl + 0.12, xl + 0.6, xl + 1.15, xl + 1.55];
    w.text(B, xs[0], bottom + 0.2, 0.09, "PREPARED FOR", { rot: 90 });
    w.text(B, xs[1], bottom + 0.2, 0.3, info.project || "-", { rot: 90 });
    w.text(B, xs[2], bottom + 0.2, 0.22, info.address || "-", { rot: 90 });
    w.text(B, xs[3], bottom + 0.2, 0.12, info.client ? `CLIENT: ${info.client}` : "", { rot: 90 });
  });
  box(0.75, "SHEET TITLE", (top) => {
    const th = title.length * 0.75 * 0.16 <= SH.tb - 0.2 ? 0.16 : 0.12;
    const ls = wrap(title, Math.floor((SH.tb - 0.2) / (0.75 * th))).slice(0, 3);
    ls.forEach((l, i) =>
      w.text(B, x0 + SH.tb / 2, top - 0.45 - (i - (ls.length - 1) / 2) * 1.35 * th, th, l, { center: true }),
    );
  });
  box(1.15, "", (top) => {
    [
      ["DATE", info.date],
      ["SCALE", "AS NOTED"],
      ["DRAWN BY", info.preparedBy],
      ["JOB NO.", info.jobRef],
    ].forEach(([k, v], i) => {
      w.text(B, xl, top - 0.22 - i * 0.26, 0.07, k);
      w.text(B, xl + 0.7, top - 0.22 - i * 0.26, 0.08, (v || "-").slice(0, 16));
      w.line(B, xl + 0.65, top - 0.26 - i * 0.26, x1 - 0.1, top - 0.26 - i * 0.26);
    });
  });
  w.text(B, xl, y - 0.14, 0.07, "SHEET NUMBER");
  w.text(B, x0 + SH.tb / 2, SH.m + 0.55, 0.5, sheetNo, { center: true });
}

/** S0 general notes sheet; content that does not fit one sheet at the smallest text height continues on further sheets. */
export function generalNotesDxf(g: GeneralNotesSheet, info: SheetInfo): string {
  let t = T_MAX;
  let segs = layout(blocks(g, t), t);
  while (t > T_MIN + 1e-9 && segs.some((s) => s.sheet > 0)) {
    t = Math.max(T_MIN, t - 0.0025);
    segs = layout(blocks(g, t), t);
  }
  const w = new Writer();
  const hb = 2.4 * t;
  const sheets = Math.max(...segs.map((s) => s.sheet)) + 1;
  for (let k = 0; k < sheets; k++) titleBlock(w, k * (SH.w + 2), info, k ? `${g.sheetNo}.${k}` : g.sheetNo);
  for (const s of segs) {
    const x = s.sheet * (SH.w + 2) + X0 + s.col * (CW + SH.gutter);
    const L = "S-ANNO-TTLB";
    w.rect(L, x, s.bottom, x + CW, s.top);
    w.line(L, x, s.top - hb, x + CW, s.top - hb);
    w.text(L, x + CW / 2, s.top - hb / 2, 1.25 * t, s.title, { center: true });
    let y = s.top - hb;
    for (const r of s.rows) {
      r.draw(w, x, y);
      y -= r.h;
    }
  }
  return dxfFile(w);
}

/** layers (colour for the plot style, linetype), text styles: slanted ROMANS notes, sans titles */
const LAYERS: Array<[string, number, string]> = [
  ["S-DETL", 7, "CONTINUOUS"],
  ["S-DETL-HATC", 8, "CONTINUOUS"],
  ["S-DETL-HIDN", 8, "HIDDEN"],
  ["S-ANNO-DIMS", 2, "CONTINUOUS"],
  ["S-ANNO-TEXT", 2, "CONTINUOUS"],
  ["S-ANNO-SYMB", 7, "CONTINUOUS"],
  ["S-ANNO-TTLB", 7, "CONTINUOUS"],
  ["S-ANNO-NOTE", 2, "CONTINUOUS"],
  ["S-ANNO-SCHD", 2, "CONTINUOUS"],
];
const STYLES: Array<[string, string, number]> = [
  ["STANDARD", "txt", 0],
  ["HC-NOTE", "romanc.shx", 0],
  ["HC-TITLE", "arial.ttf", 0],
];
const table = (name: string, rows: string[][]) => [
  "0",
  "TABLE",
  "2",
  name,
  "70",
  String(rows.length),
  ...rows.flat(),
  "0",
  "ENDTAB",
];
const dxfTables = () => [
  "0",
  "SECTION",
  "2",
  "TABLES",
  ...table("LTYPE", [
    ["0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0"],
    [
      "0",
      "LTYPE",
      "2",
      "HIDDEN",
      "70",
      "0",
      "3",
      "Hidden __ __ __",
      "72",
      "65",
      "73",
      "2",
      "40",
      "0.375",
      "49",
      "0.25",
      "49",
      "-0.125",
    ],
  ]),
  ...table(
    "LAYER",
    [["0", 7, "CONTINUOUS"] as [string, number, string], ...LAYERS].map(([n, c, lt]) => [
      "0",
      "LAYER",
      "2",
      n,
      "70",
      "0",
      "62",
      String(c),
      "6",
      lt,
    ]),
  ),
  ...table(
    "STYLE",
    STYLES.map(([n, f, ob]) => [
      "0",
      "STYLE",
      "2",
      n,
      "70",
      "0",
      "40",
      "0.0",
      "41",
      "1.0",
      "50",
      String(ob),
      "71",
      "0",
      "42",
      "0.1",
      "3",
      f,
      "4",
      "",
    ]),
  ),
  "0",
  "ENDSEC",
];

const dxfFile = (w: Writer) =>
  [
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
    ...dxfTables(),
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

/* ---------------------------------------------------------------- details sheets */

/** standard architectural scales, paper inches per foot */
const SCALES: Array<[number, string]> = [
  [3, '3" = 1\'-0"'],
  [1.5, '1-1/2" = 1\'-0"'],
  [1, '1" = 1\'-0"'],
  [0.75, '3/4" = 1\'-0"'],
  [0.5, '1/2" = 1\'-0"'],
  [0.375, '3/8" = 1\'-0"'],
  [0.25, '1/4" = 1\'-0"'],
  [0.1875, '3/16" = 1\'-0"'],
  [0.125, '1/8" = 1\'-0"'],
];
const GRID = { cols: 4, rows: 4, band: 0.55 };

function extent(ps: Prim[]): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  const pts = (...q: Array<[number, number]>) => q.forEach(([x, y]) => (xs.push(x), ys.push(y)));
  for (const p of ps) {
    if (p.t === "line" || p.t === "dim") pts(p.a, p.b);
    else if (p.t === "circle") pts([p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]);
    else if (p.t === "earth") pts([p.x1, p.y - 2], [p.x2, p.y]);
    else pts([p.x, p.y], [p.x + p.w, p.y + p.h]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** the engineer's title format: title over a line running to the numbered circle; scale and marks under the line */
function titleStrip(w: Writer, d: Detail, num: number, scale: string, cx: number, cy: number, bw: number) {
  const S = "S-ANNO-SYMB";
  const r = 0.15;
  const bx = cx + bw - 0.4;
  const ly = cy + 0.3;
  const avail = bx - r - cx - 0.45;
  let th = 0.16;
  let ls = wrap(d.title, Math.floor(avail / (0.75 * th)));
  while (ls.length > 2 && th > 0.09) ls = wrap(d.title, Math.floor(avail / (0.75 * (th -= 0.01))));
  ls.forEach((l, i) => w.text(S, cx + 0.25, ly + 0.05 + (ls.length - 1 - i) * 1.4 * th, th, l, { style: "HC-TITLE" }));
  w.line(S, cx + 0.25, ly, bx - r, ly);
  w.circle(S, bx, ly, r);
  w.text(S, bx, ly, 0.13, String(num), { center: true, style: "HC-TITLE" });
  wrap(`SCALE: ${scale}    AT: ${d.marks.join(", ")}`, Math.floor(avail / (ADV * 0.055)))
    .slice(0, 2)
    .forEach((l, i) => w.text(S, cx + 0.25, ly - 0.1 - i * 0.08, 0.055, l));
}

/** smallest plotted height for a calculated value written into a library detail, in. */
const MIN_TEXT = 0.06;
/**
 * one plotted height for every note on a detail sheet (library and generated details alike): 0.075 in.
 * in the 4 x 4 grid, up to 1.6 x that on sheets with larger boxes; set per sheet by detailsDxf
 */
let NOTE_H = 0.075;
/** cells for the large library details (columns, rows); others are sized from their note height */
const SPANS: Record<string, [number, number]> = {
  "shear-wall-section": [2, 1],
  "opening-framing": [2, 2],
};

interface Template {
  w: number;
  h: number;
  lines: number[][];
  hatch: number[][];
  tris: number[][];
  circles: number[][];
  blocks: Array<{ x: number; y: number; h: number; rot: number; ha: number; ls: number; lines: string[] }>;
}

/** one of the engineer's library details, fitted to the area, with the calculated notes swapped in */
function drawTemplate(w: Writer, tpl: NonNullable<Detail["tpl"]>, x: number, y: number, aw: number, ah: number) {
  const t = (TEMPLATES as unknown as Record<string, Template>)[tpl.id];
  if (!t) throw new Error(`Detail template ${tpl.id} is missing`);
  const k = Math.min(aw / t.w, ah / t.h);
  const ox = x + (aw - t.w * k) / 2;
  const oy = y + (ah - t.h * k) / 2;
  const P = (px: number, py: number): [number, number] => [ox + px * k, oy + py * k];
  for (const [a, b, c, d] of t.lines) w.line("S-DETL", ...P(a, b), ...P(c, d));
  for (const [a, b, c, d] of t.hatch) w.line("S-DETL-HATC", ...P(a, b), ...P(c, d));
  for (const q of t.tris) w.solid("S-DETL", [P(q[0], q[1]), P(q[2], q[3]), P(q[4], q[5])]);
  for (const [cx, cy, r] of t.circles) w.circle("S-DETL", ...P(cx, cy), r * k);
  const rules = tpl.text.map(
    ([key, v]) => [key.startsWith("#") ? Number(key.slice(1)) : new RegExp(key, "i"), v] as const,
  );
  for (const [bi, b] of t.blocks.entries()) {
    const hit = rules.find(([key]) => (typeof key === "number" ? key === bi : key.test(b.lines.join(" "))));
    if (hit && !hit[1]) continue;
    // every note plots at the one sheet note height; a calculated note keeps the library note's width and
    // may use the space down to the next note under it, then gets smaller text (not under 1/16 in.)
    const base = b.h * k;
    const width = Math.max(12, ...b.lines.map((l) => l.length)) * base;
    const below = t.blocks.filter((o) => o !== b && o.y < b.y && Math.abs(o.x - b.x) < 40).map((o) => o.y + 1.2 * o.h);
    const room = Math.max(b.lines.length, Math.floor((b.y - Math.max(-Infinity, ...below)) / b.ls));
    let hgt = NOTE_H;
    let lines = hit ? wrap(hit[1], Math.max(8, Math.floor(width / hgt))) : b.lines;
    if (hit && lines.length > room) {
      hgt = Math.max(MIN_TEXT, hgt * Math.sqrt(room / lines.length));
      lines = wrap(hit[1], Math.max(8, Math.floor(width / hgt)));
    }
    const f = hgt / base;
    const rad = (b.rot * Math.PI) / 180;
    lines.forEach((l, i) => {
      const [px, py] = P(b.x + Math.sin(rad) * i * b.ls * f, b.y - Math.cos(rad) * i * b.ls * f);
      w.text("S-ANNO-TEXT", px, py, b.h * k * f, l, { rot: b.rot, ha: b.ha, style: "HC-NOTE" });
    });
  }
}

/**
 * One detail in the cell with lower-left (cx, cy), drawn like the engineer's issued detail sheets:
 * plain concrete outline with solid bar dots, soil-block patches at grade, slanted capital
 * callouts on both sides with arrow leaders, "*" footnotes, circled number and large title.
 */
function drawDetail(w: Writer, d: Detail, num: number, cx: number, cy: number, bw: number, bh: number) {
  const O = "S-DETL";
  const HT = "S-DETL-HATC";
  const T = "S-ANNO-TEXT";
  const S = "S-ANNO-SYMB";
  const NOTE = { style: "HC-NOTE" };
  const band = GRID.band;
  if (d.tpl) {
    titleStrip(w, d, num, "N.T.S.", cx, cy, bw);
    drawTemplate(w, d.tpl, cx + 0.1, cy + band, bw - 0.2, bh - band - 0.1);
    return;
  }
  // drawing area in the middle, callouts left and right
  const colW = bw * 0.21;
  const ax = cx + colW + 0.1;
  const aw = bw - 2 * colW - 0.2;
  const fh = NOTE_H;
  const foot = (d.foot ?? []).flatMap((f) => wrap(`* ${f}`, Math.floor((bw - 0.3) / (ADV * fh))));
  const ay = cy + band + 0.12 + foot.length * 1.5 * fh + 0.1;
  const ah = cy + bh - 0.15 - ay;
  foot.forEach((l, i) => w.text(T, cx + 0.15, cy + band + 0.12 + (foot.length - 1 - i) * 1.5 * fh, fh, l, NOTE));
  const [x0, y0, x1, y1] = extent(d.prims);
  const pad = 1.5;
  const [spf, label] =
    SCALES.find(([s]) => ((x1 - x0 + 2 * pad) * s) / 12 <= aw && ((y1 - y0 + 2 * pad) * s) / 12 <= ah) ??
    SCALES[SCALES.length - 1];
  const k = spf / 12;
  titleStrip(w, d, num, label, cx, cy, bw);
  const ox = ax + aw / 2 - ((x0 + x1) / 2) * k;
  const oy = ay + ah / 2 - ((y0 + y1) / 2) * k;
  const P = (x: number, y: number): [number, number] => [ox + x * k, oy + y * k];
  const seg = (layer: string, a: [number, number], b: [number, number]) => w.line(layer, a[0], a[1], b[0], b[1]);
  const box = (x: number, y: number, ww: number, hh: number, layer = O) => {
    const [a, b] = [P(x, y), P(x + ww, y + hh)];
    w.rect(layer, a[0], a[1], b[0], b[1]);
    return [a, b] as const;
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const p of d.prims) {
    if (p.t === "line") seg(p.hidden ? "S-DETL-HIDN" : O, P(...p.a), P(...p.b));
    else if (p.t === "rect") box(p.x, p.y, p.w, p.h);
    else if (p.t === "conc") {
      // stippled concrete as on the engineer's details
      const [a, b] = box(p.x, p.y, p.w, p.h);
      const sp = 0.07;
      for (let x = a[0] + sp / 2; x < b[0] - 0.02; x += sp)
        for (let y = a[1] + sp / 2; y < b[1] - 0.02; y += sp) {
          const px = Math.min(b[0] - 0.03, x + (rnd() - 0.5) * sp * 0.7);
          const py = Math.min(b[1] - 0.03, y + (rnd() - 0.5) * sp * 0.7);
          if (rnd() < 0.3) {
            const z = 0.02;
            w.line(HT, px, py, px + z, py);
            w.line(HT, px + z, py, px + z / 2, py + z * 0.87);
            w.line(HT, px + z / 2, py + z * 0.87, px, py);
          } else w.line(HT, px, py, px + 0.004, py);
        }
    } else if (p.t === "wood") {
      const [a, b] = box(p.x, p.y, p.w, p.h);
      seg(O, a, b);
      seg(O, [a[0], b[1]], [b[0], a[1]]);
    } else if (p.t === "earth") {
      // grade line with a cross-hatched band of earth below it
      const [a, b] = [P(p.x1, p.y), P(p.x2, p.y)];
      seg(O, a, b);
      const dep = 0.1;
      for (let x = a[0] - dep; x < b[0]; x += 0.035) {
        // 45° down-right from (x, grade) and down-left from (x + dep, grade), clipped to [a, b]
        const s0 = Math.max(0, a[0] - x);
        const s1 = Math.min(dep, b[0] - x);
        if (s1 > s0) w.line(HT, x + s0, a[1] - s0, x + s1, a[1] - s1);
        const u0 = Math.max(0, x + dep - b[0]);
        const u1 = Math.min(dep, x + dep - a[0]);
        if (u1 > u0) w.line(HT, x + dep - u0, a[1] - u0, x + dep - u1, a[1] - u1);
      }
    } else if (p.t === "circle") {
      const c = P(...p.c);
      const r = p.r * k;
      if (p.r <= 0.5) {
        // reinforcing bar / nail: solid dot
        const q = Math.max(0.018, r);
        w.solid(O, [
          [c[0] - q, c[1] - q],
          [c[0] + q, c[1] - q],
          [c[0] + q, c[1] + q],
          [c[0] - q, c[1] + q],
        ]);
      } else w.circle(O, c[0], c[1], r);
    } else if (p.t === "dim") {
      const a = P(...p.a);
      const b = P(...p.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const n = [-u[1], u[0]];
      const o = Math.sign(p.off || 1) * Math.max(0.15, Math.abs(p.off * k));
      const A: [number, number] = [a[0] + n[0] * o, a[1] + n[1] * o];
      const B2: [number, number] = [b[0] + n[0] * o, b[1] + n[1] * o];
      const D = "S-ANNO-DIMS";
      const sg = Math.sign(o);
      for (const [q, Q] of [
        [a, A],
        [b, B2],
      ] as const)
        w.line(D, q[0] + n[0] * 0.04 * sg, q[1] + n[1] * 0.04 * sg, Q[0] + n[0] * 0.05 * sg, Q[1] + n[1] * 0.05 * sg);
      w.line(D, A[0], A[1], B2[0], B2[1]);
      for (const q of [A, B2])
        w.line(
          D,
          q[0] - 0.04 * (u[0] + n[0]),
          q[1] - 0.04 * (u[1] + n[1]),
          q[0] + 0.04 * (u[0] + n[0]),
          q[1] + 0.04 * (u[1] + n[1]),
        );
      let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      if (ang > 90.1 || ang <= -89.9) ang += 180;
      w.text(D, (A[0] + B2[0]) / 2 + n[0] * 0.07 * sg, (A[1] + B2[1]) / 2 + n[1] * 0.07 * sg, NOTE_H, p.text, {
        rot: ((ang % 360) + 360) % 360,
        center: true,
        style: "HC-NOTE",
      });
    }
  }
  // callouts on the side of the drawing nearer their target, each level with it, arrow leaders
  const midX = ax + aw / 2;
  const items = d.notes.map((n) => ({ ...n, p: P(...n.at) }));
  const sides = [items.filter((i) => i.p[0] < midX), items.filter((i) => i.p[0] >= midX)];
  // keep the two columns balanced
  while (sides[0].length > sides[1].length + 2)
    sides[1].push(
      sides[0].splice(
        sides[0].findIndex((i) => i.p[0] === Math.max(...sides[0].map((x) => x.p[0]))),
        1,
      )[0],
    );
  while (sides[1].length > sides[0].length + 2)
    sides[0].push(
      sides[1].splice(
        sides[1].findIndex((i) => i.p[0] === Math.min(...sides[1].map((x) => x.p[0]))),
        1,
      )[0],
    );
  const colTop = cy + bh - 0.15;
  const colBot = ay;
  let h = NOTE_H;
  const fit = (hh: number) =>
    sides.every(
      (sd) =>
        sd.reduce(
          (a, i) => a + wrap(i.text, Math.max(8, Math.floor((colW - 0.15) / (ADV * hh)))).length * 1.4 * hh + 0.5 * hh,
          0,
        ) <=
        colTop - colBot,
    );
  while (h > 0.06 && !fit(h)) h -= 0.005;
  const chars = Math.max(8, Math.floor((colW - 0.15) / (ADV * h)));
  sides.forEach((sd, si) => {
    sd.sort((p, q) => q.p[1] - p.p[1]);
    const blocks = sd.map((i) => wrap(i.text, chars));
    const hgt = blocks.map((ls) => ls.length * 1.4 * h + 0.5 * h);
    const tops = sd.map((i) => i.p[1] + 0.6 * h);
    for (let i = 0; i < tops.length; i++) tops[i] = Math.min(tops[i], i ? tops[i - 1] - hgt[i - 1] : colTop);
    let floor = colBot;
    for (let i = tops.length - 1; i >= 0; i--) {
      if (tops[i] - hgt[i] < floor) tops[i] = floor + hgt[i];
      floor = tops[i];
    }
    const left = si === 0;
    const tx0 = left ? cx + colW : cx + bw - colW + 0.05;
    blocks.forEach((ls, i) => {
      ls.forEach((l, j) => w.text(T, tx0, tops[i] - h - j * 1.4 * h, h, l, left ? { ...NOTE, right: true } : NOTE));
      const [px, py] = sd[i].p;
      const ly = tops[i] - 0.55 * h;
      const sx = left ? tx0 + 0.04 : tx0 - 0.04;
      const kx = left ? sx + 0.1 : sx - 0.1;
      w.line(T, sx, ly, kx, ly);
      w.line(T, kx, ly, px, py);
      const L2 = Math.hypot(kx - px, ly - py) || 1;
      const ux = (kx - px) / L2;
      const uy = (ly - py) / L2;
      w.solid(T, [
        [px, py],
        [px + 0.08 * ux - 0.022 * uy, py + 0.08 * uy + 0.022 * ux],
        [px + 0.08 * ux + 0.022 * uy, py + 0.08 * uy - 0.022 * ux],
      ]);
    });
  });
}

/** cells (columns, rows) a detail needs: a library detail whose notes would plot under ~1/16 in. in one cell takes two */
function spanOf(d: Detail, bw: number, bh: number): [number, number] {
  if (!d.tpl) return [1, 1];
  if (SPANS[d.tpl.id]) return SPANS[d.tpl.id];
  const t = (TEMPLATES as unknown as Record<string, Template>)[d.tpl.id];
  const hs = t.blocks.map((b) => b.h).sort((a, b) => a - b);
  const kNeed = 0.065 / (hs[Math.floor(hs.length / 4)] ?? 3);
  const cols = Math.min(2, Math.ceil((t.w * kNeed + 0.2) / bw));
  const rows = Math.min(2, Math.ceil((t.h * kNeed + GRID.band + 0.1) / bh));
  return [Math.max(1, cols), Math.max(1, rows)];
}

/**
 * Details sheets, title block as on the S0 sheet: one group of sheets per kind of detail, in the
 * engineer's order. Each group uses the smallest grid that holds it on one sheet (2 x 2 up to 4 x 3:
 * larger boxes, no empty sheet); a larger group fills 4 x 4 sheets.
 */
export function detailsDxf(details: Detail[], info: SheetInfo, sheetNo: string): string {
  const w = new Writer();
  const x1 = SH.w - SH.m - SH.tb - 0.25;
  // sheet numbers run on from sheetNo: SD-1, SD-2 …
  const m = /^(.*?)(\d+)$/.exec(sheetNo);
  const numberOf = (i: number) => (m ? `${m[1]}${Number(m[2]) + i}` : `${sheetNo}.${i + 1}`);
  type Item = { d: Detail; row: number; col: number; c: number; r: number };
  type Sheet = { title: string; cols: number; rows: number; used: boolean[][]; items: Item[] };
  const blank = (title: string, cols: number, rows: number): Sheet => ({
    title,
    cols,
    rows,
    used: Array.from({ length: rows }, () => Array<boolean>(cols).fill(false)),
    items: [],
  });
  /** packs the group row by row; spanning details take 2 cells; false when it needs more than maxSheets */
  const pack = (list: Sheet[], group: Detail[], title: string, cols: number, rows: number, maxSheets: number) => {
    const cw = (x1 - X0) / cols;
    const ch = (TOP - BOTTOM) / rows;
    for (const d of group) {
      const [c0, r0] = spanOf(d, cw, ch);
      const c = Math.min(c0, cols);
      const r = Math.min(r0, rows);
      let done = false;
      for (let k = 0; !done; k++) {
        if (k >= maxSheets) return false;
        const sh = (list[k] ??= blank(title, cols, rows));
        for (let row = 0; row + r <= rows && !done; row++)
          for (let col = 0; col + c <= cols && !done; col++) {
            let free = true;
            for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) free &&= !sh.used[row + i][col + j];
            if (!free) continue;
            for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) sh.used[row + i][col + j] = true;
            sh.items.push({ d, row, col, c, r });
            done = true;
          }
      }
    }
    return true;
  };
  const sheets: Sheet[] = [];
  for (const cat of Object.keys(DETAIL_SHEETS) as DetailCat[]) {
    const group = details.filter((d) => (d.cat ?? "wall") === cat);
    if (!group.length) continue;
    let placed: Sheet[] = [];
    for (const [cols, rows] of [
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ]) {
      placed = [];
      if (pack(placed, group, DETAIL_SHEETS[cat], cols, rows, 1)) break;
      placed = [];
    }
    if (!placed.length) pack(placed, group, DETAIL_SHEETS[cat], GRID.cols, GRID.rows, Infinity);
    sheets.push(...placed);
  }
  if (!sheets.length) sheets.push(blank("DETAILS", GRID.cols, GRID.rows));
  sheets.forEach((sh, k) => {
    const ox = k * (SH.w + 2);
    const bw = (x1 - X0) / sh.cols;
    const bh = (TOP - BOTTOM) / sh.rows;
    const base = ((x1 - X0) / GRID.cols) * ((TOP - BOTTOM) / GRID.rows);
    NOTE_H = 0.075 * Math.min(1.6, Math.max(1, Math.sqrt((bw * bh) / base)));
    titleBlock(w, ox, info, numberOf(k), sh.title);
    const cellBox = (col: number, row: number, c: number, r: number) => {
      const xa = ox + X0 + col * bw;
      const ya = TOP - (row + r) * bh;
      const pts: Array<[number, number]> = [
        [xa, ya],
        [xa + c * bw, ya],
        [xa + c * bw, ya + r * bh],
        [xa, ya + r * bh],
        [xa, ya],
      ];
      w.pline("S-ANNO-TTLB", pts, 0.025);
    };
    for (const p of sh.items) cellBox(p.col, p.row, p.c, p.r);
    for (let row = 0; row < sh.rows; row++)
      for (let col = 0; col < sh.cols; col++) if (!sh.used[row]?.[col]) cellBox(col, row, 1, 1);
    // number the details in reading order
    const order = [...sh.items].sort((a, b) => a.row - b.row || a.col - b.col);
    order.forEach((p, i) =>
      drawDetail(w, p.d, i + 1, ox + X0 + p.col * bw, TOP - (p.row + p.r) * bh, p.c * bw, p.r * bh),
    );
  });
  NOTE_H = 0.075;
  return dxfFile(w);
}
