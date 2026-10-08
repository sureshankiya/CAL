/* Ported from TrussCalc (Roof Truss Planner, src/lib/truss-geometry.ts) — geometry generators unchanged. */
/**
 * 2D roof truss geometry generators.
 * Coordinates in feet, origin at the left heel, y positive upward.
 * The bottom chord lies on y = 0; the top chord runs heel -> apex -> heel.
 */

export type TrussType = "fink" | "howe" | "king" | "queen" | "king-queen" | "parallel" | "custom";

export const TRUSS_TYPES: Record<TrussType, { label: string; description: string }> = {
  fink: { label: "Fink (W) truss", description: "Four top-chord panels with a W web — the common residential profile" },
  howe: { label: "Howe truss", description: "Verticals at panel points with diagonals rising to the apex" },
  king: { label: "King post truss", description: "Single central vertical between apex and bottom chord" },
  queen: { label: "Queen post truss", description: "Two posts at the quarter points with central struts" },
  "king-queen": {
    label: "King + queen post truss",
    description: "Central king post with two quarter-point queen posts and diagonal struts",
  },
  parallel: {
    label: "Parallel chord truss",
    description:
      "Level top and bottom chords framing into the support column, separate end verticals, triangulated web and top-chord overhang",
  },
  custom: { label: "Custom truss", description: "Edit joint coordinates and member connections below" },
};

export interface CustomNode {
  x: number;
  y: number;
  top: boolean;
  bottom: boolean;
}
export interface CustomMember {
  a: number;
  b: number;
  group: MemberGroup;
}
export interface CustomLayout {
  nodes: CustomNode[];
  members: CustomMember[];
}

export const starterLayout = (): CustomLayout => {
  const g = buildTruss("fink", 28, 5);
  return {
    nodes: g.nodes.map(({ x, y, onTopChord, onBottomChord }) => ({ x, y, top: onTopChord, bottom: onBottomChord })),
    members: g.members.map(({ a, b, group }) => ({ a, b, group })),
  };
};

/** EV = end vertical: the post at each support where both chords frame into the column. */
export type MemberGroup = "TC" | "BC" | "WEB" | "EV";

export interface TrussNode {
  id: number;
  name: string;
  x: number;
  y: number;
  onTopChord: boolean;
  onBottomChord: boolean;
}

export interface TrussMember {
  id: number;
  name: string;
  a: number;
  b: number;
  group: MemberGroup;
  length: number; // ft
}

export interface TrussGeometry {
  type: TrussType;
  span: number;
  rise: number;
  pitch: number;
  /** Horizontal eave overhang beyond each heel, ft (0 = none). */
  overhang: number;
  /** Sloped length of one overhang tail, ft. */
  overhangSlope: number;
  /** Tail tip coordinates for drawing (undefined when overhang = 0). */
  tailLeft?: { x: number; y: number };
  tailRight?: { x: number; y: number };
  nodes: TrussNode[];
  members: TrussMember[];
  topChordNodes: number[];
  bottomChordNodes: number[];
  supportLeft: number;
  supportRight: number;
  apex: number;
  slopeLength: number; // full rafter length heel -> apex, ft
}

const NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * HouseCalc extension: parallel-chord truss of depth `depth` (ft) with `panels` equal panels,
 * end verticals at the bearings and either a Warren web with verticals (diagonals alternate)
 * or a Pratt web (diagonals slope down toward mid-span). Bearings at the bottom chord ends.
 */
