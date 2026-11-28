---
name: "housecalc-from-drawings"
description: "Use when Suresh provides structural drawing sets (PDF and/or DWG) and wants them analysed and filled into his HouseCalc calculator to produce the calc report. Works through the housecalc MCP tools, not the browser."
---

# HouseCalc from drawings

Turn a structural drawing set (PDF sheets S-0..S-10 and/or the DWG) into a complete HouseCalc model, run it, and deliver the Tedds-style report. Treat it as an engineering deliverable, not Q&A.

## Inputs

- PDF drawing set: schedules (beam, joist, header, post, shear wall, hold-down, strap, connector, foundation, wall legends), criteria (S-0), sections.
- DWG: geometry for spans, tributaries, wall lengths, existing-wall hatches, footing outlines. DWG schedule tables are often empty or text-as-solids - take schedule contents from the PDF.
- HouseCalc connector (MCP server `housecalc`): drive the calculator through its tools — never open the app in a browser or take screenshots to enter data or read results.

## HouseCalc tools (use these, not the browser)

| Tool                                                                | Use                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `load_project`                                                      | open a `.housecalc.json` (path) or start `new`                                                            |
| `fill_from_markdown`                                                | build / update the model from the input .md (mode `new` or `fill`); read `errors`, `ignored`, `defaulted` |
| `project_summary`                                                   | info, criteria, levels, marks, every member with callout, status, governing D/C                           |
| `get_member`                                                        | one member: inputs, every check, reactions, flags, assumptions                                            |
| `add_member` / `update_member` / `delete_member` / `update_project` | change the model; each edit is validated, a rejected edit changes nothing                                 |
| `run_design`                                                        | design the package: package checks, `validation` list (open items), member statuses                       |
| `save_project` / `export_markdown`                                  | write the `.housecalc.json` and the input .md                                                             |

If the `housecalc` tools are missing, stop and tell Suresh the HouseCalc plugin is not installed (do not fall back to the browser).

## Workflow

1. **Read drawings**
   - PDF: pdfplumber words with coordinates; cluster rows per schedule title (BEAM SCHEDULE, POST SCHEDULE, SHEAR WALL SCHEDULE, FOUNDATION SCHEDULE, JOIST SCHEDULE, HEADER SCHEDULE, HOLDOWN SCHEDULE, wall legends).
   - DWG: convert with LibreDWG dwg2dxf; repair split DXF group values (join lines whose code line is not an integer); read with ezdxf recover. Extract LINE/LWPOLYLINE (incl. INSERT virtual entities), TEXT/MTEXT, ARC, HATCH.
   - Render regions with ezdxf drawing addon (black on white) to read plans visually.
   - If a newer DWG is supplied, diff it against the previous one (segments and texts) and report revisions (e.g. renamed / new beam marks).
2. **Grid coordinates**: per plan region, origin at grid A / line 1, X east and Y south in ft. Record offsets between plans (framing vs architectural vs foundation).
3. **Measure**
   - Joists: split joist lines at bearing supports (walls >= 20 ft and arcs always bearing; NBW-labelled walls not supports; merge double lines < 14 in.).
   - Beam tributary = average half-span each side x coverage x sin(skew); parallel joists = edge strip 0.67 ft.
   - Bearing walls: tributary from joists above, plus line/point links to walls and beams above.
4. **Include every scheduled member**: all beams, headers H1-Hn, all joist schedule rows (new and existing), posts incl. existing (e.g. SC2), every wall labelled BW on the framing plans, all shear walls, all footing marks at every plan location (new and existing), hold-down footings for every HD-tagged shear wall. Produce a schedule-to-model cross-check CSV.
5. **Lateral** (ASCE 7 ELF, SDPWS-2021)
   - Wall lines with flexible-diaphragm lever rule restricted to each line's zone; trib = share x plan dimension, omit pos so HouseCalc uses the entered trib.
   - Diagonal walls: X component 0.5 L, Y component 0.866 L (60 deg).
   - Remodel: credit existing exterior walls (DWG existing-wall hatch, openings subtracted, piers with h/b > 3.5 excluded) as shear walls, ASSUMED 3/8 in. WSP 8d @ 6 in., with retrofit levels (hold-downs, adhesive sill anchors, re-nail) chosen by sweep. Do not credit interior gypsum partitions. Never put all load on new walls.
6. **Footings**
   - Model existing footings (status existing; drawn width, assumed depth/reinforcement flagged, plain concrete when unknown).
   - When a footing fails, increase reinforcement, not size; engaged length of continuous footings may be extended with longitudinal bars/dowels. Report bearing failures that reinforcement cannot fix (needs geotech value).
7. **Run and check** (housecalc tools): `load_project` (`new`) → `fill_from_markdown` with the generated .md → `run_design`. Fix every item in `validation` (failing checks, errors, uncarried reactions, untied uplift, REQUIRED INPUT) with `update_member` / `update_project`, re-running `run_design` after each round; sweep variants the same way. Hand-check line forces and unit shears (SDPWS-2021 aspect factor 1.25 - 0.125 h/b) against `get_member`. Call out remaining VERIFY items to Suresh; ask before changing his design intent.
8. **Deliver**: `save_project` (.housecalc.json) and `export_markdown` (input .md), plus line-check CSV, existing-wall schedule CSV, schedule cross-check CSV. The report PDF / Word is printed from the HouseCalc app (open the saved .housecalc.json → Export PDF / Word) — the connector cannot lay out report pages. Summarise what changed, governing failures, open validation items and assumptions to confirm.

## Wording

The HouseCalc report cleaner strips phrases with "verify" - write "to be inspected in the field" instead.

## Defaults

2025 CBC/CRC, ASCE 7-22, NDS-2024, SDPWS-2021, ACI 318-19; U.S. customary units; Tekla Tedds-style plain report; explicit assumptions; PASS/FAIL with D/C.
