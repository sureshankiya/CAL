/**
 * Phase 4 member sheets — concrete and CMU walls / stem walls — in the Tedds-style
 * layout of the other sheets.
 */

import { WallSupportElevation } from "../report/geometryDiagrams";
import { DowelRebar, FootingRebar, WallRebar } from "../report/rebarDiagrams";
import { INK, LW } from "../report/drafting";
import { DC } from "../report/diagramColors";
import type React from "react";
import { fmt } from "@/engine/core/fmt";
import { BARS } from "@/engine/design/concrete";
import type { HoldownFootingResult } from "@/engine/members/holdownFooting";
import type { MasonryWallResult } from "@/engine/members/masonryWall";
import type { TieInResult } from "@/engine/members/tieIn";
import type { WoodTrussResult } from "@/engine/members/woodTruss";
import { STEEL_TRUSS_GROUPS, STEEL_TRUSS_PATTERNS, type SteelTrussResult } from "@/engine/members/steelTruss";
import type { TrussGeometry } from "@/engine/analysis/trussGeometry";
import { factorText, PHI } from "@/engine/design/steel";
import { B, DataTable, SectionHead, SubHead, TextRow, TR } from "../report/primitives";
import { DesignBasis, f0, f1, f2, f3, rich } from "./common";
import {
  AssumptionRows,
  ChecksSummary,
  FinalSummary,
  LimitationNotes,
  LoadLines,
  MemberResult,
  ReactionTable,
} from "./blocks";
import { ClassRows, Frame, LoadPath, SteelBasis, verifyText } from "./Phase3Sheets";
import type { SheetMeta } from "./common";

interface SheetProps<R> {
  m: SheetMeta;
  r: R;
  index: number;
  total: number;
  received: string[];
  connections?: string[];
}

const SUPPORT_TEXT: Record<string, string> = {
  "pinned-fixed": "pinned at the top and fixed at the bottom",
  "pinned-pinned": "pinned at the top and at the bottom",
  "fixed-fixed": "fixed at the top and at the bottom",
  cantilever: "fixed at the bottom and free at the top (cantilever)",
};

const txt: React.CSSProperties = { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 8, fill: "black" };
const line = { stroke: "black", fill: "none", strokeWidth: 1 } as const;

/** Axial, shear and moment along the wall height for the governing combination. */
export function WallDiagrams({ d, unitM }: { d: MasonryWallResult["diagram"]; unitM: string }) {
  const Wd = 470;
  const Hd = 150;
  const top = 16;
  const panels: Array<{ title: string; v: number[]; unit: string; c: string }> = [
    { title: "Axial force", v: d.P, unit: "lb/ft", c: DC.axial },
    { title: "Shear force", v: d.V, unit: "lb/ft", c: DC.shear },
    { title: "Moment", v: d.M, unit: unitM, c: DC.moment },
  ];
  const pw = Wd / 3;
  const H = d.x[d.x.length - 1] || 1;
  const y = (x: number) => top + Hd - (x / H) * Hd;
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <svg width="100%" viewBox={`0 0 ${Wd} ${Hd + top + 14}`} role="img" aria-label="Wall force diagrams">
          {panels.map((p, k) => {
            const x0 = k * pw + pw / 2;
            const max = Math.max(1e-9, ...p.v.map((v) => Math.abs(v)));
            const sc = (pw / 2 - 42) / max;
            const pts = d.x.map((x, i) => `${x0 + p.v[i] * sc},${y(x)}`).join(" ");
            const iPos = p.v.reduce((a, v, i) => (v > p.v[a] ? i : a), 0);
            const iNeg = p.v.reduce((a, v, i) => (v < p.v[a] ? i : a), 0);
            const iTop = p.v.length - 1;
            const marks = [...new Set([iPos, iNeg, iTop])].filter((i) => Math.abs(p.v[i]) > max * 0.02);
            const yLab = (i: number) => (i === 0 ? y(0) - 4 : i === iTop ? y(H) + 9 : y(d.x[i]) + 3);
            return (
              <g key={k}>
                <text x={k * pw + 6} y={10} style={{ ...txt, fontWeight: 700, fontSize: 8.5 }}>
                  {p.title} ({p.unit})
                </text>
                <polygon
                  points={`${x0},${y(0)} ${pts} ${x0},${y(H)}`}
                  fill={p.c}
                  fillOpacity={0.16}
                  stroke={p.c}
                  strokeWidth={1.1}
                />
                <line x1={x0} y1={y(0)} x2={x0} y2={y(H)} stroke={INK} strokeWidth={LW.object} />
                {marks.map((i) => (
                  <text
                    key={i}
                    x={x0 + p.v[i] * sc + (p.v[i] >= 0 ? 3 : -3)}
                    y={yLab(i)}
                    style={{ ...txt, fill: p.c, fontWeight: 700 }}
                    textAnchor={p.v[i] >= 0 ? "start" : "end"}
                  >
                    {fmt(p.v[i], 1)}
                  </text>
                ))}
              </g>
            );
          })}
          <line x1={0} y1={y(0)} x2={Wd} y2={y(0)} {...line} strokeWidth={0.5} />
          <text x={2} y={y(0) + 10} style={txt}>
            base
          </text>
        </svg>
      </td>
    </tr>
  );
}

