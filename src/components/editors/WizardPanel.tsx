/** House wizard: creates the typical members of a rectangular wood-frame house from a few dimensions. */

import { useState } from "react";
import { DEFAULT_HOUSE, houseInputErrors, houseWizard, type HouseWizardInput, type Project } from "@/engine/project";
import { Collapsible, Field, Grid, Hint, NumberInput, Select, SmallButton } from "./fields";

type SetProject = (fn: (p: Project) => Project) => void;

export function WizardPanel({ p, set, onDone }: { p: Project; set: SetProject; onDone: (text: string) => void }) {
  const [o, setO] = useState<HouseWizardInput>(DEFAULT_HOUSE);
  const put = (patch: Partial<HouseWizardInput>) => setO((x) => ({ ...x, ...patch }));
  const num = (k: keyof HouseWizardInput, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={o[k] as number} min={0} onChange={(v) => put({ [k]: v ?? 0 })} />
    </Field>
  );
  const errors = houseInputErrors(o);
  return (
    <Collapsible title="House wizard (create the typical members)">
      <Hint>
        Rectangular gable-roofed house on a slab, ridge along the length, one interior bearing wall at mid-width.
        Creates roof framing, walls with a typical opening and header, second-floor framing, shear walls on the four
        lines of each story, diaphragms, sole-plate transfers and footings, all linked for the load takedown and sized
        until the checks pass. Edit, add or delete members afterwards as usual.
      </Hint>
      <Grid>
        {num("length", "Length along ridge (ft)")}
        {num("width", "Width across ridge (ft)")}
        <Field label="Stories">
          <Select
            value={String(o.stories) as "1" | "2"}
            options={["1", "2"]}
            onChange={(v) => put({ stories: v === "2" ? 2 : 1 })}
          />
        </Field>
        {num("plate", "Plate height each story (ft)")}
        <Field label="Roof framing">
          <Select
            value={o.roof}
            options={[
              { value: "rafters", label: "Rafters + ceiling joists" },
              { value: "trusses", label: "Wood trusses" },
            ]}
            onChange={(v) => put({ roof: v })}
          />
        </Field>
        {num("pitch", "Roof pitch (in 12)")}
        {num("overhang", "Eave overhang (ft)")}
        {o.stories === 2 ? (
          <Field label="Second-floor framing">
            <Select
              value={o.floor}
              options={[
                { value: "sawn", label: "Sawn joists" },
                { value: "ijoist", label: "I-joists" },
              ]}
              onChange={(v) => put({ floor: v })}
            />
          </Field>
        ) : (
          <span />
        )}
        {num("opening", "Typical opening, eave walls (ft)", "0 = none")}
        <span />
        {num("shearEave", "Shear wall length, each eave line (ft)")}
        {num("shearGable", "Shear wall length, each gable line (ft)")}
      </Grid>
      {errors.length ? <p className="text-xs text-destructive">{errors.join(" ")}</p> : null}
      <SmallButton
        onClick={() => {
          if (errors.length) return;
          if (p.members.length && !window.confirm(`Replace the ${p.members.length} members of this project?`)) return;
          set((x) => houseWizard(x, o));
          onDone("House created from the wizard: review each member, then edit sizes, loads and links as needed.");
        }}
      >
        Create members
      </SmallButton>
      <Hint>
        Keeps project information, criteria, assemblies, hardware and sheet settings; replaces members, levels and the
        lateral model.
      </Hint>
    </Collapsible>
  );
}
