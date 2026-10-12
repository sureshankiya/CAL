/**
 * Drafting kit for the calculation figures, in the manner of Tekla Tedds output: thin black
 * linework, standard section hatching (sawn timber X, concrete stipple, masonry 45° hatch,
 * earth, steel solid), dimension lines with filled arrowheads and extension lines, support
 * symbols, leaders and underlined view titles. Every figure carries its own <defs> so it also
 * renders on its own when exported (PDF / Word convert each figure separately).
 */

import type React from "react";

export const INK = "#000";
export const LW = { object: 0.9, thin: 0.5, hatch: 0.35, heavy: 1.6 } as const;
export const FONT = "Arial, Helvetica, sans-serif";
export const T: React.CSSProperties = { fontFamily: FONT, fontSize: 7.5, fill: INK };
export const TS: React.CSSProperties = { ...T, fontSize: 7 };
export const FIG_W = 470;

/** hatch patterns (ids are identical in every figure, so duplicates are harmless) */
export function Hatches() {
  return (
    <defs>
      <pattern id="h-conc" width="9" height="9" patternUnits="userSpaceOnUse">
        <rect width="9" height="9" fill="#f4f4f4" />
        <circle cx="1.5" cy="2" r="0.45" fill={INK} />
        <circle cx="6" cy="1.2" r="0.35" fill={INK} />
        <circle cx="4" cy="5.5" r="0.5" fill={INK} />
        <circle cx="8" cy="7" r="0.35" fill={INK} />
        <path d="M 6.5 4.5 l 1.2 0.6 l -0.9 0.8 z" fill="none" stroke={INK} strokeWidth="0.3" />
        <path d="M 1 7 l 1.3 -0.3 l -0.3 1.1 z" fill="none" stroke={INK} strokeWidth="0.3" />
      </pattern>
      <pattern id="h-cmu" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="#fff" />
        <line x1="0" y1="0" x2="0" y2="5" stroke={INK} strokeWidth="0.35" />
      </pattern>
      <pattern id="h-earth" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M 0 10 L 4 6 M 5 10 L 9 6" stroke={INK} strokeWidth="0.35" />
        <circle cx="7" cy="3" r="0.4" fill={INK} />
        <circle cx="2" cy="2" r="0.3" fill={INK} />
      </pattern>
      <pattern id="h-wood" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <rect width="6" height="6" fill="#fff" />
        <path d="M 0 3 Q 1.5 1.8 3 3 T 6 3" fill="none" stroke={INK} strokeWidth="0.25" />
      </pattern>
      <pattern id="h-grout" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="#ececec" />
        <circle cx="1" cy="1" r="0.35" fill={INK} />
        <circle cx="3" cy="3" r="0.3" fill={INK} />
      </pattern>
      <pattern id="h-shtg" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="#f6f6f6" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="#9e9e9e" strokeWidth="0.3" />
      </pattern>
      <marker
        id="ah"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={INK} />
      </marker>
    </defs>
  );
}

