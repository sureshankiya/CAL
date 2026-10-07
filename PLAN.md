# HouseCalc — Wood-Frame House Structural Calculator

Merged build plan · Rev. C · 2026-10-07 · Phase 0 deliverable (for approval)

Sources merged:
- **Rev. A plan** — review of your Lovable apps JoistCalc, StudCalc and TrussCalc. STRUTURA (steel truss) is excluded.
- **BUILD_PLAN.md** — "Wood-Frame House Structural Calculator: Build Plan".
- **Your portfolio** — the five projects summarised in `UPWORK_PORTFOLIO.md` (Google Drive), which describes the work in `D:\WORK SURESH\PORTFOLIO`. The calc files in that folder are on your PC and have not been reviewed yet (§2A).

Where the sources differ, the BUILD_PLAN decisions govern. Conflicts that need your decision are in §13.

---

## Revision B — changes from Rev. A

| Item | Rev. A | Rev. B (revised) |
|---|---|---|
| Trusses | In-tool truss design (port TrussCalc) in Phase 2; manufacturer option | **Default: import manufacturer reactions and uplift** (Phase 2). In-tool truss design moves to Phase 4 |
| Drawing input | Excluded | Manual forms **plus** PDF upload with AI-assisted extraction into an editable review table. Nothing calculates until values are confirmed |
| Architecture | Client-only app | Three layers: input model, calc engine, report engine. Supporting pieces: data library, load takedown service, assumption log. TypeScript engine shared by the browser and server functions |
| Code cycles | Two edition sets | Versioned data set per code cycle. Cycle stamped on every sheet; engine and data-library versions recorded on the report |
| Outputs | Member sheets, schedules, general notes | Adds hardware schedule, specific notes, house-report table of contents and summary. DOCX / PDF choice open (§13) |
| Modules | — | Adds: max span and required spacing when a member fails, floor-vibration note, I-joist web holes, force transfer around openings (FTAO), automatic nailing / sheathing selection, shear-transfer nailing, stem walls |
| QC | Unit tests; audit of Lovable engines | Adds: regression against your hand calcs with stated tolerances, source / edition tag on every table plus a second-pass check, validation on 5–10 past permit calcs |
| Phases | Rev. A order (gravity incl. footings first) | Your Phase 0–5 structure, with Rev. A content mapped in |
| Responsibility | — | Design-aid statement on the cover and every sheet; the engineer of record (EOR) reviews and stamps |

## Revision C — changes from your portfolio

| Item | Rev. B | Rev. C (revised) |
|---|---|---|
| Code cycles | 2025 first; 2022 deferred to Phase 5 | **Both cycles from Phase 1.** Four of the five portfolio projects are on the 2022 CBC. A mixed set (e.g. 2022 CBC with ASCE 7-22, as listed for the Baily Ave ADU) is allowed only as a flagged override |
| Steel | Beams and posts optional (Phase 5) | **HSS / pipe posts with base and cap plates in core scope** (Bluebird Lane). W-beams stay optional |
| Masonry | Excluded | **CMU foundation / stem walls in scope** (San Miguel Ave, TMS 402/602). Masonry above the foundation stays excluded |
| Existing structures | Not covered | **New module (§8.9):** new / existing / existing-modified status on every member, existing-member checks under new loads, sistering, tie-ins to existing footings, field-verification notes (San Miguel, Bluebird, N Lugo) |
| Project structure | One building per project | **Several structures per project** (house + detached garage at La Presa), each with its own levels, lateral system and foundation |
| Marks | Fixed prefixes | **Configurable mark templates** matching your drawings: B101, 1SW1, 2BW1, 2W-1, F1 |
| Schedules | Structural columns only | Wall and shear-wall schedules also carry the build-up: studs, sheathing, nailing, gypsum, insulation |
| Connections | — | Adds top-plate splice straps (ST6224-type), blocking clips and ties (A35, H2.5A) to existing framing, multi-ply LVL flush-beam hangers |
| Foundation | Continuous, pad, stem wall | Adds reinforced footings with bar layout, slab-on-grade notes, and thickened-slab checks under posts |
| Lateral distribution | Flexible diaphragm | Adds an optional rigid-diaphragm distribution with torsion, to reproduce your ETABS results |

---

## 1. Decisions locked (from BUILD_PLAN)

| Topic | Decision |
|---|---|
| Code basis | Selectable per project. Each code cycle is its own versioned data set, and the cycle is stamped on every report sheet |
| Scope | Full house: gravity, trusses, connections, lateral, foundation |
| Trusses | Import manufacturer reactions by default; optional in-tool design of simple trusses |
| Drawing input | Manual forms and PDF upload with AI-assisted extraction. Extraction always lands in an editable table that you confirm |
| Output | Tedds-style report per member, plus a combined house report, hardware schedule, and general / specific notes |
| Responsibility | The tool is a design aid. The engineer of record reviews and stamps all output |

---

## 2. Source review — your Lovable workspace

