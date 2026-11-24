/**
 * House wizard: the typical members of a rectangular gable-roofed wood-frame house on a slab,
 * created from a few dimensions and linked for the load takedown (roof → walls → floor → walls
 * → footings) and the lateral analysis. Every member is an ordinary member afterwards: sizes
 * are starting points raised until the checks pass, and all inputs stay editable.
 */

import { designProject } from "./design";
import { defaultLateral, generateWeights } from "./lateral";
import type { MemberSpec, Project } from "./schema";
import { newId, newMemberSpec, type NewMemberKind } from "./templates";

export interface HouseWizardInput {
  /** plan dimension along the ridge, ft */
  length: number;
  /** plan dimension across the ridge (rafter / joist span direction), ft */
  width: number;
  stories: 1 | 2;
  /** plate height of each story, ft */
  plate: number;
  roof: "rafters" | "trusses";
  /** roof pitch, rise in 12 */
  pitch: number;
  /** eave overhang, ft */
  overhang: number;
  /** second-floor framing (two-story only) */
  floor: "sawn" | "ijoist";
  /** typical door / window opening in the eave walls, ft (0: none) */
  opening: number;
  /** full-height sheathed length on each eave wall line and each gable wall line, ft */
  shearEave: number;
  shearGable: number;
}

export const DEFAULT_HOUSE: HouseWizardInput = {
  length: 40,
  width: 28,
  stories: 2,
  plate: 9,
  roof: "rafters",
  pitch: 4,
  overhang: 1.5,
  floor: "sawn",
  opening: 6,
  shearEave: 12,
  shearGable: 12,
};

const SAWN = ["2x4", "2x6", "2x8", "2x10", "2x12"];
const HEADERS = ["4x6", "4x8", "4x10", "4x12", "6x10", "6x12", "6x14"];
const IJOIST_DEPTHS = ['9-1/2"', '11-7/8"', '14"', '16"'] as const;

/** next entry of a size ladder, or undefined at the top */
const up = <T extends string | number>(ladder: readonly T[], now: T): T | undefined => ladder[ladder.indexOf(now) + 1];

/** problems that make the wizard input unusable */
export function houseInputErrors(o: HouseWizardInput): string[] {
  const e: string[] = [];
  if (!(o.length >= 12 && o.length <= 120)) e.push("Length: 12 to 120 ft.");
  if (!(o.width >= 12 && o.width <= 48)) e.push("Width: 12 to 48 ft (one interior bearing line at mid-width).");
  if (!(o.plate >= 7 && o.plate <= 12)) e.push("Plate height: 7 to 12 ft.");
  if (!(o.pitch >= 2 && o.pitch <= 12)) e.push("Roof pitch: 2 to 12 in 12.");
  if (!(o.overhang >= 0 && o.overhang <= 4)) e.push("Overhang: 0 to 4 ft.");
  if (!(o.opening >= 0 && o.opening <= 16 && o.opening <= o.length - 8))
    e.push("Opening: 0 to 16 ft, leaving 4 ft of wall each side.");
  if (!(o.shearEave >= 3 && o.shearEave <= o.length)) e.push("Eave shear wall length: 3 ft up to the house length.");
  if (!(o.shearGable >= 3 && o.shearGable <= o.width)) e.push("Gable shear wall length: 3 ft up to the house width.");
  return e;
}

/**
 * The project with its members, levels and lateral model replaced by the generated house; project
 * information, criteria, assemblies, hardware and sheet settings are kept.
 */
