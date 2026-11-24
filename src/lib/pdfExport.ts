/**
 * Calculation package → PDF (US Letter), drawn from the off-screen layout: every word at
 * the position the browser set it, cell borders as vector lines, diagrams as images.
 * Sheets break across pages between rows (never inside a row that fits on a page), the
 * title block repeats at the top of every page and a table's header repeats when the
 * table runs onto the next page; the footer carries "Project — Section", the revision
 * line and "Page n of N", as in the printed package. Text is real (searchable) text in
 * Liberation Sans, metric-compatible with Arial.
 */

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import regularUrl from "@/assets/fonts/LiberationSans-Regular.ttf?inline";
import boldUrl from "@/assets/fonts/LiberationSans-Bold.ttf?inline";
import italicUrl from "@/assets/fonts/LiberationSans-Italic.ttf?inline";
import boldItalicUrl from "@/assets/fonts/LiberationSans-BoldItalic.ttf?inline";
import type { SheetEntry } from "@/components/report/package";
import type { Project, ProjectDesign } from "@/engine/project";
import { PAGE, PX_PER_IN, cssColor, layoutPackage, svgToPng } from "./exportLayout";

const PT = 72 / PX_PER_IN; // pt per CSS px
const PAGE_W = PAGE.w * 72;
const PAGE_H = PAGE.h * 72;
const BODY_H_PX = (PAGE.h - PAGE.top - PAGE.bottom) * PX_PER_IN;
/** Liberation Sans / Arial: ascent and descent as a fraction of the font size */
const ASC = 0.905;
const DESC = 0.212;

type Col = { r: number; g: number; b: number; a: number };
type Prim =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w: number; c: Col }
  | { t: "rect"; x: number; y: number; w: number; h: number; c: Col }
  | {
      t: "text";
      x: number;
      y: number;
      top: number;
      bottom: number;
      s: string;
      size: number;
      font: number;
      c: Col;
      ls: number;
      /** laid-out width (single characters placed exactly) */
      w?: number;
    }
  | { t: "img"; x: number; y: number; w: number; h: number; key: number };

interface Band {
  y0: number;
  y1: number;
}

function bytesOf(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const fontIndex = (cs: CSSStyleDeclaration) =>
  (Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold" ? 1 : 0) + (/italic|oblique/.test(cs.fontStyle) ? 2 : 0);

/** Everything drawn on one sheet, in px relative to the sheet's top-left corner. */
function collect(sheet: HTMLElement, imgs: SVGSVGElement[], has: (cp: number) => boolean): Prim[] {
  const o = sheet.getBoundingClientRect();
  const out: Prim[] = [];
  const els = sheet.querySelectorAll<HTMLElement>("*");
  for (const el of els) {
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const x0 = r.left - o.left;
    const y0 = r.top - o.top;
    if (el instanceof SVGSVGElement) {
      out.push({ t: "img", x: x0, y: y0, w: r.width, h: r.height, key: imgs.push(el) - 1 });
      continue;
    }
    const bg = cssColor(cs.backgroundColor);
    if (bg && !(bg.r === 1 && bg.g === 1 && bg.b === 1))
      out.push({ t: "rect", x: x0, y: y0, w: r.width, h: r.height, c: bg });
    const side = (w: string, st: string, c: string) => {
      const width = parseFloat(w);
      const col = cssColor(c);
      return width > 0 && st !== "none" && st !== "hidden" && col ? { width, col } : null;
    };
    const t = side(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor);
    const b = side(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor);
    const l = side(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor);
    const rt = side(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor);
    const x1 = x0 + r.width;
    const y1 = y0 + r.height;
    // collapsed table borders are centred on the cell edges (neighbours then coincide)
    const collapsed =
      (el.tagName === "TD" || el.tagName === "TH") &&
      getComputedStyle(el.closest("table")!).borderCollapse === "collapse";
    const k = collapsed ? 0 : 0.5;
    if (t) out.push({ t: "line", x1: x0, y1: y0 + t.width * k, x2: x1, y2: y0 + t.width * k, w: t.width, c: t.col });
    if (b) out.push({ t: "line", x1: x0, y1: y1 - b.width * k, x2: x1, y2: y1 - b.width * k, w: b.width, c: b.col });
    if (l) out.push({ t: "line", x1: x0 + l.width * k, y1: y0, x2: x0 + l.width * k, y2: y1, w: l.width, c: l.col });
    if (rt)
      out.push({ t: "line", x1: x1 - rt.width * k, y1: y0, x2: x1 - rt.width * k, y2: y1, w: rt.width, c: rt.col });
    // list numbers / bullets (::marker is not in the DOM)
    if (el.tagName === "LI" && cs.display === "list-item") {
      const parent = el.parentElement!;
      const type = getComputedStyle(parent).listStyleType;
      const idx = Array.from(parent.children).indexOf(el) + 1;
      const marker = type === "decimal" ? `${idx}.` : type === "disc" ? "•" : "";
      if (marker) {
        const size = parseFloat(cs.fontSize);
        const top = firstLine(el) ?? y0;
        out.push({
          t: "text",
          x: x0 - size * 0.3,
          y: top + size * ASC,
          top,
          bottom: top + size * (ASC + DESC),
          s: marker,
          size,
          font: fontIndex(cs),
          c: cssColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 },
          ls: -1, // right-aligned at x
        });
      }
    }
  }
  // text, word by word
  const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    if (!text.trim()) continue;
    const parent = n.parentElement;
    if (!parent || parent.closest("svg,style,script")) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const size = parseFloat(cs.fontSize);
    const font = fontIndex(cs);
    const c = cssColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    const ls = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
    const upper = cs.textTransform === "uppercase";
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      // a word broken over two lines: place each piece by its own rect
      const pieces = rects.length === 1 ? [{ rect: rects[0], s: m[0] }] : splitWord(n as Text, m.index, m[0]);
      // a word with a glyph the font lacks (⊥, ⁻): place character by character so the
      // substitute drawn for that glyph keeps the browser's spacing
      const exact = [...m[0]].some((ch) => !has(ch.codePointAt(0)!));
      if (exact) {
        let off = m.index;
        for (const ch of m[0]) {
          range.setStart(n, off);
          range.setEnd(n, off + ch.length);
          off += ch.length;
          const rect = range.getBoundingClientRect();
          if (!rect.width) continue;
          const top = rect.top - o.top;
          out.push({
            t: "text",
            x: rect.left - o.left,
            y: top + rect.height * (ASC / (ASC + DESC)),
            top,
            bottom: top + rect.height,
            s: upper ? ch.toUpperCase() : ch,
            size,
            font,
            c,
            ls: 0,
            w: rect.width,
          });
        }
        continue;
      }
      for (const { rect, s } of pieces) {
        if (!rect.width) continue;
        const top = rect.top - o.top;
        const h = rect.height;
        const base = top + h * (ASC / (ASC + DESC));
        out.push({
          t: "text",
          x: rect.left - o.left,
          y: base,
          top,
          bottom: top + h,
          s: upper ? s.toUpperCase() : s,
          size,
          font,
          c,
          ls,
        });
      }
    }
  }
  return out;
}

