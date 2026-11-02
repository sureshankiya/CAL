import { fmt, fmtFtIn, fmtInFraction } from "@/engine/core/fmt";
import { nailDef } from "@/engine/design/dowel";
import type { PlyConnectionInput } from "@/engine/design/plies";
import type { AnyResult, Project, ProjectDesign } from "@/engine/project";

/**
 * Typical details generated from the calculations: one detail per distinct designed condition,
 * drawn at full size (inches) and scaled onto the sheet by the DXF writer. Only members and
 * callouts that the calculation report checks are drawn — nothing is added "typical".
 */

export type Pt = [number, number];
export type Prim =
  | { t: "line"; a: Pt; b: Pt; hidden?: boolean }
  | { t: "rect"; x: number; y: number; w: number; h: number }
  /** wood member in section (rectangle with a cross) */
  | { t: "wood"; x: number; y: number; w: number; h: number }
  /** concrete (outline with stipple) */
  | { t: "conc"; x: number; y: number; w: number; h: number }
  /** finish grade with earth hatch below */
  | { t: "earth"; x1: number; x2: number; y: number }
  | { t: "circle"; c: Pt; r: number }
  | { t: "dim"; a: Pt; b: Pt; off: number; text: string };

export interface Detail {
  title: string;
  marks: string[];
  prims: Prim[];
  /** callouts with a leader to the point they describe */
  notes: Array<{ text: string; at: Pt }>;
  /** "*" footnotes under the drawing */
  foot?: string[];
  /**
   * one of the engineer's library details (detailTemplates.json) drawn as issued, N.T.S.; each
   * pair is [pattern matching a note's text, or "#n" for the template's n-th note, replacement
   * from the calculations ("" removes the note)]
   */
  tpl?: { id: string; text: Array<[string, string]> };
}

const inch = (v: number) => `${fmtInFraction(v)}"`;
const up = (s: string) => s.toUpperCase();
/** dressed size of a nominal sawn size "2x10" → [1.5, 9.25] */
export function dressed(size: string): [number, number] {
  const m = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i.exec(size);
  if (!m) return [3.5, 11.25];
  const n = [Number(m[1]), Number(m[2])];
  const timber = n[0] >= 5 && n[1] >= 5;
  const d = (x: number) => (x <= 1 ? 0.75 : timber || x < 7 ? x - 0.5 : x - 0.75);
  return [d(n[0]), d(n[1])];
}

class Draw {
  prims: Prim[] = [];
  notes: Detail["notes"] = [];
  foot: string[] = [];
  line(a: Pt, b: Pt, hidden = false) {
    this.prims.push({ t: "line", a, b, hidden });
  }
  rect(x: number, y: number, w: number, h: number) {
    this.prims.push({ t: "rect", x, y, w, h });
  }
  wood(x: number, y: number, w: number, h: number) {
    this.prims.push({ t: "wood", x, y, w, h });
  }
  conc(x: number, y: number, w: number, h: number) {
    this.prims.push({ t: "conc", x, y, w, h });
  }
  earth(x1: number, x2: number, y = 0) {
    if (x2 > x1) this.prims.push({ t: "earth", x1, x2, y });
  }
  circle(c: Pt, r: number) {
    this.prims.push({ t: "circle", c, r });
  }
  dim(a: Pt, b: Pt, off: number, text: string) {
    this.prims.push({ t: "dim", a, b, off, text });
  }
  note(text: string, at: Pt) {
    this.notes.push({ text: up(text), at });
  }
  /** vertical anchor bolt / rod from y1 down to y2 with a hook or head at the bottom */
  anchor(x: number, y1: number, y2: number, d: number, end: "hook" | "head" | "none" = "head") {
    this.line([x - d / 2, y1], [x - d / 2, y2]);
    this.line([x + d / 2, y1], [x + d / 2, y2]);
    if (end === "hook") this.line([x - d / 2, y2], [x + 3, y2]);
    if (end === "head") this.rect(x - d, y2 - d / 2, 2 * d, d / 2);
  }
  /** stud wall in elevation between y1 and y2 (studs as vertical lines) */
  studs(x1: number, x2: number, y1: number, y2: number, s: number, b = 1.5) {
    for (let x = x1; x <= x2 - b + 1e-6; x += s) this.rect(x, y1, b, y2 - y1);
  }
  footnote(text: string) {
    this.foot.push(up(text));
  }
  done(title: string, mark: string): Detail {
    return { title: up(title), marks: [mark], prims: this.prims, notes: this.notes, foot: this.foot };
  }
}

const plyText = (c: PlyConnectionInput) =>
  c.fastener === "nail"
    ? `${c.rows} rows ${nailDef(c.nail ?? "16d-common").label} @ ${fmt(c.spacing, 0)}" o.c., staggered`
    : `${c.rows} rows ${inch(c.boltDia ?? 0.5)} dia. through-bolts w/ washers @ ${fmt(c.spacing, 0)}" o.c., staggered`;

type R<K extends AnyResult["kind"]> = Extract<AnyResult, { kind: K }>;

/* ------------------------------------------------------------------ drawing kit (full-size inches) */

/** zig-zag break line from a to b (member cut by the detail boundary) */
function brk(D: Draw, a: Pt, b: Pt) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Pt = [-u[1], u[0]];
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const z = Math.min(1.2, L / 5);
  const p = (s: number, o: number): Pt => [m[0] + u[0] * s + n[0] * o, m[1] + u[1] * s + n[1] * o];
  D.line(a, p(-z, 0));
  D.line(p(-z, 0), p(-z / 3, 1.4 * z));
  D.line(p(-z / 3, 1.4 * z), p(z / 3, -1.4 * z));
  D.line(p(z / 3, -1.4 * z), p(z, 0));
  D.line(p(z, 0), b);
}

/** rectangle whose listed sides are cut (break lines) */
function cut(D: Draw, x: number, y: number, w: number, h: number, sides: string) {
  const c = {
    b: [
      [x, y],
      [x + w, y],
    ],
    r: [
      [x + w, y],
      [x + w, y + h],
    ],
    t: [
      [x + w, y + h],
      [x, y + h],
    ],
    l: [
      [x, y + h],
      [x, y],
    ],
  } as Record<string, [Pt, Pt]>;
  for (const k of ["b", "r", "t", "l"])
    (sides.includes(k) ? brk : (d: Draw, a: Pt, b: Pt) => d.line(a, b))(D, c[k][0], c[k][1]);
}

/** stud wall in section under y = top: plates (wood X), stud face, sheathing outside (x side), gypsum inside */
function wallBelow(
  D: Draw,
  x: number,
  top: number,
  d: number,
  o: { plates?: number; h?: number; sheath?: boolean; gyp?: boolean } = {},
) {
  const n = o.plates ?? 2;
  const h = o.h ?? 30;
  for (let i = 0; i < n; i++) D.wood(x, top - 1.5 * (i + 1), d, 1.5);
  const y0 = top - 1.5 * n - h;
  cut(D, x, y0, d, h, "b");
  if (o.sheath ?? true) cut(D, x - 0.5, y0, 0.5, h + 1.5 * n, "b");
  if (o.gyp ?? true) cut(D, x + d, y0, 0.5, h, "b");
  return y0;
}

/** stud wall in section over y = base: sole plate(s), stud, sheathing, gypsum */
function wallAbove(
  D: Draw,
  x: number,
  base: number,
  d: number,
  o: { plates?: number; h?: number; sheath?: boolean; gyp?: boolean } = {},
) {
  const n = o.plates ?? 1;
  const h = o.h ?? 24;
  for (let i = 0; i < n; i++) D.wood(x, base + 1.5 * i, d, 1.5);
  cut(D, x, base + 1.5 * n, d, h, "t");
  if (o.sheath ?? true) cut(D, x - 0.5, base, 0.5, h + 1.5 * n, "t");
  if (o.gyp ?? true) cut(D, x + d, base + 1.5 * n, 0.5, h, "t");
}

/** sheathing / subfloor strip on top of y from x1 to x2 with nails at spacing */
function deck(D: Draw, x1: number, x2: number, y: number, t = 0.75, nailAt?: number[]) {
  cut(D, x1, y, x2 - x1, t, "r");
  for (const x of nailAt ?? []) D.line([x, y + t + 0.4], [x, y - 1.6]);
}

/** member along a slope: bottom edge from a, run to x2, vertical depth dv, plumb ends; cut at the far end */
function sloped(D: Draw, a: Pt, x2: number, slope: number, dv: number, cutEnd = true) {
  const yb = (x: number) => a[1] + slope * (x - a[0]);
  D.line(a, [x2, yb(x2)]);
  D.line([a[0], a[1] + dv], [x2, yb(x2) + dv]);
  D.line(a, [a[0], a[1] + dv]);
  (cutEnd ? brk : (d: Draw, p: Pt, q: Pt) => d.line(p, q))(D, [x2, yb(x2)], [x2, yb(x2) + dv]);
}

/** joist hanger outline around the end of a member of depth h bearing at x (facing +x) */
function hangerShape(D: Draw, x: number, y: number, h: number) {
  D.line([x, y - 0.3], [x + 2.5, y - 0.3]);
  D.line([x + 2.5, y - 0.3], [x + 2.5, y + h * 0.8]);
  D.line([x, y + h * 0.85], [x, y - 0.3]);
  for (let k = 1; k < 4; k++) D.circle([x + 1.6, y + (k * h * 0.75) / 4], 0.2);
}

/** bolt seen from the side: shank, washer and nut each end */
function boltSide(D: Draw, x1: number, x2: number, y: number, d: number) {
  D.line([x1, y - d / 2], [x2, y - d / 2]);
  D.line([x1, y + d / 2], [x2, y + d / 2]);
  for (const x of [x1, x2]) D.rect(x - (x === x1 ? 0.6 : 0), y - 1.2 * d, 0.6, 2.4 * d);
}

/* ------------------------------------------------------------------ foundations */

