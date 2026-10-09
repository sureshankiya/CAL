/**
 * Phase 5 member sheets — cantilever retaining walls and deck guard posts — in the
 * Tedds-style layout of the other sheets.
 */

import type React from "react";
import type { CfsWallResult } from "@/engine/members/cfsWall";
import type { GuardPostResult } from "@/engine/members/guardPost";
import type { RetainingWallResult } from "@/engine/members/retainingWall";
import { B, DataTable, SectionHead, SubHead, TR } from "../report/primitives";
import { DesignBasis, f0, f1, f2, f3, rich } from "./common";
import { AssumptionRows, ChecksSummary, FinalSummary, LimitationNotes, LoadLines, MemberResult } from "./blocks";
import { Frame, LoadPath, verifyText } from "./Phase3Sheets";
import { WallDiagrams } from "./Phase4Sheets";
import type { SheetMeta } from "./common";

interface SheetProps<R> {
  m: SheetMeta;
  r: R;
  index: number;
  total: number;
  received: string[];
  connections?: string[];
}

const txt: React.CSSProperties = { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 8, fill: "black" };
const line = { stroke: "black", fill: "none", strokeWidth: 1 } as const;

/** Section through the wall: stem, footing, grades and the main dimensions (black and white). */
function RetainingSection({ r }: { r: RetainingWallResult }) {
  const w = r.input;
  const { B: Bw, ts, hf } = r.geo;
  const Wd = 470;
  const Hd = 250;
  const totalH = w.stem.height + hf;
  const sc = Math.min((Wd - 220) / Bw, (Hd - 34) / totalH);
  const x0 = (Wd - Bw * sc) / 2;
  const yb = Hd - 12;
  const X = (x: number) => x0 + x * sc;
  const Y = (y: number) => yb - y * sc;
  const toe = w.footing.toe;
  const yTop = hf + w.stem.height;
  const yGrade = hf + w.Hr;
  const yToe = hf + w.soil.toeCover;
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <svg width="100%" viewBox={`0 0 ${Wd} ${Hd}`} role="img" aria-label="Retaining wall section">
          {/* footing and stem */}
          <polygon
            points={`${X(0)},${Y(0)} ${X(Bw)},${Y(0)} ${X(Bw)},${Y(hf)} ${X(toe + ts)},${Y(hf)} ${X(toe + ts)},${Y(yTop)} ${X(toe)},${Y(yTop)} ${X(toe)},${Y(hf)} ${X(0)},${Y(hf)}`}
            {...line}
            strokeWidth={1.2}
          />
          {/* retained grade behind, toe grade in front */}
          <line x1={X(toe + ts)} y1={Y(yGrade)} x2={X(Bw) + 40} y2={Y(yGrade)} {...line} strokeDasharray="4 2" />
          {w.soil.toeCover > 0 ? (
            <line x1={X(0) - 30} y1={Y(yToe)} x2={X(toe)} y2={Y(yToe)} {...line} strokeDasharray="4 2" />
          ) : null}
          {/* earth pressure triangle on the heel plane */}
          <polygon
            points={`${X(Bw) + 6},${Y(yGrade)} ${X(Bw) + 6},${Y(0)} ${X(Bw) + 46},${Y(0)}`}
            {...line}
            strokeWidth={0.7}
          />
          <text x={X(Bw) + 50} y={Y(0) - 2} style={txt}>
            {f0(w.soil.efp)} pcf
          </text>
          {/* dimensions */}
          <text x={X(toe + ts) + 4} y={(Y(hf) + Y(yGrade)) / 2} style={txt}>
            Hr = {f2(w.Hr)} ft
          </text>
          <text x={X(0)} y={yb + 10} style={txt}>
            B = {f2(Bw)} ft (toe {f2(toe)}, stem {f2(ts)}, heel {f2(w.footing.heel)})
          </text>
          <text x={X(0) - 64} y={Y(hf / 2) + 3} style={txt}>
            hf = {f0(w.footing.h)} in
          </text>
          <text x={X(toe) - 4} y={Y(yTop) - 4} style={txt} textAnchor="end">
            stem {f2(w.stem.height)} ft × {f1(w.stem.t)} in
          </text>
          <text x={X(Bw) + 44} y={Y(yGrade) - 4} style={txt}>
            {w.soil.surcharge ? `q = ${f0(w.soil.surcharge)} psf` : "grade"}
          </text>
        </svg>
      </td>
    </tr>
  );
}

