# HouseCalc — Wood-Frame House Structural Calculator

Merged build plan · Rev. B · 2026-10-07 · Phase 0 deliverable (for approval)

Sources merged:
- **Rev. A plan** — review of your Lovable apps JoistCalc, StudCalc and TrussCalc. STRUTURA (steel truss) is excluded.
- **BUILD_PLAN.md** — "Wood-Frame House Structural Calculator: Build Plan".

Where the two differ, the BUILD_PLAN decisions govern. Conflicts that need your decision are in §13.

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
| Members | Mark, type, species / grade or product, size, spacing, span, supports, tributary width, loads |
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

| Item | 2025 cycle (default) | 2022 cycle (alternate) |
|---|---|---|
| Building code | 2025 CBC / CRC (2024 IBC / IRC) | 2022 CBC / CRC (2021 IBC / IRC) |
| Loads | ASCE 7-22 | ASCE 7-16 |
| Wood | ANSI/AWC NDS-2024 + Supplement | NDS-2018 + Supplement |
| Wood lateral | AWC SDPWS-2021 | SDPWS-2015 |
| Concrete | ACI 318-19 | ACI 318-19 |
| Steel (optional) | AISC 360-22 | AISC 360-16 |
| Method | ASD for wood, connectors, soil; strength design for concrete | same |

- Each cycle is a separate data set. Every table carries its source document, edition, table number and entry check status.
- Edition-specific equations switch with the cycle. Example: flat-roof snow is pf = 0.7 Ce Ct pg in ASCE 7-22 and includes Is in ASCE 7-16.
- Defaults: Risk Category II. Site hazard values are entered from the ASCE Hazard Tool. Soil defaults to presumptive values (IBC Table 1806.2), flagged "verify with geotechnical report".

---

## 8. Calculation modules

Marks are user-editable and kept identical across sheets, schedules and notes. Wall marks follow your system: 1W-1, 2W-1, 2W-2, …

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
| 1W-#, 2W-# | Stud walls | Port of StudCalc: take-down, ASD combinations, axial with C_P, combined NDS 3.9.2 with C&C wind, plate bearing (C_b), wind deflection with P-Δ, openings (headers / jacks / kings / cripples), stud and sole-plate connections, point-load stud packs |
| P-# | Posts | Axial with C_P (3.7.1), combined (3.9.2), end-grain bearing (3.10.1), bearing on plates / beams (3.10.2), built-up columns (NDS 15.3, K_f), cap and base hardware |

### 8.6 Lateral