export function buildParallelChord(
  span: number,
  depth: number,
  panels: number,
  pattern: "warren" | "pratt",
  overhang = 0,
): TrussGeometry {
  const n = Math.max(2, Math.round(panels));
  const pts: Array<{ x: number; y: number; top: boolean; bottom: boolean }> = [];
  const top = Array.from(
    { length: n + 1 },
    (_, i) => (pts.push({ x: (span * i) / n, y: depth, top: true, bottom: false }), pts.length - 1),
  );
  const bot = Array.from(
    { length: n + 1 },
    (_, i) => (pts.push({ x: (span * i) / n, y: 0, top: false, bottom: true }), pts.length - 1),
  );
  const defs: Array<[number, number, MemberGroup]> = [];
  for (let i = 0; i < n; i++) defs.push([top[i], top[i + 1], "TC"], [bot[i], bot[i + 1], "BC"]);
  defs.push([top[0], bot[0], "EV"], [top[n], bot[n], "EV"]);
  for (let i = 1; i < n; i++) defs.push([top[i], bot[i], "WEB"]);
  for (let i = 0; i < n; i++) {
    const leftHalf = (i + 0.5) * (span / n) < span / 2;
    if (pattern === "pratt") {
      // diagonal from the top chord near the support down toward mid-span
      if (leftHalf) defs.push([top[i], bot[i + 1], "WEB"]);
      else defs.push([bot[i], top[i + 1], "WEB"]);
    } else {
      if (i % 2 === 0) defs.push([bot[i], top[i + 1], "WEB"]);
      else defs.push([top[i], bot[i + 1], "WEB"]);
    }
  }
  const nodes: TrussNode[] = pts.map((p, i) => ({
    id: i,
    name: NAMES[i] ?? `N${i}`,
    x: p.x,
    y: p.y,
    onTopChord: p.top,
    onBottomChord: p.bottom,
  }));
  const members: TrussMember[] = defs.map(([a, b, group], i) => ({
    id: i,
    name: `${nodes[a].name}${nodes[b].name}`,
    a,
    b,
    group,
    length: Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y),
  }));
  const oh = Math.max(overhang, 0);
  return {
    type: "parallel",
    span,
    rise: depth,
    pitch: 0,
    overhang: oh,
    overhangSlope: oh,
    tailLeft: oh > 0 ? { x: -oh, y: depth } : undefined,
    tailRight: oh > 0 ? { x: span + oh, y: depth } : undefined,
    nodes,
    members,
    topChordNodes: top,
    bottomChordNodes: bot,
    supportLeft: bot[0],
    supportRight: bot[n],
    apex: top[Math.floor(n / 2)],
    slopeLength: span / 2,
  };
}