export function RetainingWallSheet({ m, r, index, total, received, connections }: SheetProps<RetainingWallResult>) {
  const w = r.input;
  const f = w.footing;
  const s = w.soil;
  const st = r.stem;
  const cmu = w.stem.material === "cmu";
  const tg = r.footing.toe;
  const hg = r.footing.heel;
  return (
    <Frame
      m={m}
      r={r}
      title={`Cantilever retaining wall (${m.cycle.building} §1807.2, ${m.cycle.aci318}${cmu ? `, ${m.cycle.tms402}` : ""})`}
      subtitle={
        <>
          Stability, soil bearing, stem and footing design per foot of wall — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.building} §1610, §1806, §1807.2; {m.cycle.aci318} Ch. 7, 22, 24, 25
            {cmu ? `; ${m.cycle.tms402} Ch. 8` : ""}
          </>
        }
        tables={["ibc-1806.2", ...(cmu ? ["tms602-2", "tms402-8.3"] : [])]}
        combos={
          <>
            Stability: nominal loads with 0.7E (IBC 1807.2.3); bearing {m.cycle.asce7} §2.4 with 1.0H; concrete §2.3
            with 1.6H
          </>
        }
      />
      <SectionHead title="Geometry" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <RetainingSection r={r} />
      <TR
        desc="Wall"
        expr={
          <>
            Retained height H<sub>r</sub> = {f2(w.Hr)} ft; stem {f2(w.stem.height)} ft × {f3(w.stem.t)} in{" "}
            {cmu ? "CMU, fully grouted" : "concrete"}; footing B = {f2(r.geo.B)} ft × h<sub>f</sub> = {f1(f.h)} in; toe{" "}
            {f2(f.toe)} ft; heel {f2(f.heel)} ft; soil over the toe {f2(s.toeCover)} ft
          </>
        }
      />
      <TR
        desc="Pressure height"
        expr={
          <>
            H<sub>t</sub> = H<sub>r</sub> + h<sub>f</sub> = {f2(w.Hr)} + {f3(r.geo.hf)} = {f3(r.geo.Ht)} ft (vertical
            plane through the heel)
          </>
        }
      />
      <SectionHead title="Soil" />
      <TR
        desc="Backfill"
        expr={
          <>
            γ = {f0(s.gamma)} pcf; active equivalent fluid {f0(s.efp)} pcf ({s.efpSource}); K<sub>a</sub> = efp / γ ={" "}
            {f3(r.geo.Ka)}; drained — no hydrostatic pressure
          </>
        }
      />
      <TR
        desc="Foundation soil"
        expr={
          <>
            q<sub>a</sub> = {f0(s.qa)} psf ({s.qaSource});{" "}
            {s.friction !== undefined ? <>μ = {f2(s.friction)}</> : <>cohesion {f0(s.cohesion ?? 0)} psf ≤ ½ D</>};
            lateral bearing {f0(s.passive)} psf/ft ({s.soilSource})
          </>
        }
      />
      {s.seismic && s.seismic.k > 0 ? (
        <TR
          desc="Seismic increment"
          expr={
            <>
              {f1(s.seismic.k)}H psf, {s.seismic.shape === "uniform" ? "uniform" : "inverted triangle"} (geotechnical
              report, IBC 1803.5.12)
            </>
          }
        />
      ) : null}
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} title="Loads per foot of wall" />
      <DataTable
        caption="Vertical loads (per foot, arms from the toe)"
        head={["Item", "Type", "W (lb/ft)", "x (ft)", "W x (lb-ft/ft)", "Resists sliding / OT"]}
        align={["left", "left", "right", "right", "right", "left"]}
        small
        rows={r.vertical.map((v) => [v.label, v.type, f0(v.W), f3(v.x), f0(v.W * v.x), v.resists ? "yes" : "no"])}
      />
      <DataTable
        caption="Lateral loads (per foot, on the plane through the heel)"
        head={["Item", "Expression", "P (lb/ft)", "y (ft)", "P y (lb-ft/ft)"]}
        align={["left", "left", "right", "right", "right"]}
        small
        rows={r.lateral.map((l) => [l.label, rich(l.expr), f0(l.P), f3(l.y), f0(l.P * l.y)])}
      />
      <SectionHead title="Stability (IBC 1807.2.3)" />
      <TR
        desc="Passive on the toe"
        expr={
          <>
            P<sub>p</sub> = ½ × {f0(s.passive)} × ({f3(r.passive.dp)}² − {f3(r.passive.dn)}²) = {f0(r.passive.Pp)} lb/ft
            (top {f2(r.passive.dn)} ft ignored)
          </>
        }
      />
      <DataTable
        caption="Sliding and overturning about the toe"
        head={[
          "Case",
          "H (lb/ft)",
          "ΣW_r (lb/ft)",
          "Friction (lb/ft)",
          "R (lb/ft)",
          "FS sliding",
          "M_o (lb-ft/ft)",
          "M_r (lb-ft/ft)",
          "FS OT",
          "FS req.",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"]}
        small
        rows={r.stability.map((x) => [
          x.label,
          f0(x.H),
          f0(x.Wr),
          f0(x.friction),
          f0(x.R),
          f2(x.FSs),
          f0(x.Mo),
          f0(x.Mr),
          f2(x.FSo),
          f1(x.FSreq),
        ])}
      />
      {r.stability.map((x, i) => (
        <TR
          key={i}
          desc={i === 0 ? "Factors of safety" : undefined}
          expr={
            <>
              {x.label}: FS<sub>sliding</sub> = R / H = {f0(x.R)} / {f0(x.H)} = {f2(x.FSs)}; FS<sub>OT</sub> = M
              <sub>r</sub> / M<sub>o</sub> = {f0(x.Mr)} / {f0(x.Mo)} = {f2(x.FSo)} ≥ {f1(x.FSreq)}
            </>
          }
          pass={x.FSs >= x.FSreq && x.FSo >= x.FSreq}
        />
      ))}
      <SectionHead title="Soil bearing" />
      <DataTable
        caption="Bearing per ASD combination (1.0H)"
        head={["Combination", "P (lb/ft)", "x̄ (ft)", "e (ft)", "q_max (psf)", "q_min (psf)", "q / q_a"].map((h) =>
          rich(h),
        )}
        align={["left", "right", "right", "right", "right", "right", "right"]}
        small
        rows={r.bearing.map((x) => [
          x.combo.label,
          f0(x.P),
          f3(x.xbar),
          f3(x.e),
          Number.isFinite(x.qmax) ? f0(x.qmax) : "overturns",
          f0(x.qmin),
          Number.isFinite(x.ratio) ? f3(x.ratio) : "—",
        ])}
      />
      <TR
        desc="Governing"
        expr={
          <>
            x̄ = (ΣW x − M<sub>o</sub>) / ΣW = {f3(r.bearingGov.xbar)} ft; e = B/2 − x̄ = {f3(r.bearingGov.e)} ft{" "}
            {Math.abs(r.bearingGov.e) <= r.geo.B / 6 ? "≤" : ">"} B/6 = {f3(r.geo.B / 6)} ft; q<sub>max</sub> ={" "}
            {Number.isFinite(r.bearingGov.qmax) ? f0(r.bearingGov.qmax) : "∞"} psf ≤ {f0(s.qa)} psf (
            {r.bearingGov.combo.label})
          </>
        }
        pass={r.bearingGov.ratio <= 1}
      />
      <SectionHead title={`Stem — ${cmu ? "TMS 402 ASD" : "ACI 318 strength design"}, cantilever from the footing`} />
      <TR desc="Stem" expr={<>{st.callout}</>} />
      <WallDiagrams d={st.diagram} unitM="lb-in/ft" />
      <TR
        desc="Flexure"
        expr={
          <>
            {rich(cmu ? "M" : "M_u")} = {f0(Math.abs(st.flex.M))} lb-in/ft at x = {f2(st.flex.x)} ft with P ={" "}
            {f0(st.flex.P)} lb/ft ≤ {rich(cmu ? "M_c" : "φM_n")} = {f0(st.flex.Mc)} lb-in/ft ({st.flex.combo.label})
          </>
        }
        pass={st.flex.ratio <= 1}
      />
      <TR
        desc="Shear"
        expr={
          <>
            V = {f0(st.shear.V)} lb/ft ≤ {f0(st.shear.cap)} lb/ft ({st.shear.combo.label})
          </>
        }
        pass={st.shear.ratio <= 1}
      />
      <TR desc="Stem detail" expr={<>Full stem calculation: see the stem rows in the checks summary below.</>} />
      <SectionHead title="Footing (ACI 318 strength design, 1.6H)" />
      <TR
        desc="Reinforcement"
        expr={
          <>
            Bottom {f.bottom.size} @ {f0(f.bottom.spacing)} in = {f3(r.footing.AsBot)} in²/ft, d = {f2(tg.dBot)} in; top{" "}
            {f.top.size} @ {f0(f.top.spacing)} in = {f3(r.footing.AsTop)} in²/ft, d = {f2(tg.dTop)} in; both full width;
            f'<sub>c</sub> = {f0(f.fc)} psi; f<sub>y</sub> = {f0(f.fy)} psi
          </>
        }
      />
      <DataTable
        caption="Footing actions per strength combination (moments per foot; toe + = bottom tension, heel − = top tension)"
        head={[
          "Combination",
          "P_u (lb/ft)",
          "x̄ (ft)",
          "M_u toe (lb-in)",
          "V_u toe (lb)",
          "M_u heel (lb-in)",
          "V_u heel (lb)",
        ].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right", "right"]}
        small
        rows={r.footing.rows.map((x) => [
          x.combo.label,
          f0(x.Pu),
          f3(x.xbar),
          f0(x.MuToe),
          f0(x.VuToe),
          f0(x.MuHeel),
          f0(x.VuHeel),
        ])}
      />
      <SubHead title="Toe — cantilever from the front face of the stem" />
      {f.toe > 0 ? (
        <>
          <TR
            desc="Flexure"
            expr={
              <>
                M<sub>u</sub> = ∫ (q<sub>u</sub> − w<sub>u</sub>)(x<sub>f</sub> − x) dx = {f0(tg.MuPos.Mu)} lb-in/ft ≤
                φM
                <sub>n</sub> = {f0(tg.phiMnBot)} lb-in/ft (bottom bars, {tg.MuPos.combo})
              </>
            }
            pass={tg.MuPos.Mu <= tg.phiMnBot}
          />
          <TR
            desc="Shear at d"
            expr={
              <>
                V<sub>u</sub> = {f0(tg.Vu.Vu)} lb/ft ≤ φV<sub>c</sub> = {f0(tg.phiVc)} lb/ft ({tg.Vu.combo})
              </>
            }
            pass={tg.Vu.Vu <= tg.phiVc}
          />
        </>
      ) : (
        <TR desc="Toe" expr={<>No toe</>} />
      )}
      <SubHead title="Heel — cantilever from the back face of the stem" />
      <TR
        desc="Flexure"
        expr={
          <>
            M<sub>u</sub> = ∫ (w<sub>u</sub> − q<sub>u</sub>)(x − x<sub>b</sub>) dx = {f0(-hg.MuNeg.Mu)} lb-in/ft ≤ φM
            <sub>n</sub> = {f0(hg.phiMnTop)} lb-in/ft (top bars, {hg.MuNeg.combo})
          </>
        }
        pass={-hg.MuNeg.Mu <= hg.phiMnTop}
      />
      <TR
        desc="Shear at the face"
        expr={
          <>
            V<sub>u</sub> = {f0(hg.Vu.Vu)} lb/ft ≤ φV<sub>c</sub> = {f0(hg.phiVc)} lb/ft ({hg.Vu.combo})
          </>
        }
        pass={hg.Vu.Vu <= hg.phiVc}
      />
      <SubHead title="Minimum reinforcement and development" />
      <TR
        desc="A_s,min"
        expr={
          <>
            0.0018 × 12 × {f1(f.h)} = {f3(r.footing.AsMin)} in²/ft ≤ bottom {f3(r.footing.AsBot)}, top{" "}
            {f3(r.footing.AsTop)} in²/ft (7.6.1.1)
          </>
        }
        pass={r.footing.AsMin <= Math.min(r.footing.AsBot, r.footing.AsTop)}
      />
      <TR
        desc="Longitudinal"
        expr={
          <>
            ({f.longitudinal.count}) {f.longitudinal.size} = {f3(r.longitudinal.As)} in² ≥ 0.0018 × {f1(r.geo.B * 12)} ×{" "}
            {f1(f.h)} = {f3(r.longitudinal.req)} in²; spacing {f1(r.longitudinal.spacing)} in ≤{" "}
            {f1(r.longitudinal.maxSpacing)} in (24.4.3)
          </>
        }
        pass={r.longitudinal.As >= r.longitudinal.req && r.longitudinal.spacing <= r.longitudinal.maxSpacing}
      />
      <TR
        desc="Stem dowels"
        expr={
          <>
            {r.dowel.size} standard hook: ℓ<sub>dh</sub> = f<sub>y</sub> ψ<sub>e</sub> ψ<sub>r</sub> ψ<sub>o</sub> ψ
            <sub>c</sub> / (55 √f'<sub>c</sub>) d<sub>b</sub>
            <sup>1.5</sup> ≥ max(8d<sub>b</sub>, 6 in) = {f2(r.dowel.ldh)} in (ψ<sub>r</sub> {f2(r.dowel.psi.r)}, ψ
            <sub>c</sub> {f3(r.dowel.psi.c)}) ≤ h<sub>f</sub> − cover − d<sub>b,bot</sub> = {f2(r.dowel.avail)} in
            (25.4.3)
          </>
        }
        pass={r.dowel.ldh <= r.dowel.avail}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Retaining wall", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Stability", r.stability.map((x) => `${x.label}: FS sliding ${f2(x.FSs)}, OT ${f2(x.FSo)}`).join("; ")],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "Level backfill and a vertical back face are assumed; sloping backfill, shear keys, counterforts and hydrostatic pressure are not covered.",
          "Global (slope) stability, settlement and frost depth are geotechnical items.",
          "Backfill compaction, drainage and waterproofing are specified on the drawings.",
        ]}
      />
    </Frame>
  );
}

