/** Package sheets: lateral analysis (seismic ELF, wind MWFRS, wall lines) and the load-path summary. */

import { fmt } from "@/engine/core/fmt";
import type { ProjectDesign } from "@/engine/project";
import { B, DataTable, Flag, SectionHead, Sheet, SheetTitle, TextRow, TR, eq } from "../report/primitives";
import { DesignBasis, f0, f1, f2, f3, footers, titleFields, type SheetMeta } from "./common";

export function LateralSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const p = m.project;
  const L = design.lateral;
  const cr = p.criteria;
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-lateral">
      <SheetTitle
        title="Lateral analysis — seismic and wind"
        subtitle={
          <>
            {m.cycle.asce7} §12.8 Equivalent Lateral Force procedure; Ch. 28 Part 1 envelope procedure (low-rise MWFRS)
          </>
        }
      />
      <DesignBasis m={m} tables={["asce7-12.2-1", "asce7-26.10-1", "asce7-28.3-1", "asce7-C3.1"]} />
      {!L ? (
        <TextRow>
          <Flag>{design.lateralError ?? "Lateral analysis not available"}</Flag>
        </TextRow>
      ) : (
        <>
          <SectionHead title="Seismic design parameters" />
          <TR
            desc="Seismic force-resisting system"
            expr={
              <>
                {L.system.label} ({L.system.ref})
              </>
            }
          />
          <TR
            desc="Coefficients"
            expr={
              <>
                R = {f1(L.system.R)}; Ω<sub>0</sub> = {f1(L.system.Omega0)}; C<sub>d</sub> = {f1(L.system.Cd)}
              </>
            }
          />
          <TR
            desc="Site"
            expr={
              <>
                S<sub>DS</sub> = {f3(cr.seismic.SDS)}; S<sub>D1</sub> = {f3(cr.seismic.SD1)}; Site Class{" "}
                {cr.seismic.siteClass}; SDC {cr.seismic.SDC}
              </>
            }
          />
          <TR
            desc="Importance factor (Table 1.5-2), Risk Category"
            expr={
              <>
                I<sub>e</sub> = {f2(L.Ie)}; RC {cr.riskCategory}
              </>
            }
          />
          <TR desc="Redundancy factor (§12.3.4)" expr={<>ρ{eq(f2(L.rho))}</>} />
          <SectionHead title="Base shear — §12.8.1" />
          <TR
            desc="Structural height"
            expr={
              <>
                h<sub>n</sub>
                {eq(`${f2(L.hn)} ft`)}
              </>
            }
          />
          <TR
            desc="Approximate period — Eq. 12.8-7 (C_t = 0.02, x = 0.75)"
            expr={
              <>
                T<sub>a</sub> = 0.02 h<sub>n</sub>
                <sup>0.75</sup>
                {eq(`${f3(L.cs.Ta)} s`)}
              </>
            }
          />
          <TR
            desc="Eq. 12.8-2"
            expr={
              <>
                C<sub>s</sub> = S<sub>DS</sub> / (R / I<sub>e</sub>){eq(fmt(L.cs.CsEq2, 4))}
              </>
            }
          />
          <TR
            desc="Upper limit — Eq. 12.8-3"
            expr={
              <>
                C<sub>s,max</sub> = S<sub>D1</sub> / (T (R / I<sub>e</sub>)){eq(fmt(L.cs.CsMax ?? Infinity, 4))}
              </>
            }
          />
          <TR
            desc="Lower limit — Eq. 12.8-5"
            expr={
              <>
                C<sub>s,min</sub> = 0.044 S<sub>DS</sub> I<sub>e</sub> ≥ 0.01{eq(fmt(L.cs.CsMin, 4))}
              </>
            }
          />
          <TR
            desc={`Seismic response coefficient (Eq. ${L.cs.governs} governs)`}
            expr={
              <>
                C<sub>s</sub>
                {eq(fmt(L.cs.Cs, 4))}
              </>
            }
          />
          <TR
            desc="Effective seismic weight / base shear (strength)"
            expr={
              <>
                W = {f0(L.dist.W)} lb; V = C<sub>s</sub> W{eq(`${f0(L.dist.V)} lb`)}
              </>
            }
          />
          <SectionHead title="Effective seismic weight — §12.7.2" />
          {L.weights.map((w) => (
            <DataTable
              key={w.storyId}
              caption={`${p.lateral!.stories.find((s) => s.id === w.storyId)?.name ?? w.storyId} — diaphragm weight`}
              head={["Item", "Calculation", "W (lb)"]}
              align={["left", "left", "right"]}
              small
              rows={[
                ...w.items.map((it) => [it.label, it.text, f0(it.W)]),
                [<b key="t">Total</b>, "", <b key="v">{f0(w.W)}</b>],
              ]}
            />
          ))}
          <SectionHead title="Vertical distribution — §12.8.3" />
          <DataTable
            caption={`k = ${f2(L.dist.k)}`}
            head={["Level", "h_x (ft)", "w_x (lb)", "w_x h_x^k", "C_vx", "F_x (lb)", "V_x (lb)"]}
            align={["left", "right", "right", "right", "right", "right", "right"]}
            small
            rows={L.stories.map((s) => {
              const r = L.dist.rows.find((x) => x.id === s.storyId)!;
              return [s.name, f2(s.hx), f0(r.w), f0(r.whk), f3(r.Cvx), f0(r.Fx), f0(r.Vx)];
            })}
          />
          <SectionHead title="Wind — MWFRS, Ch. 28 Part 1" />
          <TR
            desc="Basic wind speed / exposure"
            expr={
              <>
                V = {f0(cr.wind.V)} mph; Exposure {cr.wind.exposure}; K<sub>zt</sub> = {f2(cr.wind.Kzt)}; K<sub>e</sub>{" "}
                = {f2(L.vp.Ke)}
              </>
            }
          />
          <TR
            desc="Mean roof height / roof angle"
            expr={
              <>
                h = {f2(L.h)} ft; θ = {f1(L.thetaDeg)}°
              </>
            }
          />
          <TR
            desc="Velocity pressure exposure coefficient (Table 26.10-1)"
            expr={
              <>
                K<sub>h</sub>
                {eq(f3(L.vp.Kz))}
              </>
            }
          />
          <TR
            desc="Velocity pressure — Eq. 26.10-1"
            expr={
              <>
                {L.vp.expr}
                {eq(`${f2(L.vp.q)} psf`)}
              </>
            }
          />
          <TR
            desc="Pressure multiplier used"
            expr={
              <>
                q<sub>h</sub>
                {m.cycle.asce7 === "ASCE 7-22" ? " K_d" : ""}
                {eq(`${f2(L.vp.qEff)} psf`)}
              </>
            }
          />
          <TR
            desc="End-zone dimension (Fig. 28.3-1 note)"
            expr={
              <>
                a{eq(`${f2(L.a)} ft`)}; end zone width 2a = {f2(2 * L.a)} ft
              </>
            }
          />
          {(["X", "Y"] as const).map((dir) => (
            <DataTable
              key={dir}
              caption={`Wind force in the ${dir} direction (strength level) — Load Case ${L.stories[0].windBands[dir].case} ${L.stories[0].windBands[dir].case === "A" ? "(wind normal to ridge)" : "(wind parallel to ridge)"}`}
              head={[
                "Level",
                "Face width (ft)",
                "Wall band (ft)",
                "Roof proj. (ft)",
                "Net GCpf wall int / end",
                "Net GCpf roof int / end",
                "F env. (lb)",
                "F min §28.3.4 (lb)",
                "F used (lb)",
                "Story shear (lb)",
              ]}
              align={["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"]}
              small
              rows={L.stories.map((s) => {
                const b = s.windBands[dir];
                const env =
                  L.vp.qEff *
                  ((b.case === "A" ? b.wallHeight : b.wallHeight + b.roofHeight) *
                    (b.wallEnd * Math.min(2 * L.a, b.width) + b.wallInt * Math.max(0, b.width - 2 * L.a)) +
                    (b.case === "A"
                      ? b.roofHeight *
                        (b.roofEnd * Math.min(2 * L.a, b.width) + b.roofInt * Math.max(0, b.width - 2 * L.a))
                      : 0));
                return [
                  s.name,
                  f1(b.width),
                  f2(b.wallHeight),
                  f2(b.roofHeight),
                  `${f2(b.wallInt)} / ${f2(b.wallEnd)}`,
                  b.case === "A" ? `${f2(b.roofInt)} / ${f2(b.roofEnd)}` : "—",
                  f0(env),
                  f0(b.Fmin),
                  f0(b.F),
                  f0(s.VW[dir]),
                ];
              })}
            />
          ))}
          <TextRow italic>
            Horizontal force = windward minus leeward surfaces (internal pressure cancels); one end zone of width 2a at
            the reference corner. The larger of the envelope force and the §28.3.4 minimum (16 psf walls, 8 psf roof
            projection) is used.
          </TextRow>
          <SectionHead title="Distribution to wall lines — flexible diaphragm, tributary width" />
          <DataTable
            head={[
              "Line",
              "Story",
              "Dir.",
              "Trib. (ft)",
              "Share",
              "E_h = ρQ_E (lb)",
              "W (lb)",
              "0.7E_h (lb)",
              "0.6W (lb)",
              "Governs (ASD)",
            ]}
            align={["left", "left", "center", "right", "right", "right", "right", "right", "right", "left"]}
            small
            rows={L.lines.map((l) => [
              l.line.name,
              p.lateral!.stories.find((s) => s.id === l.line.storyId)?.name ?? "?",
              l.line.dir,
              f1(l.line.trib),
              f3(l.share),
              f0(l.Eh),
              f0(l.W),
              f0(l.Easd),
              f0(l.Wasd),
              l.governs,
            ])}
          />
          {L.warnings.map((w, i) => (
            <TextRow key={i}>
              <Flag>{w}</Flag>
            </TextRow>
          ))}
          <TextRow italic>
            Accidental torsion, rigid-diaphragm distribution, diaphragm design (F_px), collectors and chords follow in
            Phase 3. The line force is shared between the shear walls of the line in proportion to their allowable
            capacity.
          </TextRow>
          <TR
            desc="Result"
            expr={
              <B>{`Seismic V = ${f0(L.dist.V)} lb; wind story shear X = ${f0(L.stories[0].VW.X)} lb, Y = ${f0(L.stories[0].VW.Y)} lb (strength)`}</B>
            }
          />
        </>
      )}
    </Sheet>
  );
}