export function MasonryWallSheet({ m, r, index, total, received, connections }: SheetProps<MasonryWallResult>) {
  const w = r.input;
  const cmu = w.material === "cmu";
  const vb = BARS[w.vertical.size];
  const hb = BARS[w.horizontal.size];
  const g = r.flex;
  const sh = r.shear;
  const ax = r.axial;
  const asd = cmu;
  const L = asd ? "" : "u";
  // TMS 402-22 (2025 cycle): 0.30 f'm A_n (8.3.4.2.1) and 0.20 P / A_n (8.3.5.1.3); TMS 402-16: 0.25 / 0.25
  const tmsK = m.cycle.id === "2025" ? "0.30" : "0.25";
  const tmsP = m.cycle.id === "2025" ? "0.20" : "0.25";
  return (
    <Frame
      m={m}
      r={r}
      title={cmu ? `Masonry wall panel design (${m.cycle.tms402})` : `Concrete wall design (${m.cycle.aci318})`}
      subtitle={
        <>
          {cmu ? "Reinforced single-wythe wall, allowable stress design" : "Reinforced concrete wall, strength design"}{" "}
          — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={cmu ? <>{m.cycle.tms402} Ch. 8 (ASD), Ch. 7 (seismic)</> : <>{m.cycle.aci318} Ch. 11, 22</>}
        tables={cmu ? ["tms602-2", "tms402-8.3"] : []}
        combos={
          <>
            {m.cycle.asce7} Ch. 2 ({cmu ? "ASD §2.4" : "strength §2.3"}), §12.11.1
          </>
        }
      />
      <SectionHead title="Wall panel details" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Panel"
        expr={
          <>
            Reinforced single-wythe wall, {SUPPORT_TEXT[w.support]} for out-of-plane loads; length L = {f2(w.L)} ft;
            height h = {f2(w.h)} ft
            {w.parapet && w.support !== "cantilever" ? `; parapet h_p = ${f2(w.parapet)} ft` : ""}; thickness t ={" "}
            {f3(w.t)} in
          </>
        }
      />
      <TR
        desc="Seismic"
        expr={
          <>
            SDC {w.seismic.SDC}; I<sub>e</sub> = {f2(w.seismic.Ie)}; S<sub>DS</sub> = {f3(w.seismic.SDS)}; ρ = 1.0 on
            the out-of-plane load
          </>
        }
      />
      <WallSupportElevation h={w.h} parapet={w.parapet} t={w.t} support={w.support} material={w.material} />
      <SectionHead title={cmu ? "Masonry details" : "Concrete details"} />
      {cmu ? (
        <>
          <TR
            desc="Construction"
            expr={
              <>
                Hollow concrete units, fully grouted, running bond, Type {w.cmu!.mortar} PCL mortar
                {w.cmu!.fcu ? `; unit strength f'cu = ${f0(w.cmu!.fcu)} psi` : ""}; γ<sub>block</sub> ={" "}
                {f0(w.cmu!.block.gammaBlock)} pcf; γ<sub>grout</sub> = {f0(w.cmu!.block.gammaGrout)} pcf
              </>
            }
          />
          <TR
            desc="Units"
            expr={
              <>
                h<sub>b</sub> = {f2(w.cmu!.block.hb)} in; l<sub>b</sub> = {f2(w.cmu!.block.lb)} in; t<sub>bf</sub> ={" "}
                {f2(w.cmu!.block.tf)} in; t<sub>bw</sub> = {f2(w.cmu!.block.tw)} in; t<sub>be</sub> ={" "}
                {f2(w.cmu!.block.te)} in; N<sub>web</sub> = {w.cmu!.block.nWeb}; N<sub>end</sub> = {w.cmu!.block.nEnd}
              </>
            }
          />
          {r.self.text.map((t, i) => (
            <TR key={i} desc={i === 0 ? "Self weight" : undefined} expr={rich(t)} />
          ))}
          <TR
            desc="Masonry"
            expr={
              <>
                f'<sub>m</sub> = {f0(w.cmu!.fm)} psi ({w.cmu!.fmSource}); E<sub>m</sub> = 900 f'<sub>m</sub> ={" "}
                {f0(r.mat.E)} psi; E<sub>v</sub> = 0.4 E<sub>m</sub> = {f0(r.mat.G!)} psi
              </>
            }
          />
        </>
      ) : (
        <>
          <TR
            desc="Concrete"
            expr={
              <>
                f'<sub>c</sub> = {f0(w.concrete!.fc)} psi; E<sub>c</sub> = 57,000 √f'<sub>c</sub> = {f0(r.mat.E)} psi; γ
                <sub>c</sub> = {f0(w.concrete!.gamma)} pcf; cover {f2(w.concrete!.cover)} in
              </>
            }
          />
          {r.self.text.map((t, i) => (
            <TR key={i} desc="Self weight" expr={rich(t)} />
          ))}
        </>
      )}
      <SectionHead title="Reinforcement" />
      <TR
        desc="Vertical"
        expr={
          <>
            {w.vertical.size} @ {f0(w.vertical.spacing)} in.{" "}
            {w.vertical.layout === "each-face"
              ? "each face"
              : w.vertical.layout === "center"
                ? "centred"
                : `at d = ${f2(r.section.dPos)} in.`}
            ; A<sub>s</sub> = {f3(vb.A)} × 12 / {f0(w.vertical.spacing)} = {f3(r.bars.As)} in²/ft
            {w.vertical.layout === "each-face" ? " per face" : ""}; f<sub>y</sub> = {f0(w.fy)} psi
            {cmu ? (
              <>
                ; F<sub>s</sub> = {f0(r.mat.Fs!)} psi (§8.3.3.1)
              </>
            ) : null}
          </>
        }
      />
      <TR
        desc="Horizontal"
        expr={
          <>
            {w.horizontal.count > 1 ? `(${w.horizontal.count}) ` : ""}
            {w.horizontal.size} @ {f0(w.horizontal.spacing)} in.; A<sub>v</sub> = {w.horizontal.count} × {f3(hb.A)} × 12
            / {f0(w.horizontal.spacing)} = {f3(r.bars.Ah)} in²/ft
          </>
        }
      />
      <WallRebar
        material={w.material}
        t={w.t}
        cover={cmu ? 0 : (w.concrete?.cover ?? 0)}
        vertical={w.vertical}
        horizontal={w.horizontal}
      />
      <SectionHead title="Section properties (per ft of wall)" />
      <TR
        desc="Out of plane"
        expr={
          <>
            A = 12 t = {f1(r.section.A)} in²/ft; I = 12 t³/12 = {f1(r.section.I)} in⁴/ft; S = {f1(r.section.S)} in³/ft;
            r = √(I/A) = {f3(r.section.r)} in; K = {r.K}
          </>
        }
      />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Loads on the wall" />
      <SectionHead title="Lateral out-of-plane loads" />
      <TR
        desc="Wind"
        expr={
          <>
            W = {f1(r.lateral.W)} psf on the panel
            {w.parapet && w.support !== "cantilever" ? `; W_p = ${f1(r.lateral.Wp)} psf on the parapet` : ""}
          </>
        }
      />
      {w.seismic.include ? (
        <TR
          desc="Seismic (ASCE 7 §12.11.1)"
          expr={
            <>
              F<sub>p</sub> = 0.4 S<sub>DS</sub> I<sub>e</sub> = {f3(0.4 * w.seismic.SDS * w.seismic.Ie)} (≥ 0.1); E
              <sub>wall</sub> = {f3(r.lateral.Fp)} × {f2(r.self.w)} = {f1(r.lateral.Ewall)} psf; E<sub>add</sub> ={" "}
              {f1(w.seismic.Eadd)} psf; E = {f1(r.lateral.E)} psf
            </>
          }
        />
      ) : null}
      {r.lateral.H ? (
        <TR
          desc="Earth pressure (H)"
          expr={
            <>
              {f1(r.lateral.H.base)} psf at the base, {f1(r.lateral.H.top)} psf at the top of the retained soil
            </>
          }
        />
      ) : null}
      <DataTable
        caption={`Load combinations (${cmu ? "ASD" : "strength"}) — maximum utilization`}
        head={["Combination", "Utilization"]}
        align={["left", "right"]}
        small
        rows={r.combos.map((c) => [c.combo.label, f3(c.ratio)])}
      />
      <SectionHead
        title={`Consider wall at x = ${f2(g.x)} ft above the base under ${g.combo.label}${g.sign < 0 ? " (lateral load reversed)" : ""}`}
      />
      <WallDiagrams d={r.diagram} unitM="lb-in/ft" />
      <SubHead title="Axial" />
      {cmu ? (
        <>
          <TR
            desc="Axial load at the base"
            expr={
              <>
                P = {f1(ax.P)} lb/ft ({ax.combo.label}); f<sub>a</sub> = P/A = {f2(ax.fa!)} psi
              </>
            }
          />
          <TR
            desc="Slenderness"
            expr={
              <>
                K h / r = {f3(ax.sr)} {ax.sr <= 99 ? "≤ 99" : "> 99"}
              </>
            }
          />
          <TR
            desc="Allowable axial force"
            expr={
              <>
                P<sub>a</sub> = {tmsK} f'<sub>m</sub> A<sub>n</sub> [1 − (K h / 140 r)²] = {tmsK} × {f0(w.cmu!.fm)} ×{" "}
                {f1(r.section.A)} × {f3(ax.red)} = {f0(ax.cap)} lb/ft; P / P<sub>a</sub> = {f3(ax.ratio)}
              </>
            }
            pass={ax.ratio <= 1}
          />
        </>
      ) : (
        <TR
          desc="Axial load at the base"
          expr={
            <>
              P<sub>u</sub> = {f1(ax.P)} lb/ft ({ax.combo.label}) ≤ φP<sub>n,max</sub> = 0.65 × 0.80 [0.85 f'c (A
              <sub>g</sub> − A<sub>st</sub>) + f<sub>y</sub> A<sub>st</sub>] = {f0(ax.cap)} lb/ft
            </>
          }
          pass={ax.ratio <= 1}
        />
      )}
      <SubHead title="Axial load and flexure" />
      <TR
        desc="At the section"
        expr={
          <>
            P{L} = {f1(g.P)} lb/ft; M{L} = {f1(Math.abs(g.M))} lb-in/ft; depth to reinforcement d ={" "}
            {f3(g.M >= 0 ? r.section.dPos : r.section.dNeg)} in
          </>
        }
      />
      {cmu && r.balance ? (
        <>
          <TR
            desc="Allowable stresses"
            expr={
              <>
                n = E<sub>s</sub> / E<sub>m</sub> = {f3(r.mat.n!)}; F<sub>b</sub> = {f3(w.cmu!.FbFactor)} f'<sub>m</sub>{" "}
                = {f0(r.mat.Fb!)} psi; F<sub>s</sub> = {f0(r.mat.Fs!)} psi
              </>
            }
          />
          <TR
            desc="Balance point"
            expr={
              <>
                k<sub>bal</sub> = n / (F<sub>s</sub>/F<sub>b</sub> + n) = {f3(r.balance.k)}; T<sub>bal</sub> = A
                <sub>s</sub>F<sub>s</sub> = {f0(r.balance.T)} lb/ft; C<sub>bal</sub> = k<sub>bal</sub> d F<sub>b</sub> b
                / 2 = {f0(r.balance.C)} lb/ft; P<sub>bal</sub> = {f0(r.balance.P)} lb/ft; M<sub>bal</sub> ={" "}
                {f0(r.balance.M)} lb-in/ft
              </>
            }
          />
          <TR
            desc="Moment capacity at P"
            expr={(() => {
              const c = g.cap as { c: number; governs: string; fsMax: number; fm: number };
              return (
                <>
                  cracked section,{" "}
                  {c.governs === "masonry"
                    ? "masonry at F_b governs"
                    : c.governs === "steel"
                      ? "steel at F_s governs"
                      : c.governs}
                  {Number.isFinite(c.c) ? `; kd = ${f3(c.c)} in; f_m = ${f1(c.fm)} psi; f_s = ${f0(c.fsMax)} psi` : ""};
                  M<sub>c</sub> = {f0(g.Mc)} lb-in/ft; M / M<sub>c</sub> = {f3(g.ratio)}
                </>
              );
            })()}
            pass={g.ratio <= 1}
          />
        </>
      ) : (
        (() => {
          const c = g.cap as {
            c: number;
            phi: number;
            phiMn: number;
            epsT: number;
            a: number;
            delta: number;
            Mu0: number;
          };
          return (
            <>
              {r.slender.klr > r.slender.limit ? (
                <TR
                  desc="Slenderness"
                  expr={
                    <>
                      k l<sub>c</sub> / r = {f1(r.slender.klr)} &gt; 22: δ ={" "}
                      {Number.isFinite(c.delta) ? f3(c.delta) : "∞"}; M<sub>u</sub> = δ × {f1(c.Mu0)} lb-in/ft
                    </>
                  }
                />
              ) : (
                <TR
                  desc="Slenderness"
                  expr={
                    <>
                      k l<sub>c</sub> / r = {f1(r.slender.klr)} ≤ 22 — neglected (ACI 318 6.2.5)
                    </>
                  }
                />
              )}
              <TR
                desc="Design strength at P_u"
                expr={
                  <>
                    c = {f3(c.c)} in; a = β<sub>1</sub>c = {f3(c.a)} in; ε<sub>t</sub> = {fmt(c.epsT, 5)}; φ ={" "}
                    {f3(c.phi)}; φM
                    <sub>n</sub> = {f0(c.phiMn)} lb-in/ft; M<sub>u</sub> / φM<sub>n</sub> = {f3(g.ratio)}
                  </>
                }
                pass={g.ratio <= 1}
              />
            </>
          );
        })()
      )}
      <SubHead title={`Out-of-plane shear at x = ${f2(sh.x)} ft (${sh.combo.label})`} />
      {cmu ? (
        <>
          <TR
            desc="Shear stress"
            expr={
              <>
                V = {f1(sh.V)} lb/ft; A<sub>nv</sub> = b d = {f1(r.section.Anv)} in²/ft; f<sub>v</sub> = V / A
                <sub>nv</sub> = {f2(sh.fv!)} psi
              </>
            }
          />
          <TR
            desc="Allowable shear stress"
            expr={
              <>
                F<sub>vm</sub> = ½ [4.0 − 1.75 min(M/(Vd), 1.0)] √f'<sub>m</sub> + {tmsP} P / A<sub>n</sub> ={" "}
                {f1(sh.Fvm!)} psi (M/(Vd) = {f3(sh.MVd!)}); F<sub>v</sub> = min(F<sub>vm</sub>, {f1(sh.FvMax!)}) ={" "}
                {f1(sh.cap / r.section.Anv)} psi; f<sub>v</sub> / F<sub>v</sub> = {f3(sh.ratio)}
              </>
            }
            pass={sh.ratio <= 1}
          />
        </>
      ) : (
        <TR
          desc="One-way shear"
          expr={
            <>
              V<sub>u</sub> = {f1(sh.V)} lb/ft ≤ φV<sub>c</sub> = {f0(sh.cap)} lb/ft (Table 22.5.5.1, λ<sub>s</sub>); V
              <sub>u</sub> / φV<sub>c</sub> = {f3(sh.ratio)}
            </>
          }
          pass={sh.ratio <= 1}
        />
      )}
      {r.inPlaneRes ? (
        <>
          <SubHead title={`In-plane (${r.inPlaneRes.combo})`} />
          <TR
            desc="Forces"
            expr={
              <>
                V = {f0(r.inPlaneRes.V)} lb; M = V h = {f0(r.inPlaneRes.M / 12)} lb-ft; P = {f0(r.inPlaneRes.P)} lb;
                M/(Vd) = {f3(r.inPlaneRes.MVd)}
              </>
            }
          />
          <TR
            desc="Shear"
            expr={
              <>
                {rich(r.inPlaneRes.shearText)}; capacity {f0(r.inPlaneRes.shearCap)} lb
              </>
            }
            pass={r.inPlaneRes.ratioV <= 1}
          />
          <TR
            desc="Flexure"
            expr={
              <>
                M = {f0(r.inPlaneRes.M / 12)} lb-ft ≤ {f0(r.inPlaneRes.Mcap / 12)} lb-ft (all vertical bars, cracked
                section)
              </>
            }
            pass={r.inPlaneRes.ratioM <= 1}
          />
        </>
      ) : (
        <TextRow italic>No in-plane load entered — wall not part of the seismic-force-resisting system.</TextRow>
      )}
      <ChecksSummary checks={r.checks} />
      <ReactionTable reactions={r.reactions} title="Reactions delivered at the base (per ft of wall — values in plf)" />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Wall", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          cmu
            ? "Grout all cells; bars centred in cells with lap splices per TMS 402 §6.1.7; bond beams at the top and at floor lines."
            : "Lap splices and development per ACI 318 25.4 / 25.5; dowels to the footing to match the vertical bars.",
          "Anchor bolts and sill plates on the wall are checked on the shear wall / anchorage sheets.",
        ]}
      />
    </Frame>
  );
}

