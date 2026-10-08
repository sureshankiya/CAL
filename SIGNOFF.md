# HouseCalc 1.0 — release sign-off checklist

Phase 5 exit criterion (PLAN.md §14): *sign-off checklist complete*. Items marked **Done** were completed and verified in the build; items marked **EOR** need the Engineer of Record's decision or a source document that is not in the repository. Release 1.0.0 is locked (src/engine/lock.json); any later change to a calculation file fails the lock test until the version is bumped.

## A. Software release

| # | Item | Evidence | Status |
|---|---|---|---|
| A1 | Engine and data-library versions locked | `src/engine/lock.json` (engine 1.0.0, data 1.0, fingerprints); `tests/lock.test.ts`; `bun run lock` refuses a changed source under an unchanged version | Done |
| A2 | Version stamped on every sheet; unlocked builds flagged | Design-basis block and cover: "HouseCalc engine 1.0.0 (hash); data library … ; locked …" — a modified build prints "UNLOCKED build — not for issue" in red | Done |
| A3 | Project files record the software they were saved with | `software` block in the project JSON; opening a file saved with another build warns and lists the differences | Done |
| A4 | Build checks | typecheck clean; lint 0 errors; unit + parity + validation tests pass; production build; headless-Chromium print check of the four reference projects | Done |
| A5 | API key handling (AI extraction) | key read only from `ANTHROPIC_API_KEY` on the server; never in the browser bundle or project file (verified in the production build output) | Done — key to be set by you in the hosting environment |

## B. Verification

| # | Item | Evidence | Status |
|---|---|---|---|
| B1 | Closed-form and unit checks per module | tests/*.test.ts (members, phase2–5) | Done |
| B2 | Independent Python reference calcs (written without the engine source) | verification/reference.py, _p2 … _p5 — every case within 0.1 % | Done |
| B3 | Lovable app parity (JoistCalc / StudCalc / TrussCalc), engine corrections documented | tests/reference.test.ts; PLAN.md §12.2 | Done |
| B4 | Portfolio validation on 5–10 permit sets | **14 sets, 92 automated sheets, 1,110 printed values: 1,083 match, 27 documented differences, 0 unexplained** — VALIDATION.md, tests/validation.test.ts | Done |
| B5 | Targeted Tedds parity sheets | N Lugo beam, San Miguel rafter / footing / CMU wall, Paden & Orchard posts, 1002 3rd St shear wall, East Grand steel lintel / HSS post / base plate / anchors / CFS studs, Indian Wells ledger bolts | Done |
| B6 | Full report from drawings for one real project | 1109 San Miguel addition (Phase 4) | Done |
| B7 | Hand-checked lateral calculations on two portfolio houses | the portfolio packages carry placeholder shear-wall loads (PLAN.md §2B Q1), so no trusted lateral results exist to compare against | **EOR** — supply two hand-checked lateral calcs, or accept the closed-form + Python-reference verification of the lateral modules |

## C. Data library (PLAN.md §12.1 second-pass entry check)

All 29 tables carry source and edition and print **VERIFY** until checked against the printed source. The validation register corroborates the values the portfolio sheets print (NDS Table 4A / 4D DF-L values, SDPWS Table 4.3A / 4.3B / 4.3C cells used on 137 sheathed sides), but corroboration by Tedds is not the second-pass check.

| # | Item | Status |
|---|---|---|
| C1 | NDS Supplement Tables 4A, 4B, 4D, 5A (2018 and 2024) | **EOR** — check against the printed Supplements |
| C2 | SDPWS Tables 4.2A, 4.3A, 4.3B, 4.3C (2021; 2015 for the 2022 cycle where adopted) | **EOR** |
| C3 | IBC / CBC Tables 1604.3, 1607.1, 1806.2, 1809.7 | **EOR** |
| C4 | ASCE 7 Tables 12.2-1, 26.10-1, Figures 28.3-1, 30.3-1, Commentary C3.1-1a | **EOR** |
| C5 | AISC shapes and materials; HSS computed properties | **EOR** |
| C6 | TMS 602 Table 2, TMS 402 §8.3 | **EOR** |
| C7 | Manufacturer data: hardware catalogue, TJI, SCL, adhesive anchors, truss plates, CFS stud load tables | **EOR** — current catalogues / ESRs for the products you specify |

## D. Code provisions flagged VERIFY in the engine

| # | Provision | Where | Status |
|---|---|---|---|
| D1 | TMS 402 §8.3.4.2.2 F_b = 0.45 f'm (Tedds sheets use f'm/3) | CW walls, CMU RW stems | **EOR** |
| D2 | TMS 402 §7.4 prescriptive seismic reinforcement limits by SDC | CW walls | **EOR** |
| D3 | ACI 318-19 Table 17.6.5.2.5 minimum bond stresses as adhesive defaults | TI tie-ins | **EOR** — replace with product ESR values |
| D4 | SDPWS Table 4.3A footnote: 15/32 in. values for 3/8 / 7/16 in. panels (opt-in per side) | SW shear walls | **EOR** |
| D5 | SDPWS 4.3.3.2.1 exception: WSP + gypsum wallboard additive for wind (now applied; Tedds applies it) | SW shear walls | **EOR** — confirm |
| D6 | ACI 318-19 Table 25.4.3.2 hook factors ψ_r = 1.6, ψ_o = 1.0 (no confinement, side cover ≥ 6 d_b) | RW dowels | **EOR** |
| D7 | ACI 318-19 13.3.7.1: cantilever retaining-wall stem as a one-way slab (0.0018 minimums) | RW stems | **EOR** |
| D8 | IBC 1807.2.3 stability factors 1.5 / 1.1 with 0.7E; IBC 1803.5.12 dynamic earth pressure required for SDC D–F over 6 ft | RW | **EOR** |
| D9 | IBC Table 1604.3 note: 0.42 × C&C wind for deflection | CS studs (input, default 0.42) | **EOR** |
| D10 | Guard load 200 lb (IRC Table R301.5 / IBC 1607.9.1); top-rail line load entered where it applies | GP guard posts | **EOR** |
| D11 | Equal-deflection vs capacity-proportional distribution between shear-wall segments (SDPWS 4.3.3.4.1) — see VALIDATION.md documented differences | SW lines | **EOR** — choose the default |

## E. Phase deliverables (PLAN.md §14)

| Phase | Exit criterion | Status |
|---|---|---|
| 0 | Spec approved | Done (2026-10-07) |
| 1 | JoistCalc and portfolio joist / rafter / beam parity | Done |
| 2 | Load path roof → foundation; shear walls and footings reproduce portfolio sheets; demand-based results | Done |
| 3 | East Grand steel sheets; hand-checked lateral calcs on two houses | Steel done; lateral hand checks open (B7) |
| 4 | Full report from drawings for one real project | Done (San Miguel) |
| 5 | Validation on 5–10 sets, locked versions; optional CFS walls, decks, retaining walls | Done (14 sets; 1.0.0 locked; CS, deck GP + deck project, RW) |

## F. Engineer of Record

| | |
|---|---|
| Items B7, C1–C7, D1–D11 reviewed and accepted | ☐ |
| Release 1.0.0 approved for use on permit calculations | ☐ |
| Name / licence no. | |
| Signature | |
| Date | |
