/** Package-level sheets: cover, contents & summary, criteria, loads, schedules, notes, assumption log. */

import type React from "react";
import { CD_TABLE_NOTE, asdCombinations, loadDurationFactor } from "@/engine/core/combos";
import { ENGINE_VERSION, dataLibraryVersion } from "@/engine/core/codes";
import { fmt, fmtFtIn } from "@/engine/core/fmt";
import { provenanceLabel } from "@/engine/core/provenance";
import { assemblyDesignValue, assemblySum, needsVerify } from "@/engine/loads/dead";
import { DEFLECTION_PRESETS } from "@/engine/loads/deflection";
import { LIVE_LOADS, liveLoad } from "@/engine/loads/live";
import { snowLoads } from "@/engine/loads/snow";
import { hardwareLabel } from "@/engine/data/hardware";
import { fmtInFraction } from "@/engine/core/fmt";
import { generateNotes, hardwareSchedule, type AnyResult, type Project, type ProjectDesign } from "@/engine/project";
import { B, DataTable, Flag, NotesList, SectionHead, Sheet, SheetTitle, TextRow, TR, eq } from "../report/primitives";
import type { PackageCheck, SheetEntry } from "../report/package";
import { DESIGN_AID, DesignBasis, f0, f1, f2, f3, footers, rich, titleFields, type SheetMeta } from "./common";

export function spansText(r: AnyResult): string {
  switch (r.kind) {
    case "wall":
      return `${fmtFtIn(r.input.length)} long, ${fmtFtIn(r.input.plateHeight)} plate ht.`;
    case "post":
      return `${fmtFtIn(r.input.height)} high`;
    case "truss":
      return fmtFtIn(r.input.span);
    case "shearWall":
      return `${fmtFtIn(r.input.b)} × ${fmtFtIn(r.input.h)}`;
    case "footing":
      return r.input.type === "strip" ? "continuous" : `${fmtFtIn(r.input.B)} × ${fmtFtIn(r.input.L ?? r.input.B)}`;
    case "connector":
    case "basePlate":
    case "transfer":
    case "uplift":
    case "ledger":
      return "—";
    case "steelColumn":
      return `${fmtFtIn(r.input.height)} high`;
    case "diaphragm":
      return `${r.input.dir}-direction load`;
    case "masonryWall":
      return `${fmtFtIn(r.input.L)} long × ${fmtFtIn(r.input.h)} high`;
    case "holdownFooting":
      return `${fmtFtIn(r.input.Lf)} long`;
    case "tieIn":
      return "—";
    case "woodTruss":
      return fmtFtIn(r.input.span);
  }
  const s = r.kind === "rafter" ? [r.input.run] : r.input.spans;
  const base = s.map((x) => fmtFtIn(x)).join(" + ");
  if (r.kind === "rafter") return `${base} run${r.input.overhang ? ` + ${fmtFtIn(r.input.overhang)} OH` : ""}`;
  const lc = "leftCantilever" in r.input ? (r.input.leftCantilever ?? 0) : 0;
  const rc = "rightCantilever" in r.input ? (r.input.rightCantilever ?? 0) : 0;
  return `${lc ? `${fmtFtIn(lc)} OH + ` : ""}${base}${rc ? ` + ${fmtFtIn(rc)} OH` : ""}`;
}

export function CoverSheet({ m, design, entries }: { m: SheetMeta; design: ProjectDesign; entries: SheetEntry[] }) {
  const p = m.project;
  const c = m.cycle;
  const ft = footers(m);
  const counts = new Map<string, number>();
  for (const o of design.outcomes.values()) {
    const t = o.result?.title ?? o.spec.kind;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const verify = [...design.outcomes.values()].some((o) => o.result?.assumptions.some((a) => a.verify));
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first id="sheet-cover">
      <tr>
        <td colSpan={2} className="px-3 pt-6 pb-2 text-center text-[18pt] font-bold uppercase tracking-wide">
          Structural calculations
        </td>
      </tr>
      <tr>
        <td colSpan={2} className="px-3 pb-4 text-center text-[12pt] font-bold">
          {p.info.name}
          {p.info.address ? <div className="text-[10.5pt] font-normal">{p.info.address}</div> : null}
        </td>
      </tr>
      {verify ? (
        <TextRow>
          <div className="text-center text-[11pt] font-bold">
            <Flag>DRAFT — contains items marked VERIFY. Not for permit until resolved.</Flag>
          </div>
        </TextRow>
      ) : null}
      <DataTable
        head={["Item", "Information"]}
        rows={[
          ["Client", p.info.client || "—"],
          ["Jurisdiction", p.info.jurisdiction || "—"],
          ["Job reference", p.info.jobRef || "—"],
          ["Date / revision", `${p.info.date || "—"} / Rev. ${p.info.revision}`],
          ["Prepared by", p.info.preparedBy || "—"],
          ["Code cycle", <b key="c">{c.label}</b>],
          ["Building / residential code", `${c.building}; ${c.residential}`],
          [
            "Referenced standards",
            `${c.asce7}; ANSI/AWC ${c.nds} and ${c.ndsSupplement}; ${c.sdpws}; ${c.aci318}; ${c.aisc360}; ${c.tms402}`,
          ],
          ["Software", `HouseCalc engine ${ENGINE_VERSION}; data library ${dataLibraryVersion(c.id)}`],
          ["Scope of this package", [...counts.entries()].map(([k, n]) => `${k} × ${n}`).join("; ") || "—"],
          ["Sheets in this package", String(entries.length)],
        ]}
      />
      <SectionHead title="Engineer of Record" />
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 pb-3">
          <div className="grid grid-cols-[1fr_2.2in] gap-4">
            <div className="text-[9.5pt] leading-snug">
              <p className="font-bold">{DESIGN_AID}</p>
              <p className="mt-2">
                The Engineer of Record has reviewed the design criteria, loads, member design and the items listed in
                the assumption log, and accepts responsibility for this package by signature and seal.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-[9pt]">
                <div className="border-t border-black pt-1">Engineer of Record</div>
                <div className="border-t border-black pt-1">License no. / expiration</div>
                <div className="border-t border-black pt-1">Signature</div>
                <div className="border-t border-black pt-1">Date</div>
              </div>
            </div>
            <div className="flex h-[2.2in] items-center justify-center border border-black text-[9pt]">
              Seal / stamp
            </div>
          </div>
        </td>
      </tr>
    </Sheet>
  );
}

