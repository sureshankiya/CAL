# HouseCalc — Full-House Structural Calculation Package

Implementation plan · 2026-10-07 · Rev. A (for approval)

---

## 1. Source review — Lovable workspace "Suresh's Lovable"

| App (header name) | Lovable project | Scope found | Used in HouseCalc |
|---|---|---|---|
| JoistCalc | Structure Genius | Sawn floor joists, TJI joists, roof rafters, hangers, ledger nailing, framing-schedule cover, connector schedule | Report kit, joist / TJI / rafter engines, hanger logic, load + V/M/Δ diagrams |
| StudCalc | Stud Wall Calculator | Bearing stud walls, openings (header / jack / king / cripples), stud & sill connections, strip footing, braced walls (IRC + SDPWS) | Wall, header, connection, footing and bracing engines; wall elevation SVG |
| TrussCalc | Roof Truss Planner | Wood roof trusses (Fink, Howe, King, Queen, hybrid, parallel chord, custom), method of joints, joint connections | Truss engine and truss diagram |
| STRUTURA | Truss Report Master | Steel trusses, AISC 360, dark dashboard UI | **Excluded** — style and steel-truss scope not used (per instruction) |
| — | Claude Creator Hub | Not an engineering tool | Not used |

The three wood apps share one stack (TanStack Start, React 19, Vite, Tailwind v4, shadcn/ui). They run entirely in the browser and print through `window.print()` with print CSS. HouseCalc uses the same stack and layout, and their report components are copied over with only minor changes.

---

## 2. Report output style (copied 1:1 from JoistCalc / StudCalc / TrussCalc)

| Element | Specification (as in the source apps) |
|---|---|
| Page | US Letter, 8.5 in sheet, margins 0.55 / 0.6 / 0.7 / 0.6 in, Arial, black on white |
| Title block (repeats every page via `<thead>`) | `CALC` cell · Project (name, address) · Job Ref. / Section · Sheet no./rev. / Calc. by · Date · Chk'd by · Date · App'd by · Date |
| Sheet title | 13 pt bold uppercase centred, e.g. `STRUCTURAL BEAM DESIGN CALCULATIONS (NDS-2024)` |
| Subtitle | 9.5 pt italic centred — standard, method, "member n of N: mark" |
| Section heads | 10.5 pt bold — "Design basis & codes", "Material properties", "Applied loading", … |
| Calc rows (`TR`) | Two columns: description (55 %) · expression `F_b' = F_b × C_D × … = **1,186.3 lb/in²**` with optional bold-italic PASS / FAIL |
| Verdict lines | Right-aligned bold italic: `PASS — Design bending stress exceeds actual bending stress` |
| Tables | `SummaryTable` (Check · Demand · Capacity · D/C · Result) and `DataTable` (load take-down, combinations, member forces) — 1 px black borders, 9–9.5 pt |
| Diagrams | Black-and-white SVG line drawings only: load diagram, 2×2 shear / moment / deflection / loading grid, wall elevation, truss elevation |
| Result block | Centred uppercase `MEMBER ADEQUATE — ALL CHECKS PASS` + one-line member description + governing D/C |
| Notes | "Notes & limitations" numbered list, 9.5 pt |
| Footer | Left: "Project — Section" · Centre: "Rev. x \| date" · Right: "Page n of N" |
| Overrides | Manual overrides (C_D, deflection limits) printed in red #c00000 as a checker flag — the only colour used |
| Terminology | Source wording kept (e.g. "Utilisation", "Allowable", "Design … exceeds actual …") |

**Standard member sheet sequence** (source layout, extended to your preferred calculation order):

1. Title block + sheet title / subtitle
2. Design basis & codes
3. Configuration & geometry (+ diagram)
4. Material properties & adjustment factors
5. Design assumptions (bracing, service condition, supports)
6. Applied loading (+ load diagram), load take-down table, load-combination table
7. **Load path** — loads received from / reactions delivered to (new, same table style)
8. Analysis results (+ V / M / Δ diagrams)
9. Strength checks with verdict lines
10. Serviceability checks (deflection, drift)
11. Stability checks (C_L, C_P)
12. Governing checks summary table + governing combination
13. Result block — "Required member: …"
14. **Final design summary** (new — selected member, material, governing case and check, D/C, deflection, connection requirements, field-verification items)
15. Notes & limitations

