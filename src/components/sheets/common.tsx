/** Sheet metadata, title-block fields, footers and the design-basis (code-cycle) block. */

import type React from "react";
import { getCycle, type CodeCycle } from "@/engine/core/codes";
import { VERSION_LOCKED, softwareText } from "@/engine/version";
import { fmt } from "@/engine/core/fmt";
import { TABLES } from "@/engine/data/library";
import type { Project } from "@/engine/project";
import { B, Flag, SectionHead, TR, useFinal, type TitleFields } from "../report/primitives";

export interface SheetMeta {
  project: Project;
  cycle: CodeCycle;
  sheetNo: number;
  totalSheets: number;
  /** e.g. "R-1 — Rafter" */
  section: string;
  first?: boolean;
}

export function metaFor(project: Project, sheetNo: number, totalSheets: number, section: string): SheetMeta {
  return { project, cycle: getCycle(project.cycleId), sheetNo, totalSheets, section, first: sheetNo === 1 };
}

export function titleFields(m: SheetMeta): TitleFields {
  const i = m.project.info;
  return {
    projectName: i.name,
    projectAddress: i.address,
    section: m.section,
    jobRef: i.jobRef,
    sheet: String(m.sheetNo),
    revision: i.revision,
    preparedBy: i.preparedBy,
    date: i.date,
    checkedBy: i.checkedBy,
    approvedBy: i.approvedBy,
  };
}

export function footers(m: SheetMeta) {
  const i = m.project.info;
  return {
    left: `${i.name} — ${m.section}`,
    center: `Rev. ${i.revision}  |  ${i.date}  |  ${m.cycle.label}`,
  };
}

export const DESIGN_AID =
  "HouseCalc is a design aid. These calculations are valid only when reviewed, completed where noted and stamped by the Engineer of Record.";

/** Design basis block with the code-cycle stamp, printed on every sheet. */
export function DesignBasis({
  m,
  material,
  tables,
  combos,
}: {
  m: SheetMeta;
  material?: React.ReactNode;
  tables?: string[];
  combos?: React.ReactNode;
}) {
  const c = m.cycle;
  const final = useFinal();
  return (
    <>
      <SectionHead title="Design basis" />
      <TR desc="Code cycle" expr={<B>{c.label}</B>} />
      <TR
        desc="Governing codes"
        expr={
          <>
            <span className="block">{c.building} (engineered design)</span>
            <span className="block">{c.residential}</span>
          </>
        }
      />
      <TR desc="Loads and combinations" expr={combos ?? <>{c.asce7} Ch. 2 (ASD §2.4), Ch. 4, Ch. 7</>} />
      {material ? <TR desc="Material standard" expr={material} /> : null}
      {tables?.length ? (
        <TR
          desc="Reference design values"
          expr={
            <>
              {tables.map((id) => {
                const t = TABLES[id];
                if (!t) return null;
                return (
                  <span key={id} className="block">
                    {t.source} ({t.edition}){" "}
                    {t.status === "verified" ? (
                      "— checked"
                    ) : (
                      <Flag>{t.status === "corroborated" ? "— corroborated; VERIFY" : "— VERIFY"}</Flag>
                    )}
                  </span>
                );
              })}
            </>
          }
        />
      ) : null}
      <TR
        desc="Engine / data library"
        expr={
          VERSION_LOCKED ? (
            softwareText(c.id)
          ) : final ? (
            softwareText(c.id).replace(/; UNLOCKED build — not for issue$/, "")
          ) : (
            <Flag>{softwareText(c.id)}</Flag>
          )
        }
      />
    </>
  );
}

export const f0 = (v: number) => fmt(v, 0);
export const f1 = (v: number) => fmt(v, 1);
export const f2 = (v: number) => fmt(v, 2);
export const f3 = (v: number) => fmt(v, 3);

export const Sub = ({ b, s }: { b: React.ReactNode; s: React.ReactNode }) => (
  <>
    {b}
    <sub>{s}</sub>
  </>
);

export const unitOf = (u: string) => (u === "psi" ? "lb/in²" : u);

/**
 * Engine strings write subscripts as "M_p", "f_p,max", "c'_a1"; print them as
 * subscripts on the sheets.
 */
export function rich(text: string): React.ReactNode {
  const re = /([A-Za-zφΩλψΔδθσγεταβμρ]'?)_([A-Za-z0-9,]+)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={k++}>
        {m[1]}
        <sub>{m[2]}</sub>
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 && typeof out[0] === "string" ? out[0] : <>{out}</>;
}
