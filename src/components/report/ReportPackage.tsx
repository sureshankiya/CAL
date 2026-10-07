/** Renders the house report (all sheets in order) or a single sheet from the package list. */

import type { Project, ProjectDesign } from "@/engine/project";
import { metaFor } from "../sheets/common";
import { IJoistSheet } from "../sheets/IJoistSheet";
import {
  AssumptionLogSheet,
  CoverSheet,
  CriteriaSheet,
  GeneralNotesSheet,
  LoadsSheet,
  SchedulesSheet,
  SummarySheet,
} from "../sheets/PackageSheets";
import { WoodMemberSheet } from "../sheets/WoodMemberSheet";
import { Flag, Sheet, SheetTitle, TextRow } from "./primitives";
import { packageChecks, type SheetEntry } from "./package";
import { footers, titleFields } from "../sheets/common";

function receivedFrom(p: Project, design: ProjectDesign, id: string): string[] {
  const o = design.outcomes.get(id);
  if (!o) return [];
  const out = new Set<string>();
  for (const l of o.spec.links) {
    const src = p.members.find((m) => m.id === l.sourceId);
    const r = design.outcomes.get(l.sourceId)?.result?.reactions[l.support];
    out.add(
      `${src?.mark ?? "?"} reaction ${r?.name ?? l.support + 1}${l.factor !== 1 ? ` × ${l.factor}` : ""} (${l.kind === "line" ? "line load" : "point load"})`,
    );
  }
  const spec = o.spec;
  if (spec.kind === "ceilingJoist" && spec.tensionFrom) {
    const src = p.members.find((m) => m.id === spec.tensionFrom);
    out.add(`${src?.mark ?? "?"} thrust (tension)`);
  }
  return [...out];
}

export function SheetView({
  project,
  design,
  entries,
  entry,
}: {
  project: Project;
  design: ProjectDesign;
  entries: SheetEntry[];
  entry: SheetEntry;
}) {
  const meta = { ...metaFor(project, entry.sheetNo, entries.length, entry.section), first: true };
  return <SheetBody project={project} design={design} entries={entries} entry={entry} meta={meta} />;
}

function SheetBody({
  project,
  design,
  entries,
  entry,
  meta,
}: {
  project: Project;
  design: ProjectDesign;
  entries: SheetEntry[];
  entry: SheetEntry;
  meta: ReturnType<typeof metaFor>;
}) {
  switch (entry.kind) {
    case "cover":
      return <CoverSheet m={meta} design={design} entries={entries} />;
    case "summary":
      return <SummarySheet m={meta} design={design} entries={entries} checks={packageChecks(project, design)} />;
    case "criteria":
      return <CriteriaSheet m={meta} design={design} />;
    case "loads":
      return <LoadsSheet m={meta} />;
    case "schedules":
      return <SchedulesSheet m={meta} design={design} />;
    case "general-notes":
      return <GeneralNotesSheet m={meta} design={design} />;
    case "assumptions":
      return <AssumptionLogSheet m={meta} design={design} />;
    case "member": {
      const o = design.outcomes.get(entry.memberId!);
      const members = entries.filter((e) => e.kind === "member");
      const index = members.findIndex((e) => e.key === entry.key) + 1;
      const received = receivedFrom(project, design, entry.memberId!);
      if (!o?.result) {
        const ft = footers(meta);
        return (
          <Sheet f={titleFields(meta)} footerLeft={ft.left} footerCenter={ft.center} first={meta.first}>
            <SheetTitle title={`${o?.spec.mark ?? "Member"} — not designed`} />
            <TextRow>
              <Flag>{o?.error ?? "Member not found"}</Flag>
            </TextRow>
          </Sheet>
        );
      }
      const r = o.result;
      if (r.kind === "ijoist")
        return <IJoistSheet m={meta} r={r} index={index} total={members.length} received={received} />;
      return <WoodMemberSheet m={meta} r={r} index={index} total={members.length} received={received} />;
    }
  }
}

export function ReportPackage({
  project,
  design,
  entries,
}: {
  project: Project;
  design: ProjectDesign;
  entries: SheetEntry[];
}) {
  return (
    <>
      {entries.map((e) => (
        <SheetBody
          key={e.key}
          project={project}
          design={design}
          entries={entries}
          entry={e}
          meta={metaFor(project, e.sheetNo, entries.length, e.section)}
        />
      ))}
    </>
  );
}
