/**
 * Reinforcement details for the concrete and masonry sheets, drafted as on structural
 * drawings (drafting.tsx): concrete stipple, earth hatch, bars as solid dots / runs at their
 * clear cover, leaders to the bar callouts, dimension lines. Drawn from the member's own
 * input so the detail always matches the calculation.
 */

import type React from "react";
import { BARS } from "@/engine/design/concrete";
import { fmt } from "@/engine/core/fmt";
import { BarDot, BarRun, Dim, Figure, Grade, INK, Leader, LW, TimberSection, TS, ViewTitle } from "./drafting";

const db = (size: string) => BARS[size]?.d ?? 0.5;
const inch = (v: number) => `${+v.toFixed(3)}"`;
const spread = (n: number, a: number, b: number) =>
  n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

export interface FootingRebarProps {
  title?: string;
  kind: "strip" | "pad" | "holdown";
  width: number;
  length?: number;
  h: number;
  cover: number;
  depth: number;
  stem?: { width: number; height: number };
  bearing?: number;
  bars?: { size: string; spacing?: number; count?: number };
  longitudinal?: { size: string; top: number; bottom: number };
}

/** footing section (and plan for a reinforced pad) */
export function FootingRebar(p: FootingRebarProps) {
  const pad = p.kind === "pad";
  const soilAbove = Math.max(0, p.depth - p.h);
  const stemShown = p.stem ? Math.min(p.stem.height, Math.max(14, soilAbove + 8)) : Math.max(8, soilAbove + 6);
  const above = Math.max(stemShown, soilAbove);
  const sc = Math.min(200 / (p.width + 24), 120 / (p.h + above));
  const cxSec = pad && p.bars ? 130 : 170;
  const X = (v: number) => cxSec - (p.width * sc) / 2 + v * sc;
  const yTop = 14 + above * sc;
  const Y = (v: number) => yTop + v * sc;
  const bot = Y(p.h);
  const grade = bot - p.depth * sc;
  const cv = p.cover;
  const tb = p.bars ? db(p.bars.size) : 0;
  const shapes: React.ReactNode[] = [];
  const calls: Array<{ x: number; y: number; label: string }> = [];

  if (p.bars && !pad) {
    const y = Y(p.h - cv - tb / 2);
    shapes.push(
      <BarRun
        key="t"
        points={`${X(cv)},${y - 4} ${X(cv)},${y} ${X(p.width - cv)},${y} ${X(p.width - cv)},${y - 4}`}
        w={tb * sc}
      />,
    );
    calls.push({ x: X(p.width * 0.75), y, label: `${p.bars.size} @ ${inch(p.bars.spacing ?? 12)} o.c. transverse` });
  }
  if (p.bars && pad) {
    const n = p.bars.count ?? 2;
    const y1 = Y(p.h - cv - tb / 2);
    const y2 = Y(p.h - cv - 1.5 * tb);
    shapes.push(<BarRun key="pl" points={`${X(cv)},${y1} ${X(p.width - cv)},${y1}`} w={tb * sc} />);
    spread(n, cv + tb / 2, p.width - cv - tb / 2).forEach((x, i) =>
      shapes.push(<BarDot key={`pd${i}`} x={X(x)} y={y2} r={(tb / 2) * sc} />),
    );
    calls.push({ x: X(p.width - cv - tb / 2), y: y2, label: `(${n}) ${p.bars.size} each way, bottom` });
  }
  if (p.longitudinal) {
    const lb = db(p.longitudinal.size);
    const xs = (n: number) =>
      spread(n, cv + lb / 2 + (p.bars && !pad ? tb : 0), p.width - cv - lb / 2 - (p.bars && !pad ? tb : 0));
    if (p.longitudinal.top > 0) {
      const y = Y(cv + lb / 2);
      const pts = xs(p.longitudinal.top);
      pts.forEach((x, i) => shapes.push(<BarDot key={`lt${i}`} x={X(x)} y={y} r={(lb / 2) * sc} />));
      calls.unshift({
        x: X(pts[pts.length - 1]),
        y,
        label: `(${p.longitudinal.top}) ${p.longitudinal.size} continuous top`,
      });
    }
    if (p.longitudinal.bottom > 0) {
      const y = Y(p.h - cv - (p.bars && !pad ? tb : 0) - lb / 2);
      const pts = xs(p.longitudinal.bottom);
      pts.forEach((x, i) => shapes.push(<BarDot key={`lb${i}`} x={X(x)} y={y} r={(lb / 2) * sc} />));
      calls.push({
        x: X(pts[pts.length - 1]),
        y,
        label: `(${p.longitudinal.bottom}) ${p.longitudinal.size} continuous bottom`,
      });
    }
  }
  const plain = !p.bars && !p.longitudinal;
  const tx = X(p.width + 12) + 26;
  const stemW = p.stem?.width ?? p.bearing ?? 0;

  // reinforced pad: plan beside the section
  let plan: React.ReactNode = null;
  if (pad && p.bars) {
    const L = p.length ?? p.width;
    const ps = Math.min(110 / p.width, 110 / L);
    const px0 = 330 - (p.width * ps) / 2;
    const py0 = 14;
    const n = p.bars.count ?? 2;
    plan = (
      <g>
        <rect
          x={px0}
          y={py0}
          width={p.width * ps}
          height={L * ps}
          fill="url(#h-conc)"
          stroke={INK}
          strokeWidth={LW.object}
        />
        {spread(n, cv, p.width - cv).map((x, i) => (
          <line
            key={`v${i}`}
            x1={px0 + x * ps}
            y1={py0 + cv * ps}
            x2={px0 + x * ps}
            y2={py0 + (L - cv) * ps}
            stroke={INK}
            strokeWidth={1.1}
          />
        ))}
        {spread(n, cv, L - cv).map((y, i) => (
          <line
            key={`h${i}`}
            x1={px0 + cv * ps}
            y1={py0 + y * ps}
            x2={px0 + (p.width - cv) * ps}
            y2={py0 + y * ps}
            stroke={INK}
            strokeWidth={1.1}
          />
        ))}
        {p.bearing ? (
          <TimberSection
            x={px0 + (p.width / 2 - p.bearing / 2) * ps}
            y={py0 + (L / 2 - p.bearing / 2) * ps}
            w={p.bearing * ps}
            h={p.bearing * ps}
          />
        ) : null}
        <Dim a={px0} b={px0 + p.width * ps} at={py0 + L * ps + 10} from={py0 + L * ps} label={inch(p.width)} />
        <Dim a={py0} b={py0 + L * ps} at={px0 + p.width * ps + 12} from={px0 + p.width * ps} label={inch(L)} vertical />
        <ViewTitle x={330} y={py0 + L * ps + 30}>
          Plan
        </ViewTitle>
      </g>
    );
  }
  const height = Math.max(bot + 40, pad && p.bars ? 180 : 0);
  return (
    <Figure title={p.title ?? "Reinforcement"} height={height}>
      <Grade x1={X(-12)} x2={X(p.width / 2 - stemW / 2)} y={grade} depth={6} />
      <Grade x1={X(p.width / 2 + stemW / 2)} x2={X(p.width + 12)} y={grade} depth={6} />
      <rect
        x={X(0)}
        y={Y(0)}
        width={p.width * sc}
        height={p.h * sc}
        fill="url(#h-conc)"
        stroke={INK}
        strokeWidth={LW.object}
      />
      {p.stem ? (
        <rect
          x={X(p.width / 2 - stemW / 2)}
          y={Y(-stemShown)}
          width={stemW * sc}
          height={stemShown * sc}
          fill="url(#h-conc)"
          stroke={INK}
          strokeWidth={LW.object}
        />
      ) : stemW ? (
        <TimberSection x={X(p.width / 2 - stemW / 2)} y={Y(-stemShown)} w={stemW * sc} h={stemShown * sc} />
      ) : null}
      {shapes}
      {calls.map((c, i) => (
        <Leader key={i} x={c.x} y={c.y} tx={pad && p.bars ? 190 : tx} ty={Y(0) + 4 + i * 12} label={c.label} />
      ))}
      {plain ? (
        <text x={tx} y={Y(0) + 12} style={TS}>
          Plain concrete — no reinforcement
        </text>
      ) : (
        <text x={pad && p.bars ? 190 : tx} y={Y(0) + 4 + calls.length * 12} style={TS}>
          {inch(cv)} clear cover
        </text>
      )}
      <Dim a={X(0)} b={X(p.width)} at={bot + 12} from={bot} label={inch(p.width)} />
      <Dim a={Y(0)} b={bot} at={X(0) - 14} from={X(0)} label={inch(p.h)} vertical side={-1} />
      {p.depth > p.h + 0.5 ? (
        <Dim a={grade} b={bot} at={X(-12) - 10} from={X(-12)} label={inch(p.depth)} vertical side={-1} />
      ) : null}
      <ViewTitle x={X(p.width / 2)} y={bot + 32}>
        Section
      </ViewTitle>
      {plan}
    </Figure>
  );
}

