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
import { supportCount, type BeamSpec, type LinkedLoad, type MemberSpec, type Project } from "@/engine/project";
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
  const sources = p.members.filter((x) => x.id !== m.id);
  const set = (i: number, patch: Partial<LinkedLoad>) =>
    onChange(m.links.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {m.links.map((l, i) => {
        const src = sources.find((s) => s.id === l.sourceId);
        const n = src ? supportCount(src) : 2;
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
                  options={Array.from({ length: n }, (_, k) => ({
                    value: String(k),
                    label: src?.kind === "rafter" ? (k === 0 ? "Plate" : "Ridge") : String.fromCharCode(65 + k),
                  }))}
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
  const setArea = (i: number, patch: Partial<BeamSpec["area"][number]>) =>
    upd({ area: m.area.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const setWall = (i: number, patch: Partial<BeamSpec["walls"][number]>) =>
    upd({ walls: m.walls.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
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
