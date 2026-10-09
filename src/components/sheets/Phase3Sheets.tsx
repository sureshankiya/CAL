/**
 * Phase 3 member sheets — steel beams / lintels, steel columns, base plates
 * with anchor rods, diaphragms with chords and collectors, shear transfer,
 * wind uplift path and ledgers — in the Tedds-style layout of the other sheets.
 */

import type React from "react";
import { Fragment } from "react";
import { fmt, fmtInFraction } from "@/engine/core/fmt";
import { factorText, PHI } from "@/engine/design/steel";
import type { DiaphragmResult } from "@/engine/members/diaphragm";
import type { LedgerResult } from "@/engine/members/ledger";
import type { BasePlateMemberResult, SteelBeamResult, SteelColumnResult } from "@/engine/members/steel";
import type { TransferResult } from "@/engine/members/transfer";
import type { UpliftResult } from "@/engine/members/uplift";
import { B, DataTable, Flag, SectionHead, Sheet, SheetTitle, SubHead, TextRow, TR } from "../report/primitives";
import { DesignBasis, f0, f1, f2, f3, footers, rich, titleFields, type SheetMeta } from "./common";
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

interface SheetProps<R> {
  m: SheetMeta;
  r: R;
  index: number;
  total: number;
  received: string[];
  connections?: string[];
}

export function Frame({
  m,
  r,
  title,
  subtitle,
  children,
}: {
  m: SheetMeta;
  r: { id: string };
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  const ft = footers(m);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id={`sheet-${r.id}`}>
      <SheetTitle title={title} subtitle={subtitle} />
      {children}
    </Sheet>
  );
}

const kft = (v: number) => `${fmt(v, 3)} kip-ft`;
const kip = (v: number) => `${fmt(v, 3)} kip`;
export const verifyText = (r: { assumptions: Array<{ verify?: boolean; item: string }> }) => {
  const v = r.assumptions.filter((a) => a.verify);
  return v.length ? <Flag>{v.map((a) => a.item).join("; ")}</Flag> : "None";
};

export function LoadPath({ received, connections }: { received: string[]; connections?: string[] }) {
  return (
    <>
      <SectionHead title="Load path" />
      <TR desc="Loads received from" expr={<>{received.length ? received.join("; ") : "— (entered loads only)"}</>} />
      {connections?.length ? <TR desc="Connections" expr={<>{connections.join("; ")}</>} /> : null}
    </>
  );
}

function SteelBasis({ m, method, tables }: { m: SheetMeta; method: "LRFD" | "ASD"; tables: string[] }) {
  return (
    <DesignBasis
      m={m}
      material={
        <>
          {m.cycle.aisc360} ({method})
        </>
      }
      tables={tables}
      combos={
        <>
          {m.cycle.asce7} Ch. 2 ({method === "LRFD" ? "strength §2.3" : "ASD §2.4"}); reactions to wood supports by ASD
          §2.4
        </>
      }
    />
  );
}

function ClassRows({
  classes,
}: {
  classes: Array<{
    element: string;
    ratioText: string;
    ratio: number;
    lambdaP?: number;
    lambdaR: number;
    cls: string;
    ref: string;
  }>;
}) {
  return (
    <DataTable
      caption="Local buckling classification — AISC 360 §B4.1"
      head={["Element", "Ratio", "Value", "λ_p", "λ_r", "Class", "Table"].map((h) => rich(h))}
      align={["left", "left", "right", "right", "right", "left", "left"]}
      small
      rows={classes.map((c) => [
        c.element,
        rich(c.ratioText),
        f2(c.ratio),
        c.lambdaP === undefined ? "—" : f2(c.lambdaP),
        f2(c.lambdaR),
        c.cls,
        c.ref,
      ])}
    />
  );
}

function SectionProps({ s, Fy, Fu, grade }: { s: SteelBeamResult["shape"]; Fy: number; Fu: number; grade: string }) {
  return (
    <>
      <SectionHead title="Section and material" />
      <TR
        desc="Section"
        expr={
          <>
            <B>{s.name}</B> — {s.source}
            {s.checked ? "" : <Flag> — VERIFY</Flag>}
          </>
        }
      />
      <TR
        desc="Dimensions"
        expr={
          <>
            d = {f3(s.d)} in; b<sub>f</sub> = {f3(s.bf)} in; t<sub>w</sub> = {f3(s.tw)} in; t<sub>f</sub> = {f3(s.tf)}{" "}
            in
            {s.kdes ? (
              <>
                ; k<sub>des</sub> = {f3(s.kdes)} in
              </>
            ) : null}
            ; weight {f1(s.wt)} plf
          </>
        }
      />
      <TR
        desc="Properties"
        expr={
          <>
            A = {f2(s.A)} in²; I<sub>x</sub> = {f1(s.Ix)} in⁴; S<sub>x</sub> = {f2(s.Sx)} in³; Z<sub>x</sub> ={" "}
            {f2(s.Zx)} in³; r<sub>x</sub> = {f3(s.rx)} in; I<sub>y</sub> = {f2(s.Iy)} in⁴; r<sub>y</sub> = {f3(s.ry)}{" "}
            in; J = {f3(s.J)} in⁴
            {s.Cw ? (
              <>
                ; C<sub>w</sub> = {f1(s.Cw)} in⁶; r<sub>ts</sub> = {f3(s.rts)} in; h<sub>o</sub> = {f2(s.ho)} in
              </>
            ) : null}
          </>
        }
      />
      <TR
        desc="Material"
        expr={
          <>
            {grade}: F<sub>y</sub> = {Fy} ksi; F<sub>u</sub> = {Fu} ksi; E = 29,000 ksi
          </>
        }
      />
    </>
  );
}