function stripSection(o: {
  B: number;
  h: number;
  depth: number;
  stem?: { width: number; height: number };
  wall: number;
  long?: { size: string; top: number; bottom: number };
  trans?: { size: string; spacing?: number };
  cover: number;
  fc: number;
  qa: number;
  what: string;
}): Draw {
  const D = new Draw();
  const { B, h, depth, cover } = o;
  const top = -depth + h;
  D.conc(-B / 2, -depth, B, h);
  let wallY = top;
  const sw = o.stem?.width ?? o.wall;
  if (o.stem) {
    D.conc(-sw / 2, top, sw, o.stem.height);
    wallY = top + o.stem.height;
    D.dim([-sw / 2, wallY], [sw / 2, wallY], 4, inch(sw));
    D.dim([sw / 2, top], [sw / 2, wallY], B / 2 - sw / 2 + 6, inch(o.stem.height));
  }
  // wall above: P.T. sill, studs, sheathing and finish; anchor bolt; stem reinforcement (context)
  wallAbove(D, -o.wall / 2, wallY, o.wall, { plates: 1, h: 16 });
  D.anchor(0, wallY + 2.1, wallY - 7, 0.625, "hook");
  D.rect(-1.5, wallY + 1.5, 3, 0.25);
  D.note("P.T. sill plate", [o.wall / 2, wallY + 0.75]);
  D.note("Anchor bolts per shear wall schedule / plan", [0.4, wallY - 4]);
  D.note("Wall framing, sheathing and finish per plan", [-o.wall / 2 - 0.25, wallY + 12]);
  if (o.stem) {
    const yb = -depth + cover + 0.6;
    for (const x of [-sw / 2 + 2, sw / 2 - 2]) D.line([x, yb], [x, wallY - 2]);
    D.line([-sw / 2 + 2, yb], [-sw / 2 + 8, yb]);
    D.line([sw / 2 - 2, yb], [sw / 2 - 8, yb]);
    D.note("Stem reinforcement and dowels per plan", [sw / 2 - 2, (top + wallY) / 2]);
  }
  D.earth(-B / 2 - 10, -sw / 2, Math.min(0, wallY));
  D.earth(sw / 2, B / 2 + 10, Math.min(0, wallY));
  if (!o.stem && wallY < 0) {
    D.conc(-B / 2 - 8, top - 4, 8, 4);
    D.conc(B / 2, top - 4, 8, 4);
  }
  const r = 0.3;
  const bars = (n: number, y: number) => {
    const xs =
      n <= 1 ? [0] : Array.from({ length: n }, (_, i) => -B / 2 + cover + r + (i * (B - 2 * cover - 2 * r)) / (n - 1));
    xs.forEach((x) => D.circle([x, y], r));
    return xs[xs.length - 1];
  };
  if (o.trans) {
    D.line([-B / 2 + cover, -depth + cover], [B / 2 - cover, -depth + cover]);
    D.line([-B / 2 + cover, -depth + cover], [-B / 2 + cover, -depth + cover + 3]);
    D.line([B / 2 - cover, -depth + cover], [B / 2 - cover, -depth + cover + 3]);
    D.note(
      `${o.trans.size} ${o.trans.spacing ? `@ ${fmt(o.trans.spacing, 0)}" o.c. transverse` : `(${o.trans.spacing ?? ""}) transverse`}`,
      [-B / 4, -depth + cover],
    );
  }
  if (o.long?.bottom) {
    const x = bars(o.long.bottom, -depth + cover + (o.trans ? 2 * r : 0) + r);
    D.note(`(${o.long.bottom}) ${o.long.size} cont. bottom`, [x, -depth + cover + 2 * r]);
  }
  if (o.long?.top) {
    const x = bars(o.long.top, top - cover - r);
    D.note(`(${o.long.top}) ${o.long.size} cont. top`, [x, top - cover - r]);
  }
  if (o.trans || o.long?.bottom) D.note(`${inch(cover)} clear to earth`, [B / 2 - cover / 2, -depth + cover / 2]);
  D.note(`${o.what}; concrete f'c = ${fmt(o.fc, 0)} psi`, [-B / 2 + 2, top - 2]);
  D.footnote(`Bottom of footing ${inch(depth)} min. below lowest adjacent grade`);
  D.footnote(`Bear on undisturbed native soil or approved compacted fill; allowable bearing ${fmt(o.qa, 0)} psf`);
  D.dim([-B / 2, -depth], [B / 2, -depth], -6, fmtFtIn(B / 12));
  D.dim([-B / 2, -depth], [-B / 2, top], 6, inch(h));
  if (top + (o.stem?.height ?? 0) > -depth)
    D.dim([B / 2, -depth], [B / 2, Math.min(0, wallY)], -(B / 2 + 14) + B / 2 - 14, inch(depth));
  return D;
}

function footing(r: R<"footing">): Detail {
  const f = r.input;
  const B = f.B * 12;
  if (f.type === "strip")
    return stripSection({
      B,
      h: f.h,
      depth: f.depth,
      stem: f.stem,
      wall: f.c1,
      long: f.longitudinal,
      trans: f.rebar,
      cover: f.cover,
      fc: f.fc,
      qa: f.qa,
      what: `${fmtFtIn(f.B)} wide x ${inch(f.h)} continuous footing`,
    }).done("Continuous footing", r.mark);
  const D = new Draw();
  const top = f.thickened ? 0 : -f.depth + f.h;
  const bot = top - f.h;
  D.conc(-B / 2, bot, B, f.h);
  if (f.thickened) {
    D.conc(-B / 2 - 14, -4, 14, 4);
    D.conc(B / 2, -4, 14, 4);
  } else {
    D.earth(-B / 2 - 10, -(f.c1 ?? 4) / 2, 0);
    D.earth((f.c1 ?? 4) / 2, B / 2 + 10, 0);
    if (top < 0) D.conc(-f.c1 / 2, top, f.c1, -top);
  }
  const yp = Math.max(top, 0);
  cut(D, -f.c1 / 2, yp + 1, f.c1, 16, "t");
  D.line([-f.c1 / 2 - 0.5, yp], [f.c1 / 2 + 0.5, yp]);
  D.line([-f.c1 / 2 - 0.5, yp], [-f.c1 / 2 - 0.5, yp + 6]);
  D.line([f.c1 / 2 + 0.5, yp], [f.c1 / 2 + 0.5, yp + 6]);
  D.anchor(0, yp, yp - 8, 0.625, "head");
  D.note("Post and post base per plan", [f.c1 / 2 + 0.5, yp + 4]);
  if (f.rebar) {
    const n = f.rebar.count ?? 2;
    const y = bot + f.cover;
    D.line([-B / 2 + f.cover, y], [B / 2 - f.cover, y]);
    for (let i = 0; i < n; i++)
      D.circle([-B / 2 + f.cover + 0.6 + (i * (B - 2 * f.cover - 1.2)) / Math.max(1, n - 1), y + 0.6], 0.3);
    D.note(`(${n}) ${f.rebar.size} each way, bottom, ${inch(f.cover)} clear`, [B / 2 - f.cover - 1, y]);
  }
  const L = (f.L ?? f.B) * 12;
  D.note(
    `${fmtFtIn(B / 12)} x ${fmtFtIn(L / 12)} x ${inch(f.h)} ${f.thickened ? "thickened slab" : "pad footing"}; f'c = ${fmt(f.fc, 0)} psi`,
    [-B / 2 + 2, top - 2],
  );
  if (!f.thickened) D.footnote(`Bottom of footing ${inch(f.depth)} min. below lowest adjacent grade`);
  D.footnote(`Bear on undisturbed native soil or approved compacted fill; allowable bearing ${fmt(f.qa, 0)} psf`);
  D.dim([-B / 2, bot], [B / 2, bot], -6, fmtFtIn(B / 12));
  D.dim([-B / 2, bot], [-B / 2, top], 6, inch(f.h));
  return D.done(f.thickened ? "Thickened slab under post" : "Pad footing", r.mark);
}

function holdownFooting(r: R<"holdownFooting">): Detail {
  const f = r.input;
  return stripSection({
    B: f.B * 12,
    h: f.h,
    depth: f.depth,
    stem: f.stem,
    wall: 3.5,
    long: f.longitudinal,
    cover: f.cover,
    fc: f.fc,
    qa: f.qa,
    what: `${fmtFtIn(f.Lf)} long x ${fmtFtIn(f.B)} wide x ${inch(f.h)} footing under shear wall ${f.wall.mark}`,
  }).done("Holdown footing", r.mark);
}

function retaining(r: R<"retainingWall">): Detail {
  const w = r.input;
  const D = new Draw();
  const t = w.stem.t;
  const toe = w.footing.toe * 12;
  const heel = w.footing.heel * 12;
  const h = w.footing.h;
  const Hs = w.stem.height * 12;
  const Hr = w.Hr * 12;
  D.conc(-toe, 0, toe + t + heel, h);
  if (w.stem.material === "cmu") D.rect(0, h, t, Hs);
  else D.conc(0, h, t, Hs);
  D.earth(t, t + heel + 10, h + Hr);
  D.earth(-toe - 10, 0, h + (w.soil.toeCover ?? 0));
  const v = w.stem.vertical;
  const xv = v.layout === "center" ? t / 2 : t - 2;
  D.line([xv, 2], [xv, h + Hs - 2]);
  D.line([xv, 2], [xv - 8, 2]);
  D.note(`${v.size} @ ${fmt(v.spacing, 0)}" o.c. vertical${v.layout === "each-face" ? " each face" : ""}`, [
    xv,
    h + Hs / 2,
  ]);
  const hz = w.stem.horizontal;
  for (let y = h + 4; y < h + Hs - 2; y += Math.max(8, hz.spacing)) D.circle([xv - 0.8, y], 0.3);
  D.note(`${hz.size} @ ${fmt(hz.spacing, 0)}" o.c. horizontal`, [xv - 0.8, h + 4 + Math.max(8, hz.spacing)]);
  const fb = w.footing;
  D.line([-toe + 3, fb.coverBottom], [t + heel - 3, fb.coverBottom]);
  D.note(`${fb.bottom.size} @ ${fmt(fb.bottom.spacing, 0)}" o.c. bottom, ${inch(fb.coverBottom)} clear`, [
    -toe / 2,
    fb.coverBottom,
  ]);
  D.line([-toe + 3, h - fb.coverTop], [t + heel - 3, h - fb.coverTop]);
  D.note(`${fb.top.size} @ ${fmt(fb.top.spacing, 0)}" o.c. top`, [t + heel / 2, h - fb.coverTop]);
  D.note(`(${fb.longitudinal.count}) ${fb.longitudinal.size} longitudinal`, [t + heel - 4, fb.coverBottom + 0.6]);
  D.circle([t + heel - 4, fb.coverBottom + 0.6], 0.3);
  D.note(
    w.stem.material === "cmu"
      ? `${inch(t)} CMU stem, f'm = ${fmt(w.stem.cmu?.fm ?? 0, 0)} psi, grout solid`
      : `${inch(t)} concrete stem, f'c = ${fmt(w.stem.concrete?.fc ?? fb.fc, 0)} psi`,
    [t, h + Hs - 6],
  );
  D.note(`Footing f'c = ${fmt(fb.fc, 0)} psi; q_a = ${fmt(w.soil.qa, 0)} psf`, [-toe + 4, h / 2]);
  D.note(`Backfill: equivalent fluid pressure ${fmt(w.soil.efp, 0)} pcf`, [t + heel / 2, h + Hr - 6]);
  D.dim([t + heel, h], [t + heel, h + Hr], -8, fmtFtIn(w.Hr));
  D.dim([-toe, 0], [t + heel, 0], -6, fmtFtIn((toe + t + heel) / 12));
  D.dim([-toe, 0], [-toe, h], 6, inch(h));
  return D.done(`Retaining wall (${w.stem.material === "cmu" ? "CMU" : "concrete"})`, r.mark);
}

