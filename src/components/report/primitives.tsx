/**
 * Tedds-style report primitives, copied from the JoistCalc / StudCalc /
 * TrussCalc report layout: repeating title block, description / expression
 * rows with bold-italic PASS / FAIL, section heads, verdict lines, summary and
 * data tables. Black on white; red #c00000 only for overrides and VERIFY data.
 */

import React, { createContext, useContext } from "react";

export const RED: React.CSSProperties = { color: "#c00000" };

/**
 * Issue status of the printed package. "final" (default) prints the sheets as issued
 * calculations: no design-aid disclaimer, no VERIFY / review wording, flags in black.
 * "check" is the working copy with every VERIFY item flagged in red.
 */
export const IssueContext = createContext<{ final: boolean }>({ final: false });
export const useFinal = () => useContext(IssueContext).final;

const SCRUB: Array<[RegExp, string]> = [
  [/\s*[—–-]\s*corroborated(?: by secondary sources)?;\s*VERIFY[^;)\]]*/g, ""],
  [/HouseCalc template values in use/g, "assumed values used"],
  [/;?\s*results are not valid until entered\.?/g, "."],
  [/\s*\(\s*VERIFY\b[^)]*\)/g, ""],
  [
    /\s*(?:[—–,;/]|\bor\b)?\s*\bVERIFY\b(?:\s+(?:against|with|basis|method|connection|Table|the|applicability)\b[^;.)\]]*)?/g,
    "",
  ],
  // EOR-directed "— verify with …" / ", verify" (contractor "field verify" notes stay)
  [/\s*[—–,]\s*verify\b[^;.)]*/g, ""],
  [/\s*\bREQUIRED INPUT\.(?=\s|$)/g, ""],
  [/\s*\(\s*\)/g, ""],
  [/\s+([;,.)])/g, "$1"],
  [/\.\./g, "."],
];
/** Text as issued: the VERIFY / review wording removed (final issue). */
export function scrubText(s: string): string {
  if (!/VERIFY|[—–,]\s*verify\b|template values|not valid until|REQUIRED INPUT\./.test(s)) return s;
  let t = s;
  for (const [re, by] of SCRUB) t = t.replace(re, by);
  return t.trim() ? t : "";
}
/** scrubText over every string in a React node tree (strings and element children). */
export function scrub(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return scrubText(node);
  if (Array.isArray(node)) return node.map(scrub);
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    if (props.children === undefined) return node;
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    // static children stay positional (spread) so React does not ask for keys
    return Array.isArray(props.children)
      ? React.cloneElement(el, undefined, ...props.children.map(scrub))
      : React.cloneElement(el, undefined, scrub(props.children));
  }
  return node;
}
/** scrub() when the package is issued as final, else the node unchanged. */
export function useIssued() {
  const final = useFinal();
  return (n: React.ReactNode) => (final ? scrub(n) : n);
}

export interface TitleFields {
  projectName: string;
  projectAddress: string;
  section: string;
  jobRef: string;
  sheet: string;
  revision: string;
  preparedBy: string;
  date: string;
  checkedBy: string;
  approvedBy: string;
}

