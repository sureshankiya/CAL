"""
HouseCalc independent reference calculations (Phase 5 verification).

Written from the stated equations (IBC 1807.2.3, ACI 318-19, NDS 2018,
AISC 360 / AISI S100 interaction, statics) without reference to the
TypeScript engine or its tests. Results are written to
verification/reference_p5.json as a dict: case name -> values (floats at full
precision).

Units: lb, in, ft, psi, psf, pcf (as noted per case).

Run:  python3 -I verification/reference_p5.py
"""
import json
import math
import os

cases = {}
PI = math.pi


# ------------------------------------------------------------ helpers
def simpson(f, a, b, breaks=(), n=2000):
    """Composite Simpson integral of f on [a, b], split at any kinks in `breaks`
    (exact for piecewise polynomials of degree <= 3 between the splits)."""
    pts = [a] + sorted(x for x in breaks if a < x < b) + [b]
    total = 0.0
    for lo, hi in zip(pts[:-1], pts[1:]):
        m = n if n % 2 == 0 else n + 1
        h = (hi - lo) / m
        s = f(lo) + f(hi)
        for i in range(1, m):
            s += (4 if i % 2 else 2) * f(lo + i * h)
        total += s * h / 3
    return total


def bearing(P, sum_Wx, Mo, B):
    """Rigid-footing linear soil pressure.
    x_bar = (sum W x - Mo)/sum W, e = B/2 - x_bar (positive -> toward toe),
    qmax = P/B (1 + 6|e|/B) inside the kern, else 2P/(3 (B/2 - |e|)).
    Returns (x_bar, e, qmax, qmin, q(x) function, kink location or None)."""
    xbar = (sum_Wx - Mo) / P                        # resultant from the toe
    e = B / 2 - xbar                                # eccentricity (toe side +)
    if abs(e) <= B / 6:
        qmax = P / B * (1 + 6 * abs(e) / B)
        qmin = P / B * (1 - 6 * abs(e) / B)

        def q(x):                                   # trapezoid, qtoe = P/B(1+6e/B)
            return P / B * (1 + 12 * e * (B / 2 - x) / B ** 2)
        kink = None
    else:
        qmax = 2 * P / (3 * (B / 2 - abs(e)))
        qmin = 0.0
        if e > 0:                                   # triangle from the toe
            Lb = 3 * xbar

            def q(x):
                return max(0.0, qmax * (1 - x / Lb))
            kink = Lb
        else:                                       # triangle from the heel
            Lb = 3 * (B - xbar)

            def q(x):
                return max(0.0, qmax * (1 - (B - x) / Lb))
            kink = B - Lb
    return xbar, e, qmax, qmin, q, kink


