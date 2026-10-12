/**
 * Geometry figures in the manner of Tekla Tedds output: member sections, post / column
 * elevations, stud-wall and shear-wall elevations, the rafter, footing plans, the base-plate
 * plan and the masonry wall section. Drafted with the kit in drafting.tsx — black linework,
 * section hatching, dimension lines with arrowheads — from each member's own input.
 */

import type { ResolvedWood } from "@/engine/design/wood";
import type { SteelShape } from "@/engine/data/steel";
import { fmt, fmtFtIn } from "@/engine/core/fmt";
import { CL, Dim, Figure, FixedSupport, INK, LW, PinSupport, T, TimberSection, TS, ViewTitle } from "./drafting";

const inch = (v: number) => `${+v.toFixed(3)}"`;

/* ------------------------------------------------------------------ sections */

function woodShapes(m: ResolvedWood, x0: number, y0: number, sc: number) {
  const n = Math.max(1, m.plies);
  const bp = m.bPly || m.b / n;
  if (m.kind === "glulam")
    return (
      <g>
        <rect x={x0} y={y0} width={m.b * sc} height={m.d * sc} fill="#fff" stroke={INK} strokeWidth={LW.object} />
        {Array.from({ length: Math.max(1, Math.round(m.d / 1.5)) - 1 }, (_, k) => (
          <line
            key={k}
            x1={x0}
            x2={x0 + m.b * sc}
            y1={y0 + (k + 1) * 1.5 * sc}
            y2={y0 + (k + 1) * 1.5 * sc}
            stroke={INK}
            strokeWidth={LW.hatch}
          />
        ))}
      </g>
    );
  return (
    <g>
      {Array.from({ length: n }, (_, i) =>
        m.kind === "scl" ? (
          <g key={i}>
            <rect
              x={x0 + i * bp * sc}
              y={y0}
              width={bp * sc}
              height={m.d * sc}
              fill="url(#h-wood)"
              stroke={INK}
              strokeWidth={LW.object}
            />
          </g>
        ) : (
          <TimberSection key={i} x={x0 + i * bp * sc} y={y0} w={bp * sc} h={m.d * sc} />
        ),
      )}
    </g>
  );
}

/** cross-section of a wood member, dimensioned */
export function WoodSection({ m, title = "Section" }: { m: ResolvedWood; title?: string }) {
  const sc = Math.min(100 / m.d, 140 / m.b, 13);
  const cx = FIG_CX;
  const x0 = cx - (m.b * sc) / 2;
  const y0 = 14;
  const n = Math.max(1, m.plies);
  const bot = y0 + m.d * sc;
  return (
    <Figure title={title} height={bot + 34}>
      {woodShapes(m, x0, y0, sc)}
      <Dim a={x0} b={x0 + m.b * sc} at={bot + 10} from={bot} label={inch(m.b)} />
      {n > 1 ? <Dim a={x0} b={x0 + m.bPly * sc} at={y0 - 6} from={y0} label={inch(m.bPly)} side={-1} /> : null}
      <Dim a={y0} b={bot} at={x0 - 12} from={x0} label={inch(m.d)} vertical side={-1} />
      <text x={cx} y={bot + 28} textAnchor="middle" style={T}>
        {m.label}
      </text>
    </Figure>
  );
}

const FIG_CX = 235;