/* ================================== SB ================================== */

export function SteelBeamSheet({ m, r, index, total, received, connections }: SheetProps<SteelBeamResult>) {
  const b = r.input;
  const gm = r.rows.reduce((a, x) => (x.ratioM > a.ratioM ? x : a), r.rows[0]);
  const gv = r.rows.reduce((a, x) => (x.ratioV > a.ratioV ? x : a), r.rows[0]);
  const flex = gm.gov.flex;
  const spans = b.spans.map((x) => `${f2(x)} ft`).join(" + ");
  const supportsText = `${b.fixedLeft ? "fixed" : "pinned"} / ${b.fixedRight ? "fixed" : "pinned"}`;
  return (
    <Frame
      m={m}
      r={r}
      title={`Steel beam analysis & design (${m.cycle.aisc360})`}
      subtitle={
        <>
          In accordance with {m.cycle.aisc360} using the {r.method} method — member {index} of {total}: {r.mark}
        </>
      }
    >
      <SteelBasis
        m={m}
        method={r.method}
        tables={[r.shape.family === "HSS" || r.shape.family === "HSSR" ? "aisc-hss" : "aisc-shapes", "aisc-2-4"]}
      />
      <SectionHead title="Member" />
      <TR
        desc="Mark / description"
        expr={<B>{`${r.mark} — ${r.title}${b.description ? `: ${b.description}` : ""}`}</B>}
      />
      <TR
        desc="Geometry"
        expr={
          <>
            Spans {spans}
            {b.leftCantilever ? `; left cantilever ${f2(b.leftCantilever)} ft` : ""}
            {b.rightCantilever ? `; right cantilever ${f2(b.rightCantilever)} ft` : ""}; end supports {supportsText}
          </>
        }
      />
      <TR
        desc="Lateral bracing of the compression flange"
        expr={
          <>{rich(b.Lb > 0 ? `L_b = ${f2(b.Lb)} ft between braces (both flanges)` : "Continuously braced (L_b = 0)")}</>
        }
      />
      <SectionProps s={r.shape} Fy={r.Fy} Fu={r.Fu} grade={r.gradeLabel} />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Unfactored loads" />
      <SectionHead title="Analysis results per combination" />
      <DataTable
        head={[
          "Combination",
          "M+ (kip-ft)",
          "M− (kip-ft)",
          "V (kip)",
          "Segment",
          "L_b (ft)",
          "C_b",
          "M_c (kip-ft)",
          "M D/C",
          "V D/C",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "left", "right", "right", "right", "right", "right"]}
        small
        rows={r.rows.map((x) => [
          x.combo.label,
          f3(x.Mpos),
          f3(x.Mneg),
          f3(x.V),
          `${f2(x.gov.a)}–${f2(x.gov.b)} ft`,
          f2(x.gov.Lb),
          f3(x.gov.Cb),
          f3(x.gov.Mc),
          f3(x.ratioM),
          f3(x.ratioV),
        ])}
      />
      <ClassRows classes={r.flexContinuous.classes} />
      <SectionHead title="Flexure — Chapter F (governing combination)" />
      <TR
        desc="Required flexural strength"
        expr={
          <>
            M<sub>r</sub> = {kft(gm.gov.Mmax)} ({gm.combo.label}), segment {f2(gm.gov.a)}–{f2(gm.gov.b)} ft
          </>
        }
      />
      {gm.gov.Lb > 0 ? (
        <TR
          desc="Lateral-torsional buckling modification factor (F1-1)"
          expr={
            <>
              C<sub>b</sub> = 12.5 M<sub>max</sub> / (2.5 M<sub>max</sub> + 3 M<sub>A</sub> + 4 M<sub>B</sub> + 3 M
              <sub>C</sub>) = {f3(gm.gov.Cb)}
            </>
          }
        />
      ) : null}
      {flex.steps.map((st, i) => (
        <TR
          key={i}
          desc={st.label}
          expr={
            <>
              {st.expr} = {fmt(st.value, 3)} {st.unit}
            </>
          }
        />
      ))}
      <TR
        desc="Available flexural strength"
        expr={
          <>
            M<sub>c</sub> = {r.method === "LRFD" ? "φ_b M_n" : "M_n / Ω_b"} ({factorText(PHI.flexure, r.method)}) ={" "}
            <B>{kft(gm.gov.Mc)}</B> — limit: {flex.limit.toLowerCase()}
          </>
        }
        pass={gm.ratioM <= 1}
      />
      <SectionHead title="Shear — Chapter G" />
      {r.shear.steps.map((st, i) => (
        <TR
          key={i}
          desc={st.label}
          expr={
            <>
              {st.expr}
              {st.unit ? (
                <>
                  {" "}
                  = {fmt(st.value, 3)} {st.unit}
                </>
              ) : null}
            </>
          }
        />
      ))}
      <TR
        desc="Available shear strength"
        expr={
          <>
            V<sub>c</sub> = {factorText(r.shear.factor, r.method)} → {kip(gv.Vc)} ≥ V<sub>r</sub> = {kip(gv.V)} (
            {gv.combo.label})
          </>
        }
        pass={gv.ratioV <= 1}
      />
      {r.bearingChecks.some((x) => x.webYield || x.wood) ? (
        <>
          <SectionHead title="Bearing at supports" />
          {r.bearingChecks.map((bc) => (
            <Fragment key={bc.support}>
              <SubHead
                title={`Support ${String.fromCharCode(65 + bc.support)} — l_b = ${f2(bc.lb)} in., R = ${f3(bc.Ru)} kip (${bc.combo})`}
              />
              {bc.webYield ? (
                <TR
                  desc="Web local yielding — J10.2"
                  expr={
                    <>
                      {bc.webYield.expr}: R<sub>n</sub> = {kip(bc.webYield.Rn)}; available {kip(bc.webYield.Rc)}
                    </>
                  }
                  pass={bc.webYield.ratio <= 1}
                />
              ) : null}
              {bc.webCrip ? (
                <TR
                  desc="Web local crippling — J10.3"
                  expr={
                    <>
                      {bc.webCrip.expr}: R<sub>n</sub> = {kip(bc.webCrip.Rn)}; available {kip(bc.webCrip.Rc)}
                    </>
                  }
                  pass={bc.webCrip.ratio <= 1}
                />
              ) : null}
              {bc.wood ? (
                <TR
                  desc="Bearing on the wood support (ASD)"
                  expr={
                    <>
                      {bc.wood.text}: f = R / (b<sub>f</sub> l<sub>b</sub>) = {f0(bc.wood.R)} / {f2(bc.wood.A)} ={" "}
                      {f1(bc.wood.f)} lb/in² ≤ {f0(bc.wood.Fprime)} lb/in² ({bc.wood.combo})
                    </>
                  }
                  pass={bc.wood.ratio <= 1}
                />
              ) : null}
            </Fragment>
          ))}
        </>
      ) : null}
      <SectionHead
        title={`Deflection — service loads (L/${f0(r.limits.live)} transient, L/${f0(r.limits.total)} total)`}
      />
      <DataTable
        head={["Segment", "Transient (in)", "Source", "Limit (in)", "Total (in)", "Limit (in)"].map((h) => rich(h))}
        align={["left", "right", "left", "right", "right", "right"]}
        small
        rows={r.deflection.map((d) => [
          `${f2(d.segment[0])}–${f2(d.segment[1])} ft${d.cantilever ? " (cantilever, 2L)" : ""}`,
          f3(d.live),
          d.liveSource,
          f3(d.liveLimit),
          f3(d.total),
          f3(d.totalLimit),
        ])}
      />
      <ReactionTable reactions={r.reactions} />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Member", `${r.mark}: ${r.callout}`],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Flexure", `${kft(gm.gov.Mmax)} ≤ ${kft(gm.gov.Mc)} (${gm.combo.label})`],
          ["Shear", `${kip(gv.V)} ≤ ${kip(gv.Vc)}`],
          ["Deflection", govDeflection(r)],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Bearing plates, connections to supports and lateral bracing are to be detailed for the reactions and brace forces shown.",
          "Torsion, web openings and concentrated loads within the span (J10) are not checked unless stated.",
        ]}
      />
    </Frame>
  );
}