/** wall section through the vertical bars (plan cut) */
export function WallRebar({
  title = "Reinforcement",
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
  const sc = Math.min(260 / Ls, 50 / t);
  const x0 = 40;
  const y0 = 18;
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => y0 + v * sc;
  const vb = db(vertical.size);
  const depths =
    vertical.layout === "each-face"
      ? [cover + vb / 2, t - cover - vb / 2]
      : [vertical.layout === "center" ? t / 2 : (vertical.d ?? t / 2)];
  const xs: number[] = [];
  for (let x = s / 2; x < Ls; x += s) xs.push(x);
  const bot = Y(t);
  return (
    <Figure title={title} height={bot + 46}>
      <rect
        x={X(0)}
        y={Y(0)}
        width={Ls * sc}
        height={t * sc}
        fill={material === "cmu" ? "url(#h-cmu)" : "url(#h-conc)"}
        stroke={INK}
        strokeWidth={LW.object}
      />
      {material === "cmu"
        ? xs.map((x, i) => {
            const c0 = Math.floor(x / 8) * 8;
            return (
              <rect
                key={`g${i}`}
                x={X(c0 + 1.25)}
                y={Y(1.25)}
                width={(8 - 2.5) * sc}
                height={(t - 2.5) * sc}
                fill="url(#h-grout)"
                stroke={INK}
                strokeWidth={LW.hatch}
              />
            );
          })
        : null}
      {/* break lines at the cut ends */}
      {[X(0), X(Ls)].map((x, i) => (
        <polyline
          key={i}
          points={`${x},${Y(0) - 4} ${x},${Y(t / 2) - 4} ${x - 3},${Y(t / 2)} ${x + 3},${Y(t / 2) + 2} ${x},${Y(t / 2) + 5} ${x},${bot + 4}`}
          fill="none"
          stroke={INK}
          strokeWidth={LW.thin}
        />
      ))}
      <line x1={X(1)} y1={Y(t / 2)} x2={X(Ls - 1)} y2={Y(t / 2)} stroke={INK} strokeWidth={1} strokeDasharray="10 2" />
      {xs.flatMap((x, i) => depths.map((d, k) => <BarDot key={`v${i}-${k}`} x={X(x)} y={Y(d)} r={(vb / 2) * sc} />))}
      <Leader
        x={X(xs[xs.length - 1])}
        y={Y(depths[0])}
        tx={X(Ls) + 22}
        ty={Y(0) + 2}
        label={`${vertical.size} @ ${inch(s)} o.c. vertical${vertical.layout === "each-face" ? " each face" : vertical.layout === "center" ? " centred" : ""}`}
      />
      <Leader
        x={X(Ls - 3)}
        y={Y(t / 2)}
        tx={X(Ls) + 22}
        ty={Y(0) + 14}
        label={`(${horizontal.count}) ${horizontal.size} horizontal @ ${inch(horizontal.spacing)} o.c.`}
      />
      {xs.length > 1 ? <Dim a={X(xs[0])} b={X(xs[1])} at={bot + 12} from={bot} label={inch(s)} /> : null}
      <Dim a={Y(0)} b={bot} at={X(0) - 12} from={X(0)} label={inch(t)} vertical side={-1} />
      <ViewTitle x={X(Ls / 2)} y={bot + 34}>
        Plan section
      </ViewTitle>
    </Figure>
  );
}

/** dowels drilled and bonded into existing concrete */
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
  const sc = Math.min(220 / (exW + newW), 90 / ha);
  const x0 = 70;
  const y0 = 16;
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => y0 + v * sc;
  const yb = Math.min(ca1, ha / 2);
  const bot = Y(ha);
  return (
    <Figure title="Reinforcement" height={bot + 40}>
      <rect
        x={X(0)}
        y={Y(0)}
        width={exW * sc}
        height={ha * sc}
        fill="url(#h-conc)"
        stroke={INK}
        strokeWidth={LW.object}
      />
      <rect x={X(exW)} y={Y(0)} width={newW * sc} height={ha * sc} fill="#fff" stroke={INK} strokeWidth={LW.object} />
      <rect
        x={X(exW)}
        y={Y(0)}
        width={newW * sc}
        height={ha * sc}
        fill="url(#h-conc)"
        fillOpacity={0.5}
        stroke="none"
      />
      <line x1={X(exW)} y1={Y(0) - 6} x2={X(exW)} y2={bot + 6} stroke={INK} strokeWidth={LW.heavy} />
      <text x={X(exW / 2)} y={Y(0) - 4} textAnchor="middle" style={TS}>
        (E) concrete
      </text>
      <text x={X(exW + newW / 2)} y={Y(0) - 4} textAnchor="middle" style={TS}>
        (N) concrete
      </text>
      <rect
        x={X(exW - hef)}
        y={Y(yb) - (d * sc) / 2 - 1.5}
        width={hef * sc}
        height={d * sc + 3}
        fill="#fff"
        stroke={INK}
        strokeWidth={LW.thin}
      />
      <BarRun points={`${X(exW - hef)},${Y(yb)} ${X(exW + newW - 1.5)},${Y(yb)}`} w={d * sc} />
      <Leader
        x={X(exW + newW * 0.6)}
        y={Y(yb)}
        tx={X(exW + newW) + 20}
        ty={Y(0) + 6}
        label={`${size} dowels @ ${inch(spacing)} o.c.`}
      />
      <Leader
        x={X(exW - hef * 0.5)}
        y={Y(yb) - (d * sc) / 2 - 1.5}
        tx={X(exW + newW) + 20}
        ty={Y(0) + 18}
        label={`adhesive: ${product.length > 28 ? `${product.slice(0, 27)}…` : product}`}
      />
      <Dim a={X(exW - hef)} b={X(exW)} at={bot + 12} from={bot} label={`h_ef = ${inch(hef)}`} />
      <Dim a={Y(0)} b={Y(yb)} at={X(0) - 12} from={X(0)} label={inch(ca1)} vertical side={-1} />
      <Dim a={Y(0)} b={bot} at={X(0) - 30} from={X(0)} label={inch(ha)} vertical side={-1} />
      <ViewTitle x={X((exW + newW) / 2)} y={bot + 32}>
        Section at joint
      </ViewTitle>
    </Figure>
  );
}

