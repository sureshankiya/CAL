/**
 * Calculation package → Word (.docx), built from the off-screen layout. Each sheet is a
 * section: the title block is the page header (it repeats on every page, as in print),
 * the footer carries "Project — Section", the revision line and "Page n of N", and the
 * sheet body is a borderless two-column table (description | expression) with the data
 * tables nested in it. Column widths, borders, padding, fonts and emphasis are taken from
 * the browser layout; diagrams are embedded as images. The result is an editable Word
 * document in Arial, ready to add to a calculation package.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  type ParagraphChild,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
} from "docx";
import type { SheetEntry } from "@/components/report/package";
import type { Project, ProjectDesign } from "@/engine/project";
import { PAGE, PX_PER_IN, cssColor, hexOf, layoutPackage, svgToPng } from "./exportLayout";

const TW = 1440 / PX_PER_IN; // twips per CSS px
const tw = (px: number) => Math.max(0, Math.round(px * TW));
const TEXT_W_TW = Math.round((PAGE.w - PAGE.left - PAGE.right) * 1440);
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

type Block = Paragraph | Table;
type Pngs = Map<Element, { png: Uint8Array; w: number; h: number }>;
interface RunSpec {
  text?: string;
  br?: boolean;
  img?: { png: Uint8Array; w: number; h: number };
  bold: boolean;
  italics: boolean;
  size: number;
  color: string;
  sub: boolean;
  sup: boolean;
  caps: boolean;
  spacing: number;
}
interface ParaProps {
  align: (typeof AlignmentType)[keyof typeof AlignmentType];
  before: number;
  after: number;
  line: number;
  keepNext: boolean;
  indent?: { left: number; hanging: number };
  prefix?: string;
  borderTop?: { size: number; color: string };
}

const isBlock = (cs: CSSStyleDeclaration) => !/^inline/.test(cs.display) && cs.display !== "contents";

function alignOf(cs: CSSStyleDeclaration) {
  return cs.textAlign === "center"
    ? AlignmentType.CENTER
    : cs.textAlign === "right" || cs.textAlign === "end"
      ? AlignmentType.RIGHT
      : AlignmentType.LEFT;
}

function lineOf(cs: CSSStyleDeclaration) {
  const fs = parseFloat(cs.fontSize) || 13;
  const lh = parseFloat(cs.lineHeight);
  const ratio = Number.isFinite(lh) ? lh / (fs * 1.15) : 1;
  return Math.round(240 * Math.min(1.3, Math.max(1, ratio)));
}

function runOf(el: Element, extra: Partial<RunSpec>): RunSpec {
  const cs = getComputedStyle(el);
  const c = cssColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
  return {
    bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold",
    italics: /italic|oblique/.test(cs.fontStyle),
    size: Math.max(2, Math.round(parseFloat(cs.fontSize) * 0.75 * 2)),
    color: hexOf(c),
    sub: !!el.closest("sub"),
    sup: !!el.closest("sup"),
    caps: cs.textTransform === "uppercase",
    spacing: cs.letterSpacing === "normal" ? 0 : Math.round((parseFloat(cs.letterSpacing) || 0) * 0.75 * 20),
    ...extra,
  };
}

function textRun(r: RunSpec): ParagraphChild {
  if (r.img)
    return new ImageRun({
      type: "png",
      data: r.img.png,
      transformation: { width: Math.round(r.img.w), height: Math.round(r.img.h) },
    });
  return new TextRun({
    text: r.text ?? "",
    break: r.br ? 1 : undefined,
    bold: r.bold,
    italics: r.italics,
    size: r.size,
    color: r.color,
    font: "Arial",
    subScript: r.sub && !r.sup ? true : undefined,
    superScript: r.sup ? true : undefined,
    allCaps: r.caps || undefined,
    characterSpacing: r.spacing || undefined,
  });
}

function paragraph(runs: RunSpec[], p: ParaProps): Paragraph {
  // collapse white space as the browser does: no leading / trailing space on the line
  const rs = runs.map((r) => ({ ...r }));
  const texts = rs.filter((r) => r.text !== undefined);
  if (texts.length) {
    texts[0].text = texts[0].text!.replace(/^\s+/, "");
    const last = texts[texts.length - 1];
    last.text = last.text!.replace(/\s+$/, "");
  }
  for (let i = 1; i < rs.length; i++)
    if (rs[i].text?.startsWith(" ") && (rs[i - 1].text?.endsWith(" ") || rs[i - 1].br))
      rs[i].text = rs[i].text!.slice(1);
  const children: ParagraphChild[] = [];
  if (p.prefix) children.push(new TextRun({ text: p.prefix, font: "Arial", size: rs[0]?.size ?? 19 }));
  for (const r of rs) if (r.text !== "" || r.br || r.img) children.push(textRun(r));
  return new Paragraph({
    children,
    alignment: p.align,
    spacing: { before: p.before, after: p.after, line: p.line },
    keepNext: p.keepNext || undefined,
    indent: p.indent,
    border: p.borderTop
      ? { top: { style: BorderStyle.SINGLE, size: p.borderTop.size, color: p.borderTop.color, space: 1 } }
      : undefined,
  });
}

function borderOf(width: string, style: string, color: string) {
  const w = parseFloat(width);
  const c = cssColor(color);
  if (!(w > 0) || style === "none" || style === "hidden" || !c) return NONE;
  // 1 px → ½ pt hairline; size in eighths of a point
  const shade = { r: 1 - c.a * (1 - c.r), g: 1 - c.a * (1 - c.g), b: 1 - c.a * (1 - c.b) };
  return { style: BorderStyle.SINGLE, size: Math.max(4, Math.round(w * 0.75 * 8)), color: hexOf(shade) };
}

function cellBorders(cs: CSSStyleDeclaration) {
  return {
    top: borderOf(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor),
    bottom: borderOf(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor),
    left: borderOf(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor),
    right: borderOf(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor),
  };
}

/** Column boundaries (px) from the laid-out left / right edges of the given boxes. */
function gridOf(boxes: DOMRect[], x0: number, x1: number): number[] {
  const xs = [x0, x1, ...boxes.flatMap((b) => [b.left, b.right])].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of xs)
    if (!out.length || x - out[out.length - 1] > 2) out.push(x);
    else out[out.length - 1] = Math.max(out[out.length - 1], x);
  return out;
}
const colAt = (grid: number[], x: number) => {
  let best = 0;
  for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - x) < Math.abs(grid[best] - x)) best = i;
  return best;
};