function steelShapes(s: SteelShape, cx: number, cy: number, sc: number) {
  const d = s.d * sc;
  const b = s.bf * sc;
  const tf = Math.max(1.2, s.tf * sc);
  const tw = Math.max(1.2, s.tw * sc);
  const x0 = cx - b / 2;
  const y0 = cy - d / 2;
  const style = { fill: "#9e9e9e", stroke: INK, strokeWidth: LW.object };
  if (s.family === "HSSR")
    return (
      <g>
        <circle cx={cx} cy={cy} r={d / 2} {...style} />
        <circle cx={cx} cy={cy} r={Math.max(1, d / 2 - tw)} fill="#fff" stroke={INK} strokeWidth={LW.object} />
      </g>
    );
  if (s.family === "HSS") {
    const r = Math.min(2 * s.tw * sc, b / 4);
    return (
      <g>
        <rect x={x0} y={y0} width={b} height={d} rx={r} {...style} />
        <rect
          x={x0 + tw}
          y={y0 + tw}
          width={b - 2 * tw}
          height={d - 2 * tw}
          rx={Math.max(0, r - tw)}
          fill="#fff"
          stroke={INK}
          strokeWidth={LW.object}
        />
      </g>
    );
  }
  const pts =
    s.family === "C"
      ? [
          [x0, y0],
          [x0 + b, y0],
          [x0 + b, y0 + tf],
          [x0 + tw, y0 + tf],
          [x0 + tw, y0 + d - tf],
          [x0 + b, y0 + d - tf],
          [x0 + b, y0 + d],
          [x0, y0 + d],
        ]
      : [
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
  return <polygon points={pts.map((p) => p.join(",")).join(" ")} {...style} />;
}

/** steel section, dimensioned */
export function SteelSection({ s, grade, title = "Section" }: { s: SteelShape; grade?: string; title?: string }) {
  const sc = Math.min(100 / s.d, 130 / s.bf, 11);
  const cx = FIG_CX;
  const y0 = 14;
  const cy = y0 + (s.d * sc) / 2;
  const x0 = cx - (s.bf * sc) / 2;
  const bot = y0 + s.d * sc;
  const hss = s.family === "HSS" || s.family === "HSSR";
  return (
    <Figure title={title} height={bot + 34}>
      {steelShapes(s, cx, cy, sc)}
      <Dim a={x0} b={x0 + s.bf * sc} at={bot + 10} from={bot} label={inch(s.bf)} />
      {s.family !== "HSSR" ? <Dim a={y0} b={bot} at={x0 - 12} from={x0} label={inch(s.d)} vertical side={-1} /> : null}
      {!hss ? (
        <>
          <text x={cx + (s.bf * sc) / 2 + 6} y={y0 + 4} style={TS}>
            t_f = {inch(s.tf)}
          </text>
          <text x={cx + 4} y={cy + 3} style={TS}>
            t_w = {inch(s.tw)}
          </text>
        </>
      ) : (
        <text x={cx + (s.bf * sc) / 2 + 6} y={y0 + 6} style={TS}>
          t = {inch(s.tw)}
        </text>
      )}
      <text x={cx} y={bot + 28} textAnchor="middle" style={T}>
        {s.name}
        {grade ? ` (${grade})` : ""}
      </text>
    </Figure>
  );
}

/* ---------------------------------------------------------------- elevations */

/** post / column elevation (ends pinned, brace points by axis) with the section beside it */
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
  height: number;
  braceStrong?: number;
  braceWeak?: number;
  leX: number;
  leY: number;
  base: string;
  section: { kind: "wood"; m: ResolvedWood } | { kind: "steel"; s: SteelShape };
  sectionLabel: string;
}) {
  // elevation to scale up to 150 px for 12 ft; shorter posts stay short
  const H = Math.max(60, Math.min(160, (height / 12) * 150));
  const x = 150;
  const yTop = 14;
  const yBot = yTop + H;
  const Y = (ft: number) => yBot - (ft / height) * H;
  const wPx = 9;
  const braces = (iv: number | undefined) =>
    iv && iv > 0 && iv < height ? Array.from({ length: Math.floor(height / iv - 1e-9) }, (_, i) => (i + 1) * iv) : [];
  const bx = braces(braceStrong);
  const by = braces(braceWeak);
  const secSc =
    section.kind === "wood"
      ? Math.min(60 / section.m.d, 60 / section.m.b, 9)
      : Math.min(60 / section.s.d, 60 / section.s.bf, 8);
  const sw = section.kind === "wood" ? section.m.b * secSc : section.s.bf * secSc;
  const sh = section.kind === "wood" ? section.m.d * secSc : section.s.d * secSc;
  const sx = 320 - sw / 2;
  const sy = yTop + 10;
  return (
    <Figure title="Geometry" height={Math.max(yBot + 36, sy + sh + 62)}>
      <rect x={x - wPx / 2} y={yTop} width={wPx} height={H} fill="#fff" stroke={INK} strokeWidth={LW.object} />
      <PinSupport x={x} y={yTop} flip />
      <PinSupport x={x} y={yBot} />
      {bx.map((b, i) => (
        <g key={`bx${i}`}>
          <line x1={x + wPx / 2} y1={Y(b)} x2={x + 22} y2={Y(b)} stroke={INK} strokeWidth={LW.object} />
          <line x1={x + 22} y1={Y(b) - 4} x2={x + 22} y2={Y(b) + 4} stroke={INK} strokeWidth={LW.object} />
        </g>
      ))}
      {by.map((b, i) => (
        <g key={`by${i}`}>
          <line
            x1={x - wPx / 2}
            y1={Y(b)}
            x2={x - 22}
            y2={Y(b)}
            stroke={INK}
            strokeWidth={LW.object}
            strokeDasharray="3 1.5"
          />
          <line x1={x - 22} y1={Y(b) - 4} x2={x - 22} y2={Y(b) + 4} stroke={INK} strokeWidth={LW.object} />
        </g>
      ))}
      <Dim a={yTop} b={yBot} at={x - 40} from={x - wPx / 2} label={fmtFtIn(height)} vertical side={-1} />
      <text x={x} y={yBot + 24} textAnchor="middle" style={TS}>
        {base}
      </text>
      <ViewTitle x={x} y={yBot + 34}>
        Elevation
      </ViewTitle>
      {section.kind === "wood" ? woodShapes(section.m, sx, sy, secSc) : steelShapes(section.s, 320, sy + sh / 2, secSc)}
      <Dim
        a={sx}
        b={sx + sw}
        at={sy + sh + 9}
        from={sy + sh}
        label={inch(section.kind === "wood" ? section.m.b : section.s.bf)}
      />
      <Dim
        a={sy}
        b={sy + sh}
        at={sx - 10}
        from={sx}
        label={inch(section.kind === "wood" ? section.m.d : section.s.d)}
        vertical
        side={-1}
      />
      <text x={320} y={sy + sh + 28} textAnchor="middle" style={TS}>
        {sectionLabel}
      </text>
      <ViewTitle x={320} y={sy + sh + 40}>
        Section
      </ViewTitle>
      <text x={320} y={sy + sh + 56} textAnchor="middle" style={TS}>
        l_e,x = {fmtFtIn(leX / 12)}; l_e,y = {fmtFtIn(leY / 12)}
      </text>
    </Figure>
  );
}