function splitWord(n: Text, start: number, word: string) {
  const range = document.createRange();
  const out: Array<{ rect: DOMRect; s: string }> = [];
  let cur = "";
  let rect: DOMRect | undefined;
  for (let i = 0; i < word.length; i++) {
    range.setStart(n, start + i);
    range.setEnd(n, start + i + 1);
    const r = range.getBoundingClientRect();
    if (rect && Math.abs(r.top - rect.top) > 2) {
      out.push({ rect, s: cur });
      cur = "";
      rect = undefined;
    }
    if (!rect) {
      range.setStart(n, start + i);
      rect = r;
    }
    cur += word[i];
  }
  if (rect) {
    range.setStart(n, start + word.length - cur.length);
    range.setEnd(n, start + word.length);
    out.push({ rect: range.getBoundingClientRect(), s: cur });
  }
  return out;
}

function firstLine(el: HTMLElement): number | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const o = el.closest("article")!.getBoundingClientRect();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.nodeValue ?? "").trim()) continue;
    range.selectNodeContents(n);
    const r = range.getClientRects()[0];
    if (r) return r.top - o.top;
  }
  return null;
}

/** Page bands for one sheet's body: break between rows; keep headings with what follows. */
function paginate(sheet: HTMLElement): { head: Band; pages: Array<{ band: Band; repeat?: Band }> } {
  const o = sheet.getBoundingClientRect();
  const table = sheet.querySelector(":scope > table") as HTMLTableElement;
  const thead = table.tHead!.getBoundingClientRect();
  const head = { y0: thead.top - o.top, y1: thead.bottom - o.top };
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows).map((tr) => {
    const r = tr.getBoundingClientRect();
    return { tr, y0: r.top - o.top, y1: r.bottom - o.top, keep: tr.classList.contains("keep-next") };
  });
  const avail = BODY_H_PX - (head.y1 - head.y0);
  const end = rows.length ? rows[rows.length - 1].y1 : head.y1;
  const pages: Array<{ band: Band; repeat?: Band }> = [];
  let start = head.y1;
  let repeat: Band | undefined;
  while (end - start > 0.5) {
    const room = avail - (repeat ? repeat.y1 - repeat.y0 : 0);
    if (end - start <= room) {
      pages.push({ band: { y0: start, y1: end }, repeat });
      break;
    }
    const limit = start + room;
    // last row that ends on this page
    let i = rows.findIndex((r) => r.y1 > limit + 0.5);
    let cut: number;
    let nextRepeat: Band | undefined;
    // a long table / list row that does not fit runs on to the next page (as in print)
    const long = i >= 0 && rows[i].y1 - rows[i].y0 > avail * 0.3 && limit - rows[i].y0 > 60;
    if (i > 0 && rows[i].y0 > start + 0.5 && !long) {
      // keep section heads with the row that follows
      while (i > 0 && rows[i - 1].keep && rows[i - 1].y0 > start + 0.5) i -= 1;
      cut = rows[i].y0;
    } else {
      // a single row taller than the page: break inside it between nested rows / lines
      const row = rows[Math.max(0, i)];
      const inner = innerBreaks(row.tr, o.top).filter((y) => y > Math.max(start, row.y0) + 20 && y <= limit);
      cut = inner.length ? Math.max(...inner) : row.y0 > start + 0.5 ? row.y0 : limit;
      const t = Array.from(row.tr.querySelectorAll("table")).find((tb) => {
        const r = tb.getBoundingClientRect();
        return r.top - o.top < cut && r.bottom - o.top > cut;
      });
      if (t?.tHead) {
        const r = t.tHead.getBoundingClientRect();
        const hb = { y0: r.top - o.top, y1: r.bottom - o.top };
        if (hb.y1 <= cut) nextRepeat = hb;
      }
    }
    pages.push({ band: { y0: start, y1: cut }, repeat });
    start = cut;
    repeat = nextRepeat;
  }
  if (!pages.length) pages.push({ band: { y0: head.y1, y1: head.y1 } });
  return { head, pages };
}

