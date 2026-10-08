# HouseCalc — Wood-Frame House Structural Calculator

Merged build plan · Rev. J · 2026-10-08 · Phase 5 delivered, release 1.0.0 locked — see Revision J; sign-off items in SIGNOFF.md

Sources merged:
- **Rev. A plan** — review of your Lovable apps JoistCalc, StudCalc and TrussCalc. STRUTURA (steel truss) is excluded.
- **BUILD_PLAN.md** — "Wood-Frame House Structural Calculator: Build Plan".
- **Your portfolio** — the 17 permit sets (drawings + calc packages) in Google Drive › `PORTFOLIO`, catalogued in §2A, with QC findings in §2B.

Where the sources differ, the BUILD_PLAN decisions govern. Conflicts that need your decision are in §13.

---

## Revision J — Phase 5 delivered (release 1.0.0)

| Item | Status |
|---|---|
| Portfolio validation | All 14 remaining permit sets transcribed verbatim (verification/portfolio/sets — 110 calc sheets: 76 shear walls, 11 footings, 8 posts, beams, joists, rafters, CMU, steel, CFS, ledgers, trusses, reports) and normalised (normalize.py) to 94 automated cases. **1,110 printed Tedds values recomputed with the sheets' own inputs: 1,083 match (½ unit of the last printed digit or 0.5 %), 27 documented differences, 0 unexplained** — VALIDATION.md. Documented: segmented walls with openings (Tedds equal-deflection segment limit, 18 values), Tedds sheet errors (Blackthorne SW3 zero capacity, SW4 results of another wall), footing base pressure (Tedds applies the soil over the full width — 3 footings, explained exactly; lateral column-force moment — 1; one 3.4 % difference not reconciled from the printed inputs, Tedds higher), two sheets not runnable (Paden POST 2 contradictory, Bancroft W1 incomplete). 135 package QC observations (drawing vs calc, editions, placeholder loads) are listed per set for the EOR |
| Fixes from validation | **SDPWS 4.3.3.2.1 exception** — WSP + gypsum wallboard additive for wind (HouseCalc used the dissimilar-material rule: conservative, now corrected; La Presa / Madrid / Blackthorne walls); unblocked gypsum maximum aspect 1.5:1 (was 2:1 — unconservative); portfolio rows added (1/2 in. gypsum sheathing unblocked 150 plf / blocked 350 plf, 5/8 in. particleboard 610 plf, Table 4.3B); opt-in 15/32 in. values for 3/8 / 7/16 in. panels (Table 4.3A footnote, as Tedds applies); in² checks printed to three decimals |
| Locked versions | Engine 1.0.0 / data library 1.0 locked with source fingerprints (src/engine/lock.json, scripts/lock.mjs); fingerprint and lock state printed on every sheet ("UNLOCKED build — not for issue" otherwise); project files record the software and warn on a different build; lock test enforces a version bump for any calculation change |
| Retaining walls (RW) | Cantilever wall, concrete or CMU stem: equivalent-fluid earth pressure on the heel plane, surcharge K_a q, seismic increment from the geotechnical report (uniform / inverted triangle); IBC 1807.2.3 sliding and overturning for every case with variable loads off (FS 1.5, 1.1 with 0.7E), passive below the neglected depth, friction or cohesion ≤ ½D; bearing per ASCE 7 §2.4 with partial contact; stem by the CW engine (concrete stem as one-way slab, ACI 318-19 13.3.7.1); toe / heel flexure and shear per strength combination with 1.6H, A_s,min, longitudinal steel, standard-hook development of the dowels; flag when SDC D–F with more than 6 ft of backfill lacks a dynamic pressure (IBC 1803.5.12) |
| Decks | GP guard posts (200 lb or rail load; bending, shear, washer bearing, A307 bolt tension, tension device); deck framing through the existing joist / beam / post / ledger / pad modules (40 psf deck live load, wet service, incising); deck and retaining-wall general notes, soils special inspection; **Deck + RW** options project (all members pass; LG-1 needs a doubled rim and bolts at 8 in. — 1/2 in. bolts at 16 in. into a single 2x rim give D/C 2.72 by the NDS yield equations, mode II, wet service) |
| Cold-formed steel (CS, optional) | SSMA designation → gross section; allowables from the stud load table (entered, VERIFY); ASD combinations, P / P_a, M / M_a, AISI S100-16 H1.2 with B₁ = 1 / (1 − 1.6P / P_e), deflection with 0.42W; East Grand: P / P_a = 1.76 / 2.44 = 0.721 reproduced (the sheet is an SSMA table lookup — no AISI calculation to compare) |
| Verification | 155 tests. Independent Python reference for Phase 5 (verification/reference_p5.py: RW stability four cases, bearing, toe / heel per combination, hook, stem moment; guard post; CFS Ix, P_e, B₁, interaction, deflection) — all within 0.1 %. Print check: example house, San Miguel, truss check, deck + RW |
| Sign-off | SIGNOFF.md — software, verification, data-library, code-provision and phase items; the items left for the EOR are the second-pass data check (29 tables), 11 provisions marked VERIFY, and the Phase 3 hand-checked lateral calcs |

**Findings while validating**
- The portfolio's 76 shear-wall sheets confirm the HouseCalc capacity, end-post and chord calculations for identical inputs; the demands on those sheets remain placeholders (§2B Q1 — W = 18–135 lb, E = 35–40 lb), so the sheets cannot validate demand.
- Tedds limits segments of a wall with openings to the equal-deflection shear (SDPWS 4.3.3.4.1); HouseCalc's line distribution offers equal-deflection as an option. Choose the default (SIGNOFF D11).
- Hand-written reports in the packages were not automated; they are listed in VALIDATION.md for the EOR (for example the Controllata loft joists, fb = 1,344 psi > 875 psi, marked NG in the report while the drawings show TJI 210 joists, and the Paden pad footing designed for 30 + 35 kips against post loads of about 16 kips).