export function houseWizard(base: Project, o: HouseWizardInput): Project {
  const errors = houseInputErrors(o);
  if (errors.length) throw new Error(errors.join(" "));
  const two = o.stories === 2;
  const half = o.width / 2;
  const levels = [
    { id: "L1", name: "First floor", number: 1 },
    ...(two ? [{ id: "L2", name: "Second floor", number: 2 }] : []),
    { id: "RF", name: "Roof", number: two ? 3 : 2 },
  ];
  const p: Project = {
    ...base,
    structures: [{ id: "S1", name: "Main house", levels }],
    members: [],
    lateral: undefined,
    review: [],
    slab: base.slab ?? {
      thickness: 4,
      reinforcement: '#3 @ 18" o.c. each way at mid-depth',
      vaporRetarder: "10 mil polyethylene, lapped 12 in. and taped",
      base: "4 in. crushed rock",
      joints: "Sawcut contraction joints at 15 ft max. each way",
    },
  };
  const stories = [
    { id: "ST1", name: "First story", height: o.plate, items: [] },
    ...(two ? [{ id: "ST2", name: "Second story", height: o.plate, items: [] }] : []),
  ];
  const lines = stories.flatMap((s, i) => [
    { id: `LN1-${i + 1}`, name: `Line 1 (front), ${s.name}`, storyId: s.id, dir: "X" as const, trib: half, pos: 0 },
    {
      id: `LN2-${i + 1}`,
      name: `Line 2 (rear), ${s.name}`,
      storyId: s.id,
      dir: "X" as const,
      trib: half,
      pos: o.width,
    },
    {
      id: `LNA-${i + 1}`,
      name: `Line A (left), ${s.name}`,
      storyId: s.id,
      dir: "Y" as const,
      trib: o.length / 2,
      pos: 0,
    },
    {
      id: `LNB-${i + 1}`,
      name: `Line B (right), ${s.name}`,
      storyId: s.id,
      dir: "Y" as const,
      trib: o.length / 2,
      pos: o.length,
    },
  ]);
  p.lateral = {
    ...defaultLateral(p),
    enabled: true,
    Lx: o.length,
    Ly: o.width,
    ridge: "X",
    pitch: o.pitch,
    roofRise: Math.round(((half * o.pitch) / 12) * 100) / 100,
    stories,
    lines,
    distribution: "flexible",
  };
  p.lateral.stories.forEach((s, i) => (s.items = generateWeights(p, p.lateral!, i)));

  let linkNo = 0;
  const line = (sourceId: string, support: number, label: string, x1?: number, x2?: number) => ({
    id: `wk${++linkNo}`,
    kind: "line" as const,
    sourceId,
    support,
    label,
    x1,
    x2,
    factor: 1,
  });
  const point = (sourceId: string, support: number, label: string, x: number) => ({
    id: `wk${++linkNo}`,
    kind: "point" as const,
    sourceId,
    support,
    label,
    x,
    factor: 1,
  });
  /** adds a member from the standard template, with the wizard's values over it */
  const add = <K extends MemberSpec["kind"]>(
    kind: NewMemberKind,
    levelId: string,
    description: string,
    patch: Partial<Extract<MemberSpec, { kind: K }>>,
  ) => {
    const m = { ...newMemberSpec(p, kind, "S1", levelId), id: newId("wz"), description, ...patch } as MemberSpec;
    p.members.push(m);
    return m.id;
  };

  // ---------------------------------------------------------------- roof
  /** line loads the roof puts on an eave wall (side 0 front, 1 rear) and on the center wall */
  let roofOnEave: (side: 0 | 1) => Array<[string, number, string]>;
  let roofOnCenter: Array<[string, number, string]> = [];
  if (o.roof === "rafters") {
    const r = add<"rafter">("rafter", "RF", "Main roof rafters, ridge board, tied by the ceiling joists", {
      run: half,
      rise: o.pitch,
      overhang: o.overhang,
      ridge: "board",
      plateSeat: 5.5,
      seatCut: 1.5,
      size: half > 14 ? "2x10" : "2x8",
      tieSpacing: 24,
      windPressure: -20,
    });
    const cj = add<"ceilingJoist">("ceilingJoist", "RF", "Ceiling joists / rafter ties, lapped over the center wall", {
      spans: [half, half],
      bearing: [5.5, 3.5, 5.5],
      size: half > 14 ? "2x8" : "2x6",
      tensionFrom: r,
      heel: { nail: "16d-common", count: 8, rafterThickness: 1.5 },
    });
    roofOnEave = (side) => [
      [r, 0, "Rafters"],
      [cj, side ? 2 : 0, "Ceiling joists"],
    ];
    roofOnCenter = [[cj, 1, "Ceiling joists"]];
    add<"connector">("connector", "RF", "Rafter-to-plate tie for wind uplift", {
      hardwareId: p.hardware.find((h) => h.id === "H2.5A")?.id ?? p.hardware.find((h) => h.kind === "tie")?.id ?? "",
      sourceId: r,
      support: 0,
    });
  } else {
    const t = add<"woodTruss">("woodTruss", "RF", "Roof trusses, bearing on the eave walls", {
      span: o.width,
      pitch: o.pitch,
      overhang: o.overhang,
      bearingLen: 5.5,
    });
    roofOnEave = (side) => [[t, side, "Roof trusses"]];
  }
  const top = stories[stories.length - 1].id;
  add<"diaphragm">("roofDiaphragm", "RF", "Roof diaphragm, X-direction load", { storyId: top, dir: "X" });
  add<"diaphragm">("roofDiaphragm", "RF", "Roof diaphragm, Y-direction load", {
    storyId: top,
    dir: "Y",
    unblockedCase: 2,
  });

  // ---------------------------------------------------------------- stories, top down
  /** what the story above puts on [front wall, center wall, rear wall] as line loads */
  let above: Array<Array<[string, number, string]>> = [roofOnEave(0), roofOnCenter, roofOnEave(1)];
  /** upper shear wall on each line, for the uplift carried down */
  let upperShear: Record<string, string> = {};
  for (let s = stories.length - 1; s >= 0; s--) {
    const lv = s === 0 ? "L1" : "L2";
    const n = s + 1;
    // openings centered in the eave walls
    const x1 = Math.round((o.length - o.opening) / 2);
    const x2 = x1 + o.opening;
    const wallIds: string[] = [];
    (["Front", "Center", "Rear"] as const).forEach((name, k) => {
      const exterior = k !== 1;
      const loads = above[k];
      if (!exterior && !loads.length && !(two && s === 0)) {
        wallIds.push("");
        return;
      }
      const opening = exterior && o.opening > 0;
      let header = "";
      if (opening)
        header = add<"beam">("header", lv, `${name} wall opening header, ${n === 1 ? "first" : "second"} story`, {
          spans: [o.opening],
          links: loads.map(([id, sup, label]) => line(id, sup, label)),
          material: {
            kind: "sawn",
            species: "DF-L",
            grade: "No.2",
            size: o.opening > 8 ? "6x12" : o.opening > 5 ? "4x10" : "4x8",
            plies: 1,
          },
          deflection: { preset: two && s === 0 ? "floor" : "roof-nonplaster" },
        });
      const wall = add<"wall">(
        "wall",
        lv,
        exterior ? `${name} exterior bearing wall` : "Interior bearing wall at mid-width",
        {
          length: o.length,
          plateHeight: o.plate,
          size: exterior ? "2x6" : "2x4",
          self: {
            assemblyId:
              p.assemblies.find((a) => a.id === (exterior ? "WD1" : "WD2"))?.id ??
              p.assemblies.find((a) => a.kind === "wall")?.id,
          },
          wind: exterior ? { mode: "computed", zone: 4 } : { mode: "none" },
          links: opening
            ? [
                ...loads.flatMap(([id, sup, label]) => [
                  line(id, sup, label, 0, x1),
                  line(id, sup, label, x2, o.length),
                ]),
                point(header, 0, "Header", x1),
                point(header, 1, "Header", x2),
              ]
            : loads.map(([id, sup, label]) => line(id, sup, label)),
          packs: opening
            ? [
                { x: x1, studs: 2, label: "Jack + king studs, opening left" },
                { x: x2, studs: 2, label: "Jack + king studs, opening right" },
              ]
            : [],
          openings: opening ? [{ label: "Typical opening", x1, x2, kings: 1 }] : [],
        },
      );
      wallIds.push(wall);
    });

    // shear walls: one full-height segment per line, at the left / front end of the line
    const shear: Record<string, string> = {};
    (
      [
        ["LN1", "Front", o.shearEave, 0],
        ["LN2", "Rear", o.shearEave, 2],
        ["LNA", "Left gable", o.shearGable, -1],
        ["LNB", "Right gable", o.shearGable, -1],
      ] as const
    ).forEach(([ln, name, b, wallIndex]) => {
      const lineId = `${ln}-${n}`;
      const loads = wallIndex >= 0 ? above[wallIndex] : [];
      shear[ln] = add<"shearWall">("shearWall", lv, `${name} wall`, {
        lineId,
        b,
        h: o.plate,
        x: 0,
        stud: { species: "DF-L", grade: "No.2", size: "2x6", spacing: 16 },
        endPost: { size: "2x6", plies: 2, holeDia: 0.75 },
        sillSize: "2x6",
        self: {
          assemblyId: p.assemblies.find((a) => a.id === "WD1")?.id ?? p.assemblies.find((a) => a.kind === "wall")?.id,
        },
        links: loads.map(([id, sup, label]) => line(id, sup, label)),
        upliftFrom: upperShear[ln],
        // upper story: sole plate on the floor framing; first story: 5/8 in. anchor bolts in the slab edge
        sill:
          s > 0
            ? { type: "framing", d: 0.625, spacing: 48, embed: 7, edge: 1.75 }
            : { type: "cast-in", d: 0.625, spacing: 48, embed: 7, edge: 1.75 },
      });
      if (s > 0)
        add<"transfer">("transfer", lv, `${name} shear wall sole plate to the floor framing`, {
          interface: "sole-plate",
          source: { kind: "wall", id: shear[ln] },
          connector: { type: "nails", nail: "16d-common", ts: 1.5, tm: 1.5, species: "DF-L", toenail: false, rows: 1 },
          spacing: 6,
        });
    });
    upperShear = shear;

    if (s > 0) {
      // the floor under this story bears on the walls of the story below
      const fj =
        o.floor === "ijoist"
          ? add<"ijoist">("ijoist", lv, "Second-floor I-joists, continuous over the center wall", {
              spans: [half, half],
              bearing: [1.75, 3.5, 1.75],
              depth: half > 16 ? '14"' : '11-7/8"',
            })
          : add<"joist">("joist", lv, "Second-floor joists, lapped over the center wall", {
              spans: [half, half],
              bearing: [1.5, 3.5, 1.5],
              size: half > 14 ? "2x12" : "2x10",
            });
      add<"diaphragm">("floorDiaphragm", lv, "Second-floor diaphragm, X-direction load", {
        storyId: stories[s - 1].id,
        dir: "X",
      });
      add<"diaphragm">("floorDiaphragm", lv, "Second-floor diaphragm, Y-direction load", {
        storyId: stories[s - 1].id,
        dir: "Y",
        unblockedCase: 2,
      });
      above = [0, 1, 2].map((k) => [
        ...(wallIds[k] ? ([[wallIds[k], 0, "Bearing wall above"]] as Array<[string, number, string]>) : []),
        [fj, k, "Floor joists"],
      ]);
    } else {
      // footings under the first-story walls (slab on grade: no stem wall)
      (["Front", "Interior", "Rear"] as const).forEach((name, k) => {
        if (!wallIds[k]) return;
        const packs = k !== 1 && o.opening > 0 ? 2 : 0;
        add<"footing">("footing", "L1", `${name} continuous footing`, {
          stories: o.stories,
          links: [
            line(wallIds[k], 0, "Bearing wall"),
            ...Array.from({ length: packs }, (_, i) =>
              point(wallIds[k], i + 1, "Stud pack", Math.round((o.length - o.opening) / 2) + i * o.opening),
            ),
          ],
        });
      });
    }
  }

  // roof load path on top first, foundation last: the order the sheets print in
  return sized(p);
}