function masonryWall(r: R<"masonryWall">): Detail {
  const w = r.input;
  const D = new Draw();
  const t = w.t;
  const H = Math.min(w.h * 12, 48);
  if (w.material === "cmu") {
    D.rect(0, 0, t, H);
    for (let y = 8; y < H; y += 8) D.line([0, y], [t, y]);
  } else D.conc(0, 0, t, H);
  D.line([0, -1], [t, -1], true);
  D.line([0, H + 1], [t, H + 1], true);
  const v = w.vertical;
  const xs = v.layout === "each-face" ? [2, t - 2] : [v.layout === "center" ? t / 2 : (v.d ?? t - 2)];
  xs.forEach((x) => D.line([x, 2], [x, H - 2]));
  D.note(`${v.size} @ ${fmt(v.spacing, 0)}" o.c. vertical${v.layout === "each-face" ? " each face" : ""}`, [
    xs[0],
    H / 2,
  ]);
  for (let y = 12; y < H; y += Math.max(8, w.horizontal.spacing)) D.circle([xs[0] + 0.8, y], 0.3);
  D.note(`${w.horizontal.size} @ ${fmt(w.horizontal.spacing, 0)}" o.c. horizontal`, [xs[0] + 0.8, 12]);
  D.note(
    w.material === "cmu"
      ? `${inch(t)} CMU, f'm = ${fmt(w.cmu?.fm ?? 0, 0)} psi, type ${w.cmu?.mortar ?? "S"} mortar, grout solid`
      : `${inch(t)} concrete wall, f'c = ${fmt(w.concrete?.fc ?? 0, 0)} psi`,
    [t, H - 6],
  );
  D.dim([0, H], [t, H], 3, inch(t));
  return D.done(`${w.material === "cmu" ? "CMU" : "Concrete"} wall section`, r.mark);
}

function basePlate(r: R<"basePlate">): Detail {
  const b = r.input;
  const D = new Draw();
  const { N, tp } = b.plate;
  const g = b.rod.groutPad ? 1 : 0;
  D.conc(-N / 2 - 10, -18, N + 20, 18);
  if (g) D.rect(-N / 2, 0, N, g);
  D.rect(-N / 2, g, N, tp);
  const cw = Math.min(N - 2, 8);
  D.rect(-cw / 2, g + tp, cw, 18);
  D.line([-cw / 2 + 0.375, g + tp], [-cw / 2 + 0.375, g + tp + 18], true);
  D.line([cw / 2 - 0.375, g + tp], [cw / 2 - 0.375, g + tp + 18], true);
  const sx = b.rod.nx > 1 ? b.rod.sx || N - 2 * b.rod.e1 : 0;
  for (const x of b.rod.nx > 1 ? [-sx / 2, sx / 2] : [0]) {
    D.anchor(x, g + tp + 1.5, -b.rod.hef, b.rod.d, b.rod.type === "hooked" ? "hook" : "head");
    D.rect(x - 1.25 * b.rod.d, g + tp, 2.5 * b.rod.d, 0.25);
    D.rect(x - b.rod.d, g + tp + 0.25, 2 * b.rod.d, 0.8 * b.rod.d);
  }
  const n = b.rod.nx * b.rod.ny;
  D.note(`Column ${b.column}`, [0, g + tp + 14]);
  D.note(`PL ${inch(tp)} x ${inch(N)} x ${inch(b.plate.B)} (${b.plate.grade})`, [N / 2 - 1, g + tp / 2]);
  D.note(`(${n}) ${inch(b.rod.d)} dia. anchor rods, ${inch(b.rod.hef)} embed., ${b.rod.type} w/ heavy hex nuts`, [
    sx / 2 || 0,
    -b.rod.hef / 2,
  ]);
  D.note(`${inch(b.weld.w)} fillet weld all around, E${fmt(b.weld.FEXX, 0)}XX`, [cw / 2, g + tp + 0.5]);
  if (g) D.note('1" non-shrink grout', [-N / 2 + 1, 0.5]);
  D.note(`Concrete f'c = ${fmt(b.fc, 0)} psi`, [-N / 2 - 6, -4]);
  D.dim([sx / 2 || 0, 0], [sx / 2 || 0, -b.rod.hef], -(N / 2 + 6), inch(b.rod.hef));
  return D.done("Column base plate", r.mark);
}

/* ------------------------------------------------------------------ lateral */

function holdown(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  if (!r.holdown && !r.rod) return undefined;
  const D = new Draw();
  const [pb] = dressed(s.endPost.size);
  const pw = pb * s.endPost.plies;
  D.conc(-30, -20, 42, 20);
  D.earth(-40, -30, -2);
  D.wood(-pw, 0, 12 + pw, 1.5);
  D.rect(-pw, 1.5, pw, 40);
  for (let i = 1; i < s.endPost.plies; i++) D.line([-pw + i * pb, 1.5], [-pw + i * pb, 41.5]);
  D.studs(4, 12, 1.5, 41.5, 16);
  D.note(`(${s.endPost.plies}) ${s.endPost.size} ${s.stud.species} ${s.stud.grade} end post`, [-pw / 2, 34]);
  if (r.rod) {
    const rd = s.rod!;
    D.anchor(-pw - 1, 42, -14, rd.d, "head");
    D.note(`${inch(rd.d)} dia. continuous rod (${rd.steel}) to foundation`, [-pw - 1, 20]);
    D.rect(-pw - 4, 41.5, 6, 0.75);
    D.note(`Bearing plate ${inch(rd.plate.w)} x ${inch(rd.plate.l)} with take-up device each floor`, [-pw - 1, 42]);
    return D.done("Continuous rod tie-down", r.mark);
  }
  const hd = r.holdown!.item;
  D.rect(-pw - 2.5, 4, 2.5, 14);
  D.note(`${hd.manufacturer} ${hd.model} holdown${hd.fasteners ? ` w/ ${hd.fasteners}` : ""}`, [-pw - 2.5, 14]);
  const a = s.holdownAnchor;
  if (a) {
    D.anchor(-pw - 1.25, 4, -a.hef, a.d, "head");
    D.note(`${inch(a.d)} dia. anchor (${a.steel}), ${inch(a.hef)} embed., ${inch(a.plate)} sq. bearing plate`, [
      -pw - 1.25,
      -a.hef / 2,
    ]);
    D.dim([-pw - 1.25, 0], [-pw - 1.25, -a.hef], -(30 - pw - 1.25) - 4, inch(a.hef));
    D.dim([-30, -20], [-pw - 1.25, -20], -4, inch(a.edges[0]));
  }
  D.note(`${s.sillSize} PT sill`, [6, 0.75]);
  return D.done("Holdown at shear wall end", r.mark);
}

function sillAnchor(r: R<"shearWall">): Detail {
  const s = r.input;
  const a = s.sill;
  const D = new Draw();
  const [sb, sd] = dressed(s.sillSize);
  const sillW = Math.max(sb, sd);
  const sillT = Math.min(sb, sd);
  D.conc(-a.edge, -16, 24, 16);
  D.earth(-a.edge - 10, -a.edge, -2);
  D.wood(-a.edge, 0, sillW, sillT);
  D.rect(-a.edge, sillT, sillW, 16);
  D.line([-a.edge - 0.5, 0], [-a.edge - 0.5, sillT + 16]);
  D.anchor(0, sillT + 1.2, -a.embed, a.d, a.type === "post-installed" ? "none" : "hook");
  D.rect(-1.5, sillT, 3, 0.25);
  D.rect(-0.6, sillT + 0.25, 1.2, 0.6);
  D.note(
    a.type === "post-installed"
      ? `${inch(a.d)} dia. adhesive anchor${a.label ? ` (${a.label})` : ""} @ ${fmt(a.spacing, 0)}" o.c., ${inch(a.embed)} embed.`
      : `${inch(a.d)} dia. anchor bolt @ ${fmt(a.spacing, 0)}" o.c., ${inch(a.embed)} embed.`,
    [0, -a.embed / 2],
  );
  D.note('3" x 3" x 0.229" plate washer and nut', [1.5, sillT + 0.2]);
  D.note(`${s.sillSize} PT sill plate`, [sillW - a.edge - 1, sillT / 2]);
  D.note(r.sides.map((x) => `${x.row.label}, ${x.row.nail} @ ${x.spacing}" o.c. edges`).join("; "), [
    -a.edge - 0.5,
    sillT + 10,
  ]);
  D.dim([-a.edge, -16], [0, -16], -4, inch(a.edge));
  D.dim([0, 0], [0, -a.embed], -(24 - a.edge) - 4, inch(a.embed));
  return D.done("Shear wall sill anchorage", r.mark);
}

