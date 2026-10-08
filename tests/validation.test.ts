/**
 * Phase 5 portfolio validation (PLAN.md §12.1, §14): every automated Tedds sheet in the
 * 14 portfolio permit sets (verification/portfolio/cases.json, normalised from the sheets
 * copied verbatim into verification/portfolio/sets) is re-run through the HouseCalc
 * engine with the sheet's own inputs, and each printed value is compared.
 *
 * Tolerance: half a unit of the last printed digit or 0.5 %, whichever is larger.
 * A value outside tolerance must be listed in verification/portfolio/differences.json
 * with the reason (a documented difference between HouseCalc and the sheet); anything
 * else fails. Run with UPDATE_REGISTER=1 to rewrite the register
 * (verification/portfolio/register.json and VALIDATION.md).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LoadType } from "@/engine/core/loads";
import type { Grade, Species } from "@/engine/data/sawn";
import { defaultHardware } from "@/engine/data/hardware";
import { panel1532Shear, sheathingRow } from "@/engine/data/sdpws";
import { defaultAssemblies } from "@/engine/loads/dead";
import type { DesignContext } from "@/engine/members";
import { designFooting } from "@/engine/members/footing";
import { designPost } from "@/engine/members/post";
import { designShearWall, type ShearWallResult } from "@/engine/members/shearWall";
import { ENGINE_VERSION, DATA_VERSION } from "@/engine/version";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(root + p, "utf8"));

interface Printed {
  v: number;
  dec: number;
}
interface Side {
  material: string | null;
  fastener: string | null;
  key: string | null;
  spacing: number | null;
  vs: number;
  vw: number;
  Ga: number;
}
interface SwCase {
  id: string;
  set: string;
  kind: "shearWall";
  section: string;
  h: number;
  b: number | null;
  segments: number[];
  openings: number;
  species: Species;
  grade: Grade;
  stud: string;
  spacing: number;
  post: { size: string; plies: number };
  holeDia: number;
  ka: number;
  sides: Side[];
  loads: Record<"D" | "Lf" | "Lr" | "S" | "Swt" | "W" | "Eq" | "SDS", number>;
  fWserv: number;
  Cd: number | null;
  Ie: number | null;
  expected: Record<string, Printed>;
}
interface PostCase {
  id: string;
  set: string;
  kind: "post";
  section: string;
  species: Species;
  grade: Grade;
  size: string;
  Lx: number;
  type: LoadType | null;
  P: number;
  Mx: number;
  expected: Record<string, Printed>;
}
interface FootingCase {
  id: string;
  set: string;
  kind: "footing";
  type: "strip" | "pad";
  section: string;
  Lx: number;
  Ly: number;
  h: number;
  hsoil: number;
  wall: number;
  col: [number, number];
  qallow: number;
  fc: number;
  fy: number;
  cover: number;
  gammaSoil: number;
  bars: string | null;
  loads: Partial<Record<LoadType, number>>;
  expected: Record<string, Printed>;
}
type Case = SwCase | PostCase | FootingCase;

export interface RegisterRow {
  case: string;
  set: string;
  kind: string;
  section: string;
  quantity: string;
  tedds: number;
  dec: number;
  housecalc: number | null;
  diff: number | null;
  status: "match" | "documented" | "mismatch" | "not computed";
  note?: string;
}

const cases: Case[] = read("verification/portfolio/cases.json").cases;
const differences: Array<{ case: string; quantity: string; reason: string }> = read(
  "verification/portfolio/differences.json",
).differences;

const ctxFor = (SDS = 1): DesignContext => ({
  cycleId: "2025",
  liveBasis: "IRC",
  assemblies: defaultAssemblies(),
  roofLive: { L0: 20, reduce: false },
  snow: { pg: 0, Ce: 1, Ct: 1, Is: 1, slippery: false },
  Kcr: 1,
  SDS,
  hardware: defaultHardware(),
  concrete: { fc: 2500, fy: 60000 },
});

const tolerance = (p: Printed) => Math.max(0.005 * Math.abs(p.v), 0.5 * 10 ** -p.dec) + 1e-9;

function documented(caseId: string, q: string) {
  return differences.find((d) => new RegExp(`^${d.case}$`).test(caseId) && new RegExp(`^${d.quantity}$`).test(q));
}

function compare(c: Case, values: Record<string, number | undefined>, rows: RegisterRow[]) {
  for (const [q, p] of Object.entries(c.expected)) {
    const hc = values[q];
    const doc = documented(c.id, q);
    if (hc === undefined || !Number.isFinite(hc)) {
      rows.push({
        case: c.id,
        set: c.set,
        kind: c.kind,
        section: c.section,
        quantity: q,
        tedds: p.v,
        dec: p.dec,
        housecalc: null,
        diff: null,
        status: doc ? "documented" : "not computed",
        note: doc?.reason,
      });
      continue;
    }
    const diff = hc - p.v;
    const ok = Math.abs(diff) <= tolerance(p);
    rows.push({
      case: c.id,
      set: c.set,
      kind: c.kind,
      section: c.section,
      quantity: q,
      tedds: p.v,
      dec: p.dec,
      housecalc: hc,
      diff,
      status: ok ? "match" : doc ? "documented" : "mismatch",
      note: ok ? undefined : doc?.reason,
    });
  }
}

// ---------------------------------------------------------------- shear walls
function swInput(c: SwCase, b: number) {
  const sides = c.sides.map((s) => ({
    key: s.key ?? (/gypsum/i.test(s.material ?? "") ? "GWB-5/8-4-blocked" : "SH-7/16-8d"),
    spacing: s.spacing ?? 4,
    vsOverride: s.vs,
    GaOverride: s.Ga,
  }));
  return {
    id: c.id,
    mark: c.section,
    description: "",
    lineId: "l",
    b,
    h: c.h,
    sides,
    stud: { species: c.species, grade: c.grade, size: c.stud, spacing: c.spacing },
    endPost: { size: c.post.size, plies: c.post.plies, holeDia: c.holeDia },
    top: { D: c.loads.D, L: c.loads.Lf, Lr: c.loads.Lr, S: c.loads.S },
    self: { psf: c.loads.Swt },
    overturning: "endpost" as const,
    sill: { type: "cast-in" as const, d: 0.625, spacing: 48, embed: 7, edge: 1.75 },
    sillSize: c.stud,
    ka: c.ka,
    windService: { factor: c.fWserv, limitN: 600 },
  };
}

function runShearWall(c: SwCase): Record<string, number | undefined> {
  const ctx = ctxFor(c.loads.SDS || 1);
  const dem = {
    lineName: "Line",
    share: 1,
    Eh: c.loads.Eq,
    QE: c.loads.Eq,
    W: c.loads.W,
    rho: 1,
    SDS: c.loads.SDS || 1,
    Cd: c.Cd ?? 4,
    Ie: c.Ie ?? 1,
    Omega0: 3,
    hsx: c.h,
    driftFactor: 0.02,
    seismicSDC: "D",
  };
  const segs = c.segments.length ? c.segments : [c.b!];
  const single = segs.length === 1 && !c.openings;
  const results: ShearWallResult[] = segs.map((b) => designShearWall(ctx, swInput(c, b), dem));
  const r = results[0];
  // Tedds segmented capacity: segments within the aspect-ratio limit only
  const qualifying = results.filter((x) => x.aspect <= x.maxAspect + 1e-9);
  const Vs = qualifying.reduce((a, x) => a + x.vAllowS * x.input.b, 0);
  const Vw = qualifying.reduce((a, x) => a + x.vAllowW * x.input.b, 0);
  const col = r.compression.col.governing;
  const out: Record<string, number | undefined> = {
    vsc: r.vsc,
    vwc: r.vwc,
    Gac: r.Gac,
    CD: col.CD,
    CFc: r.post.CFc,
    CFt: r.post.CFt,
    FcE: col.FcE1,
    FcStar: col.FcStar,
    CP: col.CP,
    FcPrime: col.FcPrime,
    FtPrime: r.tension.Ft,
    Vs,
    Vw,
  };
  if (single) {
    out.C = r.compression.C;
    const seisT = r.chord.filter((x) => x.kind === "wind" || x.kind === "seismic");
    out.T = Math.max(...seisT.map((x) => x.T));
    out.dsww = r.windDefl.d;
    out.dsws = r.drift.dx;
  }
  return out;
}

// ---------------------------------------------------------------- posts
function runPost(c: PostCase): Record<string, number | undefined> {
  const r = designPost(ctxFor(), {
    id: c.id,
    mark: c.section,
    description: "",
    material: { kind: "sawn", species: c.species, grade: c.grade, size: c.size, plies: 1 },
    height: c.Lx,
    Ke: 1,
    extra: [{ kind: "point", type: c.type ?? "D", label: "Load", P: c.P }],
    eccentricity: c.Mx ? (c.Mx * 12) / c.P : 0,
    bearing: { on: "concrete" },
    selfWeight: false,
  });
  const g = r.col.governing;
  return {
    CD: g.CD,
    FcStar: g.FcStar,
    FcE: g.FcE1,
    CP: g.CP,
    FcPrime: g.FcPrime,
    fc: g.fc,
    FbPrime: g.FbPrime,
    fb: g.fb,
    interaction: g.interaction,
  };
}

// ---------------------------------------------------------------- footings
function parseBars(text: string | null) {
  const m = /No\.?\s*(\d)\s*bars?\s*at\s*([\d.]+)\s*in/i.exec(text ?? "");
  if (m) return { size: `#${m[1]}`, spacing: Number(m[2]) };
  const n = /(\d+)\s*No\.?\s*(\d)\s*(?:bottom\s*)?bars?/i.exec(text ?? "");
  return n ? { size: `#${n[2]}`, count: Number(n[1]) } : undefined;
}

function runFooting(c: FootingCase): Record<string, number | undefined> {
  const strip = c.type === "strip";
  const extra = Object.entries(c.loads).map(([t, v]) =>
    strip
      ? { kind: "line" as const, type: t as LoadType, label: t, w: v }
      : { kind: "point" as const, type: t as LoadType, label: t, P: v },
  );
  const r = designFooting(
    { ...ctxFor(), concrete: { fc: c.fc, fy: c.fy } },
    {
      id: c.id,
      mark: c.section,
      description: "",
      type: c.type,
      B: strip ? c.Ly : c.Lx,
      L: strip ? undefined : c.Ly,
      h: c.h,
      depth: c.h + c.hsoil,
      soilOver: c.hsoil,
      c1: strip ? c.wall || 6 : c.col[0] || 6,
      c2: strip ? undefined : c.col[1] || 6,
      fc: c.fc,
      fy: c.fy,
      cover: c.cover,
      rebar: parseBars(c.bars),
      extra,
      qa: c.qallow * (c.qallow < 50 ? 1000 : 1),
      qaSource: "calc sheet",
      soilDensity: c.gammaSoil,
      stories: 1,
    },
  );
  const k = r.concrete;
  const width = strip ? 1 : c.Ly;
  return {
    qmax: r.serviceGov.q,
    d: k.d,
    a: k.flex?.a,
    epsT: k.flex?.epsT,
    phiMn: strip ? k.phiMn : k.phiMn,
    AsMin: k.AsMin !== undefined ? (strip ? k.AsMin : k.AsMin * (width / width)) : undefined,
  };
}

// ---------------------------------------------------------------- run
const rows: RegisterRow[] = [];
const errors: Array<{ case: string; error: string }> = [];
for (const c of cases) {
  try {
    const v = c.kind === "shearWall" ? runShearWall(c) : c.kind === "post" ? runPost(c) : runFooting(c);
    compare(c, v, rows);
  } catch (e) {
    errors.push({ case: c.id, error: e instanceof Error ? e.message : String(e) });
  }
}

describe("portfolio validation — every automated Tedds value", () => {
  it("each sheet runs", () => {
    const undocumented = errors.filter((e) => !documented(e.case, "run"));
    expect(undocumented, JSON.stringify(undocumented, null, 1)).toEqual([]);
  });

  it("every value matches, or the difference is documented", () => {
    const bad = rows.filter((r) => r.status === "mismatch" || r.status === "not computed");
    expect(
      bad.map((r) => `${r.case} ${r.quantity}: Tedds ${r.tedds}, HouseCalc ${r.housecalc}`),
      "undocumented differences",
    ).toEqual([]);
  });

  it("every documented difference is still needed", () => {
    const used = differences.filter(
      (d) =>
        rows.some((r) => r.status === "documented" && documented(r.case, r.quantity) === d) ||
        errors.some((e) => documented(e.case, "run") === d),
    );
    expect(differences.length - used.length, "stale entries in differences.json").toBe(0);
  });

  it("sheathing library matches the SDPWS values printed on the sheets", () => {
    const sides = cases.flatMap((c) => (c.kind === "shearWall" ? c.sides : []));
    const off = sides.filter((s) => {
      if (!s.key || !s.spacing) return true;
      const row = sheathingRow(s.key);
      const base = row.vs[s.spacing as 6 | 4 | 3 | 2];
      // Tedds applies the Table 4.3A footnote (15/32 in. values) where it qualifies
      const alt = panel1532Shear(s.key, s.spacing)?.vs;
      const vs = alt !== undefined && s.vs === alt ? alt : base;
      const Ga = row.Ga[s.spacing as 6 | 4 | 3 | 2];
      const vw = row.family === "wsp" ? Math.round((1.4 * (vs ?? 0)) / 5) * 5 : vs;
      return vs !== s.vs || Ga !== s.Ga || vw !== s.vw;
    });
    expect(off.map((s) => `${s.material} / ${s.fastener}`)).toEqual([]);
  });
});

if (process.env.UPDATE_REGISTER) {
  const bySet = new Map<string, RegisterRow[]>();
  for (const r of rows) bySet.set(r.set, [...(bySet.get(r.set) ?? []), r]);
  const notAuto: string[] = read("verification/portfolio/cases.json").notAutomated;
  writeFileSync(
    root + "verification/portfolio/register.json",
    JSON.stringify({ engine: ENGINE_VERSION, data: DATA_VERSION, rows, errors }, null, 1) + "\n",
  );
  const fmtv = (v: number | null, dec: number) => (v === null ? "—" : v.toFixed(Math.min(4, Math.max(dec, 0))));
  const lines: string[] = [];
  lines.push("# HouseCalc — portfolio validation register");
  lines.push("");
  lines.push(
    `Engine ${ENGINE_VERSION}, data library v${DATA_VERSION}. Generated by \`UPDATE_REGISTER=1 bunx vitest run tests/validation.test.ts\` from verification/portfolio/cases.json.`,
  );
  lines.push("");
  lines.push(
    "Each Tedds value printed on the automated sheets of the 14 portfolio permit sets is recomputed by HouseCalc with the sheet's own inputs. Tolerance: half a unit of the last printed digit or 0.5 %. **Documented** values differ for the reason given (HouseCalc is the code-conforming value unless stated). The register checks the calculation engine for identical inputs; it does not endorse the sheets' loads (PLAN.md §2B Q1).",
  );
  lines.push("");
  lines.push("## Summary by set");
  lines.push("");
  lines.push("| Set | Sheets | Values | Match | Documented | Mismatch |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  let tot = { s: 0, v: 0, m: 0, d: 0, x: 0 };
  for (const [set, rs] of [...bySet.entries()].sort()) {
    const s = new Set(rs.map((r) => r.case)).size;
    const m = rs.filter((r) => r.status === "match").length;
    const d = rs.filter((r) => r.status === "documented").length;
    const x = rs.length - m - d;
    tot = { s: tot.s + s, v: tot.v + rs.length, m: tot.m + m, d: tot.d + d, x: tot.x + x };
    lines.push(`| ${set} | ${s} | ${rs.length} | ${m} | ${d} | ${x} |`);
  }
  lines.push(`| **Total** | **${tot.s}** | **${tot.v}** | **${tot.m}** | **${tot.d}** | **${tot.x}** |`);
  lines.push("");
  lines.push("## Documented differences");
  lines.push("");
  lines.push("| Case | Quantity | Tedds | HouseCalc | Reason |");
  lines.push("|---|---|---:|---:|---|");
  for (const r of rows.filter((x) => x.status === "documented"))
    lines.push(
      `| ${r.case} | ${r.quantity} | ${fmtv(r.tedds, r.dec)} | ${fmtv(r.housecalc, r.dec + 1)} | ${r.note ?? ""} |`,
    );
  for (const e of errors) lines.push(`| ${e.case} | run | — | — | ${documented(e.case, "run")?.reason ?? e.error} |`);
  lines.push("");
  lines.push("## Package QC observations");
  lines.push("");
  lines.push(
    "Cross-checks recorded while the sheets were transcribed (calculation vs drawings, editions, loads). They are review notes on the past packages for the Engineer of Record to confirm; each maps to a PLAN.md §2B safeguard that HouseCalc applies on new work.",
  );
  lines.push("");
  for (const f of readdirSync(root + "verification/portfolio/sets").sort()) {
    const d = read(`verification/portfolio/sets/${f}`);
    const obs: string[] = d.observations ?? [];
    if (!obs.length) continue;
    lines.push(`### ${d.set}`);
    lines.push("");
    for (const o of obs) lines.push(`- ${o.replace(/\|/g, "\\|")}`);
    lines.push("");
  }
  lines.push("## Sheets not automated");
  lines.push("");
  lines.push(
    "Hand-written reports, MiTek truss output and member sheets with load arrangements outside the normaliser are checked by the targeted parity tests (tests/portfolio.test.ts, phase2–4 tests) or listed for the EOR:",
  );
  lines.push("");
  for (const n of notAuto) lines.push(`- ${n}`);
  lines.push("");
  lines.push("## All values");
  lines.push("");
  lines.push("| Case | Quantity | Tedds | HouseCalc | Status |");
  lines.push("|---|---|---:|---:|---|");
  for (const r of rows)
    lines.push(
      `| ${r.case} | ${r.quantity} | ${fmtv(r.tedds, r.dec)} | ${fmtv(r.housecalc, r.dec + 1)} | ${r.status} |`,
    );
  writeFileSync(root + "VALIDATION.md", lines.join("\n") + "\n");
}
