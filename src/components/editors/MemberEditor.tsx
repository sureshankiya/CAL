/** Member editors — one form per member kind, plus the shared load, link and support sub-editors. */

import type { ReactNode } from "react";
import { LOAD_TYPES, type LoadType } from "@/engine/core/loads";
import { NAILS } from "@/engine/design/dowel";
import { GLULAM, SCL } from "@/engine/data/engineered";
import { TJI_SERIES, tjiDepths } from "@/engine/data/ijoist";
import { GRADES_BY_SPECIES, TIMBER_GRADES, type Grade, type Species } from "@/engine/data/sawn";
import { DIMENSION_SIZES, GLULAM_WIDTHS, PSL_WIDTHS, SAWN_SIZES, SCL_DEPTHS } from "@/engine/data/sections";
import { DEFLECTION_PRESETS } from "@/engine/loads/deflection";
import { LIVE_LOADS } from "@/engine/loads/live";
import {
  supportCount,
  supportLabels,
  type BeamSpec,
  type ConnectorSpec,
  type FootingSpec,
  type LinkedLoad,
  type MemberSpec,
  type PostSpec,
  type Project,
  type ShearWallSpec,
  type TrussSpec,
  type WallSpec,
} from "@/engine/project";
import { SHEATHING, edgeSpacings } from "@/engine/data/sdpws";
import { ANCHOR_STEELS } from "@/engine/design/anchors";
import { BARS } from "@/engine/design/concrete";
import { newId } from "@/engine/project/templates";
import {
  AddButton,
  Check,
  Collapsible,
  Field,
  Grid,
  Hint,
  NumberInput,
  Section,
  Select,
  SmallButton,
  TextInput,
} from "./fields";

type Upd<T> = (patch: Partial<T>) => void;

const SPECIES: Array<{ value: Species; label: string }> = [
  { value: "DF-L", label: "Douglas Fir-Larch" },
  { value: "HF", label: "Hem-Fir" },
  { value: "SPF", label: "Spruce-Pine-Fir" },
  { value: "SP", label: "Southern Pine" },
];
const SPACINGS = [12, 16, 19.2, 24, 32, 48];

function gradesFor(species: Species, size: string): Grade[] {
  const t = Number(size.split("x")[0]);
  return t >= 5 ? TIMBER_GRADES : GRADES_BY_SPECIES[species];
}

function SawnFields({
  species,
  grade,
  size,
  sizes,
  onChange,
}: {
  species: Species;
  grade: Grade;
  size: string;
  sizes: readonly string[];
  onChange: (p: { species?: Species; grade?: Grade; size?: string }) => void;
}) {
  const grades = gradesFor(species, size);
  return (
    <>
      <Grid>
        <Field label="Species">
          <Select
            value={species}
            options={SPECIES}
            onChange={(v) =>
              onChange({ species: v, grade: gradesFor(v, size).includes(grade) ? grade : gradesFor(v, size)[0] })
            }
          />
        </Field>
        <Field label="Grade">
          <Select
            value={grades.includes(grade) ? grade : grades[0]}
            options={grades}
            onChange={(v) => onChange({ grade: v })}
          />
        </Field>
      </Grid>
      <Field label="Nominal size">
        <Select
          value={size}
          options={sizes}
          onChange={(v) =>
            onChange({ size: v, grade: gradesFor(species, v).includes(grade) ? grade : gradesFor(species, v)[0] })
          }
        />
      </Field>
    </>
  );
}

function SpacingField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Field label="Spacing (in. o.c.)">
      <select
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {SPACINGS.map((s) => (
          <option key={s} value={s}>
            {s}″
          </option>
        ))}
      </select>
    </Field>
  );
}

function SpansFields({
  spans,
  left,
  right,
  onChange,
  cantilevers = true,
}: {
  spans: number[];
  left?: number;
  right?: number;
  onChange: (p: { spans?: number[]; leftCantilever?: number; rightCantilever?: number }) => void;
  cantilevers?: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        {spans.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={`Span ${i + 1} (ft)`}>
                <NumberInput
                  value={s}
                  min={0}
                  step="0.25"
                  onChange={(v) => onChange({ spans: spans.map((x, k) => (k === i ? (v ?? x) : x)) })}
                />
              </Field>
            </div>
            {spans.length > 1 ? (
              <SmallButton
                tone="danger"
                title="Remove span"
                onClick={() => onChange({ spans: spans.filter((_, k) => k !== i) })}
              >
                ✕
              </SmallButton>
            ) : null}
          </div>
        ))}
        {spans.length < 3 ? (
          <AddButton onClick={() => onChange({ spans: [...spans, spans[spans.length - 1]] })}>
            + Add continuous span
          </AddButton>
        ) : null}
      </div>
      {cantilevers ? (
        <Grid>
          <Field label="Left cantilever (ft)">
            <NumberInput
              value={left ?? 0}
              min={0}
              step="0.25"
              onChange={(v) => onChange({ leftCantilever: v || undefined })}
            />
          </Field>
          <Field label="Right cantilever (ft)">
            <NumberInput
              value={right ?? 0}
              min={0}
              step="0.25"
              onChange={(v) => onChange({ rightCantilever: v || undefined })}
            />
          </Field>
        </Grid>
      ) : null}
    </>
  );
}

function BearingFields({
  bearing,
  n,
  names,
  onChange,
}: {
  bearing: number[];
  n: number;
  names?: string[];
  onChange: (b: number[]) => void;
}) {
  const list = Array.from({ length: n }, (_, i) => bearing[i] ?? bearing[bearing.length - 1] ?? 1.5);
  return (
    <Grid cols={n > 2 ? 3 : 2}>
      {list.map((b, i) => (
        <Field key={i} label={`Bearing ${names?.[i] ?? String.fromCharCode(65 + i)} (in)`}>
          <NumberInput
            value={b}
            min={0.5}
            step="0.25"
            onChange={(v) => onChange(list.map((x, k) => (k === i ? (v ?? x) : x)))}
          />
        </Field>
      ))}
    </Grid>
  );
}

function DeadField({
  p,
  value,
  kinds,
  onChange,
  label = "Dead load",
  roof,
}: {
  p: Project;
  value: { assemblyId?: string; psf?: number; basis?: "sloped" | "horizontal" };
  kinds?: string[];
  onChange: (v: { assemblyId?: string; psf?: number; basis?: "sloped" | "horizontal" }) => void;
  label?: string;
  /** roof context: direct psf entries default to the sloped surface */
  roof?: boolean;
}) {
  const options = p.assemblies.filter((a) => !kinds || kinds.includes(a.kind));
  const sel = value.assemblyId ?? "__psf";
  const basis = value.basis ?? (roof ? "sloped" : "horizontal");
  return (
    <>
      <Field label={label}>
        <Select
          value={sel}
          options={[
            ...options.map((a) => ({ value: a.id, label: `${a.id} — ${a.name}` })),
            { value: "__psf", label: "Enter psf directly" },
          ]}
          onChange={(v) => onChange(v === "__psf" ? { psf: value.psf ?? 10, basis } : { assemblyId: v })}
        />
      </Field>
      {sel === "__psf" ? (
        <Grid>
          <Field label="Dead load (psf)">
            <NumberInput value={value.psf ?? 0} min={0} onChange={(v) => onChange({ psf: v ?? 0, basis })} />
          </Field>
          <Field label="Per ft² of">
            <Select
              value={basis}
              options={[
                { value: "sloped", label: "Roof surface (sloped)" },
                { value: "horizontal", label: "Plan area" },
              ]}
              onChange={(b) => onChange({ psf: value.psf ?? 0, basis: b })}
            />
          </Field>
        </Grid>
      ) : null}
    </>
  );
}

function LiveField({
  value,
  onChange,
  roof,
}: {
  value: { use?: string; psf?: number };
  onChange: (v: { use?: never; psf?: number } | { use: string; psf?: number }) => void;
  roof?: boolean;
}) {
  const uses = LIVE_LOADS.filter((l) => (roof ? true : !l.roof));
  return (
    <Grid>
      <Field label="Live load use">
        <Select
          value={value.use ?? "none"}
          options={uses.map((l) => ({ value: l.use, label: l.label }))}
          onChange={(v) => onChange({ use: v })}
        />
      </Field>
      <Field label="Override (psf)" hint="Blank = code value">
        <NumberInput
          value={value.psf}
          allowEmpty
          min={0}
          onChange={(v) => onChange({ use: value.use ?? "none", psf: v })}
        />
      </Field>
    </Grid>
  );
}

