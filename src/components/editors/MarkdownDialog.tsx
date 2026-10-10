/**
 * Fill from .md / Export .md — the Markdown input sheet (src/engine/project/markdown.ts).
 * Import: choose or paste a sheet, check it (report of fields filled, members added /
 * updated, defaults used, errors), then apply. Export: the current project as a sheet,
 * which is also the template.
 */

import { useRef, useState } from "react";
import { saveFile, saveMessage } from "@/lib/download";
import { STARTER_SHEET, labelReference } from "@/engine/project/mdFriendly";
import {
  applyMarkdown,
  convertDrawingData,
  looksLikeDrawingData,
  type DrawingDataResult,
  fileNameFor,
  MD_EXT,
  projectToMarkdown,
  type MarkdownOutcome,
  type Project,
} from "@/engine/project";

const btn =
  "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40";
const primary =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-40";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-3xl space-y-4 rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className={btn} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MarkdownImportDialog({
  project,
  onApply,
  onClose,
}: {
  project: Project;
  onApply: (p: Project, summary: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState<string>();
  const [mode, setMode] = useState<"fill" | "new">("fill");
  const [result, setResult] = useState<MarkdownOutcome>();
  const [converted, setConverted] = useState<DrawingDataResult>();
  const fileRef = useRef<HTMLInputElement>(null);

  const check = (t = text, m = mode) => setResult(t.trim() ? applyMarkdown(project, t, { mode: m }) : undefined);
  /** drawing-data document → input sheet (shown in the box for review), checked as a new project */
  const convert = (t = text) => {
    const c = convertDrawingData(t);
    setConverted(c);
    setText(c.sheet);
    setMode("new");
    check(c.sheet, "new");
  };
  const load = (t: string) => {
    setConverted(undefined);
    setText(t);
    if (looksLikeDrawingData(t)) convert(t);
    else check(t);
  };
  const r = result?.report;

  return (
    <Shell title="Fill project from a Markdown sheet (.md)" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Write the sheet in plain engineering terms: <code>## Project</code> / <code>## Design criteria</code> with lines
        such as <code>- Wind speed: 95 mph</code>, one heading per member (<code>## B-1 (beam)</code>,{" "}
        <code>## Floor joist FJ-1</code>) with <code>- Span: 16&apos;-6&quot;</code>,{" "}
        <code>- Size: (3) 1-3/4 x 11-7/8 LVL</code>, <code>- Spacing: 16 in. o.c.</code>, or a schedule table with a{" "}
        <b>Mark</b> column. Units are converted; dotted paths from Export .md (<code>criteria.wind.V: 95</code>) also
        work.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          Choose .md file…
        </button>
        <input
          id="md-file"
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            f.text().then((t) => {
              setName(f.name);
              load(t);
            });
          }}
        />
        <button
          type="button"
          className={btn}
          title="A plain-language sheet with the common project and member fields"
          onClick={() => {
            setName(undefined);
            load(STARTER_SHEET);
          }}
        >
          Starter sheet
        </button>
        {name ? <span className="text-xs text-muted-foreground">{name}</span> : null}
      </div>
      <label className="block text-xs font-medium" htmlFor="md-text">
        Or paste the sheet
      </label>
      <textarea
        id="md-text"
        className="h-56 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        value={text}
        placeholder={
          "## Project\n- Project name: 12 Oak Lane\n- Wind speed: 95 mph\n\n## B-1 (beam)\n- Size: 4x12 DF-L No.1\n- Span: 16'-6\"\n- Trib: 6 ft\n- Dead load: 15 psf\n- Live load: 40 psf"
        }
        onChange={(e) => {
          setText(e.target.value);
          setResult(undefined);
        }}
      />
      <fieldset className="space-y-1 text-sm">
        <legend className="text-xs font-medium">Apply to</legend>
        <label className="flex items-center gap-2">
          <input
            id="md-mode-fill"
            type="radio"
            checked={mode === "fill"}
            onChange={() => {
              setMode("fill");
              check(text, "fill");
            }}
          />
          The current project — sheet values replace current values; members matched by mark, new marks added
        </label>
        <label className="flex items-center gap-2">
          <input
            id="md-mode-new"
            type="radio"
            checked={mode === "new"}
            onChange={() => {
              setMode("new");
              check(text, "new");
            }}
          />
          A new project — only the sheet's members; items not in the sheet take the new-project defaults
        </label>
      </fieldset>
      {converted ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-xs">
          <div className="font-semibold">
            Converted from a drawing-data document: {converted.read.length} project values and {converted.members}{" "}
            members read from its tables. The sheet above is editable — review it before applying.
          </div>
          <details>
            <summary className="cursor-pointer">Values read ({converted.read.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {converted.read.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </details>
          <details open>
            <summary className="cursor-pointer text-destructive">
              Open items — not on the drawings, conflicts, items skipped ({converted.notes.length})
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {converted.notes.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </details>
          <div className="text-muted-foreground">
            Each member lists its missing inputs (spans, lengths, heights, trib widths, nailing) as REQUIRED INPUT; its
            sheet prints VERIFY until you mark them entered in the member editor.
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!text.trim()} onClick={() => check()}>
          Check sheet
        </button>
        {result?.report.drawingData ? (
          <button type="button" className={primary} onClick={() => convert()}>
            Convert to input sheet
          </button>
        ) : null}
        <button
          type="button"
          className={primary}
          disabled={!result?.ok}
          onClick={() => {
            if (!result?.ok) return;
            const rp = result.report;
            onApply(
              result.project,
              `Filled from ${name ?? "the pasted sheet"}: ${rp.applied} values; ${rp.added.length} members added, ${rp.updated.length} updated${rp.ignored.length ? `; ${rp.ignored.length} keys ignored` : ""}.${converted ? ` Converted from drawing data — ${converted.notes.length} open items are in the project notes; members list their REQUIRED INPUT.` : ""}`,
            );
          }}
        >
          Apply
        </button>
      </div>
      {r ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-xs">
          <div className={result?.ok ? "font-semibold" : "font-semibold text-destructive"}>
            {result?.ok
              ? `Ready: ${r.applied} values, ${r.added.length} members added, ${r.updated.length} updated.`
              : `Not applied: ${r.errors.length} problem${r.errors.length === 1 ? "" : "s"} to fix in the sheet.`}
          </div>
          {r.errors.length ? (
            <ul className="list-disc space-y-0.5 pl-5 text-destructive">
              {r.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
          {r.skipped.sections.length || r.skipped.lines ? (
            <div className="text-muted-foreground">
              Ignored (not input-sheet content): {r.skipped.sections.length} headings, {r.skipped.lines} lines outside
              sections.
            </div>
          ) : null}
          {r.added.length ? <div>Added: {r.added.join(", ")}</div> : null}
          {r.updated.length ? <div>Updated: {r.updated.join(", ")}</div> : null}
          {r.ignored.length ? (
            <details open>
              <summary className="cursor-pointer text-destructive">
                Not read — labels that are not fields ({r.ignored.length})
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {r.ignored.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {r.converted.length ? (
            <details>
              <summary className="cursor-pointer">Read from labels and units ({r.converted.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono">
                {r.converted.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {r.defaulted.length ? (
            <details>
              <summary className="cursor-pointer">
                Template defaults used for new members ({r.defaulted.length}) — check these
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {r.defaulted.map((d) => (
                  <li key={d.mark}>
                    <b>{d.mark}</b>: {d.fields.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <LabelReference />
    </Shell>
  );
}

function LabelReference() {
  const ref = labelReference();
  return (
    <details className="rounded-md border border-border p-3 text-xs">
      <summary className="cursor-pointer font-medium">Labels the sheet understands</summary>
      <div className="mt-2 font-semibold">Project</div>
      <table className="mt-1 w-full border-collapse">
        <tbody>
          {ref.project.map(([l, d]) => (
            <tr key={l} className="border-t border-border">
              <td className="py-0.5 pr-3 align-top">{l}</td>
              <td className="py-0.5 text-muted-foreground">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 font-semibold">Members (heading "## MARK (kind)" or a schedule row)</div>
      <table className="mt-1 w-full border-collapse">
        <tbody>
          {ref.member.map(([l, k, d], i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-0.5 pr-3 align-top">{l}</td>
              <td className="py-0.5 pr-3 align-top text-muted-foreground">{k}</td>
              <td className="py-0.5 text-muted-foreground">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function MarkdownExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const md = projectToMarkdown(project);
  const [note, setNote] = useState<string>();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fname = fileNameFor(project).replace(/\.housecalc\.json$/, MD_EXT);
  return (
    <Shell title="Export project as a Markdown sheet (.md)" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Every field of the project and its {project.members.length} members. Edit the values and use Fill from .md to
        read it back.
      </p>
      <textarea
        id="md-export"
        ref={areaRef}
        readOnly
        className="h-80 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        value={md}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primary}
          onClick={() => {
            navigator.clipboard
              .writeText(md)
              .then(() => setNote("Copied."))
              .catch(() => {
                areaRef.current?.select();
                setNote("Copy blocked here — the text is selected; press Ctrl/Cmd + C.");
              });
          }}
        >
          Copy
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            saveFile(fname, md, "text/markdown").then((o) => setNote(saveMessage(fname, o).text));
          }}
        >
          Download {fname}
        </button>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </div>
    </Shell>
  );
}
