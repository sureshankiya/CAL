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
  done(title: string, mark: string): Detail {
    return { title: up(title), marks: [mark], prims: this.prims, notes: this.notes };
  }
}

const plyText = (c: PlyConnectionInput) =>
  c.fastener === "nail"
    ? `${c.rows} rows ${nailDef(c.nail ?? "16d-common").label} @ ${fmt(c.spacing, 0)}" o.c., staggered`
    : `${c.rows} rows ${inch(c.boltDia ?? 0.5)} dia. through-bolts w/ washers @ ${fmt(c.spacing, 0)}" o.c., staggered`;

type R<K extends AnyResult["kind"]> = Extract<AnyResult, { kind: K }>;

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
  // wall above: sill and studs (context)
  D.wood(-o.wall / 2, wallY, o.wall, 1.5);
  D.rect(-o.wall / 2, wallY + 1.5, o.wall, 10);
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
  D.note(`Bear on undisturbed native soil or approved compacted fill; q_a = ${fmt(o.qa, 0)} psf`, [0, -depth]);
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
  D.rect(-f.c1 / 2, Math.max(top, 0), f.c1, 14);
  D.note("Post above", [0, Math.max(top, 0) + 10]);
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
  D.note(`Bear on undisturbed native soil or approved compacted fill; q_a = ${fmt(f.qa, 0)} psf`, [0, bot]);
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

