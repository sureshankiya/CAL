/**
 * Typical framing fastening for the general notes sheet — common-nail options of IBC / CBC
 * Table 2304.10.2 (IRC / CRC Table R602.3(1) gives the same values for these items).
 * Data-library status: unverified — confirm against the adopted edition before issue; the
 * table carries the other permitted fasteners (box nails, pneumatic nails, staples).
 * Rows: connection, fastener, location / spacing.
 */
export const TYPICAL_NAILING: Array<[string, string, string]> = [
  [
    "Blocking between ceiling joists, rafters or trusses to top plate",
    "3-8d common (2-1/2 x 0.131)",
    "Toenail each end",
  ],
  ["Ceiling joist to top plate", "3-8d common (2-1/2 x 0.131)", "Toenail each joist"],
  ["Ceiling joist laps over partitions (not attached to rafters)", "3-16d common (3-1/2 x 0.162)", "Face nail"],
  ["Collar tie to rafter", "3-10d common (3 x 0.148)", "Face nail each rafter"],
  ["Rafter or roof truss to top plate", "3-10d common (3 x 0.148)", "Toenail (connector where scheduled)"],
  [
    "Rafter to ridge, valley or hip rafter; rafter to 2 in. ridge beam",
    "2-16d common / 3-10d common",
    "End nail / toenail",
  ],
  ["Stud to stud (not at braced wall panels)", "16d common (3-1/2 x 0.162)", "24 in. o.c. face nail"],
  [
    "Built-up header (2 in. to 2 in. with 1/2 in. spacer)",
    "16d common (3-1/2 x 0.162)",
    "16 in. o.c. each edge, face nail",
  ],
  ["Continuous header to stud", "4-8d common (2-1/2 x 0.131)", "Toenail"],
  ["Top plate to top plate", "16d common (3-1/2 x 0.162)", "16 in. o.c. face nail"],
  [
    "Double top plate splice (24 in. min. lap each side)",
    "8-16d common (3-1/2 x 0.162)",
    "Face nail each side of end joint",
  ],
  [
    "Bottom plate to joist, rim or blocking (not at braced wall panels)",
    "16d common (3-1/2 x 0.162)",
    "16 in. o.c. face nail",
  ],
  [
    "Bottom plate to joist, rim or blocking at braced wall panels",
    "3-16d common (3-1/2 x 0.162)",
    "Each 16 in., face nail",
  ],
  ["Top or bottom plate to stud", "2-16d common / 4-8d common", "End nail / toenail"],
  ["Top plates, laps at corners and intersections", "2-16d common (3-1/2 x 0.162)", "Face nail"],
  ["Joist to sill, top plate or girder", "3-8d common (2-1/2 x 0.131)", "Toenail"],
  [
    "Rim, band joist or blocking to top plate, sill or framing below",
    "8d common (2-1/2 x 0.131)",
    "6 in. o.c. toenail",
  ],
  ["Joist to band or rim joist", "3-16d common (3-1/2 x 0.162)", "End nail"],
  ["Bridging or blocking to joist, rafter or truss", "2-8d common (2-1/2 x 0.131)", "Each end, toenail"],
  [
    "Built-up girders and beams, 2 in. layers (unless scheduled)",
    "20d common (4 x 0.192)",
    "32 in. o.c. top and bottom, staggered; 2-20d at ends and splices",
  ],
  ["Ledger strip supporting joists or rafters", "3-16d common (3-1/2 x 0.162)", "Each joist or rafter, face nail"],
  ["2 in. subfloor to joist or girder", "2-16d common (3-1/2 x 0.162)", "Face nail each bearing"],
  [
    "Wood structural panels 3/8 to 1/2 in. (roof, wall, subfloor)",
    "8d common (2-1/2 x 0.131)",
    "6 in. edges / 12 in. field (unless scheduled)",
  ],
  [
    "Wood structural panels 19/32 to 1 in.",
    "8d common (2-1/2 x 0.131)",
    "6 in. edges / 12 in. field (unless scheduled)",
  ],
  [
    "Wood structural panels 1-1/8 to 1-1/4 in.",
    "10d common (3 x 0.148)",
    "6 in. edges / 12 in. field (unless scheduled)",
  ],
];