function shearWallElevation(r: R<"shearWall">): Detail {
  const s = r.input;
  const D = new Draw();
  const h = s.h * 12;
  const L = s.opening ? s.b * 12 : s.perforated ? s.b * 12 : Math.min(s.b, 8) * 12;
  const [pb] = dressed(s.endPost.size);
  const pw = pb * s.endPost.plies;
  D.conc(-6, -10, L + 12, 10);
  D.rect(0, 0, L, 1.5);
  D.rect(0, h - 3, L, 3);
  D.line([0, h - 1.5], [L, h - 1.5]);
  D.rect(0, 1.5, pw, h - 4.5);
  D.rect(L - pw, 1.5, pw, h - 4.5);
  D.studs(16, L - pw - 1, 1.5, h - 3, s.stud.spacing);
  for (let x = 48; x < L - 1; x += 48) D.line([x, 1.5], [x, h - 3], true);
  if (h > 100) D.line([0, 96], [L, 96], true);
  const side = r.sides[0];
  D.note(
    `${r.sides.length > 1 ? "Each face: " : ""}${side.row.label} w/ ${side.row.nail} @ ${side.spacing}" o.c. edges, 12" o.c. field; block all panel edges`,
    [L / 2, h / 2],
  );
  D.note(`(${s.endPost.plies}) ${s.endPost.size} end posts`, [pw / 2, h * 0.7]);
  if (r.holdown) D.note(`${r.holdown.item.model} holdown each end`, [L - pw, 10]);
  if (r.holdown) {
    D.rect(pw, 4, 2.5, 12);
    D.rect(L - pw - 2.5, 4, 2.5, 12);
  }
  for (let x = 12; x < L - 6; x += s.sill.spacing) D.line([x, -4], [x, 2]);
  D.note(`${inch(s.sill.d)} dia. sill anchors @ ${fmt(s.sill.spacing, 0)}" o.c.`, [12, 0]);
  if (s.opening && r.ftao) {
    const o = s.opening;
    const x1 = o.L1 * 12;
    const x2 = (o.L1 + o.Lo) * 12;
    const yb = o.hb * 12;
    const yt = h - o.ha * 12;
    D.rect(x1, yb, x2 - x1, yt - yb);
    D.line([x1 - 24, yt + 1], [x2 + 24, yt + 1]);
    if (yb > 0) D.line([x1 - 24, yb - 1], [x2 + 24, yb - 1]);
    D.note(
      r.ftao.strap
        ? `${r.ftao.strap.item.model} strap at head${yb > 0 ? " and sill" : ""}, over blocking; F = ${fmt(Math.max(r.ftao.F.s, r.ftao.F.w), 0)} lb`
        : "Strap at head and sill per calculations",
      [x2 + 12, yt + 1],
    );
    D.dim([x1, yt], [x2, yt], 6, fmtFtIn(o.Lo));
  }
  if (s.perforated) {
    let x = s.perforated.segments[0] * 12;
    s.perforated.openings.forEach((o, i) => {
      D.rect(x, h - 3 - o.height * 12 + 3, o.width * 12, o.height * 12 - 3);
      x += (o.width + (s.perforated!.segments[i + 1] ?? 0)) * 12;
    });
    D.note("Perforated shear wall: holdowns at the ends only; uniform anchorage full length", [L / 4, h - 12]);
  }
  D.dim([L, 0], [L, h], -8, fmtFtIn(s.h));
  if (s.opening || s.perforated) D.dim([0, 0], [L, 0], -14, fmtFtIn(s.b));
  return D.done(
    s.opening
      ? "Shear wall with force transfer around opening"
      : s.perforated
        ? "Perforated shear wall"
        : "Shear wall elevation",
    r.mark,
  );
}

function upliftPath(r: R<"uplift">): Detail {
  const D = new Draw();
  const n = r.rows.length;
  r.rows.forEach((row, i) => {
    const y = (n - 1 - i) * 30;
    D.rect(0, y, 3.5, 24);
    D.wood(-1, y + 24, 5.5, 3);
    D.rect(3.5, y + 18, 1.5, 10);
    D.note(`${row.label}: ${row.model} @ ${fmt(row.spacing, 0)}" o.c.`, [5, y + 23]);
  });
  D.conc(-8, -10, 20, 10);
  return D.done(`Uplift load path - ${r.input.sourceMark}`, r.mark);
}

function shearPanel(r: R<"shearPanel">): Detail {
  const D = new Draw();
  const h = r.input.h * 12;
  D.conc(-6, -10, 36, 10);
  D.rect(0, 0, 24, h);
  D.line([0, 0], [24, h], true);
  D.line([24, 0], [0, h], true);
  D.note(`(${r.input.count}) ${r.item.manufacturer} ${r.item.model}`, [12, h / 2]);
  D.note(`Anchorage, top connection and footing reinforcement per ${r.item.report || "manufacturer"}`, [12, 0]);
  if (r.item.fasteners) D.note(r.item.fasteners, [12, h - 2]);
  D.dim([24, 0], [24, h], -6, fmtFtIn(r.input.h));
  return D.done("Prefabricated shear panel", r.mark);
}

/* ------------------------------------------------------------------ walls */

function cfsWall(r: R<"cfsWall">): Detail {
  const D = new Draw();
  const H = 48;
  D.rect(0, 0, 6, 1.25);
  D.rect(0, H - 1.25, 6, 1.25);
  D.rect(0, 1.25, 6, H - 2.5);
  D.note(r.callout, [6, H / 2]);
  D.note("Screws, bridging and track fastening per AISI S240 and the details", [6, H - 1]);
  return D.done("Cold-formed steel wall", r.mark);
}

/* ------------------------------------------------------------------ floor / roof */

function trussJoint(r: R<"woodTruss">): Detail {
  const j = r.input.joint;
  const D = new Draw();
  D.rect(-24, 0, 48, 3.5);
  D.line([0, 3.5], [-18, 30]);
  D.line([3.5, 3.5], [-14.5, 30]);
  D.rect(-8, -2, 14, 12);
  D.note(
    j.type === "plate"
      ? `Metal plate connector per TPI 1 (${j.source})`
      : j.type === "nailed"
        ? `${inch(j.gusset)} gussets both faces w/ ${nailDef(j.nail).label} per calculations`
        : `${inch(j.gusset)} gussets both faces w/ ${inch(j.D)} dia. bolts per calculations`,
    [6, 6],
  );
  D.note(r.callout, [20, 1.75]);
  return D.done("Truss joint", r.mark);
}

function sister(r: R<"joist">): Detail | undefined {
  const s = r.input.sister;
  if (!s?.connection) return undefined;
  const D = new Draw();
  const [, dd] = dressed(r.input.size);
  const [, sd] = dressed(s.size);
  D.rect(0, 0, 72, dd);
  D.rect(6, dd - sd, 60, sd);
  for (let x = 6 + s.connection.spacing / 2; x < 66; x += s.connection.spacing)
    for (let k = 0; k < s.connection.rows; k++) D.circle([x, dd - sd + ((k + 1) * sd) / (s.connection.rows + 1)], 0.25);
  D.note(`Existing ${r.input.size}`, [3, dd / 2]);
  D.note(`Sister ${s.size} ${s.species} ${s.grade}: ${plyText(s.connection)}`, [36, dd - sd / 2]);
  return D.done("Sister joist", r.mark);
}

function notches(r: R<"joist"> | R<"beam">): Detail | undefined {
  const ops = r.input.openings;
  if (!ops?.length) return undefined;
  const D = new Draw();
  const size = r.kind === "joist" ? r.input.size : r.input.material.kind === "sawn" ? r.input.material.size : "4x12";
  const [, dd] = dressed(size);
  const L = Math.max(...ops.map((o) => o.x * 12)) + 24;
  D.rect(0, 0, L, dd);
  for (const o of ops) {
    const x = o.x * 12;
    if (o.type === "hole") {
      D.circle([x, dd / 2 + (o.offset ?? 0)], o.size / 2);
      D.note(`${inch(o.size)} dia. hole at ${fmtFtIn(o.x)}`, [x, dd / 2 + (o.offset ?? 0)]);
    } else {
      const top = o.type === "notch-top";
      const len = o.offset ?? 3;
      D.rect(x - len / 2, top ? dd - o.size : 0, len, o.size);
      D.note(`${inch(o.size)} deep x ${inch(len)} ${top ? "top" : "bottom"} notch at ${fmtFtIn(o.x)}`, [
        x,
        top ? dd : 0,
      ]);
    }
  }
  D.note(`${r.mark} ${r.callout}`, [6, dd / 2]);
  return D.done("Notches and holes", r.mark);
}

function plies(r: R<"beam">): Detail | undefined {
  const c = r.input.plyConnection;
  const m = r.input.material;
  if (!c || m.kind === "glulam") return undefined;
  const D = new Draw();
  const n = "plies" in m ? (m.plies ?? 2) : 2;
  const [b0, dd] = m.kind === "sawn" ? dressed(m.size) : [1.75, 11.875];
  for (let i = 0; i < n; i++) D.wood(i * b0, 0, b0, dd);
  for (let k = 0; k < c.rows; k++) {
    const y = ((k + 1) * dd) / (c.rows + 1);
    D.line([-1, y], [n * b0 + (c.fastener === "bolt" ? 1 : -0.5), y]);
  }
  D.note(r.callout, [(n * b0) / 2, dd]);
  D.note(plyText(c), [n * b0, dd / 2]);
  return D.done("Built-up beam fastening", r.mark);
}

function ledger(r: R<"ledger">): Detail {
  const g = r.input;
  const D = new Draw();
  const [lb, ld] = dressed(g.ledger.size);
  const wall = g.support.kind === "wood";
  if (wall) D.rect(-1.5, -6, 1.5, ld + 12);
  else D.conc(-8, -18, 8, ld + 30);
  D.wood(0, 0, lb, ld);
  D.rect(lb, 1, 30, ld - 2);
  const f = g.fastener;
  for (const y of [ld * 0.33, ld * 0.67])
    D.line([wall ? -1.5 : -(g.support.kind === "wood" ? 0 : g.support.embed), y], [lb + 0.5, y]);
  D.note(`${g.ledger.size} ${g.ledger.species} ${g.ledger.grade} ledger`, [lb / 2, ld]);
  D.note(
    `${inch(f.D)} dia. ${f.type === "bolt" ? "through-bolts" : "lag screws"}${f.label ? ` (${f.label})` : ""} @ ${fmt(f.spacing, 0)}" o.c., staggered`,
    [lb, ld * 0.33],
  );
  D.note(
    g.support.kind === "wood"
      ? `Existing ${inch(g.support.thickness)} ${g.support.species} rim`
      : `${g.support.kind === "cmu" ? "CMU" : "Concrete"} wall, ${inch(g.support.embed)} min. embed.`,
    [wall ? -0.75 : -4, -4],
  );
  return D.done("Ledger connection", r.mark);
}

function steelColumnCap(r: R<"steelColumn">): Detail | undefined {
  const c = r.input;
  if (!c.cap) return undefined;
  const D = new Draw();
  D.rect(-3, -30, 6, 30);
  D.rect(-c.cap.length / 2, 0, c.cap.length, 0.5);
  D.rect(-12, 0.5, 24, 11.25);
  D.note(`Column ${c.shape} (${c.grade})`, [3, -15]);
  D.note(`Cap plate ${inch(c.cap.length)} x ${inch(c.cap.width)}; wood beam bearing ${c.cap.species} ${c.cap.grade}`, [
    c.cap.length / 2,
    0.25,
  ]);
  return D.done("Steel column cap", r.mark);
}