/** The block content of an element as Word paragraphs and tables. */
function blocksOf(el: Element, pngs: Pngs, base?: Partial<ParaProps>): Block[] {
  const out: Block[] = [];
  const cs = getComputedStyle(el);
  const props: ParaProps = {
    align: alignOf(cs),
    before: 0,
    after: 0,
    line: lineOf(cs),
    keepNext: !!el.closest("tr.keep-next"),
    ...base,
  };
  let runs: RunSpec[] = [];
  let first = true;
  const flush = (force = false) => {
    if (runs.some((r) => (r.text ?? "").trim() || r.br || r.img) || force) {
      out.push(paragraph(runs, first ? props : { ...props, before: 0, prefix: undefined, borderTop: undefined }));
      first = false;
    }
    runs = [];
  };
  const inline = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.nodeValue ?? "").replace(/\s+/g, " ");
      if (t) runs.push(runOf(node.parentElement!, { text: t }));
      return;
    }
    if (!(node instanceof Element)) return;
    const ccs = getComputedStyle(node);
    if (ccs.display === "none" || node.tagName === "STYLE") return;
    if (node.tagName === "BR") {
      runs.push(runOf(node, { br: true }));
      return;
    }
    if (node instanceof SVGSVGElement) {
      const img = pngs.get(node);
      if (img) {
        flush();
        runs.push(runOf(node, { img }));
        flush();
      }
      return;
    }
    if (node.tagName === "TABLE") {
      flush();
      out.push(tableOf(node as HTMLTableElement, pngs));
      return;
    }
    if (isBlock(ccs)) {
      flush();
      out.push(...blockOf(node, ccs, pngs));
      return;
    }
    node.childNodes.forEach(inline);
  };
  el.childNodes.forEach(inline);
  flush();
  return out;
}