| App | Lovable project | Scope found | Used in HouseCalc |
|---|---|---|---|
| JoistCalc | Structure Genius | Sawn joists, TJI joists, rafters, hangers, ledger nailing, framing-schedule cover, connector schedule | Report kit; joist / TJI / rafter engines; hanger logic; load and V / M / Δ diagrams |
| StudCalc | Stud Wall Calculator | Bearing walls, openings (header / jack / king / cripples), connections, strip footing, braced walls | Wall, header, connection, footing and bracing engines; wall elevation drawing |
| TrussCalc | Roof Truss Planner | Wood roof trusses (standard, hybrid, parallel-chord, custom) and joint connections | Truss engine for the Phase 4 in-tool truss design |
| STRUTURA | Truss Report Master | Steel truss, dark dashboard UI | **Excluded**. Its drawing-recognition server function was reviewed as a pattern only |

These three apps also serve as **regression oracles**: identical inputs must give identical results, except for the documented corrections in §12.2.

---

## 2A. Portfolio calculation inventory

Source: `UPWORK_PORTFOLIO.md` (Google Drive), which summarises the five projects in `D:\WORK SURESH\PORTFOLIO`. The calc files themselves are on your PC and have not been reviewed yet. They will confirm each sheet type and supply the regression numbers. ● = listed in your portfolio description.

| Calculation | 1 · Baily Ave ADU | 2 · La Presa house + garage | 3 · San Miguel addition | 4 · Bluebird remodel | 5 · N Lugo garage → ADU | Module |
|---|---|---|---|---|---|---|
| Code basis | 2022 CBC, ASCE 7-22 ⚑, NDS, SDPWS | 2025 CBC, ASCE 7-22, NDS-2024, SDPWS-2021 | 2022 CBC, ACI 318, NDS | 2022 CBC, ACI 318, AISC 360, NDS | 2022 CBC, NDS, SDPWS | §7 |
| Roof / ceiling framing | ● | | | | ● 2×6 CJ @ 16″ | 8.2 |
| Floor framing, I-joists | ● | ● TJI-235 @ 16″ | | | | 8.3 |
| Beams, multi-ply LVL flush beams | ● | ● B101–B103, (3) 1¾″ × 11⅞″ LVL 2.0E | | | | 8.4 |
| Wood posts | ● | ● 4×6 | | | | 8.5 |
| Steel HSS posts | | | | ● HSS 6×6×¼ | | 8.5 |
| Bearing walls | | | | ● 2BW1–2BW3 | | 8.5 |
| Lateral analysis (wind + seismic) | ● | | | | | 8.6 |
| Shear walls and schedule | ● | ● 1SW1–1SW4 | ● SW1–SW3 | ● | | 8.6 |
| Hold-downs | | ● | | | | 8.6 |
| Sill anchor bolts | | | ● 5/8″ × 10″ @ 6′-0″, 3″ × 3″ × 0.229″ washers | | | 8.6 |
| Top-plate splice straps | | | | | ● ST6224 | 8.6 / 8.7 |
| Clips and ties to existing framing | | | | | ● A35, H2.5A | 8.7 |
| Connection details | ● | ● | | | ● | 8.7 |
| Foundation design (type not stated) | ● | ● | | | | 8.8 |
| Reinforced continuous footing | | | ● 18″W × 10″D, (3) #4 T&B, #4 @ 18″ | | | 8.8 |
| CMU foundation wall | | | ● 8″ CMU | | | 8.8 |
| Isolated pad footings | | | | ● F1 24×24×12, F3 15×18, F4 48×48×18, (3) #4 cont. T&B | | 8.8 |
| Slab on grade | | | | ● | | 8.8 |
| Continuous load path to foundation | | | | ● | | §9 |
| Existing structure: tie-ins, reinforcement, field verification | | | ● | ● | ● | 8.9 |
| Second structure on the site | | ● 504 SF detached garage | | | | §4 |
| Fire-rated assemblies | | | | | ● UL U465 | §11 (notes only) |
| Software used | ETABS, Tedds, AutoCAD | ETABS, STAAD.Pro, Tedds, AutoCAD | Tedds, AutoCAD | Tedds, Enercalc, AutoCAD | Tedds, AutoCAD | — |

⚑ The 2022 CBC references ASCE 7-16. The tool flags a mixed code set like this one instead of silently accepting it.

**What the portfolio means for the tool**
- **Lateral is core.** All five sites are in Southern California (high seismic). Four projects list shear walls and N Lugo lists SDPWS, so the full chain (shear walls, hold-downs, sill anchorage) is needed from the first lateral phase.
- **Both code cycles are live.** Four projects are on the 2022 CBC and one on the 2025 CBC.
- **Existing buildings are common.** Three of five projects are additions, remodels or conversions, so new / existing status, existing-member checks and field-verification notes are core.
- **Scope beyond wood.** Steel HSS posts and CMU foundation walls appear, so AISC 360 posts and TMS 402/602 foundation walls move into scope.
- **Marks.** Your marks are level-prefixed (B101, 1SW1, 2BW1, 2W-1), so mark templates are configurable per member type.
- **I-joist series.** The portfolio lists "TJI-235". Please confirm the series so the I-joist library includes it; the series I know are TJI 110 / 210 / 230 / 360 / 560.

**Still to confirm from the calc files in `D:\WORK SURESH\PORTFOLIO`**
- exact Tedds sheet types and their order;
- wind / seismic parameters;
- whether garage-front walls use portal frames or prefabricated shear panels;
- hold-down and anchor products;
- the hand-checked numbers for the regression suite.

