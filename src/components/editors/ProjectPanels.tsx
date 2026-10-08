/** Sidebar panels: project, criteria, dead-load assemblies, levels, and the member navigator. */

import { CYCLE_LIST } from "@/engine/core/codes";
import { fmt } from "@/engine/core/fmt";
import { DEAD_COMPONENTS, assemblySum } from "@/engine/loads/dead";
import { CE_TABLE } from "@/engine/loads/snow";
import { SOIL_CLASSES, soilClass } from "@/engine/data/soil";
import { HARDWARE_KIND_LABEL, defaultHardware, type HardwareKind } from "@/engine/data/hardware";
import { SEISMIC_SYSTEMS } from "@/engine/loads/seismic";
import { defaultLateral, generateWeights, type LateralSpec } from "@/engine/project";
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
        Wind and seismic (lateral analysis in the Lateral panel)
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
      <Grid cols={3}>
        <Field label="Soil class (IBC 1806.2)">
          <Select
            value={c.soil.class ?? ""}
            options={[
              { value: "", label: "—" },
              ...SOIL_CLASSES.map((x) => ({ value: x.id, label: `${x.id} — ${x.bearing} psf` })),
            ]}
            onChange={(v) =>
              crit({
                soil: v
                  ? {
                      ...c.soil,
                      class: v as "1",
                      bearing: soilClass(v).bearing,
                      source: `Presumptive, CBC Table 1806.2, Class ${v} — verify soil class in the field`,
                    }
                  : { ...c.soil, class: undefined },
              })
            }
          />
        </Field>
        <Field label="Soil weight (pcf)">
          <NumberInput
            value={c.soil.density}
            min={80}
            onChange={(v) => crit({ soil: { ...c.soil, density: v ?? 110 } })}
          />
        </Field>
        <Field label="Frost depth (in)">
          <NumberInput
            value={c.soil.frostDepth}
            allowEmpty
            min={0}
            onChange={(v) => crit({ soil: { ...c.soil, frostDepth: v } })}
          />
        </Field>
      </Grid>
      <Grid cols={3}>
        <Field label="Concrete f'c (psi)">
          <NumberInput
            value={c.concrete.fc}
            min={2500}
            onChange={(v) => crit({ concrete: { ...c.concrete, fc: v ?? 2500 } })}
          />
        </Field>
        <Field label="Rebar f_y (psi)">
          <NumberInput
            value={c.concrete.fy}
            min={40000}
            onChange={(v) => crit({ concrete: { ...c.concrete, fy: v ?? 60000 } })}
          />
        </Field>
        <Field label="Cover (in)">
          <NumberInput
            value={c.concrete.cover}
            min={1.5}
            onChange={(v) => crit({ concrete: { ...c.concrete, cover: v ?? 3 } })}
          />
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

