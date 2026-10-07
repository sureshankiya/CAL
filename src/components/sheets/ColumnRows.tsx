/** Shared calculation rows for compression members (studs, stud packs, posts, end posts). */

import { fmt, fmtInFraction } from "@/engine/core/fmt";
import type { ColumnResult, ColumnRow } from "@/engine/design/column";
import type { ResolvedWood } from "@/engine/design/wood";
import { B, DataTable, SubHead, TR, VerdictLine, eq } from "../report/primitives";
import { f0, f1, f2, f3 } from "./common";

const psi = (v: number, d = 1) => `${fmt(v, d)} lb/in²`;

export function SectionRows({ m, title }: { m: ResolvedWood; title?: string }) {
  return (
    <>
      {title ? <SubHead title={title} /> : null}
      <TR desc="Material" expr={<B>{m.label}</B>} />
      <TR desc="Reference values" expr={<>{m.tableLabel}</>} />
      <TR
        desc="Compression / bending / tension parallel to grain"
        expr={
          <>
            F<sub>c</sub> = {f0(m.Fc)}; F<sub>b</sub> = {f0(m.Fb)}; F<sub>t</sub> = {f0(m.Ft)} lb/in²
          </>
        }
      />
      <TR
        desc="Compression perpendicular to grain; E; E_min"
        expr={
          <>
            F<sub>c⊥</sub> = {f0(m.Fcperp)} lb/in²; E = {f0(m.E)} lb/in²; E<sub>min</sub> = {f0(m.Emin)} lb/in²
          </>
        }
      />
      <TR
        desc="Size factors (C_F) — Fc / Fb / Ft"
        expr={
          <>
            {f2(m.CFc)} / {f3(m.CF)} / {f2(m.CFt)}
          </>
        }
      />
      <TR
        desc="Section"
        expr={
          <>
            b × d{eq(`${fmtInFraction(m.b)} in × ${fmtInFraction(m.d)} in`)}
            {m.plies > 1 ? ` (${m.plies} plies)` : ""}; A = {f3(m.A)} in²; S<sub>x</sub> = {f3(m.S)} in³; I<sub>x</sub> ={" "}
            {f3(m.I)} in⁴
          </>
        }
      />
    </>
  );
}

/** Column stability and axial rows for one combination. */
export function AxialRows({
  m,
  col,
  row,
  le1,
  le2,
  title,
}: {
  m: ResolvedWood;
  col: ColumnResult;
  row: ColumnRow;
  le1: number;
  le2: number;
  title: string;
}) {
  const ok = row.axial <= 1;
  return (
    <>
      <SubHead title={`${title} — combination ${row.combo.label} (C_D = ${f2(row.CD)})`} />
      <TR
        desc="Axial load"
        expr={
          <>
            P{eq(`${f0(row.P)} lb`)}
          </>
        }
      />
      <TR
        desc="Compression design value excluding C_P"
        expr={
          <>
            F<sub>c</sub>* = F<sub>c</sub> × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>F</sub> × C<sub>i</sub> ={" "}
            {f0(m.Fc)} × {f2(row.CD)} × {f2(col.CM.Fc)} × {f2(col.Ct)} × {f2(m.CFc)} × {f2(col.Ci)}
            {eq(psi(row.FcStar))}
          </>
        }
      />
      <TR
        desc="Adjusted E_min"
        expr={
          <>
            E<sub>min</sub>' = E<sub>min</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>i</sub> × C<sub>T</sub>
            {eq(psi(col.EminPrime1, 0))}
          </>
        }
      />
      <TR
        desc="Critical buckling value, strong axis (dimension d)"
        expr={
          <>
            F<sub>cE1</sub> = 0.822 × E<sub>min</sub>' / (l<sub>e1</sub> / d)² = 0.822 × {f0(col.EminPrime1)} / ({f1(le1)} /{" "}
            {f3(m.d)})²{eq(psi(row.FcE1, 0))}
          </>
        }
      />
      <TR
        desc="Critical buckling value, weak axis (dimension b)"
        expr={
          le2 > 0 ? (
            <>
              F<sub>cE2</sub> = 0.822 × E<sub>min</sub>' / (l<sub>e2</sub> / b)² = 0.822 × {f0(col.EminPrime2)} / ({f1(le2)} /{" "}
              {f3(m.b)})²{eq(psi(row.FcE2, 0))}
            </>
          ) : (
            <>Braced by sheathing / blocking — weak-axis buckling prevented</>
          )
        }
      />
      <TR
        desc={`Column stability factor — Eq. 3.7-1, c = ${f2(col.c)}${col.Kf < 1 ? `, K_f = ${f2(col.Kf)} (NDS 15.3.2)` : ""}`}
        expr={
          <>
            C<sub>P</sub> = (1 + F<sub>cE</sub>/F<sub>c</sub>*)/(2c) − √[((1 + F<sub>cE</sub>/F<sub>c</sub>*)/(2c))² − (F
            <sub>cE</sub>/F<sub>c</sub>*)/c]{eq(f3(row.CP))}
          </>
        }
      />
      <TR
        desc="Adjusted compression design value"
        expr={
          <>
            F<sub>c</sub>' = F<sub>c</sub>* × C<sub>P</sub> = {f1(row.FcStar)} × {f3(row.CP)}
            {eq(psi(row.FcPrime))}
          </>
        }
      />
      <TR
        desc="Actual compression stress"
        expr={
          <>
            f<sub>c</sub> = P / A = {f0(row.P)} / {f3(m.A)}
            {eq(psi(row.fc))}
          </>
        }
      />
      <TR
        desc="Utilisation"
        expr={
          <>
            f<sub>c</sub> / F<sub>c</sub>'{eq(f3(row.axial))}
          </>
        }
        pass={ok}
      />
      <VerdictLine
        pass={ok}
        message={ok ? "Design compressive stress exceeds actual compressive stress" : "Actual compressive stress exceeds design value"}
      />
    </>
  );
}