---

## 3. Architecture

```text
 Manual forms ─┐                                  Data library (versioned per code cycle,
               ├─► INPUT MODEL ──► CALC ENGINE ◄── source + edition on every table)
 Drawing PDF ──┘   (project JSON)  (pure TS, per          │
  → AI extraction   + provenance    code cycle)    Load takedown service
  → review table                        │          (roof → walls → posts → foundation)
  (confirm first)                       ▼
                                  REPORT ENGINE ──► member sheets → house report (TOC, summary,
                                  (no calc code)    schedules, notes) → PDF / DOCX
                                        ▲
                                  Assumption log (every default / override / drawing source)
```

- **Layer rule:** the three layers never reach into each other.
  - The input model holds data only.
  - The calc engine is pure functions with no UI and no formatting.
  - The report engine renders results and never computes.
- **Stack:** the same as your Lovable apps — TanStack Start, React 19, Vite, Tailwind v4, shadcn/ui.
  - The TypeScript calc engine runs both in the browser (live preview) and in server functions.
  - Server functions are needed only for AI extraction and, if chosen, DOCX / PDF generation.
- **Reference calcs:** an independent Python implementation of every check, written separately from the TypeScript engine (Python 3.13 is available here). It runs in the regression suite.
- **Versioning:** every report records the engine version (semver) and the data-library version, e.g. `2025-cycle v1.0`.

---

## 4. Project data model

Every input value carries **provenance**: `default` (with source), `user`, `drawing` (sheet / page, confirmed by), or `override` (replaces an automatic value). The assumption log is built from these provenance tags.

| Block | Content |
|---|---|
| Site | Address / jurisdiction, code cycle, Risk Category, wind speed and exposure, Kzt, ground elevation, SDS / SD1 / site class / SDC, ground snow, soil bearing (presumptive or geotechnical), frost depth |
| Loads | Dead-load assemblies (roof, floor, wall, ceiling) itemised in psf; live loads; snow; wind and seismic parameters; ASD / strength combinations |
| Geometry (tabular, no graphic plan editor) | Stories and heights; roof planes (pitch, spans, overhangs, asymmetric spans); floor areas; wall lines (location, length, level); openings |
| Structures | One or more per project (e.g. house + detached garage or ADU). Each has its own levels, lateral system and foundation; site data and code cycle are shared |
| Members | Mark (from the configurable template), type, status (new / existing / existing-modified, with field-verification notes), species / grade or product, size, spacing, span, supports, tributary width, loads |
| Connections | Load-path entries linking a member's support to its supporting member and the connector chosen |
| Lateral | Wall lines, shear-wall segments, diaphragm panels, hold-down locations |
| Truss import | Manufacturer truss marks, spacing, bearing locations, reactions by load type (D, Lr / S, W uplift), girder point loads |

---

## 5. Report output — style copied from JoistCalc / StudCalc / TrussCalc

| Element | Specification |
|---|---|
| Page | US Letter; margins 0.55 / 0.6 / 0.7 / 0.6 in; Arial; black on white |
| Title block (repeats every page) | `CALC` · Project · Job Ref. / Section · Sheet no./rev. / Calc. by · Date · Chk'd by · Date · App'd by · Date |
| Sheet title | 13 pt bold uppercase centred, e.g. `STRUCTURAL BEAM DESIGN CALCULATIONS (NDS-2024)` |
| Subtitle | 9.5 pt italic — standard, method, code cycle, "member n of N: mark" |
| Calc rows | Description (55 %) · `F_b' = F_b × C_D × … = **1,186.3 lb/in²**` · bold-italic PASS / FAIL |
| Verdict lines | Right-aligned bold italic: `PASS — Design bending stress exceeds actual bending stress` |
| Tables | Summary table (Check · Demand · Capacity · D/C · Result); data tables (load take-down, combinations, member forces); 1 px black borders |
| Adjustment-factor table (new) | Every factor printed, including those equal to 1.00: rows C_D, C_M, C_t, C_L, C_F, C_fu, C_i, C_r, C_P, C_b, C_V, K_f; columns Fb · Ft · Fv · Fc · Fc⊥ · E · Emin |
| Diagrams | Black-and-white SVG line drawings only: loading, V / M / Δ grid, wall elevation, truss, shear wall, footing |
| Result block | `MEMBER ADEQUATE — ALL CHECKS PASS`, plus "Required member: …" and the governing D/C |
| FAIL alternatives (new) | When a member fails, the sheet prints: maximum allowable span at the given spacing, required spacing at the given span, and the lightest passing size |
| Footer | Left: "Project — Section" · Centre: "Rev. x \| date \| code cycle" · Right: "Page n of N" |
| Code-cycle stamp | In the Design-basis block of every sheet, with engine and data-library versions, and in the footer |
| Overrides | Manual overrides and VERIFY data print in red #c00000 — the only colour used |
| Design-aid statement | Cover, and the last note of every sheet: output valid only when reviewed and stamped by the EOR |

