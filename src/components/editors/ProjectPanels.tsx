/** Sidebar panels: project, criteria, dead-load assemblies, levels, and the member navigator. */

import { CYCLE_LIST } from "@/engine/core/codes";
import { fmt } from "@/engine/core/fmt";
import { DEAD_COMPONENTS, assemblySum } from "@/engine/loads/dead";
import { CE_TABLE } from "@/engine/loads/snow";
import {
  NEW_MEMBER_LABEL,
  newId,
  type MemberSpec,
  type NewMemberKind,
  type Project,
  type ProjectDesign,
} from "@/engine/project";
import { useState } from "react";
import {
  AddButton,
  Badge,
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

type SetProject = (fn: (p: Project) => Project) => void;

export function ProjectInfoPanel({ p, set }: { p: Project; set: SetProject }) {
  const info = (k: keyof Project["info"], v: string) => set((x) => ({ ...x, info: { ...x.info, [k]: v } }));
  return (
    <Section title="Project">
      <Field label="Project name">
        <TextInput value={p.info.name} onChange={(v) => info("name", v)} />
      </Field>
      <Field label="Address">
        <TextInput value={p.info.address} onChange={(v) => info("address", v)} />
      </Field>
      <Field label="Code cycle" hint="Stamped on every sheet; drives NDS, ASCE 7 and IBC / IRC editions">
        <Select
          value={p.cycleId}
          options={CYCLE_LIST.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(v) => set((x) => ({ ...x, cycleId: v }))}
        />
      </Field>
      <Grid>
        <Field label="Job Ref.">
          <TextInput value={p.info.jobRef} onChange={(v) => info("jobRef", v)} />
        </Field>
        <Field label="Revision">
          <TextInput value={p.info.revision} onChange={(v) => info("revision", v)} />
        </Field>
      </Grid>
      <Grid>
        <Field label="Client">
          <TextInput value={p.info.client} onChange={(v) => info("client", v)} />
        </Field>
        <Field label="Jurisdiction">
          <TextInput value={p.info.jurisdiction} onChange={(v) => info("jurisdiction", v)} />
        </Field>
      </Grid>
      <Grid>
        <Field label="Prepared by">
          <TextInput value={p.info.preparedBy} onChange={(v) => info("preparedBy", v)} />
        </Field>
        <Field label="Checked by">
          <TextInput value={p.info.checkedBy} onChange={(v) => info("checkedBy", v)} />
        </Field>
      </Grid>
      <Field label="Date">
        <TextInput type="date" value={p.info.date} onChange={(v) => info("date", v)} />
      </Field>
    </Section>
  );
}

export function CriteriaPanel({ p, set }: { p: Project; set: SetProject }) {
  const c = p.criteria;
  const crit = (patch: Partial<Project["criteria"]>) => set((x) => ({ ...x, criteria: { ...x.criteria, ...patch } }));
  return (
    <Collapsible title="Design criteria">
      <Grid>
        <Field label="Risk Category">
          <Select
            value={c.riskCategory}
            options={["I", "II", "III", "IV"] as const}
            onChange={(v) => crit({ riskCategory: v })}
          />
        </Field>
        <Field label="Live load basis">
          <Select
            value={c.liveBasis}
            options={[
              { value: "IRC", label: "IRC / CRC R301.5" },
              { value: "IBC", label: "IBC / CBC 1607.1" },
            ]}
            onChange={(v) => crit({ liveBasis: v })}
          />
        </Field>
      </Grid>
      <Grid>
        <Field label="Roof live L0 (psf)">
          <NumberInput
            value={c.roofLive.L0}
            min={0}
            onChange={(v) => crit({ roofLive: { ...c.roofLive, L0: v ?? 20 } })}
          />
        </Field>
        <Field label="Default K_cr">
          <NumberInput value={c.Kcr} min={0.5} onChange={(v) => crit({ Kcr: v ?? 1 })} />
        </Field>
      </Grid>
      <Check
        checked={c.roofLive.reduce}
        onChange={(v) => crit({ roofLive: { ...c.roofLive, reduce: v } })}
        label="Reduce roof live load (ASCE 7 §4.8.2)"
      />
      <div className="text-xs font-semibold text-muted-foreground">Snow</div>
      <Grid cols={3}>
        <Field label="p_g (psf)">
          <NumberInput value={c.snow.pg} min={0} onChange={(v) => crit({ snow: { ...c.snow, pg: v ?? 0 } })} />
        </Field>
        <Field label="C_e">
          <NumberInput value={c.snow.Ce} min={0.7} onChange={(v) => crit({ snow: { ...c.snow, Ce: v ?? 1 } })} />
        </Field>
        <Field label="C_t">
          <NumberInput value={c.snow.Ct} min={0.85} onChange={(v) => crit({ snow: { ...c.snow, Ct: v ?? 1 } })} />
        </Field>
      </Grid>
      <Grid>
        <Field label="I_s (ASCE 7-16 only)">
          <NumberInput value={c.snow.Is} min={0.8} onChange={(v) => crit({ snow: { ...c.snow, Is: v ?? 1 } })} />
        </Field>
        <div className="pt-6">
          <Check
            checked={c.snow.slippery}
            onChange={(v) => crit({ snow: { ...c.snow, slippery: v } })}
            label="Slippery roof surface"
          />
        </div>
      </Grid>
      <Hint>
        C_e (Table 7.3-1): Exposure B {CE_TABLE.B.fully} / {CE_TABLE.B.partially} / {CE_TABLE.B.sheltered}; C{" "}
        {CE_TABLE.C.fully} / {CE_TABLE.C.partially} / {CE_TABLE.C.sheltered} (fully / partially / sheltered).
      </Hint>
      <div className="text-xs font-semibold text-muted-foreground">
        Wind and seismic (recorded; lateral design in Phase 2)
      </div>
      <Grid cols={3}>
        <Field label="V (mph)">
          <NumberInput value={c.wind.V} min={85} onChange={(v) => crit({ wind: { ...c.wind, V: v ?? 95 } })} />
        </Field>
        <Field label="Exposure">
          <Select
            value={c.wind.exposure}
            options={["B", "C", "D"] as const}
            onChange={(v) => crit({ wind: { ...c.wind, exposure: v } })}
          />
        </Field>
        <Field label="K_zt">
          <NumberInput value={c.wind.Kzt} min={1} onChange={(v) => crit({ wind: { ...c.wind, Kzt: v ?? 1 } })} />
        </Field>
      </Grid>
      <Grid cols={4}>
        <Field label="S_DS">
          <NumberInput
            value={c.seismic.SDS}
            min={0}
            onChange={(v) => crit({ seismic: { ...c.seismic, SDS: v ?? 1 } })}
          />
        </Field>
        <Field label="S_D1">
          <NumberInput
            value={c.seismic.SD1}
            min={0}
            onChange={(v) => crit({ seismic: { ...c.seismic, SD1: v ?? 0.6 } })}
          />
        </Field>
        <Field label="Site">
          <TextInput value={c.seismic.siteClass} onChange={(v) => crit({ seismic: { ...c.seismic, siteClass: v } })} />
        </Field>
        <Field label="SDC">
          <TextInput value={c.seismic.SDC} onChange={(v) => crit({ seismic: { ...c.seismic, SDC: v } })} />
        </Field>
      </Grid>
      <Grid>
        <Field label="Soil bearing (psf)">
          <NumberInput
            value={c.soil.bearing}
            min={500}
            onChange={(v) => crit({ soil: { ...c.soil, bearing: v ?? 1500 } })}
          />
        </Field>
        <Field label="Soil source">
          <TextInput value={c.soil.source} onChange={(v) => crit({ soil: { ...c.soil, source: v } })} />
        </Field>
      </Grid>
    </Collapsible>
  );
}

export function AssembliesPanel({ p, set }: { p: Project; set: SetProject }) {
  const [open, setOpen] = useState<string | undefined>();
  const upd = (id: string, fn: (a: Project["assemblies"][number]) => Project["assemblies"][number]) =>
    set((x) => ({ ...x, assemblies: x.assemblies.map((a) => (a.id === id ? fn(a) : a)) }));
  return (
    <Collapsible title={`Dead-load assemblies (${p.assemblies.length})`}>
      {p.assemblies.map((a) => {
        const sum = assemblySum(a);
        const low = a.designValue !== undefined && a.designValue < sum;
        return (
          <div key={a.id} className="rounded-md border border-border p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm"
              onClick={() => setOpen(open === a.id ? undefined : a.id)}
            >
              <span className="truncate">
                <b>{a.id}</b> {a.name}
              </span>
              <span className={`ml-2 text-xs ${low ? "text-destructive" : "text-muted-foreground"}`}>
                {fmt(a.designValue ?? sum, 1)} psf
              </span>
            </button>
            {open === a.id ? (
              <div className="mt-2 space-y-2">
                <Field label="Name">
                  <TextInput value={a.name} onChange={(v) => upd(a.id, (x) => ({ ...x, name: v }))} />
                </Field>
                {a.components.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`flex-1 truncate text-xs ${c.overridden || c.source === "typical" ? "text-destructive" : ""}`}
                      title={c.name}
                    >
                      {c.name}
                    </span>
                    <div className="w-20">
                      <NumberInput
                        value={c.psf}
                        min={0}
                        onChange={(v) =>
                          upd(a.id, (x) => ({
                            ...x,
                            components: x.components.map((k, j) =>
                              j === i
                                ? {
                                    ...k,
                                    psf: v ?? 0,
                                    overridden:
                                      k.source !== "user" && v !== DEAD_COMPONENTS.find((d) => d.key === k.key)?.psf,
                                  }
                                : k,
                            ),
                          }))
                        }
                      />
                    </div>
                    <SmallButton
                      tone="danger"
                      title="Remove"
                      onClick={() => upd(a.id, (x) => ({ ...x, components: x.components.filter((_, j) => j !== i) }))}
                    >
                      ✕
                    </SmallButton>
                  </div>
                ))}
                <Field label="Add component">
                  <select
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const d = DEAD_COMPONENTS.find((x) => x.key === e.target.value);
                      if (d)
                        upd(a.id, (x) => ({
                          ...x,
                          components: [...x.components, { key: d.key, name: d.name, psf: d.psf, source: d.source }],
                        }));
                    }}
                  >
                    <option value="">— select from ASCE 7 Table C3.1-1a list —</option>
                    {DEAD_COMPONENTS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.group}: {d.name} ({d.psf} psf{d.source === "typical" ? ", typical" : ""})
                      </option>
                    ))}
                  </select>
                </Field>
                <Grid>
                  <Field label="Itemised sum (psf)">
                    <div className="px-1 py-2 text-sm font-semibold">{fmt(sum, 2)}</div>
                  </Field>
                  <Field
                    label="Design value (psf)"
                    error={low ? "Below the itemised sum" : undefined}
                    hint="Blank = itemised sum"
                  >
                    <NumberInput
                      value={a.designValue}
                      allowEmpty
                      min={0}
                      onChange={(v) => upd(a.id, (x) => ({ ...x, designValue: v }))}
                    />
                  </Field>
                </Grid>
              </div>
            ) : null}
          </div>
        );
      })}
      <AddButton
        onClick={() =>
          set((x) => ({
            ...x,
            assemblies: [
              ...x.assemblies,
              {
                id: `A${x.assemblies.length + 1}`,
                name: "New assembly",
                kind: "floor",
                basis: "horizontal",
                components: [],
              },
            ],
          }))
        }
      >
        + Add assembly
      </AddButton>
    </Collapsible>
  );
}