/* ------------------------------------------------------------------ framing details (full context) */
function rafterSeat(r: R<"rafter">): Detail {
  const f = r.input;
  const D = new Draw();
  const s = f.rise / 12;
  const dv = dressed(f.size)[1] * Math.sqrt(1 + s * s);
  const wd = 5.5;
  wallBelow(D, -wd, 0, wd, { h: 24 });
  const hc = Math.max(0.75, f.seatCut);
  const yb = (x: number) => -hc + s * (x + wd);
  const xs = Math.min(0, -wd + hc / s);
  const xt = -wd - Math.min(20, Math.max(8, f.overhang * 12));
  const xe = 40;
  D.line([xt, yb(xt)], [-wd, yb(-wd)]);
  D.line([-wd, yb(-wd)], [-wd, 0]);
  D.line([-wd, 0], [xs, 0]);
  D.line([xs, yb(xs)], [xe, yb(xe)]);
  D.line([xt, yb(xt) + dv], [xe, yb(xe) + dv]);
  D.line([xt, yb(xt)], [xt, yb(xt) + dv]);
  brk(D, [xe, yb(xe)], [xe, yb(xe) + dv]);
  D.rect(xt - 1.5, yb(xt) + dv - 7.25, 1.5, 7.25);
  const sh = 0.6 * Math.sqrt(1 + s * s);
  D.line([xt - 1.5, yb(xt - 1.5) + dv], [xt - 1.5, yb(xt - 1.5) + dv + sh]);
  D.line([xt - 1.5, yb(xt - 1.5) + dv + sh], [xe, yb(xe) + dv + sh]);
  brk(D, [xe, yb(xe) + dv], [xe, yb(xe) + dv + sh]);
  // blocking between rafters at the plate (beyond, hidden)
  const bt = yb(-wd + 1.5) + dv - 0.5;
  D.line([-wd, 0], [-wd, bt], true);
  D.line([-wd + 1.5, 0], [-wd + 1.5, bt], true);
  D.line([-wd, bt], [-wd + 1.5, bt], true);
  D.note(`${f.size} ${f.species} ${f.grade} rafters @ ${fmt(f.spacing, 0)}" o.c., ${fmt(f.rise, 2)}:12`, [
    22,
    yb(22) + dv / 2,
  ]);
  D.note(`Birdsmouth: ${inch(f.plateSeat)} min. bearing, ${inch(f.seatCut)} max. seat cut`, [(-wd + xs) / 2, 0]);
  D.note("Roof sheathing per plan", [8, yb(8) + dv + sh]);
  D.note("2x blocking between rafters", [-wd + 0.75, bt - 1]);
  D.note("Fascia", [xt - 1.5, yb(xt) + dv - 4]);
  D.note("Dbl. 2x top plate", [-wd / 2, -1.5]);
  D.note("2x stud wall, sheathing and finish per plan", [-wd / 2, -18]);
  D.dim([-wd, yb(-wd)], [-wd, 0], 6, inch(f.seatCut));
  return D.done("Rafter at top plate", r.mark);
}

function ridge(r: R<"rafter">): Detail {
  const f = r.input;
  const D = new Draw();
  const s = f.rise / 12;
  const dv = dressed(f.size)[1] * Math.sqrt(1 + s * s);
  const beam = f.ridge === "beam";
  const rb = beam ? 3.5 : 1.5;
  const rd = beam ? Math.max(11.25, dv + 2) : dv + 1.5;
  const seat = beam && f.ridgeSeat > 0;
  const L = 36;
  const sh = 0.6 * Math.sqrt(1 + s * s);
  for (const sg of [-1, 1]) {
    const x0 = seat ? 0 : (sg * rb) / 2;
    const top = (x: number) => (seat ? dv : 0) - s * Math.abs(x) + (seat ? 0 : (s * rb) / 2);
    const xe = sg * L;
    D.line([x0, top(x0)], [xe, top(xe)]);
    D.line([x0, top(x0) - dv], [xe, top(xe) - dv]);
    D.line([x0, top(x0)], [x0, top(x0) - dv]);
    brk(D, [xe, top(xe)], [xe, top(xe) - dv]);
    D.line([0, top(0) + sh], [xe, top(xe) + sh]);
    if (!seat && beam) {
      const xh = (sg * rb) / 2;
      const yb = top(xh) - dv;
      D.line([xh, yb - 0.3], [xh + sg * 2.5, yb - 0.3]);
      D.line([xh + sg * 2.5, yb - 0.3], [xh + sg * 2.5, yb + dv * 0.75]);
    }
  }
  const ytop = seat ? -s * (rb / 2) - 0.01 : 0;
  if (seat) D.wood(-rb / 2, ytop - rd, rb, rd);
  else D.wood(-rb / 2, -rd, rb, rd);
  D.note(`${f.size} ${f.species} ${f.grade} rafters @ ${fmt(f.spacing, 0)}" o.c.`, [
    24,
    (seat ? dv : 0) - s * 24 - dv / 2,
  ]);
  D.note(
    beam
      ? seat
        ? `Ridge beam per schedule; rafters bear ${inch(f.ridgeSeat)} min. on beam`
        : "Ridge beam per schedule; rafters on face-mount hangers"
      : "2x ridge board; rafters tied by ceiling joists / rafter ties",
    [0, (seat ? ytop : 0) - rd / 2],
  );
  D.note("Roof sheathing per plan", [-18, (seat ? dv : 0) - s * 18 + sh]);
  return D.done(beam ? "Rafters at ridge beam" : "Rafters at ridge board", r.mark);
}

function heel(r: R<"ceilingJoist">): Detail | undefined {
  const c = r.input;
  if (!c.heel) return undefined;
  const D = new Draw();
  const [, cj] = dressed(c.size);
  const wd = 5.5;
  wallBelow(D, -wd, 0, wd, { h: 24 });
  cut(D, -wd, 0, 44 + wd, cj, "r");
  const s = 5 / 12;
  const dv = 7.25 * Math.sqrt(1 + s * s);
  const yb = (x: number) => s * (x + wd);
  D.line([-wd - 14, yb(-wd - 14)], [40, yb(40)]);
  D.line([-wd - 14, yb(-wd - 14) + dv], [40, yb(40) + dv]);
  D.line([-wd - 14, yb(-wd - 14)], [-wd - 14, yb(-wd - 14) + dv]);
  brk(D, [40, yb(40)], [40, yb(40) + dv]);
  const x1 = -wd + 0.5;
  const x2 = -wd + cj / s;
  for (let i = 0; i < c.heel.count; i++) {
    const x = x1 + ((i + 0.5) * (x2 - x1)) / c.heel.count;
    D.circle([x, (yb(x) + Math.min(cj, yb(x) + dv)) / 2], 0.25);
  }
  D.note(`${c.size} ${c.species} ${c.grade} ceiling joists @ ${fmt(c.spacing, 0)}" o.c.`, [30, cj / 2]);
  D.note(`${c.heel.count}-${nailDef(c.heel.nail).label} face nail each heel`, [(x1 + x2) / 2, cj * 0.6]);
  D.note("Rafter per plan", [20, yb(20) + dv / 2]);
  D.note("Dbl. 2x top plate", [-wd / 2, -1.5]);
  D.note("2x stud wall per plan", [-wd / 2, -15]);
  return D.done("Ceiling joist heel joint", r.mark);
}

function trussBearing(r: R<"truss">): Detail {
  const t = r.input;
  const D = new Draw();
  const [, pd] = dressed(t.plate.size);
  wallBelow(D, -pd, 0, pd, { h: 24 });
  const s = 5 / 12;
  const tc = 3.5 * Math.sqrt(1 + s * s);
  cut(D, -pd - 1, 0, 44 + pd, 3.5, "r");
  D.line([-pd - 1, 3.5], [40, 3.5 + s * (41 + pd)]);
  D.line([-pd - 1, 3.5 + tc], [40, 3.5 + tc + s * (41 + pd)]);
  D.line([-pd - 1, 0], [-pd - 1, 3.5 + tc]);
  brk(D, [40, 3.5 + s * (41 + pd)], [40, 3.5 + tc + s * (41 + pd)]);
  D.line([-pd - 1, 3.5 + tc + 0.6], [40, 3.5 + tc + 0.6 + s * (41 + pd)]);
  // heel plate (hidden) and blocking beyond
  const gp: Array<[Pt, Pt]> = [
    [
      [-pd, 0.5],
      [6, 0.5],
    ],
    [
      [6, 0.5],
      [6, 8],
    ],
    [
      [6, 8],
      [-pd, 6],
    ],
    [
      [-pd, 6],
      [-pd, 0.5],
    ],
  ];
  for (const [a, b] of gp) D.line(a, b, true);
  D.note(
    `${t.girder ? `(${t.plies}) ply girder truss` : `Pre-fabricated trusses @ ${fmt(t.spacing, 0)}" o.c.`}${t.designRef ? ` per ${t.designRef}` : " per manufacturer"}`,
    [24, 1.75],
  );
  D.note("Truss heel plate per manufacturer", [3, 4]);
  D.note(`Bearing on (2) ${t.plate.size} ${t.plate.species} ${t.plate.grade} top plates`, [-pd / 2, -1.5]);
  D.note("Roof sheathing per plan", [14, 3.5 + tc + 0.6 + s * (15 + pd)]);
  D.note("2x stud wall per plan", [-pd / 2, -15]);
  return D.done("Truss bearing", r.mark);
}

