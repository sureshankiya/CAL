/**
 * Drawings: PDF upload and viewer (pdf.js), sheet tagging per page, and the
 * manual review table. Values read from a page are entered with their source
 * (drawing, page, sheet), confirmed, then applied to a member input.
 */

import { useEffect, useRef, useState } from "react";
import { applyReviewItem, newId, targetFields, type Project, type ReviewItem } from "@/engine/project";
import { deletePdf, getPdf, loadPdfJs, putPdf } from "@/lib/pdfStore";
import { AddButton, Collapsible, Field, Grid, Hint, Select, SmallButton, TextInput } from "../editors/fields";

type SetProject = (fn: (p: Project) => Project) => void;

export function DrawingsPanel({ p, set }: { p: Project; set: SetProject }) {
  const [viewing, setViewing] = useState<{ id: string; page: number } | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    try {
      setStatus(`Reading ${f.name} …`);
      const data = await f.arrayBuffer();
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
      const id = newId("dwg");
      await putPdf(id, data);
      set((x) => ({
        ...x,
        drawings: [
          ...x.drawings,
          { id, name: f.name, pages: doc.numPages, addedAt: new Date().toISOString(), sheets: {} },
        ],
      }));
      setStatus(`${f.name}: ${doc.numPages} page(s) loaded.`);
      setViewing({ id, page: 1 });
    } catch (e) {
      setStatus(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <Collapsible title={`Drawings & review table (${p.drawings.length} / ${p.review.length})`}>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <AddButton onClick={() => fileRef.current?.click()}>+ Upload drawing PDF</AddButton>
      {status ? <Hint>{status}</Hint> : null}
      <ul className="space-y-1">
        {p.drawings.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
            <button
              type="button"
              className="flex-1 truncate text-left"
              onClick={() => setViewing({ id: d.id, page: 1 })}
            >
              {d.name} <span className="text-muted-foreground">({d.pages} p.)</span>
            </button>
            <SmallButton
              tone="danger"
              title="Remove drawing"
              onClick={() => {
                void deletePdf(d.id);
                set((x) => ({
                  ...x,
                  drawings: x.drawings.filter((y) => y.id !== d.id),
                  review: x.review.filter((r) => r.drawingId !== d.id),
                }));
              }}
            >
              ✕
            </SmallButton>
          </li>
        ))}
      </ul>
      <ReviewTable p={p} set={set} />
      <Hint>
        Drawing files stay in this browser. The project file keeps the drawing list and the review table with their
        sources.
      </Hint>
      {viewing ? (
        <Viewer
          p={p}
          set={set}
          id={viewing.id}
          page={viewing.page}
          onPage={(page) => setViewing({ ...viewing, page })}
          onClose={() => setViewing(undefined)}
        />
      ) : null}
    </Collapsible>
  );
}