**Needed from you**
1. Sign-off items in SIGNOFF.md (B7, C1–C7, D1–D11).
2. Default for shear-wall segment distribution (equal deflection or capacity-proportional).
3. Stud manufacturer / SSMA load tables you use for CFS walls, and the guard-post tension device you specify.
4. Open Phase 4 items 1–7 (Revision I) still apply.

## Revision I — Phase 4 delivered

| Item | Status |
|---|---|
| Concrete / CMU walls (CW) | Stem and foundation walls per foot of wall; Timoshenko panel solver (shear deformation, Tedds convention for CMU), pinned / fixed / cantilever, parapet; wind, ASCE 7 §12.11.1 seismic (0.4 S_DS I_e w ≥ 0.1 w) plus entered pressure, equivalent-fluid earth pressure (H = 1.0 ASD / 1.6 strength), eccentric top load. CMU (TMS 402 ASD §8.3): P_a (Eqs. 8-21 / 8-22), cracked-section M_c at the applied P, F_vm with M/(Vd) and the 2–3 √f'm caps, in-plane shear with F_vs and in-plane flexure, A_v / 3, prescriptive seismic reinforcement §7.4 (VERIFY). Concrete (ACI 318-19): P-M strength with φ from ε_t, member slenderness magnifier for k l_c / r > 22, one-way shear, in-plane shear 11.5.4.3, Table 11.6.1 minimums, 11.7 spacing, two curtains above 10 in. |
| Foundations | HF shear-wall / hold-down footings: rigid-body overturning, eccentric bearing (kern / partial contact), sliding (IBC Table 1806.2 friction + one-face passive), hold-down uplift length T_u / 0.9w_D and its longitudinal flexure. Pads as thickened slabs under posts. Slab-on-grade spec → general notes (CRC R506). |
| Tie-ins (TI) | Drilled dowels / adhesive rods in a row along a joint: ACI 318 Ch. 17 steel, breakout, bond (c_Na, A_Na), seismic 0.75, shear steel / breakout / pryout, 17.8 interaction, 17.9 geometry, h_min; shear friction 22.9 with dowel development. Default bond values are the ACI 318-19 Table 17.6.5.2.5 minimums until a product's ICC-ES values are entered |
| Trusses (T, designed) | TrussCalc geometry and solver ported unchanged; n-panel parallel chord (Warren / Pratt) added; loads by type (roof D on sloped or plan basis, ceiling D, attic L, L_r with reduction, balanced and unbalanced snow, wind uplift) and every relevant ASCE 7 ASD combination with its C_D; member tension / compression with C_P on both axes, chord combined 3.9.1 / 3.9.2 with panel bending and C_r, heel bearing with C_b, tail bending, virtual-work deflection (live, live + K_cr D), joints (nailed by NDS 12.3 single shear, bolted by double shear, plates by the manufacturer value — VERIFY); reactions per foot feed the walls like imported trusses |
| AI extraction | Server function (src/lib/aiExtract.ts) sends one rendered page (1,568 px) and its vector text with the member / field list; structured JSON output; API key only from `ANTHROPIC_API_KEY` in the hosting environment; cost estimate before each run, actual usage after; every item enters the review table unconfirmed, linked only to valid member fields |
| Notes / schedules | General notes generated from the designed members (codes, criteria, foundations, slab, masonry, wood, steel, connectors, post-installed anchors); special-inspection table (IBC 1705 items triggered by the member types — EOR to confirm exceptions); deferred submittals; field-verification list from every VERIFY assumption; consolidated hardware schedule (where used, max D/C, status); CMU / concrete wall, shear-wall footing, tie-in and designed-truss schedules |
| Validation projects | **1109 San Miguel addition** rebuilt from the permit drawings (R-1, CN-1/2, 1W-1, existing wall and footing, SW1–SW3 with HDU2, RD-1, CW-1 CMU stem wall, F1, HF-1, TI-1, slab) — designs end to end, 23 sheets / 96 pages; **East Lincoln truss check** — 9 sheets / 19 pages |
| Verification | 130 tests. Tedds parity — San Miguel CMU wall: self weight 88.13 psf, E 75.25 psf, P 144.6 lb/ft, M 669.8 lb-in/ft, V 97.6 lb/ft (governing combination 10 at the base), top reaction 60.4 lb/ft (shear deformation reproduced), k_bal 0.251, M_bal 14,736, M_c 23,454 vs 23,462 lb-in/ft, F_a 493.8 psi, F_v 50.7 vs 50.8 psi, combination utilizations 0.007–0.040 identical. Independent Python reference for Phase 4 (verification/reference_p4.py: Timoshenko panel, CMU section and weight, concrete P-M, adhesive dowel row, parallel-chord truss, eccentric bearing) — all within 0.1 %. Print check: example house 42 sheets / 203 pages, San Miguel 23 / 96, truss check 9 / 19 |

