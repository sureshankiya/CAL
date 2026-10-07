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
import type { AnyResult, Project, ProjectDesign } from "@/engine/project";
import { B, DataTable, Flag, NotesList, SectionHead, Sheet, SheetTitle, TextRow, TR, eq } from "../report/primitives";
import type { PackageCheck, SheetEntry } from "../report/package";
import { DESIGN_AID, DesignBasis, f0, f1, f2, f3, footers, titleFields, type SheetMeta } from "./common";

function spansText(r: AnyResult): string {
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
    if (o.result) used.add("design" in o.result ? o.result.design.mat.speciesLabel : `${o.result.callout}`);
  const presets = new Set(p.members.map((x) => x.deflection.preset));
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
      <SectionHead title="Wind and seismic (recorded for the lateral design, Phase 2)" />
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
    if (x.kind === "beam") {
      for (const a of x.area) if (a.dead?.assemblyId) usedAssemblies.add(a.dead.assemblyId);
      for (const w of x.walls) if (w.dead.assemblyId) usedAssemblies.add(w.dead.assemblyId);
    }
  }
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

export function SchedulesSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const results = [...design.outcomes.values()].map((o) => o.result).filter((r): r is AnyResult => !!r);
  const framing = results
    .filter((r) => r.kind !== "beam")
    .sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }));
  const beams = results
    .filter((r) => r.kind === "beam")
    .sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }));
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-schedules">
      <SheetTitle
        title="Schedules"
        subtitle={<>Generated from the member results — schedules and sheets cannot disagree</>}
      />
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
              : "bearing" in r.input
                ? `${r.input.bearing.map((b) => f2(b)).join(" / ")} in.`
                : "—",
          f3(r.governing.ratio),
          r.pass ? "PASS" : "FAIL",
        ])}
      />
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
        rows={beams.map((r) =>
          r.kind === "beam"
            ? [
                r.mark,
                r.title,
                r.callout,
                spansText(r),
                r.input.bearing.map((b) => f2(b)).join(" / "),
                r.reactions.map((x) => `${x.name} ${f0(x.maxDown)}`).join("; "),
                f3(r.governing.ratio),
                r.pass ? "PASS" : "FAIL",
              ]
            : [],
        )}
      />
      <TextRow italic>
        Jacks / kings, hangers, posts and hold-downs are scheduled with the Phase 2 wall, post and connection design.
      </TextRow>
    </Sheet>
  );
}

export function GeneralNotesSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const c = m.cycle;
  const specific: Array<[string, string]> = [];
  for (const o of design.outcomes.values()) for (const f of o.result?.flags ?? []) specific.push([o.spec.mark, f]);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-notes">
      <SheetTitle title="General structural notes" subtitle={<>{c.label}</>} />
      <NotesList
        title="General notes"
        notes={[
          `Codes: ${c.building}; ${c.residential}; ${c.asce7}; ANSI/AWC ${c.nds} with ${c.ndsSupplement}; ${c.sdpws}.`,
          "Design loads as listed on the design criteria and loads sheets. Dead loads include the framing allowance stated in each assembly.",
          "Sawn lumber: grade-stamped by an approved agency, moisture content 19 % or less at installation; species and grade as scheduled.",
          "Glued laminated timber per ANSI A190.1 with an AITC / APA trademark; structural composite lumber per the manufacturer ICC-ES evaluation report.",
          "Prefabricated wood I-joists: install, block and stiffen per the manufacturer's literature; no field cuts in flanges.",
          `Fastening per ${c.residential} Table R602.3(1) and ${c.building} Table 2304.10.2 unless noted otherwise.`,
          "Connectors and hangers: Simpson Strong-Tie or approved equal with a current ICC-ES report; fill all fastener holes; hot-dip galvanized or stainless where exposed or in contact with preservative-treated wood.",
          "Wood in contact with concrete or masonry, or within 8 in. of earth: preservative-treated per AWPA U1.",
          "Deferred submittals: prefabricated wood trusses (design drawings and calculations by the truss manufacturer, reviewed by the Engineer of Record before submittal to the building official).",
          "Contractor to verify all dimensions and existing conditions; report discrepancies to the Engineer of Record before proceeding.",
          DESIGN_AID,
        ]}
      />
      <SectionHead title="Specific notes by member" />
      {specific.length ? (
        <DataTable
          head={["Mark", "Note"]}
          small
          rows={specific.map(([mk, f]) => [mk, f.includes("VERIFY") ? <Flag key="f">{f}</Flag> : f])}
        />
      ) : (
        <TextRow italic>No specific notes.</TextRow>
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