/** stud-wall elevation: plates, studs, openings with headers, stud packs */
export function StudWallElevation({
  length,
  plateHeight,
  spacing,
  stud,
  topPlates,
  bottomPlates,
  openings,
  packs,
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
  const sc = Math.min(380 / (shownL * 12), 140 / (plateHeight * 12));
  const x0 = 50;
  const yTop = 10;
  const X = (ft: number) => x0 + ft * 12 * sc;
  const Y = (inUp: number) => yTop + (plateHeight * 12 - inUp) * sc;
  const pl = 1.5;
  const studTop = Y(plateHeight * 12 - topPlates * pl);
  const studBot = Y(bottomPlates * pl);
  const studs: number[] = [];
  for (let x = 0; x <= shownL * 12 + 1e-6; x += spacing) studs.push(x / 12);
  const inOpening = (x: number) => openings.some((o) => x > o.x1 + 0.05 && x < o.x2 - 0.05);
  const yb = Y(0);
  const wallW = shownL * 12 * sc;
  return (
    <Figure title="Geometry" height={yb + 46}>
      {Array.from({ length: topPlates }, (_, i) => (
        <rect
          key={`t${i}`}
          x={X(0)}
          y={Y(plateHeight * 12 - i * pl)}
          width={wallW}
          height={pl * sc}
          fill="#fff"
          stroke={INK}
          strokeWidth={LW.object}
        />
      ))}
      {Array.from({ length: bottomPlates }, (_, i) => (
        <rect
          key={`b${i}`}
          x={X(0)}
          y={Y((i + 1) * pl)}
          width={wallW}
          height={pl * sc}
          fill="#fff"
          stroke={INK}
          strokeWidth={LW.object}
        />
      ))}
      {studs
        .filter((x) => !inOpening(x))
        .map((x, i) => (
          <rect
            key={`s${i}`}
            x={Math.min(X(x), X(shownL) - 1.5 * sc)}
            y={studTop}
            width={1.5 * sc}
            height={studBot - studTop}
            fill="#fff"
            stroke={INK}
            strokeWidth={LW.thin}
          />
        ))}
      {openings
        .filter((o) => o.x1 < shownL)
        .map((o, i) => {
          const a = X(o.x1);
          const b = X(Math.min(o.x2, shownL));
          const hdr = 11.25 * sc;
          return (
            <g key={`o${i}`}>
              <rect x={a} y={studTop} width={b - a} height={hdr} fill="#fff" stroke={INK} strokeWidth={LW.object} />
              <line x1={a} y1={studTop} x2={b} y2={studTop + hdr} stroke={INK} strokeWidth={LW.hatch} />
              <line x1={b} y1={studTop} x2={a} y2={studTop + hdr} stroke={INK} strokeWidth={LW.hatch} />
              <line
                x1={a}
                y1={studTop + hdr}
                x2={b}
                y2={studBot}
                stroke={INK}
                strokeWidth={LW.hatch}
                strokeDasharray="4 2"
              />
              <line
                x1={b}
                y1={studTop + hdr}
                x2={a}
                y2={studBot}
                stroke={INK}
                strokeWidth={LW.hatch}
                strokeDasharray="4 2"
              />
              <text x={(a + b) / 2} y={studTop + hdr + 10} textAnchor="middle" style={TS}>
                {o.label}
              </text>
            </g>
          );
        })}
      {packs
        .filter((p) => p.x <= shownL)
        .map((p, i) => {
          const w = p.studs * 1.5 * sc;
          const x = Math.min(Math.max(X(p.x) - w / 2, X(0)), X(shownL) - w);
          return (
            <g key={`p${i}`}>
              <rect
                x={x}
                y={studTop}
                width={w}
                height={studBot - studTop}
                fill="#e0e0e0"
                stroke={INK}
                strokeWidth={LW.object}
              />
              {Array.from({ length: p.studs - 1 }, (_, k) => (
                <line
                  key={k}
                  x1={x + (k + 1) * 1.5 * sc}
                  y1={studTop}
                  x2={x + (k + 1) * 1.5 * sc}
                  y2={studBot}
                  stroke={INK}
                  strokeWidth={LW.hatch}
                />
              ))}
            </g>
          );
        })}
      <FixedSupport x={(X(0) + X(shownL)) / 2} y={yb} len={wallW + 16} />
      <Dim a={Y(plateHeight * 12)} b={yb} at={X(0) - 14} from={X(0)} label={fmtFtIn(plateHeight)} vertical side={-1} />
      <Dim
        a={X(0)}
        b={X(shownL)}
        at={yb + 14}
        from={yb}
        label={shownL < length ? `${fmtFtIn(shownL)} (of ${fmtFtIn(length)})` : fmtFtIn(length)}
      />
      <text x={X(0)} y={yb + 34} style={TS}>
        {stud} studs @ {inch(spacing)} o.c.; {topPlates} top plate{topPlates > 1 ? "s" : ""}, {bottomPlates} bottom
        plate
        {bottomPlates > 1 ? "s" : ""}
      </text>
    </Figure>
  );
}

/** shear-wall elevation: panel, end posts, hold-downs, sill anchors, opening */
export function ShearWallElevation({
  b,
  h,
  endPost,
  holdown,
  opening,
  sillSpacing,
}: {
  b: number;
  h: number;
  endPost: string;
  holdown?: string;
  sides: string[];
  opening?: { L1: number; Lo: number; L2: number; ha: number; hb: number };
  sillSpacing?: number;
}) {
  const sc = Math.min(330 / (b * 12), 140 / (h * 12));
  const x0 = 60;
  const yTop = 14;
  const X = (ft: number) => x0 + ft * 12 * sc;
  const Y = (ft: number) => yTop + (h - ft) * 12 * sc;
  const yb = Y(0);
  const post = 3.5 * sc;
  return (
    <Figure title="Geometry" height={yb + 50}>
      <rect
        x={X(0)}
        y={Y(h)}
        width={b * 12 * sc}
        height={h * 12 * sc}
        fill="#fff"
        stroke={INK}
        strokeWidth={LW.object}
      />
      {/* panel joints */}
      {Array.from({ length: Math.floor(b / 4 - 1e-6) }, (_, i) => (i + 1) * 4).map((x) => (
        <line
          key={`j${x}`}
          x1={X(x)}
          y1={Y(h)}
          x2={X(x)}
          y2={yb}
          stroke={INK}
          strokeWidth={LW.hatch}
          strokeDasharray="5 2"
        />
      ))}
      {h > 8 ? (
        <line
          x1={X(0)}
          y1={Y(h - 8)}
          x2={X(b)}
          y2={Y(h - 8)}
          stroke={INK}
          strokeWidth={LW.hatch}
          strokeDasharray="5 2"
        />
      ) : null}
      {opening ? (
        <g>
          <rect
            x={X(opening.L1)}
            y={Y(h - opening.ha)}
            width={opening.Lo * 12 * sc}
            height={(h - opening.ha - opening.hb) * 12 * sc}
            fill="#fff"
            stroke={INK}
            strokeWidth={LW.object}
          />
          <line
            x1={X(opening.L1)}
            y1={Y(h - opening.ha)}
            x2={X(opening.L1 + opening.Lo)}
            y2={Y(opening.hb)}
            stroke={INK}
            strokeWidth={LW.hatch}
          />
          <line
            x1={X(opening.L1 + opening.Lo)}
            y1={Y(h - opening.ha)}
            x2={X(opening.L1)}
            y2={Y(opening.hb)}
            stroke={INK}
            strokeWidth={LW.hatch}
          />
        </g>
      ) : null}
      {[X(0), X(b) - post].map((x, i) => (
        <rect
          key={`p${i}`}
          x={x}
          y={Y(h)}
          width={post}
          height={h * 12 * sc}
          fill="#e0e0e0"
          stroke={INK}
          strokeWidth={LW.object}
        />
      ))}
      {holdown
        ? [X(0) + post, X(b) - post - 4].map((x, i) => (
            <rect key={`hd${i}`} x={x} y={yb - 16} width={4} height={14} fill={INK} />
          ))
        : null}
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
                y1={yb - 4}
                x2={x0 + v * sc}
                y2={yb + 6}
                stroke={INK}
                strokeWidth={1.1}
              />
            ))
        : null}
      <FixedSupport x={(X(0) + X(b)) / 2} y={yb} len={b * 12 * sc + 16} />
      <Dim a={X(0)} b={X(b)} at={yb + 16} from={yb} label={fmtFtIn(b)} />
      <Dim a={Y(h)} b={yb} at={X(0) - 14} from={X(0)} label={fmtFtIn(h)} vertical side={-1} />
      {opening ? (
        <>
          <Dim a={X(0)} b={X(opening.L1)} at={Y(h) - 8} from={Y(h)} label={fmtFtIn(opening.L1)} side={-1} />
          <Dim
            a={X(opening.L1)}
            b={X(opening.L1 + opening.Lo)}
            at={Y(h) - 8}
            from={Y(h)}
            label={fmtFtIn(opening.Lo)}
            side={-1}
          />
          <Dim
            a={X(opening.L1 + opening.Lo)}
            b={X(b)}
            at={Y(h) - 8}
            from={Y(h)}
            label={fmtFtIn(opening.L2)}
            side={-1}
          />
        </>
      ) : null}
      <text x={X(0)} y={yb + 36} style={TS}>
        End posts {endPost}
        {holdown ? `; hold-downs ${holdown}` : ""}
        {sillSpacing ? `; sill anchors @ ${inch(sillSpacing)} o.c.` : ""}; h / b = {fmt(h / b, 2)}
      </text>
    </Figure>
  );
}

