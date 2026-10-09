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

## Phase 3

| Area | Included |
|---|---|
| Steel | SB steel beams, headers and lintels (W, C, HSS; AISC 360-16 / 360-22, LRFD or ASD): flexure with LTB per unbraced segment and C_b (F2 / F3 / F7 / F8), shear (G2 / G4 / G5), deflection, web local yielding and crippling (J10), bearing on wood; fixed-end supports in the beam solver; SC HSS / pipe columns: E3 / E7 compression, H1 interaction with B1, eccentric beam bearing, wind on the column, wood beam bearing on the cap plate; BP base plates: DG1 small / large moment, J8 bearing, rod tension + shear + grout-pad bending (J3.7), column weld, ACI 318 Ch. 17 anchor group (tension breakout, pullout, blowout, steel and breakout shear Cases 1 and 2, pryout, interaction) |
| Diaphragms | RD / FD wood diaphragms (SDPWS Table 4.2A): F_px with the §12.10.1.1 limits, unit shear per span, aspect ratio, chords on the top plate with nailed or strapped splices, collector force profile along each wall line (Ω0 or the light-frame exception) |
| Lateral distribution | Wall-line plan positions with computed tributary widths; rigid-diaphragm distribution with inherent and accidental torsion, envelope option, torsional-irregularity ratio |
| Shear walls | FTAO walls (one opening, Diekmann rational method): pier and above / below unit shears, corner strap forces, pier aspect |
| Connections | ST shear transfer (clips or nails, required spacing), UP wind-uplift chain from the roof to the foundation, LG ledgers to wood rims, concrete or CMU (NDS 12.3 yield equations at the load angle) |
| Schedules | Steel beam / column, base plate, diaphragm, shear transfer / uplift and ledger schedules |

## Phase 4

| Area | Included |
|---|---|
| Concrete / CMU walls | CW-# stem and foundation walls: CMU per TMS 402 ASD (§8.3: P_a, cracked-section M_c at the applied P, F_v with M/(Vd), in-plane shear with F_vs and in-plane flexure, A_v / 3, prescriptive seismic reinforcement §7.4) and concrete per ACI 318-19 (P-M strength with φ from ε_t, member slenderness magnifier, one-way and in-plane shear, Table 11.6.1 minimums, 11.7 spacing); Timoshenko panel analysis (pinned / fixed / cantilever, parapet), wind, ASCE 7 §12.11.1 seismic, earth pressure, eccentric top load; load-path links from the walls above and to the footing |
| Foundations | HF-# shear-wall / hold-down footings (rigid-body overturning, eccentric bearing, sliding with IBC 1806.3 friction and passive, hold-down uplift length and longitudinal flexure); pads as thickened slabs under posts; slab-on-grade notes; TI-# tie-ins to existing concrete (drilled dowels / adhesive anchors, ACI 318 Ch. 17 bond, breakout, pryout, interaction; shear friction 22.9) |
| Trusses | T-# trusses designed in HouseCalc — TrussCalc geometry and joint solver ported (Fink, Howe, king, queen, king + queen, n-panel parallel chord Warren / Pratt); loads by type with balanced and unbalanced snow and wind uplift, ASCE 7 ASD combinations with C_D, member axial (C_P both axes), chord combined 3.9.1 / 3.9.2 with panel bending, heel bearing, tail bending, virtual-work deflection, nailed / bolted joints by NDS 12.3, metal plates from the manufacturer value |
| Drawings | AI-assisted extraction of a drawing page into the review table (server function, `ANTHROPIC_API_KEY` from the hosting environment, cost estimate before each run, results unconfirmed until the engineer confirms them) |
| Report | General notes generated from the designed members (codes, criteria, concrete, slab, masonry, wood, steel, connectors, post-installed anchors), special-inspection table (IBC Ch. 17), deferred submittals, field-verification list, consolidated hardware schedule; CMU / concrete wall, shear-wall footing, tie-in and truss schedules |
| Validation projects | **San Miguel** — 1109 San Miguel Avenue addition rebuilt from the permit drawings; **Truss check** — the 45 ft East Lincoln storage-building truss |

AI extraction needs an Anthropic API key set as `ANTHROPIC_API_KEY` in the environment that runs the server (never in the browser or the project file).

## Phase 5

| Area | Included |
|---|---|
| Validation | 14 portfolio permit sets transcribed (verification/portfolio/sets) and normalised to 94 cases; 1,110 printed Tedds values recomputed by the engine — 1,083 match, 27 documented differences, 0 unexplained (VALIDATION.md, `tests/validation.test.ts`, regenerate with `UPDATE_REGISTER=1 bunx vitest run tests/validation.test.ts`) |
| Fixes from validation | SDPWS 4.3.3.2.1 wind exception (WSP + gypsum wallboard additive), unblocked gypsum aspect 1.5:1, 1/2 in. gypsum sheathing and particleboard rows, opt-in 15/32 in. shear values (Table 4.3A footnote) |
| Locked versions | Engine 1.0.0 / data library 1.0 fingerprints (`src/engine/lock.json`) stamped on every sheet; project files record the build; `bun run lock` refuses a changed source under an unchanged version; modified builds print "UNLOCKED" |
| Retaining walls | RW-# cantilever walls, concrete or CMU stem: IBC 1807.2.3 sliding / overturning (1.5, 1.1 with 0.7E), bearing with partial contact, stem by the CW engine (one-way slab minimums for concrete stems, ACI 318-19 13.3.7.1), toe and heel flexure / shear per combination, minimum and longitudinal steel, dowel hook development |
| Decks | GP-# guard posts (200 lb, bending, shear, washer bearing, bolt tension, tension device); deck framing uses the joist / beam / post / ledger / pad modules with the 40 psf deck live load, wet service and incising; deck and retaining-wall notes; **Deck + RW** options project |
| Cold-formed steel | CS-# stud walls (optional): allowables from the manufacturer / SSMA table, demands, AISI S100-16 H1.2 with B₁ amplification, deflection |
| Sign-off | SIGNOFF.md — release checklist; items for the Engineer of Record are listed there |

