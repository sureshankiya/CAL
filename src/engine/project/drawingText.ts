/**
 * Drawing PDF text → drawing-data document (no AI).
 *
 * CAD-exported structural drawings carry their notes, schedules and callouts as a text
 * layer. readDrawingText() reads that text page by page and writes a drawing-data document in
 * the format convertDrawingData() understands (drawingData.ts): criteria found in the notes,
 * beam / wall / footing schedules, joist callouts, posts, openings and the typical header
 * schedule, with the page text appended for reference. Only what is written on the drawings is
 * taken; anything incomplete in the text layer (a fraction lost from "HSS 6X6X1") is reported,
 * not completed. Outlined or scanned text is not in the text layer — those pages need the AI
 * reader or manual entry.
 */

import { findHardware } from "./drawingHardware";

export interface DrawingPageText {
  page: number;
  /** sheet number from the title block, if known (S-2.1) */
  sheet?: string;
  text: string;
}

export interface DrawingTextResult {
  /** drawing-data document for convertDrawingData() */
  document: string;
  /** what was found, by item */
  found: string[];
  /** text that could not be completed or read */
  issues: string[];
  /** pages with little or no text (outlined / scanned) */
  emptyPages: number[];
}

const FRACTIONS: Record<string, string> = {
  "¼": "-1/4",
  "½": "-1/2",
  "¾": "-3/4",
  "⅛": "-1/8",
  "⅜": "-3/8",
  "⅝": "-5/8",
  "⅞": "-7/8",
};

/** line separating a page's horizontal text from its rotated (vertical) text */
export const VERTICAL_TEXT = "[vertical text]";

/** unicode fractions, primes and spacing normalised: 1¾" → 1-3/4", 11 7/8" → 11-7/8" */
export function normaliseDrawingText(s: string): string {
  return s
    .replace(/(\d)\s*([¼½¾⅛⅜⅝⅞])/g, (_, d: string, f: string) => d + FRACTIONS[f])
    .replace(/[¼½¾⅛⅜⅝⅞]/g, (f) => FRACTIONS[f].slice(1))
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/''/g, '"')
    .replace(/(\d+)\s+(\d+\/\d+)/g, "$1-$2")
    .replace(/[ \t]+/g, " ");
}

const AREA = /(MASTER SUITE|FIRST FLOOR|SECOND FLOOR|THIRD FLOOR|ROOF|CARPORT|DECK|GARAGE|FOUNDATION)/i;
const cap = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const AREA_WORD: Array<[RegExp, string]> = [
  [/MASTER/i, "Master"],
  [/CARPORT/i, "Carport"],
  [/FIRST|GROUND|MAIN|LOWER/i, "First floor"],
  [/SECOND|UPPER/i, "Second floor"],
  [/THIRD/i, "Third floor"],
  [/ROOF/i, "Roof"],
  [/DECK/i, "Deck"],
];
const areaWord = (s: string) => AREA_WORD.find(([re]) => re.test(s))?.[1];

/** plan title ("PROPOSED SECOND WALL LAYOUT PLAN"), then a schedule title, then sections → area */
function areaOf(text: string): string | undefined {
  const plan = /PROPOSED\s+([A-Z ]+?)\s+(?:FOUNDATION|WALL|FRAMING|FLOOR FRAMING|ROOF FRAMING|LAYOUT)\b/i.exec(text);
  if (plan && areaWord(plan[1])) return areaWord(plan[1]);
  const wall = /([A-Z ]+?)\s+(?:WALL|FOUNDATION)\s+SCHEDULE/i.exec(text);
  if (wall && areaWord(wall[1])) return areaWord(wall[1]);
  if (/\bSECTION\s+[A-Z]-[A-Z]\b|\bSECTIONS\b/i.test(text)) return "Sections";
  const sched = /SCHEDULE\s*:?-?\s*([A-Z ]+)/i.exec(text);
  return sched ? areaWord(sched[1]) : undefined;
}