/** rafter: plate, ridge, slope, run, rise and overhang */
export function RafterGeometry({
  run,
  rise,
  overhang,
  thetaDeg,
  ridge,
}: {
  run: number;
  rise: number;
  overhang: number;
  thetaDeg: number;
  slopedSpan: number;
  ridge: string;
}) {
  const total = run + overhang;
  const riseFt = (run * rise) / 12;
  const sc = Math.min(330 / total, 100 / Math.max(riseFt + (overhang * rise) / 12, 0.5));
  const xPlate = 60 + overhang * sc;
  const yPlate = 18 + riseFt * sc;
  const xRidge = xPlate + run * sc;
  const yRidge = yPlate - riseFt * sc;
  const xEave = xPlate - overhang * sc;
  const yEave = yPlate + (overhang * rise * sc) / 12;
  const t = 5;
  const nx = (t * Math.sin((thetaDeg * Math.PI) / 180)) / 1;
  const ny = t * Math.cos((thetaDeg * Math.PI) / 180);
  const bottom = Math.max(yEave, yPlate + 12);
  return (
    <Figure title="Geometry" height={bottom + 40}>
      <polygon
        points={`${xEave},${yEave} ${xRidge},${yRidge} ${xRidge - nx},${yRidge - ny} ${xEave - nx},${yEave - ny}`}
        fill="#fff"
        stroke={INK}
        strokeWidth={LW.object}
      />
      <PinSupport x={xPlate} y={yPlate} />
      <rect
        x={xRidge}
        y={yRidge - ny - 4}
        width={4}
        height={ny + 14}
        fill="#fff"
        stroke={INK}
        strokeWidth={LW.object}
      />
      <text x={xRidge + 8} y={yRidge + 4} style={TS}>
        {ridge}
      </text>
      <line
        x1={xPlate}
        y1={yPlate}
        x2={xRidge + 12}
        y2={yPlate}
        stroke={INK}
        strokeWidth={LW.hatch}
        strokeDasharray="4 2"
      />
      <path
        d={`M ${xPlate + 34} ${yPlate} A 34 34 0 0 0 ${xPlate + 34 * Math.cos((thetaDeg * Math.PI) / 180)} ${yPlate - 34 * Math.sin((thetaDeg * Math.PI) / 180)}`}
        fill="none"
        stroke={INK}
        strokeWidth={LW.thin}
      />
      <text x={xPlate + 38} y={yPlate - 3} style={TS}>
        {fmt(thetaDeg, 1)}°
      </text>
      {/* pitch triangle */}
      <g transform={`translate(${(xPlate + xRidge) / 2 - 20} ${(yPlate + yRidge) / 2 - 24})`}>
        <line x1={0} y1={0} x2={20} y2={0} stroke={INK} strokeWidth={LW.thin} />
        <line x1={20} y1={0} x2={20} y2={-(20 * rise) / 12} stroke={INK} strokeWidth={LW.thin} />
        <text x={10} y={8} textAnchor="middle" style={TS}>
          12
        </text>
        <text x={23} y={(-10 * rise) / 12 + 3} style={TS}>
          {fmt(rise, rise % 1 ? 2 : 0)}
        </text>
      </g>
      <Dim a={xPlate} b={xRidge} at={bottom + 16} from={yPlate} label={fmtFtIn(run)} />
      {overhang > 0 ? <Dim a={xEave} b={xPlate} at={bottom + 16} from={yEave} label={fmtFtIn(overhang)} /> : null}
      <Dim a={yRidge} b={yPlate} at={xRidge + 46} from={xRidge + 4} label={fmtFtIn(riseFt)} vertical />
    </Figure>
  );
}