/* ================================== SC ================================== */

export function SteelColumnSheet({ m, r, index, total, received, connections }: SheetProps<SteelColumnResult>) {
  const c = r.input;
  const gi = r.rows.reduce((a, x) => (x.inter.ratio > a.inter.ratio ? x : a), r.rows[0]);
  return (
    <Frame
      m={m}
      r={r}
      title={`Steel column design (${m.cycle.aisc360})`}
      subtitle={
        <>
          In accordance with {m.cycle.aisc360} and the {r.method} method — member {index} of {total}: {r.mark}
        </>
      }
    >
      <SteelBasis m={m} method={r.method} tables={["aisc-hss", "aisc-2-4"]} />
      <SectionHead title="Column" />
      <TR
        desc="Mark / description"
        expr={<B>{`${r.mark} — ${r.title}${c.description ? `: ${c.description}` : ""}`}</B>}
      />
      <TR
        desc="Height / effective lengths"
        expr={
          <>
            L = {f2(c.height)} ft; K<sub>x</sub> = {f2(c.Kx)}, K<sub>y</sub> = {f2(c.Ky)}; L<sub>cx</sub> ={" "}
            {f0(r.comp.Lcx)} in; L<sub>cy</sub> = {f0(r.comp.Lcy)} in
          </>
        }
      />
      <TR
        desc="Load eccentricity at the top"
        expr={
          <>
            e<sub>x</sub> = {f2(c.ex)} in (M<sub>y</sub>); e<sub>y</sub> = {f2(c.ey)} in (M<sub>x</sub>)
            {r.wplf ? `; wind on column ${f1(r.wplf)} plf` : ""}
          </>
        }
      />
      <SectionProps s={r.shape} Fy={r.Fy} Fu={r.Fu} grade={r.gradeLabel} />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Unfactored loads" />
      <ClassRows classes={r.comp.classes} />
      <SectionHead title="Compressive strength — Chapter E" />
      {r.comp.steps.map((st, i) => (
        <TR
          key={i}
          desc={st.label}
          expr={
            <>
              {st.expr} = {fmt(st.value, 3)} {st.unit}
            </>
          }
        />
      ))}
      <TR
        desc="Available compressive strength"
        expr={
          <>
            P<sub>c</sub> = {factorText(PHI.compression, r.method)} → <B>{kip(r.Pc)}</B>
          </>
        }
      />
      <SectionHead title="Flexural strength — Chapter F" />
      {r.fx.steps.map((st, i) => (
        <TR
          key={i}
          desc={`Major axis: ${st.label}`}
          expr={
            <>
              {st.expr} = {fmt(st.value, 3)} {st.unit}
            </>
          }
        />
      ))}
      <TR
        desc="Available flexural strength, major / minor"
        expr={
          <>
            M<sub>cx</sub> = {kft(r.Mcx)} ({r.fx.limit.toLowerCase()}); M<sub>cy</sub> = {kft(r.Mcy)} (
            {r.fy.limit.toLowerCase()})
          </>
        }
      />
      <SectionHead title="Combined forces — Chapter H, B1 per Appendix 8" />
      <DataTable
        head={["Combination", "P_r (kip)", "M_x (kip-ft)", "M_y (kip-ft)", "B1x", "B1y", "Eq.", "Ratio", "V (kip)"].map(
          (h) => rich(h),
        )}
        align={["left", "right", "right", "right", "right", "right", "left", "right", "right"]}
        small
        rows={r.rows.map((x) => [
          x.combo.label,
          f3(x.Pr),
          f3(x.Mrx),
          f3(x.Mry),
          f3(x.B1x),
          f3(x.B1y),
          x.inter.eq,
          f3(x.inter.ratio),
          f3(x.V),
        ])}
      />
      <TR
        desc={`Interaction (${gi.inter.eq})`}
        expr={
          <>
            {gi.inter.expr} = <B>{f3(gi.inter.ratio)}</B> ≤ 1.0 ({gi.combo.label})
          </>
        }
        pass={gi.inter.ratio <= 1}
      />
      <TR
        desc="Shear — Chapter G"
        expr={
          <>
            V<sub>c</sub> = {factorText(r.shear.factor, r.method)} × V<sub>n</sub> = {kip(r.Vc)} (V<sub>n</sub> ={" "}
            {kip(r.shear.Vn)})
          </>
        }
      />
      {r.cap ? (
        <>
          <SectionHead title="Wood beam bearing on the cap plate — NDS 3.10.2 (ASD)" />
          <TR
            desc="Bearing stress"
            expr={
              <>
                f<sub>c⊥</sub> = R / (l × b) = {f0(r.cap.R)} / {f2(r.cap.A)} = {f1(r.cap.f)} lb/in² ≤ F<sub>c⊥</sub>' ={" "}
                {f0(r.cap.Fprime)} lb/in² ({r.cap.combo})
              </>
            }
            pass={r.cap.ratio <= 1}
          />
        </>
      ) : null}
      <ReactionTable reactions={r.reactions} />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Member", `${r.mark}: ${r.callout}`],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Axial", `P_r max ${kip(Math.max(...r.rows.map((x) => x.Pr)))} ≤ P_c ${kip(r.Pc)}`],
          ["Base", "Base plate and anchor rods — see BP sheet"],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Cap plate, bolts to the wood beam and the beam-to-cap connection are to be detailed for the reactions shown.",
        ]}
      />
    </Frame>
  );
}