---

## 3. Application UI (copied from the source apps)

```text
┌ HouseCalc ─────────────────────────────────────────────────── [Save] [Open] [Print / Save PDF] ┐
│ NDS-2024 · SDPWS-2021 · ACI 318-19 full-house calculation package — 2025 CBC / ASCE 7-22       │
├────────────── Inputs (380 px, no-print) ──────┬──────────── Report preview ──────────────────────┤
│ PROJECT  name, address, job ref, rev, by, date│ [This sheet | Full package]   (no-print toggle)  │
│          code edition, NDS edition            │ ⚠ yellow banners: unchecked items / VERIFY data  │
│ PACKAGE  (collapsible groups, PASS/FAIL/ERR)  │ ┌─────────────── 8.5 in sheet ───────────────┐   │
│  Criteria & loads ▸ Roof ▸ Floor ▸ Beams      │ │ CALC │ Project … │ Job Ref.                │   │
│  ▸ Posts ▸ Walls ▸ Lateral ▸ Connections      │ │      │ Section … │ Sheet no./rev.          │   │
│  ▸ Foundations ▸ Schedules                    │ │ STRUCTURAL BEAM DESIGN CALCULATIONS        │   │
│  each row: mark · label · PASS · ⧉ · ✕        │ │ Design basis & codes …                     │   │
│  [+ Add member] (dashed)                      │ └────────────────────────────────────────────┘   │
│ ACTIVE MEMBER  Configuration / Members /      │                                                  │
│   Loading / Load path (supported by…)         │                                                  │
└───────────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

- Same header, colour tokens, 380 px sidebar grid, flat uppercase section headings, inline field errors, and dashed "+ Add" buttons.
- Printing is blocked while any input is invalid; the view scrolls to and focuses the first invalid field (same as the source apps).
- New: package navigator with grouped member lists, "This sheet / Full package" preview toggle, autosave, and Save / Open project (JSON).

---

## 4. Code basis and default criteria

| Item | Default (edition set A) | Alternate (edition set B) |
|---|---|---|
| Building code | 2025 CBC / CRC (2024 IBC / IRC) | 2022 CBC / CRC (2021 IBC / IRC) |
| Loads | ASCE 7-22 | ASCE 7-16 |
| Wood | ANSI/AWC NDS-2024 + Supplement | NDS-2018 + Supplement |
| Wood lateral | AWC SDPWS-2021 | SDPWS-2015 |
| Concrete | ACI 318-19 | ACI 318-19 |
| Steel (optional phase) | AISC 360-22 | AISC 360-16 |
| Method | ASD for wood, connectors, soil; strength design for concrete (and steel) | same |

- The edition pairs are the same as in the existing apps. Edition-specific equations switch with the selection; for example, flat-roof snow is pf = 0.7 Ce Ct pg in ASCE 7-22 and includes Is in ASCE 7-16.
- Default Risk Category is II. Site parameters (V, exposure, pg, SDS, SD1, site class) are user inputs taken from the ASCE Hazard Tool and are printed on the criteria sheet.
- Soil defaults to presumptive values (IBC Table 1806.2), flagged "verify with geotechnical report" unless the user enters a geotechnical value.

---

## 5. Calculation modules — full-house scope

Member marks are user-editable and kept consistent across sheets and schedules. Wall marks use your level-prefixed system: `1W-1`, `2W-1`, `2W-2`, …

### 5.1 Design criteria and loads

| Sheet | Content | Reference |
|---|---|---|
| Design criteria | Codes, Risk Category, materials, soil, deflection criteria, site parameters | IBC Ch. 16, 18 |
| Dead loads | Itemised roof / floor / wall assemblies (psf), editable | ASCE 7 Table C3.1-1a |
| Live loads | Residential floors, sleeping areas, attics, decks, stairs; roof Lr with reduction | IBC Table 1607.1, ASCE 7 Ch. 4 (§4.8) |
| Snow | pf, Cs, ps, minimum roof snow, unbalanced (gable / hip), drift where applicable | ASCE 7 Ch. 7 (§7.6 unbalanced) |
| Wind — MWFRS | qh (Kz, Kzt, Ke, Kd), GCpf zones, Load Cases A / B, story forces per direction, minimum loads | ASCE 7 Ch. 26, Ch. 28 Part 1 (low-rise envelope) |
| Wind — C&C | Roof uplift and wall pressures by effective wind area, for rafters, trusses, studs and ties | ASCE 7 Ch. 30 Part 1 |
| Seismic | SDS, SD1, SDC, R, Ie, Cs (with bounds), Ta, V, Fx, Fpx, ρ, Ev — or simplified procedure | ASCE 7 Ch. 11–12 (§12.8, §12.14) |
| Load combinations | ASD (wood, soil) and strength (concrete); governing combination printed per check | ASCE 7 §2.3, §2.4, §12.4; C_D per NDS Table 2.3.2 |

### 5.2 Roof framing

| Mark | Member | Checks | Source |
|---|---|---|---|
| R-# | Rafters (pitch + run, or direct sloped span) | Bending with C_L, shear at d plus birdsmouth notch (NDS 3.4.3), bearing (3.10), live / total deflection with K_cr (3.5), overhang cantilever, ridge-board vs ridge-beam condition, uplift reaction | Port JoistCalc rafter |
| CJ-# | Ceiling joists / rafter ties | Bending and deflection (attic LL), tension from rafter thrust (3.8, 3.9.1), heel-joint nailing (NDS Ch. 12) | New |
| RB-# | Ridge / roof beams | General beam engine (5.4) | New |
| HR-# / VR-# | Hip and valley rafters | Triangular loads from jack rafters, sloped span, beam checks | New |
| T-# | Wood roof trusses | Method of joints; chord and web axial and combined checks (3.7, 3.8, 3.9); heel bearing; virtual-work deflection; joints; **plus** unbalanced snow and wind uplift cases. Option: "by truss manufacturer" — enter reactions only (deferred submittal) | Port TrussCalc |

### 5.3 Floor framing

| Mark | Member | Checks | Source |
|---|---|---|---|
| FJ-# | Sawn floor joists | JoistCalc checks, plus 2-span continuous, cantilever / backspan, point loads, pattern live load (ASCE 7 §4.3.3) | Port JoistCalc |
| TJ-# | I-joists (TJI®) | Manufacturer M / V / R / EI (ESR-1153), web stiffeners, blocking panels | Port JoistCalc TJI |
| — | Rim / squash blocks | Load transfer at bearing walls and posts | New |

### 5.4 Beams and headers — one general engine (marks B-#, H-#, FB-#, RB-#)

- **Materials:** sawn and built-up 2- to 4-ply (NDS Supp. Tables 4A / 4B / 4D), glulam (Table 5A, C_V), LVL / PSL / LSL (manufacturer ESR values), steel W-shapes in the optional phase.
- **Loads:** uniform, partial, trapezoidal and point loads; loads taken directly from other members' reactions; self-weight. All loads are carried by type (D, L, Lr, S, W, E).
- **Supports:** simple span, cantilever(s), 2–3 span continuous (matrix stiffness solver), with pattern live loading.
- **Checks:**
  - bending with C_L (NDS 3.3.3) or C_V (5.3.6);
  - shear at d (3.4.3);
  - bearing and required bearing length with C_b (3.10);
  - deflection L and D+L to IBC Table 1604.3, including K_cr (3.5.2);
  - multi-ply side-load fastening;
  - jack- and king-stud requirements for headers.
- **Output:** loading diagram, V / M / Δ diagrams (the JoistCalc `BeamDiagrams`, extended to arbitrary loads), and reactions by load type.

### 5.5 Posts and columns (P-#)

Covers sawn 4x / 6x members (Tables 4A / 4D), built-up columns (NDS 15.3, K_f), glulam and PSL. Checks:
- axial capacity with C_P (3.7.1, l_e/d ≤ 50);
- combined axial and bending (3.9.2) for eccentric or wind loads;
- end-grain bearing (3.10.1);
- bearing on plates and beams (3.10.2);
- post cap and base hardware.

### 5.6 Stud walls (1W-#, 2W-#, …)

Port of StudCalc:
- load take-down table and ASD combination table;
- C_P, axial, and combined NDS 3.9.2 with C&C wind;
- plate bearing with C_b;
- wind deflection with P-Δ (IBC Table 1604.3);
- openings — header, jack, king and cripple studs;
- stud-to-plate and sole plate connections.

New: point-load stud packs under beams and girder trusses.

### 5.7 Lateral system

| Mark | Item | Checks | Reference |
|---|---|---|---|
| LD | Lateral distribution | Wind and seismic per level and direction; flexible-diaphragm tributary distribution to shear lines; wind / seismic envelope per line | ASCE 7 §12.3.1, §12.8.3, Ch. 28 |
| RD-# / FD-# | Roof / floor diaphragms | Unit shear vs Table 4.2A (blocked / unblocked, nail size and spacing), ASD ÷ 2.0, aspect ratio, chord force and splice, collectors / drag struts (Ω0 for SDC C–F) | SDPWS §4.2; ASCE 7 §12.10.2.1 |
| SW-# | Shear walls | Segmented method; aspect-ratio limits and adjustment; Table 4.3A; one or two sides; overturning T / C with 0.6D; hold-down and sill anchorage; deflection Eq. 4.3-1 → δx = Cd δxe / Ie vs Table 12.12-1 | SDPWS §4.3; ASCE 7 §12.8.6, §12.12 |
| HD-# | Hold-downs | Device capacity (catalogue / ESR); anchor: steel, concrete breakout, pullout, side-face blowout; seismic provisions | ACI 318-19 Ch. 17 (§17.6, §17.10) |
| AB | Sill anchorage | Bolt bearing in sill (NDS 12.3), plate washers, concrete shear breakout and pryout or light-frame sill-plate provisions | SDPWS §4.3.6.4; ACI 318-19 §17.7, §17.10 |
| UP | Uplift load path | Roof uplift → rafter / truss ties → stud / plate → floor-to-floor straps → sill anchorage | ASCE 7 Ch. 28 / 30; catalogue |
| BW | Prescriptive bracing (optional) | IRC / CRC R602.10 | Port StudCalc |

### 5.8 Connections (CN-# and schedules)

| Item | Checks |
|---|---|
| NDS dowel-type connection engine | Nails, wood screws, lag screws, bolts; single and double shear; wood or steel side plates. Yield-limit equations (NDS Table 12.3.1A) with Fe from Table 12.3.3; C_D, C_M, C_t, C_g (11.3.6), C_Δ, C_eg, C_di, C_tn; withdrawal (12.2); combined lateral + withdrawal (12.4); spacing, edge and end distances (12.5) |
| Hangers | Port JoistCalc; capacity checked against each ASD combination using the matching load-duration column (100 / 115 / 125 / 160 %); uplift checked |
| Post caps and bases, hurricane ties, straps, blocking-to-plate shear clips, top-plate splices | Catalogue capacities with citation; demand from the load path |
| Ledgers | Lag / bolt / structural-screw ledger to rim (NDS Ch. 12); IRC R507 alternative |
| Heel joints | Rafter-to-ceiling-joist nailing for thrust |

### 5.9 Foundations

| Mark | Item | Checks |
|---|---|---|
| F-# | Continuous footing | Port StudCalc: service bearing (IBC 1806.2 or geotechnical value), plain-concrete flexure and shear (ACI 318-19 Ch. 14, φ = 0.60), embedment and frost (IBC 1809.4 / 1809.5). New: reinforced option (ACI Ch. 13 / 22) and comparison with IBC Table 1809.7 minimums |
| PF-# | Pad footing under posts | Bearing, one-way shear (§22.5), two-way punching (§22.6), flexure (§22.2) with As,min, bearing (§22.8), development; plain-concrete option |
| — | Shear-wall / hold-down footing | Uplift resistance (0.6D) vs hold-down tension, using the actual footing geometry in the ACI Ch. 17 anchor check; sliding and lateral bearing (IBC 1806.3) |

---

## 6. Load-path engine (the core of "full house")

- Every member result reports its support reactions **by load type** (D, L, Lr, S, W, E, and wind uplift), not as one combined total.
- A supporting member receives loads in three ways:
  - as a point load at x from member M support k;
  - as a line load from repetitive members (reaction ÷ spacing);
  - as a wall line load.
- Members are evaluated in dependency order (roof → floors → foundation). A load cycle or an unassigned reaction is reported as an error.
- Each member applies the ASCE 7 combinations to its own received loads, with C_D per combination, and reports the governing case.
- Each sheet prints two load-path tables: "Loads received" and "Reactions delivered" (Support · To member · D · L · Lr · S · W · E · max ASD down · max ASD uplift).
- A "Load path summary" sheet traces every bearing line from roof to footing.
- Auto-size option per member: the lightest passing size from the size list is reported as "Required member: …".

---

## 7. Package assembly, schedules and consistency checks

**Sheet order**
1. Cover / index of sheets
2. Design criteria
3. Gravity loads, wind, seismic
4. Roof
5. Upper floor
6. Lower floor
7. Lateral (distribution → diaphragms → shear walls → hold-downs → anchorage)
8. Connections
9. Foundations
10. Schedules
11. General structural notes

**Schedules.** All schedules are generated from the same results, so the schedules and the calc sheets cannot disagree.

| Schedule | Columns |
|---|---|
| Framing (JoistCalc cover format) | # · Mark · Member · Size / species · Spacing · Span · Load case · Gov. D/C · Result |
| Beam / header | Mark · Size / grade · Span · Bearing (L / R) · Jacks / kings · Hanger · Gov. D/C |
| Post | Mark · Size / grade · Height · Cap / base hardware · Footing · Gov. D/C |
| Wall (1W-#, 2W-#) | Mark · Stud size / grade · Spacing · Plates · Sheathing · Height · Stud ties · Sole plate · Anchorage |
| Shear wall | Mark · Sheathing · Edge / field nailing · Blocking · Sill plate · Anchor bolts · Hold-down · Plate-to-plate · Capacity |
| Hold-down | Mark · Device · Fasteners · Anchor and embedment · Min. post · Capacity · Demand · D/C |
| Connector | Location · Reaction · Connector · Capacity · D/C · Nailing (JoistCalc format, extended) |
| Footing | Mark · Width · Thickness · Reinforcement · Embedment · Bearing D/C |

**Consistency checks.** These show as on-screen banners and are also printed on one sheet:
- every reaction is assigned to a supporting member;
- every post and bearing wall has a footing;
- the post below continues the post above;
- every shear-wall segment has hold-downs at both ends;
- shear-line capacity ≥ demand;
- member marks are unique;
- hardware values not yet verified are flagged VERIFY.

---

## 8. Architecture and file structure (mirrors the source projects)

```text
src/routes/index.tsx                app shell: header, sidebar, preview
src/components/report/              report-primitives (ported), diagrams (load, V/M/Δ, wall, truss, shear wall, footing)
src/components/sheets/              one sheet component per module + Cover, Criteria, LoadPath, Schedules, Notes
src/components/editors/             one input editor per module
src/lib/core/                       fmt/units, code editions, combinations, beam stiffness solver, sections
src/lib/materials/                  NDS sawn (4A/4B/4D), glulam (5A), SCL, I-joist, concrete, soils
src/lib/loads/                      dead assemblies, live, snow, wind MWFRS, wind C&C, seismic
src/lib/members/                    rafter, ceiling joist, truss/*, joist, I-joist, beam, post, stud wall, header
src/lib/lateral/                    distribution, diaphragm, shear wall, hold-down
src/lib/connections/                NDS dowel engine, hangers, ties, ledger, ACI 318 Ch. 17 anchors, catalog data (cited)
src/lib/foundations/                strip footing, pad footing
src/lib/project/                    zod model, load-path graph, marks, validation, save/open, example house
tests/                              vitest benchmark cases per engine
```

- Everything runs in the browser, with no backend or login — same as the source apps.
- Projects are kept by autosave in the browser and by Save / Open project (JSON file).

---

## 9. Verification and QA

- **Unit tests (vitest):** every engine is tested against hand calculations and closed-form results:
  - beam solver vs wL²/8, cantilever, and 2-span continuous results;
  - truss joint-equilibrium residual and ΣR = ΣP;
  - wind and seismic worked examples.
- **Quality gates:** typecheck, lint and build pass before every push.
- **Print check:** headless Chromium print preview confirms pagination, title-block repetition and footers.
- **Example house:** a 2-story example house template opens a full package for review.

**Corrections to the source engines.** These are fixed when ported, not copied as they are.

| # | Source | Finding | Action |
|---|---|---|---|
| 1 | StudCalc `bracing.ts` | SDPWS Eq. 4.3-1 bending term carries an extra ×12 (drift overstated in that term — conservative but wrong) | Correct units: 8vh³ / (E A b) in inches |
| 2 | JoistCalc, StudCalc | Southern Pine values with NDS Table 4A size factors applied. SP values in Supplement Table 4B are already size-specific, so applying C_F overstates SP design values (unconservative) | Use Table 4B size-specific SP values |
| 3 | TrussCalc, StudCalc | Fastener values scaled by (G/0.5)^1.5 or fixed table values; plate tooth values generic | NDS 12.3 yield-limit equations; truss plates as manufacturer ESR inputs |
| 4 | StudCalc | Anchor-bolt tension and shear fixed values; no concrete breakout / pullout / pryout checks | ACI 318-19 Ch. 17 checks + NDS bolt bearing in sill |
| 5 | JoistCalc | Hanger compared to D+L only; no load-duration column; uplift not checked | Check per combination and duration column; check uplift |
| 6 | StudCalc | Braced-wall lateral load split equally between wall lines | Tributary (flexible-diaphragm) distribution |
| 7 | TrussCalc | Unbalanced snow only flagged | Compute ASCE 7 §7.6 cases |
| 8 | StudCalc | Hardware capacities (ties, angles, straps) and NDS-2024 HF / SP entries need verification against current catalogue / printed Supplement | One cited data file; unverified values print as VERIFY |

---

## 10. Phases and deliverables (each phase ends with a pushed, working build)

| Phase | Content | Done when |
|---|---|---|
| 1 — Core and gravity | Scaffold, report kit, app shell, save / open; materials, solver, combinations, load-path engine; criteria and gravity load sheets; rafters, ceiling joists, floor joists, I-joists, beams / headers, posts, stud walls, hangers, continuous and pad footings; cover, framing, beam, post, wall, footing and connector schedules | Example house prints a complete gravity package traced roof → footing, and schedules match the sheets |
| 2 — Roof trusses and uplift | Port TrussCalc (all types + custom), unbalanced snow, wind uplift case, girder reactions, hip / valley rafters, C&C uplift ties | Truss reactions drive headers / posts / footings; uplift path complete |
| 3 — Lateral | Wind MWFRS, seismic ELF / simplified, distribution, diaphragms, shear walls, hold-downs, ACI Ch. 17 anchors, shear-wall footings, drift; shear wall, hold-down and diaphragm schedules | Lateral sheets complete for both directions and both levels |
| 4 — Connections and package | NDS dowel engine for custom connections, ledgers, straps / collectors, heel joints, general structural notes, consistency-check sheet, CSV export of schedules | Full package with no unassigned loads |
| 5 — Optional | Steel W-beams and HSS / pipe posts (AISC 360-22), flitch beams, decks, retaining / basement walls, perforated / FTAO shear walls, IRC prescriptive bracing | As approved |

---

## 11. Decisions required

1. **Build location.**
   - Recommended: this GitHub repo (`sureshankiya/CAL`, branch `claude/vibrant-faraday-cteq1z`), with the same stack and layout as your Lovable apps. The engine is large and needs unit tests, which run here.
   - Alternative: a new Lovable project driven through the Lovable connector. This uses Lovable credits and leaves less control over testing.
2. **Steel beams and posts (AISC 360-22).** These are not steel trusses, so they are not excluded. Recommended: Phase 5, unless you want them in Phase 1.

## 12. Assumptions (proceeding on these unless told otherwise)

- Code editions as listed in §4, with the same defaults as the existing apps.
- Risk Category II.
- Simpson Strong-Tie is the default hardware catalogue, as in the existing apps. Every capacity carries its catalogue / ESR citation and is flagged VERIFY until confirmed.
- Site hazard values are entered by the user from the ASCE Hazard Tool; there is no automatic lookup.
- Wood roof trusses are included, both designed in the app and as manufacturer-designed (reactions entered).
- Design is member-by-member with linked load paths; plan-view drawing input is not part of v1.

## 13. Exclusions

Steel trusses, cold-formed steel, masonry (TMS 402/602), slab-on-grade design, fire-resistance design, and drawing / detail generation. Schedules are formatted for transfer to drawings.