export function buildTruss(
  type: TrussType,
  span: number,
  pitch: number,
  overhang = 0,
  custom?: CustomLayout,
): TrussGeometry {
  if (type === "custom" && custom) return buildCustomTruss(custom, span, pitch, overhang);
  const H = (span / 2) * (pitch / 12);
  const pts: Array<{ x: number; y: number; top: boolean; bottom: boolean }> = [];
  const push = (x: number, y: number, top: boolean, bottom: boolean) => {
    pts.push({ x, y, top, bottom });
    return pts.length - 1;
  };

  const memberDefs: Array<[number, number, MemberGroup]> = [];
  const L = span;

  let topIdx: number[] = [];
  let botIdx: number[] = [];

  if (type === "parallel") {
    const top = Array.from({ length: 5 }, (_, i) => push((L * i) / 4, H, true, false));
    const bot = Array.from({ length: 5 }, (_, i) => push((L * i) / 4, 0, false, true));
    topIdx = top;
    botIdx = bot;
    for (let i = 0; i < 4; i++) memberDefs.push([top[i], top[i + 1], "TC"], [bot[i], bot[i + 1], "BC"]);
    memberDefs.push([top[0], bot[0], "EV"], [top[4], bot[4], "EV"]);
    for (let i = 1; i < 4; i++) memberDefs.push([top[i], bot[i], "WEB"]);
    memberDefs.push([bot[0], top[1], "WEB"], [bot[1], top[2], "WEB"], [top[2], bot[3], "WEB"], [top[3], bot[4], "WEB"]);
  } else if (type === "king") {
    const n0 = push(0, 0, true, true);
    const nApex = push(L / 2, H, true, false);
    const n2 = push(L, 0, true, true);
    const nMid = push(L / 2, 0, false, true);
    topIdx = [n0, nApex, n2];
    botIdx = [n0, nMid, n2];
    memberDefs.push([n0, nApex, "TC"], [nApex, n2, "TC"], [n0, nMid, "BC"], [nMid, n2, "BC"], [nApex, nMid, "WEB"]);
  } else if (type === "fink") {
    const n0 = push(0, 0, true, true);
    const t1 = push(L / 4, H / 2, true, false);
    const nApex = push(L / 2, H, true, false);
    const t2 = push((3 * L) / 4, H / 2, true, false);
    const n4 = push(L, 0, true, true);
    const b1 = push(L / 3, 0, false, true);
    const b2 = push((2 * L) / 3, 0, false, true);
    topIdx = [n0, t1, nApex, t2, n4];
    botIdx = [n0, b1, b2, n4];
    memberDefs.push(
      [n0, t1, "TC"],
      [t1, nApex, "TC"],
      [nApex, t2, "TC"],
      [t2, n4, "TC"],
      [n0, b1, "BC"],
      [b1, b2, "BC"],
      [b2, n4, "BC"],
      [t1, b1, "WEB"],
      [b1, nApex, "WEB"],
      [nApex, b2, "WEB"],
      [b2, t2, "WEB"],
    );
  } else if (type === "queen") {
    const a = push(0, 0, true, true);
    const t1 = push(L / 4, H / 2, true, false);
    const apex = push(L / 2, H, true, false);
    const t2 = push((3 * L) / 4, H / 2, true, false);
    const z = push(L, 0, true, true);
    const b1 = push(L / 4, 0, false, true);
    const b2 = push((3 * L) / 4, 0, false, true);
    topIdx = [a, t1, apex, t2, z];
    botIdx = [a, b1, b2, z];
    memberDefs.push(
      [a, t1, "TC"],
      [t1, apex, "TC"],
      [apex, t2, "TC"],
      [t2, z, "TC"],
      [a, b1, "BC"],
      [b1, b2, "BC"],
      [b2, z, "BC"],
      [t1, b1, "WEB"],
      [t2, b2, "WEB"],
      [b1, apex, "WEB"],
      [apex, b2, "WEB"],
    );
  } else {
    // Howe and king–queen share panel points but use different diagonal webs
    const n0 = push(0, 0, true, true);
    const t1 = push(L / 4, H / 2, true, false);
    const nApex = push(L / 2, H, true, false);
    const t2 = push((3 * L) / 4, H / 2, true, false);
    const n4 = push(L, 0, true, true);
    const b1 = push(L / 4, 0, false, true);
    const bm = push(L / 2, 0, false, true);
    const b2 = push((3 * L) / 4, 0, false, true);
    topIdx = [n0, t1, nApex, t2, n4];
    botIdx = [n0, b1, bm, b2, n4];
    memberDefs.push(
      [n0, t1, "TC"],
      [t1, nApex, "TC"],
      [nApex, t2, "TC"],
      [t2, n4, "TC"],
      [n0, b1, "BC"],
      [b1, bm, "BC"],
      [bm, b2, "BC"],
      [b2, n4, "BC"],
      [t1, b1, "WEB"],
      [nApex, bm, "WEB"],
      [t2, b2, "WEB"],
    );
    if (type === "howe") {
      memberDefs.push([b1, nApex, "WEB"], [b2, nApex, "WEB"]);
    } else {
      memberDefs.push([bm, t1, "WEB"], [bm, t2, "WEB"]);
    }
  }

  const nodes: TrussNode[] = pts.map((p, i) => ({
    id: i,
    name: NAMES[i] ?? `N${i}`,
    x: p.x,
    y: p.y,
    onTopChord: p.top,
    onBottomChord: p.bottom,
  }));

  const members: TrussMember[] = memberDefs.map(([a, b, group], i) => {
    const dx = nodes[b].x - nodes[a].x;
    const dy = nodes[b].y - nodes[a].y;
    return {
      id: i,
      name: `${nodes[a].name}${nodes[b].name}`,
      a,
      b,
      group,
      length: Math.hypot(dx, dy),
    };
  });

  topIdx.sort((p, q) => nodes[p].x - nodes[q].x);
  botIdx.sort((p, q) => nodes[p].x - nodes[q].x);

  const oh = Math.max(overhang, 0);
  const tailDrop = type === "parallel" ? 0 : oh * (pitch / 12);

  return {
    type,
    span,
    rise: H,
    pitch,
    overhang: oh,
    overhangSlope: Math.hypot(oh, tailDrop),
    tailLeft: oh > 0 ? { x: -oh, y: type === "parallel" ? H : -tailDrop } : undefined,
    tailRight: oh > 0 ? { x: L + oh, y: type === "parallel" ? H : -tailDrop } : undefined,
    nodes,
    members,
    topChordNodes: topIdx,
    bottomChordNodes: botIdx,
    supportLeft: type === "parallel" ? botIdx[0] : 0,
    supportRight:
      type === "parallel"
        ? botIdx[botIdx.length - 1]
        : nodes.findIndex((n) => Math.abs(n.x - L) < 1e-9 && Math.abs(n.y) < 1e-9),
    apex: nodes.findIndex((n) => Math.abs(n.y - H) < 1e-9),
    slopeLength: Math.hypot(L / 2, H),
  };
}

