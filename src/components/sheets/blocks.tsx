/** Blocks shared by every member sheet: loads, reactions, summary, result, final summary, assumptions, notes. */

import type React from "react";
import { fmt, fmtFtIn } from "@/engine/core/fmt";
import { LOAD_TYPES, type LoadType } from "@/engine/core/loads";
import { provenanceLabel, type AssumptionEntry } from "@/engine/core/provenance";
import type { Check } from "@/engine/design/wood";
import type { LoadLine, MemberReaction, MemberResultBase } from "@/engine/members";
import {
  B,
  DataTable,
  Flag,
  NotesList,
  ResultBlock,
  SectionHead,
  SummaryTable,
  TextRow,
  TR,
  eq,
} from "../report/primitives";
import { DESIGN_AID, f0, f2, f3, unitOf } from "./common";

const TYPE_NAME: Record<LoadType, string> = {
  D: "Dead",
  L: "Live",
  Lr: "Roof live",
  S: "Snow",
  W: "Wind",
  E: "Seismic",
};

export function LoadLines({ lines, title = "Applied loading" }: { lines: LoadLine[]; title?: string }) {
  return (
    <>
      <SectionHead title={title} />
      {lines.length === 0 ? <TextRow italic>No applied loads.</TextRow> : null}
      {lines.map((l, i) => (
        <TR
          key={i}
          desc={
            <>
              {l.label}
              {l.verify ? <Flag> (override — VERIFY)</Flag> : null}
            </>
          }
          expr={
            <>
              {TYPE_NAME[l.type]}: {l.expr}
              {l.unit === "lb" && l.expr.startsWith("T_") ? "" : ""}
              {eq(`${fmt(l.value, l.unit === "lb" ? 0 : 2)} ${l.unit === "plf" ? "lb/ft" : l.unit}`)}
            </>
          }
        />
      ))}
    </>
  );
}

export function ReactionTable({
  reactions,
  title = "Reactions delivered (unfactored, by load type)",
  perFoot,
}: {
  reactions: MemberReaction[];
  title?: string;
  perFoot?: boolean;
}) {
  const used = LOAD_TYPES.filter((t) => reactions.some((r) => Math.abs(r.byType[t]) > 1e-6));
  return (
    <DataTable
      caption={title}
      head={[
        "Support",
        ...used.map((t) => `R${t} (lb)`),
        "Max down (lb)",
        "Min net (lb)",
        ...(perFoot ? ["Per ft of support (plf)"] : []),
      ]}
      align={["left", ...used.map(() => "right" as const), "right", "right", "left"]}
      rows={reactions.map((r) => [
        r.name,
        ...used.map((t) => f0(r.byType[t])),
        `${f0(r.maxDown)} (${r.maxDownCombo})`,
        r.minNet < -1e-6 ? <Flag key="u">{`${f0(r.minNet)} uplift (${r.minNetCombo})`}</Flag> : `${f0(r.minNet)}`,
        ...(perFoot && r.perFoot ? [used.map((t) => `${t} ${f0(r.perFoot![t])}`).join(", ")] : perFoot ? ["—"] : []),
      ])}
    />
  );
}

export const checkUnit = (c: Check) => unitOf(c.unit);

export function fmtDemand(c: Check) {
  const u = checkUnit(c);
  const d =
    c.unit === "in"
      ? f3(c.demand)
      : c.unit === ""
        ? f3(c.demand)
        : c.unit === "nails"
          ? f2(c.demand)
          : fmt(c.demand, c.unit === "lb" || c.unit === "lb-ft" ? 0 : 1);
  return u ? `${d} ${u}` : d;
}

export function fmtCapacity(c: Check) {
  const u = checkUnit(c);
  const d =
    c.unit === "in"
      ? f3(c.capacity)
      : c.unit === ""
        ? fmt(c.capacity, c.capacity >= 10 ? 0 : 2)
        : c.unit === "nails"
          ? f0(c.capacity)
          : fmt(c.capacity, c.unit === "lb" || c.unit === "lb-ft" ? 0 : 1);
  return u ? `${d} ${u}` : d;
}

export function ChecksSummary({ checks }: { checks: Check[] }) {
  return (
    <SummaryTable
      title="Governing checks summary"
      rows={checks.map((c) => [
        `${c.name}${c.combo && c.combo !== "—" ? ` [${c.combo}]` : ""}`,
        fmtDemand(c),
        fmtCapacity(c),
        Number.isFinite(c.ratio) ? f3(c.ratio) : "—",
        c.pass,
      ])}
    />
  );
}

export function MemberResult({ r, extra }: { r: MemberResultBase; extra?: React.ReactNode[] }) {
  const g = r.governing;
  const lines: React.ReactNode[] = [
    <>
      Required member: <b>{r.callout}</b>
    </>,
    <>
      Governing: {g.name}
      {g.combo && g.combo !== "—" ? ` (${g.combo})` : ""} — D/C = <b>{f3(g.ratio)}</b>
    </>,
    ...(extra ?? []),
  ];
  if (!r.pass && r.alternatives) {
    const a = r.alternatives;
    if (a.lightest)
      lines.push(
        <>
          Lightest passing size (same grade, same spacing): <b>{a.lightest}</b>
        </>,
      );
    if (a.maxSpacing !== undefined)
      lines.push(
        <>
          Largest passing standard spacing at this span: <b>{fmt(a.maxSpacing, a.maxSpacing % 1 ? 1 : 0)} in. o.c.</b>
        </>,
      );
    if (a.maxSpan !== undefined)
      lines.push(
        <>
          Maximum span for this size and spacing: <b>{fmtFtIn(a.maxSpan)}</b>
        </>,
      );
    if (!a.lightest && a.maxSpacing === undefined && a.maxSpan === undefined)
      lines.push(<>No passing alternative in the standard list — revise framing.</>);
  }
  return <ResultBlock pass={r.pass} lines={lines} />;
}

export function FinalSummary({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <DataTable caption="Final design summary" head={["Item", "Design"]} rows={rows.map(([a, b]) => [a, b])} />;
}

export function AssumptionRows({ items }: { items: AssumptionEntry[] }) {
  if (!items.length) return null;
  return (
    <>
      <SectionHead title="Assumptions & overrides" />
      <DataTable
        head={["Item", "Value", "Source"]}
        rows={items.map((a) => [
          a.item,
          a.verify || a.provenance.kind === "override" ? <Flag key="v">{a.value}</Flag> : a.value,
          <>
            {provenanceLabel(a.provenance)}
            {a.verify ? <Flag> — VERIFY</Flag> : null}
          </>,
        ])}
      />
    </>
  );
}

export function SpecificNotes({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <NotesList
      title="Specific notes"
      notes={flags.map((f, i) => (f.includes("VERIFY") ? <Flag key={i}>{f}</Flag> : f))}
    />
  );
}

export function LimitationNotes({ notes }: { notes: React.ReactNode[] }) {
  return <NotesList notes={[...notes, <b key="aid">{DESIGN_AID}</b>]} />;
}

export function govDeflection(r: MemberResultBase): string {
  const c = r.checks.filter((k) => k.name.startsWith("Deflection")).sort((a, b) => b.ratio - a.ratio)[0];
  return c
    ? `${f3(c.demand)} in ≤ ${f3(c.capacity)} in (${c.name.replace("Deflection, ", "")}, D/C ${f3(c.ratio)})`
    : "—";
}

export const verifyCount = (items: AssumptionEntry[]) => items.filter((a) => a.verify).length;

export { B };