function tieIn(r: R<"tieIn">): Detail {
  const t = r.input;
  const D = new Draw();
  const H = Math.max(t.ha, 12);
  D.conc(-24, -H, 24, H);
  D.conc(0, -H, 24, H);
  D.line([0, -H - 3], [0, 3], true);
  const y = -H + t.ca1;
  D.line([-t.hef, y], [Math.min(t.hef, 20), y]);
  D.note(`Existing concrete, f'c = ${fmt(t.existing.fc, 0)} psi${t.existing.verified ? "" : " (assumed)"}`, [-20, -2]);
  D.note("New concrete", [20, -2]);
  D.note(t.joint, [0, -H]);
  D.note(
    `${t.anchor.size} ${t.anchor.kind === "rod" ? "threaded rod" : "dowels"} (${t.anchor.steelLabel}) @ ${fmt(t.spacing, 0)}" o.c., ${inch(t.hef)} embed. into existing, ${t.product.name}${t.product.report ? ` (${t.product.report})` : ""}`,
    [-t.hef / 2, y],
  );
  if (r.sf && t.shearFriction?.roughened) D.note('Roughen existing surface to 1/4" amplitude', [0, -H / 2]);
  D.dim([-t.hef, y], [0, y], -3, inch(t.hef));
  D.dim([0, -H], [0, y], 3, inch(t.ca1));
  return D.done("Tie-in to existing concrete", r.mark);
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
  const sx = b.rod.nx > 1 ? b.rod.sx || N - 2 * b.rod.e1 : 0;
  for (const x of b.rod.nx > 1 ? [-sx / 2, sx / 2] : [0])
    D.anchor(x, g + tp + 1.5, -b.rod.hef, b.rod.d, b.rod.type === "hooked" ? "hook" : "head");
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

function transfer(r: R<"transfer">, p: Project): Detail {
  const t = r.input;
  const D = new Draw();
  D.wood(0, 0, 5.5, 1.5);
  D.wood(0, 1.5, 5.5, 1.5);
  D.rect(0, 3, 1.5, 11.25);
  D.rect(1.5, 3, 4, 11.25);
  D.line([0, 14.25], [24, 14.25]);
  D.line([0, 15], [24, 15]);
  D.wood(0, 15, 5.5, 1.5);
  D.rect(0, 16.5, 5.5, 12);
  D.rect(0, -12, 5.5, 12);
  const c = t.connector;
  const what =
    c.type === "clip"
      ? `${p.hardware.find((h) => h.id === c.hardwareId)?.model ?? "Clip"} @ ${fmt(t.spacing, 0)}" o.c.`
      : `${c.rows > 1 ? `${c.rows} rows ` : ""}${nailDef(c.nail).label} ${c.toenail ? "toenail" : "face nail"} @ ${fmt(t.spacing, 0)}" o.c.`;
  const at: Record<typeof t.interface, Pt> = {
    "diaphragm-to-wall": [5.5, 3],
    "sole-plate": [5.5, 15.75],
    "rim-to-sill": [1.5, 3],
    other: [5.5, 9],
  };
  const where: Record<typeof t.interface, string> = {
    "diaphragm-to-wall": "rim / blocking to top plate",
    "sole-plate": "sole plate to floor framing",
    "rim-to-sill": "rim to sill / top plate",
    other: "shear transfer",
  };
  D.note(`${where[t.interface]}: ${what}`, at[t.interface]);
  return D.done("Shear transfer", r.mark);
}

function diaphragm(r: R<"diaphragm">, p: Project): Detail {
  const g = r.input;
  const D = new Draw();
  D.wood(0, 0, 5.5, 1.5);
  D.wood(0, 1.5, 5.5, 1.5);
  D.rect(0, -24, 5.5, 24);
  D.wood(0.5, 3, 1.5, 9.25);
  D.rect(2, 3, 30, 9.25);
  D.line([0, 12.25], [32, 12.25]);
  D.line([0, 12.25 + 0.6], [32, 12.25 + 0.6]);
  D.note(`${g.level} sheathing: ${r.values.text}`, [16, 12.85]);
  D.note(g.blocked ? "Blocked diaphragm: block all panel edges" : "Unblocked diaphragm", [1.25, 8]);
  const sp = g.chord.splice;
  D.note(
    `Chord: (2) ${g.chord.size} ${g.chord.species} ${g.chord.grade} top plates; splice ${sp.type === "strap" ? (p.hardware.find((h) => h.id === sp.strapId)?.model ?? "strap") : `${sp.nails}-${nailDef(sp.nail).label} each side`}`,
    [5.5, 1.5],
  );
  return D.done(`${g.level} diaphragm boundary`, r.mark);
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

function wallSection(r: R<"wall">): Detail {
  const w = r.input;
  const D = new Draw();
  const [b, d] = dressed(w.size);
  const H = w.plateHeight * 12;
  D.wood(0, 0, d, 1.5 * w.bottomPlates);
  D.rect(0, 1.5 * w.bottomPlates, d, H - 1.5 * (w.topPlates + w.bottomPlates));
  for (let i = 0; i < w.topPlates; i++) D.wood(0, H - 1.5 * (i + 1), d, 1.5);
  if (w.sheathing !== "none") D.line([-0.5, 0], [-0.5, H]);
  if (w.sheathing === "both") D.line([d + 0.5, 0], [d + 0.5, H]);
  D.note(`${w.size} ${w.species} ${w.grade} studs @ ${fmt(w.spacing, 0)}" o.c.`, [d, H / 2]);
  D.note(`(${w.topPlates}) ${w.size} top plates`, [d, H - 1.5]);
  D.note(`(${w.bottomPlates}) ${w.size} bottom plate`, [d, 0.75]);
  if (w.sheathing === "none" && w.blocking) D.note(`Blocking @ ${fmtFtIn(w.blocking)} o.c.`, [d / 2, H / 2 - 12]);
  D.dim([0, 0], [0, H], 6, fmtFtIn(w.plateHeight));
  void b;
  return D.done("Bearing wall section", r.mark);
}

function opening(r: R<"wall">, i: number): Detail | undefined {
  const w = r.input;
  const o = w.openings[i];
  const hd = r.headers.find((x) => x.opening === o);
  const D = new Draw();
  const H = w.plateHeight * 12;
  const Lo = (o.x2 - o.x1) * 12;
  const head = (o.head ?? w.plateHeight - 1.5) * 12;
  const jk = o.jacks ?? 1;
  const tp = 1.5 * w.topPlates;
  const left = -(jk + o.kings) * 1.5;
  D.rect(left - 12, 0, Lo - 2 * left + 24, 1.5);
  D.rect(left - 12, H - tp, Lo - 2 * left + 24, tp);
  for (let k = 0; k < o.kings; k++) {
    D.rect(left + k * 1.5, 1.5, 1.5, H - tp - 1.5);
    D.rect(Lo - left - (k + 1) * 1.5, 1.5, 1.5, H - tp - 1.5);
  }
  for (let k = 0; k < jk; k++) {
    D.rect(-(k + 1) * 1.5, 1.5, 1.5, head - 1.5);
    D.rect(Lo + k * 1.5, 1.5, 1.5, head - 1.5);
  }
  D.rect(-jk * 1.5, head, Lo + 2 * jk * 1.5, Math.min(11.25, H - tp - head));
  if (o.type === "window" && o.sill !== undefined) {
    D.rect(0, o.sill * 12 - 1.5, Lo, 1.5);
    D.dim([Lo, 0], [Lo, o.sill * 12], -(jk + o.kings) * 1.5 - 8, fmtFtIn(o.sill));
  } else D.line([0, 0], [Lo, 0], true);
  D.note(`Header: ${o.header || "per schedule"}`, [Lo / 2, head + 5]);
  if (hd) D.note(`(${jk}) ${w.size} jack studs each side`, [-0.75, head / 2]);
  D.note(`(${o.kings}) ${w.size} king studs each side`, [left + 0.75, H * 0.75]);
  D.dim([0, head], [Lo, head], -(head - 6), fmtFtIn(Lo / 12));
  D.dim([left - 12, 0], [left - 12, head], 6, fmtFtIn(head / 12));
  return D.done(`${o.type ?? "Opening"} framing - ${o.label}`, r.mark);
}

function studPack(r: R<"wall">, i: number): Detail {
  const w = r.input;
  const k = w.packs[i];
  const D = new Draw();
  const H = w.plateHeight * 12;
  const tp = 1.5 * w.topPlates;
  D.rect(-24, 0, 48 + k.studs * 1.5, 1.5);
  D.rect(-24, H - tp, 48 + k.studs * 1.5, tp);
  for (let n = 0; n < k.studs; n++) D.rect(n * 1.5, 1.5, 1.5, H - tp - 1.5);
  D.rect(-1, H, k.studs * 1.5 + 2, 8);
  D.line([k.studs * 0.75, H + 18], [k.studs * 0.75, H + 8]);
  D.note("Point load above", [k.studs * 0.75, H + 14]);
  D.note(`(${k.studs}) ${w.size} ${w.species} ${w.grade} stud pack, plies nailed per NDS 15.3.3`, [
    k.studs * 1.5,
    H / 2,
  ]);
  D.note("Solid blocking / squash blocks below to foundation", [k.studs * 0.75, 0]);
  return D.done(`Stud pack${k.label ? ` - ${k.label}` : ""}`, r.mark);
}

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

function hanger(r: R<"connector">, p: Project, d: ProjectDesign): Detail {
  const D = new Draw();
  const src = [...d.outcomes.values()].find((o) => o.result?.mark === r.input.sourceMark)?.result;
  const sd =
    src && "input" in src && "size" in (src.input as object) ? dressed((src.input as { size: string }).size)[1] : 9.25;
  const bd = Math.max(sd + 2, 11.25);
  D.wood(-3.5, 0, 3.5, bd);
  D.rect(0, bd - sd, 30, sd);
  D.line([0, bd - sd - 0.2], [2.5, bd - sd - 0.2]);
  D.line([2.5, bd - sd - 0.2], [2.5, bd - 1]);
  D.line([0, bd - 1], [2.5, bd - 1]);
  const it = r.item;
  D.note(
    `${it.manufacturer} ${it.model} hanger${r.input.quantity > 1 ? ` (${r.input.quantity})` : ""}${it.fasteners ? ` w/ ${it.fasteners}` : ""}`,
    [2.5, bd - sd / 2],
  );
  D.note(`${r.input.sourceMark}${src ? ` ${src.callout}` : ""}`, [20, bd - sd / 2]);
  D.note(`${r.input.supportName}`, [-1.75, bd / 2]);
  void p;
  return D.done("Hanger connection", r.mark);
}

function postConnector(r: R<"connector">, base: boolean): Detail {
  const D = new Draw();
  const it = r.item;
  if (base) {
    D.conc(-12, -12, 24, 12);
    D.rect(-2.75, 1, 5.5, 30);
    D.rect(-3.25, 0, 6.5, 6);
    D.note(`${it.manufacturer} ${it.model} post base${it.fasteners ? ` w/ ${it.fasteners}` : ""}`, [3.25, 3]);
  } else {
    D.rect(-2.75, -30, 5.5, 30);
    D.rect(-12, 0, 24, 11.25);
    D.rect(-3.25, -6, 6.5, 17);
    D.note(`${it.manufacturer} ${it.model} post cap${it.fasteners ? ` w/ ${it.fasteners}` : ""}`, [3.25, -3]);
  }
  D.note(`${r.input.sourceMark} at ${r.input.supportName}`, [0, base ? 25 : 8]);
  return D.done(base ? "Post base" : "Beam on post", r.mark);
}

function tieConnector(r: R<"connector">, d: ProjectDesign): Detail {
  const D = new Draw();
  const src = [...d.outcomes.values()].find((o) => o.result?.mark === r.input.sourceMark)?.result;
  const raf = src?.kind === "rafter" ? src.input : undefined;
  const slope = raf ? raf.rise / 12 : 5 / 12;
  const dd = raf ? dressed(raf.size)[1] : 7.25;
  D.wood(-5.5, 0, 5.5, 1.5);
  D.wood(-5.5, 1.5, 5.5, 1.5);
  D.rect(-5.5, -30, 5.5, 30);
  const L = 36;
  const yb = 3 - (raf?.seatCut ?? 1.5);
  D.line([-L, yb + 3 - (L - 0) * slope + 0], [12, yb + 3 + 12 * slope]);
  D.line(
    [-L, yb + 3 - L * slope + dd / Math.cos(Math.atan(slope))],
    [12, yb + 3 + 12 * slope + dd / Math.cos(Math.atan(slope))],
  );
  D.rect(0, 0, 1.5, 8);
  D.note(
    `${r.item.manufacturer} ${r.item.model}${r.input.quantity > 1 ? ` (${r.input.quantity})` : ""} at each ${r.input.sourceMark}${r.item.fasteners ? ` w/ ${r.item.fasteners}` : ""}`,
    [1.5, 4],
  );
  if (src) D.note(`${src.mark} ${src.callout}`, [-L / 2, yb + 3 - (L / 2) * slope + dd]);
  return D.done("Roof framing tie-down", r.mark);
}

function rafterSeat(r: R<"rafter">): Detail {
  const f = r.input;
  const D = new Draw();
  const slope = f.rise / 12;
  const dd = dressed(f.size)[1] / Math.cos(Math.atan(slope));
  D.wood(-5.5, -1.5, 5.5, 1.5);
  D.wood(-5.5, -3, 5.5, 1.5);
  D.rect(-5.5, -30, 5.5, 27);
  const y0 = -f.seatCut;
  const xl = -(f.plateSeat || 3.5);
  D.line([xl - 30, y0 - 30 * slope], [24, y0 + (24 - xl) * slope]);
  D.line([xl - 30, y0 - 30 * slope + dd], [24, y0 + (24 - xl) * slope + dd]);
  D.line([xl, 0], [0, 0]);
  D.note(`${f.size} ${f.species} ${f.grade} rafters @ ${fmt(f.spacing, 0)}" o.c., ${fmt(f.rise, 2)}:12`, [
    12,
    y0 + (12 - xl) * slope + dd / 2,
  ]);
  D.note(`Birdsmouth: ${inch(f.plateSeat)} bearing, ${inch(f.seatCut)} max. seat cut`, [xl / 2, 0]);
  return D.done("Rafter at top plate", r.mark);
}

function ridge(r: R<"rafter">): Detail {
  const f = r.input;
  const D = new Draw();
  const slope = f.rise / 12;
  const dd = dressed(f.size)[1] / Math.cos(Math.atan(slope));
  const rd = f.ridge === "beam" ? 11.25 : dd + 1.5;
  const rb = f.ridge === "beam" ? 3.5 : 1.5;
  D.wood(-rb / 2, -rd + dd, rb, rd);
  for (const s of [-1, 1]) {
    D.line([(s * rb) / 2, 0], [s * 36, -36 * slope + 0]);
    D.line([(s * rb) / 2, dd], [s * 36, -36 * slope + dd]);
  }
  D.note(`${f.size} rafters @ ${fmt(f.spacing, 0)}" o.c.`, [24, -24 * slope + dd / 2]);
  D.note(
    f.ridge === "beam"
      ? f.ridgeSeat > 0
        ? `Ridge beam per schedule; ${inch(f.ridgeSeat)} min. seat`
        : "Ridge beam per schedule; rafters on hangers"
      : "Ridge board; rafters tied by ceiling joists / rafter ties",
    [0, -rd + dd + 2],
  );
  return D.done(f.ridge === "beam" ? "Rafters at ridge beam" : "Rafters at ridge board", r.mark);
}

function heel(r: R<"ceilingJoist">): Detail | undefined {
  const c = r.input;
  if (!c.heel) return undefined;
  const D = new Draw();
  const [, dd] = dressed(c.size);
  D.wood(-5.5, -1.5, 5.5, 1.5);
  D.wood(-5.5, -3, 5.5, 1.5);
  D.rect(-5.5, -30, 5.5, 27);
  D.rect(-5.5, 0, 36, dd);
  D.line([-5.5, dd - 1], [30, dd + 14]);
  D.line([-5.5, dd + 6], [30, dd + 21]);
  for (let i = 0; i < c.heel.count; i++) D.circle([-2 + i * 2.5, dd / 2 + 1], 0.2);
  D.note(`${c.size} ${c.species} ${c.grade} ceiling joists @ ${fmt(c.spacing, 0)}" o.c.`, [20, dd / 2]);
  D.note(`${c.heel.count}-${nailDef(c.heel.nail).label} face nail each heel`, [0, dd / 2 + 1]);
  return D.done("Ceiling joist heel joint", r.mark);
}

function trussBearing(r: R<"truss">): Detail {
  const t = r.input;
  const D = new Draw();
  const [, pd] = dressed(t.plate.size);
  D.wood(-pd, -1.5, pd, 1.5);
  D.wood(-pd, -3, pd, 1.5);
  D.rect(-pd, -30, pd, 27);
  D.line([-pd - 6, 0], [30, 0]);
  D.line([-pd - 6, 3.5], [30, 3.5]);
  D.line([-pd - 6, 3.5], [30, 3.5 + 36 * (5 / 12)]);
  D.note(
    `${t.girder ? `(${t.plies}) ply girder truss` : `Trusses @ ${fmt(t.spacing, 0)}" o.c.`}${t.designRef ? ` per ${t.designRef}` : ""}`,
    [15, 2],
  );
  D.note(`Bearing on (2) ${t.plate.size} ${t.plate.species} ${t.plate.grade} top plates`, [-pd / 2, -1.5]);
  return D.done("Truss bearing", r.mark);
}

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

function joistBearing(r: R<"joist"> | R<"ijoist">): Detail {
  const D = new Draw();
  const size = r.kind === "joist" ? r.input.size : "2x12";
  // I-joist depth '11-7/8"' → 11.875
  const frac = (t: string) =>
    t
      .split("-")
      .reduce((a, x) => a + (x.includes("/") ? Number(x.split("/")[0]) / Number(x.split("/")[1]) : Number(x)), 0);
  const dd = r.kind === "joist" ? dressed(size)[1] : frac(String(r.input.depth).replace(/"/g, "")) || 11.875;
  const lb = Math.min(...r.input.bearing);
  D.wood(-5.5, -1.5, 5.5, 1.5);
  D.wood(-5.5, -3, 5.5, 1.5);
  D.rect(-5.5, -30, 5.5, 27);
  D.rect(-lb, 0, 30 + lb, dd);
  D.note(r.callout, [15, dd / 2]);
  D.note(`${inch(lb)} min. bearing`, [-lb / 2, 0]);
  D.dim([-lb, dd], [0, dd], 3, inch(lb));
  return D.done(r.kind === "ijoist" ? "I-joist bearing" : "Joist bearing", r.mark);
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

function guardPost(r: R<"guardPost">): Detail {
  const g = r.input;
  const D = new Draw();
  const [pb, pd] = dressed(g.post.size);
  const H = g.guardHeight * 12;
  D.rect(0, -11.25, 1.5, 11.25);
  D.rect(-36, -11.25, 36, 11.25);
  D.rect(1.5, -10, g.wideFaceToRim ? pd : pb, H + 10);
  D.circle([1.5 + pb / 2, -g.topBolt], g.bolt.d / 2);
  D.circle([1.5 + pb / 2, -g.topBolt - g.s], g.bolt.d / 2);
  D.rect(-8, -9, 2.5, 7);
  D.note(`${g.post.size} ${g.post.species} ${g.post.grade} guard post`, [1.5 + pb, H / 2]);
  D.note(`(2) ${g.bolt.label} through-bolts w/ washers`, [1.5 + pb / 2, -g.topBolt]);
  D.note(`${g.device.model} tension device`, [-6.75, -5]);
  D.dim([1.5 + pb, -g.topBolt], [1.5 + pb, -g.topBolt - g.s], -6, inch(g.s));
  D.dim([1.5 + pb, 0], [1.5 + pb, H], -6, fmtFtIn(g.guardHeight));
  return D.done("Guard post attachment", r.mark);
}

function steelBeamBearing(r: R<"steelBeam">): Detail {
  const b = r.input;
  const D = new Draw();
  const brg = b.bearing[0] ?? { lb: 3.5, support: "steel" as const };
  D.rect(-brg.lb, 0, 30 + brg.lb, 10);
  D.line([-brg.lb, 0.5], [30, 0.5]);
  D.line([-brg.lb, 9.5], [30, 9.5]);
  if (brg.support === "concrete") D.conc(-brg.lb - 6, -18, brg.lb + 12, 18);
  else D.rect(-brg.lb, -24, brg.lb + 2, 24);
  D.note(`${b.shape} (${b.grade})`, [15, 5]);
  D.note(`${inch(brg.lb)} min. bearing on ${brg.size ? `${brg.size} ` : ""}${brg.support}`, [-brg.lb / 2, 0]);
  D.dim([-brg.lb, 10], [0, 10], 3, inch(brg.lb));
  return D.done("Steel beam bearing", r.mark);
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

/* ------------------------------------------------------------------ assemble */

export function projectDetails(p: Project, d: ProjectDesign): Detail[] {
  const out: Detail[] = [];
  const add = (x: Detail | undefined) => x && out.push(x);
  for (const o of d.outcomes.values()) {
    const r = o.result;
    if (!r) continue;
    switch (r.kind) {
      case "footing":
        add(footing(r));
        break;
      case "holdownFooting":
        add(holdownFooting(r));
        break;
      case "tieIn":
        add(tieIn(r));
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
        add(holdown(r));
        add(sillAnchor(r));
        add(shearWallElevation(r));
        break;
      case "shearPanel":
        add(shearPanel(r));
        break;
      case "transfer":
        add(transfer(r, p));
        break;
      case "diaphragm":
        add(diaphragm(r, p));
        break;
      case "uplift":
        add(upliftPath(r));
        break;
      case "wall":
        add(wallSection(r));
        r.input.openings.forEach((_, i) => add(opening(r, i)));
        r.input.packs.forEach((_, i) => add(studPack(r, i)));
        break;
      case "cfsWall":
        add(cfsWall(r));
        break;
      case "connector":
        if (r.item.kind === "hanger") add(hanger(r, p, d));
        else if (r.item.kind === "post-cap") add(postConnector(r, false));
        else if (r.item.kind === "post-base") add(postConnector(r, true));
        else if (r.item.kind === "tie") add(tieConnector(r, d));
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
        add(sister(r));
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
        add(ledger(r));
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
    const key = JSON.stringify([x.title, x.prims, x.notes]);
    const m = merged.get(key);
    if (m) m.marks.push(...x.marks.filter((k) => !m.marks.includes(k)));
    else merged.set(key, { ...x, marks: [...x.marks] });
  }
  const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...merged.values()].map((x) => ({ ...x, marks: x.marks.sort(nat) }));
}
