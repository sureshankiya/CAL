/**
 * Drawing-data documents → HouseCalc input sheet.
 *
 * A "full-house calculation data" extraction (.md with numbered sections, criteria tables,
 * beam / wall / footing schedules, a joist register and OCR appendices) is not an input
 * sheet: it records what the drawings say, with conflicts and gaps. convertDrawingData()
 * reads the tables it recognises and writes an input sheet (markdown.ts format) with:
 *  - project information, code cycle, risk category, roof live load, seismic and wind
 *    criteria, concrete strength (lowest printed value where values conflict), rebar grade;
 *  - one member per scheduled beam, bearing wall, shear wall, footing, post / HSS post and
 *    new joist / rafter callout, with the sizes, grades and spacings printed;
 *  - everything the drawings do not give (spans, lengths, heights, trib widths, nailing,
 *    soil bearing) left at the HouseCalc template value and listed in the notes and in each
 *    member's description as REQUIRED INPUT — nothing is invented.
 * The engineer reviews and edits the sheet before applying it.
 */

export interface DrawingDataResult {
  sheet: string;
  /** values read, by item */
  read: string[];
  /** inputs the document does not give, conflicts resolved conservatively, items skipped */
  notes: string[];
  members: number;
}

interface Table {
  heading: string;
  header: string[];
  rows: string[][];
}

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

function readTables(text: string): Table[] {
  const out: Table[] = [];
  let heading = "";
  let cur: Table | undefined;
  let inFence = false;
  for (const ln of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(ln)) inFence = !inFence;
    if (inFence) continue;
    const h = /^#{1,4}\s+(.+)$/.exec(ln);
    if (h) {
      heading = clean(h[1]);
      cur = undefined;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      const cells = ln
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map(clean);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!cur) {
        cur = { heading, header: cells, rows: [] };
        out.push(cur);
      } else cur.rows.push(cells);
    } else cur = undefined;
  }
  return out;
}