function DeflField({
  value,
  onChange,
}: {
  value: { preset: string; live?: number; total?: number };
  onChange: (v: { preset: never } | Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field label="Deflection limits (IBC Table 1604.3)">
        <Select
          value={value.preset}
          options={[
            ...Object.values(DEFLECTION_PRESETS).map((d) => ({
              value: d.preset,
              label: `${d.label} — L/${d.live}, L/${d.total}`,
            })),
            { value: "custom", label: "Custom" },
          ]}
          onChange={(v) => onChange({ preset: v })}
        />
      </Field>
      {value.preset === "custom" ? (
        <Grid>
          <Field label="Live L /">
            <NumberInput value={value.live ?? 360} min={60} onChange={(v) => onChange({ ...value, live: v })} />
          </Field>
          <Field label="Total L /">
            <NumberInput value={value.total ?? 240} min={60} onChange={(v) => onChange({ ...value, total: v })} />
          </Field>
        </Grid>
      ) : null}
    </>
  );
}

type Extra = {
  kind: "line" | "point";
  type: LoadType;
  label: string;
  w?: number;
  x1?: number;
  x2?: number;
  P?: number;
  x?: number;
};

function ExtraLoadsEditor({ extra, onChange }: { extra: Extra[]; onChange: (e: Extra[]) => void }) {
  const set = (i: number, patch: Partial<Extra>) => onChange(extra.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      {extra.map((e, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <TextInput value={e.label} onChange={(v) => set(i, { label: v })} placeholder="Label (e.g. wall above)" />
            </div>
            <SmallButton tone="danger" title="Remove load" onClick={() => onChange(extra.filter((_, k) => k !== i))}>
              ✕
            </SmallButton>
          </div>
          <Grid>
            <Select
              value={e.kind}
              options={[
                { value: "line", label: "Line (plf)" },
                { value: "point", label: "Point (lb)" },
              ]}
              onChange={(v) => set(i, { kind: v })}
            />
            <Select
              value={e.type}
              options={LOAD_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(v) => set(i, { type: v })}
            />
          </Grid>
          {e.kind === "line" ? (
            <Grid cols={3}>
              <Field label="w (plf)">
                <NumberInput value={e.w ?? 0} onChange={(v) => set(i, { w: v ?? 0 })} />
              </Field>
              <Field label="from x (ft)">
                <NumberInput value={e.x1} allowEmpty min={0} onChange={(v) => set(i, { x1: v })} />
              </Field>
              <Field label="to x (ft)">
                <NumberInput value={e.x2} allowEmpty min={0} onChange={(v) => set(i, { x2: v })} />
              </Field>
            </Grid>
          ) : (
            <Grid>
              <Field label="P (lb)">
                <NumberInput value={e.P ?? 0} onChange={(v) => set(i, { P: v ?? 0 })} />
              </Field>
              <Field label="at x (ft)">
                <NumberInput value={e.x ?? 0} min={0} onChange={(v) => set(i, { x: v ?? 0 })} />
              </Field>
            </Grid>
          )}
        </div>
      ))}
      <AddButton onClick={() => onChange([...extra, { kind: "line", type: "D", label: "Line load", w: 100 }])}>
        + Add line / point load
      </AddButton>
    </div>
  );
}

function LinksEditor({ p, m, onChange }: { p: Project; m: MemberSpec; onChange: (links: LinkedLoad[]) => void }) {
  const sources = p.members.filter((x) => x.id !== m.id && supportCount(x) > 0);
  const set = (i: number, patch: Partial<LinkedLoad>) =>
    onChange(m.links.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {m.links.map((l, i) => {
        const src = sources.find((s) => s.id === l.sourceId);
        const names = src ? supportLabels(src) : ["A", "B"];
        return (
          <div key={l.id} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={l.sourceId}
                  options={sources.map((s) => ({
                    value: s.id,
                    label: `${s.mark} (${s.kind === "beam" ? s.role : s.kind})`,
                  }))}
                  onChange={(v) => set(i, { sourceId: v, support: 0 })}
                />
              </div>
              <SmallButton
                tone="danger"
                title="Remove link"
                onClick={() => onChange(m.links.filter((_, k) => k !== i))}
              >
                ✕
              </SmallButton>
            </div>
            <Grid cols={3}>
              <Field label="Support">
                <Select
                  value={String(l.support)}
                  options={names.map((label, k) => ({ value: String(k), label }))}
                  onChange={(v) => set(i, { support: Number(v) })}
                />
              </Field>
              <Field label="Applied as">
                <Select
                  value={l.kind}
                  options={[
                    { value: "line", label: "Line (per ft)" },
                    { value: "point", label: "Point" },
                  ]}
                  onChange={(v) => set(i, { kind: v })}
                />
              </Field>
              <Field label="Factor">
                <NumberInput value={l.factor} min={0.01} onChange={(v) => set(i, { factor: v ?? 1 })} />
              </Field>
            </Grid>
            {l.kind === "point" ? (
              <Field label="At x (ft)">
                <NumberInput value={l.x ?? 0} min={0} onChange={(v) => set(i, { x: v ?? 0 })} />
              </Field>
            ) : (
              <Grid>
                <Field label="From x (ft)">
                  <NumberInput value={l.x1} allowEmpty min={0} onChange={(v) => set(i, { x1: v })} />
                </Field>
                <Field label="To x (ft)">
                  <NumberInput value={l.x2} allowEmpty min={0} onChange={(v) => set(i, { x2: v })} />
                </Field>
              </Grid>
            )}
          </div>
        );
      })}
      {sources.length ? (
        <AddButton
          onClick={() =>
            onChange([
              ...m.links,
              { id: newId("k"), kind: "line", sourceId: sources[0].id, support: 0, label: "", factor: 1 },
            ])
          }
        >
          + Carry reaction from another member
        </AddButton>
      ) : (
        <Hint>Add the supported members first, then link their reactions here.</Hint>
      )}
    </div>
  );
}

function CommonFields({ p, m, upd }: { p: Project; m: MemberSpec; upd: Upd<MemberSpec> }) {
  const levels = p.structures.flatMap((s) =>
    s.levels.map((l) => ({
      value: `${s.id}|${l.id}`,
      label: `${p.structures.length > 1 ? `${s.name} — ` : ""}${l.name}`,
    })),
  );
  return (
    <>
      <Grid>
        <Field label="Mark">
          <TextInput value={m.mark} onChange={(v) => upd({ mark: v })} />
        </Field>
        <Field label="Level">
          <Select
            value={`${m.structureId}|${m.levelId}`}
            options={levels}
            onChange={(v) => {
              const [structureId, levelId] = v.split("|");
              upd({ structureId, levelId });
            }}
          />
        </Field>
      </Grid>
      <Field label="Description">
        <TextInput value={m.description} onChange={(v) => upd({ description: v })} placeholder="Location / notes" />
      </Field>
      <Grid>
        <Field label="Status">
          <Select
            value={m.status}
            options={[
              { value: "new", label: "New" },
              { value: "existing", label: "Existing (re-check)" },
              { value: "modified", label: "Existing — modified" },
            ]}
            onChange={(v) => upd({ status: v })}
          />
        </Field>
        {m.status !== "new" ? (
          <Check checked={!!m.fieldVerified} onChange={(v) => upd({ fieldVerified: v })} label="Field verified" />
        ) : (
          <span />
        )}
      </Grid>
      {m.status !== "new" ? (
        <Field label="Existing condition note">
          <TextInput
            value={m.existingNote ?? ""}
            onChange={(v) => upd({ existingNote: v })}
            placeholder="e.g. per site visit 2026-09-30"
          />
        </Field>
      ) : null}
    </>
  );
}

function KcrField({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <Field label="K_cr (blank = project default)" hint="1.0 = IBC D + L; 1.5 = NDS 3.5.2 creep">
      <NumberInput value={value} allowEmpty min={0.5} onChange={onChange} />
    </Field>
  );
}

export function MemberEditor({ p, m, onChange }: { p: Project; m: MemberSpec; onChange: (m: MemberSpec) => void }) {
  const upd = (patch: Partial<MemberSpec>) => onChange({ ...m, ...patch } as MemberSpec);
  let body: ReactNode = null;
  switch (m.kind) {
    case "joist":
      body = (
        <>
          <Section title="Member">
            <CommonFields p={p} m={m} upd={upd} />
            <SawnFields
              species={m.species}
              grade={m.grade}
              size={m.size}
              sizes={DIMENSION_SIZES.filter((s) => s.startsWith("2x") || s.startsWith("3x"))}
              onChange={(x) => upd(x)}
            />
            <SpacingField value={m.spacing} onChange={(v) => upd({ spacing: v })} />
          </Section>
          <Section title="Spans and supports">
            <SpansFields spans={m.spans} left={m.leftCantilever} right={m.rightCantilever} onChange={(x) => upd(x)} />
            <BearingFields bearing={m.bearing} n={m.spans.length + 1} onChange={(b) => upd({ bearing: b })} />
            <Field
              label="Bottom-edge bracing interval (ft)"
              hint="Negative moment over supports / cantilever; 0 = continuous ceiling"
            >
              <NumberInput value={m.luBottom} min={0} onChange={(v) => upd({ luBottom: v ?? 0 })} />
            </Field>
            <Check
              checked={m.rule441}
              onChange={(v) => upd({ rule441: v })}
              label="Bracing per NDS 4.4.1.2 provided (C_L = 1.0)"
            />
          </Section>
          <Section title="Loading">
            <DeadField p={p} value={m.dead} kinds={["floor", "deck", "ceiling"]} onChange={(v) => upd({ dead: v })} />
            <LiveField value={m.live} onChange={(v) => upd({ live: v as typeof m.live })} />
            <Collapsible title={`Additional loads (${m.extra.length})`}>
              <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
            </Collapsible>
            <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as typeof m.deflection })} />
            <KcrField value={m.Kcr} onChange={(v) => upd({ Kcr: v })} />
            <Grid>
              <Check checked={!!m.wetService} onChange={(v) => upd({ wetService: v })} label="Wet service" />
              <Check checked={!!m.incised} onChange={(v) => upd({ incised: v })} label="Incised" />
            </Grid>
            <Check
              checked={!!m.addSelfWeight}
              onChange={(v) => upd({ addSelfWeight: v })}
              label="Add member self weight (not in assembly)"
            />
          </Section>
        </>
      );
      break;
    case "rafter":
      body = (
        <>
          <Section title="Member">
            <CommonFields p={p} m={m} upd={upd} />
            <SawnFields
              species={m.species}
              grade={m.grade}
              size={m.size}
              sizes={DIMENSION_SIZES.filter((s) => s.startsWith("2x"))}
              onChange={(x) => upd(x)}
            />
            <SpacingField value={m.spacing} onChange={(v) => upd({ spacing: v })} />
          </Section>
          <Section title="Roof geometry">
            <Grid cols={3}>
              <Field label="Pitch (in 12)">
                <NumberInput value={m.rise} min={0.5} max={24} onChange={(v) => upd({ rise: v ?? m.rise })} />
              </Field>
              <Field label="Run (ft)">
                <NumberInput value={m.run} min={1} step="0.25" onChange={(v) => upd({ run: v ?? m.run })} />
              </Field>
              <Field label="Overhang (ft)">
                <NumberInput value={m.overhang} min={0} step="0.25" onChange={(v) => upd({ overhang: v ?? 0 })} />
              </Field>
            </Grid>
            <Field label="Ridge">
              <Select
                value={m.ridge}
                options={[
                  { value: "beam", label: "Structural ridge beam / bearing" },
                  { value: "board", label: "Ridge board — rafters tied at plate" },
                ]}
                onChange={(v) => upd({ ridge: v })}
              />
            </Field>
            {m.ridge === "board" ? (
              <Field label="Tie / ceiling joist spacing (in)">
                <NumberInput value={m.tieSpacing ?? m.spacing} min={12} onChange={(v) => upd({ tieSpacing: v })} />
              </Field>
            ) : (
              <Field label="Ridge seat length (in, 0 = hanger)">
                <NumberInput value={m.ridgeSeat} min={0} onChange={(v) => upd({ ridgeSeat: v ?? 0 })} />
              </Field>
            )}
            <Grid>
              <Field label="Plate seat (in)">
                <NumberInput value={m.plateSeat} min={1} onChange={(v) => upd({ plateSeat: v ?? m.plateSeat })} />
              </Field>
              <Field label="Birdsmouth depth (in)">
                <NumberInput value={m.seatCut} min={0} onChange={(v) => upd({ seatCut: v ?? 0 })} />
              </Field>
            </Grid>
            <Field label="Bottom-edge bracing at overhang (ft)">
              <NumberInput value={m.luBottom} min={0} onChange={(v) => upd({ luBottom: v ?? 0 })} />
            </Field>
            <Check checked={m.gable} onChange={(v) => upd({ gable: v })} label="Hip or gable roof (unbalanced snow)" />
            <Check
              checked={m.rule441}
              onChange={(v) => upd({ rule441: v })}
              label="Bracing per NDS 4.4.1.2 provided (C_L = 1.0)"
            />
          </Section>
          <Section title="Loading">
            <DeadField p={p} value={m.dead} kinds={["roof"]} roof onChange={(v) => upd({ dead: v })} />
            <Check checked={m.roofLive} onChange={(v) => upd({ roofLive: v })} label="Roof live load" />
            <Check checked={m.snow} onChange={(v) => upd({ snow: v })} label="Snow (site p_g)" />
            <Field
              label="C&C wind pressure normal to roof (psf, − = uplift)"
              hint="Strength level; blank = not checked"
            >
              <NumberInput value={m.windPressure} allowEmpty onChange={(v) => upd({ windPressure: v })} />
            </Field>
            <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as typeof m.deflection })} />
            <KcrField value={m.Kcr} onChange={(v) => upd({ Kcr: v })} />
          </Section>
        </>
      );
      break;
    case "ceilingJoist":
      body = (
        <>
          <Section title="Member">
            <CommonFields p={p} m={m} upd={upd} />
            <SawnFields
              species={m.species}
              grade={m.grade}
              size={m.size}
              sizes={DIMENSION_SIZES.filter((s) => s.startsWith("2x"))}
              onChange={(x) => upd(x)}
            />
            <SpacingField value={m.spacing} onChange={(v) => upd({ spacing: v })} />
          </Section>
          <Section title="Spans and supports">
            <SpansFields spans={m.spans} onChange={(x) => upd({ spans: x.spans ?? m.spans })} cantilevers={false} />
            <BearingFields bearing={m.bearing} n={m.spans.length + 1} onChange={(b) => upd({ bearing: b })} />
            <Field label="Top-edge bracing interval (ft)">
              <NumberInput value={m.luTop} min={0} onChange={(v) => upd({ luTop: v ?? 0 })} />
            </Field>
            <Check
              checked={m.rule441}
              onChange={(v) => upd({ rule441: v })}
              label="Bracing per NDS 4.4.1.2 provided (C_L = 1.0)"
            />
          </Section>
          <Section title="Loading and rafter tie">
            <DeadField p={p} value={m.dead} kinds={["ceiling", "floor"]} onChange={(v) => upd({ dead: v })} />
            <LiveField value={m.live} onChange={(v) => upd({ live: v as typeof m.live })} />
            <Field label="Acts as rafter tie for">
              <Select
                value={m.tensionFrom ?? ""}
                options={[
                  { value: "", label: "— none —" },
                  ...p.members.filter((x) => x.kind === "rafter").map((x) => ({ value: x.id, label: x.mark })),
                ]}
                onChange={(v) =>
                  upd({
                    tensionFrom: v || undefined,
                    heel: v ? (m.heel ?? { nail: "16d-common", count: 6, rafterThickness: 1.5 }) : m.heel,
                  })
                }
              />
            </Field>
            {m.tensionFrom ? (
              <Grid>
                <Field label="Heel nails">
                  <Select
                    value={m.heel?.nail ?? "16d-common"}
                    options={NAILS.map((n) => ({ value: n.key, label: n.label }))}
                    onChange={(v) => upd({ heel: { ...(m.heel ?? { count: 6, rafterThickness: 1.5 }), nail: v } })}
                  />
                </Field>
                <Field label="Number of nails">
                  <NumberInput
                    value={m.heel?.count ?? 6}
                    min={1}
                    step="1"
                    onChange={(v) =>
                      upd({
                        heel: {
                          ...(m.heel ?? { nail: "16d-common", rafterThickness: 1.5 }),
                          count: Math.max(1, Math.round(v ?? 6)),
                        },
                      })
                    }
                  />
                </Field>
              </Grid>
            ) : null}
            <Collapsible title={`Additional loads (${m.extra.length})`}>
              <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
            </Collapsible>
            <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as typeof m.deflection })} />
            <KcrField value={m.Kcr} onChange={(v) => upd({ Kcr: v })} />
          </Section>
        </>
      );
      break;
    case "ijoist":
      body = (
        <>
          <Section title="Member">
            <CommonFields p={p} m={m} upd={upd} />
            <Grid>
              <Field label="Series">
                <Select
                  value={m.series}
                  options={TJI_SERIES}
                  onChange={(v) =>
                    upd({ series: v, depth: tjiDepths(v).includes(m.depth) ? m.depth : tjiDepths(v)[0] })
                  }
                />
              </Field>
              <Field label="Depth">
                <Select value={m.depth} options={tjiDepths(m.series)} onChange={(v) => upd({ depth: v })} />
              </Field>
            </Grid>
            <SpacingField value={m.spacing} onChange={(v) => upd({ spacing: v })} />
          </Section>
          <Section title="Spans and supports">
            <SpansFields spans={m.spans} left={m.leftCantilever} right={m.rightCantilever} onChange={(x) => upd(x)} />
            <BearingFields bearing={m.bearing} n={m.spans.length + 1} onChange={(b) => upd({ bearing: b })} />
          </Section>
          <Section title="Loading">
            <DeadField
              p={p}
              value={m.dead}
              kinds={["floor", "deck", "roof", "ceiling"]}
              onChange={(v) => upd({ dead: v })}
            />
            <LiveField value={m.live} onChange={(v) => upd({ live: v as typeof m.live })} roof />
            <Collapsible title={`Additional loads (${m.extra.length})`}>
              <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
            </Collapsible>
            <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as typeof m.deflection })} />
            <KcrField value={m.Kcr} onChange={(v) => upd({ Kcr: v })} />
            <Check
              checked={!!m.addSelfWeight}
              onChange={(v) => upd({ addSelfWeight: v })}
              label="Add manufacturer self weight"
            />
          </Section>
        </>
      );
      break;
    case "beam":
      body = <BeamEditor p={p} m={m} upd={upd as Upd<BeamSpec>} />;
      break;
    case "wall":
      body = <WallEditor p={p} m={m} upd={upd as Upd<WallSpec>} />;
      break;
    case "post":
      body = <PostEditor p={p} m={m} upd={upd as Upd<PostSpec>} />;
      break;
    case "truss":
      body = <TrussEditor p={p} m={m} upd={upd as Upd<TrussSpec>} />;
      break;
    case "connector":
      body = <ConnectorEditor p={p} m={m} upd={upd as Upd<ConnectorSpec>} />;
      break;
    case "footing":
      body = <FootingEditor p={p} m={m} upd={upd as Upd<FootingSpec>} />;
      break;
    case "shearWall":
      body = <ShearWallEditor p={p} m={m} upd={upd as Upd<ShearWallSpec>} />;
      break;
  }
  return (
    <>
      {body}
      <Collapsible
        title={`Load path — reactions carried from other members (${m.links.length})`}
        open={m.links.length > 0}
      >
        <LinksEditor p={p} m={m} onChange={(links) => upd({ links })} />
      </Collapsible>
    </>
  );
}