# ============================================== 1. Cantilever retaining wall
def rw1():
    # ---- geometry (ft) and materials
    Hr = 4.0                                        # retained height above footing
    t = 8.0 / 12.0                                  # stem thickness
    Hstem = 4.0                                     # stem height
    w_stem_psf = 150.0 * 8.0 / 12.0                 # 100 psf of face
    toe, heel = 1.0, 2.0
    hf = 14.0 / 12.0                                # footing thickness
    B = toe + t + heel                              # footing width
    gc, gs = 150.0, 120.0                           # concrete, soil unit weights
    efp = 35.0                                      # active equivalent fluid, pcf
    Ka = efp / gs                                   # active coefficient
    q = 100.0                                       # surcharge, psf (live)
    k = 20.0                                        # seismic increment, pcf (inv. triangle)
    toe_cover = 1.0                                 # soil over toe, ft
    mu = 0.25                                       # friction coefficient
    q_allow = 1500.0

    # ---- lateral loads on the plane through the heel end, height Ht
    Ht = Hr + hf
    PH = 0.5 * efp * Ht ** 2                        # active triangle
    yPH = Ht / 3
    Pq = Ka * q * Ht                                # uniform surcharge pressure
    yPq = Ht / 2
    PE = 0.5 * k * Ht ** 2                          # inverted triangle, resultant at 2H/3
    yPE = 2 * Ht / 3

    # ---- passive on the toe face (150 psf/ft, top 1 ft ignored)
    dp = toe_cover + hf
    Pp = 0.5 * 150.0 * (dp ** 2 - 1.0 ** 2)

    # ---- vertical loads and arms from the toe
    W_stem = w_stem_psf * Hstem;        x_stem = toe + t / 2
    W_ftg = gc * hf * B;                x_ftg = B / 2
    W_heel = gs * Hr * heel;            x_heel = toe + t + heel / 2
    W_toe = gs * toe_cover * toe;       x_toe = toe / 2
    W_sur = q * heel;                   x_sur = toe + t + heel / 2

    # ---- stability (IBC 1807.2.3): resisting = stem + footing + heel soil only
    Wr = W_stem + W_ftg + W_heel
    Mr = W_stem * x_stem + W_ftg * x_ftg + W_heel * x_heel
    stab = {}
    defs = {
        "static": (False, 0.0),
        "static_surcharge": (True, 0.0),
        "seismic": (False, 0.7),
        "seismic_surcharge": (True, 0.7),
    }
    for name, (sur, fe) in defs.items():
        H = PH + (Pq if sur else 0.0) + fe * PE                       # sum lateral
        Mo = PH * yPH + (Pq * yPq if sur else 0.0) + fe * PE * yPE    # OT moment about toe
        stab[name] = {
            "H": H, "Mo": Mo, "Wr": Wr, "Mr": Mr, "Pp": Pp,
            "FS_sliding": (mu * Wr + Pp) / H,                          # (mu Wr + Pp)/H
            "FS_OT": Mr / Mo,                                          # Mr/Mo
        }

    # ---- soil bearing, ASD D + L + H
    Wd = [(W_stem, x_stem), (W_ftg, x_ftg), (W_heel, x_heel), (W_toe, x_toe)]
    P1 = sum(w for w, _ in Wd) + W_sur
    Wx1 = sum(w * x for w, x in Wd) + W_sur * x_sur
    Mo1 = PH * yPH + Pq * yPq
    xb1, e1, qmax1, qmin1, _, _ = bearing(P1, Wx1, Mo1, B)

    # ---- soil bearing, (1 + 0.14 SDS) D + 0.7E + H, SDS = 1.0
    fD = 1.0 + 0.14 * 1.0
    P2 = fD * sum(w for w, _ in Wd)
    Wx2 = fD * sum(w * x for w, x in Wd)
    Mo2 = PH * yPH + 0.7 * PE * yPE
    xb2, e2, qmax2, qmin2, _, _ = bearing(P2, Wx2, Mo2, B)

    # ---- footing strength, 1.2D + 1.6L + 1.6H
    Pu = 1.2 * sum(w for w, _ in Wd) + 1.6 * W_sur
    Wxu = 1.2 * sum(w * x for w, x in Wd) + 1.6 * W_sur * x_sur
    Mou = 1.6 * PH * yPH + 1.6 * Pq * yPq
    xbu, eu, qmaxu, qminu, qu, kink = bearing(Pu, Wxu, Mou, B)
    brk = () if kink is None else (kink,)
    # Toe: net upward = q(x) - 1.2(150 hf + 120*1); moment at the stem front face
    w_toe_dn = 1.2 * (gc * hf + gs * toe_cover)
    Mu_toe = simpson(lambda x: (qu(x) - w_toe_dn) * (toe - x), 0.0, toe, brk)
    Vu_toe = simpson(lambda x: qu(x) - w_toe_dn, 0.0, toe, brk)
    # Heel: net downward = 1.2(150 hf + 120 Hr) + 1.6 q - q(x); about stem back face
    xf = toe + t
    w_heel_dn = 1.2 * (gc * hf + gs * Hr) + 1.6 * q
    Mu_heel = simpson(lambda x: (w_heel_dn - qu(x)) * (x - xf), xf, B, brk)
    Vu_heel = simpson(lambda x: w_heel_dn - qu(x), xf, B, brk)

    # ---- footing flexure capacity, #5 @ 12 in
    As, fy, fc, b = 0.31, 60000.0, 2500.0, 12.0
    d = hf * 12.0 - 3.0 - 0.625 / 2                 # effective depth, in
    a = As * fy / (0.85 * fc * b)                   # Whitney block depth
    beta1 = 0.85
    c = a / beta1                                   # neutral axis depth
    eps_t = 0.003 * (d - c) / c                     # net tensile strain
    phi = 0.9 if eps_t >= 0.005 else float("nan")
    phiMn = phi * As * fy * (d - a / 2)             # lb-in per ft

    # ---- standard hook development, #4 dowel (ACI 318-19 Eq. 25.4.3.1a)
    db = 0.5
    psi_e, psi_r, psi_o = 1.0, 1.6, 1.0
    psi_c = fc / 15000.0 + 0.6
    ldh = fy * psi_e * psi_r * psi_o * psi_c / (55.0 * math.sqrt(fc)) * db ** 1.5
    ldh_final = max(ldh, 8 * db, 6.0)

    # ---- stem base moment (strength): 1.6(active + surcharge) + 1.0 seismic
    M_act = efp * Hr ** 3 / 6                       # triangle: (1/2 efp Hr^2)(Hr/3)
    M_sur = Ka * q * Hr ** 2 / 2                    # uniform: (Ka q Hr)(Hr/2)
    M_eq = k * Hr ** 3 / 3                          # inverted triangle: (1/2 k Hr^2)(2Hr/3)
    Mu_stem = 1.6 * (M_act + M_sur) + 1.0 * M_eq

    return {
        "B": B, "Ht": Ht, "Ka": Ka, "dp": dp,
        "PH": PH, "Pq": Pq, "PE": PE, "Pp": Pp,
        "W_stem": W_stem, "W_footing": W_ftg, "W_soil_heel": W_heel,
        "W_soil_toe": W_toe, "W_surcharge": W_sur,
        "stability": stab,
        "bearing_D_L_H": {"P": P1, "Mo": Mo1, "xbar": xb1, "e": e1,
                          "qmax": qmax1, "qmin": qmin1,
                          "ratio": qmax1 / q_allow},
        "bearing_seismic": {"P": P2, "Mo": Mo2, "xbar": xb2, "e": e2,
                            "qmax": qmax2, "qmin": qmin2,
                            "ratio": qmax2 / q_allow},
        "strength": {"Pu": Pu, "Mo_u": Mou, "xbar": xbu, "e": eu,
                     "qmax": qmaxu, "qmin": qminu,
                     "q_at_toe_face": qu(toe), "q_at_heel_face": qu(xf),
                     "Mu_toe": Mu_toe, "Vu_toe": Vu_toe,
                     "Mu_heel": Mu_heel, "Vu_heel": Vu_heel},
        "flexure": {"d": d, "a": a, "c": c, "eps_t": eps_t, "phi": phi,
                    "phiMn_lbin": phiMn, "phiMn_lbft": phiMn / 12.0},
        "hook": {"psi_c": psi_c, "ldh": ldh, "ldh_final": ldh_final},
        "stem": {"M_active": M_act, "M_surcharge": M_sur, "M_seismic": M_eq,
                 "Mu_stem": Mu_stem},
    }