export function LevelsPanel({ p, set }: { p: Project; set: SetProject }) {
  return (
    <Collapsible title="Structures and levels">
      {p.structures.map((s) => (
        <div key={s.id} className="space-y-2 rounded-md border border-border p-2">
          <TextInput
            value={s.name}
            onChange={(v) =>
              set((x) => ({ ...x, structures: x.structures.map((y) => (y.id === s.id ? { ...y, name: v } : y)) }))
            }
          />
          {s.levels.map((l) => (
            <Grid key={l.id}>
              <TextInput
                value={l.name}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    structures: x.structures.map((y) =>
                      y.id === s.id
                        ? { ...y, levels: y.levels.map((z) => (z.id === l.id ? { ...z, name: v } : z)) }
                        : y,
                    ),
                  }))
                }
              />
              <NumberInput
                value={l.number}
                min={0}
                step="1"
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    structures: x.structures.map((y) =>
                      y.id === s.id
                        ? {
                            ...y,
                            levels: y.levels.map((z) => (z.id === l.id ? { ...z, number: Math.round(v ?? 1) } : z)),
                          }
                        : y,
                    ),
                  }))
                }
              />
            </Grid>
          ))}
          <AddButton
            onClick={() =>
              set((x) => ({
                ...x,
                structures: x.structures.map((y) =>
                  y.id === s.id
                    ? {
                        ...y,
                        levels: [
                          ...y.levels,
                          { id: newId("L"), name: `Level ${y.levels.length + 1}`, number: y.levels.length + 1 },
                        ],
                      }
                    : y,
                ),
              }))
            }
          >
            + Add level
          </AddButton>
        </div>
      ))}
      <AddButton
        onClick={() =>
          set((x) => ({
            ...x,
            structures: [
              ...x.structures,
              { id: newId("S"), name: "Detached structure", levels: [{ id: newId("L"), name: "Roof", number: 1 }] },
            ],
          }))
        }
      >
        + Add structure (ADU, garage …)
      </AddButton>
      <Hint>Level number feeds the mark templates ({"{L}"}); sheets are ordered from the highest level down.</Hint>
    </Collapsible>
  );
}