/* ================================== BP ================================== */

export function BasePlateSheet({ m, r, index, total, received }: SheetProps<BasePlateMemberResult>) {
  const i = r.input;
  const gp = r.govPlate.plate;
  const ga = r.govAnchor;
  const n = i.rod.nx * i.rod.ny;
  return (
    <Frame
      m={m}
      r={r}
      title="Column base plate and anchor rod design"
      subtitle={
        <>
          In accordance with AISC Design Guide 1, {m.cycle.aisc360} ({r.input.method}) and {m.cycle.aci318} Ch. 17 —
          member {index} of {total}: {r.mark}
        </>
      }
    >
      <SteelBasis m={m} method={i.method} tables={["aisc-hss", "aisc-2-4"]} />
      <SectionHead title="Plate, column and anchorage" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Column"
        expr={
          <>
            {r.col.name}: d = {f3(r.col.d)} in; b<sub>f</sub> = {f3(r.col.bf)} in; t = {f3(r.col.tf)} in
          </>
        }
      />
      <TR
        desc="Base plate"
        expr={
          <>
            N × B × t<sub>p</sub> = {f2(i.plate.N)} × {f2(i.plate.B)} × {fmtInFraction(i.plate.tp)} in; F<sub>y</sub> ={" "}
            {r.FyPlate} ksi
          </>
        }
      />
      <TR
        desc="Anchor rods"
        expr={
          <>
            ({n}) {fmtInFraction(i.rod.d)} in. {r.rodSteel.label}, {i.rod.nx} × {i.rod.ny} @ s<sub>x</sub> ={" "}
            {f2(i.rod.sx)} in, s<sub>y</sub> = {f2(i.rod.sy)} in; edge distance on the plate e<sub>1</sub> ={" "}
            {f2(i.rod.e1)} in; h<sub>ef</sub> = {f2(i.rod.hef)} in;{" "}
            {i.rod.type === "headed" ? `headed, A_brg = ${f2(i.rod.Abrg)} in²` : `hooked, e_h = ${f2(i.rod.eh)} in`}
            {i.rod.groutPad ? `; built-up grout pad, washer ${fmtInFraction(i.rod.washer)} in.` : ""}
          </>
        }
      />
      <TR
        desc="Foundation"
        expr={
          <>
            f'c = {f0(i.fc)} psi; h<sub>a</sub> = {f1(i.foundation.ha)} in; edges from the plate centre{" "}
            {i.foundation.edges.map((e) => f1(e)).join(" / ")} in; {i.foundation.cracked ? "cracked" : "uncracked"}; A2
            = {f0(r.A2)} in²
          </>
        }
      />
      <TR
        desc="Weld"
        expr={
          <>
            {fmtInFraction(i.weld.w)} in. fillet all round, E{f0(i.weld.FEXX)}XX
          </>
        }
      />
      <SectionHead title="Load path" />
      <TR desc="Forces from" expr={<>{received.length ? received.join("; ") : (i.sourceMark ?? "entered forces")}</>} />
      <LoadLines lines={r.loadLines} title="Unfactored base forces" />
      <DataTable
        caption="Base plate per combination"
        head={[
          "Combination",
          "P (kip)",
          "M (kip-in)",
          "V (kip)",
          "Regime",
          "Y (in)",
          "T (kip)",
          "t_req (in)",
          "Rod ratio",
          "Anchor D/C",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "left", "right", "right", "right", "right", "right"]}
        small
        rows={r.rows.map((x) => [
          x.combo.label,
          f3(x.P),
          f2(x.M),
          f3(x.V),
          x.plate.regime,
          f3(x.plate.Y),
          f3(x.plate.T),
          f3(x.plate.tReq),
          f3(x.plate.rod.ratio),
          f3(x.anchors.ratio),
        ])}
      />
      <SectionHead title={`Plate design — governing ${r.govPlate.combo.label}`} />
      {gp.lines.map((t, k) => (
        <TR key={k} expr={<>{rich(t)}</>} />
      ))}
      <TR
        desc="Eccentricity"
        expr={
          <>
            e = M / P = {f3(gp.e)} in; e<sub>crit</sub> = N/2 − P/(2q<sub>max</sub>) = {f3(gp.ecrit)} in →{" "}
            {gp.regime === "large"
              ? "large moment (DG1 §3.4)"
              : gp.regime === "small"
                ? "small moment (DG1 §3.3)"
                : gp.regime}
          </>
        }
      />
      {gp.regime === "large" ? (
        <TR
          desc="Bearing length / anchor tension"
          expr={
            <>
              Y = (f + N/2) − √((f + N/2)² − 2P(e + f)/q<sub>max</sub>) = {f3(gp.Y)} in; T = q<sub>max</sub> Y − P ={" "}
              {kip(gp.T)}; per rod {kip(gp.Trod)}
            </>
          }
        />
      ) : (
        <TR
          desc="Bearing length / pressure"
          expr={
            <>
              Y = {f3(gp.Y)} in; q = {f3(gp.q)} kip/in
            </>
          }
        />
      )}
      <TR
        desc="Required thickness, bearing interface"
        expr={
          <>
            t<sub>req</sub> = √(4 f<sub>p</sub> Y (l − Y/2) / (φ<sub>b</sub> F<sub>y</sub>)) = {f3(gp.tReqBearing)} in
          </>
        }
      />
      {gp.T > 0 ? (
        <TR
          desc="Required thickness, tension interface"
          expr={
            <>
              x = {f3(gp.x)} in; t<sub>req</sub> = √(4 T x / (φ<sub>b</sub> B F<sub>y</sub>)) = {f3(gp.tReqTension)} in
            </>
          }
        />
      ) : null}
      <TR
        desc="Plate thickness"
        expr={
          <>
            t<sub>req</sub> = {f3(gp.tReq)} in ≤ t<sub>p</sub> = {f3(i.plate.tp)} in
          </>
        }
        pass={gp.tReq <= i.plate.tp + 1e-9}
      />
      <SectionHead title="Anchor rods — combined tension, shear and bending (AISC Ch. J3, Table J3.2)" />
      <TR
        desc="Rod stresses"
        expr={
          <>
            f<sub>v</sub> = V/(n A<sub>b</sub>) = {f2(gp.rod.fv)} ksi;{" "}
            {gp.rod.z ? (
              <>
                bending over z = t<sub>p</sub> + t<sub>w</sub>/2 = {f3(gp.rod.z)} in: f<sub>tb</sub> = M/Z ={" "}
                {f2(gp.rod.ftb)} ksi;{" "}
              </>
            ) : null}
            f<sub>ta</sub> = T<sub>rod</sub>/A<sub>b</sub> = {f2(gp.rod.fta)} ksi; f<sub>t</sub> = {f2(gp.rod.ft)} ksi
          </>
        }
      />
      <TR
        desc="Modified tensile stress (J3-3)"
        expr={
          <>
            F<sub>nt</sub> = 0.75F<sub>u</sub> = {f1(gp.rod.Fnt)} ksi; F<sub>nv</sub> = 0.45F<sub>u</sub> ={" "}
            {f1(gp.rod.Fnv)} ksi; F'<sub>nt</sub> (available) = {f1(gp.rod.FntPrime)} ksi
          </>
        }
        pass={gp.rod.ratio <= 1}
      />
      <TR
        desc="Column weld (elastic line method)"
        expr={
          <>
            f<sub>r</sub> = √(f<sub>n</sub>² + f<sub>v</sub>²) = {f3(gp.weld.fr)} kip/in ≤ {f3(gp.weld.cap)} kip/in
          </>
        }
        pass={gp.weld.ratio <= 1}
      />
      <SectionHead title={`Anchorage to concrete — ${m.cycle.aci318} Ch. 17 (governing ${ga.combo.label})`} />
      {[...ga.anchors.tension, ...ga.anchors.shear].map((md) => (
        <Fragment key={md.key}>
          <SubHead title={`${md.label} (§${md.ref})`} />
          {md.lines.map((t, k) => (
            <TR key={k} expr={<>{rich(t)}</>} />
          ))}
          <TR
            desc="Design strength"
            expr={
              <>
                φ = {f2(md.phi)}
                {md.factor !== 1 ? ` × ${f2(md.factor)} (seismic)` : ""} → {kip(md.design / 1000)} ≥{" "}
                {kip(md.demand / 1000)}
              </>
            }
            pass={md.ratio <= 1}
          />
        </Fragment>
      ))}
      {ga.anchors.notes.map((t, k) => (
        <TextRow key={k} italic>
          {rich(t)}
        </TextRow>
      ))}
      <TR
        desc="Tension–shear interaction (17.8)"
        expr={<>{rich(ga.anchors.interaction.text)}</>}
        pass={ga.anchors.interaction.ratio <= ga.anchors.interaction.limit}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          [
            "Base plate",
            `${f2(i.plate.N)} × ${f2(i.plate.B)} × ${fmtInFraction(i.plate.tp)} in. ${i.plate.grade.replace("-PL", "")}`,
          ],
          [
            "Anchor rods",
            `(${n}) ${fmtInFraction(i.rod.d)} in. ${r.rodSteel.label}, h_ef = ${f2(i.rod.hef)} in., ${i.rod.type}`,
          ],
          ["Weld", `${fmtInFraction(i.weld.w)} in. fillet all round`],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes notes={["Anchor reinforcement, grout and concrete edge reinforcement are not designed here."]} />
    </Frame>
  );
}