**Findings while building Phase 4**
- **San Miguel CMU sheet (Tedds MSJC-13):** F_b = f'm/3 is used; TMS 402 §8.3.4.2.2 gives 0.45 f'm in the editions HouseCalc targets (**confirm**; HouseCalc takes the factor as an input and uses 0.45). The wall is analysed at t = 8 in. (specified 7-5/8 in.), P_a on (A_n − A_s) (code: A_n — 0.5 % conservative) and F_vm with 0.6D instead of the combination's 0.46D (≈ 0.2 % unconservative). With the specified thickness and 0.45 f'm the wall still passes (D/C 0.04).
- **San Miguel F1:** the drawing calls for #4 @ 18 in. transverse in the 18 in. × 10 in. footing — 0.133 in²/ft, below A_s,min = 0.0018 A_g = 0.216 in²/ft (ACI 318 7.6.1.1 / 13.3). The Tedds footing sheet in the same package uses #4 @ 6 in. Drawing and calculation disagree; #4 @ 11 in. or closer satisfies the minimum. HouseCalc keeps the drawing value and reports FAIL.
- **San Miguel shear walls:** the Tedds sheets use W = 18 lb and E = 40 lb per wall (§2B Q1). From ELF (S_DS 1.0, S_D1 0.6 assumed) HouseCalc gives E_h = 1,868 lb on the SW3 line and 934 lb on each of SW1 / SW2; all three still pass (governing: sill anchor concrete breakout, D/C 0.57 on SW3).
- **San Miguel X direction:** SW3 is the only new X-direction wall; the remaining load goes into the existing house, which is outside the calculation — left as an open package item.
- **East Lincoln truss report:** strength-level loads (1.2D + 1.6L = 100 plf) are checked against ASD reference values; M = 25.3 kip-ft is written but 20.0 kip-ft is used for the chord forces; F_t for DF-L No.1 is taken as 1,000 psi (Table 4A: 675 psi) and E_min as 690,000 psi (620,000 psi); web slenderness is taken as L/r = 41.6 instead of l_e/d; deflection uses a 40 ft span; "8 panels at 5 ft" do not span 45 ft. HouseCalc (9 × 5 ft panels, 15 / 20 psf, ASD): end compression diagonal 3,396 lb (report 1,720 lb), 2x4 No.1 unbraced D/C 2.61 — with a continuous lateral brace at mid-length the 2x4 web passes (0.72) and the truss passes with the bottom chord at 0.99 (A_n = 0.85 A_g).
- **TrussCalc audit (corrected in the port):** a single combination with one C_D; fastener values scaled by (G / 0.5)^1.5 (not an NDS relationship); plate "tooth values" of 110 / 145 psi with no source; parallel-chord depth derived from the pitch and only four panels. HouseCalc uses the NDS yield equations, combinations with C_D each, and requires the plate value from the manufacturer.

