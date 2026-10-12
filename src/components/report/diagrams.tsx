/**
 * Member sheet diagrams in the manner of Tekla Tedds output (drafting kit in drafting.tsx):
 * the loading diagram (load blocks by case on the member, supports, span dimensions) and the
 * shear, moment and deflection diagrams from the analysis (envelopes where the live load is
 * pattern-loaded), drawn as black line graphs with a light fill and the extreme values.
 */

import type React from "react";
import type { BeamLoad } from "@/engine/analysis/beam";
import { fmt } from "@/engine/core/fmt";
import { LOAD_TYPE_LABEL } from "@/engine/core/loads";
import { Dim, Hatches, INK, LW, PinSupport, T, TS } from "./drafting";

const W = 470;
const X0 = 50;
const X1 = W - 70;
const FILL = "#dcdcdc";

function Frame({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
  const top = 14;
  return (
    <div className="avoid-break mb-1 block">
      <svg
        width="100%"
        viewBox={`0 ${-top} ${W} ${height + top}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={title}
      >
        <Hatches />
        <text x={0} y={-4} style={{ ...T, fontSize: 9, fontWeight: 700 }}>
          {title}
        </text>
        {children}
      </svg>
    </div>
  );
}

export interface DiagramGeometry {
  total: number;
  supports: number[];
  /** support names, A, B, ... (or Plate / Ridge) */
  names: string[];
}

export function LoadingDiagram({
  g,
  loads,
  reactions,
  title = "Loading diagram",
  note,
}: {
  g: DiagramGeometry;
  loads: BeamLoad[];
  /** printed under each support, e.g. "R = 1,234 lb" */
  reactions?: string[];
  title?: string;
  note?: string;
}) {
  const sx = (x: number) => X0 + (x / g.total) * (X1 - X0);
  const dist = loads.filter((l) => l.kind !== "point");
  const points = loads.filter((l) => l.kind === "point");
  const band = 13;
  const top = 6 + (points.length ? 20 : 0);
  const beamY = top + dist.length * band + 6;
  const dimY = beamY + 40;
  const height = dimY + (reactions ? 26 : 14);
  const marks = [0, ...g.supports, g.total]
    .filter((v, i, a) => a.findIndex((u) => Math.abs(u - v) < 1e-6) === i)
    .sort((a, b) => a - b);
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <Frame title={title} height={height}>
          {dist.map((l, i) => {
            // blocks stack upward from the member, the first load nearest the member
            const y = beamY - 3 - (i + 1) * band;
            const a = sx(l.x1 ?? 0);
            const b = sx(l.x2 ?? g.total);
            const w1 = l.w1 ?? 0;
            const w2 = l.kind === "udl" ? w1 : (l.w2 ?? w1);
            const up = Math.max(w1, w2) < 0;
            const m = Math.max(Math.abs(w1), Math.abs(w2), 1e-9);
            const h1 = (band - 3) * (Math.abs(w1) / m);
            const h2 = (band - 3) * (Math.abs(w2) / m);
            const yb = y + band - 1;
            const n = Math.max(2, Math.min(16, Math.round((b - a) / 22) + 1));
            const value = Math.abs(w1 - w2) < 1e-6 ? fmt(w1, 1) : `${fmt(w1, 1)} – ${fmt(w2, 1)}`;
            return (
              <g key={`d${i}`}>
                <polygon
                  points={`${a},${yb} ${a},${yb - h1} ${b},${yb - h2} ${b},${yb}`}
                  fill="#f0f0f0"
                  stroke={INK}
                  strokeWidth={LW.thin}
                />
                {Array.from({ length: n }, (_, k) => {
                  const x = a + ((b - a) * k) / (n - 1);
                  const hh = h1 + ((h2 - h1) * k) / (n - 1);
                  return (
                    <line
                      key={k}
                      x1={x}
                      y1={up ? yb : yb - hh}
                      x2={x}
                      y2={up ? yb - hh : yb}
                      stroke={INK}
                      strokeWidth={LW.hatch}
                      markerEnd="url(#ah)"
                    />
                  );
                })}
                <text x={X0 - 6} y={yb - 2} textAnchor="end" style={TS}>
                  {l.type}
                </text>
                <text x={b + 5} y={yb - 2} style={TS}>
                  {value} lb/ft
                </text>
              </g>
            );
          })}
          {points.map((l, i) => {
            const x = sx(l.x ?? 0);
            return (
              <g key={`p${i}`}>
                <line x1={x} y1={4} x2={x} y2={beamY - 2} stroke={INK} strokeWidth={LW.object} markerEnd="url(#ah)" />
                <text x={x + 3} y={8 + (i % 2) * 8} style={TS}>
                  {l.type}: {fmt(l.P ?? 0, 0)} lb
                </text>
              </g>
            );
          })}
          <line x1={X0} y1={beamY} x2={X1} y2={beamY} stroke={INK} strokeWidth={2.2} />
          {g.supports.map((xs, i) => (
            <g key={`s${i}`}>
              <PinSupport x={sx(xs)} y={beamY + 1.1} roller={i > 0} />
              <text x={sx(xs)} y={beamY + 25} textAnchor="middle" style={{ ...T, fontWeight: 700 }}>
                {g.names[i]}
              </text>
            </g>
          ))}
          {marks.slice(0, -1).map((m, i) => (
            <Dim
              key={`l${i}`}
              a={sx(m)}
              b={sx(marks[i + 1])}
              at={dimY}
              from={beamY + 29}
              label={`${fmt(marks[i + 1] - m, 2)} ft`}
            />
          ))}
          {reactions
            ? g.supports.map((xs, i) => (
                <text key={`r${i}`} x={sx(xs)} y={dimY + 20} textAnchor="middle" style={TS}>
                  {reactions[i]}
                </text>
              ))
            : null}
        </Frame>
        {note ? <div className="text-[8.5pt] italic">{note}</div> : null}
      </td>
    </tr>
  );
}

function scaleOf(values: number[]) {
  return Math.max(1e-9, ...values.map((v) => Math.abs(v)));
}

function extreme(xs: number[], ys: number[], sign: 1 | -1) {
  let best = -1;
  for (let i = 0; i < ys.length; i++) if (best < 0 || sign * ys[i] > sign * ys[best]) best = i;
  return best < 0 ? { x: 0, y: 0 } : { x: xs[best], y: ys[best] };
}

export function ResultDiagrams({
  g,
  x,
  Mmax,
  Mmin,
  shearX,
  Vmax,
  Vmin,
  defl,
  comboLabel,
  deflLabel,
  patterned,
}: {
  g: DiagramGeometry;
  x: number[];
  Mmax: number[];
  Mmin: number[];
  shearX: number[];
  Vmax: number[];
  Vmin: number[];
  defl: number[];
  comboLabel: string;
  deflLabel: string;
  patterned: boolean;
}) {
  const sx = (v: number) => X0 + (v / g.total) * (X1 - X0);
  const plot = (xs: number[], ys: number[], axis: number, amp: number, s: number, flip: 1 | -1) =>
    xs.map((xx, i) => `${sx(xx)},${axis + flip * (ys[i] / s) * amp}`).join(" ");
  const area = (xs: number[], ys: number[], axis: number, amp: number, s: number, flip: 1 | -1) =>
    xs.length ? (
      <polygon
        points={`${sx(xs[0])},${axis} ${plot(xs, ys, axis, amp, s, flip)} ${sx(xs[xs.length - 1])},${axis}`}
        fill={FILL}
        stroke="none"
      />
    ) : null;

  const vS = scaleOf([...Vmax, ...Vmin]);
  const mS = scaleOf([...Mmax, ...Mmin]);
  const dS = scaleOf(defl);
  const vHi = extreme(shearX, Vmax, 1);
  const vLo = extreme(shearX, Vmin, -1);
  const mHi = extreme(x, Mmax, 1);
  const mLo = extreme(x, Mmin, -1);
  const dHi = extreme(x, defl, 1);
  const dLo = extreme(x, defl, -1);
  /** value axis at the left with the scale ticks, Tedds-like */
  const valueAxis = (axis: number, amp: number, s: number, flip: 1 | -1, digits: number) => (
    <g>
      <line x1={X0 - 8} y1={axis - amp} x2={X0 - 8} y2={axis + amp} stroke={INK} strokeWidth={LW.thin} />
      {[-1, 0, 1].map((k) => (
        <g key={k}>
          <line x1={X0 - 11} y1={axis + k * amp} x2={X0 - 8} y2={axis + k * amp} stroke={INK} strokeWidth={LW.thin} />
          <text x={X0 - 13} y={axis + k * amp + 2.5} textAnchor="end" style={{ ...TS, fontSize: 6.5 }}>
            {k === 0 ? fmt(0, digits) : fmt(k * flip * s, digits)}
          </text>
        </g>
      ))}
    </g>
  );
  const supportsAt = (axis: number, amp: number) =>
    g.supports.map((xs, i) => (
      <g key={i}>
        <line
          x1={sx(xs)}
          y1={axis - amp}
          x2={sx(xs)}
          y2={axis + amp}
          stroke={INK}
          strokeWidth={LW.hatch}
          strokeDasharray="2 2"
        />
      </g>
    ));
  const label = (xx: number, y: number, t: string) => (
    <text x={Math.min(Math.max(sx(xx), X0 + 24), X1 - 24)} y={y} textAnchor="middle" style={TS}>
      {t}
    </text>
  );
  const row = (title: string, height: number, body: React.ReactNode) => (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-1">
        <Frame title={title} height={height}>
          {body}
        </Frame>
      </td>
    </tr>
  );
  const tinyV = 1e-3 * vS;
  const tinyM = 1e-3 * mS;
  const tinyD = 1e-3 * dS;
  return (
    <>
      {row(
        `Shear force (lb) — ${comboLabel}${patterned ? ", envelope" : ""}`,
        96,
        <>
          {area(shearX, Vmax, 46, 34, vS, -1)}
          {patterned ? area(shearX, Vmin, 46, 34, vS, -1) : null}
          {valueAxis(46, 34, vS, -1, 0)}
          {supportsAt(46, 36)}
          <line x1={X0} y1={46} x2={X1} y2={46} stroke={INK} strokeWidth={LW.object} />
          <polyline points={plot(shearX, Vmax, 46, 34, vS, -1)} stroke={INK} strokeWidth={LW.object} fill="none" />
          {patterned ? (
            <polyline
              points={plot(shearX, Vmin, 46, 34, vS, -1)}
              stroke={INK}
              strokeWidth={LW.thin}
              strokeDasharray="4 2"
              fill="none"
            />
          ) : null}
          {vHi.y > tinyV ? label(vHi.x, 46 - 34 - 2, fmt(vHi.y, 0)) : null}
          {vLo.y < -tinyV ? label(vLo.x, 46 + 34 + 9, fmt(vLo.y, 0)) : null}
        </>,
      )}
      {row(
        `Bending moment (lb-ft) — ${comboLabel}${patterned ? ", envelope" : ""}`,
        104,
        <>
          {area(x, Mmax, 48, 36, mS, 1)}
          {patterned || Mmin.some((v) => v < -tinyM) ? area(x, Mmin, 48, 36, mS, 1) : null}
          {valueAxis(48, 36, mS, 1, 0)}
          {supportsAt(48, 38)}
          <line x1={X0} y1={48} x2={X1} y2={48} stroke={INK} strokeWidth={LW.object} />
          <polyline points={plot(x, Mmax, 48, 36, mS, 1)} stroke={INK} strokeWidth={LW.object} fill="none" />
          {patterned || Mmin.some((v) => v < -tinyM) ? (
            <polyline
              points={plot(x, Mmin, 48, 36, mS, 1)}
              stroke={INK}
              strokeWidth={LW.thin}
              strokeDasharray={patterned ? "4 2" : undefined}
              fill="none"
            />
          ) : null}
          {mHi.y > tinyM ? label(mHi.x, 48 + 36 + 10, fmt(mHi.y, 0)) : null}
          {mLo.y < -tinyM ? label(mLo.x, 48 - 36 - 3, fmt(mLo.y, 0)) : null}
        </>,
      )}
      {row(
        `Deflection (in) — ${deflLabel}`,
        84,
        <>
          {area(x, defl, 36, 26, dS, 1)}
          {valueAxis(36, 26, dS, 1, 3)}
          {supportsAt(36, 28)}
          <line x1={X0} y1={36} x2={X1} y2={36} stroke={INK} strokeWidth={LW.object} />
          <polyline points={plot(x, defl, 36, 26, dS, 1)} stroke={INK} strokeWidth={LW.object} fill="none" />
          {dHi.y > tinyD ? label(dHi.x, 36 + 26 + 10, fmt(dHi.y, 3)) : null}
          {dLo.y < -tinyD ? label(dLo.x, 36 - 26 - 2, `${fmt(-dLo.y, 3)} (up)`) : null}
        </>,
      )}
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 pb-2 text-[8.5pt] italic">
          Sagging moment and downward deflection plotted below the axis.
          {patterned ? " Dashed line: minimum envelope under pattern live load (ASCE 7 §4.3.3)." : ""}
        </td>
      </tr>
    </>
  );
}

export const loadTypeName = (t: keyof typeof LOAD_TYPE_LABEL) => LOAD_TYPE_LABEL[t];