**Member sheet sequence**
1. Title block, sheet title and subtitle
2. Design basis & codes (code-cycle stamp)
3. Configuration & geometry (+ diagram)
4. Material properties and adjustment-factor table
5. Design assumptions
6. Applied loading (+ diagram), load take-down table, combination table
7. Load path: loads received / reactions delivered
8. Analysis (+ V / M / Δ)
9. Strength checks
10. Serviceability
11. Stability
12. Governing summary + governing combination
13. Result / required member / FAIL alternatives
14. Final design summary
15. Assumptions & overrides (from the log)
16. Specific notes
17. Notes & limitations

---

## 6. Application UI (copied from the source apps)

```text
┌ HouseCalc ──────────────────────────────────────────── [Save] [Open] [Print / Save PDF] ┐
│ NDS-2024 · SDPWS-2021 · ACI 318-19 house calculation package — 2025 CBC / ASCE 7-22     │
├──────────── Inputs (380 px) ─────────┬─────── [ Report | Drawings | Review table ] ───────┤
│ PROJECT / SITE / CODE CYCLE          │ Report: 8.5 in sheets, "This sheet | Full package"│
│ PACKAGE navigator (grouped lists,    │ Drawings: PDF pages, sheet map, source tagging     │
│   mark · label · PASS · ⧉ · ✕,       │ Review: extracted rows, confidence, confirm / edit │
│   dashed "+ Add" buttons)            │ ⚠ banners: unconfirmed values, VERIFY data,        │
│ ACTIVE MEMBER: configuration /       │   unassigned reactions, judgement flags            │
│   members / loading / load path      │                                                    │
└──────────────────────────────────────┴────────────────────────────────────────────────────┘
```

The following match the source apps:
- header, colour tokens, 380 px sidebar, flat uppercase section headings;
- inline field errors;
- printing blocked until inputs are valid, with focus jumping to the first invalid field.

New in HouseCalc: the package navigator, the right-pane switch (no-print), autosave, and Save / Open project (JSON).

---

## 7. Code basis — versioned code cycles

| Item | 2025 cycle (default for new permits) | 2022 cycle (projects submitted under it) |
|---|---|---|
| Building code | 2025 CBC / CRC (2024 IBC / IRC) | 2022 CBC / CRC (2021 IBC / IRC) |
| Loads | ASCE 7-22 | ASCE 7-16 |
| Wood | ANSI/AWC NDS-2024 + Supplement | NDS-2018 + Supplement |
| Wood lateral | AWC SDPWS-2021 | SDPWS-2015 |
| Concrete | ACI 318-19 | ACI 318-19 |
| Masonry (CMU foundation walls) | TMS 402/602-22 | TMS 402/602-16 |
| Steel (HSS / pipe posts, base plates) | AISC 360-22 | AISC 360-16 |
| Method | ASD for wood, connectors, soil; strength design for concrete; ASD or LRFD for steel | same |

- Both cycles are populated in Phase 1: four of your five portfolio projects are on the 2022 CBC. A mixed set (for example 2022 CBC with ASCE 7-22) is allowed only as a flagged override.
- Each cycle is a separate data set. Every table carries its source document, edition, table number and entry check status.
- Edition-specific equations switch with the cycle. Example: flat-roof snow is pf = 0.7 Ce Ct pg in ASCE 7-22 and includes Is in ASCE 7-16.
- Defaults: Risk Category II. Site hazard values are entered from the ASCE Hazard Tool. Soil defaults to presumptive values (IBC Table 1806.2), flagged "verify with geotechnical report".

---

## 8. Calculation modules

Marks come from configurable templates that match your drawings — B101 (level + sequence), 1SW1, 2BW1, 2W-1, F1 — and are kept identical across sheets, schedules and notes. The prefixes shown below are defaults.

### 8.1 Criteria and loads

| Sheet | Content | Reference |
|---|---|---|
| Design criteria | Codes, Risk Category, materials, soil, deflection criteria, site parameters | IBC Ch. 16, 18 |
| Dead loads | Itemised assemblies, editable | ASCE 7 Table C3.1-1a |
| Live loads | Floors, sleeping areas, attics, decks, stairs; roof Lr with reduction | IBC Table 1607.1; ASCE 7 Ch. 4 |
| Snow | pf, Cs, ps, minimum, unbalanced (gable / hip), drift | ASCE 7 Ch. 7 |
| Wind — MWFRS | qh, GCpf zones, Load Cases A / B, story forces, minimum loads | ASCE 7 Ch. 26, Ch. 28 Part 1 |
| Wind — C&C | Roof uplift and wall pressure by effective wind area | ASCE 7 Ch. 30 Part 1 |
| Seismic | SDS, SD1, SDC, R, Ie, Cs, V, Fx, Fpx, ρ, Ev; or simplified procedure | ASCE 7 Ch. 11–12 (§12.8, §12.14) |
| Combinations | ASD and strength; governing combination printed on every check | ASCE 7 §2.3, §2.4, §12.4; C_D per NDS Table 2.3.2 |

### 8.2 Roof framing