function innerBreaks(tr: HTMLElement, top: number): number[] {
  const ys: number[] = [];
  for (const r of tr.querySelectorAll("tbody > tr, li, div, p")) ys.push(r.getBoundingClientRect().bottom - top);
  return ys;
}

export async function reportPdf(project: Project, design: ProjectDesign, entries: SheetEntry[]): Promise<Uint8Array> {
  const lay = await layoutPackage(project, design, entries);
  try {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const fonts: PDFFont[] = await Promise.all(
      [regularUrl, boldUrl, italicUrl, boldItalicUrl].map((u) => pdf.embedFont(bytesOf(u), { subset: true })),
    );
    const regular = charSet(fonts[0]);
    pdf.setTitle(`${project.info.name} — structural calculations`);
    pdf.setAuthor(project.info.preparedBy || "");
    pdf.setSubject(project.info.address || "");
    pdf.setCreator("HouseCalc");

    const plans = lay.sheets.map((sheet) => {
      const imgs: SVGSVGElement[] = [];
      const prims = collect(sheet, imgs, (cp) => regular.has(cp));
      return {
        sheet,
        prims,
        imgs,
        pag: paginate(sheet),
        left: sheet.dataset.footerLeft ?? "",
        center: sheet.dataset.footerCenter ?? "",
      };
    });
    const total = plans.reduce((n, p) => n + p.pag.pages.length, 0);
    let pageNo = 0;
    for (const plan of plans) {
      const images: PDFImage[] = [];
      for (const svg of plan.imgs) images.push(await pdf.embedPng((await svgToPng(svg)).png));
      for (const pg of plan.pag.pages) {
        pageNo += 1;
        const page = pdf.addPage([PAGE_W, PAGE_H]);
        let y = 0;
        const place = (band: Band) => {
          drawBand(page, plan.prims, images, fonts, band, y);
          y += band.y1 - band.y0;
        };
        place(plan.pag.head);
        if (pg.repeat) place(pg.repeat);
        place(pg.band);
        footer(page, fonts[0], plan.left, plan.center, `Page ${pageNo} of ${total}`);
      }
    }
    return await pdf.save();
  } finally {
    lay.done();
  }
}

