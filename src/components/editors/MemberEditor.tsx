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
  type SteelBeamSpec,
  type SteelColumnSpec,
  type BasePlateSpec,
  type DiaphragmSpec,
  type TransferSpec,
  type UpliftSpec,
  type LedgerSpec,
  type MasonryWallSpec,
  type HoldownFootingSpec,
  type TieInSpec,
  type WoodTrussSpec,
  type RetainingWallSpec,
  type GuardPostSpec,
  type CfsWallSpec,
} from "@/engine/project";
import { C_SHAPES, HSS_NAMES, ROUND_NAMES, STEEL_GRADES, W_SHAPES, steelShape } from "@/engine/data/steel";
import { DIAPHRAGM_ROWS } from "@/engine/data/diaphragm";
import { SHEATHING, edgeSpacings, panel1532Shear } from "@/engine/data/sdpws";
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
    case "steelBeam":
      body = <SteelBeamEditor p={p} m={m} upd={upd as Upd<SteelBeamSpec>} />;
      break;
    case "steelColumn":
      body = <SteelColumnEditor p={p} m={m} upd={upd as Upd<SteelColumnSpec>} />;
      break;
    case "basePlate":
      body = <BasePlateEditor p={p} m={m} upd={upd as Upd<BasePlateSpec>} />;
      break;
    case "diaphragm":
      body = <DiaphragmEditor p={p} m={m} upd={upd as Upd<DiaphragmSpec>} />;
      break;
    case "transfer":
      body = <TransferEditor p={p} m={m} upd={upd as Upd<TransferSpec>} />;
      break;
    case "uplift":
      body = <UpliftEditor p={p} m={m} upd={upd as Upd<UpliftSpec>} />;
      break;
    case "ledger":
      body = <LedgerEditor p={p} m={m} upd={upd as Upd<LedgerSpec>} />;
      break;
    case "masonryWall":
      body = <MasonryWallEditor p={p} m={m} upd={upd as Upd<MasonryWallSpec>} />;
      break;
    case "holdownFooting":
      body = <HoldownFootingEditor p={p} m={m} upd={upd as Upd<HoldownFootingSpec>} />;
      break;
    case "tieIn":
      body = <TieInEditor p={p} m={m} upd={upd as Upd<TieInSpec>} />;
      break;
    case "woodTruss":
      body = <WoodTrussEditor p={p} m={m} upd={upd as Upd<WoodTrussSpec>} />;
      break;
    case "retainingWall":
      body = <RetainingWallEditor p={p} m={m} upd={upd as Upd<RetainingWallSpec>} />;
      break;
    case "guardPost":
      body = <GuardPostEditor p={p} m={m} upd={upd as Upd<GuardPostSpec>} />;
      break;
    case "cfsWall":
      body = <CfsWallEditor p={p} m={m} upd={upd as Upd<CfsWallSpec>} />;
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
        {!strip ? (
          <Check
            checked={!!m.thickened}
            onChange={(v) => upd({ thickened: v || undefined })}
            label="Thickened slab-on-grade under the post (monolithic with the slab)"
          />
        ) : null}
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
        <Field label="Start position along the line (ft)" hint="Optional — gives the exact collector force profile">
          <NumberInput value={m.x} allowEmpty min={0} onChange={(v) => upd({ x: v })} />
        </Field>
        <Check
          checked={!!m.opening}
          onChange={(v) =>
            upd({
              opening: v
                ? {
                    L1: m.b / 4,
                    Lo: m.b / 2,
                    L2: m.b / 4,
                    ha: 1.5,
                    hb: 3,
                    strapId: p.hardware.find((h) => h.kind === "strap")?.id,
                  }
                : undefined,
            })
          }
          label="Force transfer around one opening (FTAO)"
        />
        {m.opening ? (
          <>
            <Grid cols={3}>
              <Field label="Pier L1 (ft)">
                <NumberInput
                  value={m.opening.L1}
                  min={1}
                  onChange={(v) => upd({ opening: { ...m.opening!, L1: v ?? 2 } })}
                />
              </Field>
              <Field label="Opening Lo (ft)">
                <NumberInput
                  value={m.opening.Lo}
                  min={1}
                  onChange={(v) => upd({ opening: { ...m.opening!, Lo: v ?? 3 } })}
                />
              </Field>
              <Field label="Pier L2 (ft)">
                <NumberInput
                  value={m.opening.L2}
                  min={1}
                  onChange={(v) => upd({ opening: { ...m.opening!, L2: v ?? 2 } })}
                />
              </Field>
            </Grid>
            <Grid cols={3}>
              <Field label="Height above opening (ft)">
                <NumberInput
                  value={m.opening.ha}
                  min={0.5}
                  onChange={(v) => upd({ opening: { ...m.opening!, ha: v ?? 1 } })}
                />
              </Field>
              <Field label="Height below opening (ft)">
                <NumberInput
                  value={m.opening.hb}
                  min={0}
                  onChange={(v) => upd({ opening: { ...m.opening!, hb: v ?? 0 } })}
                />
              </Field>
              <Field label="Strap">
                <Select
                  value={m.opening.strapId ?? ""}
                  options={[
                    { value: "", label: "— select —" },
                    ...p.hardware.filter((h) => h.kind === "strap").map((h) => ({ value: h.id, label: h.model })),
                  ]}
                  onChange={(v) => upd({ opening: { ...m.opening!, strapId: v || undefined } })}
                />
              </Field>
            </Grid>
            <Hint>Wall length b_s must equal L1 + Lo + L2.</Hint>
          </>
        ) : null}
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
              {panel1532Shear(x.key, x.spacing) ? (
                <Check
                  checked={!!x.panel1532}
                  onChange={(v) => setSide(i, { panel1532: v || undefined })}
                  label="Use 15/32 in. shear values (SDPWS Table 4.3A note: studs ≤ 16 in. o.c. or panels across studs)"
                />
              ) : null}
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

/* ============================== Phase 3 editors ============================== */

const STEEL_BEAM_SHAPES = [...W_SHAPES.map((x) => x.name), ...C_SHAPES.map((x) => x.name), ...HSS_NAMES];
const STEEL_COLUMN_SHAPES = [...HSS_NAMES, ...ROUND_NAMES, ...W_SHAPES.map((x) => x.name)];
const gradeOptions = (shape: string) => {
  let fam: string;
  try {
    fam = steelShape(shape).family;
  } catch {
    fam = "W";
  }
  return STEEL_GRADES.filter((g) => g.families !== "plate" && (g.families as string[]).includes(fam)).map((g) => ({
    value: g.id,
    label: g.label,
  }));
};
const METHODS = [
  { value: "LRFD" as const, label: "LRFD (ASCE 7 §2.3)" },
  { value: "ASD" as const, label: "ASD (ASCE 7 §2.4)" },
];

function SteelSectionFields({
  shape,
  grade,
  method,
  shapes,
  onChange,
}: {
  shape: string;
  grade: string;
  method: "LRFD" | "ASD";
  shapes: string[];
  onChange: (x: { shape?: string; grade?: string; method?: "LRFD" | "ASD" }) => void;
}) {
  return (
    <Grid cols={3}>
      <Field label="Section">
        <Select
          value={shape}
          options={shapes}
          onChange={(v) => {
            const g = gradeOptions(v);
            onChange({ shape: v, grade: g.some((x) => x.value === grade) ? grade : g[0]?.value });
          }}
        />
      </Field>
      <Field label="Steel grade">
        <Select value={grade} options={gradeOptions(shape)} onChange={(v) => onChange({ grade: v })} />
      </Field>
      <Field label="Method">
        <Select value={method} options={METHODS} onChange={(v) => onChange({ method: v })} />
      </Field>
    </Grid>
  );
}

