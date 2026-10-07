/**
 * Black-and-white SVG line diagrams for member sheets: loading diagram with
 * supports, distributed / point loads by type and span dimensions; shear,
 * moment and deflection diagrams drawn from the analysis (envelopes where the
 * live load is pattern-loaded). Pure SVG so the PDF prints without scripting.
 */

import type React from "react";
import type { BeamLoad } from "@/engine/analysis/beam";
import { fmt } from "@/engine/core/fmt";
import { LOAD_TYPE_LABEL } from "@/engine/core/loads";

const W = 470;
const X0 = 44;
const X1 = W - 44;

const line = { stroke: "black", fill: "none", strokeWidth: 1 } as const;
const txt: React.CSSProperties = { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 8.5, fill: "black" };
const small: React.CSSProperties = { ...txt, fontSize: 7.5 };

/** Diagram frame: the title is drawn inside the SVG so a page break can never separate it from the drawing. */
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
        <text
          x={0}
          y={-3}
          style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: 9.5, fontWeight: 700, fill: "black" }}
        >
          {title}
        </text>
        {children}
      </svg>
    </div>
  );
}

function SupportGlyph({ x, y, roller }: { x: number; y: number; roller?: boolean }) {
  return (
    <g>
      <polygon points={`${x},${y} ${x - 7},${y + 11} ${x + 7},${y + 11}`} {...line} />
      {roller ? (
        <>
          <circle cx={x - 4} cy={y + 14} r={2.5} {...line} />
          <circle cx={x + 4} cy={y + 14} r={2.5} {...line} />
          <line x1={x - 11} y1={y + 17} x2={x + 11} y2={y + 17} {...line} />
        </>
      ) : (
        <line x1={x - 11} y1={y + 11} x2={x + 11} y2={y + 11} {...line} />
      )}
    </g>
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
  const band = 15;
  const top = 14 + (points.length ? 18 : 0);
  const beamY = top + dist.length * band + 10;
  const dimY = beamY + 40;
  const height = dimY + (reactions ? 26 : 16);
  const marks = [0, ...g.supports, g.total]
    .filter((v, i, a) => a.findIndex((u) => Math.abs(u - v) < 1e-6) === i)
    .sort((a, b) => a - b);
  return (
    <tr className="avoid-break">
      <td colSpan={2} className="px-3 pb-2">
        <Frame title={title} height={height}>
          {dist.map((l, i) => {
            const y = top + i * band;
            const a = sx(l.x1 ?? 0);
            const b = sx(l.x2 ?? g.total);
            const n = Math.max(2, Math.min(14, Math.round((b - a) / 26) + 1));
            const w1 = l.w1 ?? 0;
            const w2 = l.kind === "udl" ? w1 : (l.w2 ?? w1);
            const value = Math.abs(w1 - w2) < 1e-6 ? `${fmt(w1, 1)}` : `${fmt(w1, 1)} → ${fmt(w2, 1)}`;
            return (
              <g key={`d${i}`}>
                <line x1={a} y1={y} x2={b} y2={y} {...line} />
                {Array.from({ length: n }, (_, k) => {
                  const x = a + ((b - a) * k) / (n - 1);
                  return (
                    <g key={k}>
                      <line x1={x} y1={y} x2={x} y2={y + band - 4} {...line} />
                      <polygon
                        points={`${x},${y + band - 1} ${x - 2.5},${y + band - 6} ${x + 2.5},${y + band - 6}`}
                        fill="black"
                      />
                    </g>
                  );
                })}
                <text x={X0 - 4} y={y + 9} textAnchor="end" style={small}>
                  {l.type}
                </text>
                <text x={b + 4} y={y + 9} style={small}>
                  {value} lb/ft
                </text>
              </g>
            );
          })}
          {points.map((l, i) => {
            const x = sx(l.x ?? 0);
            return (
              <g key={`p${i}`}>
                <line x1={x} y1={10} x2={x} y2={beamY - 5} stroke="black" strokeWidth={1.4} />
                <polygon points={`${x},${beamY} ${x - 3.5},${beamY - 7} ${x + 3.5},${beamY - 7}`} fill="black" />
                <text x={x + 3} y={9 + (i % 2) * 9} style={small}>
                  P{l.type === "D" ? "D" : l.type} = {fmt(l.P ?? 0, 0)} lb
                </text>
              </g>
            );
          })}
          <line x1={X0} y1={beamY} x2={X1} y2={beamY} stroke="black" strokeWidth={2} />
          {g.supports.map((xs, i) => (
            <g key={`s${i}`}>
              <SupportGlyph x={sx(xs)} y={beamY} roller={i > 0} />
              <text x={sx(xs)} y={beamY + 29} textAnchor="middle" style={txt}>
                {g.names[i]}
              </text>
            </g>
          ))}
          <line x1={X0} y1={dimY} x2={X1} y2={dimY} {...line} />
          {marks.map((m, i) => (
            <line key={`t${i}`} x1={sx(m)} y1={dimY - 4} x2={sx(m)} y2={dimY + 4} {...line} />
          ))}
          {marks.slice(0, -1).map((m, i) => (
            <text key={`l${i}`} x={(sx(m) + sx(marks[i + 1])) / 2} y={dimY - 3} textAnchor="middle" style={small}>
              {fmt(marks[i + 1] - m, 2)} ft
            </text>
          ))}
          {reactions
            ? g.supports.map((xs, i) => (
                <text key={`r${i}`} x={sx(xs)} y={dimY + 15} textAnchor="middle" style={small}>
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
  const m = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  return m;
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
  const ticks = (axis: number) =>
    g.supports.map((xs, i) => <line key={i} x1={sx(xs)} y1={axis - 3} x2={sx(xs)} y2={axis + 3} {...line} />);

  const vS = scaleOf([...Vmax, ...Vmin]);
  const mS = scaleOf([...Mmax, ...Mmin]);
  const dS = scaleOf(defl);
  const tinyV = 1e-3 * vS;
  const tinyM = 1e-3 * mS;
  const tinyD = 1e-3 * dS;
  const vHi = extreme(shearX, Vmax, 1);
  const vLo = extreme(shearX, Vmin, -1);
  const mHi = extreme(x, Mmax, 1);
  const mLo = extreme(x, Mmin, -1);
  const dHi = extreme(x, defl, 1);
  const dLo = extreme(x, defl, -1);
  const label = (xx: number, y: number, t: string) => (
    <text x={Math.min(Math.max(sx(xx), X0 + 30), X1 - 30)} y={y} textAnchor="middle" style={small}>
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
  return (
    <>
      {row(
        `Shear force diagram (lb) — ${comboLabel}${patterned ? ", envelope" : ""}`,
        92,
        <>
          <line x1={X0} y1={46} x2={X1} y2={46} {...line} strokeDasharray="3 2" />
          {ticks(46)}
          <polyline points={plot(shearX, Vmax, 46, 34, vS, -1)} stroke="black" strokeWidth={1.2} fill="none" />
          {patterned ? (
            <polyline
              points={plot(shearX, Vmin, 46, 34, vS, -1)}
              stroke="black"
              strokeWidth={0.8}
              strokeDasharray="4 2"
              fill="none"
            />
          ) : null}
          {vHi.y > tinyV ? label(vHi.x, 46 - 34 - 2, `+${fmt(vHi.y, 0)}`) : null}
          {vLo.y < -tinyV ? label(vLo.x, 46 + 34 + 9, `${fmt(vLo.y, 0)}`) : null}
        </>,
      )}
      {row(
        `Bending moment diagram (lb-ft) — ${comboLabel}${patterned ? ", envelope" : ""}`,
        100,
        <>
          <line x1={X0} y1={48} x2={X1} y2={48} {...line} strokeDasharray="3 2" />
          {ticks(48)}
          <polyline points={plot(x, Mmax, 48, 36, mS, 1)} stroke="black" strokeWidth={1.2} fill="none" />
          {patterned || Mmin.some((v) => v < -tinyM) ? (
            <polyline
              points={plot(x, Mmin, 48, 36, mS, 1)}
              stroke="black"
              strokeWidth={0.8}
              strokeDasharray={patterned ? "4 2" : undefined}
              fill="none"
            />
          ) : null}
          {mHi.y > tinyM ? label(mHi.x, 48 + 36 + 10, `M(max) = ${fmt(mHi.y, 0)}`) : null}
          {mLo.y < -tinyM ? label(mLo.x, 48 - 36 - 3, `M(min) = ${fmt(mLo.y, 0)}`) : null}
        </>,
      )}
      {row(
        `Deflected shape (in) — ${deflLabel}`,
        80,
        <>
          <line x1={X0} y1={36} x2={X1} y2={36} {...line} strokeDasharray="3 2" />
          {g.supports.map((xs, i) => (
            <SupportGlyph key={i} x={sx(xs)} y={36} />
          ))}
          <polyline points={plot(x, defl, 36, 26, dS, 1)} stroke="black" strokeWidth={1.2} fill="none" />
          {dHi.y > tinyD ? label(dHi.x, 36 + 26 + 12, `Δ = ${fmt(dHi.y, 3)}`) : null}
          {dLo.y < -tinyD ? label(dLo.x, 36 - 26 - 2, `Δ = ${fmt(-dLo.y, 3)} (up)`) : null}
        </>,
      )}
      <tr className="avoid-break">
        <td colSpan={2} className="px-3 pb-2 text-[8.5pt] italic">
          Diagrams drawn from the analysis; ordinates scaled to the maximum value. Sagging moment and downward
          deflection plotted below the axis.
          {patterned ? " Dashed line: minimum envelope under pattern live load (ASCE 7 §4.3.3)." : ""}
        </td>
      </tr>
    </>
  );
}

export const loadTypeName = (t: keyof typeof LOAD_TYPE_LABEL) => LOAD_TYPE_LABEL[t];