export function MembersPanel({
  p,
  design,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
}: {
  p: Project;
  design: ProjectDesign;
  activeId?: string;
  onSelect: (id: string) => void;
  onAdd: (kind: NewMemberKind, structureId: string, levelId: string) => void;
  onDuplicate: (m: MemberSpec) => void;
  onRemove: (id: string) => void;
}) {
  const [kind, setKind] = useState<NewMemberKind>("joist");
  const levels = p.structures.flatMap((s) => s.levels.map((l) => ({ s, l })));
  const [lvl, setLvl] = useState(`${levels[0]?.s.id}|${levels[0]?.l.id}`);
  return (
    <Section title={`Members (${p.members.length})`}>
      {levels.map(({ s, l }) => {
        const list = p.members.filter((m) => m.structureId === s.id && m.levelId === l.id);
        if (!list.length) return null;
        return (
          <div key={`${s.id}-${l.id}`} className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {p.structures.length > 1 ? `${s.name} — ` : ""}
              {l.name}
            </div>
            <ul className="space-y-1">
              {list.map((m) => {
                const o = design.outcomes.get(m.id);
                const state = o?.error ? "ERR" : o?.result?.pass ? "PASS" : "FAIL";
                return (
                  <li key={m.id}>
                    <div
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${m.id === activeId ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <button
                        type="button"
                        className="flex-1 truncate text-left"
                        onClick={() => onSelect(m.id)}
                        title={o?.error ?? o?.result?.callout}
                      >
                        <b>{m.mark}</b> <span className="text-muted-foreground">{o?.result?.callout ?? m.kind}</span>
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {o?.result ? fmt(o.result.governing.ratio, 2) : ""}
                      </span>
                      <Badge state={state} />
                      <SmallButton title="Duplicate" onClick={() => onDuplicate(m)}>
                        ⧉
                      </SmallButton>
                      <SmallButton title="Remove" tone="danger" onClick={() => onRemove(m.id)}>
                        ✕
                      </SmallButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {p.members.length === 0 ? <Hint>No members yet — add one below or load the example house.</Hint> : null}
      <Grid>
        <Select
          value={kind}
          options={(Object.keys(NEW_MEMBER_LABEL) as NewMemberKind[]).map((k) => ({
            value: k,
            label: NEW_MEMBER_LABEL[k],
          }))}
          onChange={setKind}
        />
        <Select
          value={lvl}
          options={levels.map(({ s, l }) => ({
            value: `${s.id}|${l.id}`,
            label: `${p.structures.length > 1 ? `${s.name} — ` : ""}${l.name}`,
          }))}
          onChange={setLvl}
        />
      </Grid>
      <AddButton
        onClick={() => {
          const [sid, lid] = lvl.split("|");
          onAdd(kind, sid, lid);
        }}
      >
        + Add member
      </AddButton>
    </Section>
  );
}