function joistBearing(r: R<"joist"> | R<"ijoist">): Detail {
  const D = new Draw();
  const ij = r.kind === "ijoist";
  // I-joist depth '11-7/8"' → 11.875
  const frac = (t: string) =>
    t
      .split("-")
      .reduce((a, x) => a + (x.includes("/") ? Number(x.split("/")[0]) / Number(x.split("/")[1]) : Number(x)), 0);
  const dd = !ij ? dressed(r.input.size)[1] : frac(String(r.input.depth).replace(/"/g, "")) || 11.875;
  const lb = Math.min(...r.input.bearing);
  const wd = 5.5;
  wallBelow(D, -wd, 0, wd, { h: 24 });
  const rim = ij ? 1.125 : 1.5;
  D.rect(-wd, 0, rim, dd);
  const x0 = -wd + rim;
  cut(D, x0, 0, 44 - x0, dd, "r");
  if (ij) {
    D.line([x0, 1.5], [44, 1.5]);
    D.line([x0, dd - 1.5], [44, dd - 1.5]);
  }
  deck(D, -wd - 0.5, 44, dd, 0.75);
  D.line([x0 + 1, 0.2], [x0 + 3, 2.4]);
  D.note(r.callout, [24, dd / 2]);
  D.note(`${inch(lb)} min. bearing`, [x0 + lb / 2, 0]);
  D.note(ij ? "Rim board per manufacturer" : "Rim joist / blocking", [-wd + rim / 2, dd * 0.6]);
  D.note("Subfloor sheathing per plan", [12, dd + 0.75]);
  D.note(ij ? "Nail per manufacturer" : "Toenail per nailing schedule", [x0 + 2, 1.3]);
  D.note("Dbl. 2x top plate", [-wd / 2, -1.5]);
  D.note("2x stud wall per plan", [-wd / 2, -15]);
  D.dim([x0, 0], [x0 + lb, 0], -4, inch(lb));
  return D.done(ij ? "I-joist bearing" : "Joist bearing", r.mark);
}

function diaphragm(r: R<"diaphragm">, p: Project): Detail {
  const g = r.input;
  const D = new Draw();
  const wd = 5.5;
  wallBelow(D, -wd, 0, wd, { h: 20 });
  const jd = 9.25;
  D.wood(-wd, 0, 1.5, jd);
  for (let x = 8; x < 50; x += 16) D.wood(x, 0, 1.5, jd);
  D.line([-wd + 1.5, 0], [56, 0], true);
  deck(D, -wd - 0.5, 56, jd, 0.6, [-wd + 0.75, 8.75, 24.75, 40.75]);
  const sp = g.chord.splice;
  D.note(`${g.level} sheathing: ${r.values.text}`, [30, jd + 0.6]);
  D.note(`BN at boundary${g.blocked ? "; EN at blocked panel edges" : ""}`, [-wd + 0.75, jd + 1]);
  D.note(g.blocked ? "Blocked diaphragm: 2x blocking at all panel edges" : "Unblocked diaphragm", [24.75, jd / 2]);
  D.note("Rim / boundary blocking", [-wd + 0.75, jd / 2]);
  D.note(`Joists / rafters per plan`, [40.75, jd / 2]);
  D.note(
    `Chord: (2) ${g.chord.size} ${g.chord.species} ${g.chord.grade} top plates; splice ${sp.type === "strap" ? (p.hardware.find((h) => h.id === sp.strapId)?.model ?? "strap") : `${sp.nails}-${nailDef(sp.nail).label} each side`}`,
    [-wd / 2, -1.5],
  );
  return D.done(`${g.level} diaphragm boundary`, r.mark);
}

function transfer(r: R<"transfer">, p: Project): Detail {
  const t = r.input;
  const D = new Draw();
  const wd = 5.5;
  const jd = 11.25;
  wallBelow(D, 0, 0, wd, { h: 18 });
  D.rect(0, 0, 1.5, jd);
  cut(D, 1.5, 0, 34, jd, "r");
  deck(D, -0.5, 36, jd, 0.75);
  wallAbove(D, 0, jd + 0.75, wd, { h: 18 });
  const c = t.connector;
  const what =
    c.type === "clip"
      ? `${p.hardware.find((h) => h.id === c.hardwareId)?.model ?? "Clip"} @ ${fmt(t.spacing, 0)}" o.c.`
      : `${c.rows > 1 ? `${c.rows} rows ` : ""}${nailDef(c.nail).label} ${c.toenail ? "toenail" : "face nail"} @ ${fmt(t.spacing, 0)}" o.c.`;
  const at: Record<typeof t.interface, Pt> = {
    "diaphragm-to-wall": [1.5, 1],
    "sole-plate": [wd / 2, jd + 1.5],
    "rim-to-sill": [0.75, 0.5],
    other: [wd / 2, jd / 2],
  };
  const where: Record<typeof t.interface, string> = {
    "diaphragm-to-wall": "rim / blocking to top plate",
    "sole-plate": "sole plate through sheathing to rim / blocking",
    "rim-to-sill": "rim to sill / top plate",
    other: "shear transfer",
  };
  const [ax, ay] = at[t.interface];
  for (let k = -1; k <= 1; k++) D.line([ax + k * 1.2, ay + 1.6], [ax + k * 1.2, ay - 1.6]);
  D.note(`${where[t.interface]}: ${what}`, at[t.interface]);
  D.note("Rim joist / blocking", [0.75, jd * 0.7]);
  D.note("Floor joists per plan", [24, jd / 2]);
  D.note("Subfloor sheathing per plan", [18, jd + 0.75]);
  D.note("Wall above per plan", [wd / 2, jd + 14]);
  D.note("Wall below per plan", [wd / 2, -12]);
  return D.done("Shear transfer", r.mark);
}

function wallSection(r: R<"wall">): Detail {
  const w = r.input;
  const D = new Draw();
  const [, d] = dressed(w.size);
  const H = w.plateHeight * 12;
  const bp = 1.5 * w.bottomPlates;
  const tp = 1.5 * w.topPlates;
  cut(D, -18, -4, 18 + d + 18, 4, "lr");
  for (let i = 0; i < w.bottomPlates; i++) D.wood(0, 1.5 * i, d, 1.5);
  D.rect(0, bp, d, H - bp - tp);
  for (let i = 0; i < w.topPlates; i++) D.wood(0, H - 1.5 * (i + 1), d, 1.5);
  D.wood(-6, H, 1.5, 7.25);
  cut(D, -12, H + 7.25, 12 + d + 12, 0.6, "lr");
  if (w.sheathing !== "none") D.rect(-0.5, 0, 0.5, H);
  if (w.sheathing === "both") D.rect(d, bp, 0.5, H - bp - tp);
  else D.line([d + 0.5, bp], [d + 0.5, H - tp]);
  if (w.sheathing === "none" && w.blocking) D.wood(0, H / 2 - 0.75, d, 1.5);
  D.note(`${w.size} ${w.species} ${w.grade} studs @ ${fmt(w.spacing, 0)}" o.c.`, [d / 2, H / 2]);
  D.note(`(${w.topPlates}) ${w.size} top plates`, [d / 2, H - 1.5]);
  D.note(`(${w.bottomPlates}) ${w.size} bottom plate`, [d / 2, 0.75]);
  D.note(
    w.sheathing === "none" ? "Unsheathed" : `Sheathing ${w.sheathing === "both" ? "both faces" : "one face"} per plan`,
    [-0.25, H * 0.65],
  );
  if (w.sheathing !== "both") D.note("Gypsum board / finish per plan", [d + 0.5, H * 0.35]);
  if (w.sheathing === "none" && w.blocking) D.note(`2x blocking @ ${fmtFtIn(w.blocking)} o.c.`, [d / 2, H / 2]);
  D.note("Floor / slab per plan", [-12, -2]);
  D.note("Framing above per plan", [-5.25, H + 3.5]);
  D.dim([d + 0.5, 0], [d + 0.5, H], -10, fmtFtIn(w.plateHeight));
  return D.done("Bearing wall section", r.mark);
}

function studPack(r: R<"wall">, i: number): Detail {
  const w = r.input;
  const k = w.packs[i];
  const D = new Draw();
  const H = 60;
  const tp = 1.5 * w.topPlates;
  const pw = k.studs * 1.5;
  const L = 34;
  cut(D, -L, 0, 2 * L + pw, 1.5 * w.bottomPlates, "lr");
  for (let n = 0; n < w.topPlates; n++) cut(D, -L, H - 1.5 * (n + 1), 2 * L + pw, 1.5, "lr");
  for (let n = 0; n < k.studs; n++) D.rect(n * 1.5, 1.5 * w.bottomPlates, 1.5, H - tp - 1.5 * w.bottomPlates);
  for (const x of [-w.spacing, -2 * w.spacing, pw + w.spacing - 1.5, pw + 2 * w.spacing - 1.5])
    if (x > -L && x < L + pw - 1.5) D.rect(x, 1.5 * w.bottomPlates, 1.5, H - tp - 1.5 * w.bottomPlates);
  D.wood(-2, H, pw + 4, 11.25);
  D.line([pw / 2, H + 18], [pw / 2, H + 11.25]);
  D.line([pw / 2 - 0.8, H + 12.6], [pw / 2, H + 11.25]);
  D.line([pw / 2 + 0.8, H + 12.6], [pw / 2, H + 11.25]);
  // floor framing below with squash blocks, then the foundation
  cut(D, -L, -0.75, 2 * L + pw, 0.75, "lr");
  cut(D, -L, -12, 2 * L + pw, 11.25, "lr");
  D.wood(-0.5, -12, pw + 1, 11.25);
  cut(D, -L, -13.5, 2 * L + pw, 1.5, "lr");
  D.conc(-L, -28, 2 * L + pw, 14.5);
  D.note("Beam / point load above", [pw / 2, H + 6]);
  D.note(`(${k.studs}) ${w.size} ${w.species} ${w.grade} stud pack, plies nailed per NDS 15.3.3`, [pw, H / 2]);
  D.note(`${w.size} studs @ ${fmt(w.spacing, 0)}" o.c.`, [pw + w.spacing - 0.75, H * 0.3]);
  D.note("Solid blocking / squash blocks to match pack, full depth", [pw / 2, -6]);
  D.note("Rim / floor framing per plan", [-L + 4, -6]);
  D.note("Foundation per plan", [-L + 6, -20]);
  return D.done(`Stud pack${k.label ? ` - ${k.label}` : ""}`, r.mark);
}

function hanger(r: R<"connector">, p: Project, d: ProjectDesign): Detail {
  const D = new Draw();
  const src = [...d.outcomes.values()].find((o) => o.result?.mark === r.input.sourceMark)?.result;
  const sd =
    src && "input" in src && "size" in (src.input as object) ? dressed((src.input as { size: string }).size)[1] : 9.25;
  const bd = Math.max(sd + 2, 11.25);
  D.wood(-3.5, 0, 3.5, bd);
  cut(D, 0, bd - sd, 34, sd, "r");
  hangerShape(D, 0, bd - sd, sd);
  deck(D, -6, 34, bd, 0.75);
  const it = r.item;
  D.note(
    `${it.manufacturer} ${it.model} hanger${r.input.quantity > 1 ? ` (${r.input.quantity})` : ""}${it.fasteners ? ` w/ ${it.fasteners}` : ""}`,
    [2.5, bd - sd / 2],
  );
  D.note(`${r.input.sourceMark}${src ? ` ${src.callout}` : ""}`, [22, bd - sd / 2]);
  D.note(`Supporting member: ${r.input.supportName}`, [-1.75, bd / 2]);
  D.note("Sheathing / subfloor per plan", [14, bd + 0.75]);
  void p;
  return D.done("Hanger connection", r.mark);
}

function postConnector(r: R<"connector">, base: boolean): Detail {
  const D = new Draw();
  const it = r.item;
  if (base) {
    D.conc(-14, -14, 28, 14);
    D.earth(-24, -14, 0);
    D.earth(14, 24, 0);
    cut(D, -2.75, 1.5, 5.5, 30, "t");
    D.line([-3.25, 0], [3.25, 0]);
    D.line([-3.25, 0], [-3.25, 6]);
    D.line([3.25, 0], [3.25, 6]);
    D.anchor(0, 0, -8, 0.625, "head");
    D.note(`${it.manufacturer} ${it.model} post base${it.fasteners ? ` w/ ${it.fasteners}` : ""}`, [3.25, 3]);
  } else {
    cut(D, -2.75, -32, 5.5, 32, "b");
    cut(D, -18, 0, 36, 11.25, "lr");
    D.rect(-3.25, -7, 6.5, 18.5);
    for (const y of [-4, -1.5, 3, 6]) D.circle([0, y], 0.3);
    D.note(`${it.manufacturer} ${it.model} post cap${it.fasteners ? ` w/ ${it.fasteners}` : ""}`, [3.25, -3]);
    D.note("Beam per plan", [10, 5.6]);
  }
  D.note(`${r.input.sourceMark} at ${r.input.supportName}`, [0, base ? 25 : -24]);
  return D.done(base ? "Post base" : "Beam on post", r.mark);
}

function guardPost(r: R<"guardPost">): Detail {
  const g = r.input;
  const D = new Draw();
  const [pb, pd] = dressed(g.post.size);
  const pw = g.wideFaceToRim ? pd : pb;
  const H = g.guardHeight * 12;
  cut(D, -30, -11.25, 30, 11.25, "l");
  for (let x = -30; x < 0; x += 6) D.rect(x, 0, 5.5, 1);
  D.wood(-14, -11.25, 1.5, 11.25);
  cut(D, 0.25, -14, pw, H + 14, "t");
  for (const y of [-g.topBolt, -g.topBolt - g.s]) boltSide(D, -2, pw + 1.5, y, g.bolt.d);
  D.rect(-6, -10, 2.5, 7);
  D.line([-3.5, -g.topBolt - g.s], [-0.1, -g.topBolt - g.s]);
  D.note(`${g.post.size} ${g.post.species} ${g.post.grade} guard post`, [pw, H / 2]);
  D.note(`(2) ${g.bolt.label} through-bolts w/ washers`, [pw + 1.5, -g.topBolt]);
  D.note(`${g.device.model} tension device each bolt`, [-4.75, -5]);
  D.note("Decking per plan", [-18, 1]);
  D.note("Rim joist", [-24, -6]);
  D.note("Solid blocking", [-13.25, -4]);
  D.dim([pw + 0.25, -g.topBolt], [pw + 0.25, -g.topBolt - g.s], -6, inch(g.s));
  D.dim([pw + 0.25, 0], [pw + 0.25, H], -6, fmtFtIn(g.guardHeight));
  return D.done("Guard post attachment", r.mark);
}

function steelBeamBearing(r: R<"steelBeam">): Detail {
  const b = r.input;
  const D = new Draw();
  const brg = b.bearing[0] ?? { lb: 3.5, support: "steel" as const };
  const dep = Number(/W(\d+)/.exec(b.shape)?.[1] ?? 10);
  cut(D, -brg.lb, 0.5, 36 + brg.lb, dep, "r");
  D.line([-brg.lb, 1.1], [36, 1.1]);
  D.line([-brg.lb, dep - 0.1], [36, dep - 0.1]);
  D.rect(-brg.lb - 1, 0, brg.lb + 2, 0.5);
  if (brg.support === "concrete") {
    D.conc(-brg.lb - 8, -20, brg.lb + 18, 20);
  } else if (brg.support === "steel") {
    cut(D, -brg.lb, -24, brg.lb + 2, 24, "b");
  } else if (brg.support === "post") {
    cut(D, -brg.lb, -26, Math.max(brg.lb, 5.5), 26, "b");
  } else wallBelow(D, -brg.lb, 0, Math.max(brg.lb, 5.5), { h: 22 });
  D.note(`${b.shape} (${b.grade})`, [20, dep / 2]);
  D.note(`${inch(brg.lb)} min. bearing on ${brg.size ? `${brg.size} ` : ""}${brg.support}`, [-brg.lb / 2, 0]);
  D.note("Bearing plate / shims to full bearing", [0.5, 0.25]);
  D.dim([-brg.lb, dep + 0.5], [0, dep + 0.5], 3, inch(brg.lb));
  return D.done("Steel beam bearing", r.mark);
}

/* ------------------------------------------------------------------ the engineer's library */

const lib = (id: string, title: string, mark: string, text: Array<[string, string]>): Detail => ({
  title: up(title),
  marks: [mark],
  prims: [],
  notes: [],
  tpl: { id, text: text.map(([k, v]) => [k, up(v)]) },
});

/** EXTERIOR BEARING FOOTING: strip footing without a stem wall */
function libFooting(r: R<"footing">): Detail | undefined {
  const f = r.input;
  if (f.type !== "strip" || f.stem) return undefined;
  const L = f.longitudinal;
  const bars = [
    L?.bottom ? `${L.bottom}-${L.size} cont. bottom` : "",
    L?.top ? `${L.top}-${L.size} cont. top` : "",
    f.rebar?.spacing ? `${f.rebar.size} @ ${fmt(f.rebar.spacing, 0)}" o.c. transv.` : "",
  ].filter(Boolean);
  return lib("ext-bearing-footing", "Continuous footing", r.mark, [
    ["^7- ", `7- ${bars.length ? bars.join(", ") : "plain concrete, no reinforcement required"}`],
    ['^12"$', inch(f.B * 12)],
    ['^18"$', inch(f.depth)],
    ['^3" CLR', `${inch(f.cover)} clr. (typ)`],
  ]);
}

function libTieIn(r: R<"tieIn">): Detail {
  const t = r.input;
  return lib("tie-in", "(E) conc. fdns. to (N) conc. fdns.", r.mark, [
    [
      "DOWELS @",
      `${t.anchor.size} ${t.anchor.kind === "rod" ? "threaded rods" : "dowels"} @ ${fmt(t.spacing, 0)}" o.c. with ${inch(t.hef)} min. embedment into (E) conc. w/ ${t.product.name}${t.product.report ? ` (${t.product.report})` : ""}`,
    ],
  ]);
}

const drillNote = (embed: number, label?: string) =>
  `For drilling bolts in to (E) fdn. drill and epoxy ${inch(embed)} into (E) conc. fdn.${label ? ` and use ${label}` : ""}`;

/** shear wall on an existing foundation: post-installed sill anchors */
function libSillToExisting(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  const a = s.sill;
  if (a.type !== "post-installed") return undefined;
  return lib("shear-wall-to-existing", "Shear wall to (E) conc. fdn.", r.mark, [
    ["^FOR DRILLING", drillNote(a.embed, a.label)],
    [
      "^ANCHOR PER S\\.W\\.",
      `${inch(a.d)} dia. adhesive anchors @ ${fmt(a.spacing, 0)}" o.c., ${inch(a.embed)} embed${a.label ? ` w/ ${a.label}` : ""} & special inspection`,
    ],
    ['^1\\.75" MIN\\. EDGE', `${inch(a.edge)} min. edge dist.`],
    ["^2x PTDF$", `${s.sillSize} PTDF`],
    ["^2x STUD$", `${s.stud.size} stud`],
  ]);
}

/** holdown anchored into an existing foundation */
function libHoldownToExisting(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  if (s.sill.type !== "post-installed" || !r.holdown) return undefined;
  const hd = r.holdown.item;
  const a = s.holdownAnchor;
  const who = /simpson/i.test(hd.manufacturer) ? "Simpson" : hd.manufacturer;
  return lib("hdu-to-existing", "Holdown to (E) fdn.", r.mark, [
    ["^SIMP ", `${who} ${hd.model}`],
    ["^DBL STUD", `(${s.endPost.plies}) ${s.endPost.size} end post`],
    ["^2x STUDS @", `${s.stud.size} studs @ ${fmt(s.stud.spacing, 0)}" oc`],
    ...(a
      ? ([
          ['^5/8"Ø H\\.D\\.G\\.', `${inch(a.d)} dia. H.D.G. all-thrd (${a.steel}), ${inch(a.hef)} embed.`],
          ['^10"$', inch(a.hef)],
          ["^FOR DRILLING", drillNote(a.hef, s.sill.label)],
        ] as Array<[string, string]>)
      : ([['^5/8"Ø H\\.D\\.G\\.', `H.D.G. all-thrd anchor per ${hd.model} installation`]] as Array<[string, string]>)),
  ]);
}

function libRoofTie(r: R<"connector">, d: ProjectDesign): Detail {
  const src = [...d.outcomes.values()].find((o) => o.result?.mark === r.input.sourceMark)?.result;
  const what = src?.kind === "truss" || src?.kind === "woodTruss" ? "truss" : "rafter";
  return lib("roof-tie", "Roof framing tie-down", r.mark, [
    [
      "^H2\\.5A",
      `${r.item.model}${r.input.quantity > 1 ? ` (${r.input.quantity})` : ""} ea. ${what} (${r.input.sourceMark})`,
    ],
  ]);
}

/** roof / floor sheathing to the top plate through blocking with framing clips */
function libTransferClip(r: R<"transfer">, p: Project): Detail | undefined {
  const t = r.input;
  if (t.connector.type !== "clip" || t.interface !== "diaphragm-to-wall") return undefined;
  const id = t.connector.hardwareId;
  return lib("shear-transfer-clip", "Shear transfer", r.mark, [
    ["^A35 @", `${p.hardware.find((h) => h.id === id)?.model ?? "Clip"} @ ${fmt(t.spacing, 0)}" o.c.`],
  ]);
}

function libLedger(r: R<"ledger">): Detail | undefined {
  const g = r.input;
  if (g.support.kind !== "wood") return undefined;
  const f = g.fastener;
  return lib("ledger-lag", "Ledger connection", r.mark, [
    [
      "^2-ROWS",
      `${g.ledger.size} ${g.ledger.species} ${g.ledger.grade} ledger w/ ${inch(f.D)} dia. ${f.type === "lag" ? "lag screws" : "thru-bolts"} @ ${fmt(f.spacing, 0)}" o.c. stagg'd`,
    ],
  ]);
}

/* the engineer's issued sheets (2CONNECTION.dxf, S-5 to S-8) */

/** shear wall on new concrete: section view with sheathing nailing, holdowns and anchor bolts (S-5) */
function libShearWallSection(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  if (s.opening || s.perforated || s.sill.type !== "cast-in") return undefined;
  const side = r.sides[0];
  const hd = r.holdown?.item.model ?? (r.rod ? "Cont. rod tie-down" : "");
  return lib("shear-wall-section", "Shear wall section", r.mark, [
    ["#0", `${s.stud.size} stud @ ${fmt(s.stud.spacing, 0)}" o.c.`],
    ["#2", hd],
    ["#3", hd],
    ["#4", `${inch(s.sill.d)} dia. anchor bolts`],
    ["#5", `${inch(s.sill.embed)} embed. w/ 3"x3"x0.229" washers`],
    ["#6", `@ ${fmt(s.sill.spacing, 0)}" o.c.`],
    ["#7", `${s.sillSize} PT sill`],
    ["#8", ""],
    ["#10", `${side.row.label} shear wall`],
    ["#15", `${side.row.nail} @ 12" o.c.`],
    ["#16", "interior studs (field)"],
    ["#17", `${side.row.nail} @ ${side.spacing}" o.c.`],
    ["#18", "panel edges & blocking"],
    ["^-$", ""],
  ]);
}

/** holdown on new concrete (S-5 HDU2-SDS2.5 detailed section view) */
function libHoldownSection(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  if (s.sill.type !== "cast-in" || !r.holdown) return undefined;
  const hd = r.holdown.item;
  const a = s.holdownAnchor;
  return lib("hdu-section", "Holdown section", r.mark, [
    ["#0", hd.manufacturer],
    ["#1", hd.model],
    ["#2", `(${s.endPost.plies}) ${s.endPost.size}`],
    ["#3", "end post"],
    ["#4", `${s.stud.size} studs @`],
    ["#5", `${fmt(s.stud.spacing, 0)}" oc`],
    ["#8", a ? `${inch(a.d)} dia. anchor (${a.steel})` : `anchor per ${hd.model} installation`],
    ["#9", a ? `${inch(a.plate)} sq. bearing plate` : ""],
    ["#10", a ? inch(a.hef) : ""],
  ]);
}

/** sill anchor bolts on new concrete (S-8 detail 6A) */
function libSillAnchorage(r: R<"shearWall">): Detail | undefined {
  const s = r.input;
  const a = s.sill;
  if (a.type !== "cast-in") return undefined;
  return lib("bearing-wall-base", "Shear wall sill anchorage", r.mark, [
    ["#0", "shear wall"],
    ["#2", `${s.sillSize} PT sill plate`],
    ["#5", inch(a.edge)],
    ["#6", `${r.sides[0].row.label} shear wall per plan`],
    ["#9", `${inch(a.d)} dia. A.B.'s @ ${fmt(a.spacing, 0)}" o.c. w/ 3"x3"x0.229" plate washers. Provide`],
    ["#13", `${inch(a.embed)} min.`],
    ["#14", ""],
  ]);
}

/** joist / beam hanger on an I-joist (S-6 detail 1) */
function libIJoistHanger(r: R<"connector">, d: ProjectDesign): Detail | undefined {
  const src = [...d.outcomes.values()].find((o) => o.result?.mark === r.input.sourceMark)?.result;
  if (src?.kind !== "ijoist") return undefined;
  return lib("tji-hanger", "I-joist hanger", r.mark, [
    ["#0", `${r.item.manufacturer} ${r.item.model} hanger at ${r.input.sourceMark}`],
    ["#2", r.item.fasteners || "Manufacturer's specified nails / fasteners"],
  ]);
}

/** sistered joist (S-7 detail 11) */
function libSister(r: R<"joist">): Detail | undefined {
  const s = r.input.sister;
  if (!s?.connection) return undefined;
  return lib("sistered-joist", "Sistered joist", r.mark, [
    ["#1", `Sister ${s.size} ${s.species} ${s.grade}`],
    ["#2", `to (E) ${r.input.size} joist`],
    ["#3", plyText(s.connection)],
    ["#4", ""],
    ["#5", ""],
    ["#6", ""],
    ["#24", ""],
  ]);
}

/** blocked diaphragm panel edges (S-7 detail B) */
function libPanelEdges(r: R<"diaphragm">): Detail | undefined {
  if (!r.input.blocked) return undefined;
  return lib("panel-edge-blocked", `${r.input.level} diaphragm panel edges`, r.mark, [
    ["#6", ""],
    ["#7", r.values.text],
    ["#8", ""],
    ["#9", ""],
  ]);
}

/** chord splice in the double top plate (S-8 detail 12) */
function libChordSplice(r: R<"diaphragm">): Detail | undefined {
  const c = r.input.chord;
  if (c.splice.type !== "nails") return undefined;
  return lib("top-plate-splice", "Top plate (chord) splice", r.mark, [
    ["#1", `w/ ${c.splice.nails}-${nailDef(c.splice.nail).label}`],
    ["#2", "each side, equally spaced &"],
    ["#4", `(2) ${c.size} ${c.species} ${c.grade}`],
    ["#5", "top plates (chord)"],
    ["#11", ""],
  ]);
}

/** post base on concrete (S-8 detail 3A) */
function libPostBase(r: R<"connector">): Detail {
  const it = r.item;
  return lib("post-base", "Post base", r.mark, [
    ["#1", ""],
    ["#2", ""],
    ["#3", `${it.manufacturer} ${it.model} post base${it.fasteners ? ` w/ ${it.fasteners}` : ""}`],
    ["#5", `${r.input.sourceMark} post`],
  ]);
}

/** door / window framing (S-8 detail 8) */
function libOpening(r: R<"wall">, i: number): Detail {
  const w = r.input;
  const o = w.openings[i];
  const jk = o.jacks ?? 1;
  const trim = `(${jk}) ${w.size} trimmers ea. side`;
  return lib("opening-framing", `${o.type ?? "opening"} framing - ${o.label}`, r.mark, [
    ["#8", `(${o.kings}) ${w.size}`],
    ["#9", "king studs"],
    ["#10", "ea. side"],
    ["#11", ""],
    ["#12", trim],
    ["#13", ""],
    ["#14", ""],
    ["#15", trim],
    ["#16", ""],
    ["#17", ""],
    ["#39", `${fmtFtIn(o.x2 - o.x1)} opening`],
    ["#41", `Header: ${o.header || "per schedule"}${o.head ? `; head height ${fmtFtIn(o.head)}` : ""}`],
    ["#42", ""],
    ["#43", ""],
    [
      "#44",
      `${w.size} ${w.species} ${w.grade} studs @ ${fmt(w.spacing, 0)}" o.c., plate height ${fmtFtIn(w.plateHeight)}`,
    ],
  ]);
}

/* ------------------------------------------------------------------ assemble */

export function projectDetails(p: Project, d: ProjectDesign): Detail[] {
  const out: Detail[] = [];
  const add = (x: Detail | undefined) => x && out.push(x);
  for (const o of d.outcomes.values()) {
    const r = o.result;
    if (!r) continue;
    switch (r.kind) {
      case "footing":
        add(libFooting(r) ?? footing(r));
        break;
      case "holdownFooting":
        add(holdownFooting(r));
        break;
      case "tieIn":
        add(libTieIn(r));
        break;
      case "retainingWall":
        add(retaining(r));
        break;
      case "masonryWall":
        add(masonryWall(r));
        break;
      case "basePlate":
        add(basePlate(r));
        break;
      case "shearWall":
        add(libHoldownToExisting(r) ?? libHoldownSection(r) ?? holdown(r));
        add(libSillToExisting(r) ?? libSillAnchorage(r) ?? sillAnchor(r));
        add(libShearWallSection(r) ?? shearWallElevation(r));
        break;
      case "shearPanel":
        add(shearPanel(r));
        break;
      case "transfer":
        add(libTransferClip(r, p) ?? transfer(r, p));
        break;
      case "diaphragm":
        add(libPanelEdges(r) ?? diaphragm(r, p));
        add(libChordSplice(r));
        break;
      case "uplift":
        add(upliftPath(r));
        break;
      case "wall":
        add(wallSection(r));
        r.input.openings.forEach((_, i) => add(libOpening(r, i)));
        r.input.packs.forEach((_, i) => add(studPack(r, i)));
        break;
      case "cfsWall":
        add(cfsWall(r));
        break;
      case "connector":
        if (r.item.kind === "hanger") add(libIJoistHanger(r, d) ?? hanger(r, p, d));
        else if (r.item.kind === "post-cap") add(postConnector(r, false));
        else if (r.item.kind === "post-base") add(libPostBase(r));
        else if (r.item.kind === "tie") add(libRoofTie(r, d));
        break;
      case "rafter":
        add(rafterSeat(r));
        add(ridge(r));
        break;
      case "ceilingJoist":
        add(heel(r));
        break;
      case "truss":
        add(trussBearing(r));
        break;
      case "woodTruss":
        add(trussJoint(r));
        break;
      case "joist":
        add(joistBearing(r));
        add(libSister(r) ?? sister(r));
        add(notches(r));
        break;
      case "ijoist":
        add(joistBearing(r));
        break;
      case "beam":
        add(plies(r));
        add(notches(r));
        break;
      case "ledger":
        add(libLedger(r) ?? ledger(r));
        break;
      case "guardPost":
        add(guardPost(r));
        break;
      case "steelBeam":
        add(steelBeamBearing(r));
        break;
      case "steelColumn":
        add(steelColumnCap(r));
        break;
    }
  }
  // identical details (same drawing and callouts) are drawn once, tagged with every mark
  const merged = new Map<string, Detail>();
  for (const x of out) {
    const key = JSON.stringify([x.title, x.prims, x.notes, x.tpl]);
    const m = merged.get(key);
    if (m) m.marks.push(...x.marks.filter((k) => !m.marks.includes(k)));
    else merged.set(key, { ...x, marks: [...x.marks] });
  }
  const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...merged.values()].map((x) => ({ ...x, marks: x.marks.sort(nat) }));
}