const SIZE_SCL = /\((\d)\)\s*(\d+(?:-\d+\/\d+)?)"?\s*x\s*(\d+(?:-\d+\/\d+)?)"?/i;
const SIZE_SAWN = /\((\d)\)\s*(\d{1,2})\s*x\s*(\d{1,2})\b/i;
const SIZE_ONE = /\b(\d{1,2})\s*x\s*(\d{1,2})\b(?!\s*")/i;
const BEAM_MARK = /\b((?:RB|GB|FB|DB|B)\d{1,4}[A-Z]?)\b/;

function beamSize(line: string): string | undefined {
  const saw = SIZE_SAWN.exec(line);
  const scl = SIZE_SCL.exec(line);
  if (saw && !(scl && (/[-/]/.test(scl[2] + scl[3]) || /LVL|PSL|LSL|GLB|GLULAM/i.test(line))))
    return `(${saw[1]}) ${saw[2]}x${saw[3]}`;
  if (scl) return `(${scl[1]}) ${scl[2]} x ${scl[3]} in`;
  return undefined;
}

export function readDrawingText(name: string, pages: DrawingPageText[]): DrawingTextResult {
  const found: string[] = [];
  const issues: string[] = [];
  const emptyPages: number[] = [];
  const P = pages.map((p) => {
    const text = normaliseDrawingText(p.text);
    const sheet =
      p.sheet ||
      [...text.matchAll(/^\s*(S-\d+(?:\.\d+)?)\s*$/gm)].map((m) => m[1]).pop() ||
      /\b(S-\d+(?:\.\d+)?)\b/.exec(text)?.[1] ||
      `p.${p.page}`;
    if (text.replace(/\s+/g, "").length < 80) emptyPages.push(p.page);
    return {
      ...p,
      text,
      sheet,
      lines: text
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      area: areaOf(text),
    };
  });
  const all = P.map((p) => p.text).join("\n");

  /* ------------------------------------------------------ information */
  const addr =
    /\b(\d{2,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:LANE|LN|STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|COURT|CT|WAY|BOULEVARD|BLVD|PLACE|PL|CIRCLE|TERRACE)\b\.?(?:,?\s+[A-Z][A-Za-z ]+,?\s+CA\.?\s*\d{5})?)/i.exec(
      all,
    )?.[1];
  const date = /DATE\s*(?:ISSUED)?\s*:?\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(all)?.[1];
  if (addr) found.push(`Address: ${addr}`);
  if (date) found.push(`Issue date: ${date}`);

  /* -------------------------------------------------------- criteria */
  const crit: Array<[string, string]> = [];
  const pick = (label: string, re: RegExp, fmt: (m: RegExpExecArray) => string) => {
    const m = re.exec(all);
    if (!m) return;
    crit.push([label, fmt(m)]);
    found.push(`${label}: ${fmt(m)}`);
  };
  pick("Roof live", /ROOF\s*(?:LIVE(?:\s*LOAD)?|LL)\s*[:=]?\s*(\d{2})\s*PSF/i, (m) => `${m[1]} psf`);
  pick("Roof dead", /ROOF\s*(?:DEAD(?:\s*LOAD)?|DL)\s*[:=]?\s*(\d{1,2})\s*PSF/i, (m) => `${m[1]} psf`);
  pick("Floor live", /FLOOR\s*(?:LIVE(?:\s*LOAD)?|LL)\s*[:=]?\s*(\d{2,3})\s*PSF/i, (m) => `${m[1]} psf`);
  pick("Floor dead", /FLOOR\s*(?:DEAD(?:\s*LOAD)?|DL)\s*[:=]?\s*(\d{1,2})\s*PSF/i, (m) => `${m[1]} psf`);
  pick("Occupancy category", /(?:RISK|OCCUPANCY)\s*CATEGORY\s*[:=]?\s*(IV|III|II|I)\b/i, (m) => m[1]);
  pick("Seismic design category", /SEISMIC\s*DESIGN\s*CATEGORY\s*[:=]?\s*([A-F])\b/i, (m) => m[1]);
  pick("Site class", /SITE\s*CLASS\s*[:=]?\s*([A-F])\b/i, (m) => m[1]);
  const sds = /\bS\s*_?D\s*S\s*[:=]\s*([\d.]+)/i.exec(all)?.[1];
  const sd1 = /\bS\s*_?D\s*1\s*[:=]\s*([\d.]+)/i.exec(all)?.[1];
  if (sds && sd1) {
    crit.push(["SDS / SD1", `${sds} / ${sd1}`]);
    found.push(`S_DS / S_D1: ${sds} / ${sd1}`);
  }
  const ss = /\bS\s*S\s*[:=]\s*([\d.]+)\s*g?/i.exec(all)?.[1];
  const s1 = /\bS\s*1\s*[:=]\s*([\d.]+)\s*g?/i.exec(all)?.[1];
  const fa = /\bF\s*a\s*[:=]\s*([\d.]+)/i.exec(all)?.[1];
  const fv = /\bF\s*v\s*[:=]\s*([\d.]+)/i.exec(all)?.[1];
  if (ss && s1) crit.push(["Ss / S1", `${ss}g / ${s1}g`]);
  if (fa && fv) crit.push(["Fa / Fv", `${fa} / ${fv}`]);
  pick(
    "Basic wind speed",
    /(?:BASIC|ULTIMATE|DESIGN)?\s*WIND\s*SPEED[^0-9\n]{0,25}(\d{2,3})\s*MPH/i,
    (m) => `${m[1]} mph`,
  );
  pick("Exposure", /\bEXPOSURE(?:\s*CATEGORY)?\s*[:=]?\s*([BCD])\b/i, (m) => m[1]);
  pick(
    "Allowable soil bearing",
    /(?:ALLOWABLE\s*)?(?:SOIL\s*)?BEARING\s*(?:PRESSURE|VALUE|CAPACITY)?\s*[:=]?\s*([\d,]{3,5})\s*PSF/i,
    (m) => `${m[1].replace(/,/g, "")} psf`,
  );
  const fcs = [...new Set([...all.matchAll(/F'?\s*C\s*=?\s*(\d{4})\s*PSI/gi)].map((m) => m[1]))];
  if (fcs.length) {
    crit.push(["Concrete f'c", fcs.map((x) => `${x} psi`).join("; ")]);
    found.push(`Concrete f'c: ${fcs.join(" / ")} psi`);
  }
  for (const [what, re] of [
    ["Roof live / total deflection", /ROOF[^\n]{0,40}?L\s*\/\s*(\d{3})[^\n]{0,20}?L\s*\/\s*(\d{3})/i],
    ["Floor live / total deflection", /FLOOR[^\n]{0,40}?L\s*\/\s*(\d{3})[^\n]{0,20}?L\s*\/\s*(\d{3})/i],
  ] as Array<[string, RegExp]>) {
    const m = re.exec(all);
    if (m) {
      crit.push([what, `L/${m[1]} / L/${m[2]}`]);
      found.push(`${what}: L/${m[1]} / L/${m[2]}`);
    }
  }
  const code = /\b(20(?:19|22|25))\s*(?:CALIFORNIA BUILDING CODE|CBC)\b/i.exec(all)?.[1];
  if (code) found.push(`Code: ${code} CBC`);

  /* ----------------------------------------------------------- beams */
  const beams: string[][] = [];
  const beamSeen = new Set<string>();
  const missingBeam = new Map<string, string>();
  for (const p of P) {
    p.lines.forEach((ln, i) => {
      if (!/BEAM SCHEDULE/i.test(ln)) return;
      const title = /SCHEDULE\s*:?-?\s*(.+)$/i.exec(ln)?.[1]?.trim();
      let lastSize: { size: string; at: number; note: string } | undefined;
      for (let j = i + 1; j < Math.min(p.lines.length, i + 40); j++) {
        const l = p.lines[j];
        if (/SCHEDULE/i.test(l) && j > i + 1) break;
        const mk = BEAM_MARK.exec(l);
        const size = beamSize(l);
        if (!mk) {
          if (size) lastSize = { size, at: j, note: l };
          continue;
        }
        const mark = mk[1].toUpperCase();
        const gap = lastSize
          ? p.lines.slice(lastSize.at + 1, j).filter((x) => x.replace(/[^A-Za-z0-9]/g, "").length > 3).length
          : 99;
        const sz = size ?? (lastSize && gap <= 2 ? lastSize.size : undefined);
        const notesTxt = `${lastSize && !size ? lastSize.note : ""} ${l}`;
        lastSize = undefined;
        if (!sz) {
          missingBeam.set(mark, p.sheet);
          continue;
        }
        if (beamSeen.has(mark)) continue;
        beamSeen.add(mark);
        const mat = /(LVL|PSL|LSL|GLB|GLULAM)\s*([\d.]+E)?/i.exec(l);
        const material = mat
          ? `${mat[1].toUpperCase()}${mat[2] ? ` ${mat[2].toUpperCase()}` : ""}`
          : /DF|DOUG/i.test(l)
            ? "DF-L No.2"
            : "";
        const size2 =
          mat && /LVL|PSL|LSL/i.test(mat[1]) && !/LVL|PSL|LSL/i.test(sz) ? `${sz} ${mat[1].toUpperCase()}` : sz;
        const sawnGrade = !mat && /#\s*(\d)|NO\.?\s*(\d)/i.exec(l);
        const support = [
          /FLUSH/i.test(notesTxt) ? "Flush" : /DROP/i.test(notesTxt) ? "Dropped" : "",
          /POSTS?/i.test(notesTxt) ? "posts" : "",
          /BEARING WALLS|BEARING ON WALLS|SUPPORTED BY BEARING/i.test(notesTxt) ? "bearing walls" : "",
          /HANGER/i.test(notesTxt) ? "Simpson hangers" : "",
          /EXISTING WALL|REINFORCED/i.test(notesTxt) ? "existing wall intersection" : "",
          /SUPPORT ONLY|LOCAL/i.test(notesTxt) ? "local support only" : "",
        ]
          .filter(Boolean)
          .join(", ");
        beams.push([
          /CARPORT/i.test(title ?? "") || /CARPORT/i.test(p.area ?? "") ? `Carport ${mark}` : mark,
          `${size2}${sawnGrade ? ` DF No.${sawnGrade[1] ?? sawnGrade[2]}` : ""}`,
          material,
          support || "—",
          `${p.sheet}${title ? ` (${cap(title)})` : ""}`,
        ]);
      }
    });
    // beam callouts with the size on the same line outside a schedule (RB1 (3) 1-3/4 x 14 LVL)
    for (const l of p.lines) {
      const mk = BEAM_MARK.exec(l);
      const sz = mk && beamSize(l);
      if (!mk || !sz || beamSeen.has(mk[1].toUpperCase()) || !/LVL|PSL|LSL|GLB|DF|BEAM/i.test(l)) continue;
      const mark = mk[1].toUpperCase();
      beamSeen.add(mark);
      const mat = /(LVL|PSL|LSL|GLB)\s*([\d.]+E)?/i.exec(l);
      beams.push([
        mark,
        mat && /LVL|PSL|LSL/i.test(mat[1]) ? `${sz} ${mat[1].toUpperCase()}` : sz,
        mat ? `${mat[1].toUpperCase()}${mat[2] ? ` ${mat[2]}` : ""}` : "",
        [/FLUSH/i.test(l) ? "Flush" : "", /SUPPORT ONLY/i.test(l) ? "local support only" : ""]
          .filter(Boolean)
          .join(", ") || "—",
        p.sheet,
      ]);
    }
  }
  for (const [mk, sh] of missingBeam)
    if (!beamSeen.has(mk))
      issues.push(`${sh}: beam ${mk} — size not found next to the mark in the text layer; enter it.`);
  if (beams.length) found.push(`Beams: ${beams.map((b) => b[0]).join(", ")}`);

  /* ----------------------------------------------------------- walls */
  const walls: string[][] = [];
  const wallSeen = new Set<string>();
  const FRAMING = String.raw`(\d+x\d+)\s+(DF-?L?|HF|SPF|SP)\s+No\.?\s*(\d)\s*@\s*(\d+)"?\s*O\.?\s*C\.?(\s*w\/\s*\d+\/\d+"?(?:\s*OSB)?)?`;
  const reMarkFirst = new RegExp(
    String.raw`(\d?(?:BW|SW|W)\d+)\s+((?:Exterior|Interior|Supporting|Shear|Bearing|Non)[^@\n]*?)\s+${FRAMING}`,
    "i",
  );
  const reFramingFirst = new RegExp(
    String.raw`(\d?(?:BW|SW|W)\d+)\s+${FRAMING}\s+((?:Exterior|Interior|Supporting|Shear|Bearing|Non)[^\n]*)`,
    "i",
  );
  for (const p of P) {
    for (const l of p.lines) {
      const a = reMarkFirst.exec(l);
      const b = a ? undefined : reFramingFirst.exec(l);
      if (!a && !b) continue;
      const mark = (a ? a[1] : b![1]).toUpperCase();
      if (wallSeen.has(mark)) continue;
      wallSeen.add(mark);
      const [size, sp, gr, spc, sh] = a ? [a[3], a[4], a[5], a[6], a[7]] : [b![2], b![3], b![4], b![5], b![6]];
      const use = (a ? a[2] : b![7]).trim();
      walls.push([
        `${(p.area ?? "").split(" ")[0]} ${mark}`.trim(),
        `${size} ${/^DF/i.test(sp) ? "DF-L" : sp} No.${gr} at ${spc} in OC${sh ? `, ${sh.replace(/^\s*w\/\s*/i, "").replace(/"/, " in")}` : ""}`,
        use.replace(/\s+/g, " "),
      ]);
    }
  }
  if (walls.length) found.push(`Walls: ${walls.map((w) => w[0].split(" ").pop()).join(", ")}`);

  /* -------------------------------------------------------- footings */
  const ftgs: string[][] = [];
  const cands = new Map<string, Array<{ size: string; reinf?: string; sheet: string }>>();
  for (const p of P) {
    for (const l of p.lines) {
      // one entry per footing mark on the line (a schedule row can follow a plan label)
      const at = [...l.matchAll(/\b(F\d{1,2})\s+/g)];
      for (let k = 0; k < at.length; k++) {
        const rest = l.slice(at[k].index! + at[k][0].length, at[k + 1]?.index ?? l.length);
        const pad = /(\d+)"\s*x\s*(\d+)"\s*x\s*(\d+)"/i.exec(rest);
        const strip = /(\d+)"\s*W\s*x\s*(\d+)"\s*D/i.exec(rest) ?? /(\d+)"\s*x\s*(\d+)"(?!\s*x)(?!\s*CMU)/i.exec(rest);
        const bars =
          /(\(\d+\)\s*#\d+(?:\s*(?:CONT\.?|CONTINUOUS))?(?:\s*(?:TOP\s*(?:&|AND)\s*BOTTOM|TOP|BOTTOM|E\.?\s*W\.?|EACH WAY))?)/i.exec(
            rest,
          )?.[1];
        const size = pad
          ? `${pad[1]} x ${pad[2]} x ${pad[3]} in`
          : strip
            ? `${strip[1]} in W x ${strip[2]} in D`
            : undefined;
        if (!size) continue;
        const mark = at[k][1].toUpperCase();
        const key = /CARPORT/i.test(p.area ?? "") ? `${mark} carport` : mark;
        const reinf = bars
          ?.replace(/CONT\.?(?!I)/i, "continuous")
          .replace(/&/g, "and")
          .replace(/\s+/g, " ")
          .toLowerCase();
        const list = cands.get(key) ?? [];
        list.push({ size, reinf, sheet: p.sheet });
        cands.set(key, list);
      }
    }
  }
  for (const [key, list] of cands) {
    // the schedule row (with reinforcement) governs over plan labels
    const pick = list.find((c) => c.reinf) ?? list[0];
    const sizes = [...new Set(list.map((c) => c.size))];
    if (sizes.length > 1)
      issues.push(
        `${key}: ${sizes.join(" / ")} all appear (${[...new Set(list.map((c) => c.sheet))].join(", ")}) — ${pick.size}${pick.reinf ? " (schedule row)" : ""} used; reconcile on the drawings.`,
      );
    ftgs.push([key, pick.size, pick.reinf ?? "Per schedule", pick.sheet]);
  }
  if (ftgs.length) found.push(`Footings: ${ftgs.map((f) => f[0]).join(", ")}`);

  /* -------------------------------------------- joists, posts, openings */
  const joists: string[][] = [];
  for (const p of P) {
    const calls = new Set<string>();
    for (const m of p.text.matchAll(
      /(\(E\)|EXIST\w*\.?)?\s*-?\s*(\d+x\d+)"?\s+(FLOOR|ROOF|DECK|CEILING)\s+JOISTS?\s*@\s*(\d+)"?\s*O\.?\s*C/gi,
    )) {
      const existing = !!m[1];
      calls.add(`${existing ? "Existing" : "New"} ${m[2].toLowerCase()} ${m[3].toLowerCase()} joists ${m[4]} in OC`);
    }
    for (const m of p.text.matchAll(/TJI[-\s]?(\d{3})\s+(FLOOR|ROOF)\s+JOISTS?\s*@\s*(\d+)"?\s*O\.?\s*C/gi))
      calls.add(`TJI-${m[1]} ${m[2].toLowerCase()} joists ${m[3]} in OC`);
    if (calls.size) joists.push([p.area ?? p.sheet, [...calls].join("; ")]);
  }
  if (joists.length) found.push(`Joist callouts on ${joists.length} sheet(s)`);

  const postLines: string[] = [];
  if (/NEW\s+6X6\s+POST/i.test(all)) postLines.push("New wood posts: nominal 6x6.");
  const hssFull = /HSS\s*(\d+)\s*X\s*(\d+)\s*X\s*(\d+\/\d+)/i.exec(all);
  if (hssFull) postLines.push(`New/existing steel: HSS ${hssFull[1]}x${hssFull[2]}x${hssFull[3]} in.`);
  else if (/HSS\s*\d+\s*X\s*\d+\s*X\s*\d/i.test(all))
    issues.push(
      `HSS post size reads "${/HSS\s*\d+\s*X\s*\d+\s*X\s*[\d" ]+/i.exec(all)![0].trim()}" in the text layer — the wall thickness fraction is not readable; no steel column created. Enter the HSS size.`,
    );
  if (
    /CARPORT/i.test(all) &&
    /NEW\s+6X6\s+POST/i.test(
      P.filter((p) => /CARPORT/i.test(p.area ?? ""))
        .map((p) => p.text)
        .join("\n"),
    )
  )
    postLines.push("Carport: new 6x6 posts (S-7 series).");
  const clear = /(\d+)'-?\s*(\d+)?"?\s*CLEAR\s*(?:HEIGHT|HT)/i.exec(all);
  if (clear) postLines.push(`Carport section: ${clear[1]} ft clear-height annotation.`);
  if (postLines.length) found.push(`Posts: ${postLines.join(" ")}`);

  const openings: string[][] = [];
  for (const p of P) {
    const counts = new Map<string, number>();
    for (const m of p.text.matchAll(
      /\(N\)\s*(\d+)'\s*-?\s*(\d+)"\s*X\s*(\d+)'\s*-?\s*(\d+)"\s*\n?\s*(WINDOW|DOOR|SLIDER|SLIDING DOOR)?/gi,
    )) {
      const ft = (a: string, b: string) => `${a} ft${Number(b) ? ` ${b} in` : ""}`;
      const key = `${ft(m[1], m[2])} x ${ft(m[3], m[4])} ${(m[5] ?? "window").toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [k, n] of counts) openings.push([p.area ?? p.sheet, k, `${n} label${n > 1 ? "s" : ""}`, p.sheet]);
  }
  if (openings.length) found.push(`Openings: ${openings.length} sizes`);

  const headers: string[][] = [];
  for (const m of all.matchAll(
    /(TO|UP TO|\d+'-?\d*"?\s*TO)\s*(\d+)'-?\s*(\d+)?"?\s+((?:\(\d\)\s*)?\d+X\d+)\s+OR\s+((?:\(\d\)\s*)?\d+X\d+)/gi,
  ))
    headers.push([
      `${/^\d/.test(m[1]) ? m[1].replace(/'-?(\d*)"?/, (_, i: string) => ` ft${i ? ` ${i} in` : ""}`).toLowerCase() : "to"} ${m[2]} ft${m[3] && Number(m[3]) ? ` ${m[3]} in` : ""}`,
      `${m[4].toLowerCase()} or ${m[5].toLowerCase()}`,
      "-",
    ]);
  if (headers.length) found.push(`Typical header schedule: ${headers.length} rows`);

  /* ------------------------------------------------ building geometry */
  // overall plan dimensions: the longest figured dimension read along the sheet (horizontal
  // text) and across it (rotated text) on the main-building plan sheets
  const DIM = /\b(\d{1,3})'\s*-?\s*(\d{1,2})(?:-(\d+)\/(\d+))?"/g;
  const dimsIn = (s: string) =>
    [...s.matchAll(DIM)]
      .map((m) => Number(m[1]) + (Number(m[2]) + (m[3] ? Number(m[3]) / Number(m[4]) : 0)) / 12)
      .filter((f) => f >= 10 && f <= 300);
  const ftIn = (f: number) => {
    const ft = Math.floor(f + 1e-9);
    const inch = Math.round((f - ft) * 12 * 8) / 8;
    return `${ft} ft ${inch} in`;
  };
  let gx: { ft: number; sheet: string } | undefined;
  let gy: { ft: number; sheet: string } | undefined;
  for (const p of P) {
    if (!/\bPLAN\b|\bLAYOUT\b/i.test(p.text) || /^(Carport|Deck|Sections)$/.test(p.area ?? "")) continue;
    const [hz, vt = ""] = p.text.split(VERTICAL_TEXT);
    const h = Math.max(0, ...dimsIn(hz));
    const v = Math.max(0, ...dimsIn(vt));
    if (h && (!gx || h > gx.ft)) gx = { ft: h, sheet: p.sheet };
    if (v && (!gy || v > gy.ft)) gy = { ft: v, sheet: p.sheet };
  }
  const geom: string[][] = [];
  if (gx) geom.push([`Overall longitudinal dimension (longest horizontal plan dimension, ${gx.sheet})`, ftIn(gx.ft)]);
  if (gy) geom.push([`Overall width (longest rotated plan dimension, ${gy.sheet})`, ftIn(gy.ft)]);
  const PITCH = /\b(\d+(?:\.\d+)?)\s*(?::|\/|IN)\s*12\b/i;
  const pitch = P.flatMap((p) => p.lines.map((l) => ({ l, sheet: p.sheet }))).find(
    (x) => /PITCH|SLOPE/i.test(x.l) && PITCH.test(x.l),
  );
  const pm = pitch && PITCH.exec(pitch.l);
  if (pitch && pm) geom.push([`Roof pitch (${pitch.sheet})`, `${pm[1]}:12`]);
  if (gx && gy) found.push(`Building: ${ftIn(gx.ft)} × ${ftIn(gy.ft)} (overall plan dimensions)`);
  if (pm) found.push(`Roof pitch: ${pm[1]}:12`);

  /* ------------------------------------------------------------ hardware */
  const hw = findHardware(P.map((p) => `### PDF page ${p.page} - ${p.sheet}\n${p.text}`).join("\n"));
  if (hw.models.length) found.push(`Hardware: ${hw.models.map((h) => h.model).join(", ")}`);
  const hwRows = hw.models.map((h) => [h.model, h.what, h.sheets.join(", ")]);

  if (emptyPages.length)
    issues.push(
      `Pages ${emptyPages.join(", ")}: little or no text in the text layer (outlined or scanned) — use the AI reader or enter the values.`,
    );
  if (!crit.length)
    issues.push(
      "No design criteria found in the text layer (notes may be outlined) — enter them in the Project panel.",
    );
  /* -------------------------------------------------------- document */
  const t = (head: string[], rows: string[][]) =>
    rows.length
      ? [
          `| ${head.join(" | ")} |`,
          `|${head.map(() => "---").join("|")}|`,
          ...rows.map((r) => `| ${r.join(" | ")} |`),
          "",
        ]
      : [];
  const doc = [
    `# ${name.replace(/\.pdf$/i, "")} - drawing text extraction`,
    "",
    "## 1. Source and scope",
    "",
    `- Source: ${name}, ${pages.length} pages; text layer read in the browser (no AI, no OCR).`,
    ...(addr ? [`- Printed project: ${addr}.`] : []),
    ...(date ? [`- Printed issue date: ${date}.`] : []),
    ...(code ? [`- ${code} CBC (as printed).`] : []),
    "",
    "## 3. Design basis and loads as printed",
    "",
    ...t(["Parameter", "Value"], crit),
    "## 5. Foundations",
    "",
    ...t(["Mark", "Size/description", "Reinforcement", "Source/status"], ftgs),
    "## 4. Figured geometry",
    "",
    ...t(["Location", "Dimension"], geom),
    "## 7. Beams, joists and posts",
    "",
    ...t(["Mark", "Size", "Material", "Support/notes", "Source"], beams),
    ...t(["Area", "Callouts"], joists),
    ...postLines.map((x) => `- ${x}`),
    "",
    "## 8. Walls and lateral system",
    "",
    ...t(["Marks", "Framing", "Use"], walls),
    "## 9. Openings and headers",
    "",
    ...t(["Area", "Opening", "Labels", "Sheet"], openings),
    ...t(["Clear opening", "Header", "Remark"], headers),
    "## 10. Hardware called out",
    "",
    ...t(["Model", "Type", "Sheets"], hwRows),
    "## 12. Conflicts and missing inputs",
    "",
    ...t(
      ["ID", "Unresolved issue", "Source evidence / needed action for calculations"],
      issues.map((x, i) => [`T${String(i + 1).padStart(2, "0")}`, x.replace(/\|/g, "/"), "drawing text layer"]),
    ),
    "## Appendix A. Page text",
    "",
    ...P.flatMap((p) => [`### PDF page ${p.page} - ${p.sheet}`, "", "```text", p.text.trim(), "```", ""]),
  ].join("\n");
  return { document: doc, found, issues, emptyPages };
}