function buildCustomTruss(layout: CustomLayout, span: number, pitch: number, overhang: number): TrussGeometry {
  const nodes: TrussNode[] = layout.nodes.map((p, id) => ({
    id,
    name: NAMES[id] ?? `N${id}`,
    x: p.x,
    y: p.y,
    onTopChord: p.top,
    onBottomChord: p.bottom,
  }));
  const members: TrussMember[] = layout.members.map((m, id) => ({
    ...m,
    id,
    name: `${nodes[m.a].name}${nodes[m.b].name}`,
    length: Math.hypot(nodes[m.a].x - nodes[m.b].x, nodes[m.a].y - nodes[m.b].y),
  }));
  const topChordNodes = nodes
    .filter((n) => n.onTopChord)
    .sort((a, b) => a.x - b.x)
    .map((n) => n.id);
  const bottomChordNodes = nodes
    .filter((n) => n.onBottomChord)
    .sort((a, b) => a.x - b.x)
    .map((n) => n.id);
  const rise = Math.max(...nodes.map((n) => n.y));
  const tailLeft = topChordNodes[0] !== undefined ? nodes[topChordNodes[0]] : undefined;
  const tailRight = topChordNodes.length ? nodes[topChordNodes[topChordNodes.length - 1]] : undefined;
  const leftSlope =
    topChordNodes.length > 1
      ? (nodes[topChordNodes[1]].y - (tailLeft?.y ?? 0)) / (nodes[topChordNodes[1]].x - (tailLeft?.x ?? 0))
      : 0;
  const rightSlope =
    topChordNodes.length > 1
      ? ((tailRight?.y ?? 0) - nodes[topChordNodes[topChordNodes.length - 2]].y) /
        ((tailRight?.x ?? span) - nodes[topChordNodes[topChordNodes.length - 2]].x)
      : 0;
  const oh = Math.max(0, overhang);
  return {
    type: "custom",
    span,
    pitch,
    rise,
    overhang: oh,
    overhangSlope: oh * Math.hypot(1, leftSlope),
    tailLeft: oh ? { x: -oh, y: (tailLeft?.y ?? 0) - oh * leftSlope } : undefined,
    tailRight: oh ? { x: span + oh, y: (tailRight?.y ?? 0) - oh * rightSlope } : undefined,
    nodes,
    members,
    topChordNodes,
    bottomChordNodes,
    supportLeft: bottomChordNodes[0],
    supportRight: bottomChordNodes[bottomChordNodes.length - 1],
    apex: nodes.reduce((best, n) => (n.y > nodes[best].y ? n.id : best), 0),
    slopeLength: Math.hypot(span / 2, rise),
  };
}