export function HoldownFootingSheet({ m, r, index, total, received, connections }: SheetProps<HoldownFootingResult>) {
  const f = r.input;
  const u = r.uplift;
  return (
    <Frame
      m={m}
      r={r}
      title={`Shear-wall / hold-down footing (${m.cycle.aci318}, IBC 1806)`}
      subtitle={
        <>
          Rigid-body overturning, eccentric bearing, sliding and hold-down uplift — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.aci318} Ch. 13, 14, 22; {m.cycle.building} §1806
          </>
        }
        tables={["ibc-1806.2"]}
        combos={<>{m.cycle.asce7} §2.4 (ASD) for soil and stability; §2.3 (strength) for the concrete</>}
      />
      <SectionHead title="Footing" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Geometry"
        expr={
          <>
            L<sub>f</sub> = {f2(f.Lf)} ft; B = {f2(f.B)} ft; h = {f1(f.h)} in; bottom {f1(f.depth)} in below grade
            {f.stem ? `; stem ${f1(f.stem.width)} in × ${f1(f.stem.height)} in` : ""}
          </>
        }
      />
      <TR
        desc="Shear wall"
        expr={
          <>
            {r.wallMark}: b = {f2(f.wall.input.b)} ft, h = {f2(f.wall.input.h)} ft; lever arm to the footing base h
            <sub>OT</sub> = {f3(r.arm)} ft
          </>
        }
      />
      <LoadPath received={[...received, `${r.wallMark} in-plane forces and gravity`]} connections={connections} />
      <FootingRebar
        title="Reinforcement — section across the footing"
        kind="holdown"
        width={f.B * 12}
        h={f.h}
        cover={f.cover}
        depth={f.depth}
        stem={f.stem}
        longitudinal={f.longitudinal}
      />
      <LoadLines lines={r.loadLines} title="Loads on the footing (whole footing)" />
      <SectionHead title="Soil" />
      <TR
        desc="Allowable bearing"
        expr={
          <>
            q<sub>a</sub> = {f0(f.qa)} psf ({f.qaSource})
          </>
        }
      />
      <TR
        desc="Sliding resistance"
        expr={
          <>
            {f.friction !== undefined ? <>μ = {f2(f.friction)}</> : <>cohesion {f0(f.cohesion ?? 0)} psf</>}; lateral
            bearing {f0(f.lateralBearing)} psf/ft; passive on one end face = ½ × {f0(f.lateralBearing)} × (
            {f3(f.depth / 12)}² − {f3((f.depth - f.h) / 12)}²) × {f2(f.B)} = {f0(r.passive)} lb ({f.soilSource})
          </>
        }
      />
      <DataTable
        caption="Stability and bearing per ASD combination"
        head={[
          "Combination",
          "V (lb)",
          "P (lb)",
          "M_OT (lb-ft)",
          "e (ft)",
          "q_max (psf)",
          "q / q_a",
          "M_OT / M_R",
          "Sliding D/C",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
        small
        rows={r.rows.map((x) => [
          x.combo.label,
          f0(x.V),
          f0(x.P),
          f0(x.M),
          Number.isFinite(x.e) ? f3(x.e) : "∞",
          Number.isFinite(x.qmax) ? f0(x.qmax) : "overturns",
          Number.isFinite(x.qRatio) ? f3(x.qRatio) : "—",
          f3(x.otRatio),
          x.slideRatio !== undefined ? f3(x.slideRatio) : "—",
        ])}
      />
      <TR
        desc="Bearing"
        expr={
          <>
            e = M / P = {f3(r.govBearing.e)} ft {r.govBearing.e <= f.Lf / 6 ? "≤" : ">"} L<sub>f</sub>/6 ={" "}
            {f3(f.Lf / 6)} ft; q<sub>max</sub> = {Number.isFinite(r.govBearing.qmax) ? f0(r.govBearing.qmax) : "∞"} psf
            ≤ {f0(f.qa)} psf ({r.govBearing.combo.label})
          </>
        }
        pass={r.govBearing.qRatio <= 1}
      />
      <TR
        desc="Overturning"
        expr={
          <>
            M<sub>OT</sub> = V h<sub>OT</sub> = {f0(r.govOT.M)} lb-ft ≤ M<sub>R</sub> = P L<sub>f</sub>/2 ={" "}
            {f0((r.govOT.P * f.Lf) / 2)} lb-ft ({r.govOT.combo.label})
          </>
        }
        pass={r.govOT.otRatio <= 1}
      />
      {r.govSlide ? (
        <TR
          desc="Sliding"
          expr={
            <>
              V = {f0(r.govSlide.V)} lb ≤ {f.friction !== undefined ? "μP" : "c A"} + P<sub>p</sub> ={" "}
              {f0(r.govSlide.slideCap!)} lb ({r.govSlide.combo.label})
            </>
          }
          pass={r.govSlide.slideRatio! <= 1}
        />
      ) : null}
      <SectionHead title="Hold-down uplift (strength)" />
      <TR
        desc="Uplift"
        expr={
          <>
            T<sub>u</sub> = {f0(u.Tu)} lb — {u.basis}
          </>
        }
      />
      <TR
        desc="Resisting length"
        expr={
          <>
            w<sub>D</sub> = {f1(u.wD)} plf; L<sub>e</sub> = T<sub>u</sub> / (0.9 w<sub>D</sub>) = {f2(u.Le)} ft ≤ L
            <sub>f</sub> = {f2(f.Lf)} ft
          </>
        }
        pass={u.Le <= f.Lf}
      />
      <TR
        desc="Longitudinal flexure"
        expr={
          <>
            M<sub>u</sub> = T<sub>u</sub> L<sub>e</sub> / 2 = {f0(u.Mu)} lb-ft ≤ φM<sub>n</sub> = {f0(u.phiMn)} lb-ft
            {u.plain ? " (plain, 0.60 × 5√f'c S_m)" : ` (top bars, d = ${f2(u.d!)} in)`}
          </>
        }
        pass={u.Mu <= u.phiMn}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Footing", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "Hold-down anchor embedment, edge distance and ACI 318 Ch. 17 checks are on the shear-wall sheet; the footing depth and width here must match the anchor geometry entered there.",
          "Gravity bearing of the footing between hold-downs is checked on the continuous-footing sheet.",
        ]}
      />
    </Frame>
  );
}

