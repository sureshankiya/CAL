/** IJ-# member sheet — prefabricated wood I-joists with manufacturer allowable properties. */

import { fmt } from "@/engine/core/fmt";
import type { IJoistResult } from "@/engine/members";
import { tableStatusText } from "@/engine/data/library";
import {
  B,
  DataTable,
  Divider,
  Flag,
  SectionHead,
  Sheet,
  SheetTitle,
  SubHead,
  TR,
  VerdictLine,
  eq,
} from "../report/primitives";
import { LoadingDiagram, ResultDiagrams, type DiagramGeometry } from "../report/diagrams";
import { DesignBasis, f0, f1, f2, f3, footers, titleFields, type SheetMeta } from "./common";
import {
  AssumptionRows,
  ChecksSummary,
  FinalSummary,
  LimitationNotes,
  LoadLines,
  MemberResult,
  ReactionTable,
  SpecificNotes,
  govDeflection,
} from "./blocks";

export function IJoistSheet({
  m,
  r,
  index,
  total,
  received,
}: {
  m: SheetMeta;
  r: IJoistResult;
  index: number;
  total: number;
  received: string[];
}) {
  const a = r.analysis;
  const p = r.props;
  const names = a.supports.map((_, i) => String.fromCharCode(65 + i));
  const g: DiagramGeometry = { total: a.totalLength, supports: a.supports, names };
  const ft = footers(m);
  const gm = r.rows.reduce((x, y) => (y.Mpos / (p.Mr * y.CD) > x.Mpos / (p.Mr * x.CD) ? y : x), r.rows[0]);
  // diagrams for the governing moment combination (full loading, envelopes for patterned live load)
  const n = a.x.length;
  const Mmax = new Array(n).fill(0);
  const Mmin = new Array(n).fill(0);
  const Vmax: number[] = [];
  const Vmin: number[] = [];
  const shearX: number[] = [];
  const defl = new Array(n).fill(0);
  for (const [t, f] of Object.entries(gm.combo.factors) as Array<[keyof typeof a.byType, number]>) {
    if (!f) continue;
    const pats = a.patterns[t];
    const cases = pats ?? [a.byType[t]];
    for (const c of cases)
      for (let i = 0; i < n; i++) {
        if (!pats || c.M[i] > 0) Mmax[i] += f * c.M[i];
        if (!pats || c.M[i] < 0) Mmin[i] += f * c.M[i];
        defl[i] += pats ? Math.max(0, f * c.defl[i]) : f * c.defl[i];
      }
  }
  for (let i = 0; i < n; i++) {
    let vl = 0;
    let vr = 0;
    for (const [t, f] of Object.entries(gm.combo.factors) as Array<[keyof typeof a.byType, number]>) {
      if (!f) continue;
      vl += f * a.byType[t].VL[i];
      vr += f * a.byType[t].VR[i];
    }
    shearX.push(a.x[i], a.x[i]);
    Vmax.push(vl, vr);
    Vmin.push(vl, vr);
  }
  const loads = Object.values(a.byType).flatMap((c) => c.loads);
  const verifyItems = r.assumptions.filter((x) => x.verify);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id={`sheet-${r.id}`}>
      <SheetTitle
        title="Engineered wood I-joist design calculations"
        subtitle={
          <>
            Manufacturer allowable design properties, ASD — member {index} of {total}: {r.mark}
          </>
        }
      />
      <DesignBasis
        m={m}
        material={<>Manufacturer evaluation report (ICC-ES ESR-1153); ANSI/AWC {m.cycle.nds} load duration</>}
        tables={["tji-4000", "ibc-1604.3"]}
      />

      <SectionHead title="Configuration & geometry" />
      <TR desc="Member" expr={<B>{`${r.mark} — I-joist`}</B>} />
      {r.input.description ? <TR desc="Description" expr={<>{r.input.description}</>} /> : null}
      <TR desc="Series / depth" expr={<B>{`${r.input.series} ${r.input.depth}`}</B>} />
      <TR desc="On-center spacing" expr={<>s{eq(`${fmt(r.input.spacing, r.input.spacing % 1 ? 1 : 0)} in`)}</>} />
      {a.geometry.leftCantilever > 0 ? (
        <TR
          desc="Left cantilever"
          expr={
            <>
              L<sub>c,L</sub>
              {eq(`${f2(a.geometry.leftCantilever)} ft`)}
            </>
          }
        />
      ) : null}
      {a.geometry.spans.map((s, i) => (
        <TR
          key={i}
          desc={`Span ${i + 1}`}
          expr={
            <>
              L<sub>s{i + 1}</sub>
              {eq(`${f3(s)} ft`)}
            </>
          }
        />
      ))}
      {a.geometry.rightCantilever > 0 ? (
        <TR
          desc="Right cantilever"
          expr={
            <>
              L<sub>c,R</sub>
              {eq(`${f2(a.geometry.rightCantilever)} ft`)}
            </>
          }
        />
      ) : null}
      {a.supports.map((xs, i) => (
        <TR
          key={`b${i}`}
          desc={`Bearing length at support ${names[i]} (x = ${f2(xs)} ft)`}
          expr={
            <>
              l<sub>b</sub>
              {eq(`${f2(r.input.bearing[i] ?? r.input.bearing[r.input.bearing.length - 1])} in`)}
            </>
          }
        />
      ))}

      <SectionHead title="Manufacturer design properties (100 % load duration)" />
      <TR desc="Source" expr={<Flag>{tableStatusText("tji-4000")}</Flag>} />
      <TR
        desc="Depth / flange width"
        expr={
          <>
            d{eq(`${f3(p.d)} in`)} ; b<sub>f</sub>
            {eq(`${f3(p.bf)} in`)}
          </>
        }
      />
      <TR
        desc="Allowable moment"
        expr={
          <>
            M<sub>r</sub>
            {eq(`${f0(p.Mr)} lb-ft`)}
          </>
        }
      />
      <TR
        desc="Allowable shear"
        expr={
          <>
            V<sub>r</sub>
            {eq(`${f0(p.Vr)} lb`)}
          </>
        }
      />
      <TR
        desc="Allowable end reaction (1-3/4 in. bearing)"
        expr={
          <>
            R<sub>r</sub>
            {eq(`${f0(p.Rend)} lb`)}
          </>
        }
      />
      <TR desc="Bending stiffness" expr={<>EI{eq(`${fmt(p.EI / 1e6, 0)} × 10⁶ lb-in²`)}</>} />
      <TR desc="Shear deflection coefficient" expr={<>K{eq(`${fmt(p.K / 1e6, 2)} × 10⁶ lb`)}</>} />
      <TR
        desc="Self weight"
        expr={
          <>
            w<sub>sw</sub>
            {eq(`${f1(p.weight)} lb/ft`)} {r.input.addSelfWeight ? "(included)" : "(in the assembly framing allowance)"}
          </>
        }
      />

      <LoadLines lines={r.loadLines} />
      <LoadingDiagram g={g} loads={loads} reactions={r.reactions.map((x) => `R = ${f0(x.maxDown)} lb`)} />
      <DataTable
        caption="ASD load combinations (ASCE 7 §2.4) — results per combination"
        head={["Combination", "C_D", "M+ (lb-ft)", "M− (lb-ft)", "V (lb)", ...names.map((x) => `R${x} (lb)`)]}
        align={["left", "right", "right", "right", "right", ...names.map(() => "right" as const)]}
        small
        rows={r.rows.map((x) => [
          x.combo.label,
          f2(x.CD),
          f0(x.Mpos),
          x.Mneg < -0.5 ? f0(x.Mneg) : "—",
          f0(x.V),
          ...x.R.map(f0),
        ])}
      />
      <SectionHead title="Load path" />
      <TR desc="Loads received from" expr={<>{received.length ? received.join("; ") : "— (area loads only)"}</>} />
      <ReactionTable reactions={r.reactions} perFoot />
      <SectionHead title="Analysis" />
      <ResultDiagrams
        g={g}
        x={a.x}
        Mmax={Mmax}
        Mmin={Mmin}
        shearX={shearX}
        Vmax={Vmax}
        Vmin={Vmin}
        defl={defl}
        comboLabel={gm.combo.label}
        deflLabel={`${gm.combo.label} (bending part)`}
        patterned={Object.keys(a.patterns).length > 0}
      />

      <SectionHead title="Strength checks — capacities × C_D" />
      {r.checks
        .filter((c) => !c.name.startsWith("Deflection"))
        .map((c) => (
          <TR
            key={c.name}
            desc={`${c.name}${c.combo !== "—" ? ` — ${c.combo}, C_D = ${f2(c.CD)}` : ""}`}
            expr={
              <>
                {f1(c.demand)} {c.unit} ≤ {f1(c.capacity)} {c.unit}
                {eq(`D/C ${f3(c.ratio)}`)}
              </>
            }
            pass={c.pass}
          />
        ))}
      <SectionHead title="Deflection — bending + shear; limits IBC / CBC Table 1604.3" />
      {r.deflection.map((x) => (
        <IJoistDefl key={x.segment} x={x} />
      ))}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Selected member", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"}`],
          ["Deflection", govDeflection(r)],
          ["Reactions (max down)", r.reactions.map((x) => `${x.name} ${f0(x.maxDown)} lb`).join("; ")],
          ["Connections", "Hangers, web stiffeners, blocking and rim per manufacturer and connection schedule"],
          [
            "Field verification",
            verifyItems.length ? <Flag key="f">{verifyItems.map((x) => x.item).join("; ")}</Flag> : "None",
          ],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Manufacturer allowable values at 100 % load duration, adjusted by C_D per combination.",
          "Shear deflection taken as 8 (M − M_chord) / K; simple-span uniform load reduces to 12 w L² / K (w in plf, L in ft).",
          "Holes, notches and concentrated loads on flanges per manufacturer only; no field cuts in flanges.",
        ]}
      />
    </Sheet>
  );
}

function IJoistDefl({ x }: { x: IJoistResult["deflection"][number] }) {
  return (
    <>
      <SubHead
        title={`${x.kind === "cantilever" ? "Cantilever" : `Span ${x.segment + 1}`} — L = ${f3(x.length)} ft${x.kind === "cantilever" ? `, limit length ${f3(x.limitLength)} ft` : ""}`}
      />
      <TR
        desc={`Live load deflection (${x.liveSource})`}
        expr={
          <>
            δ<sub>L</sub> = δ<sub>bending</sub> + δ<sub>shear</sub> = {f3(x.liveBending)} + {f3(x.liveShear)}
            {eq(`${f3(x.live)} in`)} ≤ {f3(x.liveLimit)} in
          </>
        }
        pass={x.live <= x.liveLimit}
      />
      <TR
        desc={`Total deflection (${x.totalSource})`}
        expr={
          <>
            δ<sub>T</sub>
            {eq(`${f3(x.total)} in`)} ≤ {f3(x.totalLimit)} in
          </>
        }
        pass={x.total <= x.totalLimit}
      />
      <VerdictLine
        pass={x.live <= x.liveLimit && x.total <= x.totalLimit}
        message={
          x.live <= x.liveLimit && x.total <= x.totalLimit ? "Deflection within limits" : "Deflection exceeds limit"
        }
      />
    </>
  );
}