export function SummarySheet({
  m,
  design,
  entries,
  checks,
}: {
  m: SheetMeta;
  design: ProjectDesign;
  entries: SheetEntry[];
  checks: PackageCheck[];
}) {
  const ft = footers(m);
  const rows: React.ReactNode[][] = [];
  let i = 0;
  for (const e of entries) {
    if (e.kind !== "member") continue;
    const o = design.outcomes.get(e.memberId!);
    i += 1;
    if (!o?.result) {
      rows.push([
        String(i),
        o?.spec.mark ?? "?",
        <Flag key="e">ERROR</Flag>,
        o?.error ?? "",
        "—",
        "—",
        String(e.sheetNo),
        <Flag key="r">ERR</Flag>,
      ]);
      continue;
    }
    const r = o.result;
    rows.push([
      String(i),
      r.mark,
      r.title,
      r.callout,
      spansText(r),
      f3(r.governing.ratio),
      String(e.sheetNo),
      <b key="p" className="italic">
        {r.pass ? "PASS" : "FAIL"}
      </b>,
    ]);
  }
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-summary">
      <SheetTitle title="Contents and summary of member checks" subtitle={<>{m.cycle.label}</>} />
      <DataTable
        caption="Table of contents"
        head={["Sheet", "Contents"]}
        align={["right", "left"]}
        small
        rows={entries.map((e) => [String(e.sheetNo), e.group ? `${e.group}: ${e.title}` : e.title])}
      />
      <DataTable
        caption="Framing schedule — summary of member checks"
        head={["#", "Mark", "Member", "Size / species / spacing", "Span", "Gov. D/C", "Sheet", "Result"]}
        align={["right", "left", "left", "left", "left", "right", "right", "left"]}
        small
        rows={rows}
      />
      <SectionHead title="Package checks" />
      {checks.map((c, k) => (
        <TR key={k} desc={c.ok ? "OK" : "ATTENTION"} expr={c.ok ? <>{c.text}</> : <Flag>{c.text}</Flag>} />
      ))}
    </Sheet>
  );
}