# ============================================== 2. Deck guard post (4x6 DF-L No.1)
def gp1():
    b, d = 3.5, 5.5                                 # dressed, d in load direction
    P = 200.0
    H1 = 36.0 + 2.0                                 # load to top bolt, in
    s = 8.0                                         # bolt spacing
    M = P * H1                                      # moment at top bolt
    T = P * (H1 + s) / s                            # top-bolt tension (rotation about lower bolt)
    V = max(P, P * H1 / s)                          # max shear in the post
    S = b * d ** 2 / 6                              # section modulus
    fb = M / S
    fv = 1.5 * V / (b * d)

    Fb, Fv, Fcp = 1000.0, 180.0, 625.0
    CF = 1.3                                        # size factor (4x6)
    CM_b = 1.0 if Fb * CF <= 1150.0 else 0.85       # wet service, Fb
    CM_v, CM_cp = 0.97, 0.67
    Ci = 0.80                                       # incising (Fb, Fv)
    CD = 1.0
    Fb_p = Fb * CD * CM_b * CF * Ci
    Fv_p = Fv * CD * CM_v * Ci

    Aw = 2.0 ** 2 - PI / 4 * 0.5625 ** 2            # plate washer net area
    Cb = (2.0 + 0.375) / 2.0                        # bearing area factor
    Fcp_p = Fcp * CM_cp * Cb
    fcp = T / Aw

    Rn_omega = 0.75 * 60000.0 * (PI / 4 * 0.5 ** 2) / 2.00   # A307 1/2 in tension
    return {"H1": H1, "M": M, "T": T, "V": V, "S": S, "fb": fb, "fv": fv,
            "CM_b": CM_b, "CM_v": CM_v, "CM_cperp": CM_cp, "CF": CF, "Ci": Ci,
            "Fb_prime": Fb_p, "Fv_prime": Fv_p, "fb_ratio": fb / Fb_p,
            "fv_ratio": fv / Fv_p,
            "Aw": Aw, "Cb": Cb, "Fcperp_prime": Fcp_p, "fcperp": fcp,
            "fcperp_ratio": fcp / Fcp_p,
            "bolt_Rn_over_Omega": Rn_omega, "bolt_ratio": T / Rn_omega}


