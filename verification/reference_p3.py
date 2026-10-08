"""
HouseCalc independent reference calculations (Phase 3 verification).

Written from first principles and the code text (AISC 360-16, AISC Design
Guide 1 2nd ed., ACI 318-19 Ch. 17, NDS-2018 Ch. 12, SDPWS-2021, ASCE 7-16)
without reference to the TypeScript engine or its tests. Results are written
to verification/reference_p3.json as a `cases` dict: case name -> values
(floats at full precision, nested where the case calls for it).

Units: kip, in, ksi for steel; lb, in, psi for ACI anchors and NDS;
lb, ft for diaphragm / lateral.

Run:  python3 -I verification/reference_p3.py
"""
import json
import math
import os
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

cases = {}
PI = math.pi


# =================================================================== steel beam
def steel_beam():
    E, Fy = 29000.0, 50.0
    A, d, tw, bf, tf, kdes = 5.26, 8.14, 0.23, 5.25, 0.33, 0.63
    Ix, Sx, Zx, ry, J, Cw, rts, ho = 61.9, 15.2, 17.0, 1.23, 0.172, 122.0, 1.43, 7.81
    L_ft = 16.0
    wD, wL = 0.300, 0.400                      # klf
    wu = 1.2 * wD + 1.6 * wL                   # ASCE 7-16 2.3.1 combo 2 (1.2D + 1.6L)
    Mu = wu * L_ft ** 2 / 8.0                  # kip-ft, simple span max

    # AISC F1-1: Cb = 12.5 Mmax / (2.5 Mmax + 3 MA + 4 MB + 3 MC), quarter points of Lb
    def M(x):
        return wu * x * (L_ft - x) / 2.0
    Lb_ft = L_ft
    MA, MB, MC = M(Lb_ft / 4), M(Lb_ft / 2), M(3 * Lb_ft / 4)
    Mmax = Mu
    Cb = 12.5 * Mmax / (2.5 * Mmax + 3 * MA + 4 * MB + 3 * MC)

    # F2-5 Lp, F2-6 Lr (c = 1 for doubly symmetric I-shapes)
    c = 1.0
    Lp = 1.76 * ry * math.sqrt(E / Fy)
    jc = J * c / (Sx * ho)
    Lr = 1.95 * rts * E / (0.7 * Fy) * math.sqrt(jc + math.sqrt(jc ** 2 + 6.76 * (0.7 * Fy / E) ** 2))

    # F2: Mp = Fy Zx (F2-1); LTB per F2-2 / F2-3 & F2-4
    Mp = Fy * Zx
    Lb = Lb_ft * 12.0
    if Lb <= Lp:
        Mn = Mp
    elif Lb <= Lr:
        Mn = min(Mp, Cb * (Mp - (Mp - 0.7 * Fy * Sx) * (Lb - Lp) / (Lr - Lp)))
    else:
        Fcr = Cb * PI ** 2 * E / (Lb / rts) ** 2 * math.sqrt(1 + 0.078 * jc * (Lb / rts) ** 2)
        Mn = min(Mp, Fcr * Sx)
    # (bf/2tf = 7.95 < 0.38 sqrt(E/Fy) = 9.15 -> compact flange, F3 does not govern)

    # G2.1: Vn = 0.6 Fy Aw Cv1, Aw = d tw; h/tw <= 2.24 sqrt(E/Fy) -> phi_v = 1.0, Cv1 = 1.0
    h_tw = (d - 2 * kdes) / tw
    if h_tw <= 2.24 * math.sqrt(E / Fy):
        phiv, Cv1 = 1.0, 1.0
    else:
        phiv = 0.9
        kv = 5.34
        Cv1 = 1.0 if h_tw <= 1.10 * math.sqrt(kv * E / Fy) else 1.10 * math.sqrt(kv * E / Fy) / h_tw
    Vn = 0.6 * Fy * d * tw * Cv1

    # Service live-load deflection, 5 w L^4 / (384 E I)
    wL_kin = wL / 12.0
    Lin = L_ft * 12.0
    deltaL = 5 * wL_kin * Lin ** 4 / (384 * E * Ix)

    return {
        "Mu_kipft": Mu,
        "Cb": Cb,
        "Lp_ft": Lp / 12.0,
        "Lr_ft": Lr / 12.0,
        "Mn_kipft": Mn / 12.0,
        "phiMn_kipft": 0.9 * Mn / 12.0,
        "phiVn_kip": phiv * Vn,
        "deltaL_in": deltaL,
    }