export function CriteriaSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const p = m.project;
  const cr = p.criteria;
  const ft = footers(m);
  const used = new Set<string>();
  for (const o of design.outcomes.values())
    if (o.result)
      used.add(
        "design" in o.result
          ? o.result.design.mat.speciesLabel
          : o.result.kind === "wall"
            ? o.result.typical.mat.speciesLabel
            : o.result.kind === "post"
              ? o.result.mat.speciesLabel
              : o.result.kind === "shearWall"
                ? o.result.post.speciesLabel
                : o.result.kind === "footing"
                  ? `Concrete f'c = ${cr.concrete.fc} psi${o.result.input.rebar ? `, reinforcing f_y = ${cr.concrete.fy} psi` : ""}`
                  : o.result.kind === "connector"
                    ? `${o.result.item.manufacturer} connectors`
                    : "Prefabricated wood trusses (by manufacturer)",
      );
  const presets = new Set(p.members.flatMap((x) => ("deflection" in x ? [x.deflection.preset] : [])));
  const combos = asdCombinations({ includeWind: true, includeSeismic: true, SDS: cr.seismic.SDS });
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-criteria">
      <SheetTitle
        title="Design criteria"
        subtitle={
          <>
            Engineered design per {m.cycle.building}; dwellings per {m.cycle.residential}
          </>
        }
      />
      <DesignBasis
        m={m}
        material={
          <>
            ANSI/AWC {m.cycle.nds} and {m.cycle.ndsSupplement}; manufacturer ESRs for SCL and I-joists
          </>
        }
        tables={["ibc-1607.1", "ibc-1604.3", "asce7-C3.1"]}
      />
      <SectionHead title="General" />
      <TR desc="Risk Category (IBC Table 1604.5)" expr={<B>{cr.riskCategory}</B>} />
      <TR
        desc="Live load basis"
        expr={
          <>{cr.liveBasis === "IRC" ? `${m.cycle.residential} Table R301.5` : `${m.cycle.building} Table 1607.1`}</>
        }
      />
      <TR
        desc="Roof live load"
        expr={
          <>
            L<sub>0</sub>
            {eq(`${f0(cr.roofLive.L0)} psf`)}{" "}
            {cr.roofLive.reduce ? "reduced per ASCE 7 §4.8.2 by tributary area and slope" : "— no reduction taken"}
          </>
        }
      />
      <TR
        desc="Long-term deflection factor (default)"
        expr={
          <>
            K<sub>cr</sub>
            {eq(f2(cr.Kcr))}
          </>
        }
      />
      <SectionHead title="Deflection limits — IBC / CBC Table 1604.3" />
      <DataTable
        head={["Member group", "Live (L, Lr, S)", "Total (K_cr D + live)", "Used"]}
        rows={Object.values(DEFLECTION_PRESETS).map((d) => [
          d.label,
          `L / ${d.live}`,
          `L / ${d.total}`,
          presets.has(d.preset) ? "Yes" : "—",
        ])}
      />
      <TextRow italic>
        Cantilevers: L taken as twice the cantilever length. IRC Table R301.7 live-load limits are met or exceeded by
        these values.
      </TextRow>
      <SectionHead title="Snow" />
      <TR
        desc="Ground snow load"
        expr={
          <>
            p<sub>g</sub>
            {eq(`${f0(cr.snow.pg)} psf`)} {cr.snow.pg === 0 ? "— no snow load at this site" : ""}
          </>
        }
      />
      {cr.snow.pg > 0 ? (
        <TR
          desc="Factors"
          expr={
            <>
              C<sub>e</sub> = {f2(cr.snow.Ce)}; C<sub>t</sub> = {f2(cr.snow.Ct)};{" "}
              {m.cycle.snowIncludesIs ? (
                <>
                  I<sub>s</sub> = {f2(cr.snow.Is)};{" "}
                </>
              ) : null}
              {cr.snow.slippery ? "slippery surface" : "non-slippery surface"}
            </>
          }
        />
      ) : null}
      <SectionHead title="Wind and seismic — lateral analysis sheet" />
      <TR
        desc="Basic wind speed / exposure / topography"
        expr={
          <>
            V = {f0(cr.wind.V)} mph; Exposure {cr.wind.exposure}; K<sub>zt</sub> = {f2(cr.wind.Kzt)}
          </>
        }
      />
      <TR
        desc="Seismic"
        expr={
          <>
            S<sub>DS</sub> = {f3(cr.seismic.SDS)}; S<sub>D1</sub> = {f3(cr.seismic.SD1)}; Site Class{" "}
            {cr.seismic.siteClass}; SDC {cr.seismic.SDC}
          </>
        }
      />
      <SectionHead title="Foundation" />
      <TR
        desc="Allowable soil bearing"
        expr={
          <>
            q<sub>a</sub>
            {eq(`${f0(cr.soil.bearing)} psf`)} — <Flag>{cr.soil.source}</Flag>
          </>
        }
      />
      <TR
        desc="Soil unit weight / frost depth"
        expr={
          <>
            γ = {f0(cr.soil.density)} pcf; frost depth{" "}
            {cr.soil.frostDepth ? `${f0(cr.soil.frostDepth)} in` : "— (not applicable)"}
          </>
        }
      />
      <TR
        desc="Concrete / reinforcement"
        expr={
          <>
            f'<sub>c</sub> = {f0(cr.concrete.fc)} psi (28 day); f<sub>y</sub> = {f0(cr.concrete.fy)} psi; cover{" "}
            {f1(cr.concrete.cover)} in. cast against earth
          </>
        }
      />
      <SectionHead title="Materials used in this package" />
      {[...used].map((u) => (
        <TR key={u} desc="Wood member" expr={<>{u}</>} />
      ))}
      <SectionHead title="Load combinations — ASCE 7 §2.4.1 and §2.4.5 (ASD)" />
      <DataTable
        head={["Ref.", "Combination", "C_D (NDS Table 2.3.2)"]}
        small
        rows={combos.map((c) => [c.ref, c.label, f2(loadDurationFactor(c))])}
      />
      <TextRow italic>
        {CD_TABLE_NOTE}. Each member lists only the combinations relevant to the loads it carries.
      </TextRow>
    </Sheet>
  );
}