export function TieInSheet({ m, r, index, total }: SheetProps<TieInResult>) {
  const t = r.input;
  const w = r.row;
  return (
    <Frame
      m={m}
      r={r}
      title={`Tie-in to existing concrete (${m.cycle.aci318} Ch. 17)`}
      subtitle={
        <>
          Post-installed adhesive dowels / anchors — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.aci318} Ch. 17, §22.9; {t.product.report}
          </>
        }
        combos={<>{m.cycle.asce7} §2.3 (strength)</>}
      />
      <SectionHead title="Joint and anchors" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR desc="Joint" expr={<>{t.joint || "—"}</>} />
      <TR
        desc="Anchor"
        expr={
          <>
            {t.anchor.kind === "rebar" ? `${t.anchor.size} reinforcing bar` : `${f3(r.d)} in. threaded rod`} (
            {t.anchor.steelLabel}); d<sub>a</sub> = {f3(r.d)} in; A<sub>se</sub> = {f3(r.Ase)} in²; f<sub>uta</sub> ={" "}
            {f0(w.futa)} psi
          </>
        }
      />
      <TR
        desc="Geometry"
        expr={
          <>
            h<sub>ef</sub> = {f2(t.hef)} in; s = {f2(t.spacing)} in; c<sub>a1</sub> = {f2(t.ca1)} in; h<sub>a</sub> ={" "}
            {f2(t.ha)} in; shear {t.shearDir === "parallel-edge" ? "parallel to the edge" : "toward the edge"}
          </>
        }
      />
      <TR
        desc="Existing concrete"
        expr={
          <>
            f'<sub>c</sub> = {f0(t.existing.fc)} psi, {t.existing.cracked ? "cracked" : "uncracked"}
            {t.existing.verified ? "" : " — assumed, field verify"}
          </>
        }
      />
      <TR
        desc="Adhesive"
        expr={
          <>
            {t.product.name}: τ<sub>cr</sub> = {f0(t.product.tauCr)} psi, τ<sub>uncr</sub> = {f0(t.product.tauUncr)}{" "}
            psi; k<sub>c</sub> = {f0(w.kc)}; φ<sub>tension</sub> (breakout and bond) = {f2(t.product.phiBond)}, φ
            <sub>shear</sub> (breakout, pryout) = {f2(t.product.phiConcrete)}
          </>
        }
      />
      <DowelRebar
        size={t.anchor.kind === "rebar" ? t.anchor.size : `${t.anchor.size} in. rod`}
        hef={t.hef}
        spacing={t.spacing}
        ca1={t.ca1}
        ha={t.ha}
        product={t.product.name}
      />
      <SectionHead title="Demand (strength level)" />
      <TR
        desc="Per foot of joint"
        expr={
          <>
            N<sub>u</sub> = {f1(t.demand.Nu)} plf; V<sub>u</sub> = {f1(t.demand.Vu)} plf ({t.demand.source || "entered"}
            )
          </>
        }
      />
      <TR
        desc="Per anchor"
        expr={
          <>
            N<sub>ua</sub> = N<sub>u</sub> s / 12 = {f0(r.perAnchor.Nua)} lb; V<sub>ua</sub> = {f0(r.perAnchor.Vua)} lb
          </>
        }
      />
      <SectionHead title="Tension (ACI 318 17.6)" />
      <TR
        desc="Steel"
        expr={
          <>
            φN<sub>sa</sub> = 0.75 A<sub>se</sub> f<sub>uta</sub> = {f0(w.phiNsa)} lb
          </>
        }
      />
      <TR
        desc="Concrete breakout"
        expr={
          <>
            N<sub>b</sub> = k<sub>c</sub> √f'<sub>c</sub> h<sub>ef</sub>
            <sup>1.5</sup> = {f0(w.Nb)} lb; A<sub>Nc</sub> / A<sub>Nco</sub> = {f1(w.ANc)} / {f1(w.ANco)}; ψ
            <sub>ed,N</sub> = {f3(w.psiEdN)}; φN
            <sub>cb</sub> = {f0(w.phiNcb)} lb{w.seismicFactor < 1 ? " (× 0.75 seismic)" : ""}
          </>
        }
      />
      <TR
        desc="Bond"
        expr={
          <>
            c<sub>Na</sub> = 10 d<sub>a</sub> √(τ<sub>uncr</sub>/1100) = {f2(w.cNa)} in; N<sub>ba</sub> = τ π d
            <sub>a</sub> h<sub>ef</sub> = {f0(w.Nba)} lb; A<sub>Na</sub> / A<sub>Nao</sub> = {f1(w.ANa)} / {f1(w.ANao)};
            ψ<sub>ed,Na</sub> = {f3(w.psiEdNa)}; φN<sub>a</sub> = {f0(w.phiNa)} lb
          </>
        }
      />
      <TR
        desc="Design tension strength"
        expr={
          <>
            φN<sub>n</sub> = {f0(w.phiNn)} lb ({w.tGov}); {f0(r.perFoot.phiNn)} plf
          </>
        }
        pass={r.perAnchor.Nua <= w.phiNn}
      />
      <SectionHead title="Shear (ACI 318 17.7)" />
      <TR
        desc="Steel"
        expr={
          <>
            φV<sub>sa</sub> = 0.65 × 0.6 A<sub>se</sub> f<sub>uta</sub> = {f0(w.phiVsa)} lb
          </>
        }
      />
      <TR
        desc="Concrete breakout"
        expr={
          <>
            V<sub>b</sub> = {f0(w.Vb)} lb; A<sub>Vc</sub> / A<sub>Vco</sub> = {f1(w.AVc)} / {f1(w.AVco)}; ψ
            <sub>h,V</sub> = {f3(w.psiH)}; φV
            <sub>cb</sub> = {f0(w.phiVcb)} lb
          </>
        }
      />
      <TR
        desc="Pryout"
        expr={
          <>
            φV<sub>cp</sub> = φ k<sub>cp</sub> min(N<sub>a</sub>, N<sub>cb</sub>) = {f0(w.phiVcp)} lb
          </>
        }
      />
      <TR
        desc="Design shear strength"
        expr={
          <>
            φV<sub>n</sub> = {f0(w.phiVn)} lb ({w.vGov}); {f0(r.perFoot.phiVn)} plf
          </>
        }
        pass={r.perAnchor.Vua <= w.phiVn}
      />
      <TR desc="Interaction" expr={<>{rich(r.inter.text)}</>} pass={r.inter.ratio <= 1} />
      {r.sf ? (
        <>
          <SectionHead title="Shear friction across the joint (ACI 318 22.9)" />
          <TR
            desc="Capacity"
            expr={
              <>
                A<sub>vf</sub> = {f3(r.sf.Avf)} in²/ft; μ = {r.sf.mu}; φV<sub>n</sub> = 0.75 min(μ A<sub>vf</sub> f
                <sub>y</sub>, {f0(r.sf.limit)}) = {f0(r.sf.phiVn)} plf ≥ V<sub>u</sub> = {f0(r.sf.Vu)} plf
              </>
            }
            pass={r.sf.ratio <= 1}
          />
        </>
      ) : null}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Tie-in", r.callout],
          ["Capacity per foot", `φN_n = ${f0(r.perFoot.phiNn)} plf, φV_n = ${f0(r.perFoot.phiVn)} plf`],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "Hole diameter, drilling method, cleaning, cure time and minimum member thickness per the ICC-ES report.",
        ]}
      />
    </Frame>
  );
}

