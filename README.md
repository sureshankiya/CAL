# HouseCalc

Full-house structural calculation package for wood-frame dwellings — Tedds-style
calculation sheets in the JoistCalc / StudCalc / TrussCalc report layout, to the
CBC / CRC, ASCE 7, NDS and companion standards. The scope, decisions and phases are
in [PLAN.md](PLAN.md).

HouseCalc is a design aid. Its output is valid only when reviewed, completed where
noted and stamped by the Engineer of Record.

## Phase 1

| Area | Included |
|---|---|
| Code cycles | 2025 CBC / CRC (2024 IBC / IRC, ASCE 7-22, NDS-2024) and 2022 CBC / CRC (2021 IBC / IRC, ASCE 7-16, NDS-2018); stamped on every sheet |
| Loads | Itemised dead-load assemblies (ASCE 7 Table C3.1-1a), IRC R301.5 / IBC 1607.1 live loads, roof live reduction (ASCE 7 §4.8.2), snow (pf, Cs, ps, minimum, rain-on-snow, unbalanced for W ≤ 20 ft) |
| Members | FJ floor joists, R rafters (ridge beam or ridge board with thrust, birdsmouth), CJ ceiling joists / rafter ties (tension, heel nailing), IJ TJI I-joists, B / H / RB beams, headers and ridge beams in sawn, built-up, glulam and SCL |
| Analysis | Stiffness-method beam solver, simple / continuous / cantilevered, ASCE 7 §4.3.3 pattern live load, every ASD combination with its own C_D |
| Load path | Reactions carried between members as point or line loads by load type; rafter thrust carried to the tie joists |
| Report | Cover with EOR block, contents and summary with package checks, criteria, loads, member sheets, schedules, general / specific notes, assumption log |
| Drawings | PDF viewer, sheet tags, manual review table (values confirmed before they are applied) |

## Phase 2

| Area | Included |
|---|---|
| Walls and posts | W stud bearing walls (StudCalc port, corrected): typical stud per load segment, stud packs under point loads, king studs at openings, C&C wind (ASCE 7 Fig. 30.3-1) with NDS Eq. 3.9-3, plate bearing with C_b, wind deflection with P-Δ; P posts: C_P about both axes, built-up K_f (NDS 15.3), eccentricity, end-grain and perpendicular bearing |
| Load takedown | Walls deliver base line loads and stud-pack point loads; posts deliver point loads; footings receive them by link; load-path summary sheet and package checks for uncarried reactions and untied uplift |
| Trusses / connectors | T truss reaction import (deferred submittal) with uplift and plate bearing; CN connectors (hangers, ties, caps, bases, straps) checked per ASD combination against the catalogue load-duration column and uplift; editable project hardware list with VERIFY status |
| Existing members | New / existing / existing-modified status on every member, field-verify assumptions and notes |
| Footings | F continuous and PF pad footings: service bearing, uplift, plain (ACI 318 Ch. 14) or reinforced flexure, one-way and two-way shear, IBC 1809.4 / 1809.7 / 1809.8 minimums, presumptive soil rule (IBC 1806.2) |
| Lateral | ASCE 7 ELF base shear and Fx, Ch. 28 Part 1 envelope wind (Load Cases A / B, §28.3.4 minimum), wall lines by tributary width; SW segmented shear walls (SDPWS-2021): unit shear, aspect factor, chord forces, end posts, hold-downs incl. stacked uplift, ACI 318-19 Ch. 17 hold-down anchors, sill bolts, seismic drift and wind deflection |
| Schedules | Framing, truss, beam / header, wall, post, shear wall, hold-down, connector and foundation schedules, hardware data used |

Diaphragms, collectors, FTAO, steel, concrete / CMU walls and AI drawing extraction follow in Phases 3–4 (PLAN.md §14).

## Use

```bash
bun install
bun run dev          # http://localhost:8080 (in a container without IPv6: bunx vite dev --host 127.0.0.1)
```

- **Example** loads a one-story example house; **New** / **Open… / Save** manage project files (`*.housecalc.json`).
- The sidebar holds the project, criteria, dead-load assemblies, levels, members and drawings; the preview shows one sheet or the full package.
- **Print / Save PDF** prints the full package (US Letter). Printing is blocked while any member has an error.
- Values in red are overrides or data marked VERIFY; the cover prints a DRAFT banner until they are resolved.

## Checks

```bash
bun run typecheck
bun run lint
bun run test                 # unit tests + engine vs. independent reference
bun run verify:reference     # regenerate verification/reference.json (Python, closed form)
bun run print-check          # with the dev server running: PDF of the example package, page / footer checks
bun run build
```

`verification/reference.py` and `verification/reference_p2.py` are independent implementations (closed-form beam formulas,
three-moment equation, NDS factor equations, NDS 12.3 yield equations) — it does not use
the TypeScript engine. `tests/reference.test.ts` and `tests/reference_p2.test.ts` compare the engine with them.

## Layout

```
src/engine/core       code cycles, load types, ASCE 7 combinations, provenance, formatting
src/engine/data       NDS Supplement values, sections, glulam / SCL, TJI, data-library registry
src/engine/analysis   beam stiffness solver with pattern loading
src/engine/design     NDS bending and compression members, dowel fasteners, ACI 318 concrete and anchors, sizing
src/engine/loads      dead, live, roof live, snow, deflection criteria
src/engine/members    member modules (FJ, R, CJ, IJ, B / H / RB, W, P, T, CN, F / PF, SW)
src/engine/lateral    seismic and wind story forces, wall-line distribution
src/engine/project    project schema, load-path design order, marks, storage, review table
src/components        report primitives, diagrams, sheets, editors, drawing viewer
```

Reference design values are tagged with their source and edition; tables not yet
checked against the printed source print as VERIFY (data library `library.ts`).
