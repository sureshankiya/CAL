import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ReportPackage, SheetView } from "@/components/report/ReportPackage";
import { buildPackage } from "@/components/report/package";
import { MemberEditor } from "@/components/editors/MemberEditor";
import {
  AssembliesPanel,
  CriteriaPanel,
  HardwarePanel,
  LateralPanel,
  LevelsPanel,
  MembersPanel,
  ProjectInfoPanel,
} from "@/components/editors/ProjectPanels";
import { DrawingsPanel } from "@/components/drawings/DrawingsPanel";
import { getCycle } from "@/engine/core/codes";
import {
  designProject,
  duplicateMember,
  exampleProject,
  fileNameFor,
  loadLocal,
  newMemberSpec,
  newProject,
  parseProject,
  saveLocal,
  serializeProject,
  type MemberSpec,
  type Project,
} from "@/engine/project";

export const Route = createFileRoute("/")({ component: Index });

const btn =
  "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted";
const primary =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90";

function Index() {
  const [project, setProject] = useState<Project>(() => exampleProject());
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(() => exampleProject().members[0]?.id);
  const [mode, setMode] = useState<"sheet" | "package">("sheet");
  const [sheetKey, setSheetKey] = useState<string>("cover");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | undefined>({
    tone: "info",
    text: "Example house loaded — use New or Open to start your own project.",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // restore the autosaved project after mount (browser storage is not available during SSR)
  useEffect(() => {
    const saved = loadLocal();
    if (saved) {
      setProject(saved);
      setActiveId(saved.members[0]?.id);
      setMessage({ tone: "info", text: "Restored your last project from this browser." });
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveLocal(project), 400);
    return () => clearTimeout(t);
  }, [project, loaded]);

  const deferred = useDeferredValue(project);
  const design = useMemo(() => designProject(deferred), [deferred]);
  const entries = useMemo(() => buildPackage(deferred, design), [deferred, design]);
  const cycle = getCycle(project.cycleId);
  const active = project.members.find((m) => m.id === activeId);
  const entry = entries.find((e) => e.key === sheetKey) ?? entries[0];

  const set = (fn: (p: Project) => Project) => setProject((p) => fn(p));
  const selectMember = (id: string) => {
    setActiveId(id);
    setSheetKey(`m-${id}`);
    setMode("sheet");
  };
  const updateMember = (m: MemberSpec) =>
    set((p) => ({ ...p, members: p.members.map((x) => (x.id === m.id ? m : x)) }));

  function openFile(f: File) {
    f.text().then((text) => {
      const r = parseProject(text);
      if (!r.ok) {
        setMessage({ tone: "error", text: `Could not open ${f.name}: ${r.errors.join("; ")}` });
        return;
      }
      setProject(r.project);
      setActiveId(r.project.members[0]?.id);
      setSheetKey("cover");
      setMessage({ tone: "info", text: `Opened ${f.name}.` });
    });
  }

  function saveFile() {
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameFor(project);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handlePrint() {
    const errors = [...design.outcomes.values()].filter((o) => o.error);
    if (errors.length) {
      setMessage({
        tone: "error",
        text: `Printing blocked — fix the members with errors first: ${errors.map((e) => `${e.spec.mark} (${e.error})`).join("; ")}`,
      });
      return;
    }
    setMode("package");
    setTimeout(() => window.print(), 150);
  }

  return (
    <div className="min-h-screen bg-background text-foreground print:min-h-0 print:bg-white">
      <header className="no-print border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">HouseCalc</h1>
            <p className="text-xs text-muted-foreground">
              Full-house structural calculation package — {cycle.label} · {cycle.nds} · {cycle.asce7}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                const p = newProject();
                setProject(p);
                setActiveId(undefined);
                setSheetKey("cover");
                setMessage({ tone: "info", text: "New project started." });
              }}
            >
              New
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const p = exampleProject();
                setProject(p);
                setActiveId(p.members[0]?.id);
                setSheetKey("cover");
                setMessage({ tone: "info", text: "Example house loaded." });
              }}
            >
              Example
            </button>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
              Open…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
                e.target.value = "";
              }}
            />
            <button type="button" className={btn} onClick={saveFile}>
              Save
            </button>
            <button type="button" onClick={handlePrint} className={primary}>
              Print / Save PDF
            </button>
          </div>
        </div>
        {message ? (
          <div
            className={`mx-auto max-w-[1500px] px-6 pb-3 text-xs ${message.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message.text}{" "}
            <button type="button" className="underline" onClick={() => setMessage(undefined)}>
              Dismiss
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-6 py-8 lg:grid-cols-[380px_1fr] print:block print:max-w-none print:p-0">
        <aside className="no-print space-y-5">
          <ProjectInfoPanel p={project} set={set} />
          <CriteriaPanel p={project} set={set} />
          <AssembliesPanel p={project} set={set} />
          <LevelsPanel p={project} set={set} />
          <LateralPanel p={project} set={set} />
          <HardwarePanel p={project} set={set} />
          <MembersPanel
            p={project}
            design={design}
            activeId={activeId}
            onSelect={selectMember}
            onAdd={(kind, sid, lid) => {
              const m = newMemberSpec(project, kind, sid, lid);
              set((p) => ({ ...p, members: [...p.members, m] }));
              selectMember(m.id);
            }}
            onDuplicate={(m) => {
              const c = duplicateMember(project, m);
              set((p) => ({ ...p, members: [...p.members, c] }));
              selectMember(c.id);
            }}
            onRemove={(id) => {
              set((p) => ({
                ...p,
                members: p.members
                  .filter((m) => m.id !== id)
                  .map((m) => ({
                    ...m,
                    links: m.links.filter((l) => l.sourceId !== id),
                    ...(m.kind === "ceilingJoist" && m.tensionFrom === id ? { tensionFrom: undefined } : {}),
                    ...(m.kind === "shearWall" && m.upliftFrom === id ? { upliftFrom: undefined } : {}),
                  })) as MemberSpec[],
              }));
              if (activeId === id) setActiveId(undefined);
            }}
          />
          {active ? (
            <>
              <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Editing {active.mark}
                {design.outcomes.get(active.id)?.error ? (
                  <span className="ml-2 text-destructive">— {design.outcomes.get(active.id)!.error}</span>
                ) : null}
              </div>
              <MemberEditor p={project} m={active} onChange={updateMember} />
            </>
          ) : null}
          <DrawingsPanel p={project} set={set} />
        </aside>

        <main className="min-w-0">
          <div className="no-print mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className={`px-3 py-1.5 text-sm ${mode === "sheet" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                onClick={() => setMode("sheet")}
              >
                This sheet
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm ${mode === "package" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                onClick={() => setMode("package")}
              >
                Full package ({entries.length})
              </button>
            </div>
            {mode === "sheet" ? (
              <select
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                value={entry?.key}
                onChange={(e) => setSheetKey(e.target.value)}
              >
                {entries.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.sheetNo}. {e.group ? `${e.group}: ` : ""}
                    {e.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="report-preview">
            {mode === "package" ? (
              <ReportPackage project={deferred} design={design} entries={entries} />
            ) : entry ? (
              <SheetView project={deferred} design={design} entries={entries} entry={entry} />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
