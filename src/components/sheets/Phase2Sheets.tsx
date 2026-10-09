/**
 * Phase 2 member sheets — stud bearing walls, posts, imported trusses,
 * connectors, footings and shear walls — in the same Tedds-style layout as
 * the Phase 1 member sheets.
 */

import type React from "react";
import { fmt, fmtFtIn, fmtInFraction } from "@/engine/core/fmt";
import type { ConnectorResult } from "@/engine/members/connector";
import type { FootingResult } from "@/engine/members/footing";
import type { PostResult } from "@/engine/members/post";
import type { ShearWallResult } from "@/engine/members/shearWall";
import type { TrussResult } from "@/engine/members/truss";
import type { StudCheck, WallResult } from "@/engine/members/wall";
import { hardwareLabel } from "@/engine/data/hardware";
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
} from "./blocks";
import { AxialRows, ColumnComboTable, CombinedRows, SectionRows } from "./ColumnRows";

const psi = (v: number, d = 1) => `${fmt(v, d)} lb/in²`;

interface SheetProps<R> {
  m: SheetMeta;
  r: R;
  index: number;
  total: number;
  received: string[];
  connections?: string[];
}

function Frame({
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

function verifyText(r: { assumptions: Array<{ verify?: boolean; item: string }> }) {
  const v = r.assumptions.filter((a) => a.verify);
  return v.length ? <Flag key="f">{v.map((a) => a.item).join("; ")}</Flag> : "None";
}

function LoadPathRows({ received, extra }: { received: string[]; extra?: React.ReactNode }) {
  return (
    <>
      <SectionHead title="Load path" />
      <TR desc="Loads received from" expr={<>{received.length ? received.join("; ") : "— (entered loads only)"}</>} />
      {extra}
    </>
  );
}

function BearingPlateRows({ sc }: { sc: StudCheck }) {
  const b = sc.bearing;
  return (
    <>
      <TR
        desc="Maximum compression on the plate"
        expr={
          <>
            P{eq(`${f0(b.P)} lb`)} ({b.combo})
          </>
        }
      />
      <TR
        desc="Bearing area factor — NDS 3.10.4"
        expr={
          <>
            C<sub>b</sub> = (l<sub>b</sub> + 0.375) / l<sub>b</sub> = ({f2(b.lb)} + 0.375) / {f2(b.lb)}
            {eq(f3(b.Cb))}
            {b.Cb === 1 ? " (bearing within 3 in. of the plate end)" : ""}
          </>
        }
      />
      <TR
        desc="Bearing stress / adjusted F_c⊥'"
        expr={
          <>
            f<sub>c⊥</sub> = P / (b × d) = {f0(b.P)} / ({f3(sc.mat.b)} × {f3(sc.mat.d)}) = {f1(b.fcperp)} lb/in² ; F
            <sub>c⊥</sub>' = F<sub>c⊥</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>b</sub>
            {eq(psi(b.Fprime))}
          </>
        }
        pass={b.ratio <= 1}
      />
    </>
  );
}

function StudBlock({ r, sc, title }: { r: WallResult; sc: StudCheck; title: string }) {
  const col = sc.col;
  return (
    <>
      <SectionHead title={title} />
      <TR
        desc="Axial load by type (per member)"
        expr={
          <>
            {(["D", "L", "Lr", "S", "W"] as const)
              .filter((t) => Math.abs(sc.P[t]) > 0.5)
              .map((t) => `P${t} = ${f0(sc.P[t])} lb`)
              .join("; ") || "—"}
          </>
        }
      />
      {sc.windPlf > 0 ? (
        <TR
          desc="Out-of-plane wind (strength level)"
          expr={
            <>
              w<sub>W</sub>
              {eq(`${f1(sc.windPlf)} lb/ft`)} on l = {f3(r.studLength)} ft
            </>
          }
        />
      ) : null}
      <ColumnComboTable col={col} caption={`${sc.label} — ASD combinations (ASCE 7 §2.4)`} />
      <AxialRows
        m={sc.mat}
        col={col}
        row={col.axialGov}
        le1={r.le1}
        le2={r.le2}
        title="Axial compression — NDS 3.6, 3.7"
      />
      {col.governing.fb > 0 ? (
        <CombinedRows m={sc.mat} col={col} row={col.governing} title="Combined axial and bending — NDS 3.9.2" />
      ) : null}
      <SubHead title="Bearing on the plate — NDS 3.10.2" />
      <BearingPlateRows sc={sc} />
    </>
  );
}

export function WallSheet({ m, r, index, total, received, connections }: SheetProps<WallResult>) {
  const w = r.input;
  return (
    <Frame
      m={m}
      r={r}
      title={`Wood stud bearing wall design (${m.cycle.nds})`}
      subtitle={
        <>
          In accordance with ANSI/AWC {m.cycle.nds} using the ASD method — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={<>ANSI/AWC {m.cycle.nds} and Supplement</>}
        tables={[r.typical.mat.tableId, "ibc-1604.3", "asce7-30.3-1"]}
      />
      <SectionHead title="Configuration & geometry" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {w.description ? <TR desc="Description" expr={<>{w.description}</>} /> : null}
      <TR desc="Wall length" expr={<>L{eq(`${f2(w.length)} ft`)}</>} />
      <TR desc="Plate height (floor to top of top plates)" expr={<>H{eq(`${f2(w.plateHeight)} ft`)}</>} />
      <TR
        desc="Stud length between plates"
        expr={
          <>
            l = H − {w.topPlates + w.bottomPlates} × 1.5 in{eq(`${f3(r.studLength)} ft (${f1(r.studLength * 12)} in)`)}
          </>
        }
      />
      <TR desc="Stud spacing" expr={<>s{eq(`${fmt(w.spacing, w.spacing % 1 ? 1 : 0)} in`)}</>} />
      <TR
        desc="Effective lengths — NDS 3.7.1.2 (K_e = 1.0)"
        expr={
          <>
            l<sub>e1</sub> = {f1(r.le1)} in (strong axis); l<sub>e2</sub> ={" "}
            {r.le2 > 0 ? `${f1(r.le2)} in (weak axis)` : "0 — braced by sheathing"}
          </>
        }
      />
      <TR
        desc="Sheathing"
        expr={<>{w.sheathing === "both" ? "Both faces" : w.sheathing === "one" ? "One face" : "None"}</>}
      />
      <SectionHead title="Material" />
      <SectionRows m={r.typical.mat} />
      <TR
        desc="Repetitive member factor (NDS 4.3.9)"
        expr={
          <>
            C<sub>r</sub>
            {eq(f2(r.typical.col.Cr))} (bending only)
          </>
        }
      />
      <LoadLines lines={r.loadLines} title="Applied loading (along the wall)" />
      {r.segments.length > 1 ? (
        <DataTable
          caption="Line load segments along the wall (excluding wall self weight), lb/ft"
          head={["From (ft)", "To (ft)", "D", "L", "Lr", "S", "W"]}
          align={["right", "right", "right", "right", "right", "right", "right"]}
          small
          rows={r.segments.map((s) => [f2(s.x1), f2(s.x2), f1(s.w.D), f1(s.w.L), f1(s.w.Lr), f1(s.w.S), f1(s.w.W)])}
        />
      ) : null}
      {r.wind ? (
        <>
          <SectionHead title="Out-of-plane wind — components and cladding" />
          <TR desc="Source" expr={<>{r.wind.source}</>} />
          <TR desc="Effective wind area" expr={<>A = l × max(s, l / 3){eq(`${f1(r.wind.A)} ft²`)}</>} />
          {r.wind.GCp ? (
            <TR
              desc={`GCp, zone ${r.wind.zone} (Fig. 30.3-1)`}
              expr={
                <>
                  +{f3(r.wind.GCp.pos)} / {f3(r.wind.GCp.neg)}; GC<sub>pi</sub> = ±0.18
                </>
              }
            />
          ) : null}
          <TR desc="Design pressure (strength level)" expr={<>p{eq(`${f2(r.wind.p)} psf`)}</>} />
        </>
      ) : (
        <TextRow italic>No out-of-plane wind on this wall (interior wall or wind not applied).</TextRow>
      )}
      <LoadPathRows received={received} />
      <ReactionTable
        reactions={r.reactions}
        perFoot
        title="Reactions delivered at the base (unfactored, by load type)"
      />
      <StudBlock r={r} sc={r.typical} title={`${r.typical.label} — ${r.typical.mat.label}`} />
      {r.packs.map((p) => (
        <StudBlock
          key={p.label}
          r={r}
          sc={p}
          title={`${p.label} — (${p.n}) ${r.input.size} stud pack, ${p.mat.label}`}
        />
      ))}
      {r.kings.map((p) => (
        <StudBlock key={p.label} r={r} sc={p} title={`${p.label} — wind from half the opening`} />
      ))}
      {r.wind ? (
        <>
          <SectionHead title="Out-of-plane deflection — IBC Table 1604.3" />
          <TR
            desc="Service wind on the stud (0.42 × C&C)"
            expr={<>w = 0.42 × p × s{eq(`${f2(r.deflection.w)} lb/ft`)}</>}
          />
          <TR
            desc="First-order deflection"
            expr={
              <>
                δ<sub>0</sub> = 5 w l⁴ / (384 E' I){eq(`${f3(r.deflection.delta0)} in`)}
              </>
            }
          />
          <TR
            desc="P-Δ amplification"
            expr={
              <>
                1 / (1 − P / P<sub>cr</sub>) with P = {f0(r.deflection.P)} lb, P<sub>cr</sub> = π² E' I / l<sub>e</sub>²
                = {f0(r.deflection.Pcr)} lb{eq(f3(r.deflection.amp))}
              </>
            }
          />
          <TR
            desc={`Deflection vs l / ${w.deflN}`}
            expr={
              <>
                δ = {f3(r.deflection.delta)} in ≤ {f3(r.deflection.limit)} in
              </>
            }
            pass={r.deflection.ratio <= 1}
          />
        </>
      ) : null}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Selected wall", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          [
            "Plates",
            `(${w.bottomPlates}) bottom, (${w.topPlates}) top plates, ${w.size} ${w.species}; lap top plates 48 in. min.`,
          ],
          [
            "Stud packs",
            r.packs.length ? r.packs.map((p) => `(${p.n}) ${w.size} at ${fmtFtIn(p.x ?? 0)}`).join("; ") : "None",
          ],
          [
            "Openings",
            w.openings.length
              ? w.openings.map((o) => `${o.label}: (${o.kings}) king studs each side`).join("; ")
              : "None",
          ],
          [
            "Governing check",
            `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"} (${r.governing.combo})`,
          ],
          ["Base load to foundation", `${f0(r.reactions[0].maxDown)} lb/ft max (${r.reactions[0].maxDownCombo})`],
          [
            "Connections",
            connections?.length ? connections.join("; ") : "Stud-to-plate nailing per CBC Table 2304.10.2",
          ],
          ["Field verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Each ASCE 7 §2.4 ASD combination checked with its C_D; wind acts out of plane on the studs only in the wind combinations.",
          "Studs are pinned at the plates; the governing segment of the wall is checked for the typical stud.",
          "In-plane shear (shear-wall action) is checked on the shear wall sheets.",
        ]}
      />
    </Frame>
  );
}

export function PostSheet({ m, r, index, total, received, connections }: SheetProps<PostResult>) {
  const p = r.input;
  const col = r.col;
  return (
    <Frame
      m={m}
      r={r}
      title={`Wood post design (${m.cycle.nds})`}
      subtitle={
        <>
          In accordance with ANSI/AWC {m.cycle.nds} using the ASD method — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>ANSI/AWC {m.cycle.nds} and Supplement</>} tables={[r.mat.tableId]} />
      <SectionHead title="Configuration & geometry" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {p.description ? <TR desc="Description" expr={<>{p.description}</>} /> : null}
      <TR desc="Unbraced height" expr={<>l{eq(`${f2(p.height)} ft`)}</>} />
      <TR
        desc="Effective lengths (K_e)"
        expr={
          <>
            K<sub>e</sub> = {f2(p.Ke)}; l<sub>e1</sub> = {f1(r.le1)} in (about d); l<sub>e2</sub> = {f1(r.le2)} in
            (about b)
          </>
        }
      />
      {p.eccentricity ? (
        <TR desc="Load eccentricity (strong axis)" expr={<>e{eq(`${f2(p.eccentricity)} in`)}</>} />
      ) : null}
      {p.wind ? (
        <TR
          desc="Wind on exposed post (strength level)"
          expr={
            <>
              w = {f1(p.wind.psf)} psf × {f2(p.wind.width)} ft{eq(`${f1(p.wind.psf * p.wind.width)} lb/ft`)}
            </>
          }
        />
      ) : null}
      <SectionHead title="Material" />
      <SectionRows m={r.mat} />
      <LoadLines lines={r.loadLines} />
      <LoadPathRows received={received} />
      <ReactionTable reactions={r.reactions} title="Reaction delivered at the base (unfactored, by load type)" />
      <SectionHead title="Compression member — NDS 3.6, 3.7" />
      <ColumnComboTable col={col} caption="ASD load combinations (ASCE 7 §2.4)" />
      <AxialRows m={r.mat} col={col} row={col.axialGov} le1={r.le1} le2={r.le2} title="Axial compression" />
      {col.governing.fb > 0 ? (
        <CombinedRows m={r.mat} col={col} row={col.governing} title="Combined bending and axial compression" />
      ) : null}
      <SectionHead title="Bearing — NDS 3.10" />
      <TR
        desc="End-grain bearing — NDS 3.10.1"
        expr={
          <>
            f<sub>c</sub> = {f1(r.endGrain.fc)} lb/in² ≤ F<sub>c</sub>* = {f1(r.endGrain.FcStar)} lb/in² (
            {r.endGrain.combo})
          </>
        }
        pass={r.endGrain.ratio <= 1}
      />
      <TR
        desc="Steel bearing plate (NDS 3.10.1.3)"
        expr={
          <>
            {r.endGrain.plateRequired ? <Flag>Required — f_c &gt; 0.75 F_c*</Flag> : "Not required (f_c ≤ 0.75 F_c*)"}
          </>
        }
      />
      {r.bearingPerp ? (
        <TR
          desc={`Bearing on ${r.bearingPerp.support} — NDS 3.10.2`}
          expr={
            <>
              f<sub>c⊥</sub> = P / A = {f1(r.bearingPerp.fcperp)} lb/in²; F<sub>c⊥</sub>' = {f0(r.bearingPerp.Fcperp)} ×
              C<sub>b</sub> {f3(r.bearingPerp.Cb)} = {f1(r.bearingPerp.Fprime)} lb/in²
            </>
          }
          pass={r.bearingPerp.ratio <= 1}
        />
      ) : (
        <TR
          desc="Bearing below"
          expr={<>{p.bearing.on === "concrete" ? "Post base on concrete (connector schedule)" : "Steel bearing"}</>}
        />
      )}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Selected post", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          ["Material", r.mat.speciesLabel],
          [
            "Governing check",
            `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"} (${r.governing.combo})`,
          ],
          [
            "Base reaction (max down / min net)",
            `${f0(r.reactions[0].maxDown)} lb (${r.reactions[0].maxDownCombo}) / ${f0(r.reactions[0].minNet)} lb`,
          ],
          ["Cap / base hardware", connections?.length ? connections.join("; ") : "Per connector schedule"],
          ["Field verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes notes={["Post ends held in position by the cap and base hardware (NDS 3.7.1.2)."]} />
    </Frame>
  );
}

export function TrussSheet({ m, r, index, total, connections }: SheetProps<TrussResult>) {
  const t = r.input;
  return (
    <Frame
      m={m}
      r={r}
      title="Prefabricated wood truss — imported reactions"
      subtitle={
        <>
          Deferred submittal; reactions from the truss design drawings — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>ANSI/TPI 1; ANSI/AWC {m.cycle.nds} (bearing)</>} />
      <SectionHead title="Truss data" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {t.description ? <TR desc="Description" expr={<>{t.description}</>} /> : null}
      <TR desc="Span" expr={<>{fmtFtIn(t.span)}</>} />
      <TR
        desc={t.girder ? "Girder plies" : "Spacing"}
        expr={<>{t.girder ? `${t.plies}-ply girder` : `${fmt(t.spacing, 0)} in. o.c.`}</>}
      />
      <TR desc="Truss design reference" expr={t.designRef ? <>{t.designRef}</> : <Flag>Not entered — VERIFY</Flag>} />
      <LoadLines lines={r.loadLines} title="Reactions per truss (truss design drawings)" />
      <ReactionTable
        reactions={r.reactions}
        perFoot={!t.girder}
        title="Reactions delivered (unfactored, by load type)"
      />
      <SectionHead title="Bearing on the wall plate — NDS 3.10.2" />
      {r.bearingChecks.map((b) => (
        <TR
          key={b.name}
          desc={`Bearing ${b.name}: R = ${f0(b.R)} lb (${b.combo})`}
          expr={
            <>
              f<sub>c⊥</sub> = R / ({f2(b.lb)} × plate width) = {f1(b.fcperp)} lb/in² ≤ F<sub>c⊥</sub> × C<sub>b</sub> ={" "}
              {f1(b.Fprime)} lb/in²
            </>
          }
          pass={b.ratio <= 1}
        />
      ))}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <FinalSummary
        rows={[
          ["Truss", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          [
            "Uplift",
            r.reactions.some((x) => x.minNet < -1)
              ? `Net uplift up to ${f0(-Math.min(...r.reactions.map((x) => x.minNet)))} lb per truss`
              : "None",
          ],
          ["Connections", connections?.length ? connections.join("; ") : "Truss-to-plate ties per connector schedule"],
          ["Field verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes notes={["Truss members, plates and bracing are designed by the truss manufacturer."]} />
    </Frame>
  );
}

export function ConnectorSheet({ m, r, index, total }: SheetProps<ConnectorResult>) {
  const h = r.item;
  return (
    <Frame
      m={m}
      r={r}
      title="Connector design — catalogue allowable loads"
      subtitle={
        <>
          Checked for every ASD combination with its load-duration column — member {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis m={m} material={<>Manufacturer catalogue / ICC-ES evaluation report</>} tables={["hardware"]} />
      <SectionHead title="Connector" />
      <TR desc="Mark / location" expr={<B>{`${r.mark} — ${r.callout}`}</B>} />
      <TR
        desc="Product"
        expr={
          <>
            {hardwareLabel(h)} — {h.description}
          </>
        }
      />
      <TR desc="Fasteners" expr={<>{h.fasteners}</>} />
      <TR desc="Evaluation report" expr={<>{h.report || <Flag>Not entered</Flag>}</>} />
      <TR
        desc="Allowable loads (DF-L / SP)"
        expr={
          <>
            {h.down
              ? `Down: ${Object.entries(h.down)
                  .map(([k, v]) => `${v} lb (${k})`)
                  .join(", ")}`
              : "Down: —"}
            {h.uplift !== undefined ? `; uplift ${h.uplift} lb (160)` : ""}
            {h.F1 !== undefined ? `; F1 ${h.F1} lb` : ""}
            {h.tension !== undefined ? `; tension ${h.tension} lb (160)` : ""}
            {h.checked ? "" : <Flag> — VERIFY against the current catalogue</Flag>}
          </>
        }
      />
      <LoadLines lines={r.loadLines} title="Reaction carried (unfactored, by load type)" />
      <DataTable
        caption="Demand vs capacity per ASD combination"
        head={["Combination", "C_D", "Direction", "Demand (lb)", "Capacity (lb)", "D/C"]}
        align={["left", "right", "left", "right", "right", "right"]}
        small
        rows={r.rows.map((x) => [x.combo, f2(x.CD), x.direction, f0(x.R), f0(x.capacity), f3(x.ratio)])}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Catalogue values apply only with all specified fasteners installed and the framing sizes listed by the manufacturer.",
        ]}
      />
    </Frame>
  );
}

export function FootingSheet({ m, r, index, total, received }: SheetProps<FootingResult>) {
  const f = r.input;
  const c = r.concrete;
  const strip = f.type === "strip";
  const per = strip ? " per ft" : "";
  const u = strip ? "lb/ft" : "lb";
  return (
    <Frame
      m={m}
      r={r}
      title={`Foundation analysis & design (${m.cycle.aci318})`}
      subtitle={
        <>
          {strip ? "Continuous footing, analysed per foot of wall" : "Pad footing"} — member {index} of {total}:{" "}
          {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.aci318}; {m.cycle.building} Chapter 18
          </>
        }
        tables={["ibc-1806.2", "ibc-1809.7"]}
      />
      <SectionHead title="Footing geometry" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {f.description ? <TR desc="Description" expr={<>{f.description}</>} /> : null}
      <TR
        desc={strip ? "Width × thickness" : "B × L × thickness"}
        expr={
          <>
            {strip
              ? `${f1(f.B * 12)} in × ${f1(f.h)} in`
              : `${f1(f.B * 12)} in × ${f1((f.L ?? f.B) * 12)} in × ${f1(f.h)} in`}
            ; area{eq(`${f3(r.area)} ft²${per}`)}
          </>
        }
      />
      <TR desc="Depth of bottom below grade" expr={<>{f1(f.depth)} in</>} />
      <TR
        desc={strip ? (f.stem ? "Stem wall (width × height)" : "Wall bearing width") : "Post base / pier"}
        expr={
          <>
            {f.stem
              ? `${f1(f.stem.width)} in × ${f1(f.stem.height)} in`
              : strip
                ? `${f1(f.c1)} in`
                : `${f1(f.c1)} in × ${f1(f.c2 ?? f.c1)} in`}
          </>
        }
      />
      <TR
        desc="Concrete / reinforcement"
        expr={
          <>
            f'<sub>c</sub> = {f0(f.fc)} psi;{" "}
            {f.rebar
              ? `${f.rebar.size} ${strip ? `@ ${f1(f.rebar.spacing ?? 12)} in. transverse` : `(${f.rebar.count}) each way`}, f_y = ${f0(f.fy)} psi, cover ${f1(f.cover)} in`
              : "plain concrete (ACI 318 Ch. 14)"}
          </>
        }
      />
      <TR
        desc="Allowable soil pressure"
        expr={
          <>
            q<sub>a</sub>
            {eq(`${f0(f.qa)} psf`)} — {f.qaSource}
          </>
        }
      />
      <LoadLines lines={r.loadLines} title={`Loads on the footing (${strip ? "per ft" : "total"})`} />
      <LoadPathRows received={received} />
      <SectionHead title="Soil bearing — service loads (ASCE 7 §2.4)" />
      <DataTable
        caption={`Gross soil pressure per combination (footing, stem and soil weight included)`}
        head={["Combination", `P (${u})`, "q (psf)", "q / q_a"]}
        align={["left", "right", "right", "right"]}
        small
        rows={r.service.map((x) => [x.combo.label, f0(x.P), f0(x.q), f3(x.ratio)])}
      />
      <TR
        desc="Maximum soil pressure"
        expr={
          <>
            q<sub>max</sub> = P / A = {f0(r.serviceGov.P)} / {f3(r.area)}
            {eq(`${f0(r.serviceGov.q)} psf`)} ≤ q<sub>a</sub> = {f0(f.qa)} psf ({r.serviceGov.combo.label})
          </>
        }
        pass={r.serviceGov.ratio <= 1}
      />
      {r.uplift ? (
        <TR desc="Net uplift" expr={<Flag>{`${f0(-r.uplift.P)} ${u} (${r.uplift.combo})`}</Flag>} pass={false} />
      ) : (
        <TR desc="Uplift" expr={<>No net uplift (minimum P ≥ 0)</>} pass />
      )}
      <SectionHead
        title={`Concrete design — strength (ASCE 7 §2.3), ${c.plain ? "plain concrete, ACI 318 Ch. 14" : "ACI 318 Ch. 13, 22"}`}
      />
      <DataTable
        caption="Net factored soil pressure (footing and soil weight excluded)"
        head={["Combination", `P_u (${u})`, "q_u (psf)"]}
        align={["left", "right", "right"]}
        small
        rows={r.strength.map((x) => [x.combo.label, f0(x.Pu), f0(x.qu)])}
      />
      <TR
        desc="Governing"
        expr={
          <>
            q<sub>u</sub>
            {eq(`${f0(r.quGov.qu)} psf`)} ({r.quGov.combo.label})
          </>
        }
      />
      <TR desc="Cantilever from the face" expr={<>c{eq(`${f2(c.cantilever)} in`)}</>} />
      <SubHead title="Flexure" />
      <TR
        desc={`Ultimate moment at the face${per}`}
        expr={
          <>
            M<sub>u</sub> = q<sub>u</sub> × c² / 2{strip ? "" : " × L"}
            {eq(`${f1(c.Mu / 12)} lb-ft`)}
          </>
        }
      />
      {c.plain ? (
        <TR
          desc="Plain concrete — Eq. 14.5.2.1a (h reduced 2 in., 14.5.1.7)"
          expr={
            <>
              φM<sub>n</sub> = 0.60 × 5 √f'<sub>c</sub> S<sub>m</sub>, S<sub>m</sub> = b h<sub>eff</sub>² / 6, h
              <sub>eff</sub> = {f1(c.hEff)} in
              {eq(`${f1(c.phiMn / 12)} lb-ft`)}
            </>
          }
          pass={c.Mu <= c.phiMn}
        />
      ) : (
        <>
          <TR
            desc="Reinforcement and effective depth"
            expr={
              <>
                A<sub>s</sub> = {f3(c.As!)} in²{per}; d = h − cover − d<sub>b</sub>/2{eq(`${f3(c.d!)} in`)}
              </>
            }
          />
          <TR
            desc="Compression block / strain"
            expr={
              <>
                a = A<sub>s</sub> f<sub>y</sub> / (0.85 f'<sub>c</sub> b) = {f3(c.flex!.a)} in; ε<sub>t</sub> ={" "}
                {fmt(c.flex!.epsT, 5)}; φ = {f2(c.flex!.phi)}
              </>
            }
          />
          <TR
            desc="Design moment capacity — ACI 318 22.2"
            expr={
              <>
                φM<sub>n</sub> = φ A<sub>s</sub> f<sub>y</sub> (d − a/2){eq(`${f1(c.phiMn / 12)} lb-ft`)}
              </>
            }
            pass={c.Mu <= c.phiMn}
          />
          <TR
            desc="Minimum reinforcement (ACI 318 7.6.1.1)"
            expr={
              <>
                A<sub>s,min</sub> = 0.0018 b h = {f3(c.AsMin!)} in² ≤ {f3(c.As!)} in²
              </>
            }
            pass={c.As! >= c.AsMin!}
          />
        </>
      )}
      <SubHead title="One-way shear" />
      <TR
        desc={`At ${c.plain ? "h" : "d"} = ${f2(c.oneWay.at)} in from the face`}
        expr={
          <>
            V<sub>u</sub> = {f0(c.oneWay.Vu)} lb ≤ φV<sub>{c.plain ? "n" : "c"}</sub> = {f0(c.oneWay.phiVn)} lb{" "}
            {c.plain ? "(Eq. 14.5.5.1a, φ = 0.60)" : "(Table 22.5.5.1(c) with λs, φ = 0.75)"}
          </>
        }
        pass={c.oneWay.Vu <= c.oneWay.phiVn}
      />
      {c.twoWay ? (
        <>
          <SubHead title="Two-way (punching) shear" />
          <TR
            desc={`Critical perimeter at ${c.plain ? "h" : "d"} / 2`}
            expr={
              <>
                b<sub>o</sub> = {f1(c.twoWay.bo)} in; V<sub>u</sub> = {f0(c.twoWay.Vu)} lb ≤ φV = {f0(c.twoWay.phiVn)}{" "}
                lb
                {c.twoWay.vc ? ` (v_c = ${f1(c.twoWay.vc)} psi)` : ""}
              </>
            }
            pass={c.twoWay.Vu <= c.twoWay.phiVn}
          />
        </>
      ) : null}
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Footing", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"}`],
          ["Soil", `${f0(f.qa)} psf — ${f.qaSource}`],
          ["Field verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Concentric loading; footing, stem and soil weight included for bearing only.",
          "Lateral and overturning effects of shear walls are checked on the shear wall sheets.",
        ]}
      />
    </Frame>
  );
}

export function ShearWallSheet({ m, r, index, total }: SheetProps<ShearWallResult>) {
  const s = r.input;
  const d = r.demand;
  const col = r.compression.col;
  return (
    <Frame
      m={m}
      r={r}
      title={`Wood shear wall design (${m.cycle.sdpws})`}
      subtitle={
        <>
          In accordance with {m.cycle.sdpws}, ANSI/AWC {m.cycle.nds} (ASD) and the{" "}
          {r.ftao ? "force-transfer-around-openings method (SDPWS 4.3.5.2)" : "segmented shear wall method"} — member{" "}
          {index} of {total}: {r.mark}
        </>
      }
    >
      <DesignBasis
        m={m}
        material={
          <>
            {m.cycle.sdpws}; ANSI/AWC {m.cycle.nds}; {m.cycle.aci318} Ch. 17
          </>
        }
        tables={[...new Set(r.sides.map((x) => `sdpws-${x.row.table}`)), r.post.tableId, "hardware"]}
      />
      <SectionHead title="Panel details" />
      <TR desc="Member" expr={<B>{`${r.mark} — ${r.title}`}</B>} />
      {s.description ? <TR desc="Description" expr={<>{s.description}</>} /> : null}
      <TR
        desc="Wall line"
        expr={
          <>
            {d.lineName} — share of the line force {f1(d.share * 100)} %
          </>
        }
      />
      <TR
        desc="Panel height / length"
        expr={
          <>
            h = {f2(s.h)} ft;{" "}
            {r.ftao ? (
              "L"
            ) : (
              <>
                b<sub>s</sub>
              </>
            )}{" "}
            = {f3(s.b)} ft;{" "}
            {r.ftao ? (
              <>
                pier h<sub>o</sub> / L<sub>min</sub> = {f3(r.aspect)} (max {f1(r.maxAspect)})
              </>
            ) : (
              <>
                h / b<sub>s</sub> = {f3(r.aspect)} (max {f1(r.maxAspect)})
              </>
            )}
          </>
        }
        pass={r.aspect <= r.maxAspect}
      />
      <TR
        desc="Studs / end posts"
        expr={
          <>
            {s.stud.size} {s.stud.species} {s.stud.grade} @ {s.stud.spacing} in.; end posts ({s.endPost.plies}){" "}
            {s.endPost.size}, A = {f2(r.post.A)} in², net A<sub>en</sub> = {f2(r.Aen)} in² (
            {fmtInFraction(s.endPost.holeDia)} in. hole)
          </>
        }
      />
      <SectionHead title="Sheathing — nominal unit shear capacities" />
      {r.sides.map((x, i) => (
        <TR
          key={i}
          desc={`Side ${i + 1}: ${x.row.label}, ${x.row.nail} @ ${x.spacing} in. edges`}
          expr={
            <>
              SDPWS Table {x.row.table}: v<sub>s</sub> = {f0(x.vs)} plf; v<sub>w</sub> = {f0(x.vw)} plf; G<sub>a</sub> ={" "}
              {f1(x.Ga)} kips/in
              {x.override ? <Flag> (entered — VERIFY)</Flag> : null}
            </>
          }
        />
      ))}
      <TR
        desc="Combined nominal capacities (SDPWS-2021 4.3.5.4)"
        expr={
          <>
            v<sub>sc</sub> = {f0(r.vsc)} plf; v<sub>wc</sub> = {f0(r.vwc)} plf
            {r.windSum ? " (wind: wood structural panel + gypsum wallboard, additive — 4.3.3.2.1 exception)" : ""}; G
            <sub>ac</sub> = {f1(r.Gac)} kips/in
          </>
        }
      />
      <TR
        desc="Aspect ratio factor (SDPWS-2021 4.3.3.2)"
        expr={
          <>
            {rich(
              r.ftao
                ? r.aspect <= 2
                  ? "pier h_o / L ≤ 2: 1.00"
                  : `1.25 − 0.125 h_o / L = ${f3(r.Car)}`
                : r.aspect <= 2
                  ? "h / b_s ≤ 2: 1.00"
                  : `1.25 − 0.125 h / b_s = ${f3(r.Car)}`,
            )}
          </>
        }
      />
      <LoadLines lines={r.loadLines} title="Loading on the wall" />
      {r.ftao ? (
        <>
          <SectionHead title="Force transfer around opening — SDPWS 4.3.5.2 (Diekmann rational analysis, ASD)" />
          <TR
            desc="Geometry"
            expr={
              <>
                L = L<sub>1</sub> + L<sub>o</sub> + L<sub>2</sub> = {f2(r.ftao.L1)} + {f2(r.ftao.Lo)} + {f2(r.ftao.L2)}{" "}
                = {f2(s.b)} ft; h<sub>a</sub> = {f2(r.ftao.ha)} ft above, h<sub>o</sub> = {f2(r.ftao.ho)} ft opening, h
                <sub>b</sub> = {f2(r.ftao.hb)} ft below
              </>
            }
          />
          <TR
            desc="Pier aspect ratio"
            expr={
              <>
                h<sub>o</sub> / L<sub>min</sub> = {f2(r.ftao.ho)} / {f2(Math.min(r.ftao.L1, r.ftao.L2))} ={" "}
                {f3(r.ftao.pierAspect)} ≤ 3.5; C<sub>ar</sub> = {f3(r.Car)}
              </>
            }
            pass={r.ftao.pierAspect <= 3.5}
          />
          <DataTable
            caption="FTAO forces (ASD)"
            head={["Quantity", "Equation", "Seismic 0.7E", "Wind 0.6W"]}
            align={["left", "left", "right", "right"]}
            small
            rows={[
              ["Wall unit shear v (plf)", "V / L", f1(r.ftao.v.s), f1(r.ftao.v.w)],
              ["Pier unit shear v_p (plf)", "V / (L_1 + L_2)", f1(r.ftao.vp.s), f1(r.ftao.vp.w)],
              ["Hold-down force H (lb)", "V h / L", f0(r.ftao.H.s), f0(r.ftao.H.w)],
              ["Unit shear above / below opening v_ab (plf)", "H / (h_a + h_b)", f1(r.ftao.vab.s), f1(r.ftao.vab.w)],
              ["Strap force at opening corners F (lb)", "(v_p − v) × max(L_1, L_2)", f0(r.ftao.F.s), f0(r.ftao.F.w)],
            ].map((row) => row.map((c) => rich(c)))}
          />
          <TR
            desc="Unit shear, seismic"
            expr={
              <>
                max(v<sub>p</sub>, v<sub>ab</sub>) = {f1(r.vS)} plf ≤ v<sub>s,ASD</sub> C<sub>ar</sub> = {f1(r.vAllowS)}{" "}
                plf
              </>
            }
            pass={r.vS <= r.vAllowS}
          />
          <TR
            desc="Unit shear, wind"
            expr={
              <>
                max(v<sub>p</sub>, v<sub>ab</sub>) = {f1(r.vW)} plf ≤ v<sub>wc</sub> C<sub>ar</sub> / 2 ={" "}
                {f1(r.vAllowW)} plf
              </>
            }
            pass={r.vW <= r.vAllowW}
          />
          {r.ftao.strap ? (
            <TR
              desc={`Strap ${hardwareLabel(r.ftao.strap.item)} at head and sill`}
              expr={
                <>
                  F = {f0(r.ftao.strap.F)} lb ≤ {f0(r.ftao.strap.item.tension ?? 0)} lb allowable; strap continuous over
                  the opening and min. one pier length each side
                  {r.ftao.strap.item.checked ? "" : <Flag> — VERIFY</Flag>}
                </>
              }
              pass={r.ftao.strap.ratio <= 1}
            />
          ) : (
            <TR desc="Strap" expr={<Flag>Not selected</Flag>} />
          )}
        </>
      ) : (
        <>
          <SectionHead title="Unit shear — ASD (SDPWS-2021: seismic v / 2.0 wood-based panels, v / 2.8 gypsum; wind v / 2.0)" />
          <TR
            desc="Seismic"
            expr={
              <>
                v = 0.7 E<sub>h</sub> / b<sub>s</sub> = 0.7 × {f0(d.Eh)} / {f3(s.b)} = {f1(r.vS)} plf ≤ v
                <sub>s,ASD</sub> C<sub>ar</sub> = {f1(r.asdS)} × {f3(r.Car)} = {f1(r.vAllowS)} plf
              </>
            }
            pass={r.vS <= r.vAllowS}
          />
          <TR
            desc="Wind"
            expr={
              <>
                v = 0.6 W / b<sub>s</sub> = 0.6 × {f0(d.W)} / {f3(s.b)} = {f1(r.vW)} plf ≤ v<sub>wc</sub> C<sub>ar</sub>{" "}
                / 2 = {f1(r.vAllowW)} plf
              </>
            }
            pass={r.vW <= r.vAllowW}
          />
        </>
      )}
      <SectionHead title="Chord forces — overturning" />
      <TR
        desc="Method"
        expr={
          <>
            {rich(
              s.overturning === "full"
                ? `T = (V h − w_D b² / 2) / a, a = b − end-post thickness = ${f3(r.arm)} ft`
                : `T = V h / b − w_D s / 2 (end-post tributary dead load), b = ${f3(r.arm)} ft`,
            )}
            ; C = V h / a + w s / 2
          </>
        }
      />
      <DataTable
        caption="Chord forces per ASD combination"
        head={["Combination", "V (lb)", "w gravity (plf)", "T (lb)", "C (lb)"]}
        align={["left", "right", "right", "right", "right"]}
        small
        rows={r.chord.map((x) => [x.combo, f0(x.V), f0(x.wG), f0(x.T), f0(x.C)])}
      />
      <TR
        desc="End post tension, net section — NDS 3.8"
        expr={
          <>
            f<sub>t</sub> = T / A<sub>en</sub> = {f0(r.tension.T)} / {f2(r.Aen)} = {f1(r.tension.ft)} lb/in² ≤ F
            <sub>t</sub>' = F<sub>t</sub> × 1.6 × C<sub>F</sub> = {f0(r.tension.Ft)} lb/in²
          </>
        }
        pass={r.tension.ratio <= 1}
      />
      <AxialRows
        m={r.post}
        col={col}
        row={col.governing}
        le1={s.h * 12}
        le2={0}
        title="End post compression (in-plane braced; l_e = h)"
      />
      {r.holdown ? (
        <>
          <SectionHead title="Hold-down" />
          <TR
            desc={`${hardwareLabel(r.holdown.item)} (${r.holdown.item.report})`}
            expr={
              <>
                T = {f0(r.holdown.T)} lb ≤ {f0(r.holdown.item.tension ?? 0)} lb allowable
                {r.holdown.item.checked ? "" : <Flag> — VERIFY</Flag>}
              </>
            }
            pass={r.holdown.ratio <= 1}
          />
          {d.stacked ? (
            <TR
              desc="Uplift from wall above"
              expr={
                <>
                  {d.stacked.mark}: seismic {f0(d.stacked.Ts)} lb, wind {f0(d.stacked.Tw)} lb (included)
                </>
              }
            />
          ) : null}
        </>
      ) : null}
      {r.hdAnchor ? (
        <>
          <SectionHead title="Hold-down anchor — ACI 318-19 Ch. 17 (strength level)" />
          <TR
            desc="Factored tension"
            expr={
              <>
                T<sub>u</sub>
                {eq(`${f0(r.hdAnchor.Tu)} lb`)} — {r.hdAnchor.basis}
              </>
            }
          />
          <TR
            desc="Steel — 17.6.1"
            expr={
              <>
                φN<sub>sa</sub> = 0.75 × A<sub>se</sub> f<sub>uta</sub> = 0.75 × {f3(r.hdAnchor.t.Ase)} ×{" "}
                {f0(r.hdAnchor.t.futa)}
                {eq(`${f0(r.hdAnchor.t.phiNsa)} lb`)}
              </>
            }
          />
          <TR
            desc="Concrete breakout — 17.6.2"
            expr={
              <>
                N<sub>b</sub> = 24 √f'<sub>c</sub> h<sub>ef</sub>
                <sup>1.5</sup> = {f0(r.hdAnchor.t.Nb)} lb; A<sub>Nc</sub>/A<sub>Nco</sub> = {f0(r.hdAnchor.t.ANc)}/
                {f0(r.hdAnchor.t.ANco)}; ψ<sub>ed,N</sub> = {f3(r.hdAnchor.t.psiEd)}; ψ<sub>c,N</sub> ={" "}
                {f2(r.hdAnchor.t.psiC)}; φN<sub>cb</sub>
                {eq(`${f0(r.hdAnchor.t.phiNcb)} lb`)}
                {r.hdAnchor.t.seismicFactor < 1 ? " (× 0.75, 17.10.5.4)" : ""}
              </>
            }
          />
          <TR
            desc="Pullout — 17.6.3"
            expr={
              <>
                φN<sub>pn</sub> = 0.70 ψ<sub>c,P</sub> 8 A<sub>brg</sub> f'<sub>c</sub>
                {eq(`${f0(r.hdAnchor.t.phiNpn)} lb`)}
              </>
            }
          />
          {r.hdAnchor.t.phiNsb !== undefined ? (
            <TR
              desc="Side-face blowout — 17.6.4"
              expr={
                <>
                  φN<sub>sb</sub>
                  {eq(`${f0(r.hdAnchor.t.phiNsb)} lb`)}
                </>
              }
            />
          ) : null}
          <TR
            desc={`Governing: ${r.hdAnchor.t.governs}`}
            expr={
              <>
                T<sub>u</sub> / φN<sub>n</sub>
                {eq(f3(r.hdAnchor.ratio))}
              </>
            }
            pass={r.hdAnchor.ratio <= 1}
          />
        </>
      ) : null}
      <SectionHead title="Sill anchorage" />
      <TR
        desc={`Shear per anchor at ${f0(s.sill.spacing)} in. o.c.`}
        expr={
          <>
            V = v<sub>max</sub> × s = {f1(Math.max(r.vS, r.vW))} × {f2(s.sill.spacing / 12)}
            {eq(`${f0(r.sill.perBolt)} lb`)}
          </>
        }
      />
      {r.sill.Z !== undefined ? (
        <TR
          desc={`${fmtInFraction(s.sill.d)} in. bolt in ${s.sillSize} sill — NDS 12.3 (mode ${r.sill.mode})`}
          expr={
            <>
              Z' = Z × C<sub>D</sub> = {f0(r.sill.Z)} × 1.6{eq(`${f0(r.sill.Zprime)} lb`)}
            </>
          }
          pass={r.sill.ratio <= 1}
        />
      ) : (
        <TR
          desc={`${s.sill.label ?? "Post-installed anchor"} (ESR)`}
          expr={<>{f0(r.sill.Zprime)} lb allowable</>}
          pass={r.sill.ratio <= 1}
        />
      )}
      {r.sill.concrete ? (
        <TR
          desc="Concrete, parallel to edge (strength) — ACI 318 17.7"
          expr={
            <>
              V<sub>u</sub> = {f0(r.sill.concrete.Vu)} lb ≤ φV<sub>n</sub> = {f0(r.sill.concrete.phiVn)} lb (
              {r.sill.concrete.governs})
            </>
          }
          pass={r.sill.concrete.ratio <= 1}
        />
      ) : null}
      <SectionHead title="Seismic drift — SDPWS Eq. 4.3-1, ASCE 7 §12.8.6" />
      <TR
        desc="Strength-level unit shear (ρ = 1.0, §12.12.1)"
        expr={
          <>
            v = Q<sub>E</sub> / b<sub>s</sub>
            {eq(`${f2(r.drift.v)} plf`)}
          </>
        }
      />
      <TR
        desc="Anchor tension / slip"
        expr={
          <>
            T<sub>δ</sub> = {f0(r.drift.Td)} lb; k<sub>a</sub> = {f0(r.drift.ka)} lb/in; Δ<sub>a</sub> = T<sub>δ</sub> /
            k<sub>a</sub> = {fmt(r.drift.da, 4)} in
          </>
        }
      />
      <TR
        desc="Shear wall deflection"
        expr={
          <>
            δ<sub>sw</sub> = 8 v h³/(E A b) + v h/(1000 G<sub>a</sub>) + h Δ<sub>a</sub>/b = {fmt(r.drift.bend, 4)} +{" "}
            {fmt(r.drift.shear, 4)} + {fmt(r.drift.slip, 4)}
            {eq(`${fmt(r.drift.dxe, 4)} in`)}
          </>
        }
      />
      <TR
        desc="Amplified deflection — Eq. 12.8-15"
        expr={
          <>
            δ<sub>x</sub> = C<sub>d</sub> δ<sub>xe</sub> / I<sub>e</sub> = {f1(d.Cd)} × {fmt(r.drift.dxe, 4)} /{" "}
            {f2(d.Ie)} = {fmt(r.drift.dx, 4)} in ≤ Δ<sub>a</sub> = {f3(d.driftFactor)} h<sub>sx</sub> ={" "}
            {f2(r.drift.allow)} in
          </>
        }
        pass={r.drift.ratio <= 1}
      />
      <TR
        desc={`Wind deflection (${f2(s.windService.factor)}W)`}
        expr={
          <>
            δ = {fmt(r.windDefl.d, 4)} in ≤ h / {f0(s.windService.limitN)} = {f3(r.windDefl.allow)} in
          </>
        }
        pass={r.windDefl.ratio <= 1}
      />
      <ChecksSummary checks={r.checks} />
      <MemberResult r={r} />
      <Divider />
      <FinalSummary
        rows={[
          ["Shear wall", <b key="s">{`${r.mark}: ${r.callout}`}</b>],
          [
            "Sheathing / nailing",
            r.sides.map((x) => `${x.row.label}; ${x.row.nail} @ ${x.spacing} in. edges, 12 in. field`).join(" + "),
          ],
          ["Hold-down", r.holdown ? `${r.holdown.item.model} each end, T = ${f0(r.holdown.T)} lb` : "None required"],
          [
            "Sill anchors",
            `${s.sill.type === "cast-in" ? `${fmtInFraction(s.sill.d)} in. dia. anchor bolts, ${f0(s.sill.embed)} in. embedment` : (s.sill.label ?? "post-installed")} @ ${f0(s.sill.spacing)} in. o.c.`,
          ],
          ["Governing check", `${r.governing.name} — D/C ${f3(r.governing.ratio)} ${r.pass ? "PASS" : "FAIL"}`],
          ["Field verification", verifyText(r)],
        ]}
      />
      <AssumptionRows items={r.assumptions} />
      <SpecificNotes flags={r.flags} />
      <LimitationNotes
        notes={[
          "Demand from the lateral analysis sheet: E_h = ρ Q_E (strength) and W (strength); ASD unit shears use 0.7E and 0.6W.",
          "Diaphragm, collector and top-plate splice checks follow in Phase 3.",
        ]}
      />
    </Frame>
  );
}