/** Truss elevation with joint names and governing member forces (compression red, tension blue). */
function TrussElevation({
  g,
  rows,
  kip,
  caption,
}: {
  g: TrussGeometry;
  rows: Array<{ mode: "tension" | "compression" | "zero"; Cmax: number; Tmax: number }>;
  kip?: boolean;
  caption: string;
}) {
  const Wd = 470;
  const pad = 30;
  const xmin = -(g.overhang || 0);
  const xmax = g.span + (g.overhang || 0);
  const ymax = Math.max(...g.nodes.map((n) => n.y), 0.5);
  const sc = (Wd - 2 * pad) / (xmax - xmin);
  // shallow trusses: exaggerate the vertical scale so members and forces stay legible
  const scY = Math.min(Math.max(sc, 110 / ymax), 130 / ymax);
  const exag = scY / sc;
  const Hd = ymax * scY + 46;
  const X = (x: number) => pad + (x - xmin) * sc;
  const Y = (y: number) => Hd - 24 - y * scY;
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <svg width="100%" viewBox={`0 0 ${Wd} ${Hd}`} role="img" aria-label="Truss elevation">
          {g.tailLeft ? (
            <line
              x1={X(g.tailLeft.x)}
              y1={Y(g.tailLeft.y)}
              x2={X(g.nodes[g.topChordNodes[0]].x)}
              y2={Y(g.nodes[g.topChordNodes[0]].y)}
              {...line}
            />
          ) : null}
          {g.tailRight ? (
            <line
              x1={X(g.tailRight.x)}
              y1={Y(g.tailRight.y)}
              x2={X(g.nodes[g.topChordNodes[g.topChordNodes.length - 1]].x)}
              y2={Y(g.nodes[g.topChordNodes[g.topChordNodes.length - 1]].y)}
              {...line}
            />
          ) : null}
          {g.members.map((m, i) => {
            const a = g.nodes[m.a];
            const b = g.nodes[m.b];
            const row = rows[i];
            const F = (row.mode === "compression" ? -row.Cmax : row.Tmax) / (kip ? 1000 : 1);
            const mx = (X(a.x) + X(b.x)) / 2;
            const my = (Y(a.y) + Y(b.y)) / 2;
            const c = row.mode === "compression" ? DC.compression : row.mode === "zero" ? DC.zero : DC.tension;
            return (
              <g key={i}>
                <line
                  x1={X(a.x)}
                  y1={Y(a.y)}
                  x2={X(b.x)}
                  y2={Y(b.y)}
                  stroke={c}
                  fill="none"
                  strokeWidth={row.mode === "compression" ? (m.group === "WEB" || m.group === "EV" ? 1.2 : 1.8) : 0.8}
                  strokeDasharray={row.mode === "compression" ? undefined : row.mode === "zero" ? "1 2" : "4 2"}
                />
                {row.mode !== "zero" ? (
                  <text x={mx} y={my - 2} style={{ ...txt, fontSize: 6.5, fill: c }} textAnchor="middle">
                    {fmt(Math.abs(F), kip ? 1 : 0)}
                    {row.mode === "compression" ? "C" : "T"}
                  </text>
                ) : null}
              </g>
            );
          })}
          {g.nodes.map((n) => (
            <text
              key={n.id}
              x={X(n.x) + 2}
              y={Y(n.y) + (n.onBottomChord ? 9 : -4)}
              style={{ ...txt, fontSize: 7, fontWeight: 700 }}
            >
              {n.name}
            </text>
          ))}
          {[g.supportLeft, g.supportRight].map((id, k) => (
            <polygon
              key={k}
              points={`${X(g.nodes[id].x)},${Y(g.nodes[id].y)} ${X(g.nodes[id].x) - 6},${Y(g.nodes[id].y) + 10} ${X(g.nodes[id].x) + 6},${Y(g.nodes[id].y) + 10}`}
              stroke={INK}
              fill="#fff"
            />
          ))}
          <text x={pad} y={Hd - 2} style={txt}>
            Span {fmt(g.span, 2)} ft — {caption} (red heavy = compression C, blue dashed = tension T)
            {exag > 1.05 ? `; vertical scale × ${fmt(exag, 1)}` : ""}
          </text>
        </svg>
      </td>
    </tr>
  );
}

