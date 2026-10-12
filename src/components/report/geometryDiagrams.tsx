/**
 * Geometry diagrams in the Tedds manner: the member cross-section with its dimensions
 * (sawn / built-up / SCL / glulam, steel W / C / HSS), post and column elevations with the
 * bracing and effective lengths, stud-wall and shear-wall elevations, the rafter geometry,
 * footing plans, the base-plate plan and the masonry wall elevation. Every figure is drawn
 * from the member's own input, to scale within the figure.
 */

import type React from "react";
import type { ResolvedWood } from "@/engine/design/wood";
import type { SteelShape } from "@/engine/data/steel";
import { fmt, fmtFtIn } from "@/engine/core/fmt";
import { DC } from "./diagramColors";

const W = 470;
const txt: React.CSSProperties = { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 8, fill: DC.ink };
const dimTxt: React.CSSProperties = { ...txt, fontSize: 7.5, fill: DC.dim };
const head: React.CSSProperties = { ...txt, fontSize: 8.5, fontWeight: 700 };
const WOOD = { fill: "#ecd5ac", stroke: "#8d6e3c" };
const STEEL = { fill: "#cfd8dc", stroke: "#37474f" };
const inch = (v: number) => `${+v.toFixed(3)} in.`;

export function GeoRow({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <div className="avoid-break mb-1 block">
          <svg
            width="100%"
            viewBox={`0 -14 ${W} ${height + 14}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
          >
            <text x={0} y={-3} style={{ ...txt, fontSize: 9.5, fontWeight: 700 }}>
              {title}
            </text>
            {children}
          </svg>
        </div>
      </td>
    </tr>
  );
}

function HDim({ x1, x2, y, label, up }: { x1: number; x2: number; y: number; label: string; up?: boolean }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x1} y1={y - 3} x2={x1} y2={y + 3} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x2} y1={y - 3} x2={x2} y2={y + 3} stroke={DC.dim} strokeWidth={0.6} />
      <text x={(x1 + x2) / 2} y={up ? y - 3 : y + 9} textAnchor="middle" style={dimTxt}>
        {label}
      </text>
    </g>
  );
}

function VDim({ x, y1, y2, label, right }: { x: number; y1: number; y2: number; label: string; right?: boolean }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x - 3} y1={y1} x2={x + 3} y2={y1} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x - 3} y1={y2} x2={x + 3} y2={y2} stroke={DC.dim} strokeWidth={0.6} />
      <text x={right ? x + 4 : x - 4} y={(y1 + y2) / 2 + 3} textAnchor={right ? "start" : "end"} style={dimTxt}>
        {label}
      </text>
    </g>
  );
}

/** notes listed at the right of a figure, wrapped to the space left on the sheet */
function Notes({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const max = Math.max(18, Math.floor((W - x) / 4.4));
  const rows: Array<{ t: string; first: boolean }> = [];
  lines.forEach((l, i) => {
    let cur = "";
    for (const w of l.split(" ")) {
      if (cur && (cur + " " + w).length > max) {
        rows.push({ t: cur, first: i === 0 });
        cur = `  ${w}`;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    rows.push({ t: cur, first: i === 0 });
  });
  return (
    <g>
      {rows.map((r, i) => (
        <text key={i} x={x} y={y + i * 11} style={r.first ? head : txt} xmlSpace="preserve">
          {r.t}
        </text>
      ))}
    </g>
  );
}

const Pin = ({ x, y, up }: { x: number; y: number; up?: boolean }) => (
  <polygon
    points={up ? `${x},${y} ${x - 6},${y - 9} ${x + 6},${y - 9}` : `${x},${y} ${x - 6},${y + 9} ${x + 6},${y + 9}`}
    fill={DC.concreteFill}
    stroke={DC.support}
    strokeWidth={0.9}
  />
);

/* ------------------------------------------------------------------ sections */

/** wood cross-section drawn at (cx, cy), scale sc px/in; returns the shapes */
function woodShapes(m: ResolvedWood, cx: number, cy: number, sc: number) {
  const n = Math.max(1, m.plies);
  const bp = m.bPly || m.b / n;
  const x0 = cx - (m.b * sc) / 2;
  const y0 = cy - (m.d * sc) / 2;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect
            x={x0 + i * bp * sc}
            y={y0}
            width={bp * sc}
            height={m.d * sc}
            fill={WOOD.fill}
            stroke={WOOD.stroke}
            strokeWidth={1}
          />
          {/* growth-ring hint */}
          <path
            d={`M ${x0 + i * bp * sc + bp * sc * 0.2} ${y0 + m.d * sc * 0.15} q ${bp * sc * 0.3} ${m.d * sc * 0.35} 0 ${m.d * sc * 0.7}`}
            fill="none"
            stroke={WOOD.stroke}
            strokeWidth={0.4}
            strokeOpacity={0.6}
          />
        </g>
      ))}
      {m.kind === "glulam"
        ? Array.from({ length: Math.max(1, Math.round(m.d / 1.5)) - 1 }, (_, k) => (
            <line
              key={`lam${k}`}
              x1={x0}
              x2={x0 + m.b * sc}
              y1={y0 + (k + 1) * 1.5 * sc}
              y2={y0 + (k + 1) * 1.5 * sc}
              stroke={WOOD.stroke}
              strokeWidth={0.35}
            />
          ))
        : null}
    </g>
  );
}

/** cross-section of a wood member with b, d and the section properties */
export function WoodSection({ m, title = "Section" }: { m: ResolvedWood; title?: string }) {
  const sc = Math.min(110 / m.d, 150 / m.b, 14);
  const cx = 120;
  const cy = 70;
  const x0 = cx - (m.b * sc) / 2;
  const y0 = cy - (m.d * sc) / 2;
  const n = Math.max(1, m.plies);
  return (
    <GeoRow title={title} height={150}>
      {woodShapes(m, cx, cy, sc)}
      {/* neutral axes */}
      <line
        x1={x0 - 12}
        y1={cy}
        x2={x0 + m.b * sc + 12}
        y2={cy}
        stroke={DC.axis}
        strokeWidth={0.5}
        strokeDasharray="6 2 1 2"
      />
      <line
        x1={cx}
        y1={y0 - 10}
        x2={cx}
        y2={y0 + m.d * sc + 10}
        stroke={DC.axis}
        strokeWidth={0.5}
        strokeDasharray="6 2 1 2"
      />
      <text x={x0 + m.b * sc + 14} y={cy + 3} style={dimTxt}>
        x
      </text>
      <text x={cx + 3} y={y0 - 4} style={dimTxt}>
        y
      </text>
      <HDim
        x1={x0}
        x2={x0 + m.b * sc}
        y={y0 + m.d * sc + 12}
        label={`b = ${inch(m.b)}${n > 1 ? ` (${n} × ${inch(m.bPly)})` : ""}`}
      />
      <VDim x={x0 - 18} y1={y0} y2={y0 + m.d * sc} label={`d = ${inch(m.d)}`} />
      <Notes
        x={260}
        y={30}
        lines={[
          m.label,
          ...(m.label.includes(m.speciesLabel) ? [] : [m.speciesLabel]),
          `A = ${fmt(m.A, 2)} in²`,
          `S_x = ${fmt(m.S, 2)} in³`,
          `I_x = ${fmt(m.I, 1)} in⁴`,
          ...(n > 1 ? [`${n} plies, fastened per NDS 15.3 / manufacturer`] : []),
        ]}
      />
    </GeoRow>
  );
}

/** steel shape outline (W, C, rectangular or round HSS) at (cx, cy), scale sc */
function steelShapes(s: SteelShape, cx: number, cy: number, sc: number) {
  const d = s.d * sc;
  const b = s.bf * sc;
  const tf = Math.max(1, s.tf * sc);
  const tw = Math.max(1, s.tw * sc);
  const x0 = cx - b / 2;
  const y0 = cy - d / 2;
  if (s.family === "HSSR")
    return (
      <g>
        <circle cx={cx} cy={cy} r={d / 2} fill={STEEL.fill} stroke={STEEL.stroke} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={Math.max(1, d / 2 - tw)} fill="white" stroke={STEEL.stroke} strokeWidth={0.8} />
      </g>
    );
  if (s.family === "HSS") {
    const r = Math.min(2 * s.tw * sc, b / 4);
    return (
      <g>
        <rect x={x0} y={y0} width={b} height={d} rx={r} fill={STEEL.fill} stroke={STEEL.stroke} strokeWidth={1} />
        <rect
          x={x0 + tw}
          y={y0 + tw}
          width={b - 2 * tw}
          height={d - 2 * tw}
          rx={Math.max(0, r - tw)}
          fill="white"
          stroke={STEEL.stroke}
          strokeWidth={0.8}
        />
      </g>
    );
  }
  if (s.family === "C") {
    const pts = [
      [x0, y0],
      [x0 + b, y0],
      [x0 + b, y0 + tf],
      [x0 + tw, y0 + tf],
      [x0 + tw, y0 + d - tf],
      [x0 + b, y0 + d - tf],
      [x0 + b, y0 + d],
      [x0, y0 + d],
    ];
    return (
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={STEEL.fill} stroke={STEEL.stroke} strokeWidth={1} />
    );
  }
  const pts = [
    [x0, y0],
    [x0 + b, y0],
    [x0 + b, y0 + tf],
    [cx + tw / 2, y0 + tf],
    [cx + tw / 2, y0 + d - tf],
    [x0 + b, y0 + d - tf],
    [x0 + b, y0 + d],
    [x0, y0 + d],
    [x0, y0 + d - tf],
    [cx - tw / 2, y0 + d - tf],
    [cx - tw / 2, y0 + tf],
    [x0, y0 + tf],
  ];
  return (
    <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={STEEL.fill} stroke={STEEL.stroke} strokeWidth={1} />
  );
}

/** steel cross-section with d, b_f, t_f, t_w and the section properties */
export function SteelSection({ s, grade, title = "Section" }: { s: SteelShape; grade?: string; title?: string }) {
  const sc = Math.min(110 / s.d, 150 / s.bf, 12);
  const cx = 120;
  const cy = 70;
  const x0 = cx - (s.bf * sc) / 2;
  const y0 = cy - (s.d * sc) / 2;
  const hss = s.family === "HSS" || s.family === "HSSR";
  return (
    <GeoRow title={title} height={150}>
      {steelShapes(s, cx, cy, sc)}
      <line
        x1={x0 - 12}
        y1={cy}
        x2={x0 + s.bf * sc + 12}
        y2={cy}
        stroke={DC.axis}
        strokeWidth={0.5}
        strokeDasharray="6 2 1 2"
      />
      <line
        x1={cx}
        y1={y0 - 10}
        x2={cx}
        y2={y0 + s.d * sc + 10}
        stroke={DC.axis}
        strokeWidth={0.5}
        strokeDasharray="6 2 1 2"
      />
      <HDim
        x1={x0}
        x2={x0 + s.bf * sc}
        y={y0 + s.d * sc + 12}
        label={s.family === "HSSR" ? `OD = ${inch(s.d)}` : `${hss ? "B" : "b_f"} = ${inch(s.bf)}`}
      />
      {s.family !== "HSSR" ? (
        <VDim x={x0 - 18} y1={y0} y2={y0 + s.d * sc} label={`${hss ? "H" : "d"} = ${inch(s.d)}`} />
      ) : null}
      <Notes
        x={260}
        y={30}
        lines={[
          `${s.name}${grade ? ` — ${grade}` : ""}`,
          hss ? `t_des = ${inch(s.tw)}` : `t_f = ${inch(s.tf)}; t_w = ${inch(s.tw)}`,
          `A = ${fmt(s.A, 2)} in²; ${fmt(s.wt, 1)} lb/ft`,
          `I_x = ${fmt(s.Ix, 1)} in⁴; S_x = ${fmt(s.Sx, 2)} in³; Z_x = ${fmt(s.Zx, 2)} in³`,
          `I_y = ${fmt(s.Iy, 1)} in⁴; r_x = ${fmt(s.rx, 2)} in.`,
        ]}
      />
    </GeoRow>
  );
}

/* ---------------------------------------------------------------- elevations */

/**
 * post / column elevation: height, end conditions, brace points by axis and effective
 * lengths, with the section beside it
 */
export function ColumnElevation({
  height,
  braceStrong,
  braceWeak,
  leX,
  leY,
  base,
  section,
  sectionLabel,
}: {
  /** ft */
  height: number;
  /** ft (0 / undefined = full height) */
  braceStrong?: number;
  braceWeak?: number;
  /** effective lengths, in */
  leX: number;
  leY: number;
  base: string;
  section: { kind: "wood"; m: ResolvedWood } | { kind: "steel"; s: SteelShape };
  sectionLabel: string;
}) {
  const H = 150;
  const x = 80;
  const yTop = 10;
  const yBot = yTop + H;
  const Y = (ft: number) => yBot - (ft / height) * H;
  const widthPx = 12;
  const braces = (iv: number | undefined) =>
    iv && iv > 0 && iv < height ? Array.from({ length: Math.floor(height / iv - 1e-9) }, (_, i) => (i + 1) * iv) : [];
  const bx = braces(braceStrong);
  const by = braces(braceWeak);
  const fill = section.kind === "wood" ? WOOD : STEEL;
  const secSc =
    section.kind === "wood"
      ? Math.min(70 / section.m.d, 70 / section.m.b, 10)
      : Math.min(70 / section.s.d, 70 / section.s.bf, 9);
  return (
    <GeoRow title="Geometry — elevation and section" height={yBot + 22}>
      <rect
        x={x - widthPx / 2}
        y={yTop}
        width={widthPx}
        height={H}
        fill={fill.fill}
        stroke={fill.stroke}
        strokeWidth={1}
      />
      <Pin x={x} y={yTop} up />
      <Pin x={x} y={yBot} />
      <line x1={x - 14} y1={yBot + 9} x2={x + 14} y2={yBot + 9} stroke={DC.support} strokeWidth={1} />
      {bx.map((b, i) => (
        <g key={`bx${i}`}>
          <line x1={x + widthPx / 2} y1={Y(b)} x2={x + 26} y2={Y(b)} stroke={DC.shear} strokeWidth={1.2} />
          <text x={x + 28} y={Y(b) + 3} style={{ ...dimTxt, fill: DC.shear }}>
            brace (x-axis)
          </text>
        </g>
      ))}
      {by.map((b, i) => (
        <g key={`by${i}`}>
          <line x1={x - widthPx / 2} y1={Y(b)} x2={x - 26} y2={Y(b)} stroke={DC.defl} strokeWidth={1.2} />
          <text x={x - 28} y={Y(b) + 3} textAnchor="end" style={{ ...dimTxt, fill: DC.defl }}>
            brace (y-axis)
          </text>
        </g>
      ))}
      <VDim x={x - 40} y1={yTop} y2={yBot} label={`H = ${fmtFtIn(height)}`} />
      <text x={x} y={yBot + 20} textAnchor="middle" style={dimTxt}>
        {base}
      </text>
      <g>
        {section.kind === "wood" ? woodShapes(section.m, 210, 60, secSc) : steelShapes(section.s, 210, 60, secSc)}
        <text x={210} y={118} textAnchor="middle" style={dimTxt}>
          {sectionLabel}
        </text>
      </g>
      <Notes
        x={290}
        y={30}
        lines={[
          "Effective lengths",
          `l_e,x = ${fmtFtIn(leX / 12)} (strong axis)`,
          `l_e,y = ${fmtFtIn(leY / 12)} (weak axis)`,
          bx.length ? `x-axis braced at ${fmtFtIn(braceStrong!)} o.c.` : "x-axis: full height",
          by.length ? `y-axis braced at ${fmtFtIn(braceWeak!)} o.c.` : "y-axis: full height",
        ]}
      />
    </GeoRow>
  );
}

/** stud-wall elevation: plates, studs at spacing, openings with headers, stud packs */
export function StudWallElevation({
  length,
  plateHeight,
  spacing,
  stud,
  topPlates,
  bottomPlates,
  openings,
  packs,
  sheathing,
}: {
  length: number;
  plateHeight: number;
  spacing: number;
  stud: string;
  topPlates: number;
  bottomPlates: number;
  openings: Array<{ label: string; x1: number; x2: number }>;
  packs: Array<{ x: number; studs: number; label?: string }>;
  sheathing: "both" | "one" | "none";
}) {
  const shownL = Math.min(length, 24);
  const sc = Math.min(280 / (shownL * 12), 150 / (plateHeight * 12));
  const x0 = 40;
  const yTop = 12;
  const X = (ft: number) => x0 + ft * 12 * sc;
  const Y = (inUp: number) => yTop + (plateHeight * 12 - inUp) * sc;
  const plate = 1.5;
  const studs: number[] = [];
  for (let x = 0; x <= shownL * 12 + 1e-6; x += spacing) studs.push(x / 12);
  const inOpening = (x: number) => openings.some((o) => x > o.x1 + 0.05 && x < o.x2 - 0.05);
  const yb = Y(0);
  return (
    <GeoRow title="Geometry — wall elevation" height={yb + 42}>
      {sheathing !== "none" ? (
        <rect x={X(0)} y={Y(plateHeight * 12)} width={shownL * 12 * sc} height={plateHeight * 12 * sc} fill="#f3ead8" />
      ) : null}
      {/* plates */}
      {Array.from({ length: topPlates }, (_, i) => (
        <rect
          key={`tp${i}`}
          x={X(0)}
          y={Y(plateHeight * 12 - i * plate)}
          width={shownL * 12 * sc}
          height={plate * sc}
          fill={WOOD.fill}
          stroke={WOOD.stroke}
          strokeWidth={0.7}
        />
      ))}
      {Array.from({ length: bottomPlates }, (_, i) => (
        <rect
          key={`bp${i}`}
          x={X(0)}
          y={Y((i + 1) * plate)}
          width={shownL * 12 * sc}
          height={plate * sc}
          fill={WOOD.fill}
          stroke={WOOD.stroke}
          strokeWidth={0.7}
        />
      ))}
      {/* studs */}
      {studs
        .filter((x) => !inOpening(x))
        .map((x, i) => (
          <rect
            key={`s${i}`}
            x={X(x) - 0.75 * sc}
            y={Y(plateHeight * 12 - topPlates * plate)}
            width={Math.max(1.2, 1.5 * sc)}
            height={(plateHeight * 12 - (topPlates + bottomPlates) * plate) * sc}
            fill={WOOD.fill}
            stroke={WOOD.stroke}
            strokeWidth={0.5}
          />
        ))}
      {/* openings with headers */}
      {openings
        .filter((o) => o.x1 < shownL)
        .map((o, i) => {
          const a = X(o.x1);
          const b = X(Math.min(o.x2, shownL));
          const hdr = 12 * sc;
          const top = Y(plateHeight * 12 - topPlates * plate);
          return (
            <g key={`o${i}`}>
              <rect x={a} y={top} width={b - a} height={hdr} fill="#d7b98e" stroke={WOOD.stroke} strokeWidth={0.8} />
              <rect
                x={a}
                y={top + hdr}
                width={b - a}
                height={yb - top - hdr - bottomPlates * plate * sc}
                fill="white"
                stroke={DC.dim}
                strokeWidth={0.6}
                strokeDasharray="3 2"
              />
              <text x={(a + b) / 2} y={top + hdr + 12} textAnchor="middle" style={dimTxt}>
                {o.label}
              </text>
            </g>
          );
        })}
      {/* stud packs */}
      {packs
        .filter((p) => p.x <= shownL)
        .map((p, i) => (
          <g key={`pk${i}`}>
            <rect
              x={X(p.x) - p.studs * 0.75 * sc}
              y={Y(plateHeight * 12 - topPlates * plate)}
              width={p.studs * 1.5 * sc}
              height={(plateHeight * 12 - (topPlates + bottomPlates) * plate) * sc}
              fill="#c9a26b"
              stroke={WOOD.stroke}
              strokeWidth={0.7}
            />
            <text
              x={X(p.x)}
              y={Y(plateHeight * 12 - topPlates * plate) + 9}
              textAnchor="middle"
              style={{ ...dimTxt, fill: DC.moment, fontWeight: 700 }}
            >
              P{i + 1}
            </text>
          </g>
        ))}
      <line x1={X(0) - 8} y1={yb} x2={X(shownL) + 8} y2={yb} stroke={DC.support} strokeWidth={1.2} />
      <VDim x={X(0) - 10} y1={Y(plateHeight * 12)} y2={yb} label={fmtFtIn(plateHeight)} />
      <HDim
        x1={X(0)}
        x2={X(shownL)}
        y={yb + 10}
        label={shownL < length ? `${fmtFtIn(shownL)} shown of ${fmtFtIn(length)}` : fmtFtIn(length)}
      />
      <HDim x1={X(studs[0])} x2={X(studs[1] ?? studs[0])} y={yb + 26} label={`${inch(spacing)} o.c.`} />
      <Notes
        x={340}
        y={24}
        lines={[
          `${stud} @ ${inch(spacing)} o.c.`,
          `${topPlates} top / ${bottomPlates} bottom plate${bottomPlates > 1 ? "s" : ""}`,
          `plate height ${fmtFtIn(plateHeight)}`,
          sheathing === "none" ? "unsheathed" : `sheathed ${sheathing === "both" ? "both faces" : "one face"}`,
          ...packs.filter((p) => p.x <= shownL).map((p, i) => `P${i + 1}: (${p.studs}) ${p.label ?? "stud pack"}`),
        ]}
      />
    </GeoRow>
  );
}

/** shear-wall elevation: panel b × h, end posts, hold-downs, sill anchors, opening */
export function ShearWallElevation({
  b,
  h,
  endPost,
  holdown,
  sides,
  opening,
  sillSpacing,
}: {
  b: number;
  h: number;
  endPost: string;
  holdown?: string;
  sides: string[];
  opening?: { L1: number; Lo: number; L2: number; ha: number; hb: number };
  /** sill anchor spacing, in */
  sillSpacing?: number;
}) {
  const sc = Math.min(260 / (b * 12), 140 / (h * 12));
  const x0 = 50;
  const yTop = 14;
  const X = (ft: number) => x0 + ft * 12 * sc;
  const Y = (ft: number) => yTop + (h - ft) * 12 * sc;
  const yb = Y(0);
  return (
    <GeoRow title="Geometry — shear wall elevation" height={yb + 28}>
      <rect
        x={X(0)}
        y={Y(h)}
        width={b * 12 * sc}
        height={h * 12 * sc}
        fill="#f3ead8"
        stroke={WOOD.stroke}
        strokeWidth={1}
      />
      {/* panel edges (edge nailing) */}
      <rect
        x={X(0) + 2}
        y={Y(h) + 2}
        width={b * 12 * sc - 4}
        height={h * 12 * sc - 4}
        fill="none"
        stroke={DC.moment}
        strokeWidth={0.6}
        strokeDasharray="2 2"
      />
      {Array.from({ length: Math.floor(b / 4 - 1e-6) }, (_, i) => (i + 1) * 4).map((x) => (
        <line
          key={`j${x}`}
          x1={X(x)}
          y1={Y(h)}
          x2={X(x)}
          y2={yb}
          stroke={DC.moment}
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
      ))}
      {opening ? (
        <rect
          x={X(opening.L1)}
          y={Y(h - opening.ha)}
          width={opening.Lo * 12 * sc}
          height={(h - opening.ha - opening.hb) * 12 * sc}
          fill="white"
          stroke={DC.dim}
          strokeWidth={0.8}
        />
      ) : null}
      {/* end posts */}
      {[0, b].map((x, i) => (
        <rect
          key={`p${i}`}
          x={X(x) - (i ? 3.5 : 0) * sc}
          y={Y(h)}
          width={3.5 * sc}
          height={h * 12 * sc}
          fill={WOOD.fill}
          stroke={WOOD.stroke}
          strokeWidth={0.8}
        />
      ))}
      {/* hold-downs at the base of the end posts */}
      {holdown
        ? [0, b].map((x, i) => (
            <rect
              key={`hd${i}`}
              x={X(x) + (i ? -3.5 * sc - 5 : 3.5 * sc)}
              y={yb - 18}
              width={5}
              height={16}
              fill={DC.support}
            />
          ))
        : null}
      {/* sill anchors */}
      {sillSpacing
        ? Array.from(
            { length: Math.max(0, Math.floor((b * 12 - 24) / sillSpacing) + 1) },
            (_, i) => 12 + i * sillSpacing,
          )
            .filter((v) => v <= b * 12 - 12)
            .map((v, i) => (
              <line
                key={`a${i}`}
                x1={x0 + v * sc}
                y1={yb - 3}
                x2={x0 + v * sc}
                y2={yb + 6}
                stroke={DC.ink}
                strokeWidth={1.2}
              />
            ))
        : null}
      <line x1={X(0) - 10} y1={yb} x2={X(b) + 10} y2={yb} stroke={DC.support} strokeWidth={1.2} />
      <HDim x1={X(0)} x2={X(b)} y={yb + 10} label={`b = ${fmtFtIn(b)}`} />
      <VDim x={X(0) - 12} y1={Y(h)} y2={yb} label={`h = ${fmtFtIn(h)}`} />
      <Notes
        x={330}
        y={24}
        lines={[
          `h / b = ${fmt(h / b, 2)}`,
          ...sides.map((s, i) => `${sides.length > 1 ? `Side ${i + 1}: ` : ""}${s}`),
          `end posts ${endPost}`,
          ...(holdown ? [`hold-downs ${holdown}`] : []),
          ...(sillSpacing ? [`sill anchors @ ${inch(sillSpacing)} o.c.`] : []),
        ]}
      />
    </GeoRow>
  );
}

/** rafter geometry: plate, ridge, slope, run, rise and eave overhang */
export function RafterGeometry({
  run,
  rise,
  overhang,
  thetaDeg,
  slopedSpan,
  ridge,
}: {
  /** horizontal run plate to ridge, ft */
  run: number;
  /** rise per 12 */
  rise: number;
  overhang: number;
  thetaDeg: number;
  slopedSpan: number;
  ridge: string;
}) {
  const total = run + overhang;
  const riseFt = (run * rise) / 12;
  const sc = Math.min(240 / total, 110 / Math.max(riseFt + (overhang * rise) / 12, 0.5));
  const xPlate = 40 + overhang * sc;
  const yPlate = 20 + riseFt * sc + 20;
  const xRidge = xPlate + run * sc;
  const yRidge = yPlate - riseFt * sc;
  const xEave = xPlate - overhang * sc;
  const yEave = yPlate + (overhang * rise * sc) / 12;
  return (
    <GeoRow title="Geometry — rafter" height={Math.max(yEave, yPlate + 32) + 16}>
      <line x1={xEave} y1={yEave} x2={xRidge} y2={yRidge} stroke={WOOD.stroke} strokeWidth={4} strokeLinecap="round" />
      <line x1={xEave} y1={yEave} x2={xRidge} y2={yRidge} stroke={WOOD.fill} strokeWidth={2.4} strokeLinecap="round" />
      <Pin x={xPlate} y={yPlate + 2} />
      <rect
        x={xRidge - 2}
        y={yRidge - 4}
        width={4}
        height={18}
        fill={WOOD.fill}
        stroke={WOOD.stroke}
        strokeWidth={0.8}
      />
      <text x={xPlate} y={yPlate + 22} textAnchor="middle" style={dimTxt}>
        plate
      </text>
      <text x={xRidge - 6} y={yRidge - 6} textAnchor="end" style={dimTxt}>
        {ridge}
      </text>
      {/* rise / run triangle */}
      <line x1={xPlate} y1={yPlate} x2={xRidge} y2={yPlate} stroke={DC.axis} strokeWidth={0.6} strokeDasharray="3 2" />
      <line x1={xRidge} y1={yPlate} x2={xRidge} y2={yRidge} stroke={DC.axis} strokeWidth={0.6} strokeDasharray="3 2" />
      <path
        d={`M ${xPlate + 26} ${yPlate} A 26 26 0 0 0 ${xPlate + 26 * Math.cos((thetaDeg * Math.PI) / 180)} ${yPlate - 26 * Math.sin((thetaDeg * Math.PI) / 180)}`}
        fill="none"
        stroke={DC.moment}
        strokeWidth={0.8}
      />
      <text x={xPlate + 30} y={yPlate - 4} style={{ ...dimTxt, fill: DC.moment }}>
        θ = {fmt(thetaDeg, 1)}°
      </text>
      <HDim x1={xPlate} x2={xRidge} y={yPlate + 32} label={`L_h = ${fmtFtIn(run)}`} />
      {overhang > 0 ? <HDim x1={xEave} x2={xPlate} y={yPlate + 32} label={fmtFtIn(overhang)} /> : null}
      <VDim x={xRidge + 18} y1={yRidge} y2={yPlate} label={fmtFtIn(riseFt)} right />
      <Notes
        x={340}
        y={24}
        lines={[
          `pitch ${fmt(rise, rise % 1 ? 2 : 0)} in 12`,
          `sloped span ${fmtFtIn(slopedSpan)}`,
          overhang > 0 ? `overhang ${fmtFtIn(overhang)}` : "no overhang",
        ]}
      />
    </GeoRow>
  );
}

/** footing plan: strip segment under its wall, or pad B × L under its post / pier */
export function FootingPlan({
  type,
  B,
  L,
  c1,
  c2,
  stemWidth,
}: {
  type: "strip" | "pad";
  /** ft */
  B: number;
  L?: number;
  /** in */
  c1: number;
  c2?: number;
  stemWidth?: number;
}) {
  const pad = type === "pad";
  const Lx = pad ? B * 12 : Math.max(48, B * 24);
  const Ly = pad ? (L ?? B) * 12 : B * 12;
  const sc = Math.min(200 / Lx, 110 / Ly);
  const x0 = 60;
  const y0 = 10;
  const wx = pad ? c1 : Lx;
  const wy = pad ? (c2 ?? c1) : (stemWidth ?? c1);
  return (
    <GeoRow title="Geometry — footing plan" height={y0 + Ly * sc + 28}>
      <rect
        x={x0}
        y={y0}
        width={Lx * sc}
        height={Ly * sc}
        fill={DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
      />
      {!pad ? (
        <>
          <line x1={x0 - 6} y1={y0} x2={x0 + 6} y2={y0 + Ly * sc} stroke={DC.dim} strokeWidth={0.6} />
          <line
            x1={x0 + Lx * sc - 6}
            y1={y0}
            x2={x0 + Lx * sc + 6}
            y2={y0 + Ly * sc}
            stroke={DC.dim}
            strokeWidth={0.6}
          />
        </>
      ) : null}
      <rect
        x={x0 + (Lx * sc) / 2 - (wx * sc) / 2}
        y={y0 + (Ly * sc) / 2 - (wy * sc) / 2}
        width={wx * sc}
        height={wy * sc}
        fill={stemWidth ? "#bdbdbd" : WOOD.fill}
        stroke={stemWidth ? DC.concrete : WOOD.stroke}
        strokeWidth={0.9}
      />
      <line
        x1={x0 - 8}
        y1={y0 + (Ly * sc) / 2}
        x2={x0 + Lx * sc + 8}
        y2={y0 + (Ly * sc) / 2}
        stroke={DC.axis}
        strokeWidth={0.5}
        strokeDasharray="6 2 1 2"
      />
      {pad ? <HDim x1={x0} x2={x0 + Lx * sc} y={y0 + Ly * sc + 10} label={`B = ${fmtFtIn(B)}`} /> : null}
      <VDim x={x0 - 12} y1={y0} y2={y0 + Ly * sc} label={pad ? `L = ${fmtFtIn(L ?? B)}` : `B = ${inch(B * 12)}`} />
      <Notes
        x={300}
        y={24}
        lines={
          pad
            ? [
                `Pad ${fmtFtIn(B)} × ${fmtFtIn(L ?? B)}`,
                `post / pier ${inch(c1)} × ${inch(c2 ?? c1)}, centred`,
                `bearing area ${fmt(B * (L ?? B), 2)} ft²`,
              ]
            : [
                `Continuous footing ${inch(B * 12)} wide`,
                stemWidth ? `stem wall ${inch(stemWidth)}` : `wall ${inch(c1)}, centred`,
                "designed per ft of wall",
              ]
        }
      />
    </GeoRow>
  );
}

/** base plate plan: plate N × B, column outline, anchor rods at their spacing */
export function BasePlatePlan({
  N,
  B,
  tp,
  col,
  rod,
}: {
  N: number;
  B: number;
  tp: number;
  col: SteelShape;
  rod: { d: number; nx: number; ny: number; sx: number; sy: number };
}) {
  const sc = Math.min(200 / B, 130 / N, 14);
  const cx = 150;
  const cy = 10 + (N * sc) / 2;
  const x0 = cx - (B * sc) / 2;
  const y0 = cy - (N * sc) / 2;
  const rods: Array<[number, number]> = [];
  for (let i = 0; i < rod.nx; i++)
    for (let j = 0; j < rod.ny; j++) rods.push([(i - (rod.nx - 1) / 2) * rod.sx, (j - (rod.ny - 1) / 2) * rod.sy]);
  return (
    <GeoRow title="Geometry — base plate plan" height={y0 + N * sc + 28}>
      <rect x={x0} y={y0} width={B * sc} height={N * sc} fill="#e3e8eb" stroke={STEEL.stroke} strokeWidth={1.1} />
      {steelShapes(col, cx, cy, sc)}
      {rods.map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={cx + x * sc}
            cy={cy + y * sc}
            r={Math.max(2, ((rod.d + 0.0625) / 2) * sc * 1.6)}
            fill="white"
            stroke={DC.ink}
            strokeWidth={0.8}
          />
          <circle cx={cx + x * sc} cy={cy + y * sc} r={Math.max(1.2, (rod.d / 2) * sc)} fill={DC.rebar} />
        </g>
      ))}
      <HDim x1={x0} x2={x0 + B * sc} y={y0 + N * sc + 10} label={`B = ${inch(B)}`} />
      <VDim x={x0 - 12} y1={y0} y2={y0 + N * sc} label={`N = ${inch(N)}`} />
      {rod.nx > 1 ? (
        <HDim
          x1={cx - ((rod.nx - 1) / 2) * rod.sx * sc}
          x2={cx + ((rod.nx - 1) / 2) * rod.sx * sc}
          y={y0 - 4}
          label={`${inch(rod.sx)}`}
          up
        />
      ) : null}
      <Notes
        x={300}
        y={24}
        lines={[
          `PL ${inch(tp)} × ${inch(B)} × ${inch(N)}`,
          `column ${col.name}`,
          `(${rod.nx * rod.ny}) ${inch(rod.d)} anchor rods`,
          `rod spacing ${inch(rod.sx)} × ${inch(rod.sy)}`,
        ]}
      />
    </GeoRow>
  );
}

/** masonry / concrete wall elevation (section): height, parapet and support conditions */
export function WallSupportElevation({
  h,
  parapet,
  t,
  support,
  material,
}: {
  h: number;
  parapet?: number;
  t: number;
  support: "pinned-fixed" | "pinned-pinned" | "fixed-fixed" | "cantilever";
  material: "cmu" | "concrete";
}) {
  const total = h + (parapet ?? 0);
  const sc = 150 / total;
  const x = 90;
  const yTop = 12;
  const Y = (ft: number) => yTop + (total - ft) * sc;
  const w = Math.max(8, (t / 12) * sc);
  const fixedBase = support === "pinned-fixed" || support === "fixed-fixed" || support === "cantilever";
  const topSupport = support !== "cantilever";
  const fixedTop = support === "fixed-fixed";
  return (
    <GeoRow title="Geometry — wall section and supports" height={Y(0) + 26}>
      <rect
        x={x - w / 2}
        y={Y(total)}
        width={w}
        height={total * sc}
        fill={material === "cmu" ? "#ebe5d9" : DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
      />
      {material === "cmu"
        ? Array.from({ length: Math.floor((total * 12) / 8) }, (_, i) => (
            <line
              key={i}
              x1={x - w / 2}
              x2={x + w / 2}
              y1={Y(((i + 1) * 8) / 12)}
              y2={Y(((i + 1) * 8) / 12)}
              stroke={DC.concrete}
              strokeWidth={0.3}
            />
          ))
        : null}
      {/* base */}
      <rect
        x={x - 30}
        y={Y(0)}
        width={60}
        height={8}
        fill={fixedBase ? DC.concreteFill : "none"}
        stroke={DC.support}
        strokeWidth={1}
      />
      {fixedBase ? (
        Array.from({ length: 6 }, (_, i) => (
          <line
            key={`hb${i}`}
            x1={x - 28 + i * 10}
            y1={Y(0) + 8}
            x2={x - 34 + i * 10}
            y2={Y(0) + 14}
            stroke={DC.support}
            strokeWidth={0.6}
          />
        ))
      ) : (
        <Pin x={x} y={Y(0)} />
      )}
      {/* top support */}
      {topSupport ? (
        <>
          <line
            x1={x + w / 2}
            y1={Y(h)}
            x2={x + w / 2 + 30}
            y2={Y(h)}
            stroke={DC.support}
            strokeWidth={fixedTop ? 3 : 1.4}
          />
          <text x={x + w / 2 + 34} y={Y(h) + 3} style={dimTxt}>
            {fixedTop ? "fixed (diaphragm)" : "pinned (diaphragm)"}
          </text>
        </>
      ) : null}
      <VDim x={x - 34} y1={Y(h)} y2={Y(0)} label={`h = ${fmtFtIn(h)}`} />
      {parapet ? <VDim x={x - 34} y1={Y(total)} y2={Y(h)} label={`parapet ${fmtFtIn(parapet)}`} /> : null}
      <HDim x1={x - w / 2} x2={x + w / 2} y={Y(total) - 4} label={inch(t)} up />
      <Notes
        x={300}
        y={24}
        lines={[
          material === "cmu" ? `${inch(t)} CMU wall` : `${inch(t)} concrete wall`,
          support === "cantilever"
            ? "fixed at the base, free at the top"
            : support === "pinned-fixed"
              ? "pinned at the top, fixed at the base"
              : support === "fixed-fixed"
                ? "fixed at the top and base"
                : "pinned at the top and base",
          `span ${fmtFtIn(h)}${parapet ? ` + parapet ${fmtFtIn(parapet)}` : ""}`,
        ]}
      />
    </GeoRow>
  );
}