function blockOf(node: Element, cs: CSSStyleDeclaration, pngs: Pngs): Block[] {
  const kids = Array.from(node.children).filter((k) => getComputedStyle(k).display !== "none");
  // grid / flex rows → a borderless layout table
  if ((cs.display === "grid" || (cs.display === "flex" && cs.flexDirection.startsWith("row"))) && kids.length > 1) {
    const mt = parseFloat(cs.marginTop) || 0;
    const t = layoutTable(node, kids, pngs);
    return mt > 0
      ? [
          new Paragraph({
            spacing: { before: tw(mt), after: 0, line: 240 },
            children: [new TextRun({ text: "", size: 2 })],
          }),
          t,
        ]
      : [t];
  }
  const top = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none";
  const all =
    top &&
    parseFloat(cs.borderBottomWidth) > 0 &&
    parseFloat(cs.borderLeftWidth) > 0 &&
    parseFloat(cs.borderRightWidth) > 0;
  if (all) return [layoutTable(node, [node], pngs)];
  const base: Partial<ParaProps> = {
    align: alignOf(cs),
    before: tw(parseFloat(cs.marginTop) || 0),
    after: tw(parseFloat(cs.marginBottom) || 0),
    line: lineOf(cs),
  };
  if (top) {
    const b = borderOf(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor);
    base.borderTop = { size: b.size, color: b.color };
  }
  if (node.tagName === "LI") {
    const list = node.parentElement!;
    const lcs = getComputedStyle(list);
    const n = Array.from(list.children).indexOf(node) + 1;
    const pad = tw(parseFloat(lcs.paddingLeft) || 20);
    base.indent = { left: pad, hanging: pad };
    base.prefix = lcs.listStyleType === "decimal" ? `${n}.\t` : lcs.listStyleType === "disc" ? "•\t" : undefined;
  }
  const blocks = blocksOf(node, pngs, base);
  if (!blocks.length && base.borderTop)
    return [
      paragraph([], {
        align: AlignmentType.LEFT,
        before: base.before!,
        after: 0,
        line: 240,
        keepNext: false,
        borderTop: base.borderTop,
      }),
    ];
  return blocks;
}

/** Children of a grid / flex box, or one bordered box, as a table of cells at their laid-out positions. */
function layoutTable(box: Element, items: Element[], pngs: Pngs): Table {
  const br = box.getBoundingClientRect();
  const rects = items.map((k) => k.getBoundingClientRect());
  const grid = gridOf(rects, br.left, br.right);
  const widths = grid.slice(1).map((x, i) => tw(x - grid[i]));
  const rowsByTop: Array<{ top: number; items: number[] }> = [];
  rects.forEach((r, i) => {
    const row = rowsByTop.find((g) => Math.abs(g.top - r.top) < 3);
    if (row) row.items.push(i);
    else rowsByTop.push({ top: r.top, items: [i] });
  });
  const rows = rowsByTop.map((g, gi) => {
    const cells: TableCell[] = [];
    let col = 0;
    let h = 0;
    for (const i of g.items.sort((a, b) => rects[a].left - rects[b].left)) {
      const c0 = colAt(grid, rects[i].left);
      const c1 = Math.max(c0 + 1, colAt(grid, rects[i].right));
      if (c0 > col) cells.push(emptyCell(widths.slice(col, c0)));
      const cs = getComputedStyle(items[i]);
      // the item's own borders go on the cell, so its content is read without them
      const content = blocksOf(
        items[i],
        pngs,
        cs.justifyContent === "center" || cs.alignItems === "center" ? { align: AlignmentType.CENTER } : undefined,
      );
      cells.push(
        new TableCell({
          children: content.length ? content : [new Paragraph({})],
          columnSpan: c1 - c0 > 1 ? c1 - c0 : undefined,
          width: { size: widths.slice(c0, c1).reduce((a, b) => a + b, 0), type: WidthType.DXA },
          borders: cellBorders(cs),
          verticalAlign: cs.alignItems === "center" ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP,
          margins: {
            top: tw(parseFloat(cs.paddingTop) || 0),
            bottom: tw(parseFloat(cs.paddingBottom) || 0),
            left: 0,
            right: 0,
          },
        }),
      );
      // row pitch includes the grid gap down to the next row
      const next = rowsByTop[gi + 1]?.top;
      h = Math.max(h, next !== undefined ? next - g.top : rects[i].height);
      col = c1;
    }
    if (col < widths.length) cells.push(emptyCell(widths.slice(col)));
    return new TableRow({ children: cells, cantSplit: true, height: { value: tw(h), rule: HeightRule.ATLEAST } });
  });
  return new Table({
    rows,
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
  });
}