/** Draws the primitives inside `band` with its top at `at` px below the top margin. */
function drawBand(page: PDFPage, prims: Prim[], images: PDFImage[], fonts: PDFFont[], band: Band, at: number) {
  const X = (px: number) => PAGE.left * 72 + px * PT;
  const Y = (px: number) => PAGE_H - PAGE.top * 72 - (px - band.y0 + at) * PT;
  const h = band.y1 - band.y0;
  if (h <= 0) return;
  page.pushOperators(
    pushGraphicsState(),
    rectangle(X(-2), Y(band.y1 + 0.75), (PAGE.w - PAGE.left - PAGE.right) * 72 + 4 * PT, (h + 1.5) * PT),
    clip(),
    endPath(),
  );
  for (const p of prims) {
    switch (p.t) {
      case "rect":
        if (p.y + p.h < band.y0 || p.y > band.y1) break;
        page.drawRectangle({
          x: X(p.x),
          y: Y(p.y + p.h),
          width: p.w * PT,
          height: p.h * PT,
          color: rgb(p.c.r, p.c.g, p.c.b),
          opacity: p.c.a,
        });
        break;
      case "line": {
        const lo = Math.min(p.y1, p.y2);
        const hi = Math.max(p.y1, p.y2);
        if (hi < band.y0 - 1 || lo > band.y1 + 1) break;
        page.drawLine({
          start: { x: X(p.x1), y: Y(p.y1) },
          end: { x: X(p.x2), y: Y(p.y2) },
          thickness: Math.max(0.5, p.w * PT),
          color: rgb(p.c.r, p.c.g, p.c.b),
          opacity: p.c.a,
        });
        break;
      }
      case "img":
        if (p.y + p.h <= band.y0 || p.y >= band.y1) break;
        page.drawImage(images[p.key], { x: X(p.x), y: Y(p.y + p.h), width: p.w * PT, height: p.h * PT });
        break;
      case "text": {
        const mid = (p.top + p.bottom) / 2;
        if (mid < band.y0 || mid >= band.y1) break;
        const font = fonts[p.font];
        const size = p.size * PT;
        const color = rgb(p.c.r, p.c.g, p.c.b);
        if (p.w !== undefined && !charSet(font).has(p.s.codePointAt(0)!)) {
          substitute(page, p.s, X(p.x), Y(p.y), p.w * PT, size, color);
          break;
        }
        const s = printable(font, p.s);
        if (p.ls === -1) {
          page.drawText(s, { x: X(p.x) - font.widthOfTextAtSize(s, size), y: Y(p.y), size, font, color });
        } else if (p.ls) {
          let x = X(p.x);
          for (const ch of s) {
            page.drawText(ch, { x, y: Y(p.y), size, font, color });
            x += font.widthOfTextAtSize(ch, size) + p.ls * PT;
          }
        } else page.drawText(s, { x: X(p.x), y: Y(p.y), size, font, color });
        break;
      }
    }
  }
  page.pushOperators(popGraphicsState());
}

/** Characters the font lacks are replaced so the PDF never carries blank glyphs. */
const SUBS: Record<string, string> = { "\u2009": " ", "\u202f": " ", "\u00a0": " ", "\u200b": "" };
const charSets = new WeakMap<PDFFont, Set<number>>();
function charSet(font: PDFFont): Set<number> {
  let set = charSets.get(font);
  if (!set) charSets.set(font, (set = new Set(font.getCharacterSet())));
  return set;
}
function printable(font: PDFFont, s: string): string {
  const set = charSet(font);
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (set.has(cp)) out += ch;
    else if (ch in SUBS) out += SUBS[ch];
    else out += "?";
  }
  return out;
}

/** Glyphs Liberation Sans lacks, drawn as lines in the width the browser gave them. */
function substitute(
  page: PDFPage,
  ch: string,
  x: number,
  y: number,
  w: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const t = Math.max(0.4, size * 0.07);
  if (ch === "\u22a5") {
    // ⊥ (perpendicular): stem and base
    const cx = x + w / 2;
    const half = Math.min(w * 0.42, size * 0.3);
    page.drawLine({ start: { x: cx - half, y: y + t / 2 }, end: { x: cx + half, y: y + t / 2 }, thickness: t, color });
    page.drawLine({ start: { x: cx, y }, end: { x: cx, y: y + size * 0.68 }, thickness: t, color });
  } else if (ch === "\u207b" || ch === "\u2212") {
    // superscript minus / minus sign
    const yy = ch === "\u207b" ? y + size * 0.62 : y + size * 0.3;
    page.drawLine({ start: { x: x + w * 0.12, y: yy }, end: { x: x + w * 0.88, y: yy }, thickness: t, color });
  } else {
    page.drawRectangle({ x: x + w * 0.15, y, width: w * 0.7, height: size * 0.65, borderColor: color, borderWidth: t });
  }
}

function footer(page: PDFPage, font: PDFFont, left: string, center: string, right: string) {
  const size = 8;
  const y = PAGE.bottom * 72 - 0.4 * 72;
  const x0 = PAGE.left * 72;
  const x1 = PAGE_W - PAGE.right * 72;
  const black = rgb(0, 0, 0);
  const l = printable(font, left);
  const c = printable(font, center);
  const r = printable(font, right);
  page.drawText(l, { x: x0, y, size, font, color: black });
  const lw = font.widthOfTextAtSize(l, size);
  const cx = Math.max((x0 + x1) / 2 - font.widthOfTextAtSize(c, size) / 2, x0 + lw + 14);
  page.drawText(c, { x: cx, y, size, font, color: black });
  page.drawText(r, { x: x1 - font.widthOfTextAtSize(r, 9), y, size: 9, font, color: black });
}