function MaterialEditor({ m, upd }: { m: BeamSpec; upd: Upd<BeamSpec> }) {
  const mat = m.material;
  return (
    <>
      <Field label="Material">
        <Select
          value={mat.kind}
          options={[
            { value: "sawn", label: "Sawn lumber / built-up plies" },
            { value: "glulam", label: "Glued laminated timber" },
            { value: "scl", label: "Structural composite lumber (LVL / PSL / LSL)" },
          ]}
          onChange={(v) =>
            upd({
              material:
                v === "sawn"
                  ? { kind: "sawn", species: "DF-L", grade: "No.2", size: "4x10", plies: 1 }
                  : v === "glulam"
                    ? { kind: "glulam", combo: "24F-V4", b: 5.125, d: 12 }
                    : { kind: "scl", product: "LVL 2.0E", plies: 2, plyWidth: 1.75, d: 11.875 },
            })
          }
        />
      </Field>
      {mat.kind === "sawn" ? (
        <>
          <SawnFields
            species={mat.species}
            grade={mat.grade}
            size={mat.size}
            sizes={SAWN_SIZES}
            onChange={(x) => upd({ material: { ...mat, ...x } })}
          />
          <Field label="Plies (built-up)">
            <Select
              value={String(mat.plies)}
              options={["1", "2", "3", "4"]}
              onChange={(v) => upd({ material: { ...mat, plies: Number(v) } })}
            />
          </Field>
        </>
      ) : mat.kind === "glulam" ? (
        <Grid cols={3}>
          <Field label="Combination">
            <Select
              value={mat.combo}
              options={Object.keys(GLULAM)}
              onChange={(v) => upd({ material: { ...mat, combo: v } })}
            />
          </Field>
          <Field label="Width (in)">
            <Select
              value={String(mat.b)}
              options={GLULAM_WIDTHS.map(String)}
              onChange={(v) => upd({ material: { ...mat, b: Number(v) } })}
            />
          </Field>
          <Field label="Depth (in)">
            <Select
              value={String(mat.d)}
              options={Array.from({ length: 13 }, (_, i) => String((i + 4) * 1.5))}
              onChange={(v) => upd({ material: { ...mat, d: Number(v) } })}
            />
          </Field>
        </Grid>
      ) : (
        <>
          <Field label="Product">
            <Select
              value={mat.product}
              options={Object.keys(SCL)}
              onChange={(v) =>
                upd({
                  material: {
                    ...mat,
                    product: v,
                    plyWidth: v.startsWith("PSL") ? 3.5 : 1.75,
                    plies: v.startsWith("PSL") ? 1 : mat.plies,
                  },
                })
              }
            />
          </Field>
          <Grid cols={3}>
            <Field label="Plies">
              <Select
                value={String(mat.plies)}
                options={["1", "2", "3", "4"]}
                onChange={(v) => upd({ material: { ...mat, plies: Number(v) } })}
              />
            </Field>
            <Field label="Ply width (in)">
              <Select
                value={String(mat.plyWidth)}
                options={(mat.product.startsWith("PSL") ? PSL_WIDTHS : [1.75, 3.5]).map(String)}
                onChange={(v) => upd({ material: { ...mat, plyWidth: Number(v) } })}
              />
            </Field>
            <Field label="Depth (in)">
              <Select
                value={String(mat.d)}
                options={SCL_DEPTHS.map(String)}
                onChange={(v) => upd({ material: { ...mat, d: Number(v) } })}
              />
            </Field>
          </Grid>
        </>
      )}
    </>
  );
}