# ============================================== 3. CFS stud 350S162-54
def cs1():
    # SSMA section: design thickness by mil (SSMA product catalogue), centre-line model with
    # rounded corners, inside bend radius 1.5t (centre-line radius r = 2t); quarter arcs
    # integrated in closed form: integral of y^2 ds = r (yc^2 pi/2 + 2 yc r + r^2 pi/4)
    D, Bf, lip = 3.50, 1.625, 0.5
    t = 0.0566                                      # 54 mil design thickness (SSMA)
    h = D - t                                       # centre-line web
    b = Bf - t                                      # centre-line flange
    c = lip - t / 2                                 # centre-line lip
    r = 1.5 * t + t / 2
    yc = h / 2 - r
    web = 2 * yc ** 3 / 3
    flanges = 2 * (b - 2 * r) * (h / 2) ** 2
    lips = 2 * (yc ** 3 - (h / 2 - c) ** 3) / 3
    arcs = 4 * r * (yc ** 2 * PI / 2 + 2 * yc * r + r ** 2 * PI / 4)
    Ix = t * (web + flanges + lips + arcs)
    A = t * ((h - 2 * r) + 2 * (b - 2 * r) + 2 * (c - r) + 4 * r * PI / 2)

    L = 10.0                                        # ft
    E = 29.5e6
    K = 1.0
    w = 5.0 * 16.0 / 12.0                           # plf on one stud
    P = 1760.0
    M = 0.6 * w * L ** 2 / 8 * 12.0                 # lb-in, D + 0.6W
    Pe = PI ** 2 * E * Ix / (K * L * 12.0) ** 2     # Euler load
    B1 = 1.0 / (1.0 - 1.6 * P / Pe)                 # moment amplifier (Omega_c = 1.6)
    Pa, Ma = 2440.0, 3000.0
    inter = P / Pa + B1 * M / Ma
    delta = 5 * (0.42 * w / 12.0) * (L * 12.0) ** 4 / (384 * E * Ix)
    limit = L * 12.0 / 720.0
    return {"t": t, "h": h, "b": b, "c": c, "Ix": Ix, "A": A, "w_plf": w,
            "P": P, "M": M, "Pe": Pe, "B1": B1, "interaction": inter,
            "P_over_Pa": P / Pa, "delta": delta, "delta_limit": limit,
            "delta_ratio": delta / limit}


cases["rw1"] = rw1()
cases["gp1"] = gp1()
cases["cs1"] = cs1()

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference_p5.json")
with open(path, "w") as fh:
    json.dump(cases, fh, indent=2)
print(f"wrote {len(cases)} cases to {path}")
r = cases["rw1"]
for nm, v in r["stability"].items():
    print(f"rw1 {nm:18s} FS_slide={v['FS_sliding']:.3f}  FS_OT={v['FS_OT']:.3f}")
print(f"rw1 qmax D+L+H={r['bearing_D_L_H']['qmax']:.1f} psf  seismic={r['bearing_seismic']['qmax']:.1f} psf")
print(f"rw1 Mu_toe={r['strength']['Mu_toe']:.1f}  Mu_heel={r['strength']['Mu_heel']:.1f}  "
      f"Vu_heel={r['strength']['Vu_heel']:.1f}  phiMn={r['flexure']['phiMn_lbft']:.1f} lb-ft")
print(f"rw1 ldh={r['hook']['ldh_final']:.3f} in  Mu_stem={r['stem']['Mu_stem']:.1f} lb-ft")
g = cases["gp1"]
print(f"gp1 fb/F'b={g['fb_ratio']:.3f} fv/F'v={g['fv_ratio']:.3f} "
      f"fc/F'c={g['fcperp_ratio']:.3f} bolt={g['bolt_ratio']:.3f}")
s = cases["cs1"]
print(f"cs1 Ix={s['Ix']:.4f} interaction={s['interaction']:.3f} delta={s['delta']:.4f}/{s['delta_limit']:.4f}")