/** footing plan: pad B × L with its post / pier; strip under its wall or stem */
export function FootingPlan({
  type,
  B,
  L,
  c1,
  c2,
  stemWidth,
}: {
  type: "strip" | "pad";
  B: number;
  L?: number;
  c1: number;
  c2?: number;
  stemWidth?: number;
}) {
  const pad = type === "pad";
  const Lx = pad ? B * 12 : Math.max(48, B * 30);
  const Ly = pad ? (L ?? B) * 12 : B * 12;
  const sc = Math.min(220 / Lx, 110 / Ly);
  const x0 = FIG_CX - (Lx * sc) / 2;
  const y0 = 16;
  const wx = pad ? c1 : Lx;
  const wy = pad ? (c2 ?? c1) : (stemWidth ?? c1);
  const cx = x0 + (Lx * sc) / 2;
  const cy = y0 + (Ly * sc) / 2;
  const bot = y0 + Ly * sc;
  return (
    <Figure title="Geometry" height={bot + 34}>
      <rect x={x0} y={y0} width={Lx * sc} height={Ly * sc} fill="url(#h-conc)" stroke={INK} strokeWidth={LW.object} />
      {!pad ? (
        <>
          {/* break lines at the cut ends */}
          {[x0, x0 + Lx * sc].map((x, i) => (
            <polyline
              key={i}
              points={`${x},${y0 - 4} ${x},${cy - 6} ${x - 4},${cy - 2} ${x + 4},${cy + 2} ${x},${cy + 6} ${x},${bot + 4}`}
              fill="none"
              stroke={INK}
              strokeWidth={LW.thin}
            />
          ))}
        </>
      ) : null}
      {stemWidth ? (
        <rect
          x={cx - (wx * sc) / 2}
          y={cy - (wy * sc) / 2}
          width={wx * sc}
          height={wy * sc}
          fill="url(#h-conc)"
          stroke={INK}
          strokeWidth={LW.object}
        />
      ) : pad ? (
        <TimberSection x={cx - (wx * sc) / 2} y={cy - (wy * sc) / 2} w={wx * sc} h={wy * sc} />
      ) : (
        <rect
          x={cx - (wx * sc) / 2}
          y={cy - (wy * sc) / 2}
          width={wx * sc}
          height={wy * sc}
          fill="#fff"
          stroke={INK}
          strokeWidth={LW.object}
        />
      )}
      <CL x1={x0 - 10} y1={cy} x2={x0 + Lx * sc + 10} y2={cy} />
      {pad ? <CL x1={cx} y1={y0 - 10} x2={cx} y2={bot + 6} /> : null}
      {pad ? <Dim a={x0} b={x0 + Lx * sc} at={bot + 12} from={bot} label={fmtFtIn(B)} /> : null}
      <Dim a={y0} b={bot} at={x0 - 16} from={x0} label={pad ? fmtFtIn(L ?? B) : inch(B * 12)} vertical side={-1} />
      {pad ? (
        <Dim
          a={cx - (wx * sc) / 2}
          b={cx + (wx * sc) / 2}
          at={y0 - 6}
          from={cy - (wy * sc) / 2}
          label={inch(c1)}
          side={-1}
        />
      ) : (
        <Dim
          a={cy - (wy * sc) / 2}
          b={cy + (wy * sc) / 2}
          at={x0 + Lx * sc + 16}
          from={x0 + Lx * sc}
          label={inch(wy)}
          vertical
        />
      )}
      <ViewTitle x={cx} y={bot + 30}>
        Plan
      </ViewTitle>
    </Figure>
  );
}