export function GuardPostSheet({ m, r, index, total }: SheetProps<GuardPostResult>) {
  const g = r.input;
  const fct = r.factors;
  return (
    <Frame
      m={m}
      r={r}
      title={`Deck guard post (ANSI/AWC ${m.cycle.nds}, ${m.cycle.aisc360})`}
      subtitle={
        <>
          Guard post bolted to the rim — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            ANSI/AWC {m.cycle.nds} Ch. 3, 4, 12; {m.cycle.aisc360} Ch. J3 (bolt tension, Table J3.2)
          </>
        }
        combos={<>L only, C_D = 1.0</>}
      />
      <SectionHead title="Post and attachment" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Post"
        expr={
          <>
            {g.post.size} {g.post.species} {g.post.grade} ({r.tableLabel}): b = {f2(r.section.b)} in; d ={" "}
            {f2(r.section.d)} in; S = {f3(r.section.S)} in³; A = {f2(r.section.A)} in²
          </>
        }
      />
      <TR
        desc="Geometry"
        expr={
          <>
            Guard height {f1(g.guardHeight)} in; deck surface to the top bolt {f2(g.topBolt)} in; bolt spacing s ={" "}
            {f2(g.s)} in; H<sub>1</sub> = {f1(g.guardHeight)} + {f2(g.topBolt)} = {f2(r.H1)} in
          </>
        }
      />
      <LoadLines lines={r.loadLines} title="Guard load" />
      <SectionHead title="Forces (rotation about the lower bolt)" />
      <TR
        desc="Moment"
        expr={
          <>
            M = P H<sub>1</sub> = {f0(r.P)} × {f2(r.H1)} = {f0(r.M)} lb-in at the top bolt
          </>
        }
      />
      <TR
        desc="Top-bolt tension"
        expr={
          <>
            T = P (H<sub>1</sub> + s) / s = {f0(r.P)} × ({f2(r.H1)} + {f2(g.s)}) / {f2(g.s)} = {f0(r.T)} lb
          </>
        }
      />
      <TR
        desc="Shear"
        expr={
          <>
            V = max(P, P H<sub>1</sub> / s) = {f0(r.V)} lb
          </>
        }
      />
      <SectionHead title="Adjustment factors" />
      <TR
        desc="Factors"
        expr={
          <>
            C<sub>D</sub> = {f2(fct.CD)}; C<sub>M</sub> = {f2(fct.CMb)} (F<sub>b</sub>), {f2(fct.CMv)} (F<sub>v</sub>),{" "}
            {f2(fct.CMp)} (F<sub>c⊥</sub>); C<sub>F</sub> = {f2(fct.CF)}; C<sub>i</sub> = {f2(fct.Ci)}; C<sub>L</sub> =
            1.00; C<sub>b</sub> = {f3(fct.Cb)}
          </>
        }
      />
      <SectionHead title="Checks" />
      <TR
        desc="Bending"
        expr={
          <>
            f<sub>b</sub> = M / S = {f0(r.Fb.fb)} psi ≤ F'<sub>b</sub> = {f0(r.Fb.ref)} × C<sub>D</sub> C<sub>M</sub> C
            <sub>F</sub> C<sub>i</sub> = {f0(r.Fb.prime)} psi
          </>
        }
        pass={r.Fb.fb <= r.Fb.prime}
      />
      <TR
        desc="Shear"
        expr={
          <>
            f<sub>v</sub> = 1.5 V / A = {f0(r.Fv.fv)} psi ≤ F'<sub>v</sub> = {f0(r.Fv.prime)} psi
          </>
        }
        pass={r.Fv.fv <= r.Fv.prime}
      />
      <TR
        desc="Washer bearing"
        expr={
          <>
            {f2(g.washer)} in square plate washer, A<sub>w</sub> = {f3(r.Fp.Aw)} in²; f<sub>c⊥</sub> = T / A<sub>w</sub>{" "}
            = {f0(r.Fp.fp)} psi ≤ F'<sub>c⊥</sub> = {f0(r.Fp.ref)} × C<sub>M</sub> C<sub>b</sub> = {f0(r.Fp.prime)} psi
          </>
        }
        pass={r.Fp.fp <= r.Fp.prime}
      />
      <TR
        desc="Bolt tension"
        expr={
          <>
            R<sub>n</sub>/Ω = 0.75 F<sub>u</sub> A<sub>b</sub> / 2.00 = 0.75 × {f0(g.bolt.Fu)} × {f3(r.bolt.Ab)} / 2.00
            = {f0(r.bolt.allow)} lb ≥ T = {f0(r.T)} lb
          </>
        }
        pass={r.T <= r.bolt.allow}
      />
      <TR
        desc="Tension device"
        expr={
          <>
            {g.device.model}: {f0(g.device.capacity)} lb ({g.device.source}) ≥ T = {f0(r.T)} lb
          </>
        }
        pass={r.T <= g.device.capacity}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Guard post", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "The tension device connects the top bolt to a deck joist or blocking; the joist / blocking and its fasteners are part of the device installation.",
          "Rails, balusters and infill (50 lb on 1 ft², IRC Table R301.5) are not checked here.",
        ]}
      />
    </Frame>
  );
}