/* ================================== RD / FD ================================== */

export function DiaphragmSheet({ m, r, index, total }: SheetProps<DiaphragmResult>) {
  const d = r.input;
  const dem = r.demand;
  return (
    <Frame
      m={m}
      r={r}
      title={`Wood diaphragm design (${m.cycle.sdpws})`}
      subtitle={
        <>
          {r.title}: unit shear, chords and collectors, ASD — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.sdpws} §4.2; ANSI/AWC {m.cycle.nds}; {m.cycle.asce7} §12.10
          </>
        }
        tables={["sdpws-4.2A"]}
      />
      <SectionHead title="Diaphragm" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      <TR
        desc="Sheathing"
        expr={
          <>
            {r.values.text}: v<sub>s</sub> = {f0(r.values.vs)} plf, v<sub>w</sub> = {f0(r.values.vw)} plf (nominal){" "}
            <Flag>— VERIFY Table 4.2A</Flag>
          </>
        }
      />
      <TR
        desc="Allowable (ASD)"
        expr={
          <>
            v<sub>s</sub> / 2.0 = {f1(r.vAllowS)} plf; v<sub>w</sub> / 2.0 = {f1(r.vAllowW)} plf
          </>
        }
      />
      <TR
        desc="Plan"
        expr={
          <>
            Span direction D<sub>span</sub> = {f2(dem.Dspan)} ft; depth parallel to load D = {f2(dem.Dpar)} ft;{" "}
            {dem.storyName}
          </>
        }
      />
      <LoadLines lines={r.loadLines} title="Diaphragm forces (strength level)" />
      <SectionHead title="Segments between wall lines" />
      <DataTable
        head={[
          "Segment",
          "L (ft)",
          "Type",
          "R_E (lb)",
          "v_E (plf)",
          "R_W (lb)",
          "v_W (plf)",
          "T_E (lb)",
          "T_W (lb)",
          "L/D",
        ].map((h) => rich(h))}
        align={["left", "right", "left", "right", "right", "right", "right", "right", "right", "right"]}
        small
        rows={r.segments.map((s) => [
          s.label,
          f2(s.L),
          s.cantilever ? "cantilever" : "simple span",
          f0(s.RE),
          f1(s.vE),
          f0(s.RW),
          f1(s.vW),
          f0(s.TE),
          f0(s.TW),
          f2(s.aspect),
        ])}
      />
      <TR
        desc="Equations"
        expr={<>simple span R = wL/2, M = wL²/8; cantilever R = wL, M = wL²/2; v = R / D; chord T = M / D</>}
      />
      <SectionHead title="Unit shear (ASD)" />
      {(() => {
        const gs = r.segments.reduce((a, s) => (s.vE > a.vE ? s : a), r.segments[0]);
        const gw = r.segments.reduce((a, s) => (s.vW > a.vW ? s : a), r.segments[0]);
        return (
          <>
            <TR
              desc="Seismic"
              expr={
                <>
                  0.7 v<sub>E</sub> = 0.7 × {f1(gs.vE)} = {f1(0.7 * gs.vE)} plf ≤ {f1(r.vAllowS)} plf ({gs.label})
                </>
              }
              pass={0.7 * gs.vE <= r.vAllowS}
            />
            <TR
              desc="Wind"
              expr={
                <>
                  0.6 v<sub>W</sub> = 0.6 × {f1(gw.vW)} = {f1(0.6 * gw.vW)} plf ≤ {f1(r.vAllowW)} plf ({gw.label})
                </>
              }
              pass={0.6 * gw.vW <= r.vAllowW}
            />
          </>
        );
      })()}
      <TR
        desc="Aspect ratio (Table 4.2.4)"
        expr={
          <>
            max L / D = {f2(Math.max(...r.segments.map((s) => s.aspect)))} ≤ {f0(r.maxAspect)} (
            {d.blocked ? "blocked" : "unblocked"})
          </>
        }
        pass={r.segments.every((s) => s.aspect <= r.maxAspect)}
      />
      <SectionHead title="Collectors — ASCE 7 §12.10.2" />
      <DataTable
        head={[
          "Line",
          "R_E (lb)",
          "R_W (lb)",
          "ΣL_w (ft)",
          "v_d (plf)",
          "F_E (lb)",
          "F_W (lb)",
          "Ω0",
          "F ASD (lb)",
          "Basis",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right", "right", "right", "right", "left"]}
        small
        rows={r.collectors.map((c) => [
          c.line,
          f0(c.RE),
          f0(c.RW),
          f2(c.Lw),
          f1(c.vdE),
          f0(c.FE),
          f0(c.FW),
          f1(c.omega),
          f0(c.Fasd),
          c.basis,
        ])}
      />
      <SectionHead title="Chord and collector on the double top plate" />
      <TR
        desc="Design force (ASD)"
        expr={
          <>
            T = max(0.7 T<sub>E</sub>, 0.6 T<sub>W</sub>, collector) = {f0(r.chord.T)} lb ({r.chord.combo})
          </>
        }
      />
      <TR
        desc={`Tension on one ${d.chord.size} ply at the splice — NDS 3.8`}
        expr={
          <>
            f<sub>t</sub> = T / A<sub>n</sub> = {f0(r.chord.T)} / {f2(r.chord.An)} = {f1(r.chord.ft)} lb/in² ≤ F
            <sub>t</sub>' = F<sub>t</sub> × 1.6 × C<sub>F</sub> = {f0(r.chord.Ft)} lb/in²
          </>
        }
        pass={r.chord.ratio <= 1}
      />
      <TR
        desc="Splice"
        expr={
          <>
            {r.chord.spliceText} = {f0(r.chord.spliceCap)} lb ≥ {f0(r.chord.T)} lb
          </>
        }
        pass={r.chord.T <= r.chord.spliceCap}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Diaphragm", r.callout],
          [
            "Boundary / edge nailing",
            `${d.blocked ? `Blocked, ${d.edge.replace("2.5", "2-1/2")} in.` : "Unblocked, 6 in."} edge, 12 in. field`,
          ],
          ["Chord splice", r.chord.spliceText],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes notes={["Diaphragm deflection and openings in the diaphragm are not checked."]} />
    </Frame>
  );
}

/* ================================== ST ================================== */

export function TransferSheet({ m, r, index, total }: SheetProps<TransferResult>) {
  return (
    <Frame
      m={m}
      r={r}
      title="Shear transfer connection"
      subtitle={
        <>
          Lateral load path between diaphragm, walls and foundation (ASD) — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>ANSI/AWC {m.cycle.nds} Ch. 12; manufacturer catalogue</>} tables={["hardware"]} />
      <SectionHead title="Connection" />
      <TR desc="Mark / interface" expr={<B>{`${r.mark} — ${r.input.interface.replace(/-/g, " ")}`}</B>} />
      <TR desc="Source" expr={<>{r.demand.sourceText}</>} />
      <LoadLines lines={r.loadLines} title="Unit shear to transfer (ASD)" />
      <TR desc="Capacity per fastener / spacing" expr={<>{rich(r.capacityText)}</>} />
      <TR
        desc="Required spacing"
        expr={
          <>
            s<sub>req</sub> = 12 × {f0(r.capacity)} / {f1(r.v)} = {f1(r.sReq)} in; provided {f0(r.input.spacing)} in
          </>
        }
        pass={r.input.spacing <= r.sReq + 1e-9}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={["Fastener edge and end distances per NDS 12.5 and the manufacturer's installation instructions."]}
      />
    </Frame>
  );
}

/* ================================== UP ================================== */

export function UpliftSheet({ m, r, index, total }: SheetProps<UpliftResult>) {
  return (
    <Frame
      m={m}
      r={r}
      title="Wind uplift load path"
      subtitle={
        <>
          Roof to foundation, 0.6D + 0.6W ({m.cycle.asce7} §2.4.1 (7)) — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>Manufacturer catalogue / ICC-ES reports</>} tables={["hardware"]} />
      <SectionHead title="Source" />
      <TR desc="Reaction" expr={<B>{r.input.sourceMark}</B>} />
      <LoadLines lines={r.loadLines} title="Loads per foot" />
      <TR
        desc="Net load at each level"
        expr={
          <>
            q<sub>net</sub> = 0.6 (D<sub>src</sub> + ΣD<sub>above</sub>) + 0.6 W; force per connector = −q<sub>net</sub>{" "}
            s / 12
          </>
        }
      />
      <DataTable
        head={[
          "Level",
          "D above (plf)",
          "q_net (plf)",
          "Connector",
          "s (in)",
          "Uplift (lb)",
          "Allowable (lb)",
          "D/C",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "left", "right", "right", "right", "right"]}
        rows={r.rows.map((x) => [
          x.label,
          f1(x.D),
          f1(x.qNet),
          x.model,
          f0(x.spacing),
          f0(x.F),
          f0(x.capacity),
          f3(x.ratio),
        ])}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Each connector installed with all specified fasteners; straps lapped over the floor framing per the manufacturer.",
        ]}
      />
    </Frame>
  );
}