| Mark | Member | Checks |
|---|---|---|
| R-# | Rafters | Bending with C_L; shear at d and birdsmouth notch (NDS 3.4.3); bearing (3.10); live / total deflection with K_cr (3.5); overhang; ridge / thrust effects; uplift reaction; **max span / required spacing when failing** |
| CJ-# | Ceiling joists / rafter ties | Bending, deflection, tension from thrust (3.8, 3.9.1), heel-joint nailing (NDS Ch. 12) |
| RB-# | Ridge / roof beams | General beam engine (8.4) |
| HR-# / VR-# | Hip and valley rafters | Triangular jack-rafter loads, sloped span, beam checks |
| T-# | Trusses — **import (default)** | Manufacturer reactions and uplift by load type, girder point loads → bearing walls, headers, hangers and ties are checked |
| T-# | Trusses — in-tool (Phase 4) | Port of TrussCalc: method of joints, member and combined checks, heel bearing, deflection, joints, plus unbalanced snow and uplift cases |

### 8.3 Floor framing

| Mark | Member | Checks |
|---|---|---|
| FJ-# | Sawn joists | Bending, shear at d, bearing, deflection with K_cr; continuous, cantilever and point-load cases; pattern live load (ASCE 7 §4.3.3); floor-vibration note; max span / required spacing |
| TJ-# | I-joists | Manufacturer M / V / R / EI (ESR-1153), web stiffeners, blocking, **web-hole limits from the manufacturer chart**, manufacturer span / deflection limits |
| — | Rim / squash blocks | Load transfer at bearing walls and posts |

### 8.4 Headers and beams — one general engine (H-#, B-#, FB-#, RB-#)

- **Materials:** sawn and built-up (Supplement Tables 4A / 4B / 4D), glulam (Table 5A, C_V), LVL / PSL / LSL (manufacturer ESR).
- **Loads:** uniform, partial, trapezoidal and point loads; loads from other members' reactions; self-weight. Loads are carried by type (D, L, Lr, S, W, E).
- **Supports:** simple, cantilever, 2–3 span continuous (stiffness solver), with pattern live load.
- **Checks:**
  - bending with lateral stability (C_L, NDS 3.3.3) or C_V (5.3.6);
  - shear at d (3.4.3);
  - bearing and required bearing length (3.10);
  - deflection to IBC Table 1604.3 with K_cr;
  - multi-ply side-load fastening;
  - jack and king studs at headers.

### 8.5 Studs, walls and posts

| Mark | Member | Checks |
|---|---|---|
| 1W-#, 2W-#, 2BW# | Stud / bearing walls | Port of StudCalc: take-down, ASD combinations, axial with C_P, combined NDS 3.9.2 with C&C wind, plate bearing (C_b), wind deflection with P-Δ, openings (headers / jacks / kings / cripples), stud and sole-plate connections, point-load stud packs |
| P-# | Posts | Axial with C_P (3.7.1), combined (3.9.2), end-grain bearing (3.10.1), bearing on plates / beams (3.10.2), built-up columns (NDS 15.3, K_f), cap and base hardware |
| SP-# | Steel posts — HSS / pipe | AISC 360 Ch. E compression and Ch. H combined; base plate (concrete bearing per AISC 360 J8, plate bending per AISC Design Guide 1); anchor rods (ACI 318 Ch. 17); cap plate and bolts to the wood beam (NDS Ch. 12, steel side plate) |

### 8.6 Lateral

| Mark | Item | Checks |
|---|---|---|
| LD | Story forces and distribution | Wind and seismic per level and direction; flexible-diaphragm tributary distribution to wall lines (default) or rigid-diaphragm distribution with torsion (option, to reproduce ETABS results); wind / seismic envelope per line (ASCE 7 §12.3.1, §12.8.3, Ch. 28) |
| RD-# / FD-# | Diaphragms | Unit shear vs SDPWS Table 4.2A, ASD ÷ 2.0, aspect ratio, chord force and splice, collector force (Ω0 for SDC C–F, ASCE 7 §12.10.2.1) |
| SW-# | Shear walls | Segmented and **FTAO** methods; SDPWS Table 4.3A with **automatic sheathing / nailing selection**; aspect-ratio limits and adjustment; one or two sides; overturning (0.6D); deflection Eq. 4.3-1 → δx = Cd δxe / Ie vs ASCE 7 Table 12.12-1 |
| HD-# | Hold-downs | Catalogue capacity (with ESR number); anchor per ACI 318-19 Ch. 17 (steel, breakout, pullout, side-face blowout, §17.10 seismic) |
| AB | Sill plate and anchor bolts | Bolt bearing in the sill (NDS 12.3), plate washers (SDPWS §4.3.6.4), concrete shear checks or the light-frame sill-plate provisions (ACI 318-19 §17.7, §17.10) |
| ST | Shear transfer and splices | Diaphragm to wall top plate, blocking / rim to plate (A35-type clips), sole plate to framing below, top-plate splices and chord / collector straps (ST6224-type) checked against chord and collector forces |
| UP | Uplift load path | Roof uplift → rafter / truss ties → stud / plate → floor-to-floor straps → sill anchorage |

### 8.7 Connections

| Item | Basis |
|---|---|
| Nails, wood screws, lags, bolts | NDS yield-limit equations (Table 12.3.1A, Fe from Table 12.3.3); C_D, C_M, C_t, C_g, C_Δ, C_eg, C_di, C_tn; withdrawal (12.2); combined lateral + withdrawal (12.4); spacing, edge and end distance (12.5) |
| Hangers, hurricane ties, post caps / bases, straps, hold-downs | Catalogue capacities with report numbers; checked per ASD combination using the matching load-duration column; uplift checked |
| Ledgers | Lag / bolt / structural-screw ledger to rim (NDS Ch. 12); IRC R507 alternative |
| Heel joints | Rafter-to-ceiling-joist nailing for thrust |