function BeamEditor({ p, m, upd }: { p: Project; m: BeamSpec; upd: Upd<BeamSpec> }) {
  return (
    <>
      <Section title="Member">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Field label="Type">
          <Select
            value={m.role}
            options={[
              { value: "beam", label: "Beam" },
              { value: "header", label: "Header" },
              { value: "ridge", label: "Ridge beam" },
              { value: "flush", label: "Flush beam" },
              { value: "dropped", label: "Dropped beam" },
            ]}
            onChange={(v) => upd({ role: v })}
          />
        </Field>
        <MaterialEditor m={m} upd={upd} />
      </Section>
      <Section title="Spans and supports">
        <SpansFields spans={m.spans} left={m.leftCantilever} right={m.rightCantilever} onChange={(x) => upd(x)} />
        <BearingFields bearing={m.bearing} n={m.spans.length + 1} onChange={(b) => upd({ bearing: b })} />
        <Grid>
          <Field label="Top-edge unbraced length (ft)" hint="0 = joists / sheathing brace the top">
            <NumberInput value={m.luTop} min={0} onChange={(v) => upd({ luTop: v ?? 0 })} />
          </Field>
          <Field label="Bottom-edge unbraced length (ft)">
            <NumberInput value={m.luBottom} min={0} onChange={(v) => upd({ luBottom: v ?? 0 })} />
          </Field>
        </Grid>
      </Section>
      <AreaWallsEditor p={p} area={m.area} walls={m.walls} onChange={(x) => upd(x)} />
      <Section title="Other loads and criteria">
        <Collapsible title={`Line / point loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
        <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as BeamSpec["deflection"] })} />
        <KcrField value={m.Kcr} onChange={(v) => upd({ Kcr: v })} />
        <Check checked={m.selfWeight} onChange={(v) => upd({ selfWeight: v })} label="Include member self weight" />
        <Grid>
          <Check checked={!!m.wetService} onChange={(v) => upd({ wetService: v })} label="Wet service" />
          <Check checked={!!m.incised} onChange={(v) => upd({ incised: v })} label="Incised" />
        </Grid>
        {m.material.kind === "sawn" && m.material.plies > 1 ? (
          <Field label="C_r override (blank = 1.00)" hint="Built-up plies: verify NDS 4.3.9 before using 1.15">
            <NumberInput value={m.crOverride} allowEmpty min={1} max={1.15} onChange={(v) => upd({ crOverride: v })} />
          </Field>
        ) : null}
      </Section>
    </>
  );
}

type AreaList = BeamSpec["area"];
type WallList = BeamSpec["walls"];

function AreaWallsEditor({
  p,
  area,
  walls,
  onChange,
}: {
  p: Project;
  area: AreaList;
  walls: WallList;
  onChange: (x: { area?: AreaList; walls?: WallList }) => void;
}) {
  const m = { area, walls };
  const upd = onChange;
  const setArea = (i: number, patch: Partial<AreaList[number]>) =>
    upd({ area: m.area.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const setWall = (i: number, patch: Partial<WallList[number]>) =>
    upd({ walls: m.walls.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  return (
    <>
      <Section title={`Tributary area loads (${m.area.length})`}>
        {m.area.map((a, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TextInput value={a.label} onChange={(v) => setArea(i, { label: v })} />
              </div>
              <SmallButton tone="danger" title="Remove" onClick={() => upd({ area: m.area.filter((_, k) => k !== i) })}>
                ✕
              </SmallButton>
            </div>
            <Grid cols={3}>
              <Field label="Trib. width (ft)">
                <NumberInput value={a.trib} min={0} onChange={(v) => setArea(i, { trib: v ?? a.trib })} />
              </Field>
              <Field label="From x (ft)">
                <NumberInput value={a.x1} allowEmpty min={0} onChange={(v) => setArea(i, { x1: v })} />
              </Field>
              <Field label="To x (ft)">
                <NumberInput value={a.x2} allowEmpty min={0} onChange={(v) => setArea(i, { x2: v })} />
              </Field>
            </Grid>
            <DeadField p={p} value={a.dead ?? {}} roof={(a.rise ?? 0) > 0} onChange={(v) => setArea(i, { dead: v })} />
            <Field label="Floor live use">
              <Select
                value={a.live?.use ?? "none"}
                options={LIVE_LOADS.filter((l) => !l.roof).map((l) => ({ value: l.use, label: l.label }))}
                onChange={(v) => setArea(i, { live: v === "none" ? undefined : { use: v } })}
              />
            </Field>
            <Grid cols={3}>
              <Check checked={!!a.roofLive} onChange={(v) => setArea(i, { roofLive: v })} label="Roof live" />
              <Check checked={!!a.snow} onChange={(v) => setArea(i, { snow: v })} label="Snow" />
              <Field label="Roof pitch (in 12)">
                <NumberInput value={a.rise} allowEmpty min={0} onChange={(v) => setArea(i, { rise: v })} />
              </Field>
            </Grid>
          </div>
        ))}
        <AddButton
          onClick={() =>
            upd({
              area: [
                ...m.area,
                {
                  label: "Floor",
                  trib: 6,
                  dead: { assemblyId: p.assemblies.find((a) => a.kind === "floor")?.id },
                  live: { use: "living" },
                },
              ],
            })
          }
        >
          + Add tributary area load
        </AddButton>
      </Section>
      <Section title={`Walls above (${m.walls.length})`}>
        {m.walls.map((w, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TextInput value={w.label} onChange={(v) => setWall(i, { label: v })} />
              </div>
              <SmallButton
                tone="danger"
                title="Remove"
                onClick={() => upd({ walls: m.walls.filter((_, k) => k !== i) })}
              >
                ✕
              </SmallButton>
            </div>
            <DeadField
              p={p}
              value={w.dead}
              kinds={["wall"]}
              onChange={(v) => setWall(i, { dead: v })}
              label="Wall assembly"
            />
            <Grid cols={3}>
              <Field label="Height (ft)">
                <NumberInput value={w.height} min={0} onChange={(v) => setWall(i, { height: v ?? w.height })} />
              </Field>
              <Field label="From x (ft)">
                <NumberInput value={w.x1} allowEmpty min={0} onChange={(v) => setWall(i, { x1: v })} />
              </Field>
              <Field label="To x (ft)">
                <NumberInput value={w.x2} allowEmpty min={0} onChange={(v) => setWall(i, { x2: v })} />
              </Field>
            </Grid>
          </div>
        ))}
        <AddButton
          onClick={() =>
            upd({
              walls: [
                ...m.walls,
                {
                  label: "Wall above",
                  dead: { assemblyId: p.assemblies.find((a) => a.kind === "wall")?.id },
                  height: 8,
                },
              ],
            })
          }
        >
          + Add wall above
        </AddButton>
      </Section>
    </>
  );
}

const STUD_SIZES = ["2x4", "2x6", "2x8", "3x4", "3x6"];

function WallEditor({ p, m, upd }: { p: Project; m: WallSpec; upd: Upd<WallSpec> }) {
  const setPack = (i: number, patch: Partial<WallSpec["packs"][number]>) =>
    upd({ packs: m.packs.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const setOpening = (i: number, patch: Partial<WallSpec["openings"][number]>) =>
    upd({ openings: m.openings.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  return (
    <>
      <Section title="Wall">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <SawnFields species={m.species} grade={m.grade} size={m.size} sizes={STUD_SIZES} onChange={(x) => upd(x)} />
        <SpacingField value={m.spacing} onChange={(v) => upd({ spacing: v })} />
        <Grid cols={3}>
          <Field label="Plate height (ft)">
            <NumberInput value={m.plateHeight} min={2} onChange={(v) => upd({ plateHeight: v ?? m.plateHeight })} />
          </Field>
          <Field label="Top plates">
            <NumberInput value={m.topPlates} min={1} max={3} step="1" onChange={(v) => upd({ topPlates: v ?? 2 })} />
          </Field>
          <Field label="Bottom plates">
            <NumberInput
              value={m.bottomPlates}
              min={1}
              max={2}
              step="1"
              onChange={(v) => upd({ bottomPlates: v ?? 1 })}
            />
          </Field>
        </Grid>
        <Grid>
          <Field label="Wall length (ft)">
            <NumberInput value={m.length} min={1} onChange={(v) => upd({ length: v ?? m.length })} />
          </Field>
          <Field label="Sheathing (weak-axis bracing)">
            <Select
              value={m.sheathing}
              options={[
                { value: "both", label: "Both faces" },
                { value: "one", label: "One face" },
                { value: "none", label: "None (blocking)" },
              ]}
              onChange={(v) => upd({ sheathing: v })}
            />
          </Field>
        </Grid>
        {m.sheathing === "none" ? (
          <Field label="Blocking interval (ft, 0 = none)">
            <NumberInput value={m.blocking ?? 0} min={0} onChange={(v) => upd({ blocking: v ?? 0 })} />
          </Field>
        ) : null}
        <DeadField p={p} value={m.self} kinds={["wall"]} onChange={(v) => upd({ self: v })} label="Wall self weight" />
      </Section>
      <Section title="Out-of-plane wind (C&C)">
        <Grid>
          <Field label="Wind">
            <Select
              value={m.wind.mode}
              options={[
                { value: "computed", label: "Computed — ASCE 7 Ch. 30" },
                { value: "entered", label: "Enter pressure" },
                { value: "none", label: "None (interior wall)" },
              ]}
              onChange={(v) => upd({ wind: { ...m.wind, mode: v } })}
            />
          </Field>
          {m.wind.mode === "computed" ? (
            <Field label="Zone">
              <Select
                value={String(m.wind.zone ?? 4)}
                options={[
                  { value: "4", label: "Zone 4 (interior)" },
                  { value: "5", label: "Zone 5 (corner)" },
                ]}
                onChange={(v) => upd({ wind: { ...m.wind, zone: v === "5" ? 5 : 4 } })}
              />
            </Field>
          ) : m.wind.mode === "entered" ? (
            <Field label="Pressure, strength (psf)">
              <NumberInput
                value={m.wind.psf ?? 0}
                min={0}
                onChange={(v) => upd({ wind: { ...m.wind, psf: v ?? 0 } })}
              />
            </Field>
          ) : (
            <span />
          )}
        </Grid>
        <Field label="Deflection limit h /" hint="IBC Table 1604.3: 120 flexible, 240 brittle, 360 plaster / stucco">
          <NumberInput value={m.deflN} min={60} onChange={(v) => upd({ deflN: v ?? 240 })} />
        </Field>
      </Section>
      <AreaWallsEditor p={p} area={m.area} walls={m.walls} onChange={(x) => upd(x)} />
      <Section title="Other loads">
        <Collapsible title={`Line / point loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
      <Section title={`Stud packs under point loads (${m.packs.length})`}>
        {m.packs.map((k, i) => (
          <Grid key={i} cols={4}>
            <Field label="Label">
              <TextInput value={k.label ?? ""} onChange={(v) => setPack(i, { label: v })} />
            </Field>
            <Field label="At x (ft)">
              <NumberInput value={k.x} min={0} onChange={(v) => setPack(i, { x: v ?? 0 })} />
            </Field>
            <Field label="Studs">
              <NumberInput value={k.studs} min={1} max={6} step="1" onChange={(v) => setPack(i, { studs: v ?? 2 })} />
            </Field>
            <SmallButton tone="danger" title="Remove" onClick={() => upd({ packs: m.packs.filter((_, j) => j !== i) })}>
              ✕
            </SmallButton>
          </Grid>
        ))}
        <AddButton onClick={() => upd({ packs: [...m.packs, { x: 0, studs: 2, label: "" }] })}>
          + Add stud pack
        </AddButton>
        <Hint>Each point load (header, beam, post) must have a stud pack within 1 ft.</Hint>
      </Section>
      <Section title={`Openings — king studs (${m.openings.length})`}>
        {m.openings.map((o, i) => (
          <Grid key={i} cols={4}>
            <Field label="Label">
              <TextInput value={o.label} onChange={(v) => setOpening(i, { label: v })} />
            </Field>
            <Field label="From x (ft)">
              <NumberInput value={o.x1} min={0} onChange={(v) => setOpening(i, { x1: v ?? 0 })} />
            </Field>
            <Field label="To x (ft)">
              <NumberInput value={o.x2} min={0} onChange={(v) => setOpening(i, { x2: v ?? 0 })} />
            </Field>
            <Field label="Kings each side">
              <NumberInput
                value={o.kings}
                min={1}
                max={4}
                step="1"
                onChange={(v) => setOpening(i, { kings: v ?? 1 })}
              />
            </Field>
          </Grid>
        ))}
        <AddButton
          onClick={() =>
            upd({ openings: [...m.openings, { label: `Opening ${m.openings.length + 1}`, x1: 2, x2: 5, kings: 1 }] })
          }
        >
          + Add opening
        </AddButton>
      </Section>
    </>
  );
}

function PostEditor({ p, m, upd }: { p: Project; m: PostSpec; upd: Upd<PostSpec> }) {
  const mat = m.material;
  return (
    <>
      <Section title="Post">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        {mat.kind === "sawn" ? (
          <>
            <SawnFields
              species={mat.species}
              grade={mat.grade}
              size={mat.size}
              sizes={["4x4", "4x6", "4x8", "6x6", "6x8", "8x8", "2x4", "2x6"]}
              onChange={(x) => upd({ material: { ...mat, ...x } })}
            />
            <Grid>
              <Field label="Plies (built-up)">
                <NumberInput
                  value={mat.plies}
                  min={1}
                  max={5}
                  step="1"
                  onChange={(v) => upd({ material: { ...mat, plies: v ?? 1 } })}
                />
              </Field>
              {mat.plies > 1 ? (
                <Field label="Built-up fastening">
                  <Select
                    value={m.builtUp ?? "nailed"}
                    options={[
                      { value: "nailed", label: "Nailed (K_f 0.6)" },
                      { value: "bolted", label: "Bolted (K_f 0.75)" },
                    ]}
                    onChange={(v) => upd({ builtUp: v })}
                  />
                </Field>
              ) : (
                <span />
              )}
            </Grid>
          </>
        ) : null}
        <Grid cols={3}>
          <Field label="Height (ft)">
            <NumberInput value={m.height} min={0.5} onChange={(v) => upd({ height: v ?? m.height })} />
          </Field>
          <Field label="K_e">
            <NumberInput value={m.Ke} min={0.5} onChange={(v) => upd({ Ke: v ?? 1 })} />
          </Field>
          <Field label="Eccentricity (in)">
            <NumberInput value={m.eccentricity} allowEmpty min={0} onChange={(v) => upd({ eccentricity: v })} />
          </Field>
        </Grid>
        <Grid>
          <Field label="Weak-axis brace interval (ft)" hint="Blank = full height">
            <NumberInput value={m.braceWeak} allowEmpty min={0} onChange={(v) => upd({ braceWeak: v })} />
          </Field>
          <Field label="Strong-axis brace interval (ft)">
            <NumberInput value={m.braceStrong} allowEmpty min={0} onChange={(v) => upd({ braceStrong: v })} />
          </Field>
        </Grid>
        <Grid>
          <Field label="Exposed wind (psf, strength)" hint="Blank = none">
            <NumberInput
              value={m.wind?.psf}
              allowEmpty
              min={0}
              onChange={(v) => upd({ wind: v === undefined ? undefined : { psf: v, width: m.wind?.width ?? 1 } })}
            />
          </Field>
          <Field label="Exposed width (ft)">
            <NumberInput
              value={m.wind?.width ?? 1}
              min={0}
              onChange={(v) => upd({ wind: m.wind ? { ...m.wind, width: v ?? 1 } : undefined })}
            />
          </Field>
        </Grid>
        <Grid>
          <Field label="Bears on">
            <Select
              value={m.bearing.on}
              options={[
                { value: "concrete", label: "Concrete (post base)" },
                { value: "wood", label: "Wood beam / plate" },
                { value: "steel", label: "Steel" },
              ]}
              onChange={(v) => upd({ bearing: { ...m.bearing, on: v } })}
            />
          </Field>
          {m.bearing.on === "wood" ? (
            <Field label="Supporting member size">
              <Select
                value={m.bearing.size ?? "2x6"}
                options={[...SAWN_SIZES]}
                onChange={(v) => upd({ bearing: { ...m.bearing, size: v } })}
              />
            </Field>
          ) : (
            <span />
          )}
        </Grid>
        <Check checked={m.selfWeight} onChange={(v) => upd({ selfWeight: v })} label="Include post self weight" />
      </Section>
      <Section title="Other loads">
        <Collapsible title={`Point loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
    </>
  );
}

function TrussEditor({ p, m, upd }: { p: Project; m: TrussSpec; upd: Upd<TrussSpec> }) {
  const setB = (i: number, patch: Partial<TrussSpec["bearings"][number]>) =>
    upd({ bearings: m.bearings.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <>
      <Section title="Truss (manufacturer design)">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={3}>
          <Field label="Span (ft)">
            <NumberInput value={m.span} min={1} onChange={(v) => upd({ span: v ?? m.span })} />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput value={m.spacing} min={0} onChange={(v) => upd({ spacing: v ?? 24 })} />
          </Field>
          <Field label="Plies">
            <NumberInput value={m.plies} min={1} max={4} step="1" onChange={(v) => upd({ plies: v ?? 1 })} />
          </Field>
        </Grid>
        <Check checked={m.girder} onChange={(v) => upd({ girder: v })} label="Girder truss (point reactions)" />
        <Field label="Truss design reference">
          <TextInput
            value={m.designRef}
            onChange={(v) => upd({ designRef: v })}
            placeholder="Manufacturer, job no., drawing"
          />
        </Field>
        <SawnFields
          species={m.plate.species}
          grade={m.plate.grade}
          size={m.plate.size}
          sizes={["2x4", "2x6", "2x8"]}
          onChange={(x) => upd({ plate: { ...m.plate, ...x } })}
        />
      </Section>
      <Section title="Reactions per truss (lb) — W negative = uplift">
        {m.bearings.map((b, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-2">
            <Grid cols={3}>
              <Field label="Bearing">
                <TextInput value={b.name} onChange={(v) => setB(i, { name: v })} />
              </Field>
              <Field label="x (ft)">
                <NumberInput value={b.x} min={0} onChange={(v) => setB(i, { x: v ?? 0 })} />
              </Field>
              <Field label="Width (in)">
                <NumberInput value={b.width} min={0.5} onChange={(v) => setB(i, { width: v ?? 1.5 })} />
              </Field>
            </Grid>
            <Grid cols={4}>
              {(["D", "L", "Lr", "S", "W"] as const).map((t) => (
                <Field key={t} label={t}>
                  <NumberInput value={b[t]} onChange={(v) => setB(i, { [t]: v ?? 0 })} />
                </Field>
              ))}
            </Grid>
          </div>
        ))}
        <AddButton
          onClick={() =>
            upd({
              bearings: [
                ...m.bearings,
                { name: `B${m.bearings.length + 1}`, x: 0, D: 0, L: 0, Lr: 0, S: 0, W: 0, width: 1.5 },
              ],
            })
          }
        >
          + Add bearing
        </AddButton>
      </Section>
    </>
  );
}

function ConnectorEditor({ p, m, upd }: { p: Project; m: ConnectorSpec; upd: Upd<ConnectorSpec> }) {
  const sources = p.members.filter((x) => x.id !== m.id && supportCount(x) > 0);
  const src = sources.find((x) => x.id === m.sourceId);
  return (
    <Section title="Connector">
      <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
      <Field label="Hardware (project hardware list)">
        <Select
          value={m.hardwareId}
          options={p.hardware.map((h) => ({ value: h.id, label: `${h.model} — ${h.description}` }))}
          onChange={(v) => upd({ hardwareId: v })}
        />
      </Field>
      <Grid cols={3}>
        <Field label="At member">
          <Select
            value={m.sourceId}
            options={sources.map((x) => ({ value: x.id, label: x.mark }))}
            onChange={(v) => upd({ sourceId: v, support: 0 })}
          />
        </Field>
        <Field label="Support">
          <Select
            value={String(m.support)}
            options={(src ? supportLabels(src) : ["A"]).map((label, k) => ({ value: String(k), label }))}
            onChange={(v) => upd({ support: Number(v) })}
          />
        </Field>
        <Field label="Quantity">
          <NumberInput value={m.quantity} min={1} max={8} step="1" onChange={(v) => upd({ quantity: v ?? 1 })} />
        </Field>
      </Grid>
      <Field label="Lateral F1 demand (lb, optional)">
        <NumberInput value={m.lateral} allowEmpty min={0} onChange={(v) => upd({ lateral: v })} />
      </Field>
    </Section>
  );
}

function FootingEditor({ p, m, upd }: { p: Project; m: FootingSpec; upd: Upd<FootingSpec> }) {
  const strip = m.type === "strip";
  return (
    <>
      <Section title={strip ? "Continuous footing" : "Pad footing"}>
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={3}>
          <Field label={strip ? "Width B (ft)" : "B (ft)"}>
            <NumberInput value={m.B} min={0.5} onChange={(v) => upd({ B: v ?? m.B })} />
          </Field>
          {!strip ? (
            <Field label="L (ft)">
              <NumberInput value={m.L ?? m.B} min={0.5} onChange={(v) => upd({ L: v })} />
            </Field>
          ) : (
            <span />
          )}
          <Field label="Thickness (in)">
            <NumberInput value={m.h} min={6} onChange={(v) => upd({ h: v ?? m.h })} />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Bottom below grade (in)">
            <NumberInput value={m.depth} min={6} onChange={(v) => upd({ depth: v ?? m.depth })} />
          </Field>
          <Field label="Soil over (in)">
            <NumberInput value={m.soilOver} allowEmpty min={0} onChange={(v) => upd({ soilOver: v })} />
          </Field>
          <Field label="Stories (IBC 1809.7)">
            <NumberInput value={m.stories} min={1} max={3} step="1" onChange={(v) => upd({ stories: v ?? 1 })} />
          </Field>
        </Grid>
        <Grid>
          <Field label={strip ? "Wall / stem width (in)" : "Post base c1 (in)"}>
            <NumberInput value={m.c1} min={1} onChange={(v) => upd({ c1: v ?? m.c1 })} />
          </Field>
          {!strip ? (
            <Field label="Post base c2 (in)">
              <NumberInput value={m.c2 ?? m.c1} min={1} onChange={(v) => upd({ c2: v })} />
            </Field>
          ) : (
            <Field label="Stem height (in, blank = none)">
              <NumberInput
                value={m.stem?.height}
                allowEmpty
                min={0}
                onChange={(v) => upd({ stem: v ? { width: m.stem?.width ?? m.c1, height: v } : undefined })}
              />
            </Field>
          )}
        </Grid>
        <Field
          label="Allowable soil pressure override (psf)"
          hint={`Blank = project value ${p.criteria.soil.bearing} psf`}
        >
          <NumberInput value={m.qaOverride} allowEmpty min={500} onChange={(v) => upd({ qaOverride: v })} />
        </Field>
      </Section>
      <Section title="Reinforcement">
        <Grid cols={3}>
          <Field label={strip ? "Transverse bars" : "Bars each way"}>
            <Select
              value={m.rebar?.size ?? "plain"}
              options={[
                { value: "plain", label: "None (plain)" },
                ...Object.keys(BARS).map((b) => ({ value: b, label: b })),
              ]}
              onChange={(v) =>
                upd({
                  rebar:
                    v === "plain"
                      ? undefined
                      : { size: v, spacing: m.rebar?.spacing ?? 12, count: m.rebar?.count ?? 3 },
                })
              }
            />
          </Field>
          {m.rebar ? (
            strip ? (
              <Field label="Spacing (in)">
                <NumberInput
                  value={m.rebar.spacing ?? 12}
                  min={3}
                  onChange={(v) => upd({ rebar: { ...m.rebar!, spacing: v ?? 12 } })}
                />
              </Field>
            ) : (
              <Field label="Count each way">
                <NumberInput
                  value={m.rebar.count ?? 3}
                  min={2}
                  step="1"
                  onChange={(v) => upd({ rebar: { ...m.rebar!, count: v ?? 3 } })}
                />
              </Field>
            )
          ) : (
            <span />
          )}
        </Grid>
        {strip ? (
          <Grid cols={3}>
            <Field label="Longitudinal bar">
              <Select
                value={m.longitudinal?.size ?? "none"}
                options={[{ value: "none", label: "None" }, ...Object.keys(BARS).map((b) => ({ value: b, label: b }))]}
                onChange={(v) =>
                  upd({
                    longitudinal:
                      v === "none"
                        ? undefined
                        : { size: v, top: m.longitudinal?.top ?? 1, bottom: m.longitudinal?.bottom ?? 1 },
                  })
                }
              />
            </Field>
            {m.longitudinal ? (
              <>
                <Field label="Top (no.)">
                  <NumberInput
                    value={m.longitudinal.top}
                    min={0}
                    step="1"
                    onChange={(v) => upd({ longitudinal: { ...m.longitudinal!, top: v ?? 1 } })}
                  />
                </Field>
                <Field label="Bottom (no.)">
                  <NumberInput
                    value={m.longitudinal.bottom}
                    min={0}
                    step="1"
                    onChange={(v) => upd({ longitudinal: { ...m.longitudinal!, bottom: v ?? 1 } })}
                  />
                </Field>
              </>
            ) : null}
          </Grid>
        ) : null}
      </Section>
      <Section title="Other loads">
        <Collapsible title={`${strip ? "Line" : "Point"} loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
    </>
  );
}

function ShearWallEditor({ p, m, upd }: { p: Project; m: ShearWallSpec; upd: Upd<ShearWallSpec> }) {
  const lines = p.lateral?.lines ?? [];
  const setSide = (i: number, patch: Partial<ShearWallSpec["sides"][number]>) =>
    upd({ sides: m.sides.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const hds = p.hardware.filter((h) => h.kind === "holdown" || h.kind === "strap");
  const others = p.members.filter((x) => x.kind === "shearWall" && x.id !== m.id);
  return (
    <>
      <Section title="Shear wall">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Field label="Wall line">
          <Select
            value={m.lineId}
            options={[
              { value: "", label: "— select —" },
              ...lines.map((l) => ({ value: l.id, label: `${l.name} (${l.dir})` })),
            ]}
            onChange={(v) => upd({ lineId: v })}
          />
        </Field>
        {!p.lateral?.enabled ? (
          <Hint>Enable the lateral analysis (Lateral panel) to give this wall its demand.</Hint>
        ) : null}
        <Grid>
          <Field label="Segment length b_s (ft)">
            <NumberInput value={m.b} min={1} onChange={(v) => upd({ b: v ?? m.b })} />
          </Field>
          <Field label="Height h (ft)">
            <NumberInput value={m.h} min={2} onChange={(v) => upd({ h: v ?? m.h })} />
          </Field>
        </Grid>
      </Section>
      <Section title="Sheathing">
        {m.sides.map((x, i) => {
          const row = SHEATHING.find((r) => r.key === x.key) ?? SHEATHING[0];
          return (
            <div key={i} className="space-y-2 rounded-md border border-border p-2">
              <Grid>
                <Field label={`Side ${i + 1}`}>
                  <Select
                    value={x.key}
                    options={SHEATHING.map((r) => ({ value: r.key, label: `${r.label}, ${r.nail}` }))}
                    onChange={(v) => {
                      const r = SHEATHING.find((y) => y.key === v)!;
                      setSide(i, {
                        key: v,
                        spacing: edgeSpacings(r).includes(x.spacing as 6) ? x.spacing : edgeSpacings(r)[0],
                      });
                    }}
                  />
                </Field>
                <Field label="Edge nailing (in)">
                  <Select
                    value={String(x.spacing)}
                    options={edgeSpacings(row).map(String)}
                    onChange={(v) => setSide(i, { spacing: Number(v) })}
                  />
                </Field>
              </Grid>
              <Grid cols={3}>
                <Field label="v_s override (plf)">
                  <NumberInput
                    value={x.vsOverride}
                    allowEmpty
                    min={1}
                    onChange={(v) => setSide(i, { vsOverride: v })}
                  />
                </Field>
                <Field label="G_a override">
                  <NumberInput
                    value={x.GaOverride}
                    allowEmpty
                    min={1}
                    onChange={(v) => setSide(i, { GaOverride: v })}
                  />
                </Field>
                {m.sides.length > 1 ? (
                  <SmallButton
                    tone="danger"
                    title="Remove side"
                    onClick={() => upd({ sides: m.sides.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </SmallButton>
                ) : (
                  <span />
                )}
              </Grid>
            </div>
          );
        })}
        {m.sides.length < 2 ? (
          <AddButton onClick={() => upd({ sides: [...m.sides, { key: "GWB-1/2-4", spacing: 4 }] })}>
            + Add second side
          </AddButton>
        ) : null}
      </Section>
      <Section title="Framing and gravity">
        <SawnFields
          species={m.stud.species}
          grade={m.stud.grade}
          size={m.stud.size}
          sizes={STUD_SIZES}
          onChange={(x) => upd({ stud: { ...m.stud, ...x } })}
        />
        <Grid cols={3}>
          <Field label="End post size">
            <Select
              value={m.endPost.size}
              options={["2x4", "2x6", "4x4", "4x6", "6x6"]}
              onChange={(v) => upd({ endPost: { ...m.endPost, size: v } })}
            />
          </Field>
          <Field label="End post plies">
            <NumberInput
              value={m.endPost.plies}
              min={1}
              max={4}
              step="1"
              onChange={(v) => upd({ endPost: { ...m.endPost, plies: v ?? 2 } })}
            />
          </Field>
          <Field label="Rod hole (in)">
            <NumberInput
              value={m.endPost.holeDia}
              min={0}
              onChange={(v) => upd({ endPost: { ...m.endPost, holeDia: v ?? 0 } })}
            />
          </Field>
        </Grid>
        <Grid cols={4}>
          {(["D", "L", "Lr", "S"] as const).map((t) => (
            <Field key={t} label={`Top ${t} (plf)`}>
              <NumberInput value={m.top[t]} min={0} onChange={(v) => upd({ top: { ...m.top, [t]: v ?? 0 } })} />
            </Field>
          ))}
        </Grid>
        <Hint>Gravity on the wall: entered values plus loads carried by links (below).</Hint>
        <DeadField p={p} value={m.self} kinds={["wall"]} onChange={(v) => upd({ self: v })} label="Wall self weight" />
        <Field label="Overturning resistance">
          <Select
            value={m.overturning}
            options={[
              { value: "full", label: "Whole-segment dead load (rigid body)" },
              { value: "endpost", label: "End-post tributary dead load only (Tedds)" },
            ]}
            onChange={(v) => upd({ overturning: v })}
          />
        </Field>
      </Section>
      <Section title="Hold-downs and anchorage">
        <Grid>
          <Field label="Hold-down">
            <Select
              value={m.holdownId ?? ""}
              options={[{ value: "", label: "None" }, ...hds.map((h) => ({ value: h.id, label: h.model }))]}
              onChange={(v) => upd({ holdownId: v || undefined })}
            />
          </Field>
          <Field label="Uplift from wall above">
            <Select
              value={m.upliftFrom ?? ""}
              options={[{ value: "", label: "None" }, ...others.map((x) => ({ value: x.id, label: x.mark }))]}
              onChange={(v) => upd({ upliftFrom: v || undefined })}
            />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Sill anchor">
            <Select
              value={m.sill.type}
              options={[
                { value: "cast-in", label: "Cast-in bolt" },
                { value: "post-installed", label: "Post-installed (ESR)" },
              ]}
              onChange={(v) => upd({ sill: { ...m.sill, type: v } })}
            />
          </Field>
          <Field label="Diameter (in)">
            <Select
              value={String(m.sill.d)}
              options={["0.5", "0.625", "0.75"]}
              onChange={(v) => upd({ sill: { ...m.sill, d: Number(v) } })}
            />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput
              value={m.sill.spacing}
              min={6}
              onChange={(v) => upd({ sill: { ...m.sill, spacing: v ?? 48 } })}
            />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Embedment (in)">
            <NumberInput value={m.sill.embed} min={4} onChange={(v) => upd({ sill: { ...m.sill, embed: v ?? 7 } })} />
          </Field>
          <Field label="Edge distance (in)">
            <NumberInput value={m.sill.edge} min={1} onChange={(v) => upd({ sill: { ...m.sill, edge: v ?? 1.75 } })} />
          </Field>
          <Field label="Sill size">
            <Select value={m.sillSize} options={["2x4", "2x6", "3x4", "3x6"]} onChange={(v) => upd({ sillSize: v })} />
          </Field>
        </Grid>
        {m.sill.type === "post-installed" ? (
          <Grid>
            <Field label="Anchor (product)">
              <TextInput value={m.sill.label ?? ""} onChange={(v) => upd({ sill: { ...m.sill, label: v } })} />
            </Field>
            <Field label="Allowable shear (lb, ESR)">
              <NumberInput
                value={m.sill.allowShear}
                allowEmpty
                min={1}
                onChange={(v) => upd({ sill: { ...m.sill, allowShear: v } })}
              />
            </Field>
          </Grid>
        ) : null}
        <Check
          checked={!!m.holdownAnchor}
          onChange={(v) =>
            upd({
              holdownAnchor: v
                ? {
                    d: 0.625,
                    steel: ANCHOR_STEELS[0].label,
                    hef: 10,
                    edges: [7.5, 7.5, 30, 30],
                    plate: 2,
                    cracked: true,
                    omega: true,
                  }
                : undefined,
            })
          }
          label="Check hold-down anchor in concrete (ACI 318 Ch. 17)"
        />
        {m.holdownAnchor ? (
          <>
            <Grid cols={3}>
              <Field label="Rod dia. (in)">
                <Select
                  value={String(m.holdownAnchor.d)}
                  options={["0.625", "0.75", "0.875", "1"]}
                  onChange={(v) => upd({ holdownAnchor: { ...m.holdownAnchor!, d: Number(v) } })}
                />
              </Field>
              <Field label="h_ef (in)">
                <NumberInput
                  value={m.holdownAnchor.hef}
                  min={3}
                  onChange={(v) => upd({ holdownAnchor: { ...m.holdownAnchor!, hef: v ?? 10 } })}
                />
              </Field>
              <Field label="Plate (in square)">
                <NumberInput
                  value={m.holdownAnchor.plate}
                  min={1}
                  onChange={(v) => upd({ holdownAnchor: { ...m.holdownAnchor!, plate: v ?? 2 } })}
                />
              </Field>
            </Grid>
            <Grid cols={4}>
              {[0, 1, 2, 3].map((k) => (
                <Field key={k} label={`Edge ${k + 1} (in)`}>
                  <NumberInput
                    value={m.holdownAnchor!.edges[k]}
                    min={1}
                    onChange={(v) => {
                      const e = [...m.holdownAnchor!.edges] as [number, number, number, number];
                      e[k] = v ?? e[k];
                      upd({ holdownAnchor: { ...m.holdownAnchor!, edges: e } });
                    }}
                  />
                </Field>
              ))}
            </Grid>
            <Grid>
              <Check
                checked={m.holdownAnchor.cracked}
                onChange={(v) => upd({ holdownAnchor: { ...m.holdownAnchor!, cracked: v } })}
                label="Cracked concrete"
              />
              <Check
                checked={m.holdownAnchor.omega}
                onChange={(v) => upd({ holdownAnchor: { ...m.holdownAnchor!, omega: v } })}
                label="Ω0 amplification (17.10.5.3d)"
              />
            </Grid>
          </>
        ) : null}
        <Grid>
          <Field label="Wind deflection factor">
            <NumberInput
              value={m.windService.factor}
              min={0.1}
              onChange={(v) => upd({ windService: { ...m.windService, factor: v ?? 0.42 } })}
            />
          </Field>
          <Field label="Wind deflection limit h /">
            <NumberInput
              value={m.windService.limitN}
              min={100}
              onChange={(v) => upd({ windService: { ...m.windService, limitN: v ?? 600 } })}
            />
          </Field>
        </Grid>
      </Section>
    </>
  );
}