export function LoadsSheet({ m }: { m: SheetMeta }) {
  const p = m.project;
  const ft = footers(m);
  const liveUses = new Set<string>();
  for (const x of p.members) {
    if ("live" in x && x.live?.use) liveUses.add(x.live.use);
    if (x.kind === "beam") for (const a of x.area) if (a.live?.use) liveUses.add(a.live.use);
  }
  const usedAssemblies = new Set<string>();
  for (const x of p.members) {
    if ("dead" in x && x.dead?.assemblyId) usedAssemblies.add(x.dead.assemblyId);
    if (x.kind === "beam" || x.kind === "wall") {
      for (const a of x.area) if (a.dead?.assemblyId) usedAssemblies.add(a.dead.assemblyId);
      for (const w of x.walls) if (w.dead.assemblyId) usedAssemblies.add(w.dead.assemblyId);
    }
    if ((x.kind === "wall" || x.kind === "shearWall") && x.self.assemblyId) usedAssemblies.add(x.self.assemblyId);
  }
  if (p.lateral?.enabled)
    for (const st of p.lateral.stories) for (const it of st.items) if (it.assemblyId) usedAssemblies.add(it.assemblyId);
  const cr = p.criteria;
  const snowExample =
    cr.snow.pg > 0
      ? snowLoads({
          edition: m.cycle.asce7,
          pg: cr.snow.pg,
          Ce: cr.snow.Ce,
          Ct: cr.snow.Ct,
          Is: cr.snow.Is,
          rise: 0,
          slippery: cr.snow.slippery,
          W: 20,
          gable: true,
        })
      : undefined;
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-loads">
      <SheetTitle
        title="Design loads"
        subtitle={
          <>
            Dead loads per ASCE 7 Table C3.1-1a; live loads per{" "}
            {cr.liveBasis === "IRC" ? "IRC / CRC Table R301.5" : "IBC / CBC Table 1607.1"}; roof live and snow per{" "}
            {m.cycle.asce7}
          </>
        }
      />
      <DesignBasis m={m} tables={["asce7-C3.1", "ibc-1607.1"]} />
      <SectionHead title="Dead load assemblies" />
      {p.assemblies
        .filter((a) => usedAssemblies.has(a.id))
        .map((a) => {
          const sum = assemblySum(a);
          let design: string;
          try {
            design = `${f1(assemblyDesignValue(a))} psf`;
          } catch (e) {
            design = e instanceof Error ? e.message : "invalid";
          }
          return (
            <DataTable
              key={a.id}
              caption={`${a.id} — ${a.name} (${a.basis === "sloped" ? "per ft² of roof surface" : a.basis === "wall" ? "per ft² of wall" : "per ft² of plan area"})`}
              head={["Component", "psf", "Source"]}
              align={["left", "right", "left"]}
              small
              rows={[
                ...a.components.map((c) => [
                  c.overridden ? <Flag key="n">{c.name}</Flag> : c.name,
                  needsVerify(c) ? <Flag key="v">{f2(c.psf)}</Flag> : f2(c.psf),
                  c.overridden ? (
                    <Flag key="s">Override — VERIFY</Flag>
                  ) : c.source === "C3.1-1a" ? (
                    "ASCE 7 Table C3.1-1a"
                  ) : c.source === "typical" ? (
                    <Flag key="t">Typical value — VERIFY with product</Flag>
                  ) : c.source === "computed" ? (
                    "Computed"
                  ) : (
                    "Entered"
                  ),
                ]),
                [<b key="s">Itemised sum</b>, <b key="v">{f2(sum)}</b>, ""],
                [
                  <b key="d">Design value</b>,
                  <b key="w">{design}</b>,
                  a.designValue !== undefined ? "Rounded up for design" : "Itemised sum",
                ],
              ]}
            />
          );
        })}
      {p.assemblies.some((a) => !usedAssemblies.has(a.id)) ? (
        <TextRow italic>
          Assemblies defined but not used by any member:{" "}
          {p.assemblies
            .filter((a) => !usedAssemblies.has(a.id))
            .map((a) => `${a.id} ${a.name}`)
            .join("; ")}
          .
        </TextRow>
      ) : null}
      <SectionHead title="Live loads" />
      <DataTable
        head={["Use", "psf", "Reference", "Used"]}
        align={["left", "right", "left", "left"]}
        small
        rows={LIVE_LOADS.filter((l) => l.use !== "none").map((l) => {
          const v = liveLoad(l.use, cr.liveBasis);
          return [
            l.label + (l.concentrated ? ` — concentrated ${l.concentrated}` : ""),
            f0(v.psf),
            v.ref,
            liveUses.has(l.use) ? "Yes" : "—",
          ];
        })}
      />
      <TextRow italic>
        Floor live load reduction (ASCE 7 §4.7) is not taken. Uninhabitable attic loads are not combined with other live
        loads.
      </TextRow>
      <SectionHead title="Roof live load — ASCE 7 §4.8" />
      <TR
        desc="Ordinary roof live load"
        expr={
          <>
            L<sub>0</sub>
            {eq(`${f0(cr.roofLive.L0)} psf`)} on horizontal projection
          </>
        }
      />
      <TR
        desc="Reduction"
        expr={
          cr.roofLive.reduce ? (
            <>
              L<sub>r</sub> = L<sub>0</sub> R<sub>1</sub> R<sub>2</sub>, 12 ≤ L<sub>r</sub> ≤ 20 psf; R<sub>1</sub> from
              tributary area, R<sub>2</sub> from rise F (Eq. 4.8-1) — computed on each member sheet
            </>
          ) : (
            <>None taken (conservative)</>
          )
        }
      />
      <SectionHead title={`Snow — ${m.cycle.asce7} Chapter 7`} />
      {snowExample ? (
        <>
          <TR
            desc="Flat-roof snow load"
            expr={
              <>
                p<sub>f</sub> = 0.7 C<sub>e</sub> C<sub>t</sub>{" "}
                {m.cycle.snowIncludesIs ? (
                  <>
                    I<sub>s</sub>{" "}
                  </>
                ) : null}
                p<sub>g</sub>
                {eq(`${f2(snowExample.pf)} psf`)} ({snowExample.refs.pf})
              </>
            }
          />
          <TR
            desc="Sloped-roof snow load"
            expr={
              <>
                p<sub>s</sub> = C<sub>s</sub> p<sub>f</sub> — C<sub>s</sub> from Fig. 7.4-1 for each roof slope (member
                sheets)
              </>
            }
          />
          <TR
            desc="Minimum snow load, slopes < 15°"
            expr={
              <>
                p<sub>m</sub>
                {eq(`${f2(snowExample.pm)} psf`)} ({snowExample.refs.pm})
              </>
            }
          />
          {snowExample.flags.map((f, i) => (
            <TextRow key={i}>
              <Flag>{f}</Flag>
            </TextRow>
          ))}
        </>
      ) : (
        <TR
          desc="Ground snow load"
          expr={
            <>
              p<sub>g</sub> = 0 psf — snow loads do not apply
            </>
          }
        />
      )}
    </Sheet>
  );
}

const byMark = <T extends { mark: string }>(a: T, b: T) => a.mark.localeCompare(b.mark, undefined, { numeric: true });
const pf = (r: { pass: boolean }) => (r.pass ? "PASS" : "FAIL");