const emptyCell = (w: number[]) =>
  new TableCell({
    children: [new Paragraph({})],
    columnSpan: w.length > 1 ? w.length : undefined,
    width: { size: w.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
  });

/** An HTML table at its laid-out column widths (colspan / rowspan kept). */
function tableOf(table: HTMLTableElement, pngs: Pngs, skipHead = false): Table {
  const tr = table.getBoundingClientRect();
  const all = Array.from(table.rows).filter((r) => !(skipHead && r.parentElement?.tagName === "THEAD"));
  const cellRects = all.flatMap((r) => Array.from(r.cells).map((c) => c.getBoundingClientRect()));
  const grid = gridOf(cellRects, tr.left, tr.right);
  const widths = grid.slice(1).map((x, i) => tw(x - grid[i]));
  const rows = all.map((row) => {
    const rr = row.getBoundingClientRect();
    const head = row.parentElement?.tagName === "THEAD";
    const cells = Array.from(row.cells).map((cell) => {
      const r = cell.getBoundingClientRect();
      const c0 = colAt(grid, r.left);
      const c1 = Math.max(c0 + 1, colAt(grid, r.right));
      const cs = getComputedStyle(cell);
      const content = blocksOf(cell, pngs);
      return new TableCell({
        children: content.length ? content : [new Paragraph({})],
        columnSpan: c1 - c0 > 1 ? c1 - c0 : undefined,
        rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
        width: { size: widths.slice(c0, c1).reduce((a, b) => a + b, 0), type: WidthType.DXA },
        borders: cellBorders(cs),
        margins: {
          top: tw(parseFloat(cs.paddingTop) || 0),
          bottom: tw(parseFloat(cs.paddingBottom) || 0),
          left: tw(parseFloat(cs.paddingLeft) || 0),
          right: tw(parseFloat(cs.paddingRight) || 0),
        },
        verticalAlign:
          cs.verticalAlign === "middle"
            ? VerticalAlignTable.CENTER
            : cs.verticalAlign === "bottom"
              ? VerticalAlignTable.BOTTOM
              : VerticalAlignTable.TOP,
      });
    });
    return new TableRow({
      children: cells,
      tableHeader: head || undefined,
      // keep a row on one page when it fits on one (taller rows must be allowed to break)
      cantSplit: rr.height < 7 * PX_PER_IN ? true : undefined,
    });
  });
  return new Table({
    rows,
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
  });
}

function footerOf(left: string, center: string): Footer {
  const run = (text: string) => new TextRun({ text, font: "Arial", size: 16 });
  const cell = (children: Paragraph[], w: number) =>
    new TableCell({
      children,
      width: { size: w, type: WidthType.DXA },
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    });
  const w = [Math.round(TEXT_W_TW * 0.36), Math.round(TEXT_W_TW * 0.48), 0];
  w[2] = TEXT_W_TW - w[0] - w[1];
  return new Footer({
    children: [
      new Table({
        columnWidths: w,
        width: { size: TEXT_W_TW, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              cell([new Paragraph({ children: [run(left)] })], w[0]),
              cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [run(center)] })], w[1]),
              cell(
                [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                        font: "Arial",
                        size: 18,
                      }),
                    ],
                  }),
                ],
                w[2],
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

export async function reportDocx(project: Project, design: ProjectDesign, entries: SheetEntry[]): Promise<Blob> {
  const lay = await layoutPackage(project, design, entries);
  try {
    const pngs: Pngs = new Map();
    for (const sheet of lay.sheets)
      for (const svg of sheet.querySelectorAll("svg")) pngs.set(svg, await svgToPng(svg, 2));
    const sections = lay.sheets.map((sheet) => {
      const table = sheet.querySelector(":scope > table") as HTMLTableElement;
      const titleBlock = table.tHead?.querySelector("table") as HTMLTableElement | null;
      return {
        properties: {
          page: {
            size: { width: PAGE.w * 1440, height: PAGE.h * 1440 },
            margin: {
              top: Math.round(PAGE.top * 1440),
              right: Math.round(PAGE.right * 1440),
              bottom: Math.round(PAGE.bottom * 1440),
              left: Math.round(PAGE.left * 1440),
              header: Math.round(0.35 * 1440),
              footer: Math.round(0.3 * 1440),
            },
          },
        },
        headers: {
          default: new Header({
            children: titleBlock
              ? [tableOf(titleBlock, pngs), new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })]
              : [new Paragraph({})],
          }),
        },
        footers: { default: footerOf(sheet.dataset.footerLeft ?? "", sheet.dataset.footerCenter ?? "") },
        children: [tableOf(table, pngs, true)],
      };
    });
    const doc = new Document({
      creator: project.info.preparedBy || "HouseCalc",
      title: `${project.info.name} — structural calculations`,
      description: project.info.address || undefined,
      styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
      sections,
    });
    return await Packer.toBlob(doc);
  } finally {
    lay.done();
  }
}