/** base plate plan: plate N × B, column, anchor rods */
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
  const cx = FIG_CX;
  const y0 = 18;
  const cy = y0 + (N * sc) / 2;
  const x0 = cx - (B * sc) / 2;
  const bot = y0 + N * sc;
  const rods: Array<[number, number]> = [];
  for (let i = 0; i < rod.nx; i++)
    for (let j = 0; j < rod.ny; j++) rods.push([(i - (rod.nx - 1) / 2) * rod.sx, (j - (rod.ny - 1) / 2) * rod.sy]);
  return (
    <Figure title="Geometry" height={bot + 36}>
      <rect x={x0} y={y0} width={B * sc} height={N * sc} fill="#fff" stroke={INK} strokeWidth={LW.object} />
      {steelShapes(col, cx, cy, sc)}
      {rods.map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={cx + x * sc}
            cy={cy + y * sc}
            r={Math.max(2.5, ((rod.d + 0.3125) / 2) * sc)}
            fill="#fff"
            stroke={INK}
            strokeWidth={LW.object}
          />
          <circle cx={cx + x * sc} cy={cy + y * sc} r={Math.max(1.4, (rod.d / 2) * sc)} fill={INK} />
        </g>
      ))}
      <CL x1={x0 - 10} y1={cy} x2={x0 + B * sc + 10} y2={cy} />
      <CL x1={cx} y1={y0 - 10} x2={cx} y2={bot + 6} />
      <Dim a={x0} b={x0 + B * sc} at={bot + 12} from={bot} label={inch(B)} />
      <Dim a={y0} b={bot} at={x0 - 16} from={x0} label={inch(N)} vertical side={-1} />
      {rod.nx > 1 ? (
        <Dim
          a={cx - ((rod.nx - 1) / 2) * rod.sx * sc}
          b={cx + ((rod.nx - 1) / 2) * rod.sx * sc}
          at={y0 - 6}
          from={cy - ((rod.ny - 1) / 2) * rod.sy * sc}
          label={inch(rod.sx)}
          side={-1}
        />
      ) : null}
      {rod.ny > 1 ? (
        <Dim
          a={cy - ((rod.ny - 1) / 2) * rod.sy * sc}
          b={cy + ((rod.ny - 1) / 2) * rod.sy * sc}
          at={x0 + B * sc + 16}
          from={cx + ((rod.nx - 1) / 2) * rod.sx * sc}
          label={inch(rod.sy)}
          vertical
        />
      ) : null}
      <text x={cx} y={bot + 32} textAnchor="middle" style={TS}>
        PL {inch(tp)} × {inch(B)} × {inch(N)}; ({rod.nx * rod.ny}) {inch(rod.d)} dia. anchor rods
      </text>
    </Figure>
  );
}