/** a figure row in the sheet table; the caption sits above the drawing, inside the SVG */
export function Figure({ title, height, children }: { title?: string; height: number; children: React.ReactNode }) {
  const top = title ? 14 : 4;
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <div className="avoid-break mb-1 block">
          <svg
            width="100%"
            viewBox={`0 ${-top} ${FIG_W} ${height + top}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title ?? "Figure"}
          >
            <Hatches />
            {title ? (
              <text x={0} y={-4} style={{ ...T, fontSize: 9, fontWeight: 700 }}>
                {title}
              </text>
            ) : null}
            {children}
          </svg>
        </div>
      </td>
    </tr>
  );
}

/** underlined view title under a view ("Section", "Plan", "Elevation") */
export function ViewTitle({ x, y, children }: { x: number; y: number; children: string }) {
  const w = children.length * 4.3;
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" style={{ ...T, fontSize: 8, fontWeight: 700 }}>
        {children}
      </text>
      <line x1={x - w / 2} y1={y + 2} x2={x + w / 2} y2={y + 2} stroke={INK} strokeWidth={LW.thin} />
    </g>
  );
}

/**
 * dimension between two points along x (horizontal) or y (vertical): extension lines from the
 * object (offset), dimension line with arrowheads, text on the line's outer side
 */
export function Dim({
  a,
  b,
  at,
  label,
  vertical,
  from,
  side = 1,
}: {
  /** start and end coordinate along the dimension */
  a: number;
  b: number;
  /** position of the dimension line (y for horizontal, x for vertical) */
  at: number;
  label: string;
  vertical?: boolean;
  /** object edge the extension lines start from (y for horizontal, x for vertical) */
  from?: number;
  /** text side: 1 = below / right, -1 = above / left */
  side?: 1 | -1;
}) {
  if (Math.abs(b - a) < 0.5) return null;
  const gap = 2;
  const ext = (p: number) => {
    if (from === undefined) return null;
    const dir = Math.sign(at - from) || 1;
    return vertical ? (
      <line x1={from + dir * gap} y1={p} x2={at + dir * 3} y2={p} stroke={INK} strokeWidth={LW.thin} />
    ) : (
      <line x1={p} y1={from + dir * gap} x2={p} y2={at + dir * 3} stroke={INK} strokeWidth={LW.thin} />
    );
  };
  const short = Math.abs(b - a) < 16;
  return (
    <g>
      {ext(a)}
      {ext(b)}
      {vertical ? (
        <line
          x1={at}
          y1={a}
          x2={at}
          y2={b}
          stroke={INK}
          strokeWidth={LW.thin}
          markerStart={short ? undefined : "url(#ah)"}
          markerEnd={short ? undefined : "url(#ah)"}
        />
      ) : (
        <line
          x1={a}
          y1={at}
          x2={b}
          y2={at}
          stroke={INK}
          strokeWidth={LW.thin}
          markerStart={short ? undefined : "url(#ah)"}
          markerEnd={short ? undefined : "url(#ah)"}
        />
      )}
      {short ? (
        vertical ? (
          <>
            <line x1={at - 2.5} y1={a + 2.5} x2={at + 2.5} y2={a - 2.5} stroke={INK} strokeWidth={LW.object} />
            <line x1={at - 2.5} y1={b + 2.5} x2={at + 2.5} y2={b - 2.5} stroke={INK} strokeWidth={LW.object} />
          </>
        ) : (
          <>
            <line x1={a - 2.5} y1={at + 2.5} x2={a + 2.5} y2={at - 2.5} stroke={INK} strokeWidth={LW.object} />
            <line x1={b - 2.5} y1={at + 2.5} x2={b + 2.5} y2={at - 2.5} stroke={INK} strokeWidth={LW.object} />
          </>
        )
      ) : null}
      {vertical ? (
        <text
          x={at + side * 3}
          y={(a + b) / 2}
          textAnchor="middle"
          style={TS}
          transform={`rotate(-90 ${at + side * 3} ${(a + b) / 2})`}
          dy={side > 0 ? 6 : -1}
        >
          {label}
        </text>
      ) : (
        <text x={(a + b) / 2} y={side > 0 ? at + 8 : at - 2} textAnchor="middle" style={TS}>
          {label}
        </text>
      )}
    </g>
  );
}

/** leader with an arrowhead from a label to a point */
export function Leader({
  x,
  y,
  tx,
  ty,
  label,
  anchor = "start",
}: {
  x: number;
  y: number;
  tx: number;
  ty: number;
  label: string;
  anchor?: "start" | "end";
}) {
  const elbow = anchor === "start" ? tx - 4 : tx + 4;
  return (
    <g>
      <polyline
        points={`${elbow},${ty - 2.5} ${x},${y}`}
        fill="none"
        stroke={INK}
        strokeWidth={LW.thin}
        markerEnd="url(#ah)"
      />
      <line
        x1={elbow}
        y1={ty - 2.5}
        x2={anchor === "start" ? tx - 1 : tx + 1}
        y2={ty - 2.5}
        stroke={INK}
        strokeWidth={LW.thin}
      />
      <text x={tx} y={ty} textAnchor={anchor} style={T}>
        {label}
      </text>
    </g>
  );
}

/** pinned support (triangle on a hatched base), apex at (x, y) */
export function PinSupport({ x, y, roller, flip }: { x: number; y: number; roller?: boolean; flip?: boolean }) {
  const s = flip ? -1 : 1;
  const base = y + s * (roller ? 13 : 9);
  return (
    <g>
      <polygon
        points={`${x},${y} ${x - 5.5},${y + s * 9} ${x + 5.5},${y + s * 9}`}
        fill="#fff"
        stroke={INK}
        strokeWidth={LW.object}
      />
      {roller ? (
        <>
          <circle cx={x - 3} cy={y + s * 11} r={1.8} fill="#fff" stroke={INK} strokeWidth={LW.thin} />
          <circle cx={x + 3} cy={y + s * 11} r={1.8} fill="#fff" stroke={INK} strokeWidth={LW.thin} />
        </>
      ) : null}
      <line x1={x - 9} y1={base} x2={x + 9} y2={base} stroke={INK} strokeWidth={LW.object} />
      {Array.from({ length: 5 }, (_, i) => (
        <line
          key={i}
          x1={x - 8 + i * 4}
          y1={base}
          x2={x - 11 + i * 4}
          y2={base + s * 3.5}
          stroke={INK}
          strokeWidth={LW.hatch}
        />
      ))}
    </g>
  );
}

/** fixed support: a hatched wall / ground line at (x, y), along x (horizontal) or y */
export function FixedSupport({
  x,
  y,
  len = 20,
  vertical,
  side = 1,
}: {
  x: number;
  y: number;
  len?: number;
  vertical?: boolean;
  side?: 1 | -1;
}) {
  const n = Math.max(3, Math.round(len / 4));
  return vertical ? (
    <g>
      <line x1={x} y1={y - len / 2} x2={x} y2={y + len / 2} stroke={INK} strokeWidth={LW.heavy} />
      {Array.from({ length: n }, (_, i) => {
        const yy = y - len / 2 + (i * len) / (n - 1);
        return <line key={i} x1={x} y1={yy} x2={x + side * 3.5} y2={yy + 3.5} stroke={INK} strokeWidth={LW.hatch} />;
      })}
    </g>
  ) : (
    <g>
      <line x1={x - len / 2} y1={y} x2={x + len / 2} y2={y} stroke={INK} strokeWidth={LW.heavy} />
      {Array.from({ length: n }, (_, i) => {
        const xx = x - len / 2 + (i * len) / (n - 1);
        return <line key={i} x1={xx} y1={y} x2={xx - 3.5} y2={y + side * 3.5} stroke={INK} strokeWidth={LW.hatch} />;
      })}
    </g>
  );
}

/** sawn-timber section: outline with the corner-to-corner X */
export function TimberSection({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke={INK} strokeWidth={LW.object} />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke={INK} strokeWidth={LW.hatch} />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke={INK} strokeWidth={LW.hatch} />
    </g>
  );
}

/** centre line (chain) */
export const CL = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={LW.hatch} strokeDasharray="8 2 1.5 2" />
);

/** ground / grade line with earth hatch below */
export function Grade({ x1, x2, y, depth = 8 }: { x1: number; x2: number; y: number; depth?: number }) {
  return (
    <g>
      <rect x={x1} y={y} width={x2 - x1} height={depth} fill="url(#h-earth)" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth={LW.object} />
    </g>
  );
}

/** reinforcing bar seen end-on (solid) and along its length */
export const BarDot = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <circle cx={x} cy={y} r={Math.max(1.5, r)} fill={INK} />
);
export const BarRun = ({ points, w }: { points: string; w: number }) => (
  <polyline points={points} fill="none" stroke={INK} strokeWidth={Math.max(1.3, w)} strokeLinejoin="round" />
);