const SILL_SPACINGS = [48, 32, 24, 16, 12];
const EDGE_NAILING = [6, 4, 3, 2];
const NAIL_SPACINGS = [6, 4, 3, 2];

/**
 * raises the members whose checks fail, one step per round, by the check that fails: a size up
 * its ladder (the lightest passing size where the check names one), closer sill anchors, closer
 * edge nailing, sheathing both faces, closer transfer nails, more chord splice nails, a wider footing
 */
function sized(p: Project): Project {
  for (let pass = 0; pass < 10; pass++) {
    const d = designProject(p);
    let changed = false;
    p = {
      ...p,
      members: p.members.map((m): MemberSpec => {
        const r = d.outcomes.get(m.id)?.result;
        if (!r || r.pass) return m;
        const failing = r.checks.filter((c) => !c.pass).map((c) => c.name);
        const fails = (re: RegExp) => failing.some((n) => re.test(n));
        const light = r.alternatives?.lightest;
        let next: MemberSpec = m;
        if (m.kind === "joist" || m.kind === "rafter" || m.kind === "ceilingJoist" || m.kind === "wall") {
          const size = (light && SAWN.includes(light) ? light : undefined) ?? up(SAWN, m.size);
          if (size) next = { ...m, size };
        } else if (m.kind === "beam" && m.material.kind === "sawn") {
          const size = up(HEADERS, m.material.size);
          if (size) next = { ...m, material: { ...m.material, size } };
        } else if (m.kind === "ijoist") {
          const depth = up(IJOIST_DEPTHS, m.depth);
          if (depth) next = { ...m, depth };
        } else if (m.kind === "footing" && m.type === "strip" && m.B < 4) next = { ...m, B: m.B + 0.25 };
        else if (m.kind === "shearWall") {
          const sp = up(SILL_SPACINGS, m.sill.spacing);
          const en = up(EDGE_NAILING, m.sides[0].spacing);
          // next stronger hold-down of the hardware list
          const hds = p.hardware
            .filter((h) => h.kind === "holdown" && (h.tension ?? 0) > 0)
            .sort((a, b) => (a.tension ?? 0) - (b.tension ?? 0));
          const now = p.hardware.find((h) => h.id === m.holdownId)?.tension ?? 0;
          const hd = hds.find((h) => (h.tension ?? 0) > now);
          if (fails(/^Hold-down /) && hd) next = { ...m, holdownId: hd.id };
          else if (fails(/^Sill anchor/) && sp) next = { ...m, sill: { ...m.sill, spacing: sp } };
          else if (fails(/shear|drift|deflection/i) && !fails(/^Sill anchor/))
            next = en
              ? { ...m, sides: m.sides.map((x) => ({ ...x, spacing: en })) }
              : m.sides.length === 1
                ? { ...m, sides: [m.sides[0], m.sides[0]] }
                : m;
        } else if (m.kind === "transfer" && m.connector.type === "nails") {
          const sp = up(NAIL_SPACINGS, m.spacing);
          if (sp) next = { ...m, spacing: sp };
          else if (m.connector.rows < 3)
            next = { ...m, spacing: 6, connector: { ...m.connector, rows: m.connector.rows + 1 } };
        } else if (m.kind === "diaphragm" && fails(/splice/i) && m.chord.splice.nails < 32)
          next = { ...m, chord: { ...m.chord, splice: { ...m.chord.splice, nails: m.chord.splice.nails + 4 } } };
        else if (m.kind === "diaphragm" && fails(/shear|deflection/i) && !m.blocked) next = { ...m, blocked: true };
        changed ||= next !== m;
        return next;
      }),
    };
    if (!changed) break;
  }
  return p;
}