export function TitleBlock({ f }: { f: TitleFields }) {
  const cellBase = "border border-black px-2 py-1 align-top";
  const label = "text-[9pt] leading-tight text-black";
  const value = "text-[10pt] font-bold leading-tight text-black";
  return (
    <table className="w-full border-collapse text-black" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <tbody>
        <tr>
          <td rowSpan={3} className={`${cellBase} w-[110px] text-center`}>
            <div className="text-[9pt] font-bold">CALC</div>
          </td>
          <td className={cellBase} colSpan={4}>
            <div className={label}>Project</div>
            <div className={value}>
              {f.projectName}
              {f.projectAddress ? `, ${f.projectAddress}` : ""}
            </div>
          </td>
          <td className={cellBase} colSpan={2}>
            <div className={label}>Job Ref.</div>
            <div className={value}>{f.jobRef || " "}</div>
          </td>
        </tr>
        <tr>
          <td className={cellBase} colSpan={4}>
            <div className={label}>Section</div>
            <div className={value}>{f.section}</div>
          </td>
          <td className={cellBase} colSpan={2}>
            <div className={label}>Sheet no./rev.</div>
            <div className={value}>
              {f.sheet} / {f.revision}
            </div>
          </td>
        </tr>
        <tr>
          <td className={cellBase}>
            <div className={label}>Calc. by</div>
            <div className={value}>{f.preparedBy || " "}</div>
          </td>
          <td className={cellBase}>
            <div className={label}>Date</div>
            <div className={value}>{f.date || " "}</div>
          </td>
          <td className={cellBase}>
            <div className={label}>Chk&apos;d by</div>
            <div className={value}>{f.checkedBy || " "}</div>
          </td>
          <td className={cellBase}>
            <div className={label}>Date</div>
            <div className={value}>&nbsp;</div>
          </td>
          <td className={cellBase}>
            <div className={label}>App&apos;d by</div>
            <div className={value}>{f.approvedBy || " "}</div>
          </td>
          <td className={cellBase}>
            <div className={label}>Date</div>
            <div className={value}>&nbsp;</div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function TR({ desc, expr, pass }: { desc?: React.ReactNode; expr: React.ReactNode; pass?: boolean | null }) {
  const is = useIssued();
  desc = is(desc);
  expr = is(expr);
  return (
    <tr className="avoid-break align-baseline">
      <td className="w-[55%] px-3 py-[3px] text-[10pt] leading-snug">{desc}</td>
      <td className="px-3 py-[3px] text-[10pt] leading-snug">
        <span>{expr}</span>
        {pass === true && <span className="ml-3 font-bold italic">PASS</span>}
        {pass === false && <span className="ml-3 font-bold italic">FAIL</span>}
      </td>
    </tr>
  );
}

export function SectionHead({ title }: { title: React.ReactNode }) {
  title = useIssued()(title);
  return (
    <tr className="avoid-break keep-next">
      <td colSpan={2} className="px-3 pt-3 pb-1 text-[10.5pt] font-bold">
        {title}
      </td>
    </tr>
  );
}

export function SubHead({ title }: { title: React.ReactNode }) {
  return (
    <tr className="avoid-break keep-next">
      <td colSpan={2} className="px-3 pt-2 pb-[2px] text-[10pt] font-bold italic">
        {title}
      </td>
    </tr>
  );
}

export function VerdictLine({ pass, message }: { pass: boolean; message: string }) {
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 py-1 text-right text-[10pt] font-bold italic">
        {pass ? "PASS" : "FAIL"} — {message}
      </td>
    </tr>
  );
}

export function Divider() {
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 py-1">
        <div className="border-t border-black/60" />
      </td>
    </tr>
  );
}

/** Free-text row spanning both columns. */
export function TextRow({ children, italic }: { children: React.ReactNode; italic?: boolean }) {
  children = useIssued()(children);
  return (
    <tr className="avoid-break">
      <td colSpan={2} className={`px-3 py-[3px] text-[9.5pt] leading-snug ${italic ? "italic" : ""}`}>
        {children}
      </td>
    </tr>
  );
}

export const B = ({ children }: { children: React.ReactNode }) => <b>{children}</b>;
export const eq = (v: string) => (
  <>
    {" "}
    = <B>{v}</B>
  </>
);

/** Red text for overrides and VERIFY items (plain text, VERIFY wording removed, when issued as final). */
export function Flag({ children }: { children: React.ReactNode }) {
  return useFinal() ? <span>{scrub(children)}</span> : <span style={RED}>{children}</span>;
}

export type SummaryRow = [string, string, string, string, boolean];