### 8.8 Foundation

| Mark | Item | Checks |
|---|---|---|
| F-# | Continuous footings | Service bearing (IBC 1806.2 or geotechnical value); plain concrete (ACI 318-19 Ch. 14, φ = 0.60) or reinforced (Ch. 13 / 22) with bar layout (e.g. (3) #4 top and bottom, #4 @ 18″ transverse); embedment and frost (IBC 1809.4 / 1809.5); IBC Table 1809.7 minimums |
| PF-# | Spread (pad) footings | Bearing, one-way shear (§22.5), two-way punching (§22.6), flexure (§22.2), As,min, bearing (§22.8), development |
| SW-F | Stem walls — concrete or CMU | Concrete (ACI 318) or CMU (TMS 402/602): bearing, out-of-plane load from retained soil, reinforcement and seismic minimums, anchor-bolt embedment and edge distance (ACI 318 Ch. 17 / TMS 402 anchor bolts), sill-plate anchorage |
| SOG | Slab on grade | Notes (thickness, reinforcement, vapour retarder) and thickened-slab / pad check under posts and point loads |
| — | Hold-down / shear-wall footings | Uplift resistance (0.6D) vs hold-down tension; anchor checks use the actual footing geometry; sliding and lateral bearing (IBC 1806.3) |

### 8.9 Existing structures (additions, remodels, conversions)

| Item | Content |
|---|---|
| Member status | Every member is New, Existing or Existing-modified. Existing members carry assumed properties (species / grade, size, condition), each tagged "field verify" until confirmed |
| Existing-member checks | Existing joists, rafters, beams, walls and footings are re-checked for the new loads on the same calc sheets; each sheet states assumed vs verified values |
| Reinforcement | Sistered members (load sharing and connecting fasteners per NDS Ch. 12), added blocking, new ties to existing framing |
| Tie-ins to existing concrete | Drilled dowels and post-installed adhesive anchors (ACI 318 Ch. 17 with manufacturer ESR bond values) at new-to-existing footing joints and infill walls |
| Field-verification notes | Generated per member and collected into the specific notes |

---

## 9. Load takedown service

- Every result reports support reactions **by load type** (D, L, Lr, S, W, E, wind uplift).
- Supporting members receive loads in three ways:
  - point loads from a member's support;
  - line loads from repetitive members (reaction ÷ spacing);
  - wall line loads.
- Truss imports enter the graph the same way.
- Evaluation runs in dependency order: roof → upper walls → floors → lower walls / posts → foundation. A load cycle or an unassigned reaction is an error, never silently dropped.
- Each member combines its own received loads per ASCE 7, applying C_D per combination.
- Every sheet prints "Loads received" and "Reactions delivered" tables. A load-path summary sheet traces each bearing line from roof to footing.
- Auto-size reports "Required member: …"; back-calculation reports max span and required spacing.

---

## 10. Drawing input — AI-assisted extraction

**Workflow** (BUILD_PLAN §5, with implementation detail)

1. **Upload** the PDF set. It stays in the browser until you start extraction.
2. **Page mapping:** pdf.js reads each page's vector text layer. Sheet number and title are taken from the title-block text where present; AI classifies the remaining pages (floor / roof / framing / foundation plan, sections, details, notes, schedules).
3. **Rasterise:** low resolution for layout; high-resolution tiles where dimensions and callouts must be legible.
4. **Extract** candidates into the review table. Each row has: category (sheet info / dimension / member callout / load / note / code citation), extracted text, normalised value and units, target field, source sheet and page with a crop, a confidence flag, and evidence text. For CAD-generated PDFs, the exact vector-text strings are used; the AI only associates them with members, so OCR misreads are avoided.
5. **Confirm:** you confirm, edit or reject every row. The calc engine refuses any field whose provenance is "drawing — unconfirmed". The assumption log prints the source sheet / page of every drawing-sourced value.
6. **Flags:** conflicting code-edition citations, member size differing between plan / schedule / calc, undefined loads, dimension strings that do not sum to overall dimensions, missing spacing.

**AI service**
- **Model and SDK:** Claude Opus 5.5 (`claude-opus-5-5`) through the official Anthropic TypeScript SDK, called from a TanStack Start server function.
- **API key:** `ANTHROPIC_API_KEY` is stored as a server environment secret. It never reaches the browser or the repo.
- **Inputs:**
  - PDF sent as a document block (limits 32 MB per request, 600 pages) or uploaded once with the Files API and reused across passes;
  - high-resolution tiles sent as image blocks.
- **Outputs:** structured outputs (JSON schema generated from the review-row schema); every row is validated before entering the table.
- **Prompt caching:** the drawing set is the cached prefix and per-pass instructions follow it, so the page-map, framing, loads and notes passes reuse it.
- **Reliability:** the refusal fallback setting is enabled.
- **Cost:** cost per drawing set is measured in Phase 4 and shown before each run. Extraction runs only when you start it, and uploaded files are deleted afterwards.