**Needed from you (Phase 4 data, all print VERIFY)**
1. TMS 402 edition values: F_b factor (0.45 f'm assumed), and the f'm basis for 2,500 psi units with Type M / S mortar (TMS 602 Table 2).
2. Prescriptive seismic reinforcement limits (TMS 402 §7.4) by SDC and wall classification as you apply them.
3. Adhesive products you specify for tie-ins and post-installed anchors (ICC-ES report, τ_cr / τ_uncr, k_c, φ); defaults are the ACI minimums.
4. Truss plate design values, or confirm that metal-plate trusses always stay deferred submittals.
5. Set `ANTHROPIC_API_KEY` in the hosting environment to enable AI extraction (the server function is built and tested offline; no live extraction was run here). Do not paste the key into chat.
6. San Miguel: S_D1 and site class, the basis of the 40 psf added seismic pressure and the CMU wall top loads used on the Tedds sheet, and the roof framing direction (single slope to the existing wall assumed).
7. Still open from Phase 3: hand-checked lateral calcs for two portfolio houses you trust.

## Revision H — Phase 3 delivered

| Item | Status |
|---|---|
| Steel beams / lintels (SB) | W, C, HSS; AISC 360-16 (2022 cycle) / 360-22 (2025 cycle), LRFD or ASD; F2 / F3 / F6 / F7 / F8 flexure with LTB per unbraced segment and C_b (F1-1), G2 / G4 / G5 shear, J10.2 / J10.3 at bearings, NDS bearing on wood supports, IBC 1604.3 deflection; fixed-end supports added to the beam solver |
| Steel columns (SC) | HSS / pipe / W: E3, E7 effective width (slender HSS walls), F7 / F8, H1-1a/b with App. 8 B1, eccentric beam bearing, wind on the column, cap-plate bearing of the wood beam |
| Base plates (BP) | DG1 small / large moment, J8 bearing, plate at bearing and tension interfaces, rods in tension + shear + grout-pad bending (J3.7), column weld; ACI 318-19 Ch. 17 anchor group: steel, tension breakout of the tension row, pullout (headed / hooked), side-face blowout, steel shear (grout pad 0.8), breakout perpendicular (Case 1 front row and Case 2 rear row, c'a1 limit), parallel, pryout, interaction, seismic 0.75 |
| Diaphragms (RD / FD) | SDPWS Table 4.2A blocked / unblocked; F_px (Eq. 12.10-1 with 0.2 / 0.4 S_DS I_e w_px limits, ρ = 1.0); per-span reactions, unit shear, aspect ratio; chord on the double top plate with nailed (NDS 12.3) or strapped splice; collector force profile along each line from the wall positions (FTAO walls as their piers) or the upper bound; Ω0 unless the §12.10.2.1 light-frame exception applies |
| Distribution | Wall-line plan positions → computed tributary widths; rigid diaphragm with line stiffness from the designed shear walls (secant Q_E / δ_xe), inherent and ±5 % accidental torsion, envelope option, δmax/δavg torsional-irregularity flag (A_x not applied — EOR) |
| FTAO shear walls | One opening per wall, Diekmann rational method (SDPWS 4.3.5.2): v_p, H, v_ab, corner strap force, pier aspect ≤ 3.5 and C_ar, strap from the hardware list; line sharing and collectors by pier length; deflection by Eq. 4.3-1 over the full wall with max(v_p, v_ab) — flagged VERIFY |
| Shear transfer (ST) | Clips (F1 / F2 from the hardware list) or nails (NDS 12.3, toe-nail C_tn 0.83); demand from a shear wall or a wall line |
| Uplift path (UP) | Chain of connections from a roof member's net uplift per foot, 0.6D + 0.6W at each level with the dead load above |
| Ledgers (LG) | NDS 12.3 single-shear yield equations at the angle of the resultant (K_θ, Fe at θ), wood rim or concrete / CMU (entered dowel bearing), ledger bending / shear between fasteners, loaded-edge distance |
| Schedules | Steel beam / column, base plate, diaphragm, shear transfer / uplift and ledger schedules; package check that every story and direction has a diaphragm design |
| Verification | 100 tests. Tedds parity — 336 East Grand: W10×22 fixed–fixed lintel (M −4.441 / +2.220 kip-ft, V 2.665 kip, Mn 108.333, φMn 97.5 kip-ft, Vn 73.44 kip, δ 0.006 in), HSS 6×6×¼ post (SR 59.0, Fcr 38.8 ksi, φPn 182.6 vs 182.9 kip, φMn 42.06 vs 42.0 kip-ft, B1 1.0, H1-1b 0.271 vs 0.272 — difference is computed vs tabulated A and Z), 12×12×¾ base plate (Pp 979.2 kip, Y 0.137 in, T 4.25 kip, t_req 0.479 / 0.224 in, rod f_t 28.8 vs φF'nt 32.6 ksi), anchor bolts (Nsa 19.40, Ncbg 32.22, Np 32.00, Vsa 18.62, Vcbg 19.32 with c'a1 = 8 in, Vcpg 74.36 kip); 45324 Indian Well 2×12 ledger (Fe⊥ 3,157.6 psi, k1 2.32, k2 1.43, k3 1.03, Z modes 3600 / 474 / 1221 / 1336 / 298.2 / 348.2 lb, D/C 0.293). Independent Python reference for Phase 3 (verification/reference_p3.py: W beam LTB, HSS properties, HSS column H1, slender HSS E7, small-moment base plate, anchor group, ledger, FTAO, diaphragm and collectors, rigid torsion, F_px) — all within 0.1 %. Print check: example house 42 sheets, 199 pages |

**Example house** now adds a rear porch (R-2 rafters on a 2×8 ledger LG-1 and a W8×10 beam SB-1 on two HSS 4×4×¼ posts SC-1 / SC-2 with base plates BP-1 / BP-2 on pads PF-2 / PF-3), an FTAO front wall 1SW-1 around window W1, roof diaphragms RD-1 / RD-2 with chords and collectors, shear transfer ST-1, uplift path UP-1, and the envelope (flexible / rigid) distribution.

**Findings while building Phase 3**
- East Grand W10×22 lintel: the Tedds sheet checks 1.2D only; for a dead-only lintel 1.4D governs (M = 5.18 vs 4.44 kip-ft; D/C still small). The 0.022 kip/ft line load duplicates the self weight that Tedds also includes.
- East Grand base-plate anchor sheet uses φ = 0.65 for concrete breakout of cast-in anchors; ACI 318 Table 17.5.3(c) gives 0.70 (Condition B) / 0.75 (Condition A) — Tedds is conservative. Its interaction (0.451) is triggered only by that φ.
- Indian Well ledger: the Tedds yield-mode values reproduce exactly with F_yb = 22,500 psi; with the NDS bolt bending yield strength of 45,000 psi, Mode IIIs gives Z = 370.6 lb (Tedds 298.2 lb, conservative). The CMU dowel bearing value 6,000 psi used by Tedds is not an NDS table value — **confirm the basis** (HouseCalc requires it as an entered, VERIFY value).
- Rigid distribution of the example (symmetric plan): accidental torsion raises the line forces 1–7 %; δmax/δavg = 1.06 (no torsional irregularity).
- Diaphragm force: for a one-story WSP building (R = 6.5), F_px is governed by the 0.2 S_DS I_e w_px minimum (6,478 lb vs C_s W = 4,983 lb in the example), so diaphragms and collectors see about 30 % more than the wall-line forces.

**Needed from you (Phase 3 data, all print VERIFY)**
1. W and C shape properties against the AISC Shapes Database (rows were checked for internal consistency against their dimensions); HSS properties are computed from geometry and match the AISC tables to three figures.
2. SDPWS Table 4.2A diaphragm values (entered from the 2015 / 2021 tables).
3. Clip / strap values for shear transfer and splices (A35, LTP4, MST, ST straps) — enter in the hardware list; CS16 remains to be checked.
4. Basis for the dowel bearing strength of concrete / CMU for ledger bolts (7,500 / 6,000 psi entered).
5. FTAO deflection method (HouseCalc uses a conservative full-wall Eq. 4.3-1 with the larger panel shear) and whether you want the APA / SEAOC multi-opening FTAO method added in Phase 4.

## Revision G — Phase 2 delivered

| Item | Status |
|---|---|
| Walls / posts | W stud bearing walls (typical stud per load segment, stud packs, king studs, C&C wind, plate bearing with C_b, P-Δ wind deflection); P posts (C_P both axes, built-up K_f, end-grain and perpendicular bearing) |
| Load takedown | Wall base line loads and stud-pack / post point loads carried to footings by link; load-path summary sheet; package checks for uncarried reactions and untied uplift |
| Trusses / connectors | Truss reaction import with uplift; connectors checked per combination and load-duration column, uplift on the 160 column; project hardware list (editable, VERIFY until checked) |
| Existing members | New / existing / modified status with field-verify assumptions on every sheet |
| Footings | Continuous and pad footings, plain or reinforced (ACI 318-19), service bearing and uplift, IBC 1809 minimums, presumptive soil rule (§2B Q4) |
| Lateral | ELF (§12.8) and Ch. 28 envelope wind story forces; wall lines by tributary width; segmented SDPWS shear walls with chord forces, hold-downs, stacked uplift, ACI 318 Ch. 17 hold-down anchor, sill bolts, drift (§2B Q1, Q2) |
| Schedules | Framing, truss, beam, wall, post, shear wall, hold-down, connector, foundation, hardware data |
| Verification | 67 tests. Tedds parity: 1002 3rd St SW1 (Fc* 2,484, FcE 501, C_P 0.19, Fc' 478 psi, C 344 lb, T −64 lb, drift), 215 Paden POST 1 (C_P 0.842, Fc' 758, Eq. 3.9-3 0.984), San Miguel footing flexure (d 6.75 in., a 0.784 in., φM_n 11.444 kip-ft). Independent Python reference for Phase 2 (verification/reference_p2.py: stud wall, built-up column, shear wall, plain and reinforced footings, ELF and wind, ACI anchor, NDS bolt) — all within 0.1 %. Print check: example house 29 sheets, 139 pages |

**Example house** now runs roof → foundation: rafters / ceiling joists → bearing walls (with header stud packs) → continuous footings; I-joists → girder → post → pad; H2.5A ties for rafter uplift; five shear walls on four wall lines with HDU2 hold-downs.

**Findings while building Phase 2**
- StudCalc plate bearing used l_b = stud depth for C_b; the bearing length along the plate grain is the stud thickness (C_b = 1.25 for a single 2x stud). Corrected.
- StudCalc wind deflection used 0.6W; IBC Table 1604.3 note f permits 0.42 × C&C. HouseCalc uses 0.42 and prints the basis.
- The 1002 3rd St Tedds sheets print v_s = 860 plf at 4 in. for 7/16 in. Structural I OSB (the 15/32 in. value); the table in the HouseCalc library lists 790 plf for 7/16 in. — **confirm against the adopted SDPWS** (the parity test enters 860 as a flagged override).
- 1109 San Miguel footing: the Tedds soil weight over the footing (0.726 kip/ft) could not be reproduced from the printed inputs; flexure reproduces exactly. HouseCalc excludes the wall width from the soil weight and prints the calculation.
- Drift: HouseCalc follows the Tedds convention (0.6 − 0.2 S_DS)D against strength-level Q_E for the hold-down slip term (conservative); the strength-level counterpart would be (0.9 − 0.2 S_DS)D.

**Needed from you (Phase 2 data, all print VERIFY)**
1. SDPWS Table 4.3A / 4.3C cells not shown on your Tedds sheets (especially G_a values).
2. Connector hardware: hold-down, H2.5A and CS16 values were entered from the Simpson catalogue and must be checked; hangers, post caps / bases, A35 and H1 are listed without values — enter them from the current catalogue.
3. ASCE 7-22 Kz constants (7-16 constants used for both cycles) and Table 12.2-1 Ω0 for the 7-22 cycle.
4. Concrete dowel bearing strength for sill bolts (7,500 psi used) and whether you design sill-anchor concrete shear with the ACI 17.10.6 light-frame provisions.

## Revision F — Phase 1 delivered

| Item | Status |
|---|---|
| Code cycles | 2025 and 2022 CBC / CRC data sets; cycle stamped in the design-basis block and footer of every sheet |
| Loads | Dead-load assemblies (C3.1-1a), IRC / IBC live loads, roof live reduction, ASCE 7-16 / 7-22 snow |
| Members | FJ, R (ridge beam / ridge board), CJ (rafter tie), IJ, B / H / RB in sawn, built-up, glulam, SCL; FAIL alternatives (lightest size, max spacing, max span) |
| Load path | Reactions carried between members by load type; rafter thrust to tie joists; design in load-path order |
| Report | Cover / EOR block, contents and summary with package checks, criteria, loads, member sheets, schedules, notes, assumption log; per-sheet footers |
| Drawings | PDF viewer, sheet tags, manual review table (confirm before apply) |
| Verification | 52 tests: closed-form solver checks, JoistCalc parity, N Lugo Tedds beam, San Miguel rafter, Tedds post data / C_P, independent Python reference (verification/reference.py, 9 cases), print check (scripts/print-check.mjs) |

**Findings while building Phase 1**
- A dead load typed directly in psf on a pitched roof must state its basis. HouseCalc now defaults roof members to the sloped surface (load / cos θ on plan) and prints the basis on the sheet; the independent reference caught the difference (H-1 example: 707 vs 720 psi).
- 1109 San Miguel rafter sheet: F'b omits C_r = 1.15 (conservative), deflection is computed on the horizontal span (HouseCalc uses the sloped length: δ_sloped = δ_horizontal / cos² θ), and the uplift case uses 0.6D + 1.0W with the strength-level ASCE 7-22 pressure — the ASD combination is 0.6D + 0.6W (§2.4.1 (7)). The sheet's result is conservative, not unsafe.
- Default K_cr = 1.0 (IBC Table 1604.3 immediate D + L). Set 1.5 in the criteria for NDS 3.5.2 long-term creep (JoistCalc's default).

**Needed from you before Phase 2** — confirm the VERIFY data: NDS-2024 Supplement values (carried from 2018), TJI properties, SCL values for the products you specify, and the typical (non-table) dead-load components.

## Revision B — changes from Rev. A

| Item | Rev. A | Rev. B (revised) |
|---|---|---|
| Trusses | In-tool truss design (port TrussCalc) in Phase 2; manufacturer option | **Default: import manufacturer reactions and uplift** (Phase 2). In-tool truss design moves to Phase 4 |
| Drawing input | Excluded | Manual forms **plus** PDF upload with AI-assisted extraction into an editable review table. Nothing calculates until values are confirmed |
| Architecture | Client-only app | Three layers: input model, calc engine, report engine. Supporting pieces: data library, load takedown service, assumption log. TypeScript engine shared by the browser and server functions |
| Code cycles | Two edition sets | Versioned data set per code cycle. Cycle stamped on every sheet; engine and data-library versions recorded on the report |
| Outputs | Member sheets, schedules, general notes | Adds hardware schedule, specific notes, house-report table of contents and summary. Output is **PDF only** (decided, §13) |
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

## Revision D — changes from the 17 portfolio permit sets

| Item | Rev. C | Rev. D (revised) |
|---|---|---|
| Portfolio basis | Five-project summary (`UPWORK_PORTFOLIO.md`) | All 17 permit sets read; §2A rebuilt from the actual Tedds sheets, written reports and schedules |
| Priority | Gravity first; lateral in Phase 3 | Shear walls are in 14 of 17 sets (77 walls) and footings in 13, so **lateral demand, shear walls, hold-downs, anchorage and footings are proposed for Phase 2** (§13 #7) |
| Steel | HSS posts core; W-beams optional | **Steel beams / lintels (W, C) also core** (East Grand, East Lincoln), with base plates and anchor bolts |
| Cold-formed steel | Excluded | **CFS stud walls (AISI S100) optional** (one set) |
| Masonry | CMU foundation / stem walls only | **CMU walls above grade also in scope** (Madrid storage building, Indian Well carport; MSJC-13 sheets today → TMS 402/602 per cycle) |
| Trusses | Import by default; in-tool truss design in Phase 4 | Unchanged; the in-tool option is confirmed as needed (45 ft storage-building truss, East Lincoln) |
| Code cycles | "Four of five projects on 2022" | Nine sets on 2022 and eight on 2025, so both cycles from Phase 1 (decision unchanged). SDPWS for the 2022 cycle corrected to SDPWS-2021 |
| QC | — | New §2B: six recurring issues found in the sets, each mapped to a tool safeguard |

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

## 2A. Portfolio calculation inventory (17 permit sets)

Source: Google Drive › `PORTFOLIO` — 17 permit sets (structural drawings + calc packages). Every Tedds sheet, written calc report, schedule and hardware callout was extracted and catalogued.

Projects: 1002 3rd St JADU · 10269 Madrid Way · 1109 San Miguel Ave addition · 1165 Goldenrod St ADU · 130 East Lincoln storage building · 1320 La Presa house + garage · 1550 Bluebird Lane remodel · 16619 Orchard studio → ADU · 215 Alvarado St ADU · 215 Paden Dr ADU · 2163 Controllata St garage → ADU + loft · 2844 Baily Ave 2-storey ADU · 336 East Grand remodel · 45324 Indian Well carport · 4609 Bancroft Dr garage addition · 792 Blackthorne Ave ADU · 1109 N Lugo garage → ADU.

| Calculation (how it is produced today) | Sets | Examples | HouseCalc module |
|---|---|---|---|
| Wood shear walls, segmented (Tedds "Wood shear wall design", NDS 2015 / 2018) | **14** | **77 walls**, 3–12 per set: SW1–SW5, W1–W9, 1W1–2W6, 1SW1–2SW4, LW1–LW4, 2W-1–2W-3, IW; OSB / plywood / gypsum / particleboard, one or two sides | 8.6 SW |
| Footings — strip under walls, pads under posts (Tedds "Foundation analysis & design" + "Footing design", ACI 318-14) | **13** | F1 12″×18″, 15″×18″, 18″×10″; F2 3′×3′×1′, 18″×18″×12″, 48″W × 12″D with (5) #4 T&B | 8.8 F / PF |
| Seismic base shear and wind MWFRS (written report) | 1 | 1002 3rd St: V = 1,830 lb seismic, 2,240 lb wind | 8.1 / 8.6 LD |
| Hold-downs; anchor bolts and post-installed anchors into existing slabs (schedules + written report) | 7 | HDU2 / 8 / 11 / 14-SDS2.5, HTT4, HDQ8; 5/8″ threaded rod into existing SOG; KB-TZ2 | 8.6 HD / AB, 8.9 |
| Rafters, ceiling / roof joists, roof sheathing, roof diaphragm (Tedds + written reports) | 5 | 2×8 rafters (San Miguel, Blackthorne), roof / ceiling joist (Orchard), 2×10 roof joists + 5/8″ deck + diaphragm (Madrid) | 8.2 / 8.6 RD |
| Beams, headers, dropped beams (Tedds "Structural wood member analysis & design") | 3 | 2×10 dropped beam, 2-2×10 header, 6×8 beam | 8.4 |
| Floor joists and floor loads (Tedds "Wood floor joist design") | 1 | Baily Ave | 8.3 |
| Wood posts, axial + bending (Tedds "Wood member design") | 2 | 6×6 posts (Paden, Orchard) | 8.5 |
| Ledger (Tedds "Simple ledger design") | 1 | 2×12 ledger (Indian Well) | 8.7 |
| Wind uplift connections (written reports) | 2 | H2.5A / H7Z at rafters and trusses | 8.6 UP |
| CMU walls (Tedds "Masonry wall panel design to MSJC-13") | 3 | 8×16 CMU (San Miguel, Indian Well, Madrid) | 8.8 SW-F |
| Steel beams / lintels (Tedds "Steel beam analysis & design", AISC 360-10) | 2 | W10×22 lintel (East Grand), C8×11.5 lintel (East Lincoln) | 8.4 steel (core) |
| Steel HSS column, base plate, anchor bolts (Tedds, AISC 360-16 LRFD / ACI 318-14) | 1 | HSS 6×6×¼, 12×12×¾ base plate (East Grand) | 8.5 SP |
| Cold-formed steel stud wall (Tedds, AISI S100-07) | 1 | East Grand | optional |
| Wood roof truss designed in-house (written report) | 1 | 45 ft parallel-chord Warren truss, 2×6 / 2×4 (East Lincoln) | 8.2 T in-tool |
| Manufacturer trusses, deferred submittal | 1+ | La Presa | 8.2 T import |

**Schedules on your S-sheets** (formats to reproduce):

| Schedule | Columns as drawn |
|---|---|
| Foundation | Type mark · Ftg. size · Reinforcement |
| Wall | Mark · Description · Framing — or, on N Lugo: Wall type · Stud size · Spacing · Species / grade · Top plate · Bottom plate · Sheathing · Nailing · Remarks |
| Shear wall | Mark · Studs · Location · Sheathing · Height · Finish · Edge nailing · Field nailing · Hold-down · Anchor |
| Hold-down | Mark · Device · Location (wall end) · Anchor |
| Beam | Mark · Member size · Material · Support condition |
| Header | Opening · Header |
| Strap | Tag · Connector |
| Connector | Tag · Model · Location |
| Nailing | Reference to CRC Table R602.3(1) |

**Hardware** (number of sets using each):
- SDS screws 16 · H3 12 · A35 10 · H2.5A 7 · SP4 7 · H4 7.
- HDU2-SDS2.5 3 · H7Z 2 · HDU8 2 · MSTA36 2 · LUS210 2.
- One set each: HDU11 / HDU14-SDS2.5, HTT4, HDQ8, H1, H10, A34, MST27, CS16, KB-TZ2.

**Typical site and conditions**
- Southern California sites: San Diego County, Encinitas, Escondido, San Bernardino, Indian Wells.
- V_ult = 95–115 mph, Exposure B–C, SDC D, SDS = 1.0 used throughout, ground snow 0.
- Most sets are ADUs, garage conversions, additions or remodels. Tie-ins to existing slabs and footings appear in 10+ sets: shot pins, threaded rods and screw anchors into existing SOG, new footings under infill walls.
- Nine sets are on the 2022 CBC / CRC and eight on the 2025 CBC / CRC.

## 2B. QC findings in the portfolio — what HouseCalc must prevent

| # | Finding | Evidence from the sets | HouseCalc safeguard |
|---|---|---|---|
| Q1 | **Shear-wall demand is not taken from a lateral analysis** | All 77 shear-wall sheets carry W = 5–135 lb and E = 5–50 lb at the wall head, with SDS = 1.0; the highest D/C is 0.09. The same values repeat across sets (135 / 40 lb, 18 / 40 lb). 1002 3rd St computes V = 1,830 lb (seismic) and 2,240 lb (wind), but its wall and hold-down checks still use E = 40 lb (V = 28 lb, net compression). La Presa, Bluebird and the other multi-wall sets contain no base-shear calc | Base shear (ASCE 7 §12.8, Ch. 28) is computed and each wall's share is carried to its sheet automatically. A wall sheet cannot be issued with a demand below its distributed share |
| Q2 | **No drift check** | Every wall uses Tedds' strength-distribution method, which prints "does not include a deflection check … a drift check is required as part of the design" | SDPWS Eq. 4.3-1 deflection and ASCE 7 §12.8.6 amplified drift vs Table 12.12-1 on every seismic wall; equal-deflection distribution option |
| Q3 | **Calc editions older than the code on the drawings** | 2022-CRC sets run on NDS-2015 / IBC 2015 (Goldenrod, Alvarado, Controllata, Baily). 2025-CBC / CRC sets run on NDS-2018 / ASCE 7-16 / ACI 318-14 (La Presa, Bluebird, Blackthorne, San Miguel, N Lugo, East Lincoln, Indian Well, 1002 3rd St). ACI 318-14, AISC 360-10, MSJC-13 and AISI S100-07 appear throughout. "NDS 2021", which does not exist, is cited in East Lincoln | One code cycle per project drives every sheet; a mixed edition is accepted only as a flagged override |
| Q4 | **Soil bearing above presumptive values with no soils report** | Footing sheets use q_allow = 3.5 ksf (12 sets) and 5 ksf (3 sets); only Madrid cites a soils report. IBC Table 1806.2 presumptive values for soil are 1,500–3,000 psf | Presumptive class is required unless a geotechnical value is entered with its report reference; higher values print as VERIFY |
| Q5 | **Conclusions without calculations** | Madrid roof diaphragm: "capacity exceeds required seismic demand — OK", with no numbers | Every check prints equation, values and D/C |
| Q6 | **Schedule entries that do not match a product or member** | La Presa connector schedule: "H2.4A" (no such model; likely H2.5A); "LUS210 @ drag strap locations" and "A35 @ all floor joists to LVL". TJI-235 joists framing into LVL flush beams normally need I-joist hangers (verify) | Hardware is chosen from the catalogue for the member type, and schedules are generated from results
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
                                  (no calc code)    schedules, notes) → PDF (print)
                                        ▲
                                  Assumption log (every default / override / drawing source)
```

- **Layer rule:** the three layers never reach into each other.
  - The input model holds data only.
  - The calc engine is pure functions with no UI and no formatting.
  - The report engine renders results and never computes.
- **Stack:** the same as your Lovable apps — TanStack Start, React 19, Vite, Tailwind v4, shadcn/ui.
  - The TypeScript calc engine runs both in the browser (live preview) and in server functions.
  - Server functions are needed only for AI extraction (Phase 4). Reports print to PDF in the browser, as in your Lovable apps.
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
| Wood lateral | AWC SDPWS-2021 | AWC SDPWS-2021 |
| Concrete | ACI 318-19 | ACI 318-19 |
| Masonry (CMU walls and stem walls) | TMS 402/602-22 | TMS 402/602-16 |
| Steel (beams, lintels, HSS / pipe posts, base plates) | AISC 360-22 | AISC 360-16 |
| Cold-formed steel (optional) | AISI S100 edition referenced by the 2024 IBC | AISI S100 edition referenced by the 2021 IBC |
| Method | ASD for wood, connectors, soil; strength design for concrete; ASD or LRFD for steel | same |

- Both cycles are populated in Phase 1: nine of your 17 portfolio sets are on the 2022 CBC / CRC and eight on the 2025 CBC / CRC. A mixed set (for example 2022 CBC with ASCE 7-22) is allowed only as a flagged override.
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
- **Steel beams and lintels (W, C, HSS):** AISC 360 Ch. F flexure with unbraced length, Ch. G shear, deflection, and bearing on wood or CMU. Lintels over openings use the same loads and load path (portfolio: W10×22, C8×11.5).
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
| CFS-# | Cold-formed steel stud walls (optional) | AISI S100 axial + bending, as in the East Grand set |
| SP-# | Steel posts — HSS / pipe | AISC 360 Ch. E compression and Ch. H combined; base plate (concrete bearing per AISC 360 J8, plate bending per AISC Design Guide 1); anchor rods (ACI 318 Ch. 17); cap plate and bolts to the wood beam (NDS Ch. 12, steel side plate) |

### 8.6 Lateral

| Mark | Item | Checks |
|---|---|---|
| LD | Story forces and distribution | Wind and seismic per level and direction; flexible-diaphragm tributary distribution to wall lines (default) or rigid-diaphragm distribution with torsion (option, to reproduce ETABS results); wind / seismic envelope per line (ASCE 7 §12.3.1, §12.8.3, Ch. 28) |
| RD-# / FD-# | Diaphragms | Unit shear vs SDPWS Table 4.2A, ASD ÷ 2.0, aspect ratio, chord force and splice, collector force (Ω0 for SDC C–F, ASCE 7 §12.10.2.1) |
| SW-# | Shear walls | Segmented and **FTAO** methods; SDPWS Tables 4.3A–4.3C (OSB, plywood, particleboard, gypsum, stucco; dissimilar materials on two sides combined per SDPWS) with **automatic sheathing / nailing selection**; demand always from the distributed base shear (§2B Q1); drift on every seismic wall (§2B Q2); aspect-ratio limits and adjustment; one or two sides; overturning (0.6D); deflection Eq. 4.3-1 → δx = Cd δxe / Ie vs ASCE 7 Table 12.12-1 |
| HD-# | Hold-downs | Catalogue capacity (with ESR number); anchor per ACI 318-19 Ch. 17 (steel, breakout, pullout, side-face blowout, §17.10 seismic) |
| AB | Sill plate and anchor bolts | Bolt bearing in the sill (NDS 12.3), plate washers (SDPWS §4.3.6.4), concrete shear checks or the light-frame sill-plate provisions (ACI 318-19 §17.7, §17.10); post-installed screw / expansion / adhesive anchors and shot pins into existing slabs (manufacturer ESR values) |
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
| SW-F | Stem walls and CMU walls — concrete or CMU | Concrete (ACI 318) or CMU (TMS 402/602): reinforced single-wythe walls as in the portfolio (pinned / fixed out-of-plane, cantilever in-plane), axial + flexure interaction, shear, seismic minimum reinforcement, bearing, out-of-plane load from retained soil, reinforcement and seismic minimums, anchor-bolt embedment and edge distance (ACI 318 Ch. 17 / TMS 402 anchor bolts), sill-plate anchorage |
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

## 13. Decisions (approved 2026-10-07)

| # | Topic | Decision |
|---|---|---|
| 1 | Where it is built and runs | **This GitHub repo** (`sureshankiya/CAL`), with the same stack as your Lovable apps; deployable to any Node-capable host (needed for AI extraction) |
| 2 | Report format | **PDF only** — browser print, identical to your Lovable apps. No DOCX export |
| 3 | Drawing-input timing | **Phase 1:** PDF upload, viewer, source tagging and review-table mechanism (manual). **Phase 4:** AI extraction fills the same table |
| 4 | Footing timing | **Phase 2:** continuous and pad footings. **Phase 4:** stem walls, CMU walls and hold-down footings |
| 5 | Second code cycle | **Both cycles from Phase 1** — nine portfolio sets use the 2022 CBC / CRC and eight the 2025 |
| 6 | Steel (AISC 360) | **Steel beams / lintels and HSS posts with base plates in core scope.** CFS stud walls optional |
| 7 | Lateral timing | **Phase 2:** story forces, wall-line distribution, segmented shear walls with drift, hold-downs, sill anchorage. Diaphragms, collectors, FTAO and the rigid option in Phase 3 |
---

## 14. Phases and exit criteria (your structure, Rev. A content mapped in)

| Phase | Work | Exit criterion |
|---|---|---|
| 0 | This merged spec; data-model schema; report layout (captured from your Lovable apps); code-cycle list; regression case list | Spec approved by you |
| 1 | Scaffold and UI shell; input model with provenance, structures and mark templates; assumption log; data library (**2025 and 2022 cycles**, tagged); combinations; beam solver; report engine (sheets, cover, TOC, summary); project / site / criteria / loads sheets; rafters, ceiling joists, floor joists, I-joists, headers, beams (incl. multi-ply LVL), ridge beams; max span / required spacing / required size; PDF viewer and manual review table | Reproduces JoistCalc results and your portfolio joist / rafter / beam sheets within tolerance |
| 2 | Stud and bearing walls, wood posts, load takedown service, truss reaction import (+ uplift), hangers, ties, post caps / bases; **new / existing status and existing-member checks**; continuous and pad footings; seismic and wind story forces, wall-line distribution, segmented shear walls with drift, hold-downs, anchor bolts and post-installed anchors; framing / beam / post / wall / shear-wall / hold-down / connector / footing schedules | Gravity load path roof → foundation on a test house; shear walls and footings reproduce the portfolio sheets for identical inputs and give demand-based results for two portfolio houses (e.g. La Presa, Baily Ave) |
| 3 | Diaphragms (shear, chords, collectors / drag struts), FTAO, rigid-diaphragm option, shear transfer and **top-plate splices / straps**, uplift path, ledgers; **steel beams / lintels, HSS posts with base / cap plates and anchor rods**; diaphragm schedule. | Reproduces the East Grand steel sheets (W10×22 lintel, HSS 6×6×¼ post, base plate, anchor bolt) and matches your hand-checked lateral calcs on two portfolio houses |
| 4 | **Concrete and CMU walls / stem walls** (reproduces the San Miguel CMU sheet), reinforced footings, slab-on-grade notes, **tie-ins to existing concrete**, hold-down footings; AI extraction into the review table; hardware schedule; general / specific notes generator; full house report; in-tool truss design (port TrussCalc) | Full report from drawings for one real past project (e.g. San Miguel addition or Bluebird remodel) |
| 5 | Validation on 5–10 portfolio sets, fixes, locked versions; optional CFS stud walls, decks, retaining walls | Sign-off checklist complete |

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
2. **Regression sets:** 17 portfolio sets received (Drive › `PORTFOLIO`). Because of §2B Q1–Q4, tell me which sets, if any, have hand-checked lateral and footing results you trust. Otherwise regression uses closed-form results, the Lovable apps and the independent Python reference calcs, and the portfolio sets are used for layout and input fidelity. Send any soils reports for the sets.
3. **Typical house types:** stories, slab-on-grade vs raised floor, roof types, typical spans and hardware.
4. ~~Decisions in §13~~ — answered 2026-10-07.
5. **Phase 4 only:** an Anthropic API key, entered by you directly in the hosting environment. Do not paste keys into chat.

## 17. Exclusions

Steel trusses, cold-formed steel (except the optional stud-wall check), masonry other than CMU walls / stem walls, structural slab design (slab on grade is covered by notes and thickened-slab checks), fire-resistance design (UL assemblies are referenced in notes only), and drawing / detail production. Schedules and notes are formatted for transfer to drawings.