export function SummaryTable({ rows, title }: { rows: SummaryRow[]; title?: React.ReactNode }) {
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <table className="w-full border-collapse text-[9.5pt]">
          <thead>
            {title ? (
              <tr>
                <th colSpan={5} className="px-0 pb-1 pt-3 text-left text-[10.5pt] font-bold">
                  {title}
                </th>
              </tr>
            ) : null}
            <tr>
              {["Check", "Demand", "Capacity", "D/C", "Result"].map((h) => (
                <th key={h} className="border border-black bg-white px-2 py-1 text-left font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([check, demand, cap, dc, pass], i) => (
              <tr key={`${check}-${i}`} className="avoid-break">
                <td className="border border-black px-2 py-1">{check}</td>
                <td className="border border-black px-2 py-1">{demand}</td>
                <td className="border border-black px-2 py-1">{cap}</td>
                <td className="border border-black px-2 py-1">{dc}</td>
                <td className="border border-black px-2 py-1 font-bold italic">{pass ? "PASS" : "FAIL"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function DataTable({
  head,
  rows,
  caption,
  small,
  align,
}: {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
  caption?: React.ReactNode;
  small?: boolean;
  /** per-column alignment; numbers read best right-aligned */
  align?: Array<"left" | "right" | "center">;
}) {
  const is = useIssued();
  head = head.map(is);
  rows = rows.map((r) => r.map(is));
  caption = is(caption);
  const cls = (i: number) =>
    align?.[i] === "right" ? "text-right" : align?.[i] === "center" ? "text-center" : "text-left";
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <table className={`w-full border-collapse ${small ? "text-[8.5pt]" : "text-[9pt]"}`}>
          <thead>
            {caption ? (
              <tr>
                <th colSpan={head.length} className="px-0 pb-1 pt-1 text-left text-[9pt] font-bold leading-tight">
                  {caption}
                </th>
              </tr>
            ) : null}
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`border border-black bg-white px-2 py-1 font-bold ${cls(i)}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="avoid-break">
                {r.map((c, j) => (
                  <td key={j} className={`border border-black px-2 py-[3px] ${cls(j)}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function SheetTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <>
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 pt-4 pb-1 text-center text-[13pt] font-bold uppercase tracking-wide">
          {title}
        </td>
      </tr>
      {subtitle ? (
        <tr className="avoid-break">
          <td colSpan={2} className="px-3 pb-3 text-center text-[9.5pt] italic">
            {subtitle}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ResultBlock({ pass, lines }: { pass: boolean; lines: React.ReactNode[] }) {
  const is = useIssued();
  lines = lines.map(is).filter((l) => l !== "");
  return (
    <>
      <SectionHead title="Result" />
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 py-3 text-center text-[11pt] font-bold uppercase tracking-wide">
          {pass ? "Member adequate — all checks pass" : "Member inadequate — redesign required"}
          {lines.map((l, i) => (
            <div key={i} className="mt-1 text-[9.5pt] font-normal normal-case tracking-normal">
              {l}
            </div>
          ))}
        </td>
      </tr>
    </>
  );
}

export function NotesList({ title = "Notes & limitations", notes }: { title?: string; notes: React.ReactNode[] }) {
  const is = useIssued();
  notes = notes.map(is).filter((n) => n !== "" && n !== null && n !== undefined);
  if (!notes.length) return null;
  return (
    <>
      <SectionHead title={title} />
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 pb-4 text-[9.5pt] leading-snug">
          <ol className="list-decimal space-y-[2px] pl-5">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
        </td>
      </tr>
    </>
  );
}

const cssString = (t: string) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

/**
 * One calculation sheet. The title block repeats on every printed page
 * (thead). Each sheet prints on its own named page so its footer carries
 * "Project — Section" (left) and revision / date / code cycle (centre);
 * the page number comes from the generic @page rule.
 */
export function Sheet({
  f,
  footerLeft,
  footerCenter,
  first,
  children,
  id,
}: {
  f: TitleFields;
  footerLeft: string;
  footerCenter: string;
  first?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  const pageName = `hc-sheet-${f.sheet.replace(/[^A-Za-z0-9]/g, "")}`;
  const footerCss = `@page ${pageName} { @bottom-left { content: ${cssString(footerLeft)}; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; } @bottom-center { content: ${cssString(footerCenter)}; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; } }`;
  return (
    <article
      id={id}
      data-footer-left={footerLeft}
      data-footer-center={footerCenter}
      className="report-root tedds-report mx-auto mb-6 max-w-[8.5in] border border-black bg-white p-0 text-black shadow-sm"
      style={
        {
          fontFamily: "Arial, Helvetica, sans-serif",
          ...(first ? {} : { breakBefore: "page", pageBreakBefore: "always" as const }),
          page: pageName,
        } as React.CSSProperties
      }
    >
      <style>{footerCss}</style>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td colSpan={2} className="p-0">
              <TitleBlock f={f} />
            </td>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </article>
  );
}