/** masonry / concrete wall section with its supports */
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
  const H = 150;
  const sc = H / total;
  const x = FIG_CX;
  const yTop = 18;
  const Y = (ft: number) => yTop + (total - ft) * sc;
  const w = Math.max(10, (t / 12) * sc);
  const fixedBase = support !== "pinned-pinned";
  const topSupport = support !== "cantilever";
  return (
    <Figure title="Geometry" height={Y(0) + 34}>
      <rect
        x={x - w / 2}
        y={Y(total)}
        width={w}
        height={total * sc}
        fill={material === "cmu" ? "url(#h-cmu)" : "url(#h-conc)"}
        stroke={INK}
        strokeWidth={LW.object}
      />
      {fixedBase ? <FixedSupport x={x} y={Y(0)} len={w + 30} /> : <PinSupport x={x} y={Y(0)} />}
      {topSupport ? (
        support === "fixed-fixed" ? (
          <FixedSupport x={x + w / 2} y={Y(h)} len={20} vertical />
        ) : (
          <g>
            <line x1={x + w / 2} y1={Y(h)} x2={x + w / 2 + 16} y2={Y(h)} stroke={INK} strokeWidth={LW.object} />
            <circle cx={x + w / 2 + 18} cy={Y(h)} r={2} fill="#fff" stroke={INK} strokeWidth={LW.object} />
            <FixedSupport x={x + w / 2 + 20} y={Y(h)} len={16} vertical />
          </g>
        )
      ) : null}
      <Dim a={Y(h)} b={Y(0)} at={x - w / 2 - 18} from={x - w / 2} label={fmtFtIn(h)} vertical side={-1} />
      {parapet ? (
        <Dim a={Y(total)} b={Y(h)} at={x - w / 2 - 18} from={x - w / 2} label={fmtFtIn(parapet)} vertical side={-1} />
      ) : null}
      <Dim a={x - w / 2} b={x + w / 2} at={Y(total) - 6} from={Y(total)} label={inch(t)} side={-1} />
      <ViewTitle x={x} y={Y(0) + 28}>
        Section
      </ViewTitle>
    </Figure>
  );
}