function SteelBeamEditor({ p, m, upd }: { p: Project; m: SteelBeamSpec; upd: Upd<SteelBeamSpec> }) {
  const n = m.spans.length + 1;
  const bearing = Array.from({ length: n }, (_, i) => m.bearing[i] ?? m.bearing[m.bearing.length - 1]);
  const setB = (i: number, patch: Partial<SteelBeamSpec["bearing"][number]>) =>
    upd({ bearing: bearing.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  return (
    <>
      <Section title="Steel beam">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Field label="Type">
          <Select
            value={m.role}
            options={[
              { value: "beam", label: "Beam" },
              { value: "header", label: "Header" },
              { value: "lintel", label: "Lintel" },
              { value: "ridge", label: "Ridge beam" },
              { value: "flush", label: "Flush beam" },
              { value: "dropped", label: "Dropped beam" },
            ]}
            onChange={(v) => upd({ role: v })}
          />
        </Field>
        <SteelSectionFields
          shape={m.shape}
          grade={m.grade}
          method={m.method}
          shapes={STEEL_BEAM_SHAPES}
          onChange={(x) => upd(x)}
        />
      </Section>
      <Section title="Spans, supports and bracing">
        <SpansFields spans={m.spans} left={m.leftCantilever} right={m.rightCantilever} onChange={(x) => upd(x)} />
        <Grid>
          <Check
            checked={!!m.fixedLeft}
            onChange={(v) => upd({ fixedLeft: v || undefined })}
            label="Left end fixed (moment connection)"
          />
          <Check
            checked={!!m.fixedRight}
            onChange={(v) => upd({ fixedRight: v || undefined })}
            label="Right end fixed (moment connection)"
          />
        </Grid>
        <Grid>
          <Field label="Unbraced length L_b (ft)" hint="0 = compression flange continuously braced">
            <NumberInput value={m.Lb} min={0} onChange={(v) => upd({ Lb: v ?? 0 })} />
          </Field>
          <Field label="C_b override (blank = Eq. F1-1)">
            <NumberInput value={m.CbOverride} allowEmpty min={1} max={3} onChange={(v) => upd({ CbOverride: v })} />
          </Field>
        </Grid>
        {bearing.map((b, i) => (
          <Grid key={i} cols={4}>
            <Field label={`Bearing ${String.fromCharCode(65 + i)} l_b (in)`}>
              <NumberInput value={b.lb} min={1} onChange={(v) => setB(i, { lb: v ?? b.lb })} />
            </Field>
            <Field label="On">
              <Select
                value={b.support}
                options={[
                  { value: "post", label: "Wood post (end grain)" },
                  { value: "wood", label: "Wood plate / beam" },
                  { value: "steel", label: "Steel (connection)" },
                  { value: "concrete", label: "Concrete / CMU" },
                ]}
                onChange={(v) => setB(i, { support: v })}
              />
            </Field>
            {b.support === "wood" || b.support === "post" ? (
              <>
                <Field label="Species / grade">
                  <Select
                    value={`${b.species ?? "DF-L"}|${b.grade ?? "No.2"}`}
                    options={["DF-L|No.1", "DF-L|No.2", "HF|No.2", "SP|No.2"].map((v) => ({
                      value: v,
                      label: v.replace("|", " "),
                    }))}
                    onChange={(v) => setB(i, { species: v.split("|")[0] as Species, grade: v.split("|")[1] as Grade })}
                  />
                </Field>
                <Field label="Size">
                  <Select
                    value={b.size ?? "4x4"}
                    options={["2x4", "2x6", "4x4", "4x6", "6x6", "6x8"]}
                    onChange={(v) => setB(i, { size: v })}
                  />
                </Field>
              </>
            ) : null}
          </Grid>
        ))}
      </Section>
      <AreaWallsEditor p={p} area={m.area} walls={m.walls} onChange={(x) => upd(x)} />
      <Section title="Other loads and criteria">
        <Collapsible title={`Line / point loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
        <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as SteelBeamSpec["deflection"] })} />
        <Check checked={m.selfWeight} onChange={(v) => upd({ selfWeight: v })} label="Include member self weight" />
      </Section>
    </>
  );
}

function SteelColumnEditor({ p, m, upd }: { p: Project; m: SteelColumnSpec; upd: Upd<SteelColumnSpec> }) {
  return (
    <>
      <Section title="Steel column">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <SteelSectionFields
          shape={m.shape}
          grade={m.grade}
          method={m.method}
          shapes={STEEL_COLUMN_SHAPES}
          onChange={(x) => upd(x)}
        />
        <Grid cols={4}>
          <Field label="Height (ft)">
            <NumberInput value={m.height} min={1} onChange={(v) => upd({ height: v ?? m.height })} />
          </Field>
          <Field label="K_x">
            <NumberInput value={m.Kx} min={0.5} onChange={(v) => upd({ Kx: v ?? 1 })} />
          </Field>
          <Field label="K_y">
            <NumberInput value={m.Ky} min={0.5} onChange={(v) => upd({ Ky: v ?? 1 })} />
          </Field>
          <Field label="Weak-axis L (ft)">
            <NumberInput value={m.Ly} allowEmpty min={1} onChange={(v) => upd({ Ly: v })} />
          </Field>
        </Grid>
        <Grid>
          <Field label="Eccentricity e_x (in) → M_y">
            <NumberInput value={m.ex} min={0} onChange={(v) => upd({ ex: v ?? 0 })} />
          </Field>
          <Field label="Eccentricity e_y (in) → M_x">
            <NumberInput value={m.ey} min={0} onChange={(v) => upd({ ey: v ?? 0 })} />
          </Field>
        </Grid>
        <Check
          checked={!!m.wind}
          onChange={(v) => upd({ wind: v ? { psf: 20, width: 2 } : undefined })}
          label="Wind on the column (bending about x)"
        />
        {m.wind ? (
          <Grid>
            <Field label="Wind pressure (psf, strength)">
              <NumberInput value={m.wind.psf} min={0} onChange={(v) => upd({ wind: { ...m.wind!, psf: v ?? 0 } })} />
            </Field>
            <Field label="Tributary width (ft)">
              <NumberInput
                value={m.wind.width}
                min={0}
                onChange={(v) => upd({ wind: { ...m.wind!, width: v ?? 0 } })}
              />
            </Field>
          </Grid>
        ) : null}
        <Check
          checked={!!m.cap}
          onChange={(v) => upd({ cap: v ? { length: 6, width: 5.5, species: "DF-L", grade: "No.1" } : undefined })}
          label="Check wood beam bearing on the cap plate"
        />
        {m.cap ? (
          <Grid>
            <Field label="Cap plate length along the beam (in)">
              <NumberInput value={m.cap.length} min={1} onChange={(v) => upd({ cap: { ...m.cap!, length: v ?? 6 } })} />
            </Field>
            <Field label="Beam width (in)">
              <NumberInput value={m.cap.width} min={1} onChange={(v) => upd({ cap: { ...m.cap!, width: v ?? 5.5 } })} />
            </Field>
          </Grid>
        ) : null}
        <Check checked={m.selfWeight} onChange={(v) => upd({ selfWeight: v })} label="Include column self weight" />
        <Hint>Axial loads arrive by point links from the beams above (load path) or as entered point loads.</Hint>
        <Collapsible title={`Entered point loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
    </>
  );
}

function VectorFields({
  label,
  v,
  onChange,
}: {
  label: string;
  v: Record<LoadType, number>;
  onChange: (v: Record<LoadType, number>) => void;
}) {
  return (
    <Grid cols={3}>
      {LOAD_TYPES.map((t) => (
        <Field key={t} label={`${label} ${t}`}>
          <NumberInput value={v[t]} onChange={(x) => onChange({ ...v, [t]: x ?? 0 })} />
        </Field>
      ))}
    </Grid>
  );
}

function BasePlateEditor({ p, m, upd }: { p: Project; m: BasePlateSpec; upd: Upd<BasePlateSpec> }) {
  const cols = p.members.filter((x) => x.kind === "steelColumn");
  const r = m.rod;
  const setRod = (x: Partial<BasePlateSpec["rod"]>) => upd({ rod: { ...r, ...x } });
  return (
    <>
      <Section title="Base plate">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid>
          <Field label="Column above (forces)">
            <Select
              value={m.sourceId ?? ""}
              options={[
                { value: "", label: "None — entered forces only" },
                ...cols.map((c) => ({ value: c.id, label: c.mark })),
              ]}
              onChange={(v) => upd({ sourceId: v || undefined })}
            />
          </Field>
          <Field label="Method">
            <Select value={m.method} options={METHODS} onChange={(v) => upd({ method: v })} />
          </Field>
        </Grid>
        {!m.sourceId ? (
          <Field label="Column section">
            <Select value={m.column} options={STEEL_COLUMN_SHAPES} onChange={(v) => upd({ column: v })} />
          </Field>
        ) : null}
        <Grid cols={4}>
          <Field label="N (in)">
            <NumberInput
              value={m.plate.N}
              min={4}
              onChange={(v) => upd({ plate: { ...m.plate, N: v ?? m.plate.N } })}
            />
          </Field>
          <Field label="B (in)">
            <NumberInput
              value={m.plate.B}
              min={4}
              onChange={(v) => upd({ plate: { ...m.plate, B: v ?? m.plate.B } })}
            />
          </Field>
          <Field label="t_p (in)">
            <NumberInput
              value={m.plate.tp}
              min={0.25}
              onChange={(v) => upd({ plate: { ...m.plate, tp: v ?? m.plate.tp } })}
            />
          </Field>
          <Field label="Weld (in)">
            <NumberInput
              value={m.weld.w}
              min={0.125}
              onChange={(v) => upd({ weld: { ...m.weld, w: v ?? m.weld.w } })}
            />
          </Field>
        </Grid>
      </Section>
      <Section title="Anchor rods">
        <Grid cols={4}>
          <Field label="Diameter (in)">
            <Select
              value={String(r.d)}
              options={["0.5", "0.625", "0.75", "0.875", "1"]}
              onChange={(v) => setRod({ d: Number(v) })}
            />
          </Field>
          <Field label="Steel">
            <Select
              value={String(r.steel)}
              options={ANCHOR_STEELS.map((a, i) => ({ value: String(i), label: a.label }))}
              onChange={(v) => setRod({ steel: Number(v) })}
            />
          </Field>
          <Field label="n_x × n_y">
            <Select
              value={`${r.nx}x${r.ny}`}
              options={["2x1", "2x2", "2x3", "3x2", "3x3"]}
              onChange={(v) => setRod({ nx: Number(v.split("x")[0]), ny: Number(v.split("x")[1]) })}
            />
          </Field>
          <Field label="Type">
            <Select
              value={r.type}
              options={[
                { value: "headed", label: "Headed / nut" },
                { value: "hooked", label: "Hooked (J)" },
              ]}
              onChange={(v) => setRod({ type: v })}
            />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="s_x (in)">
            <NumberInput value={r.sx} min={0} onChange={(v) => setRod({ sx: v ?? r.sx })} />
          </Field>
          <Field label="s_y (in)">
            <NumberInput value={r.sy} min={0} onChange={(v) => setRod({ sy: v ?? r.sy })} />
          </Field>
          <Field label="Edge on plate e1 (in)">
            <NumberInput value={r.e1} min={0.75} onChange={(v) => setRod({ e1: v ?? r.e1 })} />
          </Field>
          <Field label="h_ef (in)">
            <NumberInput value={r.hef} min={3} onChange={(v) => setRod({ hef: v ?? r.hef })} />
          </Field>
        </Grid>
        <Grid cols={4}>
          {r.type === "headed" ? (
            <Field label="A_brg (in²)">
              <NumberInput value={r.Abrg} min={0.1} onChange={(v) => setRod({ Abrg: v ?? r.Abrg })} />
            </Field>
          ) : (
            <Field label="Hook e_h (in)">
              <NumberInput value={r.eh} min={1} onChange={(v) => setRod({ eh: v ?? r.eh })} />
            </Field>
          )}
          <Field label="Rods in shear">
            <NumberInput value={r.nShear} allowEmpty min={1} step="1" onChange={(v) => setRod({ nShear: v })} />
          </Field>
          <Field label="Washer t (in)">
            <NumberInput value={r.washer} min={0} onChange={(v) => setRod({ washer: v ?? 0 })} />
          </Field>
          <Check checked={r.groutPad} onChange={(v) => setRod({ groutPad: v })} label="Built-up grout pad" />
        </Grid>
      </Section>
      <Section title="Foundation">
        <Grid cols={4}>
          {["x−", "x+", "y−", "y+"].map((lab, k) => (
            <Field key={k} label={`Edge ${lab} from centre (in)`}>
              <NumberInput
                value={m.foundation.edges[k]}
                min={2}
                onChange={(v) => {
                  const e = [...m.foundation.edges] as [number, number, number, number];
                  e[k] = v ?? e[k];
                  upd({ foundation: { ...m.foundation, edges: e } });
                }}
              />
            </Field>
          ))}
        </Grid>
        <Grid cols={3}>
          <Field label="Thickness h_a (in)">
            <NumberInput
              value={m.foundation.ha}
              min={4}
              onChange={(v) => upd({ foundation: { ...m.foundation, ha: v ?? 12 } })}
            />
          </Field>
          <Field label="Condition">
            <Select
              value={m.foundation.condition}
              options={[
                { value: "B", label: "B — no supplementary reinf. (φ 0.70)" },
                { value: "A", label: "A — supplementary reinf. (φ 0.75)" },
              ]}
              onChange={(v) => upd({ foundation: { ...m.foundation, condition: v } })}
            />
          </Field>
          <Check
            checked={m.foundation.cracked}
            onChange={(v) => upd({ foundation: { ...m.foundation, cracked: v } })}
            label="Cracked concrete"
          />
        </Grid>
      </Section>
      <Collapsible title="Additional unfactored base forces (by load type)">
        <VectorFields label="P (lb)" v={m.P} onChange={(v) => upd({ P: v })} />
        <VectorFields label="M (lb-ft)" v={m.M} onChange={(v) => upd({ M: v })} />
        <VectorFields label="V (lb)" v={m.V} onChange={(v) => upd({ V: v })} />
      </Collapsible>
    </>
  );
}

function DiaphragmEditor({ p, m, upd }: { p: Project; m: DiaphragmSpec; upd: Upd<DiaphragmSpec> }) {
  const stories = p.lateral?.stories ?? [];
  const straps = p.hardware.filter((h) => h.kind === "strap");
  return (
    <>
      <Section title="Diaphragm">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        {!p.lateral?.enabled ? <Hint>Enable the lateral analysis and give the wall lines plan positions.</Hint> : null}
        <Grid cols={3}>
          <Field label="Level">
            <Select
              value={m.level}
              options={[
                { value: "roof", label: "Roof" },
                { value: "floor", label: "Floor" },
              ]}
              onChange={(v) => upd({ level: v })}
            />
          </Field>
          <Field label="Story (diaphragm at its top)">
            <Select
              value={m.storyId}
              options={stories.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => upd({ storyId: v })}
            />
          </Field>
          <Field label="Load direction">
            <Select value={m.dir} options={["X", "Y"] as const} onChange={(v) => upd({ dir: v })} />
          </Field>
        </Grid>
        <Field label="Sheathing (SDPWS Table 4.2A)">
          <Select
            value={m.sheathing}
            options={DIAPHRAGM_ROWS.map((r) => ({ value: r.key, label: r.label }))}
            onChange={(v) => upd({ sheathing: v })}
          />
        </Field>
        <Grid cols={3}>
          <Check checked={m.blocked} onChange={(v) => upd({ blocked: v })} label="Blocked" />
          {m.blocked ? (
            <Field label="Edge nailing (boundary / other)">
              <Select
                value={m.edge}
                options={["6/6", "4/6", "2.5/4", "2/3"] as const}
                onChange={(v) => upd({ edge: v })}
              />
            </Field>
          ) : (
            <Field label="Unblocked load case">
              <Select
                value={String(m.unblockedCase)}
                options={[
                  { value: "1", label: "Case 1" },
                  { value: "2", label: "Cases 2–6" },
                ]}
                onChange={(v) => upd({ unblockedCase: Number(v) as 1 | 2 })}
              />
            </Field>
          )}
          <Check
            checked={m.collectorOmega}
            onChange={(v) => upd({ collectorOmega: v })}
            label="Ω0 on collectors (do not use the light-frame exception)"
          />
        </Grid>
      </Section>
      <Section title="Chord / collector (double top plate)">
        <SawnFields
          species={m.chord.species}
          grade={m.chord.grade}
          size={m.chord.size}
          sizes={["2x4", "2x6", "2x8"]}
          onChange={(x) => upd({ chord: { ...m.chord, ...x } })}
        />
        <Grid cols={3}>
          <Field label="Splice">
            <Select
              value={m.chord.splice.type}
              options={[
                { value: "nails", label: "Nailed lap" },
                { value: "strap", label: "Strap" },
              ]}
              onChange={(v) =>
                upd({
                  chord: {
                    ...m.chord,
                    splice: {
                      ...m.chord.splice,
                      type: v,
                      strapId: v === "strap" ? (straps[0]?.id ?? undefined) : undefined,
                    },
                  },
                })
              }
            />
          </Field>
          {m.chord.splice.type === "nails" ? (
            <>
              <Field label="Nail">
                <Select
                  value={m.chord.splice.nail}
                  options={NAILS.map((n) => ({ value: n.key, label: n.label }))}
                  onChange={(v) => upd({ chord: { ...m.chord, splice: { ...m.chord.splice, nail: v } } })}
                />
              </Field>
              <Field label="Nails each side">
                <NumberInput
                  value={m.chord.splice.nails}
                  min={1}
                  step="1"
                  onChange={(v) => upd({ chord: { ...m.chord, splice: { ...m.chord.splice, nails: v ?? 8 } } })}
                />
              </Field>
            </>
          ) : (
            <Field label="Strap">
              <Select
                value={m.chord.splice.strapId ?? ""}
                options={straps.map((h) => ({ value: h.id, label: h.model }))}
                onChange={(v) => upd({ chord: { ...m.chord, splice: { ...m.chord.splice, strapId: v } } })}
              />
            </Field>
          )}
        </Grid>
      </Section>
    </>
  );
}

function TransferEditor({ p, m, upd }: { p: Project; m: TransferSpec; upd: Upd<TransferSpec> }) {
  const walls = p.members.filter((x) => x.kind === "shearWall");
  const lines = p.lateral?.lines ?? [];
  const clips = p.hardware.filter((h) => h.kind === "angle" || h.kind === "tie" || h.kind === "strap");
  const src = m.source.kind === "wall" ? `w:${m.source.id}` : `l:${m.source.lineId}`;
  return (
    <Section title="Shear transfer">
      <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
      <Grid>
        <Field label="Interface">
          <Select
            value={m.interface}
            options={[
              { value: "diaphragm-to-wall", label: "Diaphragm / blocking to top plate" },
              { value: "sole-plate", label: "Sole plate to framing below" },
              { value: "rim-to-sill", label: "Rim / blocking to sill" },
              { value: "other", label: "Other" },
            ]}
            onChange={(v) => upd({ interface: v })}
          />
        </Field>
        <Field label="Demand from">
          <Select
            value={src}
            options={[
              ...walls.map((w) => ({ value: `w:${w.id}`, label: `Shear wall ${w.mark}` })),
              ...lines.map((l) => ({ value: `l:${l.id}`, label: `Wall line ${l.name} (full length)` })),
            ]}
            onChange={(v) =>
              upd({
                source: v.startsWith("w:") ? { kind: "wall", id: v.slice(2) } : { kind: "line", lineId: v.slice(2) },
              })
            }
          />
        </Field>
      </Grid>
      <Grid cols={3}>
        <Field label="Connector">
          <Select
            value={m.connector.type}
            options={[
              { value: "clip", label: "Clip / hardware" },
              { value: "nails", label: "Nails (NDS 12.3)" },
            ]}
            onChange={(v) =>
              upd({
                connector:
                  v === "clip"
                    ? { type: "clip", hardwareId: clips[0]?.id ?? "", direction: "F1" }
                    : { type: "nails", nail: "16d-common", ts: 1.5, tm: 1.5, species: "DF-L", toenail: false, rows: 1 },
              })
            }
          />
        </Field>
        <Field label="Spacing (in)">
          <NumberInput value={m.spacing} min={1} onChange={(v) => upd({ spacing: v ?? m.spacing })} />
        </Field>
      </Grid>
      {m.connector.type === "clip" ? (
        <Grid>
          <Field label="Hardware">
            <Select
              value={m.connector.hardwareId}
              options={clips.map((h) => ({ value: h.id, label: h.model }))}
              onChange={(v) =>
                upd({
                  connector: {
                    ...(m.connector as { type: "clip"; hardwareId: string; direction: "F1" | "F2" }),
                    hardwareId: v,
                  },
                })
              }
            />
          </Field>
          <Field label="Direction">
            <Select
              value={m.connector.direction}
              options={["F1", "F2"] as const}
              onChange={(v) =>
                upd({
                  connector: {
                    ...(m.connector as { type: "clip"; hardwareId: string; direction: "F1" | "F2" }),
                    direction: v,
                  },
                })
              }
            />
          </Field>
        </Grid>
      ) : (
        (() => {
          const c = m.connector as Extract<TransferSpec["connector"], { type: "nails" }>;
          const set = (x: Partial<typeof c>) => upd({ connector: { ...c, ...x } });
          return (
            <Grid cols={4}>
              <Field label="Nail">
                <Select
                  value={c.nail}
                  options={NAILS.map((n) => ({ value: n.key, label: n.label }))}
                  onChange={(v) => set({ nail: v })}
                />
              </Field>
              <Field label="Side member t (in)">
                <NumberInput value={c.ts} min={0.5} onChange={(v) => set({ ts: v ?? c.ts })} />
              </Field>
              <Field label="Main member t (in)">
                <NumberInput value={c.tm} min={0.5} onChange={(v) => set({ tm: v ?? c.tm })} />
              </Field>
              <Field label="Rows">
                <NumberInput value={c.rows} min={1} max={3} step="1" onChange={(v) => set({ rows: v ?? 1 })} />
              </Field>
              <Check checked={c.toenail} onChange={(v) => set({ toenail: v })} label="Toe-nailed (C_tn 0.83)" />
            </Grid>
          );
        })()
      )}
    </Section>
  );
}

function UpliftEditor({ p, m, upd }: { p: Project; m: UpliftSpec; upd: Upd<UpliftSpec> }) {
  const sources = p.members.filter((x) => ["rafter", "truss", "ceilingJoist", "joist", "ijoist"].includes(x.kind));
  const src = sources.find((x) => x.id === m.sourceId);
  const setL = (i: number, x: Partial<UpliftSpec["levels"][number]>) =>
    upd({ levels: m.levels.map((l, k) => (k === i ? { ...l, ...x } : l)) });
  const hw = p.hardware.filter((h) => h.kind !== "hanger");
  return (
    <Section title="Wind uplift load path">
      <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
      <Grid>
        <Field label="Roof member">
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
      </Grid>
      {m.levels.map((l, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <TextInput value={l.label} onChange={(v) => setL(i, { label: v })} />
            </div>
            {m.levels.length > 1 ? (
              <SmallButton
                tone="danger"
                title="Remove"
                onClick={() => upd({ levels: m.levels.filter((_, k) => k !== i) })}
              >
                ✕
              </SmallButton>
            ) : null}
          </div>
          <Grid cols={3}>
            <Field label="Connector">
              <Select
                value={l.connector.type === "hardware" ? l.connector.hardwareId : "__entered"}
                options={[
                  ...hw.map((h) => ({ value: h.id, label: h.model })),
                  { value: "__entered", label: "Entered capacity" },
                ]}
                onChange={(v) =>
                  setL(i, {
                    connector:
                      v === "__entered"
                        ? { type: "entered", capacity: 500, source: "entered — VERIFY", model: "Anchor" }
                        : { type: "hardware", hardwareId: v },
                  })
                }
              />
            </Field>
            <Field label="Spacing (in)">
              <NumberInput value={l.spacing} min={1} onChange={(v) => setL(i, { spacing: v ?? l.spacing })} />
            </Field>
            <Field label="Dead load added above (plf)">
              <NumberInput value={l.deadAbove} min={0} onChange={(v) => setL(i, { deadAbove: v ?? 0 })} />
            </Field>
          </Grid>
          {l.connector.type === "entered" ? (
            <Grid cols={3}>
              <Field label="Model / description">
                <TextInput
                  value={l.connector.model}
                  onChange={(v) =>
                    setL(i, {
                      connector: { ...(l.connector as Extract<typeof l.connector, { type: "entered" }>), model: v },
                    })
                  }
                />
              </Field>
              <Field label="Allowable (lb)">
                <NumberInput
                  value={l.connector.capacity}
                  min={1}
                  onChange={(v) =>
                    setL(i, {
                      connector: {
                        ...(l.connector as Extract<typeof l.connector, { type: "entered" }>),
                        capacity: v ?? 1,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Source">
                <TextInput
                  value={l.connector.source}
                  onChange={(v) =>
                    setL(i, {
                      connector: { ...(l.connector as Extract<typeof l.connector, { type: "entered" }>), source: v },
                    })
                  }
                />
              </Field>
            </Grid>
          ) : null}
        </div>
      ))}
      <AddButton
        onClick={() =>
          upd({
            levels: [
              ...m.levels,
              {
                label: "Next level",
                deadAbove: 0,
                connector: { type: "hardware", hardwareId: hw[0]?.id ?? "" },
                spacing: m.levels[m.levels.length - 1]?.spacing ?? 24,
              },
            ],
          })
        }
      >
        + Add connection level
      </AddButton>
    </Section>
  );
}

function LedgerEditor({ p, m, upd }: { p: Project; m: LedgerSpec; upd: Upd<LedgerSpec> }) {
  return (
    <>
      <Section title="Ledger">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <SawnFields
          species={m.ledger.species}
          grade={m.ledger.grade}
          size={m.ledger.size}
          sizes={DIMENSION_SIZES}
          onChange={(x) => upd({ ledger: { ...m.ledger, ...x } })}
        />
        <Grid cols={4}>
          <Field label="Fastener">
            <Select
              value={m.fastener.type}
              options={[
                { value: "bolt", label: "Bolt / anchor" },
                { value: "lag", label: "Lag screw" },
              ]}
              onChange={(v) => upd({ fastener: { ...m.fastener, type: v } })}
            />
          </Field>
          <Field label="Diameter (in)">
            <Select
              value={String(m.fastener.D)}
              options={["0.375", "0.5", "0.625", "0.75"]}
              onChange={(v) => upd({ fastener: { ...m.fastener, D: Number(v) } })}
            />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput
              value={m.fastener.spacing}
              min={4}
              onChange={(v) => upd({ fastener: { ...m.fastener, spacing: v ?? 24 } })}
            />
          </Field>
          <Field label="F_yb (psi)">
            <NumberInput
              value={m.fastener.Fyb}
              min={10000}
              onChange={(v) => upd({ fastener: { ...m.fastener, Fyb: v ?? 45000 } })}
            />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Into">
            <Select
              value={m.support.kind}
              options={[
                { value: "wood", label: "Wood rim" },
                { value: "concrete", label: "Concrete wall" },
                { value: "cmu", label: "Grouted CMU" },
              ]}
              onChange={(v) =>
                upd({
                  support:
                    v === "wood"
                      ? { kind: "wood", species: "DF-L", thickness: 1.5 }
                      : { kind: v, Fe: v === "cmu" ? 6000 : 7500, embed: 5 },
                })
              }
            />
          </Field>
          {m.support.kind === "wood" ? (
            <Field label="Rim thickness (in)">
              <NumberInput
                value={m.support.thickness}
                min={1}
                onChange={(v) =>
                  upd({
                    support: {
                      ...(m.support as Extract<LedgerSpec["support"], { kind: "wood" }>),
                      thickness: v ?? 1.5,
                    },
                  })
                }
              />
            </Field>
          ) : (
            <>
              <Field label="Dowel bearing F_e (psi)">
                <NumberInput
                  value={m.support.Fe}
                  min={1000}
                  onChange={(v) =>
                    upd({
                      support: {
                        ...(m.support as Extract<LedgerSpec["support"], { kind: "concrete" | "cmu" }>),
                        Fe: v ?? 7500,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Embedment (in)">
                <NumberInput
                  value={m.support.embed}
                  min={1}
                  onChange={(v) =>
                    upd({
                      support: {
                        ...(m.support as Extract<LedgerSpec["support"], { kind: "concrete" | "cmu" }>),
                        embed: v ?? 5,
                      },
                    })
                  }
                />
              </Field>
            </>
          )}
        </Grid>
        <Grid cols={3}>
          <Field label="Continuity factor k_c">
            <NumberInput value={m.continuity} min={1} onChange={(v) => upd({ continuity: v ?? 1.25 })} />
          </Field>
          <Field label="Wind along ledger (plf)">
            <NumberInput value={m.lateral.W} min={0} onChange={(v) => upd({ lateral: { ...m.lateral, W: v ?? 0 } })} />
          </Field>
          <Field label="Seismic along ledger (plf)">
            <NumberInput value={m.lateral.E} min={0} onChange={(v) => upd({ lateral: { ...m.lateral, E: v ?? 0 } })} />
          </Field>
        </Grid>
        <Hint>Vertical loads arrive by line links from the joists (load path) or as entered line loads.</Hint>
        <Collapsible title={`Entered line loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
    </>
  );
}

const BAR_OPTIONS = Object.keys(BARS);

function MasonryWallEditor({ p, m, upd }: { p: Project; m: MasonryWallSpec; upd: Upd<MasonryWallSpec> }) {
  const cmu = m.material === "cmu";
  const num = (v: number | undefined, d: number) => v ?? d;
  return (
    <>
      <Section title={cmu ? "CMU wall" : "Concrete wall"}>
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={4}>
          <Field label="Length L (ft)">
            <NumberInput value={m.L} min={1} onChange={(v) => upd({ L: num(v, 12) })} />
          </Field>
          <Field label="Height h (ft)">
            <NumberInput value={m.h} min={0.5} onChange={(v) => upd({ h: num(v, 3) })} />
          </Field>
          <Field label="Thickness t (in)">
            <NumberInput value={m.t} min={4} onChange={(v) => upd({ t: num(v, 7.625) })} />
          </Field>
          <Field label="Parapet (ft)">
            <NumberInput value={m.parapet ?? 0} min={0} onChange={(v) => upd({ parapet: v || undefined })} />
          </Field>
        </Grid>
        <Field label="Out-of-plane support">
          <Select
            value={m.support}
            options={[
              { value: "pinned-fixed", label: "Pinned top (diaphragm), fixed base" },
              { value: "pinned-pinned", label: "Pinned top and base" },
              { value: "fixed-fixed", label: "Fixed top and base" },
              { value: "cantilever", label: "Cantilever (free top, fixed base)" },
            ]}
            onChange={(v) => upd({ support: v })}
          />
        </Field>
        {cmu && m.cmu ? (
          <>
            <Grid cols={4}>
              <Field label="f'm (psi)">
                <NumberInput
                  value={m.cmu.fm}
                  min={1000}
                  onChange={(v) => upd({ cmu: { ...m.cmu!, fm: num(v, 2000) } })}
                />
              </Field>
              <Field label="Mortar">
                <Select
                  value={m.cmu.mortar}
                  options={["M", "S", "N"]}
                  onChange={(v) => upd({ cmu: { ...m.cmu!, mortar: v as "M" | "S" | "N" } })}
                />
              </Field>
              <Field label="F_b / f'm">
                <NumberInput
                  value={m.cmu.FbFactor}
                  min={0.2}
                  onChange={(v) => upd({ cmu: { ...m.cmu!, FbFactor: num(v, 0.45) } })}
                />
              </Field>
              <Field label="Unit weight (pcf)">
                <NumberInput
                  value={m.cmu.block.gammaBlock}
                  min={60}
                  onChange={(v) => upd({ cmu: { ...m.cmu!, block: { ...m.cmu!.block, gammaBlock: num(v, 115) } } })}
                />
              </Field>
            </Grid>
            <Field label="f'm basis">
              <TextInput value={m.cmu.fmSource} onChange={(v) => upd({ cmu: { ...m.cmu!, fmSource: v } })} />
            </Field>
            <Check
              checked={m.cmu.shearDeformation}
              onChange={(v) => upd({ cmu: { ...m.cmu!, shearDeformation: v } })}
              label="Include shear deformation in the panel analysis"
            />
          </>
        ) : m.concrete ? (
          <Grid cols={3}>
            <Field label="f'c (psi)">
              <NumberInput
                value={m.concrete.fc}
                min={2500}
                onChange={(v) => upd({ concrete: { ...m.concrete!, fc: num(v, 2500) } })}
              />
            </Field>
            <Field label="Cover (in)">
              <NumberInput
                value={m.concrete.cover}
                min={0.75}
                onChange={(v) => upd({ concrete: { ...m.concrete!, cover: num(v, 1.5) } })}
              />
            </Field>
            <Field label="Unit weight (pcf)">
              <NumberInput
                value={m.concrete.gamma}
                min={90}
                onChange={(v) => upd({ concrete: { ...m.concrete!, gamma: num(v, 150) } })}
              />
            </Field>
          </Grid>
        ) : null}
      </Section>
      <Section title="Reinforcement">
        <Grid cols={4}>
          <Field label="Vertical bar">
            <Select
              value={m.vertical.size}
              options={BAR_OPTIONS}
              onChange={(v) => upd({ vertical: { ...m.vertical, size: v } })}
            />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput
              value={m.vertical.spacing}
              min={4}
              onChange={(v) => upd({ vertical: { ...m.vertical, spacing: num(v, 16) } })}
            />
          </Field>
          <Field label="Layout">
            <Select
              value={m.vertical.layout}
              options={[
                { value: "center", label: "Centred" },
                { value: "offset", label: "Offset (depth d)" },
                { value: "each-face", label: "Each face" },
              ]}
              onChange={(v) => upd({ vertical: { ...m.vertical, layout: v } })}
            />
          </Field>
          {m.vertical.layout === "offset" ? (
            <Field label="d from interior face (in)">
              <NumberInput
                value={m.vertical.d ?? m.t / 2}
                min={1}
                onChange={(v) => upd({ vertical: { ...m.vertical, d: v } })}
              />
            </Field>
          ) : null}
        </Grid>
        <Grid cols={3}>
          <Field label="Horizontal bar">
            <Select
              value={m.horizontal.size}
              options={BAR_OPTIONS}
              onChange={(v) => upd({ horizontal: { ...m.horizontal, size: v } })}
            />
          </Field>
          <Field label="Bars per course / layer">
            <NumberInput
              value={m.horizontal.count}
              min={1}
              onChange={(v) => upd({ horizontal: { ...m.horizontal, count: Math.max(1, Math.round(num(v, 1))) } })}
            />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput
              value={m.horizontal.spacing}
              min={4}
              onChange={(v) => upd({ horizontal: { ...m.horizontal, spacing: num(v, 16) } })}
            />
          </Field>
        </Grid>
        <Field label="Steel f_y (psi)">
          <NumberInput value={m.fy} min={40000} onChange={(v) => upd({ fy: num(v, 60000) })} />
        </Field>
      </Section>
      <Section title="Loads">
        <Grid cols={4}>
          <Field label="Wind W (psf)">
            <NumberInput value={m.wind.W} min={0} onChange={(v) => upd({ wind: { ...m.wind, W: num(v, 0) } })} />
          </Field>
          <Field label="Parapet wind (psf)">
            <NumberInput value={m.wind.Wp} min={0} onChange={(v) => upd({ wind: { ...m.wind, Wp: num(v, 0) } })} />
          </Field>
          <Field label="Added seismic (psf)">
            <NumberInput
              value={m.seismic.Eadd}
              min={0}
              onChange={(v) => upd({ seismic: { ...m.seismic, Eadd: num(v, 0) } })}
            />
          </Field>
          <Field label="Top load eccentricity (in)">
            <NumberInput value={m.eccentricity} onChange={(v) => upd({ eccentricity: num(v, 0) })} />
          </Field>
        </Grid>
        <Check
          checked={m.seismic.include}
          onChange={(v) => upd({ seismic: { ...m.seismic, include: v } })}
          label="Seismic out-of-plane load (ASCE 7 §12.11.1)"
        />
        <Grid cols={3}>
          <Field label="Retained soil height (ft)">
            <NumberInput
              value={m.soil?.height ?? 0}
              min={0}
              onChange={(v) =>
                upd({ soil: v ? { efp: m.soil?.efp ?? 45, surcharge: m.soil?.surcharge ?? 0, height: v } : undefined })
              }
            />
          </Field>
          <Field label="Equivalent fluid (pcf)">
            <NumberInput
              value={m.soil?.efp ?? 45}
              min={0}
              onChange={(v) => m.soil && upd({ soil: { ...m.soil, efp: num(v, 45) } })}
            />
          </Field>
          <Field label="Surcharge (psf)">
            <NumberInput
              value={m.soil?.surcharge ?? 0}
              min={0}
              onChange={(v) => m.soil && upd({ soil: { ...m.soil, surcharge: num(v, 0) } })}
            />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="In-plane wind V (lb)">
            <NumberInput
              value={m.inPlane?.W ?? 0}
              min={0}
              onChange={(v) => upd({ inPlane: { E: m.inPlane?.E ?? 0, h: m.inPlane?.h, W: num(v, 0) } })}
            />
          </Field>
          <Field label="In-plane seismic V (lb)">
            <NumberInput
              value={m.inPlane?.E ?? 0}
              min={0}
              onChange={(v) => upd({ inPlane: { W: m.inPlane?.W ?? 0, h: m.inPlane?.h, E: num(v, 0) } })}
            />
          </Field>
        </Grid>
        <Hint>Top loads arrive by line links from the walls above (load path) or as entered line loads (plf).</Hint>
        <Collapsible title={`Entered line loads (${m.extra.length})`} open={m.extra.length > 0}>
          <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
        </Collapsible>
      </Section>
    </>
  );
}

function HoldownFootingEditor({ p, m, upd }: { p: Project; m: HoldownFootingSpec; upd: Upd<HoldownFootingSpec> }) {
  const walls = p.members.filter((x) => x.kind === "shearWall");
  return (
    <Section title="Shear-wall / hold-down footing">
      <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
      <Field label="Shear wall on the footing">
        <Select
          value={m.sourceId}
          options={[
            { value: "", label: "— select —" },
            ...walls.map((w) => ({ value: w.id, label: `${w.mark} ${w.description}` })),
          ]}
          onChange={(v) => upd({ sourceId: v })}
        />
      </Field>
      <Grid cols={4}>
        <Field label="Length L_f (ft)">
          <NumberInput value={m.Lf} min={1} onChange={(v) => upd({ Lf: v ?? m.Lf })} />
        </Field>
        <Field label="Width B (ft)">
          <NumberInput value={m.B} min={0.75} onChange={(v) => upd({ B: v ?? m.B })} />
        </Field>
        <Field label="Thickness (in)">
          <NumberInput value={m.h} min={6} onChange={(v) => upd({ h: v ?? m.h })} />
        </Field>
        <Field label="Bottom below grade (in)">
          <NumberInput value={m.depth} min={6} onChange={(v) => upd({ depth: v ?? m.depth })} />
        </Field>
      </Grid>
      <Grid cols={3}>
        <Field label="Longitudinal bar">
          <Select
            value={m.longitudinal?.size ?? "plain"}
            options={[{ value: "plain", label: "None (plain)" }, ...BAR_OPTIONS.map((b) => ({ value: b, label: b }))]}
            onChange={(v) =>
              upd({
                longitudinal:
                  v === "plain"
                    ? undefined
                    : { top: m.longitudinal?.top ?? 2, bottom: m.longitudinal?.bottom ?? 2, size: v },
              })
            }
          />
        </Field>
        <Field label="Top bars">
          <NumberInput
            value={m.longitudinal?.top ?? 0}
            min={0}
            onChange={(v) => m.longitudinal && upd({ longitudinal: { ...m.longitudinal, top: Math.round(v ?? 0) } })}
          />
        </Field>
        <Field label="Bottom bars">
          <NumberInput
            value={m.longitudinal?.bottom ?? 0}
            min={0}
            onChange={(v) => m.longitudinal && upd({ longitudinal: { ...m.longitudinal, bottom: Math.round(v ?? 0) } })}
          />
        </Field>
      </Grid>
      <Field
        label="Allowable soil pressure override (psf)"
        hint={`Blank = project value ${p.criteria.soil.bearing} psf`}
      >
        <NumberInput value={m.qaOverride} allowEmpty min={500} onChange={(v) => upd({ qaOverride: v })} />
      </Field>
      <Hint>
        Wall gravity and in-plane forces come from the shear-wall result; other walls on the footing enter as line
        loads.
      </Hint>
      <Collapsible title={`Entered line loads (${m.extra.length})`} open={m.extra.length > 0}>
        <ExtraLoadsEditor extra={m.extra} onChange={(e) => upd({ extra: e })} />
      </Collapsible>
    </Section>
  );
}

function TieInEditor({ p, m, upd }: { p: Project; m: TieInSpec; upd: Upd<TieInSpec> }) {
  const pr = m.product;
  return (
    <>
      <Section title="Tie-in to existing concrete">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Field label="Joint">
          <TextInput value={m.joint} onChange={(v) => upd({ joint: v })} />
        </Field>
        <Grid cols={4}>
          <Field label="Anchor">
            <Select
              value={m.anchor.kind}
              options={[
                { value: "rebar", label: "Reinforcing dowel" },
                { value: "rod", label: "Threaded rod" },
              ]}
              onChange={(v) =>
                upd({
                  anchor:
                    v === "rebar"
                      ? { kind: "rebar", size: "#4", fya: 60000, futa: 90000, steelLabel: "ASTM A615 Grade 60" }
                      : { kind: "rod", size: "0.625", fya: 36000, futa: 58000, steelLabel: "ASTM F1554 Grade 36" },
                })
              }
            />
          </Field>
          <Field label="Size">
            <Select
              value={m.anchor.size}
              options={m.anchor.kind === "rebar" ? BAR_OPTIONS : ["0.5", "0.625", "0.75", "0.875", "1"]}
              onChange={(v) => upd({ anchor: { ...m.anchor, size: v } })}
            />
          </Field>
          <Field label="f_ya (psi)">
            <NumberInput
              value={m.anchor.fya}
              min={30000}
              onChange={(v) => upd({ anchor: { ...m.anchor, fya: v ?? m.anchor.fya } })}
            />
          </Field>
          <Field label="f_uta (psi)">
            <NumberInput
              value={m.anchor.futa}
              min={40000}
              onChange={(v) => upd({ anchor: { ...m.anchor, futa: v ?? m.anchor.futa } })}
            />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Embedment h_ef (in)">
            <NumberInput value={m.hef} min={2} onChange={(v) => upd({ hef: v ?? m.hef })} />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput value={m.spacing} min={2} onChange={(v) => upd({ spacing: v ?? m.spacing })} />
          </Field>
          <Field label="Edge distance c_a1 (in)">
            <NumberInput value={m.ca1} min={1} onChange={(v) => upd({ ca1: v ?? m.ca1 })} />
          </Field>
          <Field label="Member thickness h_a (in)">
            <NumberInput value={m.ha} min={4} onChange={(v) => upd({ ha: v ?? m.ha })} />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Existing f'c (psi)">
            <NumberInput
              value={m.existing.fc}
              min={2000}
              onChange={(v) => upd({ existing: { ...m.existing, fc: v ?? 2500 } })}
            />
          </Field>
          <Field label="Shear direction">
            <Select
              value={m.shearDir}
              options={[
                { value: "toward-edge", label: "Toward the edge" },
                { value: "parallel-edge", label: "Parallel to the edge" },
              ]}
              onChange={(v) => upd({ shearDir: v })}
            />
          </Field>
          <span />
        </Grid>
        <Check
          checked={m.existing.cracked}
          onChange={(v) => upd({ existing: { ...m.existing, cracked: v } })}
          label="Cracked concrete"
        />
        <Check
          checked={m.existing.verified}
          onChange={(v) => upd({ existing: { ...m.existing, verified: v } })}
          label="Existing concrete strength verified (cores / record drawings)"
        />
      </Section>
      <Section title="Adhesive (ICC-ES report values)">
        <Grid cols={2}>
          <Field label="Product">
            <TextInput value={pr.name} onChange={(v) => upd({ product: { ...pr, name: v } })} />
          </Field>
          <Field label="Report">
            <TextInput value={pr.report} onChange={(v) => upd({ product: { ...pr, report: v } })} />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="τ_cr (psi)">
            <NumberInput
              value={pr.tauCr}
              min={50}
              onChange={(v) => upd({ product: { ...pr, tauCr: v ?? pr.tauCr } })}
            />
          </Field>
          <Field label="τ_uncr (psi)">
            <NumberInput
              value={pr.tauUncr}
              min={50}
              onChange={(v) => upd({ product: { ...pr, tauUncr: v ?? pr.tauUncr } })}
            />
          </Field>
          <Field label="φ bond">
            <NumberInput
              value={pr.phiBond}
              min={0.4}
              max={0.75}
              onChange={(v) => upd({ product: { ...pr, phiBond: v ?? pr.phiBond } })}
            />
          </Field>
          <Field label="φ concrete">
            <NumberInput
              value={pr.phiConcrete}
              min={0.4}
              max={0.75}
              onChange={(v) => upd({ product: { ...pr, phiConcrete: v ?? pr.phiConcrete } })}
            />
          </Field>
        </Grid>
        <Check
          checked={pr.verified}
          onChange={(v) => upd({ product: { ...pr, verified: v } })}
          label="Values checked against the current report"
        />
      </Section>
      <Section title="Demand (strength level, per ft of joint)">
        <Grid cols={3}>
          <Field label="Tension N_u (plf)">
            <NumberInput value={m.demand.Nu} min={0} onChange={(v) => upd({ demand: { ...m.demand, Nu: v ?? 0 } })} />
          </Field>
          <Field label="Shear V_u (plf)">
            <NumberInput value={m.demand.Vu} min={0} onChange={(v) => upd({ demand: { ...m.demand, Vu: v ?? 0 } })} />
          </Field>
          <Field label="Source">
            <TextInput value={m.demand.source} onChange={(v) => upd({ demand: { ...m.demand, source: v } })} />
          </Field>
        </Grid>
        <Check
          checked={!!m.shearFriction}
          onChange={(v) => upd({ shearFriction: v ? { Vu: m.demand.Vu, roughened: false, Ac: 12 * m.ha } : undefined })}
          label="Check shear friction across the joint (ACI 318 22.9)"
        />
        {m.shearFriction ? (
          <Grid cols={3}>
            <Field label="V_u along joint (plf)">
              <NumberInput
                value={m.shearFriction.Vu}
                min={0}
                onChange={(v) => upd({ shearFriction: { ...m.shearFriction!, Vu: v ?? 0 } })}
              />
            </Field>
            <Field label="Contact area A_c (in²/ft)">
              <NumberInput
                value={m.shearFriction.Ac}
                min={1}
                onChange={(v) => upd({ shearFriction: { ...m.shearFriction!, Ac: v ?? 12 } })}
              />
            </Field>
            <Check
              checked={m.shearFriction.roughened}
              onChange={(v) => upd({ shearFriction: { ...m.shearFriction!, roughened: v } })}
              label="Roughened to ¼ in. amplitude"
            />
          </Grid>
        ) : null}
      </Section>
    </>
  );
}

function WoodTrussEditor({ p, m, upd }: { p: Project; m: WoodTrussSpec; upd: Upd<WoodTrussSpec> }) {
  const parallel = m.type === "parallel";
  const lumber = (key: "tc" | "bc" | "web", title: string) => (
    <Collapsible title={`${title}: ${m[key].size} ${m[key].species} ${m[key].grade}`} open={false}>
      <SawnFields
        species={m[key].species}
        grade={m[key].grade}
        size={m[key].size}
        sizes={DIMENSION_SIZES}
        onChange={(x) => upd({ [key]: { ...m[key], ...x } } as Partial<WoodTrussSpec>)}
      />
    </Collapsible>
  );
  return (
    <>
      <Section title="Wood truss (designed in HouseCalc)">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={4}>
          <Field label="Configuration">
            <Select
              value={m.type}
              options={[
                { value: "fink", label: "Fink (W)" },
                { value: "howe", label: "Howe" },
                { value: "king", label: "King post" },
                { value: "queen", label: "Queen post" },
                { value: "king-queen", label: "King + queen post" },
                { value: "parallel", label: "Parallel chord" },
              ]}
              onChange={(v) =>
                upd({
                  type: v,
                  ...(v === "parallel"
                    ? { depth: m.depth ?? 2.5, panels: m.panels ?? 8, pattern: m.pattern ?? "warren" }
                    : {}),
                })
              }
            />
          </Field>
          <Field label="Span (ft)">
            <NumberInput value={m.span} min={4} onChange={(v) => upd({ span: v ?? m.span })} />
          </Field>
          {parallel ? (
            <>
              <Field label="Depth (ft)">
                <NumberInput value={m.depth ?? 2.5} min={0.5} onChange={(v) => upd({ depth: v ?? 2.5 })} />
              </Field>
              <Field label="Panels">
                <NumberInput
                  value={m.panels ?? 8}
                  min={2}
                  max={20}
                  step="1"
                  onChange={(v) => upd({ panels: Math.round(v ?? 8) })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Pitch (in/12)">
                <NumberInput value={m.pitch} min={1.5} max={16} onChange={(v) => upd({ pitch: v ?? m.pitch })} />
              </Field>
              <Field label="Overhang (ft)">
                <NumberInput value={m.overhang} min={0} onChange={(v) => upd({ overhang: v ?? 0 })} />
              </Field>
            </>
          )}
        </Grid>
        <Grid cols={4}>
          <Field label="Spacing (in)">
            <NumberInput value={m.spacing} min={12} onChange={(v) => upd({ spacing: v ?? 24 })} />
          </Field>
          <Field label="Heel bearing (in)">
            <NumberInput value={m.bearingLen} min={1.5} onChange={(v) => upd({ bearingLen: v ?? 3.5 })} />
          </Field>
          <Field label="Web bracing">
            <Select
              value={m.webBracing}
              options={[
                { value: "none", label: "None" },
                { value: "midpoint", label: "Continuous lateral brace at mid-length" },
              ]}
              onChange={(v) => upd({ webBracing: v })}
            />
          </Field>
          {parallel ? (
            <Field label="Web pattern">
              <Select
                value={m.pattern ?? "warren"}
                options={[
                  { value: "warren", label: "Warren with verticals" },
                  { value: "pratt", label: "Pratt" },
                ]}
                onChange={(v) => upd({ pattern: v })}
              />
            </Field>
          ) : (
            <span />
          )}
        </Grid>
        {lumber("tc", "Top chord")}
        {lumber("bc", "Bottom chord")}
        {lumber("web", "Webs")}
      </Section>
      <Section title="Loads">
        <DeadField
          p={p}
          value={m.roofDead}
          kinds={["roof"]}
          roof
          label="Roof dead load"
          onChange={(v) => upd({ roofDead: v })}
        />
        <DeadField
          p={p}
          value={m.ceilingDead}
          kinds={["ceiling"]}
          label="Ceiling dead load (bottom chord)"
          onChange={(v) => upd({ ceilingDead: v })}
        />
        <Grid cols={3}>
          <Field label="Attic storage live (psf)">
            <NumberInput value={m.atticLive} min={0} onChange={(v) => upd({ atticLive: v ?? 0 })} />
          </Field>
          <Field label="Net wind uplift (psf, strength)">
            <NumberInput value={m.windUplift} min={0} onChange={(v) => upd({ windUplift: v ?? 0 })} />
          </Field>
          <Field label="Net section A_n / A_g">
            <NumberInput value={m.netSection} min={0.5} max={1} onChange={(v) => upd({ netSection: v ?? 0.85 })} />
          </Field>
        </Grid>
        <Check checked={m.roofLive} onChange={(v) => upd({ roofLive: v })} label="Roof live load (project criteria)" />
        <Check
          checked={m.snow}
          onChange={(v) => upd({ snow: v })}
          label="Snow, balanced and unbalanced (project criteria)"
        />
        <DeflField value={m.deflection} onChange={(v) => upd({ deflection: v as typeof m.deflection })} />
      </Section>
      <Section title="Joints">
        <Field label="Joint type">
          <Select
            value={m.joint.type}
            options={[
              { value: "plate", label: "Metal connector plates (value from the plate manufacturer)" },
              { value: "nailed", label: "Nailed plywood gussets" },
              { value: "bolted", label: "Bolted wood gussets" },
            ]}
            onChange={(v) =>
              upd({
                joint:
                  v === "plate"
                    ? { type: "plate", value: 100, zone: 12, source: "truss plate manufacturer ESR — enter the value" }
                    : v === "nailed"
                      ? { type: "nailed", nail: "8d-common", gusset: 0.5 }
                      : { type: "bolted", D: 0.5, gusset: 1.5 },
              })
            }
          />
        </Field>
        {m.joint.type === "plate" ? (
          <Grid cols={3}>
            <Field label="Plate value (psi per plate)">
              <NumberInput
                value={m.joint.value}
                min={10}
                onChange={(v) =>
                  upd({
                    joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "plate" }>), value: v ?? 100 },
                  })
                }
              />
            </Field>
            <Field label="Joint zone (in)">
              <NumberInput
                value={m.joint.zone}
                min={2}
                onChange={(v) =>
                  upd({ joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "plate" }>), zone: v ?? 12 } })
                }
              />
            </Field>
            <Field label="Source">
              <TextInput
                value={m.joint.source}
                onChange={(v) =>
                  upd({ joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "plate" }>), source: v } })
                }
              />
            </Field>
          </Grid>
        ) : m.joint.type === "nailed" ? (
          <Grid cols={2}>
            <Field label="Nail">
              <Select
                value={m.joint.nail}
                options={NAILS.map((n) => ({ value: n.key, label: n.label }))}
                onChange={(v) =>
                  upd({ joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "nailed" }>), nail: v } })
                }
              />
            </Field>
            <Field label="Gusset thickness (in)">
              <NumberInput
                value={m.joint.gusset}
                min={0.25}
                onChange={(v) =>
                  upd({
                    joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "nailed" }>), gusset: v ?? 0.5 },
                  })
                }
              />
            </Field>
          </Grid>
        ) : (
          <Grid cols={2}>
            <Field label="Bolt diameter (in)">
              <Select
                value={String(m.joint.D)}
                options={["0.5", "0.625", "0.75"]}
                onChange={(v) =>
                  upd({ joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "bolted" }>), D: Number(v) } })
                }
              />
            </Field>
            <Field label="Gusset thickness (in)">
              <NumberInput
                value={m.joint.gusset}
                min={0.75}
                onChange={(v) =>
                  upd({
                    joint: { ...(m.joint as Extract<WoodTrussSpec["joint"], { type: "bolted" }>), gusset: v ?? 1.5 },
                  })
                }
              />
            </Field>
          </Grid>
        )}
      </Section>
    </>
  );
}

function RetainingWallEditor({ p, m, upd }: { p: Project; m: RetainingWallSpec; upd: Upd<RetainingWallSpec> }) {
  const num = (v: number | undefined, d: number) => v ?? d;
  const st = m.stem;
  const f = m.footing;
  const s = m.soil;
  const setStem = (x: Partial<RetainingWallSpec["stem"]>) => upd({ stem: { ...st, ...x } });
  const setFtg = (x: Partial<RetainingWallSpec["footing"]>) => upd({ footing: { ...f, ...x } });
  const setSoil = (x: Partial<RetainingWallSpec["soil"]>) => upd({ soil: { ...s, ...x } });
  return (
    <>
      <Section title="Cantilever retaining wall">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={4}>
          <Field label="Retained height H_r (ft)">
            <NumberInput value={m.Hr} min={0.5} onChange={(v) => upd({ Hr: num(v, 4) })} />
          </Field>
          <Field label="Stem height (ft)">
            <NumberInput value={st.height} min={0.5} onChange={(v) => setStem({ height: num(v, m.Hr) })} />
          </Field>
          <Field label="Stem thickness (in)">
            <NumberInput value={st.t} min={6} onChange={(v) => setStem({ t: num(v, 8) })} />
          </Field>
          <Field label="Stem material">
            <Select
              value={st.material}
              options={[
                { value: "concrete", label: "Concrete" },
                { value: "cmu", label: "CMU, fully grouted" },
              ]}
              onChange={(v) =>
                setStem(
                  v === "cmu"
                    ? {
                        material: "cmu",
                        t: 7.625,
                        concrete: undefined,
                        cmu: {
                          fm: 2000,
                          fmSource: "TMS 602 unit strength method — confirm with the specification",
                          mortar: "S",
                          block: {
                            hb: 7.625,
                            lb: 15.625,
                            tf: 1.25,
                            tw: 1.0,
                            te: 1.25,
                            nWeb: 1,
                            nEnd: 2,
                            gammaBlock: 115,
                            gammaGrout: 140,
                          },
                          FbFactor: 0.45,
                          shearDeformation: true,
                        },
                      }
                    : {
                        material: "concrete",
                        cmu: undefined,
                        concrete: { fc: p.criteria.concrete.fc, gamma: 150, cover: 2 },
                      },
                )
              }
            />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Vertical bar">
            <Select
              value={st.vertical.size}
              options={BAR_OPTIONS}
              onChange={(v) => setStem({ vertical: { ...st.vertical, size: v } })}
            />
          </Field>
          <Field label="Spacing (in)">
            <NumberInput
              value={st.vertical.spacing}
              min={4}
              onChange={(v) => setStem({ vertical: { ...st.vertical, spacing: num(v, 16) } })}
            />
          </Field>
          <Field label="Depth d to the bars (in)">
            <NumberInput
              value={st.vertical.d ?? st.t / 2}
              min={1}
              onChange={(v) => setStem({ vertical: { ...st.vertical, layout: "offset", d: v } })}
            />
          </Field>
          <Field label="Horizontal bar / spacing (in)">
            <NumberInput
              value={st.horizontal.spacing}
              min={4}
              onChange={(v) => setStem({ horizontal: { ...st.horizontal, spacing: num(v, 16) } })}
            />
          </Field>
        </Grid>
        <Hint>Bars at depth d from the exposed (front) face, on the soil side (tension face).</Hint>
      </Section>
      <Section title="Footing">
        <Grid cols={4}>
          <Field label="Toe (ft)">
            <NumberInput value={f.toe} min={0} onChange={(v) => setFtg({ toe: num(v, 1) })} />
          </Field>
          <Field label="Heel (ft)">
            <NumberInput value={f.heel} min={0.5} onChange={(v) => setFtg({ heel: num(v, 2) })} />
          </Field>
          <Field label="Thickness (in)">
            <NumberInput value={f.h} min={8} onChange={(v) => setFtg({ h: num(v, 12) })} />
          </Field>
          <Field label="Longitudinal bars (no.)">
            <NumberInput
              value={f.longitudinal.count}
              min={2}
              onChange={(v) =>
                setFtg({ longitudinal: { ...f.longitudinal, count: Math.max(2, Math.round(num(v, 4))) } })
              }
            />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Bottom bar">
            <Select
              value={f.bottom.size}
              options={BAR_OPTIONS}
              onChange={(v) => setFtg({ bottom: { ...f.bottom, size: v } })}
            />
          </Field>
          <Field label="Bottom spacing (in)">
            <NumberInput
              value={f.bottom.spacing}
              min={4}
              onChange={(v) => setFtg({ bottom: { ...f.bottom, spacing: num(v, 12) } })}
            />
          </Field>
          <Field label="Top bar">
            <Select value={f.top.size} options={BAR_OPTIONS} onChange={(v) => setFtg({ top: { ...f.top, size: v } })} />
          </Field>
          <Field label="Top spacing (in)">
            <NumberInput
              value={f.top.spacing}
              min={4}
              onChange={(v) => setFtg({ top: { ...f.top, spacing: num(v, 12) } })}
            />
          </Field>
        </Grid>
      </Section>
      <Section title="Soil">
        <Grid cols={4}>
          <Field label="Equivalent fluid (pcf)">
            <NumberInput value={s.efp} min={20} onChange={(v) => setSoil({ efp: num(v, 35) })} />
          </Field>
          <Field label="Surcharge q (psf)">
            <NumberInput value={s.surcharge} min={0} onChange={(v) => setSoil({ surcharge: num(v, 0) })} />
          </Field>
          <Field label="Soil over the toe (ft)">
            <NumberInput value={s.toeCover} min={0} onChange={(v) => setSoil({ toeCover: num(v, 0) })} />
          </Field>
          <Field label="Passive ignored, top (ft)">
            <NumberInput value={s.neglectPassive} min={0} onChange={(v) => setSoil({ neglectPassive: num(v, 1) })} />
          </Field>
        </Grid>
        <Field label="Earth-pressure basis">
          <TextInput value={s.efpSource} onChange={(v) => setSoil({ efpSource: v })} />
        </Field>
        <Grid cols={4}>
          <Field label="Seismic increment k (pcf)">
            <NumberInput
              value={s.seismic?.k ?? 0}
              min={0}
              onChange={(v) => setSoil({ seismic: v ? { shape: s.seismic?.shape ?? "inverted", k: v } : undefined })}
            />
          </Field>
          <Field label="Seismic shape">
            <Select
              value={s.seismic?.shape ?? "inverted"}
              options={[
                { value: "inverted", label: "Inverted triangle" },
                { value: "uniform", label: "Uniform" },
              ]}
              onChange={(v) => setSoil({ seismic: { shape: v, k: s.seismic?.k ?? 0 } })}
            />
          </Field>
          <Field label="q_a override (psf)">
            <NumberInput value={s.qaOverride} min={500} onChange={(v) => setSoil({ qaOverride: v || undefined })} />
          </Field>
        </Grid>
        <Check
          checked={s.countToeSoil}
          onChange={(v) => setSoil({ countToeSoil: v })}
          label="Count the soil over the toe as resisting sliding and overturning"
        />
        <Hint>
          Unit weight, bearing, friction and lateral bearing come from the foundation criteria (soil class, IBC Table
          1806.2). Enter the geotechnical values where a soils report exists.
        </Hint>
      </Section>
    </>
  );
}

function GuardPostEditor({ p, m, upd }: { p: Project; m: GuardPostSpec; upd: Upd<GuardPostSpec> }) {
  const num = (v: number | undefined, d: number) => v ?? d;
  return (
    <>
      <Section title="Deck guard post">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <SawnFields
          species={m.post.species}
          grade={m.post.grade}
          size={m.post.size}
          sizes={SAWN_SIZES}
          onChange={(x) => upd({ post: { ...m.post, ...x } })}
        />
        <Grid cols={4}>
          <Field label="Guard height (in)">
            <NumberInput value={m.guardHeight} min={30} onChange={(v) => upd({ guardHeight: num(v, 36) })} />
          </Field>
          <Field label="Deck to top bolt (in)">
            <NumberInput value={m.topBolt} min={0} onChange={(v) => upd({ topBolt: num(v, 2) })} />
          </Field>
          <Field label="Bolt spacing s (in)">
            <NumberInput value={m.s} min={2} onChange={(v) => upd({ s: num(v, 6) })} />
          </Field>
          <Field label="Plate washer (in sq.)">
            <NumberInput value={m.washer} min={1} onChange={(v) => upd({ washer: num(v, 2) })} />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Concentrated load P (lb)">
            <NumberInput value={m.P} min={0} onChange={(v) => upd({ P: num(v, 200) })} />
          </Field>
          <Field label="Rail load (plf)">
            <NumberInput value={m.rail.w} min={0} onChange={(v) => upd({ rail: { ...m.rail, w: num(v, 0) } })} />
          </Field>
          <Field label="Post spacing (ft)">
            <NumberInput
              value={m.rail.spacing}
              min={0}
              onChange={(v) => upd({ rail: { ...m.rail, spacing: num(v, 0) } })}
            />
          </Field>
          <Field label="Bolt diameter (in)">
            <NumberInput value={m.bolt.d} min={0.375} onChange={(v) => upd({ bolt: { ...m.bolt, d: num(v, 0.5) } })} />
          </Field>
        </Grid>
        <Grid cols={2}>
          <Check checked={m.wetService} onChange={(v) => upd({ wetService: v })} label="Wet service" />
          <Check checked={m.incised} onChange={(v) => upd({ incised: v })} label="Preservative treated, incised" />
          <Check
            checked={!!m.wideFaceToRim}
            onChange={(v) => upd({ wideFaceToRim: v })}
            label="Wide face against the rim (weak-axis bending)"
          />
        </Grid>
      </Section>
      <Section title="Tension device at the top bolt">
        <Grid cols={2}>
          <Field label="Model">
            <TextInput value={m.device.model} onChange={(v) => upd({ device: { ...m.device, model: v } })} />
          </Field>
          <Field label="Allowable tension (lb)">
            <NumberInput
              value={m.device.capacity}
              min={1}
              onChange={(v) => upd({ device: { ...m.device, capacity: num(v, 1500) } })}
            />
          </Field>
        </Grid>
        <Field label="Source (catalogue / ESR)">
          <TextInput value={m.device.source} onChange={(v) => upd({ device: { ...m.device, source: v } })} />
        </Field>
        <Check
          checked={m.device.verified}
          onChange={(v) => upd({ device: { ...m.device, verified: v } })}
          label="Value checked against the current catalogue"
        />
      </Section>
    </>
  );
}

function CfsWallEditor({ p, m, upd }: { p: Project; m: CfsWallSpec; upd: Upd<CfsWallSpec> }) {
  const num = (v: number | undefined, d: number) => v ?? d;
  const t = m.table;
  return (
    <>
      <Section title="Cold-formed steel studs">
        <CommonFields p={p} m={m} upd={upd as Upd<MemberSpec>} />
        <Grid cols={4}>
          <Field label="SSMA designation">
            <TextInput value={m.designation} onChange={(v) => upd({ designation: v.toUpperCase() })} />
          </Field>
          <Field label="F_y (psi)">
            <Select value={String(m.Fy)} options={["33000", "50000"]} onChange={(v) => upd({ Fy: Number(v) })} />
          </Field>
          <Field label="Lip (in)">
            <NumberInput value={m.lip} min={0.1} onChange={(v) => upd({ lip: num(v, 0.5) })} />
          </Field>
          <Field label="I_x from table (in⁴)">
            <NumberInput value={m.IxTable} allowEmpty min={0.01} onChange={(v) => upd({ IxTable: v })} />
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Height (ft)">
            <NumberInput value={m.height} min={1} onChange={(v) => upd({ height: num(v, 9) })} />
          </Field>
          <Field label="Spacing (in)">
            <Select
              value={String(m.spacing)}
              options={["12", "16", "19.2", "24"]}
              onChange={(v) => upd({ spacing: Number(v) })}
            />
          </Field>
          <Field label="Wind W, C&C (psf)">
            <NumberInput value={m.W} min={0} onChange={(v) => upd({ W: num(v, 0) })} />
          </Field>
          <Field label="Deflection limit H /">
            <Select
              value={String(m.deflLimit)}
              options={["240", "360", "600", "720"]}
              onChange={(v) => upd({ deflLimit: Number(v) })}
            />
          </Field>
        </Grid>
      </Section>
      <Section title="Allowable strengths from the stud load table (ASD)">
        <Grid cols={4}>
          <Field label="P_a (lb)">
            <NumberInput value={t.Pa} min={1} onChange={(v) => upd({ table: { ...t, Pa: num(v, 1000) } })} />
          </Field>
          <Field label="M_a (lb-in)">
            <NumberInput value={t.Ma} min={1} onChange={(v) => upd({ table: { ...t, Ma: num(v, 1000) } })} />
          </Field>
          <Field label="V_a (lb)">
            <NumberInput value={t.Va} allowEmpty min={1} onChange={(v) => upd({ table: { ...t, Va: v } })} />
          </Field>
          <Field label="Web crippling (lb)">
            <NumberInput value={t.Pwc} allowEmpty min={1} onChange={(v) => upd({ table: { ...t, Pwc: v } })} />
          </Field>
        </Grid>
        <Field label="Table source">
          <TextInput value={t.source} onChange={(v) => upd({ table: { ...t, source: v } })} />
        </Field>
        <Check
          checked={t.verified}
          onChange={(v) => upd({ table: { ...t, verified: v } })}
          label="Values checked against the current table"
        />
      </Section>
    </>
  );
}
