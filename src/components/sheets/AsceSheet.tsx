/**
 * ASCE 7 hazard report sheet: the attached ASCE Hazard Tool PDF behind the design
 * criteria. On screen and in print the pages are images; the PDF export places the
 * original (vector) pages under the title block instead of this body.
 */

import { useEffect, useState } from "react";
import type { Project } from "@/engine/project";
import { Sheet, SheetTitle, TR, TextRow } from "../report/primitives";
import { footers, titleFields, type SheetMeta } from "./common";
import { fromBase64, pdfPagesPng } from "@/lib/attachedPdf";

type Report = NonNullable<Project["asceReport"]>;

export function AsceSheet({ m, report }: { m: SheetMeta; report: Report }) {
  const ft = footers(m);
  const [pages, setPages] = useState<string[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    setPages(undefined);
    pdfPagesPng(fromBase64(report.data), 2)
      .then((p) => live && setPages(p.map((x) => x.url)))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [report.data]);
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first}>
      <SheetTitle title="ASCE 7 hazard report" subtitle="Site hazard data — wind, seismic, snow (report attached)" />
      <TR desc="Report" expr={report.fileName} />
      <TR desc="Pages" expr={String(report.pages)} />
      <TR
        desc="Used for"
        expr={
          <>
            Basic wind speed, seismic S<sub>S</sub> / S<sub>1</sub> / site class, ground snow load on the criteria sheet
          </>
        }
      />
      {error ? (
        <TextRow italic>Could not render the report: {error}</TextRow>
      ) : (
        <tr data-asce-report="">
          <td colSpan={2} className="px-3 py-2">
            {pages
              ? pages.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt={`ASCE hazard report page ${i + 1}`}
                    className="mx-auto mb-2 block w-full border border-black"
                    style={{ breakInside: "avoid" }}
                  />
                ))
              : "Rendering report pages …"}
          </td>
        </tr>
      )}
    </Sheet>
  );
}