# ================================================================= HSS geometry
def design_t(t_nom):
    # AISC 360-16 B4.2: design wall thickness = 0.93 t_nom (ERW), rounded to 3 places
    t = Decimal(t_nom.numerator) / Decimal(t_nom.denominator) * Decimal("0.93")
    return float(t.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def rsq_area(b, r):
    """Area of a b x b square with corner radius r."""
    return b * b - (4 - PI) * r * r


def rsq_I(b, r):
    """Moment of inertia about a centroidal axis parallel to a side."""
    core = b * (b - 2 * r) ** 3 / 12.0                          # full-width band, height b-2r
    w = b - 2 * r
    strips = 2 * (w * r ** 3 / 12.0 + w * r * (b / 2 - r / 2) ** 2)  # top / bottom strips
    Aq = PI * r * r / 4.0                                       # quarter circle
    yq = 4 * r / (3 * PI)
    Iq_own = PI * r ** 4 / 16.0 - Aq * yq ** 2                  # about its own centroid
    quarters = 4 * (Iq_own + Aq * (b / 2 - r + yq) ** 2)
    return core + strips + quarters


def rsq_Z(b, r):
    """Plastic modulus = 2 x first moment of the half area about the centroidal axis."""
    w = b - 2 * r
    Q = b * (b / 2 - r) * (b / 2 - r) / 2.0                     # core half
    Q += w * r * (b / 2 - r / 2)                                # strip
    Q += 2 * (PI * r * r / 4.0) * (b / 2 - r + 4 * r / (3 * PI))  # two quarter circles
    return 2 * Q


def hss_props(B, t_nom):
    t = design_t(t_nom)
    ro, ri = 2 * t, t                       # outside corner radius 2t, inside t
    Bi = B - 2 * t
    A = rsq_area(B, ro) - rsq_area(Bi, ri)
    I = rsq_I(B, ro) - rsq_I(Bi, ri)
    Z = rsq_Z(B, ro) - rsq_Z(Bi, ri)
    # AISC Manual torsional constant J = 4 Ap^2 t / p on the mid-thickness line (rm = 1.5t)
    rm = 1.5 * t
    bm = B - t
    p = 4 * (bm - 2 * rm) + 2 * PI * rm
    Ap = bm * bm - (4 - PI) * rm * rm
    J = 4 * Ap ** 2 * t / p
    return {"A": A, "I": I, "Z": Z, "J": J, "_t": t, "_B": B}


HSS = {
    "HSS4x4x1/4": hss_props(4.0, Fraction(1, 4)),
    "HSS6x6x1/4": hss_props(6.0, Fraction(1, 4)),
    "HSS6x6x1/8": hss_props(6.0, Fraction(1, 8)),
}


def E3_Fcr(Fy, E, KL_r):
    # AISC E3-2 / E3-3, Fe per E3-4
    Fe = PI ** 2 * E / KL_r ** 2
    if Fy / Fe <= 2.25:
        return 0.658 ** (Fy / Fe) * Fy
    return 0.877 * Fe


# ================================================================== HSS column
def hss_column():
    E, Fy = 29000.0, 50.0
    s = HSS["HSS4x4x1/4"]
    A, I, Z, t, B = s["A"], s["I"], s["Z"], s["_t"], s["_B"]
    r = math.sqrt(I / A)
    Lc = 120.0
    Pu = 1.2 * 6.0 + 1.6 * 8.0                 # 1.2D + 1.6L
    e = 2.0
    Mnt = Pu * e                               # kip-in, at top, zero at base

    # App. 8 (8.2.1): B1 = Cm / (1 - alpha Pr / Pe1) >= 1, Pe1 = pi^2 EI/(K L)^2, K = 1
    Cm = 0.6
    Pe1 = PI ** 2 * E * I / Lc ** 2
    B1 = max(1.0, Cm / (1 - 1.0 * Pu / Pe1))

    # Table B4.1a case 6: b/t <= 1.40 sqrt(E/Fy) -> nonslender, E3 governs
    b = B - 3 * t
    assert b / t <= 1.40 * math.sqrt(E / Fy)
    Pc = 0.9 * E3_Fcr(Fy, E, Lc / r) * A

    # F7: flange b/t <= 1.12 sqrt(E/Fy), web h/t <= 2.42 sqrt(E/Fy) -> compact, Mn = Mp = Fy Z
    assert b / t <= 1.12 * math.sqrt(E / Fy) and b / t <= 2.42 * math.sqrt(E / Fy)
    Mc = 0.9 * Fy * Z

    # H1-1a (Pr/Pc >= 0.2) else H1-1b
    Mr = B1 * Mnt
    if Pu / Pc >= 0.2:
        H1 = Pu / Pc + 8.0 / 9.0 * Mr / Mc
    else:
        H1 = Pu / (2 * Pc) + Mr / Mc
    return {
        "Pu_kip": Pu,
        "Mux_kipft": Mnt / 12.0,
        "B1": B1,
        "Pc_kip": Pc,
        "Mcx_kipft": Mc / 12.0,
        "H1_ratio": H1,
    }


# ================================================================= HSS slender
def hss_slender():
    E, Fy = 29000.0, 50.0
    s = HSS["HSS6x6x1/8"]
    A, I, t, B = s["A"], s["I"], s["_t"], s["_B"]
    r = math.sqrt(I / A)
    Fcr = E3_Fcr(Fy, E, 120.0 / r)            # E3 on the gross section
    # E7.1 effective width (Table E7.1 case (b): c1 = 0.18, c2 = 1.31)
    c1, c2 = 0.18, 1.31
    lam_r = 1.40 * math.sqrt(E / Fy)
    b = B - 3 * t
    lam = b / t
    Ae = A
    if lam > lam_r * math.sqrt(Fy / Fcr):     # E7-2 / E7-3 apply
        Fel = (c2 * lam_r / lam) ** 2 * Fy    # E7-5
        q = math.sqrt(Fel / Fcr)
        be = b * (1 - c1 * q) * q             # E7-3
        Ae = A - 4 * (b - be) * t             # all four walls
    return {"Fcr_ksi": Fcr, "Ae_in2": Ae, "Pn_kip": Fcr * Ae}


# ============================================================ base plate (DG1)
def base_plate_small():
    d = bf = 6.0
    N = B = 14.0
    Fy, fc = 36.0, 3.0
    Pu, Mu = 60.0, 120.0
    phic, phib = 0.65, 0.90
    sqrtA2A1 = 1.0
    A1 = N * B
    fpmax = phic * 0.85 * fc * sqrtA2A1                     # DG1 3.3.3 (J8-1 basis)
    qmax = fpmax * B
    e = Mu / Pu
    ecrit = N / 2 - Pu / (2 * qmax)                         # DG1 3.3.5
    if e <= ecrit:                                          # small moment: uniform bearing over Y
        Y = N - 2 * e
        q = Pu / Y
    else:
        raise RuntimeError("large-moment case not expected")
    m = (N - 0.95 * d) / 2
    n = (B - 0.95 * bf) / 2
    Pp = 0.85 * fc * A1 * sqrtA2A1
    X = (4 * d * bf / (d + bf) ** 2) * Pu / (phic * Pp)
    lam = min(1.0, 2 * math.sqrt(X) / (1 + math.sqrt(1 - X)))
    lnp = lam * math.sqrt(d * bf) / 4
    l = max(m, n, lnp)
    fp = q / B
    if Y >= l:                                              # DG1 3.3.14a
        tp = math.sqrt(2 * fp * l ** 2 / (phib * Fy))
    else:                                                   # DG1 3.3.15a
        tp = math.sqrt(4 * fp * Y * (l - Y / 2) / (phib * Fy))
    return {
        "fpmax_ksi": fpmax,
        "qmax_kipin": qmax,
        "e_in": e,
        "ecrit_in": ecrit,
        "Y_in": Y,
        "q_kipin": q,
        "l_in": l,
        "tp_req_in": tp,
    }


# ======================================================= anchor group (ACI 318)
def anchor_group():
    da, nt = 0.75, 10.0
    fya, futa_spec = 36000.0, 58000.0
    futa = min(futa_spec, 1.9 * fya, 125000.0)              # 17.6.1.2 / 17.7.1.2
    Ase = PI / 4 * (da - 0.9743 / nt) ** 2                  # R17.6.1.2
    hef, ha, fc, lam_a, kc = 8.0, 18.0, 3000.0, 1.0, 24.0
    Abrg = 0.654
    s = 6.0
    # edges measured from the group centre (x, y); anchors at (+-3, +-3)
    ex_neg, ex_pos, ey_neg, ey_pos = -10.0, 8.0, -30.0, 30.0
    rows_x = (-s / 2, s / 2)
    ys = (-s / 2, s / 2)

    # 17.6.1.2 steel strength in tension, per anchor
    Nsa = Ase * futa

    # 17.6.2.2.1 basic breakout, Nb = kc lam sqrt(f'c) hef^1.5 (hef < 11 in.)
    # 17.6.2.1.2 hef reduction only with 3+ edges within 1.5hef: tension row x=+3 has
    # only the x+ edge (5 in.) within 12 in.; full group has x+ (5) and x- (7) -> 2 edges.
    Nb = kc * lam_a * math.sqrt(fc) * hef ** 1.5
    ANco = 9 * hef ** 2

    def ANc(xs):
        x0 = max(min(xs) - 1.5 * hef, ex_neg)
        x1 = min(max(xs) + 1.5 * hef, ex_pos)
        y0 = max(min(ys) - 1.5 * hef, ey_neg)
        y1 = min(max(ys) + 1.5 * hef, ey_pos)
        return (x1 - x0) * (y1 - y0)

    def camin(xs):
        return min(min(x - ex_neg for x in xs), min(ex_pos - x for x in xs),
                   min(y - ey_neg for y in ys), min(ey_pos - y for y in ys))

    def psi_ed_N(ca):                                       # 17.6.2.4
        return 1.0 if ca >= 1.5 * hef else 0.7 + 0.3 * ca / (1.5 * hef)

    psi_ec, psi_c, psi_cp = 1.0, 1.0, 1.0                   # concentric, cracked, cast-in
    tension_row = (rows_x[1],)
    ANc_t = ANc(tension_row)
    ped = psi_ed_N(camin(tension_row))
    Ncbg = ANc_t / ANco * psi_ec * ped * psi_c * psi_cp * Nb   # 17.6.2.1 (b)

    # 17.6.3.2.2 pullout, Np = 8 Abrg f'c (per anchor), psi_c,P = 1.0
    Np = 8 * Abrg * fc

    # 17.7.1.2 (b) steel in shear, cast-in headed: 0.6 Ase futa, x4 anchors
    Vsa = 4 * 0.6 * Ase * futa

    # 17.7.2 shear breakout toward the x+ edge
    le = min(hef, 8 * da)                                    # 17.7.2.2.1

    def shear_breakout(ca1):
        # 17.7.2.1.2 ca1 limit only if ca2 < 1.5ca1 on both sides AND ha < 1.5ca1
        ca2_lo = min(ys) - ey_neg
        ca2_hi = ey_pos - max(ys)
        if ca2_lo < 1.5 * ca1 and ca2_hi < 1.5 * ca1 and ha < 1.5 * ca1:
            ca1 = max(max(ca2_lo, ca2_hi) / 1.5, ha / 1.5, s / 3)
        Vb = min(7 * (le / da) ** 0.2 * math.sqrt(da) * lam_a * math.sqrt(fc) * ca1 ** 1.5,
                 9 * lam_a * math.sqrt(fc) * ca1 ** 1.5)    # 17.7.2.2.1
        w0 = max(min(ys) - 1.5 * ca1, ey_neg)
        w1 = min(max(ys) + 1.5 * ca1, ey_pos)
        AVc = (w1 - w0) * min(1.5 * ca1, ha)                 # 17.7.2.1
        AVco = 4.5 * ca1 ** 2
        ca2 = min(ca2_lo, ca2_hi)
        psi_ed = 1.0 if ca2 >= 1.5 * ca1 else 0.7 + 0.3 * ca2 / (1.5 * ca1)  # 17.7.2.4
        psi_h = max(1.0, math.sqrt(1.5 * ca1 / ha))          # 17.7.2.6
        psi_ecV, psi_cV = 1.0, 1.0
        Vcbg = AVc / AVco * psi_ecV * psi_ed * psi_cV * psi_h * Vb
        return Vb, AVc, Vcbg

    Vb2, AVc2, Vcbg2 = shear_breakout(ex_pos - rows_x[0])   # Case 2: rear row, ca1 = 11
    Vb1, AVc1, Vcbg1 = shear_breakout(ex_pos - rows_x[1])   # Case 1: front row, ca1 = 5

    # 17.7.3 pryout: Vcpg = kcp Ncpg, kcp = 2 (hef >= 2.5), Ncpg on all 4 anchors
    ANc_all = ANc(rows_x)
    Ncpg = ANc_all / ANco * psi_ec * psi_ed_N(camin(rows_x)) * psi_c * psi_cp * Nb
    Vcpg = 2.0 * Ncpg

    return {
        "Ase": Ase,
        "Nsa_lb": Nsa,
        "Nb_lb": Nb,
        "ANc_in2": ANc_t,
        "psi_edN": ped,
        "Ncbg_lb": Ncbg,
        "Np_lb": Np,
        "Vsa_lb": Vsa,
        "Vb_case2_lb": Vb2,
        "AVc_case2_in2": AVc2,
        "Vcbg_case2_lb": Vcbg2,
        "Vb_case1_lb": Vb1,
        "AVc_case1_in2": AVc1,
        "Vcbg_case1_lb": Vcbg1,
        "ANc_all_in2": ANc_all,
        "Vcpg_lb": Vcpg,
    }


# ===================================================== ledger lag screw (NDS)
def ledger():
    D, Fyb = 0.5, 45000.0
    ls, lm, G = 1.5, 3.0, 0.50
    # NDS Table 12.3.3 footnote: Fe_perp = 6100 G^1.45 / sqrt(D)
    Fe = 6100 * G ** 1.45 / math.sqrt(D)
    Fem = Fes = Fe
    Re = Fem / Fes
    Rt = lm / ls
    # Table 12.3.1B (D >= 0.25 in.): Ktheta = 1 + 0.25 (theta/90), theta = 90
    Kth = 1 + 0.25 * 90 / 90
    RdI, RdII, RdIII = 4 * Kth, 3.6 * Kth, 3.2 * Kth
    k1 = (math.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re)
    k2 = -1 + math.sqrt(2 * (1 + Re) + 2 * Fyb * (1 + 2 * Re) * D ** 2 / (3 * Fem * lm ** 2))
    k3 = -1 + math.sqrt(2 * (1 + Re) / Re + 2 * Fyb * (2 + Re) * D ** 2 / (3 * Fem * ls ** 2))
    # Table 12.3.1A single-shear yield limit equations
    modes = {
        "Z_Im": D * lm * Fem / RdI,
        "Z_Is": D * ls * Fes / RdI,
        "Z_II": k1 * D * ls * Fes / RdII,
        "Z_IIIm": k2 * D * lm * Fem / ((1 + 2 * Re) * RdIII),
        "Z_IIIs": k3 * D * ls * Fem / ((2 + Re) * RdIII),
        "Z_IV": D ** 2 / RdIII * math.sqrt(2 * Fem * Fyb / (3 * (1 + Re))),
    }
    Z = min(modes.values())
    Zp = Z * 1.25                                  # C_D = 1.25 (D + Lr)
    w = 60.0 + 80.0                                # ASD D + Lr, plf
    R = 1.25 * w * 16.0 / 12.0                     # interior reaction of two-span strip
    out = {"Fe_psi": Fe, "Re": Re, "Rt": Rt, "k1": k1, "k2": k2, "k3": k3}
    out.update(modes)
    out.update({"Z": Z, "Zprime": Zp, "R_lb": R, "ratio": R / Zp})
    return out


# ======================================== FTAO (Diekmann rational, SDPWS 4.3.6)
def ftao():
    L1, Lo, L2 = 4.0, 6.0, 12.0
    h, ha, hb = 9.0, 2.33, 3.0
    L = L1 + Lo + L2
    out = {}
    for tag, V in (("s", 0.7 * 4000.0), ("w", 0.6 * 2500.0)):   # ASD 0.7E, 0.6W
        v = V / L
        vp = V / (L1 + L2)
        H = V * h / L
        vab = H / (ha + hb)
        F = (vp - v) * max(L1, L2)
        out.update({f"v_{tag}": v, f"vp_{tag}": vp, f"H_{tag}": H,
                    f"vab_{tag}": vab, f"F_{tag}": F})
    ho = h - ha - hb
    out["pier_aspect"] = ho / min(L1, L2)
    return out


# ============================================================ flexible diaphragm
def diaphragm():
    Dspan, D = 24.0, 40.0
    lines = [0.0, 10.0, 24.0]
    FE, FW = 7200.0, 5000.0
    wE, wW = FE / Dspan, FW / Dspan
    segs = []
    line_R = {str(int(x)): {"E": 0.0, "W": 0.0} for x in lines}
    for a, b in zip(lines[:-1], lines[1:]):
        L = b - a
        RE, RW = wE * L / 2, wW * L / 2
        segs.append({"L": L, "RE": RE, "RW": RW, "vE": RE / D, "vW": RW / D,
                     "TE": wE * L ** 2 / 8 / D, "TW": wW * L ** 2 / 8 / D})
        for x in (a, b):
            line_R[str(int(x))]["E"] += RE
            line_R[str(int(x))]["W"] += RW

    # collector on line 10: walls 0..8 and 32..40 (piecewise-linear F(x) -> check breakpoints)
    walls = [(0.0, 8.0), (32.0, 40.0)]
    Lw = sum(b - a for a, b in walls)

    def maxF(R):
        vd, vw = R / D, R / Lw
        pts = sorted({0.0, D} | {p for w_ in walls for p in w_})
        best = 0.0
        for x in pts:
            inwall = sum(max(0.0, min(x, b) - a) for a, b in walls)
            best = max(best, abs(vd * x - vw * inwall))
        return best
    cFE = maxF(line_R["10"]["E"])
    cFW = maxF(line_R["10"]["W"])
    col10 = {"FE": cFE, "FW": cFW, "Fasd": max(0.7 * cFE, 0.6 * cFW)}
    # line 0: 20 ft of wall, positions unknown -> upper bound vd (D - Lw)
    col0 = {"FE": line_R["0"]["E"] / D * (D - 20.0)}
    return {"segs": segs, "line_R": line_R, "collector_10": col10, "collector_0_bound": col0}


# ================================================================ rigid diaphragm
def rigid():
    Lx, Ly = 40.0, 24.0
    X = [(0.0, 2.0), (10.0, 1.5), (24.0, 1.0)]     # (y, k)
    Y = [(0.0, 1.0), (40.0, 2.0)]                  # (x, k)
    V = 10000.0
    xcm, ycm = 20.0, 12.0
    ea = 0.05 * Ly                                 # ASCE 7-16 12.8.4.2
    skx = sum(k for _, k in X)
    sky = sum(k for _, k in Y)
    ycr = sum(k * y for y, k in X) / skx
    xcr = sum(k * x for x, k in Y) / sky
    J = sum(k * (y - ycr) ** 2 for y, k in X) + sum(k * (x - xcr) ** 2 for x, k in Y)
    e = ycm - ycr
    fx = {y: 0.0 for y, _ in X}
    fy = {x: 0.0 for x, _ in Y}
    for etot in (e + ea, e - ea):
        T = V * etot
        for y, k in X:
            f = V * k / skx + max(0.0, T * k * (y - ycr) / J)
            fx[y] = max(fx[y], f)
        for x, k in Y:
            fy[x] = max(fy[x], abs(T * k * (x - xcr) / J))
    return {"y_cr": ycr, "x_cr": xcr, "e": e, "J": J,
            "X_y0": fx[0.0], "X_y10": fx[10.0], "X_y24": fx[24.0],
            "Y_x0": fy[0.0], "Y_x40": fy[40.0]}


# ====================================================== Fpx (ASCE 7-16 12.10.1.1)
def fpx():
    W, SDS, Ie, R = 40000.0, 1.0, 1.0, 6.5
    Cs = SDS / (R / Ie)                            # 12.8-2
    Fx = Cs * W                                    # single level
    wpx = W
    calc = Fx / W * wpx                            # 12.10-1
    fmin = 0.2 * SDS * Ie * wpx                    # 12.10-2
    fmax = 0.4 * SDS * Ie * wpx                    # 12.10-3
    return {"Cs": Cs, "Fpx_calc": calc, "Fpx_min": fmin, "Fpx_max": fmax,
            "Fpx": min(max(calc, fmin), fmax)}


cases["steel_beam"] = steel_beam()
cases["hss_props"] = {k: {q: v[q] for q in ("A", "I", "Z", "J")} for k, v in HSS.items()}
cases["hss_column"] = hss_column()
cases["hss_slender"] = hss_slender()
cases["base_plate_small"] = base_plate_small()
cases["anchor_group"] = anchor_group()
cases["ledger"] = ledger()
cases["ftao"] = ftao()
cases["diaphragm"] = diaphragm()
cases["rigid"] = rigid()
cases["fpx"] = fpx()

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference_p3.json")
with open(path, "w") as fh:
    json.dump(cases, fh, indent=2)
print(f"wrote {len(cases)} cases to {path}")
print(json.dumps(cases, indent=2))