/** retaining wall: stem bars hooked into the footing, top and bottom mats, longitudinal bars */
export function RetainingRebar({
  B,
  hf,
  toe,
  ts,
  stemH,
  stem,
  footing,
}: {
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
  const sc = Math.min(220 / Bi, 200 / (Hi + hf));
  const x0 = 60;
  const yb = 16 + (Hi + hf) * sc;
  const X = (v: number) => x0 + v * sc;
  const Y = (v: number) => yb - v * sc;
  const t0 = toe * 12;
  const vb = db(stem.size);
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
  const tx = X(Bi) + 26;
  return (
    <Figure title="Reinforcement" height={yb + 40}>
      <polygon
        points={`${X(0)},${Y(0)} ${X(Bi)},${Y(0)} ${X(Bi)},${Y(hf)} ${X(t0 + ts)},${Y(hf)} ${X(t0 + ts)},${Y(hf + Hi)} ${X(t0)},${Y(hf + Hi)} ${X(t0)},${Y(hf)} ${X(0)},${Y(hf)}`}
        fill="url(#h-conc)"
        stroke={INK}
        strokeWidth={LW.object}
      />
      <BarRun
        points={`${X(footing.coverBottom)},${Y(yBot) - 4} ${X(footing.coverBottom)},${Y(yBot)} ${X(Bi - footing.coverBottom)},${Y(yBot)} ${X(Bi - footing.coverBottom)},${Y(yBot) - 4}`}
        w={bb * sc}
      />
      <BarRun points={`${X(footing.coverTop)},${Y(yTopBar)} ${X(Bi - footing.coverTop)},${Y(yTopBar)}`} w={tb * sc} />
      {longX.map((x, i) => (
        <BarDot key={`l${i}`} x={X(x)} y={Y(yBot + bb / 2 + lb / 2)} r={(lb / 2) * sc} />
      ))}
      {xs.map((x, i) => (
        <BarRun
          key={`s${i}`}
          points={`${X(x)},${Y(hf + Hi - 2)} ${X(x)},${Y(hookY)} ${X(Math.max(footing.coverBottom, x - 12 * vb))},${Y(hookY)}`}
          w={vb * sc}
        />
      ))}
      <Leader
        x={X(xs[xs.length - 1])}
        y={Y(hf + Hi * 0.6)}
        tx={tx}
        ty={Y(hf + Hi * 0.6)}
        label={`${stem.size} @ ${inch(stem.spacing)} o.c. vertical${stem.layout === "each-face" ? " each face" : ""}, std. hook`}
      />
      <Leader
        x={X(Bi * 0.85)}
        y={Y(yTopBar)}
        tx={tx}
        ty={Y(hf) - 10}
        label={`${footing.top.size} @ ${inch(footing.top.spacing)} o.c. top`}
      />
      <Leader
        x={X(Bi * 0.92)}
        y={Y(yBot)}
        tx={tx}
        ty={Y(hf) + 2}
        label={`${footing.bottom.size} @ ${inch(footing.bottom.spacing)} o.c. bottom`}
      />
      <Leader
        x={X(longX[longX.length - 1])}
        y={Y(yBot + bb / 2 + lb / 2)}
        tx={tx}
        ty={Y(hf) + 14}
        label={`(${footing.longitudinal.count}) ${footing.longitudinal.size} longitudinal`}
      />
      <Dim a={X(0)} b={X(Bi)} at={yb + 12} from={yb} label={`${fmt(B, 2)} ft`} />
      <Dim a={Y(hf)} b={yb} at={X(0) - 12} from={X(0)} label={inch(hf)} vertical side={-1} />
      <Dim a={Y(hf + Hi)} b={Y(hf)} at={X(0) - 12} from={X(t0)} label={`${fmt(stemH, 2)} ft`} vertical side={-1} />
      <ViewTitle x={X(Bi / 2)} y={yb + 32}>
        Section
      </ViewTitle>
    </Figure>
  );
}
