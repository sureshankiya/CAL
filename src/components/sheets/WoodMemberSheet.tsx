/**
 * Member sheet for NDS wood bending members: floor joists, rafters, ceiling
 * joists / rafter ties, beams, headers and ridge beams. Sequence follows the
 * plan: design basis, geometry, material and adjustment factors, assumptions,
 * loading and combinations, load path, analysis, strength, stability,
 * serviceability, summary, result, final summary, assumptions, notes.
 */

import type React from "react";
import { fmt, fmtInFraction } from "@/engine/core/fmt";
import type { WoodBeamResult } from "@/engine/design/wood";
import type { BeamResult, CeilingJoistResult, JoistResult, RafterResult } from "@/engine/members";
import {
  B,
  DataTable,
  Divider,
  Flag,
  SectionHead,
  Sheet,
  SheetTitle,
  SubHead,
  TextRow,
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

export type WoodMemberResult = JoistResult | RafterResult | CeilingJoistResult | BeamResult;

const psi = (v: number, d = 1) => `${fmt(v, d)} lb/in²`;

function sheetTitle(r: WoodMemberResult, nds: string) {
  const what =
    r.kind === "joist"
      ? "Joist"
      : r.kind === "rafter"
        ? "Rafter"
        : r.kind === "ceilingJoist"
          ? r.title === "Ceiling joist"
            ? "Ceiling joist"
            : "Ceiling joist / rafter tie"
          : r.title;
  return `Structural ${what} design calculations (${nds})`;
}

function supportNames(r: WoodMemberResult, n: number): string[] {
  if (r.kind === "rafter") return ["Plate", "Ridge"];
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

function GeometryRows({ r }: { r: WoodMemberResult }) {
  const d = r.design;
  const g = d.analysis.geometry;
  const names = supportNames(r, d.analysis.supports.length);
  const spacing = r.kind === "joist" || r.kind === "rafter" || r.kind === "ceilingJoist" ? r.input.spacing : undefined;
  return (
    <>
      <SectionHead title="Configuration & geometry" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {r.input.description ? <TR desc="Description" expr={<>{r.input.description}</>} /> : null}
      {spacing !== undefined ? (
        <TR desc="On-center spacing" expr={<>s{eq(`${fmt(spacing, spacing % 1 ? 1 : 0)} in`)}</>} />
      ) : null}
      {r.kind === "rafter" ? (
        <>
          <TR desc="Roof pitch" expr={<>rise / run{eq(`${fmt(r.input.rise, 2)} in 12`)}</>} />
          <TR desc="Roof slope angle" expr={<>θ = tan⁻¹(rise / 12){eq(`${f2(r.geom.thetaDeg)}°`)}</>} />
          <TR
            desc="Horizontal run, plate to ridge"
            expr={
              <>
                L<sub>h</sub>
                {eq(`${f2(r.input.run)} ft`)}
              </>
            }
          />
          <TR
            desc="Sloped span"
            expr={
              <>
                L<sub>s</sub> = L<sub>h</sub> / cos θ{eq(`${f3(r.geom.slopedSpan)} ft`)}
              </>
            }
          />
          {r.input.overhang > 0 ? (
            <TR
              desc="Eave overhang (horizontal / sloped)"
              expr={
                <>
                  L<sub>o</sub>
                  {eq(`${f2(r.input.overhang)} ft / ${f3(r.geom.slopedOverhang)} ft`)}
                </>
              }
            />
          ) : null}
          <TR
            desc="Ridge condition"
            expr={
              <B>
                {r.input.ridge === "beam"
                  ? "Structural ridge beam — rafter supported vertically at the ridge"
                  : "Ridge board — rafters tied at the plate (thrust resisted by ties)"}
              </B>
            }
          />
          <TR
            desc="Seat on plate (horizontal)"
            expr={
              <>
                l<sub>seat</sub>
                {eq(`${f2(r.input.plateSeat)} in`)}
              </>
            }
          />
          {r.input.seatCut > 0 ? (
            <TR
              desc="Birdsmouth seat cut (perpendicular to rafter)"
              expr={
                <>
                  d − d<sub>n</sub>
                  {eq(`${f2(r.input.seatCut)} in`)} ; d<sub>n</sub>
                  {eq(`${f2(d.mat.d - r.input.seatCut)} in`)}
                </>
              }
            />
          ) : null}
          <TR
            desc="Analysis model"
            expr={
              <>
                Simply supported along the slope{r.input.overhang > 0 ? " with eave cantilever" : ""}; loads resolved
                perpendicular to the rafter
              </>
            }
          />
        </>
      ) : (
        <>
          {g.leftCantilever > 0 ? (
            <TR
              desc="Left cantilever"
              expr={
                <>
                  L<sub>c,L</sub>
                  {eq(`${f2(g.leftCantilever)} ft`)}
                </>
              }
            />
          ) : null}
          {g.spans.map((s, i) => (
            <TR
              key={i}
              desc={`Span ${i + 1}${g.spans.length > 1 ? "" : ""}`}
              expr={
                <>
                  L<sub>s{i + 1}</sub>
                  {eq(`${f3(s)} ft`)}
                </>
              }
            />
          ))}
          {g.rightCantilever > 0 ? (
            <TR
              desc="Right cantilever"
              expr={
                <>
                  L<sub>c,R</sub>
                  {eq(`${f2(g.rightCantilever)} ft`)}
                </>
              }
            />
          ) : null}
          <TR
            desc="Total length"
            expr={
              <>
                L<sub>tot</sub>
                {eq(`${f3(d.analysis.totalLength)} ft`)}
              </>
            }
          />
          <TR
            desc="Supports"
            expr={
              <>
                {g.spans.length === 1 ? "Simple span" : `${g.spans.length}-span continuous`}
                {g.leftCantilever > 0 || g.rightCantilever > 0 ? " with cantilever" : ""}
              </>
            }
          />
        </>
      )}
      {r.kind !== "rafter"
        ? d.analysis.supports.map((xs, i) => (
            <TR
              key={`b${i}`}
              desc={`Bearing length at support ${names[i]} (x = ${f2(xs)} ft)`}
              expr={
                <>
                  l<sub>b</sub>
                  {eq(
                    `${f2(d.input.bearingLengths[i] ?? d.input.bearingLengths[d.input.bearingLengths.length - 1])} in`,
                  )}
                </>
              }
            />
          ))
        : null}
      <TR
        desc="Service condition"
        expr={
          <B>
            {d.input.conditions.wetService ? "Wet" : "Dry"}
            {d.input.conditions.incised ? ", incised" : ""}
          </B>
        }
      />
    </>
  );
}

function MaterialRows({ d }: { d: WoodBeamResult }) {
  const m = d.mat;
  return (
    <>
      <SectionHead title="Material and section properties" />
      <TR desc="Member" expr={<B>{m.label}</B>} />
      <TR desc="Species / grade / product" expr={<>{m.speciesLabel}</>} />
      <TR
        desc="Reference values"
        expr={
          <>
            {m.tableLabel}
            {m.tableId.startsWith("nds2024") || m.tableId === "scl-generic" ? <Flag> — VERIFY</Flag> : null}
          </>
        }
      />
      <TR desc="Size classification" expr={<>{m.sizeClass}</>} />
      <TR
        desc="Bending parallel to grain"
        expr={
          <>
            F<sub>b</sub>
            {eq(psi(m.Fb, 0))}
            {m.kind === "glulam" ? (
              <>
                ; F<sub>b,x−</sub>
                {eq(psi(m.FbNeg, 0))}
              </>
            ) : null}
          </>
        }
      />
      <TR
        desc="Tension parallel to grain"
        expr={
          <>
            F<sub>t</sub>
            {eq(psi(m.Ft, 0))}
          </>
        }
      />
      <TR
        desc="Shear parallel to grain"
        expr={
          <>
            F<sub>v</sub>
            {eq(psi(m.Fv, 0))}
          </>
        }
      />
      <TR
        desc="Compression perpendicular to grain"
        expr={
          <>
            F<sub>c⊥</sub>
            {eq(psi(m.Fcperp, 0))}
          </>
        }
      />
      <TR
        desc="Compression parallel to grain"
        expr={
          <>
            F<sub>c</sub>
            {eq(psi(m.Fc, 0))}
          </>
        }
      />
      <TR desc="Modulus of elasticity" expr={<>E{eq(psi(m.E, 0))}</>} />
      <TR
        desc={m.kind === "glulam" ? "Modulus of elasticity, stability (E_y,min)" : "Modulus of elasticity, stability"}
        expr={
          <>
            E<sub>min</sub>
            {eq(psi(m.EminStab, 0))}
          </>
        }
      />
      <TR
        desc="Breadth / depth of section"
        expr={
          <>
            b × d{eq(`${fmtInFraction(m.b)} in × ${fmtInFraction(m.d)} in`)}
            {m.plies > 1 ? ` (${m.plies} plies × ${fmtInFraction(m.bPly)} in)` : ""}
          </>
        }
      />
      <TR desc="Cross-sectional area" expr={<>A = b × d{eq(`${f3(m.A)} in²`)}</>} />
      <TR
        desc="Section modulus"
        expr={
          <>
            S<sub>x</sub> = b × d² / 6{eq(`${f3(m.S)} in³`)}
          </>
        }
      />
      <TR
        desc="Second moment of area"
        expr={
          <>
            I<sub>x</sub> = b × d³ / 12{eq(`${f3(m.I)} in⁴`)}
          </>
        }
      />
      <TR
        desc="Member self weight"
        expr={
          <>
            w<sub>sw</sub> = ρ × A{eq(`${f2(m.selfWeight)} lb/ft`)}{" "}
            {d.input.includeSelfWeight ? "(included)" : "(in the assembly framing allowance)"}
          </>
        }
      />
    </>
  );
}

function FactorTable({ r }: { r: WoodMemberResult }) {
  const d = r.design;
  const f = d.factors;
  const gov = d.combos.find((c) => c.combo.label === d.bending.combo) ?? d.combos[0];
  const CbMax = d.bearing.length ? Math.max(...d.bearing.map((b) => b.Cb)) : 1;
  const cp = r.kind === "rafter" && r.thrust ? r.thrust.governing.CP : undefined;
  const n = (v: number | undefined, dd = 2) => (v === undefined ? "—" : fmt(v, dd));
  const rows: React.ReactNode[][] = [
    ["C_D  load duration (Table 2.3.2)", n(gov.CD), n(gov.CD), n(gov.CD), n(gov.CD), "—", "—", "—"],
    ["C_M  wet service", n(f.CM.Fb), n(f.CM.Ft), n(f.CM.Fv), n(f.CM.Fc), n(f.CM.Fcperp), n(f.CM.E), n(f.CM.E)],
    ["C_t  temperature (Table 2.3.3)", "1.00", "1.00", "1.00", "1.00", "1.00", "1.00", "1.00"],
    ["C_L  beam stability (3.3.3)", n(gov.CLpos, 3), "—", "—", "—", "—", "—", "—"],
    ["C_F  size / depth", d.mat.kind === "glulam" ? "—" : n(f.CF, 3), n(d.mat.CFt), "—", n(d.mat.CFc), "—", "—", "—"],
    ["C_fu flat use", n(f.Cfu), "—", "—", "—", "—", "—", "—"],
    ["C_i  incising", n(f.Ci), n(f.Ci), n(f.Ci), n(f.Ci), "1.00", n(f.CiE), n(f.CiE)],
    ["C_r  repetitive member (4.3.9)", n(f.Cr), "—", "—", "—", "—", "—", "—"],
    ["C_V  volume (glulam, 5.3.6)", n(f.CV, 3), "—", "—", "—", "—", "—", "—"],
    ["C_P  column stability (3.7.1)", "—", "—", "—", n(cp, 3), "—", "—", "—"],
    ["C_b  bearing area (3.10.4)", "—", "—", "—", "—", n(CbMax, 3), "—", "—"],
  ];
  return (
    <>
      <SectionHead
        title={`Adjustment factors — ${r.design.input.nds} Table 4.3.1 / 5.3.1 (governing bending combination ${gov.combo.label})`}
      />
      <DataTable
        head={["Factor", "Fb", "Ft", "Fv", "Fc", "Fc⊥", "E", "Emin"]}
        rows={rows}
        small
        align={["left", "right", "right", "right", "right", "right", "right", "right"]}
      />
      {d.input.crOverride !== undefined ? (
        <TextRow>
          <Flag>C_r set manually to {fmt(d.input.crOverride, 2)} — verify NDS 4.3.9 applicability.</Flag>
        </TextRow>
      ) : null}
      {d.input.cdOverride !== undefined ? (
        <TextRow>
          <Flag>C_D set manually to {fmt(d.input.cdOverride, 2)} for all combinations — verify the load duration.</Flag>
        </TextRow>
      ) : null}
    </>
  );
}

function ComboTable({ d }: { d: WoodBeamResult }) {
  return (
    <DataTable
      caption="ASD load combinations (ASCE 7 §2.4) — results per combination"
      head={["Combination", "C_D", "M+ (lb-ft)", "M− (lb-ft)", "V (lb)", "R max (lb)", "fb / Fb'", "fv / Fv'"]}
      align={["left", "right", "right", "right", "right", "right", "right", "right"]}
      small
      rows={d.combos.map((c) => [
        `${c.combo.label}  ${c.combo.ref}`,
        f2(c.CD),
        f0(c.Mpos),
        c.Mneg < -0.5 ? f0(c.Mneg) : "—",
        f0(c.V),
        f0(c.Rmax),
        f3(Math.max(c.fbRatio, c.Mneg < -0.5 ? c.fbRatioNeg : 0)),
        f3(c.fvRatio),
      ])}
    />
  );
}

function BendingRows({ d, neg }: { d: WoodBeamResult; neg?: boolean }) {
  const check = neg ? d.bendingNeg! : d.bending;
  const row = d.combos.find((c) => c.combo.label === check.combo) ?? d.combos[0];
  const f = d.factors;
  const m = d.mat;
  const Fb = neg ? m.FbNeg : m.Fb;
  const FbStar = Fb * row.CD * f.CM.Fb * f.Ct * m.CF * f.Ci * f.Cr;
  const CL = neg ? row.CLneg : row.CLpos;
  const M = neg ? Math.abs(row.Mneg) : row.Mpos;
  const glulam = m.kind === "glulam";
  return (
    <>
      <SubHead
        title={`${neg ? "Negative" : "Positive"} moment — governing combination ${row.combo.label} (C_D = ${f2(row.CD)})`}
      />
      {d.simpleUDL && !neg && d.wTotalUDL !== undefined ? (
        <TR
          desc="Maximum moment"
          expr={
            <>
              M<sub>max</sub> = w × L² / 8 (governing combination){eq(`${f1(M)} lb-ft`)}
            </>
          }
        />
      ) : (
        <TR
          desc={neg ? "Maximum negative moment (support)" : "Maximum positive moment"}
          expr={
            <>
              M{eq(`${f1(M)} lb-ft`)} (from analysis{d.diagrams.patterned ? ", pattern live load" : ""})
            </>
          }
        />
      )}
      <TR
        desc="Bending design value excluding C_L"
        expr={
          <>
            F<sub>b</sub>* = F<sub>b</sub> × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>F</sub> × C
            <sub>i</sub> × C<sub>r</sub> = {f0(Fb)} × {f2(row.CD)} × {f2(f.CM.Fb)} × {f2(f.Ct)} × {f3(m.CF)} ×{" "}
            {f2(f.Ci)} × {f2(f.Cr)}
            {eq(psi(FbStar))}
          </>
        }
      />
      <TR
        desc="Adjusted bending design value"
        expr={
          <>
            F<sub>b</sub>' = F<sub>b</sub>* ×{" "}
            {glulam ? (
              <>
                min(C<sub>L</sub>, C<sub>V</sub>)
              </>
            ) : (
              <>
                C<sub>L</sub>
              </>
            )}{" "}
            × C<sub>fu</sub> = {f1(FbStar)} × {f3(glulam ? Math.min(CL, f.CV ?? 1) : CL)} × {f2(f.Cfu)}
            {eq(psi(neg ? row.FbPrimeNeg : row.FbPrime))}
          </>
        }
      />
      <TR
        desc="Actual bending stress"
        expr={
          <>
            f<sub>b</sub> = M / S<sub>x</sub> = {f1(M)} × 12 / {f3(m.S)}
            {eq(psi(check.demand))}
          </>
        }
      />
      <TR
        desc="Utilisation"
        expr={
          <>
            f<sub>b</sub> / F<sub>b</sub>'{eq(f3(check.ratio))}
          </>
        }
        pass={check.pass}
      />
      <VerdictLine
        pass={check.pass}
        message={
          check.pass
            ? "Design bending stress exceeds actual bending stress"
            : "Actual bending stress exceeds design bending stress"
        }
      />
    </>
  );
}

function ShearRows({ d }: { d: WoodBeamResult }) {
  const s = d.shear;
  const row = d.combos.find((c) => c.combo.label === s.combo) ?? d.combos[0];
  return (
    <>
      <SectionHead title="Shear parallel to grain — NDS 3.4" />
      <TR
        desc="Design shear (governing combination)"
        expr={
          <>
            V = <B>{`${f1(row.V)} lb`}</B> at x = {f2(s.x)} ft ({s.combo})
          </>
        }
      />
      <TR desc="Method" expr={<>{s.method}</>} />
      <TR
        desc="Actual shear stress"
        expr={
          <>
            f<sub>v</sub> = 1.5 × V / A = 1.5 × {f1(row.V)} / {f3(d.mat.A)}
            {eq(psi(s.demand))}
          </>
        }
      />
      <TR
        desc="Adjusted shear design value"
        expr={
          <>
            F<sub>v</sub>' = F<sub>v</sub> × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>i</sub> ={" "}
            {f0(d.mat.Fv)} × {f2(row.CD)} × {f2(d.factors.CM.Fv)} × 1.00 × {f2(d.factors.Ci)}
            {eq(psi(s.capacity))}
          </>
        }
      />
      <TR
        desc="Utilisation"
        expr={
          <>
            f<sub>v</sub> / F<sub>v</sub>'{eq(f3(s.ratio))}
          </>
        }
        pass={s.pass}
      />
      <VerdictLine
        pass={s.pass}
        message={
          s.pass ? "Design shear stress exceeds actual shear stress" : "Actual shear stress exceeds design shear stress"
        }
      />
      {d.notch ? (
        <>
          <SubHead title="Tension-face notch at bearing — NDS 3.4.3.2(a)" />
          <TR
            desc="Remaining depth at notch"
            expr={
              <>
                d<sub>n</sub>
                {eq(`${f3(d.notch.dn)} in`)} ; d<sub>n</sub> / d{eq(f3(d.notch.dn / d.mat.d))}
              </>
            }
          />
          <TR
            desc="Adjusted shear capacity at notch"
            expr={
              <>
                V<sub>r</sub>' = (2/3) × F<sub>v</sub>'
                {d.factors.Cvr ? (
                  <>
                    {" "}
                    × C<sub>vr</sub>
                  </>
                ) : null}{" "}
                × b × d<sub>n</sub> × (d<sub>n</sub> / d)²{eq(`${f1(d.notch.capacity)} lb`)}
              </>
            }
          />
          <TR
            desc="Shear at notched support (full reaction side)"
            expr={
              <>
                V{eq(`${f1(d.notch.demand)} lb`)} ({d.notch.combo})
              </>
            }
          />
          <TR
            desc="Utilisation"
            expr={
              <>
                V / V<sub>r</sub>'{eq(f3(d.notch.ratio))}
              </>
            }
            pass={d.notch.pass}
          />
          <VerdictLine
            pass={d.notch.pass}
            message={
              d.notch.pass
                ? "Notched shear capacity exceeds applied shear"
                : "Applied shear exceeds notched shear capacity"
            }
          />
        </>
      ) : null}
    </>
  );
}

function BearingRows({ d, names }: { d: WoodBeamResult; names: string[] }) {
  return (
    <>
      <SectionHead title="Bearing perpendicular to grain — NDS 3.10.2" />
      {d.bearing.map((b) => (
        <BearingOne key={b.support} b={b} name={names[b.support]} d={d} />
      ))}
    </>
  );
}

function BearingOne({ b, name, d }: { b: WoodBeamResult["bearing"][number]; name: string; d: WoodBeamResult }) {
  return (
    <>
      <SubHead title={`Support ${name} — R = ${f0(b.R)} lb (${b.combo})`} />
      <TR
        desc="Bearing area factor"
        expr={
          <>
            C<sub>b</sub> ={" "}
            {b.Cb > 1 ? (
              <>
                (l<sub>b</sub> + 0.375) / l<sub>b</sub>
              </>
            ) : (
              "1.00 (end bearing or l_b ≥ 6 in.)"
            )}
            {eq(f3(b.Cb))}
          </>
        }
      />
      <TR
        desc="Adjusted compression perpendicular to grain"
        expr={
          <>
            F<sub>c⊥</sub>' = F<sub>c⊥</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>i</sub> × C<sub>b</sub>
            {eq(psi(b.FcperpPrime))}
          </>
        }
      />
      <TR
        desc="Applied compression perpendicular to grain"
        expr={
          <>
            f<sub>c⊥</sub> = R / (b × l<sub>b</sub>) = {f0(b.R)} / ({f3(d.mat.b)} × {f2(b.lb)}){eq(psi(b.fcperp))}
          </>
        }
      />
      <TR
        desc="Required bearing length"
        expr={
          <>
            l<sub>b,req</sub> = R / (b × F<sub>c⊥</sub>' / C<sub>b</sub>){eq(`${f3(b.lbReq)} in`)}
          </>
        }
      />
      <TR
        desc="Utilisation"
        expr={
          <>
            f<sub>c⊥</sub> / F<sub>c⊥</sub>'{eq(f3(b.ratio))}
          </>
        }
        pass={b.pass}
      />
    </>
  );
}

function StabilityRows({ r }: { r: WoodMemberResult }) {
  const d = r.design;
  const f = d.factors;
  const gov = d.combos.find((c) => c.combo.label === d.bending.combo) ?? d.combos[0];
  const edges: Array<{ name: string; lu: number; le: number; RB: number; FbE: number; CL: number }> = [];
  if (f.luTop > 0)
    edges.push({
      name: "Top (compression for positive moment)",
      lu: f.luTop,
      le: f.leTop,
      RB: f.RBTop,
      FbE: f.FbE_top,
      CL: gov.CLpos,
    });
  if (f.luBottom > 0) {
    const gn = d.bendingNeg ? (d.combos.find((c) => c.combo.label === d.bendingNeg!.combo) ?? gov) : gov;
    edges.push({
      name: "Bottom (compression for negative moment)",
      lu: f.luBottom,
      le: f.leBottom,
      RB: f.RBBottom,
      FbE: f.FbE_bottom,
      CL: gn.CLneg,
    });
  }
  return (
    <>
      <SectionHead title="Lateral stability — NDS 3.3.3" />
      {f.stability === "rule-4.4.1" ? (
        <TR
          desc="Beam stability factor"
          expr={
            <>
              C<sub>L</sub> = <B>1.00</B> by NDS 4.4.1.2 — {f.rule441Text}
            </>
          }
        />
      ) : edges.length === 0 ? (
        <TR
          desc="Beam stability factor"
          expr={
            <>
              Compression edges continuously braced (l<sub>u</sub> = 0): C<sub>L</sub>
              {eq("1.00")}
            </>
          }
        />
      ) : (
        edges.map((e, i) => <StabilityEdge key={i} e={e} d={d} />)
      )}
      {r.kind === "rafter" && r.thrust ? <RafterThrustRows r={r} /> : null}
      {r.kind === "ceilingJoist" && r.tension ? <TieRows r={r} /> : null}
    </>
  );
}

function StabilityEdge({
  e,
  d,
}: {
  e: { name: string; lu: number; le: number; RB: number; FbE: number; CL: number };
  d: WoodBeamResult;
}) {
  const ratio = e.lu / d.mat.d;
  const formula = ratio < 7 ? "2.06 l_u" : ratio <= 14.3 ? "1.63 l_u + 3d" : "1.84 l_u";
  return (
    <>
      <SubHead title={`${e.name}`} />
      <TR
        desc="Unbraced length"
        expr={
          <>
            l<sub>u</sub>
            {eq(`${f2(e.lu)} in`)} ; l<sub>u</sub> / d{eq(f2(ratio))}
          </>
        }
      />
      <TR
        desc="Effective length — Table 3.3.3 (loading not specified)"
        expr={
          <>
            l<sub>e</sub> = {formula}
            {eq(`${f2(e.le)} in`)}
          </>
        }
      />
      <TR
        desc="Slenderness ratio"
        expr={
          <>
            R<sub>B</sub> = √(l<sub>e</sub> × d / b²){eq(f2(e.RB))} ≤ 50
          </>
        }
        pass={e.RB <= 50}
      />
      <TR
        desc="Critical buckling design value"
        expr={
          <>
            F<sub>bE</sub> = 1.20 × E<sub>min</sub>' / R<sub>B</sub>² = 1.20 × {f0(d.factors.EminPrime)} / {f2(e.RB)}²
            {eq(psi(e.FbE))}
          </>
        }
      />
      <TR
        desc="Beam stability factor — Eq. 3.3-6"
        expr={
          <>
            C<sub>L</sub> = (1 + F<sub>bE</sub>/F<sub>b</sub>*) / 1.9 − √[((1 + F<sub>bE</sub>/F<sub>b</sub>*) / 1.9)² −
            (F<sub>bE</sub>/F<sub>b</sub>*) / 0.95]{eq(f3(e.CL))}
          </>
        }
      />
    </>
  );
}

function RafterThrustRows({ r }: { r: RafterResult }) {
  const t = r.thrust!;
  const g = t.governing;
  const m = r.design.mat;
  return (
    <>
      <SectionHead title="Ridge-board rafter: thrust and combined axial and bending — NDS 3.6, 3.7, 3.9.2" />
      <TR
        desc="Horizontal thrust per rafter"
        expr={
          <>
            H = w<sub>v</sub> × L<sub>h</sub> / (2 tan θ){eq(`${f0(g.H)} lb`)} ({g.combo})
          </>
        }
      />
      <TR
        desc="Axial compression at the plate"
        expr={
          <>
            N = H cos θ + w<sub>v</sub> L<sub>h</sub> sin θ{eq(`${f0(g.N)} lb`)}
          </>
        }
      />
      <TR desc="Tie force per tie" expr={<>T = H × (tie spacing / rafter spacing){eq(`${f0(g.T)} lb`)}</>} />
      <TR
        desc="Effective column length (strong axis; weak axis braced by sheathing)"
        expr={
          <>
            l<sub>e</sub> = L<sub>s</sub>
            {eq(`${f1(t.le)} in`)} ; l<sub>e</sub> / d{eq(f2(t.leOverD))} ≤ 50
          </>
        }
        pass={t.leOverD <= 50}
      />
      <TR
        desc="Critical buckling design value"
        expr={
          <>
            F<sub>cE</sub> = 0.822 × E<sub>min</sub>' / (l<sub>e</sub>/d)²{eq(psi(g.FcE))}
          </>
        }
      />
      <TR
        desc="Column stability factor — Eq. 3.7-1 (c = 0.8)"
        expr={
          <>
            C<sub>P</sub>
            {eq(f3(g.CP))} ; F<sub>c</sub>' = F<sub>c</sub>* × C<sub>P</sub>
            {eq(psi(g.FcPrime))}
          </>
        }
      />
      <TR
        desc="Actual compression stress"
        expr={
          <>
            f<sub>c</sub> = N / A = {f0(g.N)} / {f3(m.A)}
            {eq(psi(g.fc))}
          </>
        }
      />
      <TR
        desc="Combined stresses — Eq. 3.9-3"
        expr={
          <>
            (f<sub>c</sub>/F<sub>c</sub>')² + f<sub>b</sub> / [F<sub>b</sub>' (1 − f<sub>c</sub>/F<sub>cE</sub>)] = (
            {f1(g.fc)}/{f1(g.FcPrime)})² + {f1(g.fb)} / [{f1(g.FbPrime)} × (1 − {f1(g.fc)}/{f1(g.FcE)})]
            {eq(f3(g.interaction))}
          </>
        }
        pass={g.interaction <= 1}
      />
      <VerdictLine
        pass={g.interaction <= 1}
        message={
          g.interaction <= 1
            ? "Combined axial and bending interaction within limit"
            : "Combined axial and bending interaction exceeds 1.0"
        }
      />
    </>
  );
}

function TieRows({ r }: { r: CeilingJoistResult }) {
  const t = r.tension!;
  const g = t.governing;
  const m = r.design.mat;
  const nail = t.nail;
  return (
    <>
      <SectionHead
        title={`Rafter tie — tension and combined stresses (NDS 3.8, 3.9.1); thrust from ${r.input.tension?.source ?? "rafters"}`}
      />
      <DataTable
        head={[
          "Combination",
          "C_D",
          "T (lb)",
          "ft (psi)",
          "Ft' (psi)",
          "fb (psi)",
          "Fb* (psi)",
          "Eq. 3.9-1",
          "Eq. 3.9-2",
        ]}
        align={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
        small
        rows={t.rows.map((x) => [
          x.combo,
          f2(x.CD),
          f0(x.T),
          f1(x.ft),
          f1(x.FtPrime),
          f1(x.fb),
          f1(x.FbStar),
          f3(x.eq1),
          f3(x.eq2),
        ])}
      />
      <TR
        desc="Adjusted tension design value"
        expr={
          <>
            F<sub>t</sub>' = F<sub>t</sub> × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>F</sub> × C
            <sub>i</sub> = {f0(m.Ft)} × {f2(g.CD)} × 1.00 × 1.00 × {f2(m.CFt)} × 1.00{eq(psi(g.FtPrime))}
          </>
        }
      />
      <TR
        desc="Governing interaction"
        expr={
          <>
            f<sub>t</sub>/F<sub>t</sub>' + f<sub>b</sub>/F<sub>b</sub>* = {f1(g.ft)}/{f1(g.FtPrime)} + {f1(g.fb)}/
            {f1(g.FbStar)}
            {eq(f3(Math.max(g.eq1, g.eq2)))} ({g.combo})
          </>
        }
        pass={Math.max(g.eq1, g.eq2) <= 1}
      />
      {nail ? (
        <>
          <SubHead title={`Heel joint — ${nail.label}, single shear, rafter face-nailed to joist (NDS 12.3)`} />
          <TR
            desc="Dowel bearing strength (D < 1/4 in.)"
            expr={
              <>
                F<sub>e</sub> = 16,600 G<sup>1.84</sup>
                {eq(psi(nail.Fem, 0))}
              </>
            }
          />
          <TR
            desc="Nail bending yield strength / reduction term"
            expr={
              <>
                F<sub>yb</sub>
                {eq(psi(nail.Fyb, 0))} ; R<sub>d</sub> = K<sub>D</sub>
                {eq(f2(nail.Rd))}
              </>
            }
          />
          <TR
            desc="Bearing lengths"
            expr={
              <>
                l<sub>s</sub>
                {eq(`${f2(nail.ls)} in`)} ; p{eq(`${f2(nail.p)} in`)} ; l<sub>m</sub>
                {eq(`${f2(nail.lm)} in`)}
              </>
            }
          />
          <TR
            desc="Yield modes (lb)"
            expr={
              <>
                I<sub>m</sub> {f0(nail.modes.Im)} · I<sub>s</sub> {f0(nail.modes.Is)} · II {f0(nail.modes.II)} · III
                <sub>m</sub> {f0(nail.modes.IIIm)} · III<sub>s</sub> {f0(nail.modes.IIIs)} · IV {f0(nail.modes.IV)}
              </>
            }
          />
          <TR
            desc="Reference lateral design value"
            expr={
              <>
                Z = <B>{`${f1(nail.Z)} lb`}</B> (Mode {nail.mode})
              </>
            }
          />
          <TR
            desc="Nails required (governing combination)"
            expr={
              <>
                n = T / (Z × C<sub>D</sub>){eq(f2(nail.required))} ; provided {nail.provided}
              </>
            }
            pass={nail.required <= nail.provided}
          />
          <VerdictLine
            pass={nail.required <= nail.provided}
            message={
              nail.required <= nail.provided
                ? "Heel joint nailing adequate for the tie force"
                : "Provide additional heel joint nails"
            }
          />
        </>
      ) : null}
    </>
  );
}

function DeflectionRows({ r }: { r: WoodMemberResult }) {
  const d = r.design;
  const g = d.analysis.geometry;
  return (
    <>
      <SectionHead title="Deflection — NDS 3.5; limits IBC / CBC Table 1604.3" />
      <TR
        desc="Modulus of elasticity for deflection"
        expr={
          <>
            E' = E × C<sub>M</sub> × C<sub>t</sub> × C<sub>i</sub>
            {eq(psi(d.factors.Eprime, 0))}
          </>
        }
      />
      <TR
        desc="Long-term deflection factor"
        expr={
          <>
            K<sub>cr</sub>
            {eq(f2(d.input.Kcr))} {d.input.Kcr === 1 ? "(immediate D + L per IBC Table 1604.3)" : "(NDS 3.5.2 creep)"}
          </>
        }
      />
      <TR
        desc="Limits (live / total)"
        expr={
          <>
            L / {fmt(d.input.defl.live, 0)} ; L / {fmt(d.input.defl.total, 0)}
            {d.deflection.some((x) => x.kind === "cantilever") ? " (cantilevers: L = 2 × overhang)" : ""}
          </>
        }
      />
      {d.deflection.map((x) => {
        const nm =
          x.kind === "cantilever"
            ? x.segment === 0
              ? "Left cantilever"
              : "Right cantilever"
            : `Span ${x.segment + 1 - (g.leftCantilever > 0 ? 1 : 0)}`;
        return <DeflOne key={x.segment} x={x} nm={nm} simple={d.simpleUDL} />;
      })}
    </>
  );
}

function DeflOne({ x, nm, simple }: { x: WoodBeamResult["deflection"][number]; nm: string; simple: boolean }) {
  return (
    <>
      <SubHead
        title={`${nm} — L = ${f3(x.length)} ft${x.kind === "cantilever" ? `, limit length ${f3(x.limitLength)} ft` : ""}`}
      />
      <TR
        desc={`Live load deflection (${x.liveSource})`}
        expr={
          <>
            δ<sub>L</sub>
            {simple ? (
              <>
                {" "}
                = 5 w<sub>L</sub> L⁴ / (384 E' I)
              </>
            ) : null}
            {eq(`${f3(x.live)} in`)} ≤ δ<sub>lim</sub> = {f3(x.liveLimit)} in
          </>
        }
        pass={x.livePass}
      />
      <TR
        desc="Dead load deflection"
        expr={
          <>
            δ<sub>D</sub>
            {eq(`${f3(x.dead)} in`)}
          </>
        }
      />
      <TR
        desc={`Total deflection (${x.totalSource})`}
        expr={
          <>
            δ<sub>T</sub> = K<sub>cr</sub> δ<sub>D</sub> + δ<sub>L</sub>
            {eq(`${f3(x.total)} in`)} ≤ δ<sub>lim</sub> = {f3(x.totalLimit)} in
          </>
        }
        pass={x.totalPass}
      />
      <TR
        desc="Utilisation (live / total)"
        expr={
          <>
            {f3(x.liveRatio)} / {f3(x.totalRatio)}
          </>
        }
      />
    </>
  );
}

function RafterBearing({ r }: { r: RafterResult }) {
  const checks = r.checks.filter((c) => c.name.startsWith("Bearing at") || c.name.startsWith("Bending on net section"));
  return (
    <>
      <SectionHead title="Rafter bearing and birdsmouth — NDS 3.10.2, 3.1.2" />
      <TR
        desc="Vertical reaction at plate (governing)"
        expr={
          <>
            R<sub>v</sub>
            {eq(`${f0(r.reactions[0].maxDown)} lb`)} ({r.reactions[0].maxDownCombo})
          </>
        }
      />
      {checks.map((c) => (
        <TR
          key={c.name}
          desc={c.name}
          expr={
            <>
              {f1(c.demand)} lb/in² ≤ {f1(c.capacity)} lb/in² — D/C {f3(c.ratio)} ({c.combo})
            </>
          }
          pass={c.pass}
        />
      ))}
      <TextRow italic>
        Bearing stress on the horizontal seat checked against F_c⊥' (conservative for load at an angle to grain, NDS
        3.10.3).
      </TextRow>
    </>
  );
}

export function WoodMemberSheet({
  m,
  r,
  index,
  total,
  received,
  connections,
}: {
  m: SheetMeta;
  r: WoodMemberResult;
  index: number;
  total: number;
  received: string[];
  connections?: string[];
}) {
  const d = r.design;
  const names = supportNames(r, d.analysis.supports.length);
  const ft = footers(m);
  const geomD: DiagramGeometry = { total: d.analysis.totalLength, supports: d.analysis.supports, names };
  const reactionsText = r.reactions.map((x) => `R = ${f0(x.maxDown)} lb`);
  const materialStd =
    d.mat.kind === "sawn"
      ? `ANSI/AWC ${d.input.nds} and Supplement`
      : d.mat.kind === "glulam"
        ? `ANSI/AWC ${d.input.nds}; ANSI A190.1`
        : `ANSI/AWC ${d.input.nds}; manufacturer ESR`;
  const loadsForDiagram = d.analysis.byType ? Object.values(d.analysis.byType).flatMap((c) => c.loads) : [];
  const verifyItems = r.assumptions.filter((a) => a.verify);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id={`sheet-${r.id}`}>
      <SheetTitle
        title={sheetTitle(r, d.input.nds)}
        subtitle={
          <>
            In accordance with ANSI/AWC {d.input.nds} using the ASD method — member {index} of {total}: {r.mark}
          </>
        }
      />
      <DesignBasis m={m} material={<>{materialStd}</>} tables={[d.mat.tableId, "ibc-1604.3"]} />
      <GeometryRows r={r} />
      <MaterialRows d={d} />
      <FactorTable r={r} />
      <LoadLines lines={r.loadLines} />
      <LoadingDiagram
        g={geomD}
        loads={loadsForDiagram}
        reactions={reactionsText}
        note={r.kind === "rafter" ? "Loads shown perpendicular to the rafter along the sloped length." : undefined}
      />
      <ComboTable d={d} />
      <SectionHead title="Load path" />
      <TR desc="Loads received from" expr={<>{received.length ? received.join("; ") : "— (area loads only)"}</>} />
      <ReactionTable
        reactions={r.reactions}
        perFoot={r.kind === "joist" || r.kind === "rafter" || r.kind === "ceilingJoist"}
      />
      <SectionHead title="Analysis" />
      <TR
        desc="Analysis"
        expr={
          <>
            Stiffness method, Euler–Bernoulli beam;{" "}
            {d.diagrams.patterned ? "floor / roof live load pattern-loaded per ASCE 7 §4.3.3" : "single span"}
          </>
        }
      />
      <ResultDiagrams
        g={geomD}
        x={d.diagrams.x}
        Mmax={d.diagrams.Mmax}
        Mmin={d.diagrams.Mmin}
        shearX={d.diagrams.shearX}
        Vmax={d.diagrams.Vmax}
        Vmin={d.diagrams.Vmin}
        defl={d.diagrams.defl}
        comboLabel={d.diagrams.comboLabel}
        deflLabel={d.diagrams.deflLabel}
        patterned={d.diagrams.patterned}
      />
      <SectionHead title="Strength in bending — NDS 3.3" />
      <BendingRows d={d} />
      {d.bendingNeg ? <BendingRows d={d} neg /> : null}
      <ShearRows d={d} />
      {r.kind === "rafter" ? <RafterBearing r={r} /> : <BearingRows d={d} names={names} />}
      <StabilityRows r={r} />
      <DeflectionRows r={r} />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Selected member", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          ["Material", d.mat.speciesLabel],
          ["Governing load combination", r.governing.combo],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"}`],
          ["Deflection", govDeflection(r)],
          ["Reactions (max down)", r.reactions.map((x) => `${x.name} ${f0(x.maxDown)} lb`).join("; ")],
          [
            "Connections",
            [
              ...(r.kind === "ceilingJoist" && r.tension?.nail
                ? [`Heel joint: ${r.tension.nail.provided} × ${r.tension.nail.label} (≥ ${f2(r.tension.nail.required)} required)`]
                : []),
              ...(connections ?? []),
            ].join("; ") || "Bearing per framing schedule; toe-nailing per CBC Table 2304.10.2",
          ],
          [
            "Field verification",
            verifyItems.length ? <Flag key="f">{verifyItems.map((a) => a.item).join("; ")}</Flag> : "None",
          ],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "ASD per NDS; ASCE 7 §2.4 combinations with C_D from NDS Table 2.3.2 for each combination.",
          "Floor and roof live loads pattern-loaded on continuous and cantilevered members (ASCE 7 §4.3.3).",
          "Shear checked at a distance d from the support face (NDS 3.4.3.1) except where a point load lies within d.",
          "Wind and seismic effects on this member are included only where entered as loads on this sheet.",
        ]}
      />
    </Sheet>
  );
}
