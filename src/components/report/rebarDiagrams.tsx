/**
 * Reinforcement diagrams for the concrete and masonry sheets: footing sections (continuous,
 * pad, hold-down), a pad plan with the bars each way, a wall section through the vertical
 * bars, and the dowel detail of a tie-in to existing concrete. Bars are drawn to scale at
 * their clear cover from the member's own input, so the diagram always matches the
 * calculation. Colours from diagramColors.ts.
 */

import type React from "react";
import { BARS } from "@/engine/design/concrete";
import { fmt } from "@/engine/core/fmt";
import { DC } from "./diagramColors";

const W = 470;
const txt: React.CSSProperties = { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 8, fill: DC.ink };
const callout: React.CSSProperties = { ...txt, fill: DC.rebar };
const dimTxt: React.CSSProperties = { ...txt, fontSize: 7.5, fill: DC.dim };
const db = (size: string) => BARS[size]?.d ?? 0.5;
const inch = (v: number) => `${fmt(v, Number.isInteger(Math.round(v * 8) / 8) ? 0 : 2)} in.`;

function Row({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
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

/** bar seen end-on */
const Dot = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <circle cx={x} cy={y} r={Math.max(1.8, r)} fill={DC.rebar} stroke="#7f1d1d" strokeWidth={0.4} />
);

/** bar seen along its length */
const BarLine = ({ x1, y1, x2, y2, w }: { x1: number; y1: number; x2: number; y2: number; w: number }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DC.rebar} strokeWidth={Math.max(1.4, w)} strokeLinecap="round" />
);

function HDim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x1} y1={y - 3} x2={x1} y2={y + 3} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x2} y1={y - 3} x2={x2} y2={y + 3} stroke={DC.dim} strokeWidth={0.6} />
      <text x={(x1 + x2) / 2} y={y + 9} textAnchor="middle" style={dimTxt}>
        {label}
      </text>
    </g>
  );
}

function VDim({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x - 3} y1={y1} x2={x + 3} y2={y1} stroke={DC.dim} strokeWidth={0.6} />
      <line x1={x - 3} y1={y2} x2={x + 3} y2={y2} stroke={DC.dim} strokeWidth={0.6} />
      <text x={x - 4} y={(y1 + y2) / 2 + 3} textAnchor="end" style={dimTxt}>
        {label}
      </text>
    </g>
  );
}