export function WoodTrussSheet({ m, r, index, total, received, connections }: SheetProps<WoodTrussResult>) {
  const t = r.input;
  const L = r.loads;
  const tc = r.tcCombined;
  const bc = r.bcCombined;
  return (
    <Frame
      m={m}
      r={r}
      title={`Wood roof truss design (${m.cycle.nds})`}
      subtitle={
        <>
          Pin-jointed analysis, ASD — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={<>ANSI/AWC {m.cycle.nds} Ch. 3, 4, 12</>}
        tables={[m.cycle.nds === "NDS-2024" ? "nds2024-4A" : "nds2018-4A"]}
      />
      <SectionHead title="Truss" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Geometry"
        expr={
          <>
            Span {f2(t.span)} ft;{" "}
            {t.type === "parallel"
              ? `depth ${f2(t.depth ?? 2.5)} ft, ${t.panels ?? 8} panels`
              : t.type === "custom"
                ? `custom layout, ${r.geometry.nodes.length} joints / ${r.geometry.members.length} members, rise ${f2(r.geometry.rise)} ft, design pitch ${f2(t.pitch)}:12`
                : `pitch ${f2(t.pitch)}:12 (θ = ${f2(r.thetaDeg)}°), rise ${f2(r.geometry.rise)} ft`}
            ; overhang {f2(t.overhang)} ft; spacing {f0(t.spacing)} in. o.c.; heel bearing {f2(t.bearingLen)} in
          </>
        }
      />
      <TR
        desc="Members"
        expr={
          <>
            TC {t.tc.size} {t.tc.species} {t.tc.grade}; BC {t.bc.size} {t.bc.species} {t.bc.grade}; webs {t.web.size}{" "}
            {t.web.species} {t.web.grade}
          </>
        }
      />
      <DataTable
        caption="Reference design values (NDS Supplement Table 4A) and size factors"
        head={["Group", "Size", "F_b", "F_t", "F_c", "F_c⊥", "E", "E_min", "C_F (b / t / c)"].map((h) => rich(h))}
        align={["left", "left", "right", "right", "right", "right", "right", "right", "left"]}
        small
        rows={(["TC", "BC", "WEB"] as const).map((k) => {
          const x = r.mats[k];
          return [
            k,
            x.label,
            f0(x.Fb),
            f0(x.Ft),
            f0(x.Fc),
            f0(x.Fcperp),
            f0(x.E),
            f0(x.Emin),
            `${f2(x.CF)} / ${f2(x.CFt)} / ${f2(x.CFc)}`,
          ];
        })}
      />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Loads on the truss (plf of horizontal projection)" />
      <TR desc="Combinations" expr={<>{r.combosUsed.join("; ")}</>} />
      <TrussElevation g={r.geometry} rows={r.rows} caption="maximum ASD member forces, lb" />
      <DataTable
        caption="Member forces by load type and governing axial check (+ tension, − compression)"
        head={[
          "Member",
          "Group",
          "L (ft)",
          "D (lb)",
          "L_r (lb)",
          "S (lb)",
          "W (lb)",
          "Mode",
          "f (psi)",
          "F' (psi)",
          "C_P",
          "D/C",
          "Combination",
        ].map((h) => rich(h))}
        align={[
          "left",
          "left",
          "right",
          "right",
          "right",
          "right",
          "right",
          "left",
          "right",
          "right",
          "right",
          "right",
          "left",
        ]}
        small
        rows={r.rows.map((x) => [
          x.name,
          x.group,
          f2(x.length),
          f0(x.byType.D),
          f0(x.byType.Lr),
          f0(x.byType.S),
          f0(x.byType.W),
          x.mode,
          f1(x.f),
          f0(x.Fprime),
          x.mode === "compression" ? f3(x.CP) : "—",
          f3(x.ratio),
          x.combo,
        ])}
      />
      <SectionHead title={`Top chord — axial + panel bending, member ${tc.member} (${tc.combo})`} />
      <TR
        desc="Panel bending"
        expr={
          <>
            w<sub>⊥</sub> = {f1(tc.w)} plf; M = w l²/8 = {f1(tc.w)} × {f2(tc.panel)}² / 8 = {f1(tc.M)} lb-ft; f
            <sub>b</sub> = {f0(tc.fb)} psi ≤ F<sub>b</sub>' = F<sub>b</sub> C<sub>D</sub> C<sub>F</sub> C<sub>r</sub> ={" "}
            {f0(tc.Fb)} psi
          </>
        }
      />
      <TR
        desc="Interaction (NDS Eq. 3.9-3)"
        expr={
          <>
            (f<sub>c</sub>/F<sub>c</sub>')² + f<sub>b</sub>/[F<sub>b</sub>'(1 − f<sub>c</sub>/F<sub>cE1</sub>)] = (
            {f0(tc.fc)}/{f0(tc.Fc)})² + {f0(tc.fb)}/[{f0(tc.Fb)}(1 − {f0(tc.fc)}/{f0(tc.FcE)})] = {f3(tc.ratio)}
          </>
        }
        pass={tc.ratio <= 1}
      />
      <SectionHead title={`Bottom chord — axial + bending, member ${bc.member} (${bc.combo})`} />
      <TR
        desc="Interaction (NDS Eq. 3.9-1)"
        expr={
          <>
            w = {f1(bc.w)} plf; M = {f1(bc.M)} lb-ft; f<sub>t</sub>/F<sub>t</sub>' + f<sub>b</sub>/F<sub>b</sub>* ={" "}
            {f0(bc.ft)}/{f0(bc.Ft)} + {f0(bc.fb)}/{f0(bc.Fb)} = {f3(bc.ratio)}
          </>
        }
        pass={bc.ratio <= 1}
      />
      <SectionHead title="Heel bearing (NDS 3.10.2)" />
      <TR
        desc="Bearing"
        expr={
          <>
            R = {f0(r.bearing.R)} lb ({r.bearing.combo}); A = {f2(r.bearing.A)} in²; C<sub>b</sub> = {f3(r.bearing.Cb)};
            f<sub>c⊥</sub> = {f0(r.bearing.fcperp)} psi ≤ F<sub>c⊥</sub>' = {f0(r.bearing.Fprime)} psi
          </>
        }
        pass={r.bearing.ratio <= 1}
      />
      {r.tail ? (
        <TR
          desc="Eave tail"
          expr={
            <>
              M = {f1(r.tail.M)} lb-ft; f<sub>b</sub> = {f0(r.tail.fb)} psi ≤ {f0(r.tail.Fb)} psi ({r.tail.combo})
            </>
          }
          pass={r.tail.ratio <= 1}
        />
      ) : null}
      <SectionHead title="Deflection — virtual work, Δ = Σ F f L / (A E)" />
      <TR
        desc={`Joint ${r.defl.node}`}
        expr={
          <>
            Δ<sub>live</sub> = {f3(r.defl.live)} in ≤ {f3(r.defl.liveLim)} in; Δ<sub>total</sub> = Δ<sub>live</sub> + K
            <sub>cr</sub> Δ<sub>D</sub> = {f3(r.defl.live)} + {f2(r.defl.Kcr)} × {f3(r.defl.dead)} = {f3(r.defl.total)}{" "}
            in ≤ {f3(r.defl.totalLim)} in
          </>
        }
        pass={r.defl.live <= r.defl.liveLim && r.defl.total <= r.defl.totalLim}
      />
      <SectionHead title="Joints" />
      <TR desc="Connection" expr={<>{rich(r.jointText)}</>} />
      <DataTable
        caption="Joint demand per member (governing combination)"
        head={["Joint", "Member", "F (lb)", "Required", "Available", "D/C", "Combination"]}
        align={["left", "left", "right", "right", "right", "right", "left"]}
        small
        rows={r.joints.map((j) => [
          j.node,
          j.member,
          f0(j.F),
          `${j.required < 10 ? f2(j.required) : f0(j.required)} ${j.unit}`,
          f0(j.available),
          f3(j.ratio),
          j.combo,
        ])}
      />
      <ChecksSummary checks={r.checks} />
      <ReactionTable reactions={r.reactions} perFoot />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Truss", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "Permanent lateral bracing of webs, top-chord bracing and bottom-chord bracing per BCSI and the truss design.",
          "Erection and temporary bracing by the contractor; heel ties and uplift connectors on the connector schedule.",
        ]}
      />
    </Frame>
  );
}