export function LoadPathSheet({ m, design }: { m: SheetMeta; design: ProjectDesign }) {
  const ft = footers(m);
  const p = m.project;
  const rows: React.ReactNode[][] = [];
  for (const id of design.order) {
    const o = design.outcomes.get(id);
    if (!o?.result || !o.result.reactions.length) continue;
    o.result.reactions.forEach((r, i) => {
      const to = p.members.filter((x) => x.links.some((l) => l.sourceId === id && l.support === i));
      const cn = p.members.filter((x) => x.kind === "connector" && x.sourceId === id && x.support === i);
      const line =
        !!r.perFoot && to.some((x) => x.links.some((l) => l.sourceId === id && l.support === i && l.kind === "line"));
      rows.push([
        o.result!.mark,
        r.name,
        line && r.perFoot
          ? `${f0(Math.max(r.perFoot.D + r.perFoot.L + Math.max(r.perFoot.Lr, r.perFoot.S), 0))} plf`
          : `${f0(r.maxDown)} lb`,
        r.minNet < -1 ? <Flag key="u">{f0(r.minNet)}</Flag> : "—",
        to.length ? to.map((x) => x.mark).join(", ") : <Flag key="n">not carried</Flag>,
        cn.length ? cn.map((x) => x.mark).join(", ") : "—",
      ]);
    });
  }
  const footings = [...design.outcomes.values()].filter((o) => o.result?.kind === "footing");
  return (
    <Sheet f={titleFields(m)} footerLeft={ft.left} footerCenter={ft.center} first={m.first} id="sheet-loadpath">
      <SheetTitle
        title="Load-path summary"
        subtitle={<>Reactions by member, in load-path order (roof → foundation)</>}
      />
      <DataTable
        head={["From", "Support", "Load delivered (D+L+roof, unfactored)", "Min net (lb)", "Carried by", "Connector"]}
        align={["left", "left", "right", "right", "left", "left"]}
        small
        rows={rows}
      />
      <SectionHead title="Foundation" />
      {footings.length ? (
        footings.map((o) => (
          <TR
            key={o.spec.id}
            desc={`${o.result!.mark} — ${o.result!.callout}`}
            expr={
              <>
                Loads from{" "}
                {o.spec.links.map((l) => p.members.find((x) => x.id === l.sourceId)?.mark ?? "?").join(", ") ||
                  "entered loads"}{" "}
                to soil
              </>
            }
          />
        ))
      ) : (
        <TextRow italic>No footings modelled.</TextRow>
      )}
    </Sheet>
  );
}