/** callouts listed at the right with a leader to the bar they name */
function Callouts({ x, y0, items }: { x: number; y0: number; items: Array<{ text: string; to?: [number, number] }> }) {
  return (
    <g>
      {items.map((c, i) => {
        const y = y0 + i * 12;
        return (
          <g key={i}>
            {c.to ? (
              <polyline
                points={`${c.to[0]},${c.to[1]} ${x - 8},${y - 3} ${x - 2},${y - 3}`}
                fill="none"
                stroke={DC.rebar}
                strokeWidth={0.5}
              />
            ) : null}
            <text x={x} y={y} style={c.to ? callout : txt}>
              {c.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const spread = (n: number, a: number, b: number) =>
  n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

export interface FootingRebarProps {
  title?: string;
  kind: "strip" | "pad" | "holdown";
  /** section width shown, in (strip / hold-down: footing width; pad: B) */
  width: number;
  /** pad: plan dimension L, in */
  length?: number;
  h: number;
  cover: number;
  /** bottom of footing below grade, in */
  depth: number;
  stem?: { width: number; height: number };
  /** wall / post bearing width, in (no stem) */
  bearing?: number;
  /** strip: transverse bars; pad: bars each way */
  bars?: { size: string; spacing?: number; count?: number };
  /** strip / hold-down: continuous bars */
  longitudinal?: { size: string; top: number; bottom: number };
}

/** footing cross-section (and plan for a pad) with the bars at their clear cover */
export function FootingRebar(p: FootingRebarProps) {
  const pad = p.kind === "pad";
  const soilAbove = Math.max(0, p.depth - p.h);
  const stemShown = p.stem
    ? Math.min(p.stem.height, Math.max(18, 1.5 * p.h, soilAbove + 6))
    : p.bearing
      ? Math.max(8, soilAbove + 4)
      : 0;
  const broken = !!p.stem && stemShown < p.stem.height;
  const totalIn = p.h + Math.max(stemShown, soilAbove);
  const drawW = pad ? 200 : 230;
  const drawH = 120;
  const sc = Math.min(drawW / (p.width + 16), drawH / (totalIn + 6));
  const x0 = 46;
  const yTop = 12 + Math.max(stemShown, soilAbove) * sc; // top of footing
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => yTop + v * sc; // v measured down from the top of the footing
  const bottom = Y(p.h);
  const grade = bottom - p.depth * sc;
  const height = Math.max(bottom + 28, pad && p.bars ? 170 : 0);
  const cv = p.cover;
  const items: Array<{ text: string; to?: [number, number] }> = [];
  const shapes: React.ReactNode[] = [];

  const tb = p.bars ? db(p.bars.size) : 0;
  if (p.bars && !pad) {
    // transverse bars, seen along their length
    const y = Y(p.h - cv - tb / 2);
    shapes.push(<BarLine key="tb" x1={X(cv)} y1={y} x2={X(p.width - cv)} y2={y} w={tb * sc} />);
    items.push({
      text: `${p.bars.size} @ ${inch(p.bars.spacing ?? 12)} o.c. transverse, bottom`,
      to: [X(p.width * 0.3), y],
    });
  }
  if (p.bars && pad) {
    const n = p.bars.count ?? 2;
    const yLine = Y(p.h - cv - tb / 2);
    const yDot = Y(p.h - cv - tb - tb / 2);
    shapes.push(<BarLine key="pl" x1={X(cv)} y1={yLine} x2={X(p.width - cv)} y2={yLine} w={tb * sc} />);
    const xs = spread(n, cv + tb / 2, p.width - cv - tb / 2);
    xs.forEach((x, i) => shapes.push(<Dot key={`pd${i}`} x={X(x)} y={yDot} r={(tb / 2) * sc} />));
    items.push({ text: `(${n}) ${p.bars.size} each way, bottom`, to: [X(xs[Math.floor(n / 2)]), yDot] });
  }
  if (p.longitudinal) {
    const lb = db(p.longitudinal.size);
    const xs = (n: number) => spread(n, cv + lb / 2, p.width - cv - lb / 2);
    if (p.longitudinal.top > 0) {
      const y = Y(cv + lb / 2);
      const pts = xs(p.longitudinal.top);
      pts.forEach((x, i) => shapes.push(<Dot key={`lt${i}`} x={X(x)} y={y} r={(lb / 2) * sc} />));
      items.unshift({
        text: `(${p.longitudinal.top}) ${p.longitudinal.size} continuous, top`,
        to: [X(pts[pts.length - 1]), y],
      });
    }
    if (p.longitudinal.bottom > 0) {
      const y = Y(p.h - cv - (p.bars && !pad ? tb : 0) - lb / 2);
      const pts = xs(p.longitudinal.bottom);
      pts.forEach((x, i) => shapes.push(<Dot key={`lb${i}`} x={X(x)} y={y} r={(lb / 2) * sc} />));
      items.push({
        text: `(${p.longitudinal.bottom}) ${p.longitudinal.size} continuous, bottom`,
        to: [X(pts[pts.length - 1]), y],
      });
    }
  }
  if (!p.bars && !p.longitudinal) items.push({ text: "Plain concrete (ACI 318 Ch. 14) — no reinforcement" });
  else items.push({ text: `${inch(cv)} clear cover, cast against earth` });
  // callouts next to the section; a pad's go under its plan
  const cx = pad && p.bars ? 300 : Math.min(300, X(p.width + 8) + 28);

  // pad plan: bars each way
  let plan: React.ReactNode = null;
  if (pad && p.bars) {
    const L = p.length ?? p.width;
    const ps = Math.min(100 / p.width, 100 / L);
    const px = 300;
    const py = 6;
    const PX = (v: number) => px + v * ps;
    const PY = (v: number) => py + v * ps;
    const n = p.bars.count ?? 2;
    plan = (
      <g>
        <rect x={PX(0)} y={PY(0)} width={p.width * ps} height={L * ps} fill={DC.concreteFill} stroke={DC.concrete} />
        {spread(n, cv, p.width - cv).map((x, i) => (
          <line key={`v${i}`} x1={PX(x)} y1={PY(cv)} x2={PX(x)} y2={PY(L - cv)} stroke={DC.rebar} strokeWidth={1.1} />
        ))}
        {spread(n, cv, L - cv).map((y, i) => (
          <line
            key={`h${i}`}
            x1={PX(cv)}
            y1={PY(y)}
            x2={PX(p.width - cv)}
            y2={PY(y)}
            stroke={DC.rebar}
            strokeWidth={1.1}
          />
        ))}
        {p.bearing ? (
          <rect
            x={PX(p.width / 2 - p.bearing / 2)}
            y={PY(L / 2 - p.bearing / 2)}
            width={p.bearing * ps}
            height={p.bearing * ps}
            fill="#d7b98e"
            stroke={DC.member}
            strokeWidth={0.8}
          />
        ) : null}
        <text x={PX(p.width / 2)} y={PY(L) + 10} textAnchor="middle" style={dimTxt}>
          Plan — {inch(p.width)} × {inch(L)}
        </text>
      </g>
    );
  }

  return (
    <Row title={p.title ?? "Reinforcement — section"} height={height}>
      {/* soil and grade */}
      <rect
        x={X(-8)}
        y={grade}
        width={(p.width + 16) * sc}
        height={bottom - grade + 4}
        fill={DC.soil}
        fillOpacity={0.12}
      />
      <line
        x1={X(-8)}
        y1={grade}
        x2={X(p.width + 8)}
        y2={grade}
        stroke={DC.soil}
        strokeWidth={1.1}
        strokeDasharray="4 2"
      />
      <text x={X(-8)} y={grade - 2} style={{ ...dimTxt, fill: DC.soil }}>
        grade
      </text>
      {/* footing */}
      <rect
        x={X(0)}
        y={Y(0)}
        width={p.width * sc}
        height={p.h * sc}
        fill={DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
      />
      {p.stem ? (
        <>
          <rect
            x={X(p.width / 2 - p.stem.width / 2)}
            y={Y(-stemShown)}
            width={p.stem.width * sc}
            height={stemShown * sc}
            fill={DC.concreteFill}
            stroke={DC.concrete}
            strokeWidth={1.1}
          />
          {broken ? (
            <polyline
              points={`${X(p.width / 2 - p.stem.width / 2 - 2)},${Y(-stemShown) + 2} ${X(p.width / 2 - 1)},${Y(-stemShown) - 2} ${X(p.width / 2 + 1)},${Y(-stemShown) + 4} ${X(p.width / 2 + p.stem.width / 2 + 2)},${Y(-stemShown)}`}
              fill="white"
              stroke={DC.dim}
              strokeWidth={0.7}
            />
          ) : null}
        </>
      ) : p.bearing ? (
        <rect
          x={X(p.width / 2 - p.bearing / 2)}
          y={Y(-stemShown)}
          width={p.bearing * sc}
          height={stemShown * sc}
          fill="#d7b98e"
          stroke={DC.member}
          strokeWidth={0.8}
        />
      ) : null}
      {shapes}
      <HDim x1={X(0)} x2={X(p.width)} y={bottom + 8} label={inch(p.width)} />
      <VDim x={X(0) - 6} y1={Y(0)} y2={bottom} label={inch(p.h)} />
      {p.stem ? (
        <text x={X(p.width / 2 + p.stem.width / 2) + 3} y={Y(-stemShown / 2)} style={dimTxt}>
          stem {inch(p.stem.width)}
          {broken ? ` × ${inch(p.stem.height)}` : ""}
        </text>
      ) : null}
      {plan}
      <Callouts x={cx} y0={pad && p.bars ? 132 : Math.max(18, Y(0) - 4)} items={items} />
    </Row>
  );
}

/** wall section through the vertical bars (plan cut), CMU cells or solid concrete */
export function WallRebar({
  title = "Reinforcement — wall section",
  material,
  t,
  cover,
  vertical,
  horizontal,
}: {
  title?: string;
  material: "cmu" | "concrete";
  t: number;
  cover: number;
  vertical: { size: string; spacing: number; layout: "center" | "offset" | "each-face"; d?: number };
  horizontal: { size: string; count: number; spacing: number };
}) {
  const s = vertical.spacing;
  const Ls = Math.min(Math.max(3 * s, 48), 120);
  const sc = Math.min(230 / Ls, 60 / t);
  const x0 = 20;
  const y0 = 16;
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => y0 + v * sc; // v from the exterior (tension) face
  const vb = db(vertical.size);
  const depths =
    vertical.layout === "each-face"
      ? [cover + vb / 2, t - cover - vb / 2]
      : [vertical.layout === "center" ? t / 2 : (vertical.d ?? t / 2)];
  const xs: number[] = [];
  for (let x = s / 2; x < Ls; x += s) xs.push(x);
  const layoutText =
    vertical.layout === "center"
      ? "centred in the wall"
      : vertical.layout === "each-face"
        ? `each face, ${inch(cover)} cover`
        : `d = ${inch(vertical.d ?? t / 2)}`;
  const items = [
    {
      text: `${vertical.size} @ ${inch(s)} o.c. vertical, ${layoutText}`,
      to: [X(xs[0]), Y(depths[0])] as [number, number],
    },
    {
      text: `(${horizontal.count}) ${horizontal.size} horizontal @ ${inch(horizontal.spacing)} o.c.`,
      to: [X(Ls * 0.85), Y(t / 2)] as [number, number],
    },
    { text: material === "cmu" ? `${inch(t)} CMU, grouted cells at the bars` : `${inch(t)} concrete wall` },
  ];
  const height = y0 + t * sc + 30;
  return (
    <Row title={title} height={height}>
      <rect
        x={X(0)}
        y={Y(0)}
        width={Ls * sc}
        height={t * sc}
        fill={material === "cmu" ? "#ebe5d9" : DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
      />
      {material === "cmu"
        ? // block webs every 8 in (half-block cells); grouted cells at the bars
          Array.from({ length: Math.floor(Ls / 8) + 1 }, (_, i) => i * 8).map((x) => (
            <line
              key={`w${x}`}
              x1={X(x)}
              y1={Y(1.25)}
              x2={X(x)}
              y2={Y(t - 1.25)}
              stroke={DC.concrete}
              strokeWidth={0.5}
            />
          ))
        : null}
      {material === "cmu"
        ? xs.map((x, i) => (
            <rect
              key={`g${i}`}
              x={X(Math.floor(x / 8) * 8) + 1}
              y={Y(1.25)}
              width={8 * sc - 2}
              height={(t - 2.5) * sc}
              fill={DC.concreteFill}
            />
          ))
        : null}
      <BarLine x1={X(0.5)} y1={Y(t / 2)} x2={X(Ls - 0.5)} y2={Y(t / 2)} w={db(horizontal.size) * sc * 0.7} />
      {xs.flatMap((x, i) => depths.map((d, k) => <Dot key={`v${i}-${k}`} x={X(x)} y={Y(d)} r={(vb / 2) * sc} />))}
      <HDim x1={X(xs[0])} x2={X(xs[1] ?? xs[0])} y={Y(t) + 8} label={`${inch(s)} o.c.`} />
      <text x={X(0)} y={Y(0) - 3} style={dimTxt}>
        exterior face
      </text>
      <Callouts x={270} y0={Y(0) + 4} items={items} />
    </Row>
  );
}

/** dowels drilled and bonded into existing concrete, lapping into the new pour */
export function DowelRebar({
  size,
  hef,
  spacing,
  ca1,
  ha,
  product,
}: {
  size: string;
  hef: number;
  spacing: number;
  ca1: number;
  ha: number;
  product: string;
}) {
  const d = db(size);
  const exW = hef + 6;
  const newW = Math.max(12, hef);
  const sc = Math.min(200 / (exW + newW), 90 / ha);
  const x0 = 56;
  const y0 = 12;
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => y0 + v * sc;
  const yb = Math.min(ca1, ha / 2);
  return (
    <Row title="Reinforcement — dowels into existing concrete" height={y0 + ha * sc + 30}>
      <rect x={X(0)} y={Y(0)} width={exW * sc} height={ha * sc} fill="#cfcfcf" stroke={DC.concrete} strokeWidth={1.1} />
      <rect
        x={X(exW)}
        y={Y(0)}
        width={newW * sc}
        height={ha * sc}
        fill={DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
        strokeDasharray="4 2"
      />
      <line x1={X(exW)} y1={Y(0)} x2={X(exW)} y2={Y(ha)} stroke={DC.ink} strokeWidth={1.2} />
      <text x={X(exW / 2)} y={Y(ha) - 4} textAnchor="middle" style={dimTxt}>
        existing
      </text>
      <text x={X(exW + newW / 2)} y={Y(ha) - 4} textAnchor="middle" style={dimTxt}>
        new
      </text>
      {/* drilled hole + adhesive, then the dowel */}
      <rect
        x={X(exW - hef)}
        y={Y(yb) - (d * sc) / 2 - 1.5}
        width={hef * sc}
        height={d * sc + 3}
        fill={DC.pressure}
        fillOpacity={0.3}
      />
      <BarLine x1={X(exW - hef)} y1={Y(yb)} x2={X(exW + newW - 1.5)} y2={Y(yb)} w={d * sc} />
      <HDim x1={X(exW - hef)} x2={X(exW)} y={Y(ha) + 8} label={`h_ef = ${inch(hef)}`} />
      <VDim x={X(0) - 3} y1={Y(0)} y2={Y(yb)} label={`c = ${inch(ca1)}`} />
      <Callouts
        x={280}
        y0={Y(0) + 6}
        items={[
          { text: `${size} dowels @ ${inch(spacing)} o.c.`, to: [X(exW + newW * 0.6), Y(yb)] },
          {
            text: `drilled and bonded: ${product.length > 30 ? `${product.slice(0, 29)}…` : product}`,
            to: [X(exW - hef / 2), Y(yb)],
          },
          { text: `existing member ${inch(ha)} thick` },
        ]}
      />
    </Row>
  );
}

/** retaining wall: stem bars with hooked dowels into the footing, footing mats and long. bars */
export function RetainingRebar({
  B,
  hf,
  toe,
  ts,
  stemH,
  stem,
  footing,
}: {
  /** footing width, ft; thickness, in; toe, ft; stem thickness, in; stem height, ft */
  B: number;
  hf: number;
  toe: number;
  ts: number;
  stemH: number;
  stem: { size: string; spacing: number; layout: "center" | "offset" | "each-face"; d?: number; cover: number };
  footing: {
    coverBottom: number;
    coverTop: number;
    bottom: { size: string; spacing: number };
    top: { size: string; spacing: number };
    longitudinal: { size: string; count: number };
  };
}) {
  const Bi = B * 12;
  const Hi = stemH * 12;
  const sc = Math.min(250 / Bi, 210 / (Hi + hf));
  const x0 = 20;
  const yb = 14 + (Hi + hf) * sc;
  const X = (v: number) => x0 + v * sc; // in from the toe
  const Y = (v: number) => yb - v * sc; // in above the bottom
  const t0 = toe * 12;
  const vb = db(stem.size);
  // d from the toe (front) face; the soil face is in tension
  const xs =
    stem.layout === "each-face"
      ? [t0 + stem.cover + vb / 2, t0 + ts - stem.cover - vb / 2]
      : [t0 + (stem.layout === "center" ? ts / 2 : (stem.d ?? ts / 2))];
  const bb = db(footing.bottom.size);
  const tb = db(footing.top.size);
  const lb = db(footing.longitudinal.size);
  const yBot = footing.coverBottom + bb / 2;
  const yTopBar = hf - footing.coverTop - tb / 2;
  const hookY = footing.coverBottom + bb + vb / 2;
  const longX = spread(footing.longitudinal.count, footing.coverBottom + lb / 2, Bi - footing.coverBottom - lb / 2);
  return (
    <Row title="Reinforcement — wall section" height={yb + 22}>
      <polygon
        points={`${X(0)},${Y(0)} ${X(Bi)},${Y(0)} ${X(Bi)},${Y(hf)} ${X(t0 + ts)},${Y(hf)} ${X(t0 + ts)},${Y(hf + Hi)} ${X(t0)},${Y(hf + Hi)} ${X(t0)},${Y(hf)} ${X(0)},${Y(hf)}`}
        fill={DC.concreteFill}
        stroke={DC.concrete}
        strokeWidth={1.1}
      />
      {/* footing mats */}
      <BarLine x1={X(footing.coverBottom)} y1={Y(yBot)} x2={X(Bi - footing.coverBottom)} y2={Y(yBot)} w={bb * sc} />
      <BarLine x1={X(footing.coverTop)} y1={Y(yTopBar)} x2={X(Bi - footing.coverTop)} y2={Y(yTopBar)} w={tb * sc} />
      {longX.map((x, i) => (
        <Dot key={`l${i}`} x={X(x)} y={Y(yBot + bb / 2 + lb / 2)} r={(lb / 2) * sc} />
      ))}
      {/* stem bars with standard hooks into the footing, hooks toward the toe */}
      {xs.map((x, i) => (
        <polyline
          key={`s${i}`}
          points={`${X(x)},${Y(hf + Hi - 2)} ${X(x)},${Y(hookY)} ${X(Math.max(footing.coverBottom, x - 12 * vb))},${Y(hookY)}`}
          fill="none"
          stroke={DC.rebar}
          strokeWidth={Math.max(1.4, vb * sc)}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      <Callouts
        x={300}
        y0={Y(hf + Hi) + 8}
        items={[
          {
            text: `${stem.size} @ ${inch(stem.spacing)} o.c. vertical${stem.layout === "each-face" ? ", each face" : ""}, hooked into footing`,
            to: [X(xs[xs.length - 1]), Y(hf + Hi * 0.6)],
          },
          { text: `${footing.top.size} @ ${inch(footing.top.spacing)} o.c. top`, to: [X(Bi * 0.8), Y(yTopBar)] },
          { text: `${footing.bottom.size} @ ${inch(footing.bottom.spacing)} o.c. bottom`, to: [X(Bi * 0.9), Y(yBot)] },
          {
            text: `(${footing.longitudinal.count}) ${footing.longitudinal.size} longitudinal`,
            to: [X(longX[longX.length - 1]), Y(yBot + bb / 2 + lb / 2)],
          },
          {
            text: `cover ${inch(footing.coverBottom)} bottom, ${inch(footing.coverTop)} top; stem ${inch(stem.cover)}`,
          },
        ]}
      />
      <HDim x1={X(0)} x2={X(Bi)} y={yb + 8} label={`B = ${fmt(B, 2)} ft`} />
    </Row>
  );
}