export function HardwarePanel({ p, set }: { p: Project; set: SetProject }) {
  const upd = (id: string, patch: Partial<Project["hardware"][number]>) =>
    set((x) => ({ ...x, hardware: x.hardware.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  const used = new Set(
    p.members.flatMap((m) =>
      m.kind === "connector" ? [m.hardwareId] : m.kind === "shearWall" && m.holdownId ? [m.holdownId] : [],
    ),
  );
  return (
    <Collapsible
      title={`Hardware list (${p.hardware.length}; ${p.hardware.filter((h) => !h.checked).length} to verify)`}
    >
      <Hint>
        Allowable loads (DF-L / SP) from the manufacturer catalogue. Enter or correct values and tick Checked once
        confirmed against the current catalogue / ICC-ES report; unchecked items print as VERIFY.
      </Hint>
      {p.hardware.map((h) => (
        <div
          key={h.id}
          className={`space-y-2 rounded-md border p-2 text-xs ${used.has(h.id) ? "border-primary/50" : "border-border"}`}
        >
          <div className="flex items-center gap-2">
            <b className="flex-1">
              {h.model} <span className="font-normal text-muted-foreground">{HARDWARE_KIND_LABEL[h.kind]}</span>
            </b>
            <Check checked={h.checked} onChange={(v) => upd(h.id, { checked: v })} label="Checked" />
            {!used.has(h.id) ? (
              <SmallButton
                tone="danger"
                title="Remove"
                onClick={() => set((x) => ({ ...x, hardware: x.hardware.filter((y) => y.id !== h.id) }))}
              >
                ✕
              </SmallButton>
            ) : null}
          </div>
          <Grid>
            <Field label="Fasteners">
              <TextInput value={h.fasteners} onChange={(v) => upd(h.id, { fasteners: v })} />
            </Field>
            <Field label="Report">
              <TextInput value={h.report} onChange={(v) => upd(h.id, { report: v })} />
            </Field>
          </Grid>
          {h.kind === "holdown" || h.kind === "strap" ? (
            <Grid cols={3}>
              <Field label="Tension (lb, 160)">
                <NumberInput value={h.tension} allowEmpty min={0} onChange={(v) => upd(h.id, { tension: v })} />
              </Field>
              <Field label="Deflection (in)">
                <NumberInput value={h.deflection} allowEmpty min={0} onChange={(v) => upd(h.id, { deflection: v })} />
              </Field>
              <Field label="Min. post (in)">
                <NumberInput value={h.minPost} allowEmpty min={0} onChange={(v) => upd(h.id, { minPost: v })} />
              </Field>
            </Grid>
          ) : (
            <Grid cols={4}>
              {(["100", "115", "125", "160"] as const).map((k) => (
                <Field key={k} label={`Down ${k}`}>
                  <NumberInput
                    value={h.down?.[k]}
                    allowEmpty
                    min={0}
                    onChange={(v) => upd(h.id, { down: { ...(h.down ?? {}), [k]: v } })}
                  />
                </Field>
              ))}
              <Field label="Uplift 160">
                <NumberInput value={h.uplift} allowEmpty min={0} onChange={(v) => upd(h.id, { uplift: v })} />
              </Field>
              <Field label="F1">
                <NumberInput value={h.F1} allowEmpty min={0} onChange={(v) => upd(h.id, { F1: v })} />
              </Field>
              <Field label="F2">
                <NumberInput value={h.F2} allowEmpty min={0} onChange={(v) => upd(h.id, { F2: v })} />
              </Field>
            </Grid>
          )}
        </div>
      ))}
      <Grid>
        <AddButton
          onClick={() =>
            set((x) => ({
              ...x,
              hardware: [
                ...x.hardware,
                {
                  id: newId("hw"),
                  model: "NEW",
                  kind: "hanger" as HardwareKind,
                  manufacturer: "Simpson Strong-Tie",
                  description: "New connector",
                  fasteners: "",
                  report: "",
                  checked: false,
                  source: "entered by engineer",
                },
              ],
            }))
          }
        >
          + Add item
        </AddButton>
        <AddButton
          onClick={() => {
            const have = new Set(p.hardware.map((h) => h.id));
            set((x) => ({ ...x, hardware: [...x.hardware, ...defaultHardware().filter((h) => !have.has(h.id))] }));
          }}
        >
          + Restore default items
        </AddButton>
      </Grid>
    </Collapsible>
  );
}

export function LateralPanel({ p, set }: { p: Project; set: SetProject }) {
  const lat: LateralSpec = p.lateral ?? defaultLateral(p);
  const upd = (patch: Partial<LateralSpec>) =>
    set((x) => ({ ...x, lateral: { ...(x.lateral ?? defaultLateral(x)), ...patch } }));
  const setStory = (i: number, patch: Partial<LateralSpec["stories"][number]>) =>
    upd({ stories: lat.stories.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setLine = (i: number, patch: Partial<LateralSpec["lines"][number]>) =>
    upd({ lines: lat.lines.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Collapsible title={`Lateral — seismic, wind, wall lines (${lat.enabled ? "on" : "off"})`}>
      <Check
        checked={lat.enabled}
        onChange={(v) => upd({ enabled: v })}
        label="Run the lateral analysis (shear walls need it)"
      />
      <Field label="Seismic force-resisting system">
        <Select
          value={lat.system}
          options={SEISMIC_SYSTEMS.map((s) => ({ value: s.id, label: `R ${s.R} — ${s.label}` }))}
          onChange={(v) => upd({ system: v })}
        />
      </Field>
      <Grid cols={3}>
        <Field label="ρ (§12.3.4)">
          <Select value={String(lat.rho)} options={["1", "1.3"]} onChange={(v) => upd({ rho: Number(v) })} />
        </Field>
        <Field label="T_L (s)">
          <NumberInput value={lat.TL} min={4} onChange={(v) => upd({ TL: v ?? 8 })} />
        </Field>
        <Field label="S1 (optional)">
          <NumberInput value={lat.S1} allowEmpty min={0} onChange={(v) => upd({ S1: v })} />
        </Field>
      </Grid>
      <Check
        checked={lat.driftLowRise}
        onChange={(v) => upd({ driftLowRise: v })}
        label="Drift limit 0.025 h_sx (≤ 4 stories, systems accommodate drift, Table 12.12-1)"
      />
      <div className="text-xs font-semibold text-muted-foreground">Building geometry</div>
      <Grid cols={3}>
        <Field label="L_x (ft)">
          <NumberInput value={lat.Lx} min={1} onChange={(v) => upd({ Lx: v ?? lat.Lx })} />
        </Field>
        <Field label="L_y (ft)">
          <NumberInput value={lat.Ly} min={1} onChange={(v) => upd({ Ly: v ?? lat.Ly })} />
        </Field>
        <Field label="Ridge along">
          <Select value={lat.ridge} options={["X", "Y"] as const} onChange={(v) => upd({ ridge: v })} />
        </Field>
      </Grid>
      <Grid cols={3}>
        <Field label="Pitch (in 12)">
          <NumberInput value={lat.pitch} min={0} onChange={(v) => upd({ pitch: v ?? 4 })} />
        </Field>
        <Field label="Roof rise (ft)">
          <NumberInput value={lat.roofRise} min={0} onChange={(v) => upd({ roofRise: v ?? 0 })} />
        </Field>
        <Field label="K_e">
          <NumberInput value={lat.Ke} min={0.5} onChange={(v) => upd({ Ke: v ?? 1 })} />
        </Field>
      </Grid>
      <div className="text-xs font-semibold text-muted-foreground">Stories (bottom → top) and seismic weight</div>
      {lat.stories.map((st, i) => (
        <div key={st.id} className="space-y-2 rounded-md border border-border p-2 text-xs">
          <Grid cols={3}>
            <Field label="Name">
              <TextInput value={st.name} onChange={(v) => setStory(i, { name: v })} />
            </Field>
            <Field label="Height (ft)">
              <NumberInput value={st.height} min={1} onChange={(v) => setStory(i, { height: v ?? st.height })} />
            </Field>
            <SmallButton
              title="Regenerate weights from the geometry"
              onClick={() => setStory(i, { items: generateWeights(p, lat, i) })}
            >
              ↻ weights
            </SmallButton>
          </Grid>
          {st.items.map((it, k) => (
            <Grid key={k} cols={4}>
              <TextInput
                value={it.label}
                onChange={(v) => setStory(i, { items: st.items.map((y, j) => (j === k ? { ...y, label: v } : y)) })}
              />
              <NumberInput
                value={it.kind === "lump" ? it.W : it.qty}
                min={0}
                onChange={(v) =>
                  setStory(i, {
                    items: st.items.map((y, j) =>
                      j === k ? (y.kind === "lump" ? { ...y, W: v ?? 0 } : { ...y, qty: v ?? 0 }) : y,
                    ),
                  })
                }
              />
              <span className="self-center text-muted-foreground">
                {it.kind === "area" ? "ft²" : it.kind === "wall" ? `ft × ${it.height ?? 0} ft` : "lb"}{" "}
                {it.assemblyId ?? (it.psf !== undefined ? `${it.psf} psf` : "")}
              </span>
              <SmallButton
                tone="danger"
                title="Remove"
                onClick={() => setStory(i, { items: st.items.filter((_, j) => j !== k) })}
              >
                ✕
              </SmallButton>
            </Grid>
          ))}
          <AddButton
            onClick={() =>
              setStory(i, { items: [...st.items, { label: "Additional weight", kind: "lump", qty: 0, W: 1000 }] })
            }
          >
            + Add weight item
          </AddButton>
        </div>
      ))}
      <Grid>
        <AddButton
          onClick={() =>
            upd({
              stories: [
                ...lat.stories,
                { id: newId("st"), name: `Story ${lat.stories.length + 1}`, height: 9, items: [] },
              ],
            })
          }
        >
          + Add story
        </AddButton>
        {lat.stories.length > 1 ? (
          <AddButton onClick={() => upd({ stories: lat.stories.slice(0, -1) })}>− Remove top story</AddButton>
        ) : (
          <span />
        )}
      </Grid>
      <div className="text-xs font-semibold text-muted-foreground">Diaphragm distribution</div>
      <Grid cols={3}>
        <Field label="Distribution to wall lines">
          <Select
            value={lat.distribution ?? "flexible"}
            options={[
              { value: "flexible", label: "Flexible (tributary)" },
              { value: "rigid", label: "Rigid with torsion" },
              { value: "envelope", label: "Envelope of both" },
            ]}
            onChange={(v) => upd({ distribution: v })}
          />
        </Field>
        <Field label="Centre of mass x (ft)" hint="blank = plan centre">
          <NumberInput
            value={lat.com?.x}
            allowEmpty
            min={0}
            onChange={(v) => upd({ com: v === undefined ? undefined : { x: v, y: lat.com?.y ?? lat.Ly / 2 } })}
          />
        </Field>
        <Field label="Centre of mass y (ft)">
          <NumberInput
            value={lat.com?.y}
            allowEmpty
            min={0}
            onChange={(v) => upd({ com: v === undefined ? undefined : { x: lat.com?.x ?? lat.Lx / 2, y: v } })}
          />
        </Field>
      </Grid>
      <div className="text-xs font-semibold text-muted-foreground">Wall lines</div>
      {lat.lines.map((l, i) => (
        <Grid key={l.id} cols={4}>
          <TextInput value={l.name} onChange={(v) => setLine(i, { name: v })} />
          <div className="flex gap-1">
            <Select
              value={l.storyId}
              options={lat.stories.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => setLine(i, { storyId: v })}
            />
            <Select value={l.dir} options={["X", "Y"] as const} onChange={(v) => setLine(i, { dir: v })} />
          </div>
          <NumberInput value={l.pos} allowEmpty min={0} onChange={(v) => setLine(i, { pos: v })} />
          <div className="flex gap-1">
            <NumberInput value={l.trib} min={0.5} onChange={(v) => setLine(i, { trib: v ?? l.trib })} />
            <SmallButton
              tone="danger"
              title="Remove"
              onClick={() => upd({ lines: lat.lines.filter((_, j) => j !== i) })}
            >
              ✕
            </SmallButton>
          </div>
        </Grid>
      ))}
      <AddButton
        onClick={() =>
          upd({
            lines: [
              ...lat.lines,
              { id: newId("ln"), name: `Line ${lat.lines.length + 1}`, storyId: lat.stories[0].id, dir: "X", trib: 10 },
            ],
          })
        }
      >
        + Add wall line
      </AddButton>
      <Hint>
        Name · story / direction (forces along X or Y) · plan position (ft: y of an X line, x of a Y line) · tributary
        width (ft, used when positions are blank). With positions on every line of a story and direction, tributary
        widths are computed and diaphragms, collectors and the rigid option become available.
      </Hint>
    </Collapsible>
  );
}
