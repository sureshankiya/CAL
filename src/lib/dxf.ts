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
  /** rot: degrees; center: x, y is the middle-centre of the text (TEXT 72 = 1, 73 = 2) */
  text(layer: string, x: number, y: number, h: number, s: string, o: { rot?: number; center?: boolean } = {}) {
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
    if (o.center) this.out.push("72", "1", "73", "2", "11", at[0], "21", at[1], "31", "0");
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

function titleBlock(w: Writer, ox: number, info: SheetInfo, sheetNo: string) {
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
  box(0.75, "SHEET TITLE", (top) => w.text(B, x0 + SH.tb / 2, top - 0.48, 0.16, "GENERAL NOTES", { center: true }));
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
  w.text(B, x0 + SH.tb / 2, SH.m + 0.75, 0.55, sheetNo, { center: true });
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
