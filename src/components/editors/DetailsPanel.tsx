/** Details sheets selection: which calculated and general typical details go on the sheets, and on which sheet. */

import { useMemo } from "react";
import type { Project, ProjectDesign } from "@/engine/project";
import { DETAIL_SHEETS, detailCatalog, type DetailCat } from "@/lib/details";
import { Check, Collapsible, Hint, SmallButton, inputCls } from "./fields";

type SetProject = (fn: (p: Project) => Project) => void;
const CATS = Object.keys(DETAIL_SHEETS) as DetailCat[];

export function DetailsPanel({ p, set, design }: { p: Project; set: SetProject; design: ProjectDesign }) {
  const items = useMemo(() => detailCatalog(p, design), [p, design]);
  const put = (id: string, patch: { on?: boolean; cat?: DetailCat }, defaults: { on: boolean; cat: DetailCat }) =>
    set((x) => {
      const next = { ...x.detailSheets };
      const v = { ...next[id], ...patch };
      // store only what differs from the default
      if (v.on === defaults.on) delete v.on;
      if (v.cat === defaults.cat) delete v.cat;
      if (v.on === undefined && v.cat === undefined) delete next[id];
      else next[id] = v;
      return { ...x, detailSheets: Object.keys(next).length ? next : undefined };
    });
  const on = items.filter((x) => x.on).length;
  return (
    <Collapsible title={`Details sheets (${on} of ${items.length} selected)`}>
      <Hint>
        Tick the details that go on the details sheets and pick the sheet for each. Calculated details carry the member
        marks and values from the report; general typicals are your standard details (3225 set, 2CONNECTION), on by
        default for a two-storey wood-frame house unless a calculated detail already covers them.
      </Hint>
      {CATS.map((cat) => {
        const list = items.filter((x) => x.cat === cat);
        if (!list.length) return null;
        return (
          <div key={cat} className="space-y-1">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              {DETAIL_SHEETS[cat]} ({list.filter((x) => x.on).length})
            </div>
            {list.map((x) => (
              <div key={x.id} className="flex items-center gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <Check
                    checked={x.on}
                    onChange={(v) => put(x.id, { on: v }, { on: x.defaultOn, cat: x.defaultCat })}
                    label={
                      <span className={x.on ? "text-foreground" : ""}>
                        {x.detail.title}{" "}
                        <span className="text-muted-foreground">
                          {x.general ? `general · ${x.from}` : `calc · ${x.detail.marks.join(", ")}`}
                        </span>
                      </span>
                    }
                  />
                </div>
                <select
                  className={`${inputCls} w-28`}
                  value={x.cat}
                  aria-label={`Sheet for ${x.detail.title}`}
                  onChange={(e) =>
                    put(x.id, { cat: e.target.value as DetailCat }, { on: x.defaultOn, cat: x.defaultCat })
                  }
                >
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      })}
      {p.detailSheets ? (
        <SmallButton onClick={() => set((x) => ({ ...x, detailSheets: undefined }))}>Reset to defaults</SmallButton>
      ) : null}
    </Collapsible>
  );
}