const firstNum = (s: string) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s);
  return m ? Number(m[0]) : undefined;
};
const allNums = (s: string) => [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

/** 11-7/8 → 11.875 */
const dim = (s: string) => {
  const m = /^(\d+)(?:-(\d+)\/(\d+))?$/.exec(s.trim());
  if (!m) return Number(s);
  return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
};

const q = (v: string) => JSON.stringify(v);

function lumber(s: string): { species: string; grade: string; size: string } | undefined {
  const m = /(\d+x\d+)/i.exec(s);
  if (!m) return undefined;
  const species = /\bSP\b|southern pine/i.test(s)
    ? "SP"
    : /\bHF\b|hem/i.test(s)
      ? "HF"
      : /SPF/i.test(s)
        ? "SPF"
        : "DF-L";
  const grade = /sel(ect)?\s*str/i.test(s)
    ? "Sel Str"
    : /no\.?\s*1/i.test(s)
      ? "No.1"
      : /stud grade/i.test(s)
        ? "Stud"
        : "No.2";
  return { species, grade, size: m[1].toLowerCase() };
}

const spacingOf = (s: string) => {
  const m = /(?:at|@)\s*(\d+)\s*(?:in|")?\s*o\.?c/i.exec(s) ?? /(\d+)\s*in\s*o\.?c/i.exec(s);
  return m ? Number(m[1]) : undefined;
};

export function looksLikeDrawingData(text: string): boolean {
  const hasSheet = /^##\s+(project\b|member\s+\S+\s*\()/im.test(text);
  return !hasSheet && /\|\s*mark\s*\|/i.test(text) && /(design basis|criteria|footing|beam schedule)/i.test(text);
}

export function convertDrawingData(text: string): DrawingDataResult {
  const read: string[] = [];
  const notes: string[] = [];
  const tables = readTables(text);
  const proj: Array<[string, string]> = [];
  const set = (k: string, v: string, what: string) => {
    proj.push([k, v]);
    read.push(what);
  };

  /* ---------------------------------------------------------- information */
  const title = /^#\s+(.+?)(?:\s+-\s+.*)?$/m.exec(text)?.[1];
  if (title) set("info.name", clean(title), `Project name: ${clean(title)}`);
  const addr = /Printed project:\s*([^\n]+?)\.?\s*$/im.exec(text)?.[1];
  if (addr) set("info.address", clean(addr), `Address: ${clean(addr)}`);
  const date = /issue date:\s*([0-9/.-]+)/i.exec(text)?.[1]?.replace(/[.-]+$/, "");
  const us = date && /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
  const iso = us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : date;
  if (iso) set("info.date", q(iso), `Issue date: ${date}`);
  const rev = /revision:\s*(RV?\d+|\d+)/i.exec(text)?.[1];
  if (rev) set("info.revision", q(rev), `Revision: ${rev}`);
  if (/2025\s*CBC|2024\s*IBC/i.test(text)) set("cycleId", q("2025"), "Code cycle: 2025 CBC");
  else if (/2022\s*CBC|2021\s*IBC/i.test(text)) set("cycleId", q("2022"), "Code cycle: 2022 CBC (as printed)");

  /* ------------------------------------------------------------- criteria */
  const rowsOf = (t: Table) =>
    t.rows.filter((r) => r.length >= 2).map((r) => ({ label: r[0], value: r[1], rest: r.slice(2).join(" ") }));
  const kv = tables.flatMap(rowsOf);
  const find = (re: RegExp) => kv.find((r) => re.test(r.label));
  const loads = {
    roofDead: undefined as number | undefined,
    floorDead: undefined as number | undefined,
    floorLive: undefined as number | undefined,
  };

  const rl = find(/^roof live$/i);
  if (rl && firstNum(rl.value) !== undefined)
    set("criteria.roofLive.L0", String(firstNum(rl.value)), `Roof live load: ${firstNum(rl.value)} psf`);
  const rd = find(/^roof dead$/i);
  if (rd) loads.roofDead = firstNum(rd.value);
  const fd = find(/^floor dead$/i);
  if (fd) loads.floorDead = firstNum(fd.value);
  const fl = find(/^floor live$/i);
  if (fl) loads.floorLive = firstNum(fl.value);
  if (loads.floorLive !== undefined && loads.floorLive < 40)
    notes.push(
      `Floor live printed ${loads.floorLive} psf — below the IRC Table R301.5 / IBC Table 1607.1 minimum for living areas (40 psf); floor members use the code value (live use "living"). VERIFY.`,
    );
  const rdAlt = kv.find((r) => /rafter dead/i.test(r.label));
  if (rdAlt && loads.roofDead !== undefined && firstNum(rdAlt.value)! > loads.roofDead) {
    notes.push(
      `Roof dead load: ${loads.roofDead} psf (criteria) vs ${firstNum(rdAlt.value)} psf (rafter notes) — the larger value is used. VERIFY.`,
    );
    loads.roofDead = firstNum(rdAlt.value);
  }

  const occ = find(/occupancy category|risk category/i);
  const roman = occ && /\b(IV|III|II|I)\b/.exec(occ.value)?.[1];
  if (roman) set("criteria.riskCategory", roman, `Risk category: ${roman}`);
  const sdc = find(/seismic design category/i);
  if (sdc) {
    const parts = sdc.value.split("/").map((s) => s.trim());
    const labels = sdc.label.split("/").map((s) => s.trim().toLowerCase());
    parts.forEach((v, i) => {
      if (/category/.test(labels[i] ?? "") && /^[A-F]$/.test(v))
        set("criteria.seismic.SDC", v, `Seismic design category: ${v}`);
      if (/site/.test(labels[i] ?? "")) set("criteria.seismic.siteClass", v, `Site class: ${v}`);
    });
  }
  const sd = kv.find((r) => /\bSD[S1]\b/.test(r.label));
  if (sd) {
    const labels = sd.label.split("/").map((s) => s.trim());
    const vals = sd.value.split("/").map((s) => firstNum(s));
    const got: Record<string, number> = {};
    labels.forEach((l, i) => {
      if (/SDS/.test(l) && vals[i] !== undefined) got.SDS = vals[i]!;
      if (/SD1/.test(l) && vals[i] !== undefined) got.SD1 = vals[i]!;
    });
    if (got.SDS !== undefined) set("criteria.seismic.SDS", String(got.SDS), `S_DS = ${got.SDS}`);
    if (got.SD1 !== undefined) set("criteria.seismic.SD1", String(got.SD1), `S_D1 = ${got.SD1}`);
    if (got.SDS !== undefined && got.SD1 !== undefined && got.SD1 > got.SDS)
      notes.push(
        `Seismic: printed S_D1 = ${got.SD1} > S_DS = ${got.SDS} — the labels on the drawings may be swapped (values entered as printed). Recompute S_DS / S_D1 from the site data. VERIFY.`,
      );
  }
  const v = find(/basic wind speed|wind speed/i);
  if (v && firstNum(v.value)) set("criteria.wind.V", String(firstNum(v.value)), `Wind speed: ${firstNum(v.value)} mph`);
  const exp = find(/^exposure$/i);
  const e = exp && /\b([BCD])\b/.exec(exp.value)?.[1];
  if (e) set("criteria.wind.exposure", e, `Wind exposure: ${e}`);
  if (v)
    notes.push(
      "Wind: topographic factor K_zt not given — 1.0 used. Confirm the wind speed basis (ultimate, ASCE 7-16 Fig. 26.5-1). VERIFY.",
    );

  const soil = kv.find((r) => /soil bearing|allowable bearing/i.test(r.label) && firstNum(r.value));
  if (soil)
    set("criteria.soil.bearing", String(firstNum(soil.value)), `Allowable soil bearing: ${firstNum(soil.value)} psf`);
  else if (/no allowable soil bearing/i.test(text) || /soils report \(not supplied\)/i.test(text))
    notes.push(
      "Soil: no allowable bearing pressure or geotechnical report — HouseCalc's presumptive CBC Table 1806.2 Class 5 value (1,500 psf) is used. REQUIRED INPUT / VERIFY.",
    );

  const fcRows = kv.filter((r) => /concrete/i.test(r.label) && /f'?c|strength/i.test(r.label + r.value));
  const fcs = fcRows.flatMap((r) => [...`${r.value} ${r.rest}`.matchAll(/(\d{4})\s*psi/g)].map((m) => Number(m[1])));
  if (fcs.length) {
    const fc = Math.min(...fcs);
    set("criteria.concrete.fc", String(fc), `Concrete f'c: ${fc} psi`);
    if (new Set(fcs).size > 1)
      notes.push(
        `Concrete: f'c printed as ${[...new Set(fcs)].join(" / ")} psi — the lowest (${fc} psi) is used for design. VERIFY.`,
      );
  }
  if (/grade\s*60/i.test(text)) set("criteria.concrete.fy", "60000", "Reinforcement: Grade 60");

  /* -------------------------------------------------------------- levels */
  const levels = [
    { id: "L1", name: "First floor / master suite", number: 1 },
    { id: "L2", name: "Second floor", number: 2 },
    { id: "RF", name: "Roof", number: 3 },
  ];
  set("structures.0.levels", JSON.stringify(levels), "Levels: first floor, second floor, roof");

  /* ------------------------------------------------------------- members */
  const members: Array<{ mark: string; kind: string; lines: Array<[string, string]>; missing: string[] }> = [];
  const used = new Set<string>();
  const add = (mark: string, kind: string, lines: Array<[string, string]>, missing: string[], src: string) => {
    if (used.has(mark)) {
      notes.push(`${mark}: listed again (${src}) — first entry kept; reconcile on the drawings.`);
      return;
    }
    used.add(mark);
    members.push({
      mark,
      kind,
      lines: [["description", q(`From the drawings: ${src}`)], ["pendingInputs", JSON.stringify(missing)], ...lines],
      missing,
    });
  };
  const deadPsf = (roof: boolean) => (roof ? loads.roofDead : loads.floorDead);

  // beams
  for (const t of tables.filter(
    (x) =>
      /^mark$/i.test(x.header[0]) &&
      x.header.some((h) => /^size$/i.test(h)) &&
      !/footing/i.test(x.heading + x.header.join(" ")),
  )) {
    const iSize = t.header.findIndex((h) => /^size$/i.test(h));
    const iMat = t.header.findIndex((h) => /material/i.test(h));
    const iNote = t.header.findIndex((h) => /support|note/i.test(h));
    let unmarked = 0;
    for (const r of t.rows) {
      const raw = r[0];
      const size = r[iSize] ?? "";
      const matTxt = `${size} ${iMat >= 0 ? r[iMat] : ""}`;
      const note = iNote >= 0 ? r[iNote] : "";
      let mark = raw.replace(/\s+/g, "");
      if (!/^[A-Z]{1,3}\d/i.test(mark)) mark = `${/carport/i.test(raw) ? "CPB" : "BX"}${++unmarked}`;
      const roof = /^RB|roof/i.test(mark + note) || /carport/i.test(raw);
      const lines: Array<[string, string]> = [];
      const scl = /\((\d)\)\s*(\d+(?:-\d+\/\d+)?)\s*x\s*(\d+(?:-\d+\/\d+)?)\s*(?:in\.?)?\s*(LVL|LSL|PSL)/i.exec(size);
      const saw = /\((\d)\)\s*(\d+x\d+)/i.exec(size);
      if (scl) {
        const prod = scl[4].toUpperCase();
        const E = /(\d\.\d+)E/.exec(matTxt)?.[1];
        const product = prod === "LVL" ? "LVL 2.0E" : prod === "PSL" ? "PSL 2.2E" : "LSL 1.55E";
        if (prod === "LVL" && E && E !== "2.0")
          notes.push(`${mark}: LVL ${E}E printed — library LVL 2.0E used. VERIFY.`);
        lines.push([
          "material",
          JSON.stringify({ kind: "scl", product, plies: Number(scl[1]), plyWidth: dim(scl[2]), d: dim(scl[3]) }),
        ]);
      } else if (saw) {
        const l = lumber(matTxt)!;
        lines.push([
          "material",
          JSON.stringify({ kind: "sawn", species: l.species, grade: l.grade, size: saw[2], plies: Number(saw[1]) }),
        ]);
      } else {
        notes.push(`${mark}: size "${size}" not recognised — member skipped.`);
        continue;
      }
      lines.push(["role", /flush/i.test(note + size) ? "flush" : /drop/i.test(note) ? "dropped" : "beam"]);
      lines.push([
        "levelId",
        /^B3/i.test(mark) || /^RB/i.test(mark) || /carport/i.test(raw) ? (roof ? "RF" : "L2") : "L1",
      ]);
      const dp = deadPsf(roof);
      lines.push([
        "area",
        JSON.stringify([
          {
            label: "Tributary floor / roof (enter width)",
            trib: 1,
            dead: dp !== undefined ? { psf: dp } : undefined,
            ...(roof ? { roofLive: true } : { live: { use: "living" } }),
          },
        ]),
      ]);
      lines.push(["deflection.preset", roof ? "roof-nonplaster" : "floor"]);
      add(
        mark,
        "beam",
        lines,
        ["span", "tributary width (area.0.trib)", "point loads", "bearing lengths"],
        `${raw}: ${size}${note ? ` — ${note}` : ""}`,
      );
    }
  }

  // walls
  const shearWalls: string[] = [];
  const wallT = tables.find((t) => /^marks?$/i.test(t.header[0]) && t.header.some((h) => /framing/i.test(h)));
  if (wallT) {
    for (const r of wallT.rows) {
      const [marksCell, framing = "", use = ""] = r;
      const marks = marksCell
        .replace(/^(master|first|second|third|carport)\s+/i, "")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      const l = lumber(framing);
      const sp = spacingOf(framing) ?? 16;
      for (const mk of marks) {
        if (!/^\d?[A-Z]{1,3}\d+$/i.test(mk)) {
          notes.push(`Wall "${marksCell}" (${use || framing}): not a scheduled design wall — skipped.`);
          break;
        }
        if (used.has(mk)) {
          notes.push(`${mk}: listed again ("${marksCell}": ${framing || "framing blank"}, ${use}) — first entry kept.`);
          continue;
        }
        if (!l) {
          notes.push(`${mk}: framing not given ("${framing || "blank"}") — skipped; enter it.`);
          continue;
        }
        const lv = /^2|second/i.test(mk + marksCell) ? "L2" : "L1";
        if (/shear/i.test(use) || /SW\d/i.test(mk)) {
          // shear walls need the lateral setup (wall lines, lengths, nailing, hold-downs) — listed, not created
          shearWalls.push(
            `${mk} (${l.size} ${l.species} ${l.grade} @ ${sp} in., ${/7\/16/.test(framing) ? "7/16 in. OSB" : framing})`,
          );
          used.add(mk);
        } else if (/bearing|support|reaction/i.test(use) && !/non-?bearing/i.test(use)) {
          const ext = /exterior/i.test(use);
          add(
            mk,
            "wall",
            [
              ["levelId", lv],
              ["species", l.species],
              ["grade", l.grade],
              ["size", l.size],
              ["spacing", String(sp)],
              ["sheathing", ext ? "both" : "both"],
              ["wind.mode", ext ? "computed" : "none"],
            ],
            ["plate height", "wall length", "loads from above (area / links)"],
            `${marksCell}: ${framing}, ${use}`,
          );
        } else notes.push(`${mk} (${use}): non-bearing / existing — no design member created.`);
      }
    }
  }

  if (shearWalls.length)
    notes.push(
      `Shear walls ${shearWalls.join("; ")}: add under Lateral once wall lines, lengths, edge nailing and hold-downs are known — the drawings give no shear-wall schedule.`,
    );

  // footings
  const ftgT = tables.find(
    (t) => /^mark$/i.test(t.header[0]) && /size/i.test(t.header.join(" ")) && /reinforc/i.test(t.header.join(" ")),
  );
  if (ftgT) {
    for (const r of ftgT.rows) {
      const [raw, size = "", reinf = ""] = r;
      const base = raw.replace(/\s.*$/, "");
      if (!/^F\d+$/i.test(base)) {
        notes.push(`Footing "${raw}": generic / section label — skipped (see conflicts).`);
        continue;
      }
      const mark = /carport/i.test(raw) ? `${base}-CP` : /section/i.test(raw) ? "" : base;
      if (!mark) {
        notes.push(`Footing "${raw}": section label conflicting with the schedule — skipped.`);
        continue;
      }
      if (used.has(mark)) {
        notes.push(
          `${mark}: listed again ("${raw}": ${size}; ${reinf}) — first entry kept; reconcile on the drawings.`,
        );
        continue;
      }
      const bars = /\((\d+)\)\s*(#\d)/.exec(reinf);
      const n = allNums(size.replace(/#\d/g, ""));
      const lines: Array<[string, string]> = [];
      const pad = /pad|^\d+\s*x\s*\d+\s*x\s*\d+/i.test(size) && n.length >= 3 && !/strip|cmu/i.test(size);
      if (pad) {
        lines.push(["type", "pad"], ["B", String(n[0] / 12)], ["L", String(n[1] / 12)], ["h", String(n[2])]);
        if (bars) lines.push(["rebar", JSON.stringify({ size: bars[2], count: Number(bars[1]) })]);
        add(
          mark,
          "footing",
          lines,
          ["post load (links / extra)", "depth below grade (18 in. template)"],
          `${raw}: ${size}; ${reinf}`,
        );
      } else {
        const w = /(\d+)\s*in\s*W/i.exec(size)?.[1];
        const d = /(\d+)\s*in\s*D/i.exec(size)?.[1];
        const B = w ? Number(w) : n[0];
        const h = d ? Number(d) : n[1];
        if (!B || !h) {
          notes.push(`Footing ${mark}: size "${size}" not recognised — skipped.`);
          continue;
        }
        lines.push(["type", "strip"], ["B", String(B / 12)], ["h", String(h)]);
        if (bars) {
          const top = /top/i.test(reinf) ? Number(bars[1]) : 0;
          const bot = /bottom/i.test(reinf) ? Number(bars[1]) : Number(bars[1]);
          lines.push(["longitudinal", JSON.stringify({ size: bars[2], top, bottom: bot })]);
        }
        add(
          mark,
          "footing",
          lines,
          ["wall load (links / extra)", "depth below grade (18 in. template)", "stem"],
          `${raw}: ${size}; ${reinf}`,
        );
      }
      if (/conflict/i.test(r.join(" ")) && members.at(-1)?.mark === mark)
        notes.push(
          `${mark}: drawings conflict on size or reinforcement ("${r.slice(1).join("; ")}") — first scheduled entry used. VERIFY.`,
        );
    }
  }

  // posts
  if (/wood posts?:\s*nominal\s*6x6/i.test(text) || /new 6x6 posts?/i.test(text))
    add(
      "P-1",
      "post",
      [["levelId", "L1"]],
      ["post height", "load from beams (links / extra)"],
      "New 6x6 wood posts (DF-L No.1 assumed; drawings: DF No.2 or better)",
    );
  const hss = /HSS\s*(\d+x\d+x\d+\/\d+)/i.exec(text);
  if (hss)
    add(
      "SC-1",
      "steelColumn",
      [
        ["levelId", "L1"],
        ["shape", `HSS${hss[1]}`],
      ],
      ["column height", "steel grade (A500 Gr. C assumed)", "beam reactions (links / extra)", "base plate"],
      `New HSS ${hss[1]} posts`,
    );

  // joists / rafters from the joist register
  const jT = tables.find((t) => /^area$/i.test(t.header[0]) && /callout/i.test(t.header.join(" ")));
  if (jT) {
    let fj = 0;
    let rj = 0;
    let dj = 0;
    for (const [area, call = ""] of jT.rows) {
      for (const m of call.matchAll(/new\s+(\d+x\d+)\s+(floor|roof|deck)\s+joists?\s+(\d+)\s*in\s*o\.?c/gi)) {
        const [, size, use, spc] = m;
        const lv = /second/i.test(area) ? "L2" : /roof|carport/i.test(area) ? "RF" : "L1";
        if (/roof/i.test(use)) {
          add(
            `RJ-${++rj}`,
            "rafter",
            [
              ["levelId", "RF"],
              ["size", size],
              ["spacing", spc],
              ...(loads.roofDead !== undefined
                ? ([["dead", JSON.stringify({ psf: loads.roofDead })]] as Array<[string, string]>)
                : []),
            ],
            ["rafter run / span", "slope (no pitch on the drawings)", "overhang"],
            `${area}: new ${size} roof joists at ${spc} in. o.c.`,
          );
        } else {
          const deck = /deck/i.test(use);
          add(
            deck ? `DJ-${++dj}` : `FJ-${++fj}`,
            "joist",
            [
              ["levelId", lv],
              ["size", size],
              ["spacing", spc],
              ...(loads.floorDead !== undefined
                ? ([["dead", JSON.stringify({ psf: loads.floorDead })]] as Array<[string, string]>)
                : []),
              ["live", JSON.stringify({ use: deck ? "deck" : "living" })],
            ],
            ["span", ...(deck ? ["cantilever"] : [])],
            `${area}: new ${size} ${use} joists at ${spc} in. o.c.`,
          );
        }
      }
    }
  }

  // conflicts listed by the document itself
  const cT = tables.find((t) => /^id$/i.test(t.header[0]) && /issue/i.test(t.header.join(" ")));
  if (cT)
    notes.push(
      `Document lists ${cT.rows.length} unresolved conflicts / missing inputs (${cT.rows.map((r) => r[0]).join(", ")}) — resolve before issue.`,
    );

  /* ---------------------------------------------------------------- sheet */
  const out: string[] = [
    `# HouseCalc input sheet — converted from a drawing-data document`,
    "",
    "<!-- Review every value. Members carry REQUIRED INPUT in their description: spans, lengths, heights,",
    "     trib widths and nailing are not on the drawings and are HouseCalc template values until entered. -->",
    "",
    "## Project",
    "",
  ];
  for (const [k, val] of proj) out.push(`- ${k}: ${val}`);
  out.push(`- notes: ${q(["Converted from drawing data — open items:", ...notes.map((n) => `- ${n}`)].join("\n"))}`);
  for (const m of members) {
    out.push("", `## Member ${m.mark} (${m.kind})`, "");
    for (const [k, val] of m.lines) out.push(`- ${k}: ${val}`);
  }
  out.push("");
  return { sheet: out.join("\n"), read, notes, members: members.length };
}