| Mark | Item | Checks |
|---|---|---|
| LD | Story forces and distribution | Wind and seismic per level and direction; flexible-diaphragm tributary distribution to wall lines; wind / seismic envelope per line (ASCE 7 §12.3.1, §12.8.3, Ch. 28) |
| RD-# / FD-# | Diaphragms | Unit shear vs SDPWS Table 4.2A, ASD ÷ 2.0, aspect ratio, chord force and splice, collector force (Ω0 for SDC C–F, ASCE 7 §12.10.2.1) |
| SW-# | Shear walls | Segmented and **FTAO** methods; SDPWS Table 4.3A with **automatic sheathing / nailing selection**; aspect-ratio limits and adjustment; one or two sides; overturning (0.6D); deflection Eq. 4.3-1 → δx = Cd δxe / Ie vs ASCE 7 Table 12.12-1 |
| HD-# | Hold-downs | Catalogue capacity (with ESR number); anchor per ACI 318-19 Ch. 17 (steel, breakout, pullout, side-face blowout, §17.10 seismic) |
| AB | Sill plate and anchor bolts | Bolt bearing in the sill (NDS 12.3), plate washers (SDPWS §4.3.6.4), concrete shear checks or the light-frame sill-plate provisions (ACI 318-19 §17.7, §17.10) |
| ST | Shear-transfer nailing | Diaphragm to wall top plate, blocking / rim to plate, sole plate to framing below, plate splices |
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
| F-# | Continuous footings | Service bearing (IBC 1806.2 or geotechnical value); plain concrete (ACI 318-19 Ch. 14, φ = 0.60) or reinforced (Ch. 13 / 22); embedment and frost (IBC 1809.4 / 1809.5); IBC Table 1809.7 minimums |
| PF-# | Spread (pad) footings | Bearing, one-way shear (§22.5), two-way punching (§22.6), flexure (§22.2), As,min, bearing (§22.8), development |
| SW-F | Stem walls | Bearing, reinforcement, anchor-bolt embedment and edge distance (ACI Ch. 17), sill-plate anchorage |
| — | Hold-down / shear-wall footings | Uplift resistance (0.6D) vs hold-down tension; anchor checks use the actual footing geometry; sliding and lateral bearing (IBC 1806.3) |

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
| Wall (1W-#, 2W-#) | Mark · Stud size / grade · Spacing · Plates · Sheathing · Height · Ties · Sole plate · Anchorage |
| Shear wall | Mark · Sheathing · Edge / field nailing · Blocking · Sill plate · Anchor bolts · Hold-down · Plate-to-plate · Capacity |
| Hold-down | Mark · Device · Fasteners · Anchor / embedment · Min. post · Capacity · Demand · D/C |
| **Hardware (consolidated)** | Model · Quantity · Fasteners · Locations (marks) · Capacity · Catalogue / ESR report no. |
| Footing | Mark · Width · Thickness · Reinforcement · Embedment · Bearing D/C |

**Notes generator**
- General notes: codes, design loads, materials, fastening, special inspection, deferred submittals (trusses).
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
| 5 | Second code cycle | Both cycles at once lengthens the build (BUILD_PLAN §8) | **2025 cycle first**; 2022 cycle data set in Phase 5, unless current projects need it now |
| 6 | Steel beams / posts (AISC 360) | Not steel trusses, so not excluded | Phase 5 optional |

---

## 14. Phases and exit criteria (your structure, Rev. A content mapped in)

| Phase | Work | Exit criterion |
|---|---|---|
| 0 | This merged spec; data-model schema; report layout (captured from your Lovable apps); code-cycle list; regression case list | Spec approved by you |
| 1 | Scaffold and UI shell; input model with provenance; assumption log; data library (2025 cycle, tagged); combinations; beam solver; report engine (sheets, cover, TOC, summary); project / site / criteria / loads sheets; rafters, ceiling joists, floor joists, I-joists, headers, beams, ridge beams; max span / required spacing / required size; PDF viewer and manual review table (if #3 accepted) | Reproduces JoistCalc results and your sample joist / rafter reports within tolerance |
| 2 | Stud walls, posts, load takedown service, truss reaction import (+ uplift), hangers, ties, post caps / bases; continuous and pad footings (if #4 accepted); framing / beam / post / wall / connector / footing schedules | Gravity load path roof → foundation on a test house |
| 3 | Wind and seismic, distribution, diaphragms, shear walls (segmented + FTAO, automatic nailing selection), drift, hold-downs, anchors, sill plates, shear-transfer nailing, uplift path; shear-wall / hold-down / diaphragm schedules | Matches your hand-checked lateral calcs on two test houses |
| 4 | Stem walls and hold-down footings; AI extraction into the review table; hardware schedule; general / specific notes generator; full house report; in-tool truss design (port TrussCalc); DOCX export (if #2 accepted) | Full report from drawings for one real past project |
| 5 | Validation on past projects, fixes, locked versions; 2022 cycle (if #5 accepted); optional steel beams / posts | Sign-off checklist complete |

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
2. **Hand-checked calcs:** 2–3 past permit calcs for the Phase 1–3 regression, and 5–10 for Phase 5 validation.
3. **Typical house types:** stories, slab-on-grade vs raised floor, roof types, typical spans and hardware.
4. **Answers to the decisions in §13** — "accept recommendations" is enough.
5. **Phase 4 only:** an Anthropic API key, entered by you directly in the hosting environment. Do not paste keys into chat.

## 17. Exclusions

Steel trusses, cold-formed steel, masonry (TMS 402/602), slab-on-grade design, fire-resistance design, and drawing / detail production. Schedules and notes are formatted for transfer to drawings.
