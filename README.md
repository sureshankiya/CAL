# HouseCalc

Full-house structural calculation package for wood-frame dwellings — Tedds-style
calculation sheets in the JoistCalc / StudCalc / TrussCalc report layout, to the
CBC / CRC, ASCE 7, NDS and companion standards. The scope, decisions and phases are
in [PLAN.md](PLAN.md).

HouseCalc is a design aid. Its output is valid only when reviewed, completed where
noted and stamped by the Engineer of Record.

## Phase 1 (this build)

| Area | Included |
|---|---|
| Code cycles | 2025 CBC / CRC (2024 IBC / IRC, ASCE 7-22, NDS-2024) and 2022 CBC / CRC (2021 IBC / IRC, ASCE 7-16, NDS-2018); stamped on every sheet |
| Loads | Itemised dead-load assemblies (ASCE 7 Table C3.1-1a), IRC R301.5 / IBC 1607.1 live loads, roof live reduction (ASCE 7 §4.8.2), snow (pf, Cs, ps, minimum, rain-on-snow, unbalanced for W ≤ 20 ft) |
| Members | FJ floor joists, R rafters (ridge beam or ridge board with thrust, birdsmouth), CJ ceiling joists / rafter ties (tension, heel nailing), IJ TJI I-joists, B / H / RB beams, headers and ridge beams in sawn, built-up, glulam and SCL |
| Analysis | Stiffness-method beam solver, simple / continuous / cantilevered, ASCE 7 §4.3.3 pattern live load, every ASD combination with its own C_D |
| Load path | Reactions carried between members as point or line loads by load type; rafter thrust carried to the tie joists |
| Report | Cover with EOR block, contents and summary with package checks, criteria, loads, member sheets, schedules, general / specific notes, assumption log |
| Drawings | PDF viewer, sheet tags, manual review table (values confirmed before they are applied) |

Walls, posts, lateral, connections and foundations follow in Phases 2–4 (PLAN.md §14).

## Use

```bash
bun install
bun run dev          # http://localhost:8080
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

`verification/reference.py` is an independent implementation (closed-form beam formulas,
three-moment equation, NDS factor equations, NDS 12.3 yield equations) — it does not use
the TypeScript engine. `tests/reference.test.ts` compares the engine with it.

## Layout

```
src/engine/core       code cycles, load types, ASCE 7 combinations, provenance, formatting
src/engine/data       NDS Supplement values, sections, glulam / SCL, TJI, data-library registry
src/engine/analysis   beam stiffness solver with pattern loading
src/engine/design     NDS bending-member design, dowel fasteners, sizing helpers
src/engine/loads      dead, live, roof live, snow, deflection criteria
src/engine/members    member modules (FJ, R, CJ, IJ, B / H / RB)
src/engine/project    project schema, load-path design order, marks, storage, review table
src/components        report primitives, diagrams, sheets, editors, drawing viewer
```

Reference design values are tagged with their source and edition; tables not yet
checked against the printed source print as VERIFY (data library `library.ts`).
