/**
 * The full calculation package as one standalone HTML file (sheets + the app's styles,
 * US Letter print rules). Open it in a browser and print to PDF — the way to get PDFs where
 * the page itself cannot open the print dialog (the claude.ai Artifact viewer).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { ReportPackage } from "@/components/report/ReportPackage";
import type { SheetEntry } from "@/components/report/package";
import type { Project, ProjectDesign } from "@/engine/project";

function pageCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      out.push(Array.from(sheet.cssRules, (r) => r.cssText).join("\n"));
    } catch {
      // cross-origin sheet: not readable, skipped
    }
  }
  return out.join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function reportHtml(project: Project, design: ProjectDesign, entries: SheetEntry[]): string {
  const body = renderToStaticMarkup(
    <div className="report-preview">
      <ReportPackage project={project} design={design} entries={entries} />
    </div>,
  );
  const title = `${project.info.jobRef || project.info.name || "HouseCalc"} — structural calculations`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${pageCss().replace(/<\/style/gi, "<\\/style")}</style>
<style>.hc-print-note{font:14px system-ui,sans-serif;margin:16px auto;max-width:8.5in;padding:10px 14px;border:1px solid #999;background:#fff;color:#000}@media print{.hc-print-note{display:none}}</style>
</head>
<body>
<div class="hc-print-note">${esc(project.info.name)} — ${entries.length} sheets. To make the PDF: press Ctrl + P (Cmd + P on a Mac), choose <b>Save as PDF</b>, paper <b>Letter</b>, and turn on <b>Background graphics</b>.</div>
${body}
</body>
</html>
`;
}