function ReviewTable({ p, set }: { p: Project; set: SetProject }) {
  const [error, setError] = useState<string | undefined>();
  const upd = (id: string, patch: Partial<ReviewItem>) =>
    set((x) => ({ ...x, review: x.review.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  if (!p.review.length)
    return <Hint>No review items yet — open a drawing and record the values you read from it.</Hint>;
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Review table</div>
      {p.review.map((r) => {
        const d = p.drawings.find((x) => x.id === r.drawingId);
        const member = r.target ? p.members.find((m) => m.id === r.target!.memberId) : undefined;
        return (
          <div
            key={r.id}
            className={`space-y-1 rounded-md border p-2 text-xs ${r.confirmed ? "border-border" : "border-destructive/60"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                <b>{r.item}</b>: {r.value}
              </span>
              <SmallButton
                tone="danger"
                title="Remove item"
                onClick={() => set((x) => ({ ...x, review: x.review.filter((y) => y.id !== r.id) }))}
              >
                ✕
              </SmallButton>
            </div>
            <div className="text-muted-foreground">
              {d?.name ?? "drawing"} · p.{r.page}
              {r.sheet ? ` · ${r.sheet}` : ""}
              {member ? ` → ${member.mark} ${r.target!.field}` : ""}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={r.confirmed}
                  onChange={(e) => upd(r.id, { confirmed: e.target.checked })}
                />{" "}
                Confirmed
              </label>
              {r.target ? (
                <button
                  type="button"
                  className="underline disabled:opacity-40"
                  disabled={!r.confirmed}
                  onClick={() => {
                    try {
                      set((x) => applyReviewItem(x, r));
                      setError(undefined);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Apply to {member?.mark ?? "member"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function Viewer({
  p,
  set,
  id,
  page,
  onPage,
  onClose,
}: {
  p: Project;
  set: SetProject;
  id: string;
  page: number;
  onPage: (n: number) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1.25);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const d = p.drawings.find((x) => x.id === id);
  const [item, setItem] = useState("");
  const [value, setValue] = useState("");
  const [memberId, setMemberId] = useState("");
  const [field, setField] = useState("");
  const sheet = d?.sheets[String(page)] ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getPdf(id);
      if (!data) {
        setState("missing");
        return;
      }
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
      const pg = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const vp = pg.getViewport({ scale });
      const c = canvas.current;
      if (!c || cancelled) return;
      c.width = vp.width;
      c.height = vp.height;
      await pg.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
      if (!cancelled) setState("ok");
    })().catch(() => setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [id, page, scale]);

  if (!d) return null;
  const member = p.members.find((m) => m.id === memberId);
  const fields = member ? targetFields(member) : [];
  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 no-print" role="dialog" aria-label="Drawing viewer">
      <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-lg bg-card shadow-lg lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
            <b className="truncate">{d.name}</b>
            <SmallButton onClick={() => onPage(Math.max(1, page - 1))}>◀</SmallButton>
            <span>
              Page {page} / {d.pages}
            </span>
            <SmallButton onClick={() => onPage(Math.min(d.pages, page + 1))}>▶</SmallButton>
            <SmallButton onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>−</SmallButton>
            <span>{Math.round(scale * 100)} %</span>
            <SmallButton onClick={() => setScale((s) => Math.min(4, s + 0.25))}>+</SmallButton>
            <div className="ml-auto">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-muted p-4">
            {state === "missing" ? (
              <p className="text-sm text-destructive">
                This drawing is not stored in this browser — upload the PDF again to view it.
              </p>
            ) : null}
            <canvas ref={canvas} className="mx-auto bg-white shadow" />
          </div>
        </div>
        <div className="w-full space-y-3 overflow-auto border-l border-border p-4 lg:w-[340px]">
          <Field label="Sheet label for this page (title block)">
            <TextInput
              value={sheet}
              placeholder="e.g. S-2"
              onChange={(v) =>
                set((x) => ({
                  ...x,
                  drawings: x.drawings.map((y) =>
                    y.id === id ? { ...y, sheets: { ...y.sheets, [String(page)]: v } } : y,
                  ),
                }))
              }
            />
          </Field>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Record a value from this page
          </div>
          <Field label="Item">
            <TextInput value={item} placeholder="e.g. Rafter span R-1" onChange={setItem} />
          </Field>
          <Field label="Value as shown" hint={`Feet-inches (12'-6"), fractions (11-7/8) or decimals`}>
            <TextInput value={value} onChange={setValue} />
          </Field>
          <Grid>
            <Field label="Feeds member">
              <Select
                value={memberId}
                options={[{ value: "", label: "— none —" }, ...p.members.map((m) => ({ value: m.id, label: m.mark }))]}
                onChange={(v) => {
                  setMemberId(v);
                  setField("");
                }}
              />
            </Field>
            <Field label="Field">
              <Select
                value={field}
                options={[{ value: "", label: "—" }, ...fields.map((f) => ({ value: f.field, label: f.label }))]}
                onChange={setField}
              />
            </Field>
          </Grid>
          <AddButton
            onClick={() => {
              if (!item.trim() || !value.trim()) return;
              const r: ReviewItem = {
                id: newId("rv"),
                drawingId: id,
                page,
                sheet,
                item: item.trim(),
                value: value.trim(),
                target: memberId && field ? { memberId, field } : undefined,
                confirmed: false,
                note: "",
              };
              set((x) => ({ ...x, review: [...x.review, r] }));
              setItem("");
              setValue("");
            }}
          >
            + Add to review table (unconfirmed)
          </AddButton>
          <Hint>Values are applied to members only after you confirm them in the review table.</Hint>
          <ReviewTable p={{ ...p, review: p.review.filter((r) => r.drawingId === id && r.page === page) }} set={set} />
        </div>
      </div>
    </div>
  );
}