---

## 11. House report, schedules, notes and consistency checks

**House report order**
1. Cover (design-aid statement, EOR block, code cycle, engine / data versions)
2. Table of contents
3. Summary table (every member: mark, size, gov. D/C, result)
4. Design criteria
5. Loads
6. Roof
7. Upper floor
8. Lower floor
9. Lateral
10. Connections
11. Foundation
12. Schedules
13. General notes
14. Specific notes
15. Assumption log

**Schedules.** All schedules are generated from the same results, so they cannot disagree with the sheets.

| Schedule | Columns |
|---|---|
| Framing | # · Mark · Member · Size / species · Spacing · Span · Load case · Gov. D/C · Result |
| Beam / header | Mark · Size / grade · Span · Bearing (L / R) · Jacks / kings · Hanger · Gov. D/C |
| Post | Mark · Size / grade · Height · Cap / base · Footing · Gov. D/C |
| Wall (1W-#, 2W-#, 2BW#) | Mark · Stud size / grade · Spacing · Plates · Sheathing · Gypsum / finish · Insulation · Height · Ties · Sole plate · Anchorage |
| Shear wall (1SW1, SW1) | Mark · Studs · Sheathing · Edge / field nailing · Blocking · Gypsum / finish · Insulation · Sill plate · Anchor bolts · Hold-down · Plate-to-plate · Capacity |
| Hold-down | Mark · Device · Fasteners · Anchor / embedment · Min. post · Capacity · Demand · D/C |
| **Hardware (consolidated)** | Model · Quantity · Fasteners · Locations (marks) · Capacity · Catalogue / ESR report no. |
| Footing | Mark · Width · Thickness · Reinforcement · Embedment · Bearing D/C |

**Notes generator**
- General notes: codes, design loads, materials, fastening, special inspection, deferred submittals (trusses), and fire-rated assembly references (e.g. UL U465) — referenced only, not designed.
- Specific notes: one or more per member, e.g. blocking at bearing, web stiffeners required, verify existing.

**Judgement flags** — the tool flags these and does not decide them:
- ASCE 7 horizontal / vertical irregularities;
- hillside or stepped foundations;
- discontinuous shear walls;
- cantilevered floors carrying bearing walls;
- open-front diaphragms;
- heavy point loads on non-aligned framing.

**Consistency checks**
- every reaction assigned;
- footing under every post and bearing wall;
- post above aligns with post below;
- hold-downs at both segment ends;
- line capacity ≥ demand;
- unique marks;
- no VERIFY data left in an issued report.

---

## 12. Verification and QC

### 12.1 QC process

- **Regression suite:** every module is checked against:
  - closed-form results;
  - the Lovable apps for identical inputs;
  - the independent Python reference calcs;
  - the hand calcs you supply.
- **Proposed tolerances:** forces, stresses, capacities and D/C within ±0.5 %; deflections within ±1 %; selected sizes and hardware identical.
- **Data entry:** every code and catalogue table is entered from the source document, with source and edition recorded beside it. A second pass re-enters or spot-checks every value. Unverified values print as VERIFY.
- **Inputs:** unit and range checks on every input (span, spacing, species, pitch, loads).
- **Every sheet prints** the code cycle, governing combination and all adjustment factors.
- **Build checks:** typecheck, lint, unit tests and a headless-Chromium print check run before every push.
- **Release:** validation on 5–10 of your past permit calcs; engine and data-library versions are then locked.

### 12.2 Corrections to the Lovable engines (fixed when ported, not copied)

| # | Source | Finding | Action |
|---|---|---|---|
| 1 | StudCalc `bracing.ts` | SDPWS Eq. 4.3-1 bending term carries an extra ×12, so that term is 12× too large (conservative but wrong) | Correct to 8vh³ / (EAb) in inches |
| 2 | JoistCalc, StudCalc | Southern Pine values with Table 4A size factors applied. SP values in Table 4B are size-specific, so this **overstates SP capacity** (unconservative) | Use Table 4B values |
| 3 | TrussCalc, StudCalc | Fastener values scaled by (G/0.5)^1.5 or fixed values; generic truss-plate values | NDS 12.3 yield equations; truss plates as manufacturer ESR inputs |
| 4 | StudCalc | Anchor-bolt capacities fixed; no concrete breakout / pullout / pryout checks | ACI 318-19 Ch. 17 checks plus NDS bolt bearing in the sill |
| 5 | JoistCalc | Hanger checked at D+L only; no load-duration column; uplift unchecked | Check per combination and duration; check uplift |
| 6 | StudCalc | Lateral load split equally between braced-wall lines | Tributary distribution |
| 7 | TrussCalc | Unbalanced snow only flagged | Computed per ASCE 7 §7.6 |
| 8 | StudCalc | Hardware values and NDS-2024 HF / SP entries need verification | Cited data library; VERIFY until checked |

---

## 13. Conflicts and open decisions (recommendation first)

| # | Topic | Conflict / question | Recommendation |
|---|---|---|---|
| 1 | Where it is built and runs (BUILD_PLAN §9.4) | This GitHub repo vs a new Lovable project | **This repo** (`sureshankiya/CAL`), with the same stack as your Lovable apps. It can be deployed to any Node-capable host, which AI extraction requires. Alternative: Lovable, using Lovable Cloud and its AI gateway as STRUTURA does |
| 2 | Report format (BUILD_PLAN §9.5) | DOCX, PDF or both | **PDF from Phase 1** (browser print, identical to your Lovable apps); **DOCX export in Phase 4** if you want editable files |
| 3 | Drawing-input timing | BUILD_PLAN §1 says "from the start", but §7 puts extraction in Phase 4 | **Phase 1:** PDF upload, viewer, source tagging and review-table mechanism (manual). **Phase 4:** AI extraction fills the same table |
| 4 | Footing timing | Phase 2 exit is "roof → foundation", but the foundation module is in Phase 4 | **Phase 2:** port continuous and pad footings (the code exists in StudCalc). **Phase 4:** stem walls and shear-wall / hold-down footings |
| 5 | Second code cycle | Both cycles at once lengthens the build (BUILD_PLAN §8) | **Resolved by the portfolio:** four of five projects use the 2022 CBC, so both cycles are populated in Phase 1 |
| 6 | Steel (AISC 360) | Not steel trusses, so not excluded | **HSS / pipe posts in core scope** (Phase 2, Bluebird Lane). W-beams optional (Phase 5) |

---

## 14. Phases and exit criteria (your structure, Rev. A content mapped in)

| Phase | Work | Exit criterion |
|---|---|---|
| 0 | This merged spec; data-model schema; report layout (captured from your Lovable apps); code-cycle list; regression case list | Spec approved by you |
| 1 | Scaffold and UI shell; input model with provenance, structures and mark templates; assumption log; data library (**2025 and 2022 cycles**, tagged); combinations; beam solver; report engine (sheets, cover, TOC, summary); project / site / criteria / loads sheets; rafters, ceiling joists, floor joists, I-joists, headers, beams (incl. multi-ply LVL), ridge beams; max span / required spacing / required size; PDF viewer and manual review table (if #3 accepted) | Reproduces JoistCalc results and your portfolio joist / rafter / beam sheets within tolerance |
| 2 | Stud and bearing walls, wood posts, **steel HSS posts with base / cap plates**, load takedown service, truss reaction import (+ uplift), hangers, ties, post caps / bases; **new / existing status and existing-member checks**; continuous and pad footings (if #4 accepted); framing / beam / post / wall / connector / footing schedules | Gravity load path roof → foundation on a test house |
| 3 | Wind and seismic, distribution (flexible + rigid option), diaphragms, shear walls (segmented + FTAO, automatic nailing selection), drift, hold-downs, anchors, sill plates, shear transfer and **top-plate splices / straps**, uplift path; shear-wall / hold-down / diaphragm schedules | Matches your hand-checked lateral calcs on two portfolio houses (e.g. Baily Ave ADU, La Presa) |
| 4 | **Concrete and CMU stem walls**, reinforced footings, slab-on-grade notes, **tie-ins to existing concrete**, hold-down footings; AI extraction into the review table; hardware schedule; general / specific notes generator; full house report; in-tool truss design (port TrussCalc); DOCX export (if #2 accepted) | Full report from drawings for one real past project (e.g. San Miguel addition or Bluebird remodel) |
| 5 | Validation on 5–10 past projects, fixes, locked versions; optional steel W-beams, decks, retaining walls | Sign-off checklist complete |

Each phase ends with a pushed, working build that you can use.

---

## 15. Risks

| Risk | Control |
|---|---|
| Scope (full house, two cycles, AI extraction, trusses) | Phasing; second cycle and in-tool truss design deferred |
| Data accuracy | Source / edition tags; second-pass entry check; VERIFY flags block issue |
| Extraction errors (misread dimensions) | Vector text preferred over OCR; mandatory confirmation; nothing calculates unconfirmed |
| Judgement items (irregular structures, unusual load paths, hillside) | Flagged for the EOR, never decided by the tool |
| Proprietary data (hardware, I-joists, SCL, truss plates) | Current manufacturer documents only, with report numbers; VERIFY until checked |
| AI cost and data handling | Run only on demand; cost shown before the run; files deleted after extraction |

---

## 16. Needed from you

1. **Report layout:** confirm that the JoistCalc / StudCalc / TrussCalc sheet format is the target. If it is not, send sample Tedds reports.
2. **Your portfolio calc files** from `D:\WORK SURESH\PORTFOLIO` (Tedds reports and hand-checked results). This cloud session cannot read your PC's drives: copy the folder into Google Drive, attach the PDFs here, or open a Claude session on your PC in that folder. 2–3 projects are needed for the Phase 1–3 regression, and 5–10 for Phase 5 validation.
3. **Typical house types:** stories, slab-on-grade vs raised floor, roof types, typical spans and hardware.
4. **Answers to the decisions in §13** — "accept recommendations" is enough.
5. **Phase 4 only:** an Anthropic API key, entered by you directly in the hosting environment. Do not paste keys into chat.

## 17. Exclusions

Steel trusses, cold-formed steel, masonry above the foundation, structural slab design (slab on grade is covered by notes and thickened-slab checks), fire-resistance design (UL assemblies are referenced in notes only), and drawing / detail production. Schedules and notes are formatted for transfer to drawings.