/** Combined bending and axial compression rows (NDS Eq. 3.9-3). */
export function CombinedRows({ m, col, row, title }: { m: ResolvedWood; col: ColumnResult; row: ColumnRow; title: string }) {
  const ok = row.interaction <= 1;
  return (
    <>
      <SubHead title={`${title} — combination ${row.combo.label} (C_D = ${f2(row.CD)})`} />
      <TR
        desc="Design moment"
        expr={
          <>
            M{eq(`${f1(row.M)} lb-ft`)}
          </>
        }
      />
      <TR
        desc="Adjusted bending design value"
        expr={
          <>
            F<sub>b</sub>' = F<sub>b</sub> × C<sub>D</sub> × C<sub>M</sub> × C<sub>t</sub> × C<sub>L</sub> × C<sub>F</sub> × C
            <sub>i</sub> × C<sub>r</sub> = {f0(m.Fb)} × {f2(row.CD)} × {f2(col.CM.Fb)} × {f2(col.Ct)} × {f3(col.CL)} × {f3(m.CF)} ×{" "}
            {f2(col.Ci)} × {f2(col.Cr)}
            {eq(psi(row.FbPrime))}
          </>
        }
      />
      <TR
        desc="Actual bending stress"
        expr={
          <>
            f<sub>b</sub> = M / S<sub>x</sub> = {f1(row.M)} × 12 / {f3(m.S)}
            {eq(psi(row.fb))}
          </>
        }
      />
      <TR
        desc="Combined bending and compression — Eq. 3.9-3"
        expr={
          <>
            (f<sub>c</sub>/F<sub>c</sub>')² + f<sub>b</sub>/[F<sub>b</sub>' (1 − f<sub>c</sub>/F<sub>cE1</sub>)] = ({f1(row.fc)}/
            {f1(row.FcPrime)})² + {f1(row.fb)}/[{f1(row.FbPrime)} × (1 − {f1(row.fc)}/{f0(row.FcE1)})]
            {eq(f3(row.interaction))}
          </>
        }
        pass={ok}
      />
      <TR
        desc="Stability limit"
        expr={
          <>
            f<sub>c</sub> = {f1(row.fc)} &lt; F<sub>cE1</sub> = {f0(row.FcE1)} lb/in²
          </>
        }
        pass={row.fc < row.FcE1}
      />
      <VerdictLine
        pass={ok}
        message={ok ? "Combined bending and compressive stresses are within permissible limits" : "Combined stresses exceed permissible limits"}
      />
    </>
  );
}

export function ColumnComboTable({ col, caption }: { col: ColumnResult; caption: string }) {
  return (
    <DataTable
      caption={caption}
      head={["Combination", "C_D", "P (lb)", "M (lb-ft)", "fc (psi)", "C_P", "Fc' (psi)", "fc/Fc'", "Eq. 3.9-3"]}
      align={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
      small
      rows={col.rows.map((r) => [
        r.combo.label,
        f2(r.CD),
        f0(r.P),
        r.M > 0.05 ? f1(r.M) : "—",
        f1(r.fc),
        f3(r.CP),
        f1(r.FcPrime),
        f3(r.axial),
        r.fb > 0 ? f3(r.interaction) : "—",
      ])}
    />
  );
}