## Use

```bash
bun install
bun run dev          # http://localhost:8080 (in a container without IPv6: bunx vite dev --host 127.0.0.1)
bun run build:static # browser-only single-page build (dist-artifact/housecalc.html); no AI extraction
```

- **Example** loads a one-story example house; **San Miguel** and **Truss check** load the Phase 4 validation projects; **Deck + RW** loads the Phase 5 options project; **New** / **Open… / Save** manage project files (`*.housecalc.json`).
- **Fill from .md…** fills the project — information, criteria, assemblies, levels, lateral, hardware and every member — from a Markdown input sheet (choose a `.md` file or paste it). **Export .md** writes the current project in the same format, which is also the template (`examples/example-house.housecalc.md`).
  - One `- path: value` line per field under `## Project`, and under `## Member MARK (kind)` for each member (e.g. `## Member B-1 (beam)`, then `- spans: [16]`). `| path | value |` table rows also work.
  - Members are matched by mark: existing marks are updated, new marks are added from the standard template for the kind, then the sheet's values applied. A list given in the sheet replaces the list.
  - **Check sheet** reports the values filled, members added / updated, template defaults used and keys that are not fields. Nothing is applied while a required field is missing or a value is invalid; the report names each one.
  - Apply to the current project, or start a new project from the sheet.
  - A **drawing-data document** (a full-house calculation data extraction with criteria tables, beam / wall / footing schedules, a joist register and OCR text) is recognised and converted to an input sheet: project information, code cycle, criteria and one member per scheduled beam, bearing wall, footing, post and new joist / rafter. What the drawings do not give (spans, lengths, heights, trib widths, nailing, soil bearing) stays at the template value and is listed per member as REQUIRED INPUT — the sheet prints VERIFY and the cover DRAFT until each is marked entered in the member editor. Conflicts and skipped items go to the project notes. Shear walls are listed in the notes for the Lateral setup.
- The sidebar holds the project, criteria, dead-load assemblies, levels, members and drawings; the preview shows one sheet or the full package.
- **Print / Save PDF** prints the full package (US Letter). Printing is blocked while any member has an error.
- **Download report (.html)** saves the full package as one standalone HTML file — open it in a browser and print to PDF (Letter, background graphics on). In the claude.ai Artifact view the page can neither print nor start downloads, so **Print / Save PDF**, **Save**, **Export .md** and the report copy the file contents to the clipboard there (the message names the file to paste them into); on a regular web host they download normally.
- Values in red are overrides or data marked VERIFY; the cover prints a DRAFT banner until they are resolved.

## Checks

```bash
bun run typecheck
bun run lint
bun run test                 # unit tests + engine vs. independent reference
bun run verify:reference     # regenerate verification/reference.json (Python, closed form)
bun run print-check          # with the dev server running: PDF of the example package, page / footer checks
bun run build
bun run lock                 # release only: lock the engine / data-library fingerprints (bump src/engine/version.ts first)
```

`verification/reference.py`, `reference_p2.py` … `reference_p5.py` are independent implementations (closed-form beam
formulas, three-moment equation, NDS, AISC 360 / DG1, ACI 318 Ch. 17, SDPWS and ASCE 7 provisions written from the
code text) — they do not use the TypeScript engine. `tests/reference*.test.ts` compare the engine with them.

## Layout

```
src/engine/core       code cycles, load types, ASCE 7 combinations, provenance, formatting
src/engine/data       NDS Supplement values, sections, glulam / SCL, TJI, data-library registry
src/engine/analysis   beam stiffness solver with pattern loading, Timoshenko wall panels, pin-jointed trusses
src/engine/design     NDS members and dowel fasteners, AISC 360 steel, DG1 base plates, ACI 318 concrete and anchors, TMS 402 masonry, sizing
src/engine/loads      dead, live, roof live, snow, deflection criteria
src/engine/members    member modules (FJ, R, CJ, IJ, B / H / RB, W, P, T, CN, F / PF, SW, SB, SC, BP, RD / FD, ST, UP, LG, CW, HF, TI)
src/engine/lateral    seismic and wind story forces, flexible and rigid wall-line distribution
src/engine/project    project schema, load-path design order, marks, storage, review table, notes, AI extraction plumbing
src/components        report primitives, diagrams, sheets, editors, drawing viewer
src/lib/aiExtract.ts  server function for AI drawing extraction
```

Reference design values are tagged with their source and edition; tables not yet
checked against the printed source print as VERIFY (data library `library.ts`).