export function SchedulesSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const p = m.project;
  const results = [...design.outcomes.values()].map((o) => o.result).filter((r): r is AnyResult => !!r);
  const of = <K extends AnyResult["kind"]>(...k: K[]) =>
    results.filter((r): r is Extract<AnyResult, { kind: K }> => (k as string[]).includes(r.kind)).sort(byMark);
  const framing = of("joist", "rafter", "ceilingJoist", "ijoist");
  const trusses = of("truss");
  const wts = of("woodTruss");
  const beams = of("beam");
  const walls = of("wall");
  const posts = of("post");
  const sws = of("shearWall");
  const cns = of("connector");
  const ftgs = of("footing");
  const sbs = of("steelBeam");
  const scs = of("steelColumn");
  const bps = of("basePlate");
  const dias = of("diaphragm");
  const sts = of("transfer");
  const ups = of("uplift");
  const lgs = of("ledger");
  const cws = of("masonryWall");
  const hfs = of("holdownFooting");
  const tis = of("tieIn");
  const usedHw = new Set<string>([
    ...cns.map((c) => c.item.id),
    ...sws.flatMap((x) => (x.holdown ? [x.holdown.item.id] : [])),
    ...sws.flatMap((x) => (x.ftao?.strap ? [x.ftao.strap.item.id] : [])),
    ...dias.flatMap((x) =>
      x.input.chord.splice.type === "strap" && x.input.chord.splice.strapId ? [x.input.chord.splice.strapId] : [],
    ),
    ...sts.flatMap((x) => (x.input.connector.type === "clip" ? [x.input.connector.hardwareId] : [])),
    ...ups.flatMap((x) =>
      x.input.levels.flatMap((l) => (l.connector.type === "hardware" ? [l.connector.hardwareId] : [])),
    ),
  ]);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-schedules">
      <SheetTitle
        title="Schedules"
        subtitle={<>Generated from the member results — schedules and sheets cannot disagree</>}
      />
      {framing.length ? (
        <DataTable
          caption="Framing schedule (repetitive members)"
          head={[
            "Mark",
            "Member",
            "Size / species / grade",
            "Spacing",
            "Span",
            "Bearing / connection",
            "Gov. D/C",
            "Result",
          ]}
          small
          rows={framing.map((r) => [
            r.mark,
            r.title,
            r.kind === "ijoist" ? `${r.input.depth} ${r.input.series}` : r.design.mat.label,
            `${fmt(r.input.spacing, r.input.spacing % 1 ? 1 : 0)} in. o.c.`,
            spansText(r),
            r.kind === "ceilingJoist" && r.tension?.nail
              ? `Heel: ${r.tension.nail.provided} × ${r.tension.nail.label.split(" (")[0]}`
              : r.kind === "rafter"
                ? `Seat ${f2(r.input.plateSeat)} in.${r.input.seatCut ? `, birdsmouth ${f2(r.input.seatCut)} in.` : ""}`
                : `${r.input.bearing.map((b) => f2(b)).join(" / ")} in.`,
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {trusses.length ? (
        <DataTable
          caption="Truss schedule (deferred submittal — reactions from the truss design)"
          head={["Mark", "Type", "Span", "Spacing", "Max down per bearing (lb)", "Max uplift (lb)", "Design ref."]}
          small
          rows={trusses.map((r) => [
            r.mark,
            r.title,
            fmtFtIn(r.input.span),
            r.input.girder ? `${r.input.plies}-ply girder` : `${f0(r.input.spacing)} in. o.c.`,
            r.reactions.map((x) => `${x.name} ${f0(x.maxDown)}`).join("; "),
            r.reactions.some((x) => x.minNet < 0) ? f0(-Math.min(...r.reactions.map((x) => x.minNet))) : "—",
            r.input.designRef || "—",
          ])}
        />
      ) : null}
      {wts.length ? (
        <DataTable
          caption="Truss schedule (designed in HouseCalc)"
          head={[
            "Mark",
            "Type",
            "Span",
            "Spacing",
            "Top chord",
            "Bottom chord",
            "Webs",
            "Joints",
            "Max down / uplift (lb)",
            "Result",
          ]}
          small
          rows={wts.map((r) => [
            r.mark,
            r.input.type === "parallel" ? `parallel chord, ${r.input.panels ?? 8} panels` : r.input.type,
            fmtFtIn(r.input.span),
            `${f0(r.input.spacing)} in. o.c.`,
            `${r.input.tc.size} ${r.input.tc.species} ${r.input.tc.grade}`,
            `${r.input.bc.size} ${r.input.bc.species} ${r.input.bc.grade}`,
            `${r.input.web.size} ${r.input.web.species} ${r.input.web.grade}${r.input.webBracing === "midpoint" ? ", braced at mid-length" : ""}`,
            r.input.joint.type === "plate"
              ? "metal plates (by manufacturer)"
              : r.input.joint.type === "nailed"
                ? "nailed gussets"
                : "bolted gussets",
            r.reactions.map((x) => `${f0(x.maxDown)}${x.minNet < 0 ? ` / ${f0(-x.minNet)} up` : ""}`).join("; "),
            pf(r),
          ])}
        />
      ) : null}
      {beams.length ? (
        <DataTable
          caption="Beam / header schedule"
          head={[
            "Mark",
            "Type",
            "Size / grade",
            "Span",
            "Bearing (in.)",
            "Reactions, max down (lb)",
            "Gov. D/C",
            "Result",
          ]}
          small
          rows={beams.map((r) => [
            r.mark,
            r.title,
            r.callout,
            spansText(r),
            r.input.bearing.map((b) => f2(b)).join(" / "),
            r.reactions.map((x) => `${x.name} ${f0(x.maxDown)}`).join("; "),
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {walls.length ? (
        <DataTable
          caption="Wall schedule (bearing walls)"
          head={[
            "Wall type",
            "Stud size",
            "Spacing",
            "Species / grade",
            "Top plate",
            "Bottom plate",
            "Stud packs / openings",
            "Gov. D/C",
            "Result",
          ]}
          small
          rows={walls.map((r) => [
            r.mark,
            r.input.size,
            `${f0(r.input.spacing)} in. o.c.`,
            `${r.input.species} ${r.input.grade}`,
            `(${r.input.topPlates}) ${r.input.size}`,
            `(${r.input.bottomPlates}) ${r.input.size}${r.input.bottomPlates ? " PT where on concrete" : ""}`,
            [
              ...r.packs.map((k) => `(${k.n}) studs @ ${fmtFtIn(k.x ?? 0)}`),
              ...r.input.openings.map((o) => `${o.label}: (${o.kings}) kings`),
            ].join("; ") || "—",
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {posts.length ? (
        <DataTable
          caption="Post schedule"
          head={[
            "Mark",
            "Size / grade",
            "Height",
            "Base reaction max (lb)",
            "Uplift (lb)",
            "Cap / base",
            "Gov. D/C",
            "Result",
          ]}
          small
          rows={posts.map((r) => [
            r.mark,
            r.callout.split(",")[0],
            fmtFtIn(r.input.height),
            f0(r.reactions[0].maxDown),
            r.reactions[0].minNet < 0 ? f0(-r.reactions[0].minNet) : "—",
            cns
              .filter((c) => c.input.sourceMark === r.mark)
              .map((c) => c.item.model)
              .join(", ") || "per schedule",
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {sws.length ? (
        <DataTable
          caption="Shear wall schedule"
          head={[
            "Mark",
            "Line",
            "Length × height",
            "Sheathing",
            "Edge / field nailing",
            "v (plf) / allow.",
            "Hold-down",
            "Sill anchor",
            "Result",
          ]}
          small
          rows={sws.map((r) => [
            r.mark,
            r.demand.lineName,
            `${fmtFtIn(r.input.b)} × ${fmtFtIn(r.input.h)}`,
            r.sides.map((x) => x.row.label).join(" + "),
            r.sides.map((x) => `${x.row.nail} @ ${x.spacing}" / 12"`).join(" + "),
            `${f0(Math.max(r.vS, r.vW))} / ${f0(r.vS >= r.vW ? r.vAllowS : r.vAllowW)}`,
            r.holdown ? r.holdown.item.model : "—",
            `${r.input.sill.type === "cast-in" ? `${fmtInFraction(r.input.sill.d)}" A.B.` : (r.input.sill.label ?? "PIA")} @ ${f0(r.input.sill.spacing)}"`,
            pf(r),
          ])}
        />
      ) : null}
      {sws.some((r) => r.holdown) ? (
        <DataTable
          caption="Hold-down schedule"
          head={["Mark", "Device", "Location (wall ends)", "Tension T (lb)", "Allowable (lb)", "Anchor"]}
          small
          rows={sws
            .filter((r) => r.holdown)
            .map((r) => [
              r.holdown!.item.model,
              hardwareLabel(r.holdown!.item),
              `Both ends of ${r.mark}`,
              f0(r.holdown!.T),
              f0(r.holdown!.item.tension ?? 0),
              r.input.holdownAnchor
                ? `${fmtInFraction(r.input.holdownAnchor.d)}" ${r.input.holdownAnchor.steel}, h_ef ${f0(r.input.holdownAnchor.hef)}"`
                : `${fmtInFraction(r.holdown!.item.anchorDia ?? 0.625)}" anchor per manufacturer`,
            ])}
        />
      ) : null}
      {cns.length ? (
        <DataTable
          caption="Connector schedule"
          head={["Tag", "Model", "Location", "Qty", "Max demand (lb)", "Gov. D/C", "Result"]}
          small
          rows={cns.map((r) => [
            r.mark,
            r.item.model,
            `${r.input.sourceMark} ${r.input.supportName}`,
            String(r.input.quantity),
            f0(r.governing.demand),
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {ftgs.length ? (
        <DataTable
          caption="Foundation schedule"
          head={["Type mark", "Ftg. size", "Reinforcement", "Depth below grade", "q max / q_a (psf)", "Result"]}
          small
          rows={ftgs.map((r) => [
            r.mark,
            r.input.type === "strip"
              ? `${f0(r.input.B * 12)}" W × ${f0(r.input.h)}" D continuous`
              : `${f0(r.input.B * 12)}" × ${f0((r.input.L ?? r.input.B) * 12)}" × ${f0(r.input.h)}" D`,
            [
              r.input.rebar
                ? r.input.type === "strip"
                  ? `${r.input.rebar.size} @ ${f0(r.input.rebar.spacing ?? 12)}" transverse`
                  : `(${r.input.rebar.count}) ${r.input.rebar.size} each way`
                : "plain",
              r.input.longitudinal
                ? `(${r.input.longitudinal.top}) ${r.input.longitudinal.size} T & (${r.input.longitudinal.bottom}) ${r.input.longitudinal.size} B`
                : "",
            ]
              .filter(Boolean)
              .join("; "),
            `${f0(r.input.depth)}"`,
            `${f0(r.serviceGov.q)} / ${f0(r.input.qa)}`,
            pf(r),
          ])}
        />
      ) : null}
      {sbs.length || scs.length ? (
        <DataTable
          caption="Steel beam and column schedule"
          head={["Mark", "Member", "Section / grade", "Span / height", "Bracing", "Method", "Gov. D/C", "Result"]}
          small
          rows={[
            ...sbs.map((r) => [
              r.mark,
              r.title,
              r.callout,
              spansText(r),
              r.input.Lb > 0 ? rich(`L_b = ${fmtFtIn(r.input.Lb)}`) : "continuous",
              r.method,
              f3(r.governing.ratio),
              pf(r),
            ]),
            ...scs.map((r) => [
              r.mark,
              r.title,
              `${r.shape.name} ${r.gradeLabel}`,
              fmtFtIn(r.input.height),
              `K = ${r.input.Kx} / ${r.input.Ky}`,
              r.method,
              f3(r.governing.ratio),
              pf(r),
            ]),
          ]}
        />
      ) : null}
      {bps.length ? (
        <DataTable
          caption="Base plate schedule"
          head={["Mark", "Column", "Plate N × B × t", "Anchor rods", "Embedment", "Weld", "Result"]}
          small
          rows={bps.map((r) => [
            r.mark,
            r.input.sourceMark ? `${r.input.sourceMark} (${r.col.name})` : r.col.name,
            `${f2(r.input.plate.N)}" × ${f2(r.input.plate.B)}" × ${fmtInFraction(r.input.plate.tp)}"`,
            `(${r.input.rod.nx * r.input.rod.ny}) ${fmtInFraction(r.input.rod.d)}" ${r.rodSteel.label} @ ${f2(r.input.rod.sx)}" × ${f2(r.input.rod.sy)}"`,
            rich(`h_ef ${f2(r.input.rod.hef)}" ${r.input.rod.type}`),
            `${fmtInFraction(r.input.weld.w)}" fillet all round`,
            pf(r),
          ])}
        />
      ) : null}
      {dias.length ? (
        <DataTable
          caption="Diaphragm schedule"
          head={[
            "Mark",
            "Level / load dir.",
            "Sheathing",
            "Nailing (edge / field)",
            "Blocking",
            "Max v (plf) / allow.",
            "Chord splice",
            "Result",
          ]}
          small
          rows={dias.map((r) => {
            const vs = Math.max(...r.segments.map((x) => 0.7 * x.vE));
            const vw = Math.max(...r.segments.map((x) => 0.6 * x.vW));
            return [
              r.mark,
              `${r.input.level} / ${r.input.dir}`,
              r.values.row.label,
              r.input.blocked
                ? `${r.input.edge.replace("2.5", "2-1/2").replace("/", '" / ')}" (boundary / other edges), 12" field`
                : '6" edge, 12" field',
              r.input.blocked ? "Blocked" : "Unblocked",
              `${f0(Math.max(vs, vw))} / ${f0(vs >= vw ? r.vAllowS : r.vAllowW)}`,
              r.chord.spliceText.split(":")[0],
              pf(r),
            ];
          })}
        />
      ) : null}
      {sts.length || ups.length ? (
        <DataTable
          caption="Shear transfer and uplift connection schedule"
          head={["Tag", "Connection", "Connector", "Spacing", "Demand / capacity (lb)", "Result"]}
          small
          rows={[
            ...sts.map((r) => [
              r.mark,
              `${r.input.interface.replace(/-/g, " ")} — ${r.demand.sourceText}`,
              r.callout,
              `${f0(r.input.spacing)}" o.c.`,
              `${f0(r.perFastener)} / ${f0(r.capacity)}`,
              pf(r),
            ]),
            ...ups.flatMap((r) =>
              r.rows.map((x, i) => [
                i === 0 ? r.mark : "",
                `${x.label} (${r.input.sourceMark})`,
                x.model,
                `${f0(x.spacing)}" o.c.`,
                `${f0(x.F)} / ${f0(x.capacity)}`,
                x.F <= x.capacity ? "OK" : "FAIL",
              ]),
            ),
          ]}
        />
      ) : null}
      {lgs.length ? (
        <DataTable
          caption="Ledger schedule"
          head={["Mark", "Member size", "Anchorage", "Support", "Gov. D/C", "Result"]}
          small
          rows={lgs.map((r) => [
            r.mark,
            `${r.input.ledger.size} ${r.input.ledger.species} ${r.input.ledger.grade}`,
            `${fmtInFraction(r.input.fastener.D)}" ${r.input.fastener.type === "bolt" ? "bolts" : "lag screws"} @ ${f0(r.input.fastener.spacing)}" o.c.`,
            r.supportText,
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {cws.length ? (
        <DataTable
          caption="Concrete / CMU wall schedule"
          head={["Mark", "Wall", "Height", "Vertical reinf.", "Horizontal reinf.", "Material", "Gov. D/C", "Result"]}
          small
          rows={cws.map((r) => [
            r.mark,
            `${fmtInFraction(r.input.t)}" ${r.input.material === "cmu" ? "CMU, fully grouted" : "concrete"}`,
            fmtFtIn(r.input.h) +
              (r.input.parapet && r.input.support !== "cantilever" ? ` + ${fmtFtIn(r.input.parapet)} parapet` : ""),
            `${r.input.vertical.size} @ ${f0(r.input.vertical.spacing)}" o.c.${r.input.vertical.layout === "each-face" ? " E.F." : ""}`,
            `${r.input.horizontal.count > 1 ? `(${r.input.horizontal.count}) ` : ""}${r.input.horizontal.size} @ ${f0(r.input.horizontal.spacing)}" o.c.`,
            r.input.material === "cmu"
              ? `f'm ${f0(r.input.cmu!.fm)} psi, Type ${r.input.cmu!.mortar} mortar, Gr. ${f0(r.input.fy / 1000)}`
              : `f'c ${f0(r.input.concrete!.fc)} psi, Gr. ${f0(r.input.fy / 1000)}`,
            f3(r.governing.ratio),
            pf(r),
          ])}
        />
      ) : null}
      {hfs.length ? (
        <DataTable
          caption="Shear-wall / hold-down footing schedule"
          head={["Mark", "Under", "Footing size", "Reinforcement", "q_max / q_a", "Overturning", "Result"].map((h) =>
            rich(h),
          )}
          small
          rows={hfs.map((r) => [
            r.mark,
            r.wallMark,
            `${f0(r.input.B * 12)}" W × ${f0(r.input.h)}" D × ${fmtFtIn(r.input.Lf)}`,
            r.input.longitudinal
              ? `(${r.input.longitudinal.top}) ${r.input.longitudinal.size} T, (${r.input.longitudinal.bottom}) ${r.input.longitudinal.size} B`
              : "plain",
            f3(r.govBearing.qRatio),
            f3(r.govOT.otRatio),
            pf(r),
          ])}
        />
      ) : null}
      {tis.length ? (
        <DataTable
          caption="Tie-in to existing concrete schedule"
          head={["Mark", "Joint", "Dowel / anchor", "Embedment", "Adhesive", "φN_n / φV_n (plf)", "Result"].map((h) =>
            rich(h),
          )}
          small
          rows={tis.map((r) => [
            r.mark,
            r.input.joint,
            `${r.input.anchor.kind === "rebar" ? r.input.anchor.size : `${fmtInFraction(r.d)}" rod`} @ ${f0(r.input.spacing)}" o.c.`,
            `${f1(r.input.hef)}"`,
            `${r.input.product.name} (${r.input.product.report})`,
            `${f0(r.perFoot.phiNn)} / ${f0(r.perFoot.phiVn)}`,
            pf(r),
          ])}
        />
      ) : null}
      {usedHw.size ? (
        <DataTable
          caption="Connector hardware data used (project hardware list)"
          head={["Model", "Type", "Fasteners", "Allowable loads (lb)", "Report", "Status"]}
          small
          rows={p.hardware
            .filter((h) => usedHw.has(h.id))
            .map((h) => [
              h.model,
              h.description,
              h.fasteners,
              [
                h.down
                  ? `down ${Object.entries(h.down)
                      .map(([k, v]) => `${v} (${k})`)
                      .join(", ")}`
                  : "",
                h.uplift !== undefined ? `uplift ${h.uplift}` : "",
                h.tension !== undefined ? `tension ${h.tension}` : "",
                h.F1 !== undefined ? `F1 ${h.F1}` : "",
              ]
                .filter(Boolean)
                .join("; "),
              h.report || "—",
              h.checked ? "Checked" : <Flag key="v">VERIFY</Flag>,
            ])}
        />
      ) : null}
      <TextRow italic>Typical nailing per CRC / IRC Table R602.3(1) unless scheduled above.</TextRow>
    </Sheet>
  );
}

export function GeneralNotesSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const c = m.cycle;
  const n = generateNotes(m.project, design);
  const hw = hardwareSchedule(m.project, design);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-notes">
      <SheetTitle title="General structural notes" subtitle={<>{c.label} — generated from the designed members</>} />
      {n.sections.map((sec) => (
        <NotesList key={sec.title} title={sec.title} notes={sec.notes.map((t) => rich(t))} />
      ))}
      {m.project.notes.trim() ? (
        <NotesList title="Project notes (entered)" notes={m.project.notes.split(/\n+/).filter(Boolean)} />
      ) : null}
      <NotesList title="Responsibility" notes={[DESIGN_AID]} />
      {hw.length ? (
        <>
          <SectionHead title="Hardware schedule" />
          <DataTable
            head={["Model", "Description", "Fasteners", "Used at", "Max D/C", "Report", "Status"]}
            small
            rows={hw.map((h) => [
              h.model,
              h.description,
              h.fasteners,
              h.usedAt.join("; "),
              f3(h.maxRatio),
              h.report || "—",
              h.checked ? "Checked" : <Flag key="v">VERIFY</Flag>,
            ])}
          />
        </>
      ) : null}
      {n.inspections.length ? (
        <>
          <SectionHead title="Special inspections (IBC Ch. 17) — to be confirmed by the Engineer of Record" />
          <DataTable
            head={["Item", "Basis", "Type", "Members"]}
            small
            rows={n.inspections.map((i) => [i.item, i.basis, i.type, i.members])}
          />
        </>
      ) : null}
      {n.deferred.length ? <NotesList title="Deferred submittals" notes={n.deferred} /> : null}
      <SectionHead title="Specific notes by member" />
      {n.specific.length ? (
        <DataTable
          head={["Mark", "Note"]}
          small
          rows={n.specific.map((x) => [
            x.mark,
            x.note.includes("VERIFY") ? <Flag key="f">{x.note}</Flag> : rich(x.note),
          ])}
        />
      ) : (
        <TextRow italic>No specific notes.</TextRow>
      )}
      <SectionHead title="Field verification and items to confirm" />
      {n.fieldVerify.length ? (
        <DataTable
          head={["Mark", "Item", "Value / basis"]}
          small
          rows={n.fieldVerify.map((x) => [x.mark, x.item, <Flag key="v">{x.value}</Flag>])}
        />
      ) : (
        <TextRow italic>None.</TextRow>
      )}
    </Sheet>
  );
}

export function AssumptionLogSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const rows: React.ReactNode[][] = [];
  for (const o of design.outcomes.values()) {
    if (o.error) rows.push([o.spec.mark, "Design error", <Flag key="e">{o.error}</Flag>, "—"]);
    for (const a of o.result?.assumptions ?? [])
      rows.push([
        o.spec.mark,
        a.item,
        a.verify || a.provenance.kind === "override" ? <Flag key="v">{a.value}</Flag> : a.value,
        <>
          {provenanceLabel(a.provenance)}
          {a.verify ? <Flag> — VERIFY</Flag> : null}
        </>,
      ]);
  }
  const verify = [...design.outcomes.values()].reduce(
    (n, o) => n + (o.result?.assumptions.filter((a) => a.verify).length ?? 0) + (o.error ? 1 : 0),
    0,
  );
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-assumptions">
      <SheetTitle
        title="Assumption log"
        subtitle={<>Every default, override and item requiring verification, by member</>}
      />
      <DataTable head={["Mark", "Item", "Value", "Source"]} small rows={rows} />
      <TextRow italic>
        {rows.length} entries; {verify} marked VERIFY or in error. Items marked VERIFY must be resolved by the Engineer
        of Record before the package is issued.
      </TextRow>
    </Sheet>
  );
}