/* ================================== LG ================================== */

export function LedgerSheet({ m, r, index, total, received }: SheetProps<LedgerResult>) {
  const l = r.input;
  const g = r.gov;
  const y = g.yield;
  return (
    <Frame
      m={m}
      r={r}
      title={`Ledger design (${m.cycle.nds})`}
      subtitle={
        <>
          Ledger and fasteners, ASD — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>ANSI/AWC {m.cycle.nds} Ch. 3, Ch. 12</>} tables={["nds-12.3.3"]} />
      <SectionHead title="Ledger" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Section"
        expr={
          <>
            b = {f2(r.section.b)} in; d = {f2(r.section.d)} in; S = {f2(r.section.S)} in³; G = {f2(r.section.G)}
          </>
        }
      />
      <TR desc="Support" expr={<>{r.supportText}</>} />
      <TR
        desc="Fastener"
        expr={
          <>
            {fmtInFraction(l.fastener.D)} in. {l.fastener.type === "bolt" ? "bolt" : "lag screw"} @{" "}
            {f0(l.fastener.spacing)} in. o.c.; F<sub>yb</sub> = {f0(l.fastener.Fyb)} psi
          </>
        }
      />
      <SectionHead title="Load path" />
      <TR desc="Loads received from" expr={<>{received.length ? received.join("; ") : "— (entered loads only)"}</>} />
      <LoadLines lines={r.loadLines} title="Loads on the ledger" />
      <DataTable
        caption="Fastener per ASD combination"
        head={[
          "Combination",
          "C_D",
          "R_v (lb)",
          "R_h (lb)",
          "R (lb)",
          "θ (°)",
          "F_es (psi)",
          "Z (lb)",
          "Mode",
          "Z' (lb)",
          "D/C",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right", "right", "right", "left", "right", "right"]}
        small
        rows={r.rows.map((x) => [
          x.combo,
          f2(x.CD),
          f1(x.Rv),
          f1(x.Rh),
          f1(x.R),
          f1(x.theta),
          f0(x.Fes),
          f1(x.yield.Z),
          x.yield.mode,
          f1(x.Zprime),
          f3(x.ratio),
        ])}
      />
      <SectionHead title={`Yield limit equations — NDS 12.3.1 (governing ${g.combo})`} />
      <TR
        desc="Coefficients"
        expr={
          <>
            R<sub>e</sub> = F<sub>em</sub>/F<sub>es</sub> = {f0(g.Fem)} / {f0(g.Fes)} = {f3(y.Re)}; R<sub>t</sub> ={" "}
            {f3(y.Rt)}; K<sub>θ</sub> = {f3(y.Ktheta)}; k<sub>1</sub> = {f3(y.k1)}; k<sub>2</sub> = {f3(y.k2)}; k
            <sub>3</sub> = {f3(y.k3)}
          </>
        }
      />
      <DataTable
        head={["Mode", "Equation", "Z (lb)"].map((h) => rich(h))}
        align={["left", "left", "right"]}
        small
        rows={[
          ["I_m", "D l_m F_em / (4 K_θ)", f1(y.modes.Im)],
          ["I_s", "D l_s F_es / (4 K_θ)", f1(y.modes.Is)],
          ["II", "k1 D l_s F_es / (3.6 K_θ)", f1(y.modes.II)],
          ["III_m", "k2 D l_m F_em / ((1 + 2R_e) 3.2 K_θ)", f1(y.modes.IIIm)],
          ["III_s", "k3 D l_s F_em / ((2 + R_e) 3.2 K_θ)", f1(y.modes.IIIs)],
          ["IV", "D² / (3.2 K_θ) √(2 F_em F_yb / (3(1 + R_e)))", f1(y.modes.IV)],
        ]}
      />
      <TR
        desc="Adjusted lateral value"
        expr={
          <>
            Z' = Z × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>Δ</sub> = {f1(y.Z)} × {f2(g.CD)} ={" "}
            {f1(g.Zprime)} lb ≥ R = {f1(g.R)} lb
          </>
        }
        pass={g.ratio <= 1}
      />
      <SectionHead title={`Ledger between fasteners (governing ${r.govBeam.combo})`} />
      <TR
        desc="Bending"
        expr={
          <>
            M = 0.125 w s² = {f1(r.govBeam.M)} lb-ft; f<sub>b</sub> = {f2(r.govBeam.fb)} lb/in² ≤ F<sub>b</sub>' ={" "}
            {f0(r.govBeam.Fb)} lb/in²
          </>
        }
        pass={r.govBeam.fb <= r.govBeam.Fb}
      />
      <TR
        desc="Shear"
        expr={
          <>
            V = 0.625 w s = {f1(r.govBeam.V)} lb; f<sub>v</sub> = 1.5V/A = {f2(r.govBeam.fv)} lb/in² ≤ F<sub>v</sub>' ={" "}
            {f0(r.govBeam.Fv)} lb/in²
          </>
        }
        pass={r.govBeam.fv <= r.govBeam.Fv}
      />
      <TR
        desc="Loaded-edge distance"
        expr={
          <>
            d/2 = {f2(r.edge.provided)} in ≥ 4D = {f2(r.edge.required)} in
          </>
        }
        pass={r.edge.provided >= r.edge.required}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Ledger", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={["Hangers to the ledger and ledger flashing by the details; fasteners into grouted cells only for CMU."]}
      />
    </Frame>
  );
}