export function CfsWallSheet({ m, r, index, total, received, connections }: SheetProps<CfsWallResult>) {
  const w = r.input;
  const s = r.section;
  return (
    <Frame
      m={m}
      r={r}
      title={`Cold-formed steel stud wall (AISI S100, ${m.cycle.asce7} ASD)`}
      subtitle={
        <>
          Studs from the manufacturer / SSMA load table, axial + wind — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={<>AISI S100-16 §H1.2 (combined), AISI S240; allowable strengths from the stud load table</>}
        combos={<>{m.cycle.asce7} §2.4 (ASD)</>}
      />
      <SectionHead title="Stud" />
      <TR desc="Mark" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Section"
        expr={
          <>
            {w.designation}: web D = {f3(s.D)} in; flange B = {f3(s.B)} in; lip d = {f3(s.d)} in; design thickness t ={" "}
            {s.t.toFixed(4)} in (SSMA, {s.mils} mil); F<sub>y</sub> = {f0(w.Fy / 1000)} ksi; E = 29,500 ksi
          </>
        }
      />
      <TR
        desc="Gross properties"
        expr={
          <>
            A = {f3(s.A)} in²; I<sub>x</sub> = {f3(r.Ix)} in⁴{" "}
            {w.IxTable ? "(load table)" : "(linear method, inside radius 1.5t)"}
          </>
        }
      />
      <TR
        desc="Wall"
        expr={
          <>
            Height H = {f2(w.height)} ft; spacing s = {f0(w.spacing)} in o.c.; K = {f2(w.K)}
          </>
        }
      />
      <SectionHead title="Allowable strengths (load table)" />
      <TR
        desc="Table values"
        expr={
          <>
            P<sub>a</sub> = {f0(w.table.Pa)} lb; M<sub>a</sub> = {f0(w.table.Ma)} lb-in
            {w.table.Va ? `; V_a = ${f0(w.table.Va)} lb` : ""}
            {w.table.Pwc ? `; web crippling ${f0(w.table.Pwc)} lb` : ""} ({w.table.source})
          </>
        }
      />
      <LoadPath received={received} connections={connections} />
      <LoadLines lines={r.loadLines} />
      <TR
        desc="Per stud"
        expr={
          <>
            P<sub>D</sub> = {f0(r.perStud.D)} lb; P<sub>L</sub> = {f0(r.perStud.L)} lb; P<sub>Lr</sub> ={" "}
            {f0(r.perStud.Lr)} lb; P<sub>S</sub> = {f0(r.perStud.S)} lb; w<sub>W</sub> = {f1(r.w)} plf
          </>
        }
      />
      <SectionHead title="Combinations" />
      <TR
        desc="Euler load"
        expr={
          <>
            P<sub>e</sub> = π² E I<sub>x</sub> / (K H)² = {f0(r.Pe)} lb; B<sub>1</sub> = 1 / (1 − 1.6 P / P<sub>e</sub>)
          </>
        }
      />
      <DataTable
        caption="Per ASD combination"
        head={["Combination", "P (lb)", "M (lb-in)", "V (lb)", "B_1", "P/P_a + B_1 M/M_a"].map((h) => rich(h))}
        align={["left", "right", "right", "right", "right", "right"]}
        small
        rows={r.rows.map((x) => [x.combo.label, f0(x.P), f0(x.M), f0(x.V), f3(x.B1), f3(x.ratio)])}
      />
      <TR
        desc="Combined (H1.2)"
        expr={
          <>
            {f0(r.gov.P)} / {f0(w.table.Pa)} + {f3(r.gov.B1)} × {f0(r.gov.M)} / {f0(w.table.Ma)} = {f3(r.gov.ratio)} ≤
            1.00 ({r.gov.combo.label})
          </>
        }
        pass={r.gov.ratio <= 1}
      />
      {w.W ? (
        <TR
          desc="Deflection"
          expr={
            <>
              Δ = 5 ({f2(w.deflWindFactor)} w<sub>W</sub>) H⁴ / (384 E I<sub>x</sub>) = {f3(r.defl.d)} in ≤ H /{" "}
              {f0(w.deflLimit)} = {f3(r.defl.allow)} in
            </>
          }
          pass={r.defl.d <= r.defl.allow}
        />
      ) : null}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Studs", r.callout],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)}`],
          ["Field / EOR verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <LimitationNotes
        notes={[
          "The section strength (effective width, distortional and global buckling) is the load table's; HouseCalc checks the demands against it and adds the second-order amplification.",
          "Tracks, track-to-structure fasteners, bridging and headers / jambs at openings are detailed per AISI S240 and the manufacturer.",
        ]}
      />
    </Frame>
  );
}