export function SteelTrussSheet({ m, r, index, total, received, connections }: SheetProps<SteelTrussResult>) {
  const t = r.input;
  const g = r.geometry;
  const k = (lb: number) => f2(lb / 1000);
  const av = r.method === "LRFD" ? "φP_n" : "P_n/Ω";
  const pat = STEEL_TRUSS_PATTERNS[t.pattern];
  const groups = (Object.keys(STEEL_TRUSS_GROUPS) as Array<keyof typeof STEEL_TRUSS_GROUPS>).filter((x) => r.mats[x]);
  const worst = <T,>(xs: T[], f: (x: T) => number) =>
    xs.length ? xs.reduce((a, b) => (f(b) > f(a) ? b : a)) : undefined;
  const panelW = t.span / r.panels;
  return (
    <Frame
      m={m}
      r={r}
      title={`Steel roof truss design (${m.cycle.aisc360})`}
      subtitle={
        <>
          Pin-jointed analysis, {r.method} — member {index} of {total}: {r.mark}
        </>
      }
    >
      <SteelBasis m={m} method={r.method} tables={["aisc-hss", "aisc-shapes", "aisc-2-4"]} />
      <SectionHead title="Truss" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Geometry"
        expr={
          <>
            {pat.label}; span L = {f2(t.span)} ft; rise H = {f2(t.rise)} ft (θ = {f2(r.thetaDeg)}°)
            {t.pattern === "pitched-parallel" ? `; chord spacing ${f2(t.chordDepth)} ft` : ""}; {r.panels} panels at{" "}
            {f3(panelW)} ft; overhang {f2(t.overhang)} ft each side; spacing {f2(t.spacing)} ft o.c.
          </>
        }
      />
      <TR
        desc="Out-of-plane bracing"
        expr={
          <>
            Top chord {t.topBracing ? `${f2(t.topBracing)} ft` : "at every panel point"}; bottom chord{" "}
            {t.bottomBracing ? `${f2(t.bottomBracing)} ft` : "at every panel point"}; webs L<sub>c</sub> = member length
            (K = 1.0)
          </>
        }
      />
      <TR desc="Supports" expr={<>Left bearing pinned, right bearing on a roller; ideal pins at all joints</>} />
      <DataTable
        caption="Sections and material (HouseCalc AISC library)"
        head={[
          "Group",
          "Section",
          "Grade",
          "A (in²)",
          "Wt (plf)",
          "r_x (in)",
          "r_y (in)",
          "F_y (ksi)",
          "F_u (ksi)",
        ].map((h) => rich(h))}
        align={["left", "left", "left", "right", "right", "right", "right", "right", "right"]}
        small
        rows={groups.map((x) => {
          const s = r.mats[x]!;
          return [
            STEEL_TRUSS_GROUPS[x],
            s.shape.name,
            s.gradeLabel,
            f2(s.shape.A),
            f1(s.shape.wt),
            f2(s.shape.rx),
            f2(s.shape.ry),
            f0(s.Fy),
            f0(s.Fu),
          ];
        })}
      />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Loads on the truss (plf of horizontal projection)" />
      <TR desc="Combinations" expr={<>{r.combosUsed.join("; ")}</>} />
      <TrussElevation g={g} rows={r.rows} kip caption={`maximum ${r.method} member forces, kip`} />
      <DataTable
        caption="Joint coordinates (origin at the left bearing)"
        head={["Joint", "X (ft)", "Y (ft)", "Joint", "X (ft)", "Y (ft)"]}
        align={["left", "right", "right", "left", "right", "right"]}
        small
        rows={Array.from({ length: Math.ceil(g.nodes.length / 2) }, (_, i) => {
          const a = g.nodes[i];
          const b = g.nodes[i + Math.ceil(g.nodes.length / 2)];
          const sup = (id: number) => (id === g.supportLeft ? " (pin)" : id === g.supportRight ? " (roller)" : "");
          return [
            `${a.name}${sup(a.id)}`,
            f3(a.x),
            f3(a.y),
            b ? `${b.name}${sup(b.id)}` : "",
            b ? f3(b.x) : "",
            b ? f3(b.y) : "",
          ];
        })}
      />
      <DataTable
        caption="Member forces by load case (kip, + tension) and governing axial check"
        head={[
          "Member",
          "Joints",
          "Group",
          "Section",
          "L (ft)",
          "D",
          "L_r",
          "S",
          "W↓",
          "W↑",
          "T_max",
          "C_max",
          "Available",
          "D/C",
          "Combination",
        ].map((h) => rich(h))}
        align={[
          "left",
          "left",
          "left",
          "left",
          "right",
          "right",
          "right",
          "right",
          "right",
          "right",
          "right",
          "right",
          "right",
          "right",
          "left",
        ]}
        small
        rows={r.rows.map((x, i) => [
          x.name,
          `${g.nodes[g.members[i].a].name}–${g.nodes[g.members[i].b].name}`,
          x.group,
          x.shape,
          f2(x.length),
          k(x.byType.D),
          k(x.byType.Lr),
          k(Math.abs(x.byType.Su) > Math.abs(x.byType.S) ? x.byType.Su : x.byType.S),
          k(x.byType.Wd),
          k(x.byType.Wu),
          k(x.Tmax),
          k(x.Cmax),
          x.mode === "compression" ? (x.compError ? "n/a" : f2(x.Pc)) : f2(x.Pt),
          Number.isFinite(x.ratio) ? f3(x.ratio) : "—",
          x.combo,
        ])}
      />
      <SectionHead title={`Tension members — AISC ${m.cycle.aisc360} Ch. D`} />
      <TR
        desc="Effective net area"
        expr={
          <>
            A<sub>n</sub> = {f2(t.netArea)} A<sub>g</sub>; A<sub>e</sub> = U A<sub>n</sub> = {f2(t.U)} × {f2(t.netArea)}{" "}
            A<sub>g</sub> (D3-1); yielding {factorText(r.factors.tY, r.method)}, rupture{" "}
            {factorText(r.factors.tR, r.method)}
          </>
        }
      />
      {groups.map((grp) => {
        const x = worst(
          r.rows.filter((q) => q.group === grp && q.Tmax >= 1),
          (q) => q.Tmax / 1000 / q.Pt,
        );
        if (!x) return null;
        const s = r.mats[grp]!;
        const PnY = s.Fy * s.shape.A;
        const PnR = s.Fu * t.U * t.netArea * s.shape.A;
        return (
          <TR
            key={`t${grp}`}
            desc={`${STEEL_TRUSS_GROUPS[grp]} ${x.name}`}
            expr={
              <>
                P<sub>n</sub> = F<sub>y</sub>A<sub>g</sub> = {f0(s.Fy)} × {f3(s.shape.A)} = {f2(PnY)} kip (D2-1); P
                <sub>n</sub> = F<sub>u</sub>A<sub>e</sub> = {f0(s.Fu)} × {f3(t.U * t.netArea * s.shape.A)} = {f2(PnR)}{" "}
                kip (D2-2); {rich(av)} = {f2(x.Pt)} kip, {x.tLimit}; P<sub>r</sub> = {k(x.Tmax)} kip ({x.Tcombo}); D/C ={" "}
                {f3(x.Tmax / 1000 / x.Pt)}
              </>
            }
            pass={x.Tmax / 1000 <= x.Pt}
          />
        );
      })}
      <SectionHead title={`Compression members — AISC ${m.cycle.aisc360} Ch. E`} />
      {groups.map((grp) => {
        const x = worst(
          r.rows.filter((q) => q.group === grp && q.Cmax >= 1),
          (q) => (q.compError ? Infinity : q.Cmax / 1000 / q.Pc),
        );
        if (!x) return null;
        if (x.compError || !x.comp)
          return (
            <TR
              key={`c${grp}`}
              desc={`${STEEL_TRUSS_GROUPS[grp]} ${x.name}`}
              expr={
                <>
                  P<sub>r</sub> = {k(x.Cmax)} kip ({x.Ccombo}) — not designed: {x.compError}
                </>
              }
              pass={false}
            />
          );
        const c = x.comp;
        return (
          <TR
            key={`c${grp}`}
            desc={`${STEEL_TRUSS_GROUPS[grp]} ${x.name}`}
            expr={
              <>
                L<sub>cx</sub> = {f0(c.Lcx)} in, L<sub>cy</sub> = {f0(c.Lcy)} in; L<sub>cx</sub>/r<sub>x</sub> ={" "}
                {f1(c.SRx)}, L<sub>cy</sub>/r<sub>y</sub> = {f1(c.SRy)}; F<sub>e</sub> = π²E/(L<sub>c</sub>/r)² ={" "}
                {f2(c.Fe)} ksi (E3-4); F<sub>cr</sub> = {f2(c.Fcr)} ksi (
                {r.mats[grp]!.Fy / c.Fe <= 2.25 ? "E3-2" : "E3-3"}); P<sub>n</sub> = F<sub>cr</sub>
                {c.slender ? (
                  <>
                    A<sub>e</sub> (E7-1)
                  </>
                ) : (
                  <>
                    A<sub>g</sub> (E3-1)
                  </>
                )}{" "}
                = {f2(c.Pn)} kip; {rich(av)} = {f2(x.Pc)} kip; P<sub>r</sub> = {k(x.Cmax)} kip ({x.Ccombo}); D/C ={" "}
                {f3(x.Cmax / 1000 / x.Pc)}
              </>
            }
            pass={x.Cmax / 1000 <= x.Pc}
          />
        );
      })}
      {(() => {
        const x = worst(
          r.rows.filter((q) => q.comp),
          (q) => q.Cmax / 1000 / (q.Pc || 1),
        );
        return x?.comp ? <ClassRows classes={x.comp.classes} /> : null;
      })()}
      <TR desc="Compression resistance" expr={<>{factorText(PHI.compression, r.method)} (E1)</>} />
      {r.tail ? (
        <>
          <SectionHead title={`Top-chord tail — cantilever flexure, ${m.cycle.aisc360} Ch. F`} />
          <TR
            desc="Tail"
            expr={
              <>
                M<sub>r</sub> = w a²/2 = {f3(r.tail.M)} kip-ft ({r.tail.combo}) ≤ M<sub>c</sub> = {f3(r.tail.Mc)} kip-ft
                (L<sub>b</sub> = {f2(r.tail.length)} ft, C<sub>b</sub> = 1.0)
              </>
            }
            pass={r.tail.ratio <= 1}
          />
        </>
      ) : null}
      <SectionHead title="Deflection — service loads, direct stiffness" />
      <TR
        desc={`Joint ${r.defl.node}`}
        expr={
          <>
            Δ<sub>live</sub> = {f3(r.defl.live)} in ≤ L/{f0((t.span * 12) / r.defl.liveLim)} = {f3(r.defl.liveLim)} in;
            Δ<sub>total</sub> = Δ<sub>live</sub> + Δ<sub>D</sub> = {f3(r.defl.live)} + {f3(r.defl.dead)} ={" "}
            {f3(r.defl.total)} in ≤ {f3(r.defl.totalLim)} in
          </>
        }
        pass={r.defl.live <= r.defl.liveLim && r.defl.total <= r.defl.totalLim}
      />
      <TR
        desc="Horizontal reaction"
        expr={
          <>
            R<sub>x</sub> at the pinned bearing = {f0(r.Rx)} lb (governing combination)
          </>
        }
      />
      <ChecksSummary checks={r.checks} />
      <ReactionTable reactions={r.reactions} perFoot />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Truss", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "Joints, gusset plates, welds and bolts designed separately (AISC Ch. J / K); member centroids to meet at the panel points.",
          "Erection stability and temporary bracing by the contractor; permanent chord and web bracing as stated above.",
        ]}
      />
    </Frame>
  );
}
