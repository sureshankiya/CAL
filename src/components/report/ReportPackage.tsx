/** Renders the house report (all sheets in order) or a single sheet from the package list. */

import type { Project, ProjectDesign } from "@/engine/project";
import { HoldownFootingSheet, MasonryWallSheet, TieInSheet, WoodTrussSheet } from "../sheets/Phase4Sheets";
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
import { ConnectorSheet, FootingSheet, PostSheet, ShearWallSheet, TrussSheet, WallSheet } from "../sheets/Phase2Sheets";
import { LateralSheet, LoadPathSheet } from "../sheets/LateralSheets";
import {
  BasePlateSheet,
  DiaphragmSheet,
  LedgerSheet,
  SteelBeamSheet,
  SteelColumnSheet,
  TransferSheet,
  UpliftSheet,
} from "../sheets/Phase3Sheets";
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
  if (spec.kind === "connector") {
    const src = p.members.find((m) => m.id === spec.sourceId);
    out.add(`${src?.mark ?? "?"} reaction ${spec.support + 1}`);
  }
  if (spec.kind === "basePlate" && spec.sourceId) {
    const src = p.members.find((m) => m.id === spec.sourceId);
    out.add(`${src?.mark ?? "?"} base reactions (axial and shear)`);
  }
  if (spec.kind === "uplift") {
    const src = p.members.find((m) => m.id === spec.sourceId);
    out.add(`${src?.mark ?? "?"} reaction ${spec.support + 1} (per foot, wind uplift)`);
  }
  if (spec.kind === "ceilingJoist" && spec.tensionFrom) {
    const src = p.members.find((m) => m.id === spec.tensionFrom);
    out.add(`${src?.mark ?? "?"} thrust (tension)`);
  }
  return [...out];
}

function connectionsOf(project: Project, design: ProjectDesign, id: string): string[] {
  return project.members
    .filter((m) => (m.kind === "connector" || m.kind === "uplift") && m.sourceId === id)
    .map((m) => {
      const r = design.outcomes.get(m.id)?.result;
      return r ? `${r.mark}: ${r.callout}` : `${m.mark}: (error)`;
    });
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
    case "lateral":
      return <LateralSheet m={meta} design={design} />;
    case "loadpath":
      return <LoadPathSheet m={meta} design={design} />;
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
      const common = {
        m: meta,
        index,
        total: members.length,
        received,
        connections: connectionsOf(project, design, r.id),
      };
      switch (r.kind) {
        case "ijoist":
          return <IJoistSheet m={meta} r={r} index={index} total={members.length} received={received} />;
        case "wall":
          return <WallSheet {...common} r={r} />;
        case "post":
          return <PostSheet {...common} r={r} />;
        case "truss":
          return <TrussSheet {...common} r={r} />;
        case "connector":
          return <ConnectorSheet {...common} r={r} />;
        case "footing":
          return <FootingSheet {...common} r={r} />;
        case "shearWall":
          return <ShearWallSheet {...common} r={r} />;
        case "steelBeam":
          return <SteelBeamSheet {...common} r={r} />;
        case "steelColumn":
          return <SteelColumnSheet {...common} r={r} />;
        case "basePlate":
          return <BasePlateSheet {...common} r={r} />;
        case "diaphragm":
          return <DiaphragmSheet {...common} r={r} />;
        case "transfer":
          return <TransferSheet {...common} r={r} />;
        case "uplift":
          return <UpliftSheet {...common} r={r} />;
        case "ledger":
          return <LedgerSheet {...common} r={r} />;
        case "masonryWall":
          return <MasonryWallSheet {...common} r={r} />;
        case "holdownFooting":
          return <HoldownFootingSheet {...common} r={r} />;
        case "tieIn":
          return <TieInSheet {...common} r={r} />;
        case "woodTruss":
          return <WoodTrussSheet {...common} r={r} />;
        default:
          return (
            <WoodMemberSheet
              m={meta}
              r={r}
              index={index}
              total={members.length}
              received={received}
              connections={common.connections}
            />
          );
      }
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
