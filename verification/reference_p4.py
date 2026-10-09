"""
HouseCalc independent reference calculations (Phase 4 verification).

Written from first principles and the code text (Timoshenko beam theory,
TMS 402 ASD, ACI 318-19 Ch. 22 / Ch. 17, statics) without reference to the
TypeScript engine or its tests. Results are written to
verification/reference_p4.json as a dict: case name -> values (floats at full
precision).

Units: lb, in, ft, psi (as noted per case).

Run:  python3 -I verification/reference_p4.py
"""
import json
import math
import os

cases = {}
PI = math.pi


# ============================================== 1. Timoshenko propped cantilever
def panel_tim():
    """Wall strip, base fixed at x=0, top pinned at x=L. Bending + shear flexibility.

    Release the top support -> cantilever. Compatibility at the free end:
        delta_w(top) = w L^4/(8 EI) + w L^2/(2 GAv)
        delta_R(top) = R (L^3/(3 EI) + L/GAv)
    R = delta_w / (delta_R per unit R).
    """
    L = 36.0                                        # in
    w_plf = 0.7 * (0.4 * 88.125 + 40.0)             # lb/ft (per ft strip)
    w = w_plf / 12.0                                # lb/in
    EI = 1.8e6 * 512.0                              # lb-in^2
    GAv = 720000.0 * 48.0                           # lb

    d_w = w * L ** 4 / (8 * EI) + w * L ** 2 / (2 * GAv)
    f_R = L ** 3 / (3 * EI) + L / GAv
    Rtop = d_w / f_R                                # lb per ft strip
    Rbase = w * L - Rtop
    Mbase = abs(Rtop * L - w * L ** 2 / 2)          # lb-in per ft strip

    # Moment measured from the top (y down from pin): M(y) = Rtop y - w y^2 / 2.
    # Maximum span (positive) moment at zero shear, y0 = Rtop / w.
    y0 = Rtop / w
    Mspan = Rtop ** 2 / (2 * w)
    # Pure-bending (Euler-Bernoulli) comparison: Rtop = 3wL/8
    Rtop_eb = 3 * w * L / 8
    return {"w_plf": w_plf, "w_lbin": w, "Rtop": Rtop, "Rbase": Rbase,
            "Mbase": Mbase, "Mspan_max": Mspan, "y_Mspan_from_top": y0,
            "Mmax_abs": max(Mbase, Mspan), "Rtop_euler_bernoulli": Rtop_eb}


# ===================================================== 2. TMS 402 ASD CMU P-M
def quad_pos(a, b, c):
    """Positive root of a x^2 + b x + c = 0."""
    disc = b * b - 4 * a * c
    return (-b + math.sqrt(disc)) / (2 * a)


def cmu_sm():
    b, t, d = 12.0, 8.0, 4.0
    As = 0.31 * 12.0 / 8.0                          # in^2/ft
    fpm = 2000.0
    Em = 900.0 * fpm
    n = 29e6 / Em
    Fb = fpm / 3.0
    Fs = 32000.0
    P = 144.6125                                    # lb/ft compression

    # Equilibrium: P = 0.5 fm b kd - As fs,  fs = n fm (d - kd)/kd
    # Case A: masonry at Fb -> 0.5 Fb b kd^2 + (As n Fb - P) kd - As n Fb d = 0
    kdA = quad_pos(0.5 * Fb * b, As * n * Fb - P, -As * n * Fb * d)
    fsA = n * Fb * (d - kdA) / kdA
    # Case B: steel at Fs -> fm = Fs kd /(n (d - kd));
    #   0.5 b Fs kd^2 + n (P + As Fs) kd - n (P + As Fs) d = 0
    kdB = quad_pos(0.5 * b * Fs, n * (P + As * Fs), -n * (P + As * Fs) * d)
    fmB = Fs * kdB / (n * (d - kdB))

    def moment(fm, kd, fs):
        C = 0.5 * fm * b * kd
        T = As * fs
        return C * (t / 2 - kd / 3) + T * (d - t / 2)

    if fsA <= Fs:
        gov, kd, fm, fs = "masonry", kdA, Fb, fsA
    else:
        gov, kd, fm, fs = "steel", kdB, fmB, Fs
    Mc = moment(fm, kd, fs)
    # equilibrium check
    resid = 0.5 * fm * b * kd - As * fs - P

    # Balance point
    k_bal = n / (Fs / Fb + n)
    T_bal = As * Fs
    C_bal = k_bal * d * Fb * b / 2
    M_bal = T_bal * (d - t / 2) + C_bal * (t / 2 - k_bal * d / 3)
    P_bal = C_bal - T_bal

    # Axial allowable (TMS 402 8.3.4.2.1, h/r <= 99)
    A = 96.0
    r = t / math.sqrt(12.0)
    h = 36.0
    Pa = 0.25 * fpm * A * (1 - (h / (140 * r)) ** 2)

    # Shear (TMS 402 8.3.5.1.4, Fvs = 0)
    M, V, Pv = 669.76875, 97.6171875, 144.6125
    MVd = min(M / (V * d), 1.0)
    Fvm = 0.5 * (4 - 1.75 * MVd) * math.sqrt(fpm) + 0.25 * Pv / A
    Fv = min(Fvm, 2 * math.sqrt(fpm))
    fv = V / (b * d)
    return {"As": As, "n": n, "Fb": Fb, "kd": kd, "fm": fm, "fs": fs,
            "governs_masonry": 1.0 if gov == "masonry" else 0.0,
            "Mc": Mc, "equilibrium_residual": resid,
            "kd_masonry_limit": kdA, "fs_at_masonry_limit": fsA,
            "kd_steel_limit": kdB, "fm_at_steel_limit": fmB,
            "k_bal": k_bal, "T_bal": T_bal, "C_bal": C_bal, "M_bal": M_bal,
            "P_bal": P_bal, "r": r, "Pa": Pa, "MVd": MVd, "Fvm": Fvm,
            "Fv": Fv, "fv": fv}


# ============================================== 3. Fully grouted CMU wall weight
def cmu_weight():
    t, lb, hb = 8.0, 16.0, 8.0
    fs_, web = 1.25, 1.25
    n_int, n_end = 1, 2
    g_block, g_grout = 115.0, 140.0
    sv = 8.0
    cell_len = lb - n_int * web - n_end * web       # 16 - 3.75
    cell_w = t - 2 * fs_                            # 5.5
    Ablock = (t * lb - cell_len * cell_w) / lb * 12.0   # in^2 per ft of wall
    Agrout = cell_len * cell_w / lb * 12.0
    w_wall = Ablock / 144.0 * g_block + Agrout / 144.0 * g_grout   # psf
    # Bond beam (face shells only, cavity fully grouted)
    w_bb = 2 * fs_ / 12.0 * g_block + (t - 2 * fs_) / 12.0 * g_grout
    # Bond beams every sv in: fraction hb/sv of courses are bond beams
    frac = min(hb / sv, 1.0)
    w = frac * w_bb + (1 - frac) * w_wall
    return {"Ablock": Ablock, "Agrout": Agrout, "w_wall": w_wall,
            "w_bb": w_bb, "w": w}


# ============================================== 4. ACI 318-19 P-M at given Pu
def conc_pm():
    b, t, d = 12.0, 8.0, 6.1875
    As = 0.31 * 12.0 / 16.0
    fc, fy, Es = 2500.0, 60000.0, 29e6
    ecu, beta1 = 0.003, 0.85
    Pu = 490.0
    ey = fy / Es

    def state(c):
        et = ecu * (d - c) / c
        fs = max(-fy, min(fy, Es * et))
        a = beta1 * c
        Cc = 0.85 * fc * a * b
        Pn = Cc - As * fs
        phi = max(0.65, min(0.9, 0.65 + 0.25 * (et - ey) / 0.003))
        Mn = Cc * (t / 2 - a / 2) + As * fs * (d - t / 2)
        return et, fs, a, Cc, Pn, phi, Mn

    # Bisection on phi*Pn(c) - Pu (monotone increasing in c over this range)
    lo, hi = 1e-6, d
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if state(mid)[5] * state(mid)[4] - Pu > 0:
            hi = mid
        else:
            lo = mid
    c = 0.5 * (lo + hi)
    et, fs, a, Cc, Pn, phi, Mn = state(c)
    return {"As": As, "c": c, "a": a, "eps_t": et, "fs": fs, "Pn": Pn,
            "phi": phi, "phiPn": phi * Pn, "Mn": Mn, "phiMn": phi * Mn}


# ============================================== 5. ACI 318-19 Ch.17 adhesive row
def adhesive_row():
    da, Ase = 0.5, 0.2
    fya, futa = 60000.0, 90000.0
    futa = min(futa, 1.9 * fya, 125000.0)           # 17.6.1.2
    hef, s, ca1, ha = 6.0, 16.0, 6.0, 12.0
    fc, lam = 2500.0, 1.0
    tau_cr, tau_uncr = 200.0, 650.0
    kc = 17.0
    phi_b, phi_c = 0.55, 0.65
    sfc = math.sqrt(fc)

    # Steel tension (17.6.1)
    phiNsa = 0.75 * Ase * futa

    # Concrete breakout, tension (17.6.2), per anchor in the row
    ANco = 9 * hef ** 2
    ANc = min(s, 3 * hef) * (min(ca1, 1.5 * hef) + 1.5 * hef)
    psi_edN = 1.0 if ca1 >= 1.5 * hef else 0.7 + 0.3 * ca1 / (1.5 * hef)
    Nb = kc * lam * sfc * hef ** 1.5
    Ncb = min(ANc, ANco) / ANco * psi_edN * Nb
    phiNcb = phi_b * Ncb  # ACI 318-19 17.5.3: one phi (anchor category) for breakout and bond in tension

    # Bond (17.6.5)
    cNa = 10 * da * math.sqrt(tau_uncr / 1100.0)
    ANao = (2 * cNa) ** 2
    ANa = min(s, 2 * cNa) * (min(ca1, cNa) + cNa)
    psi_edNa = 1.0 if ca1 >= cNa else 0.7 + 0.3 * ca1 / cNa
    Nba = lam * tau_cr * PI * da * hef
    Na = min(ANa, ANao) / ANao * psi_edNa * Nba
    phiNa = phi_b * Na

    # Steel shear (17.7.1)
    phiVsa = 0.65 * 0.6 * Ase * futa

    # Concrete breakout, shear toward edge (17.7.2)
    le = min(hef, 8 * da)
    Vb = min(7 * (le / da) ** 0.2 * math.sqrt(da) * lam * sfc * ca1 ** 1.5,
             9 * lam * sfc * ca1 ** 1.5)
    AVco = 4.5 * ca1 ** 2
    AVc = min(s, 3 * ca1) * min(1.5 * ca1, ha)
    psi_hV = max(1.0, math.sqrt(1.5 * ca1 / ha))
    Vcb = min(AVc, AVco) / AVco * 1.0 * psi_hV * Vb
    phiVcb = phi_c * Vcb

    # Pryout (17.7.3)
    kcp = 2.0 if hef >= 2.5 else 1.0
    phiVcp = phi_c * kcp * min(Na, Ncb)

    return {"futa": futa, "phiNsa": phiNsa,
            "ANco": ANco, "ANc": ANc, "psi_edN": psi_edN, "Nb": Nb, "Ncb": Ncb,
            "phiNcb": phiNcb,
            "cNa": cNa, "ANao": ANao, "ANa": ANa, "psi_edNa": psi_edNa,
            "Nba": Nba, "Na": Na, "phiNa": phiNa,
            "phiVsa": phiVsa, "le": le, "Vb": Vb, "AVco": AVco, "AVc": AVc,
            "psi_hV": psi_hV, "Vcb": Vcb, "phiVcb": phiVcb, "phiVcp": phiVcp,
            "phiNn": min(phiNsa, phiNcb, phiNa),
            "phiVn": min(phiVsa, phiVcb, phiVcp)}


# ============================================== 6. Parallel-chord truss
def solve_linear(A, rhs):
    """Gaussian elimination with partial pivoting (dense, small)."""
    n = len(rhs)
    M = [row[:] + [rhs[i]] for i, row in enumerate(A)]
    for k in range(n):
        p = max(range(k, n), key=lambda i: abs(M[i][k]))
        if abs(M[p][k]) < 1e-12:
            raise ValueError("singular truss system")
        M[k], M[p] = M[p], M[k]
        for i in range(k + 1, n):
            f = M[i][k] / M[k][k]
            if f:
                for j in range(k, n + 1):
                    M[i][j] -= f * M[k][j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def truss_parallel():
    span, depth, npan = 45.0, 2.5, 9
    pl = span / npan                                # 5 ft
    w = 70.0                                        # plf horizontal projection
    nodes = {}
    for i in range(npan + 1):
        nodes[f"T{i}"] = (pl * i, depth)
        nodes[f"B{i}"] = (pl * i, 0.0)
    members = []
    for i in range(npan):
        members.append((f"T{i}", f"T{i+1}"))
        members.append((f"B{i}", f"B{i+1}"))
    for i in range(npan + 1):                       # end + interior verticals
        members.append((f"T{i}", f"B{i}"))
    for i in range(npan):
        members.append((f"B{i}", f"T{i+1}") if i % 2 == 0 else (f"T{i}", f"B{i+1}"))

    # Loads (lb), downward, tributary halves
    loads = {}
    for i in range(npan + 1):
        trib = pl / 2 if i in (0, npan) else pl
        loads[f"T{i}"] = (0.0, -w * trib)

    # Unknowns: member forces (tension +), then Rx_B0, Ry_B0, Ry_B9
    names = list(nodes)
    idx = {nm: k for k, nm in enumerate(names)}
    nm_ = len(members)
    nu = nm_ + 3
    A = [[0.0] * nu for _ in range(2 * len(names))]
    rhs = [0.0] * (2 * len(names))
    for m, (a, b) in enumerate(members):
        xa, ya = nodes[a]
        xb, yb = nodes[b]
        L = math.hypot(xb - xa, yb - ya)
        cx, cy = (xb - xa) / L, (yb - ya) / L
        # tension pulls node a toward b, node b toward a
        A[2 * idx[a]][m] += cx
        A[2 * idx[a] + 1][m] += cy
        A[2 * idx[b]][m] -= cx
        A[2 * idx[b] + 1][m] -= cy
    A[2 * idx["B0"]][nm_] = 1.0
    A[2 * idx["B0"] + 1][nm_ + 1] = 1.0
    A[2 * idx[f"B{npan}"] + 1][nm_ + 2] = 1.0
    for nm, (fx, fy) in loads.items():
        rhs[2 * idx[nm]] -= fx
        rhs[2 * idx[nm] + 1] -= fy
    x = solve_linear(A, rhs)

    def force(a, b):
        for m, mem in enumerate(members):
            if mem == (a, b) or mem == (b, a):
                return x[m]
        raise KeyError((a, b))

    # Hand check by method of sections through panel 4 (x = 20..25), diagonal B4-T5:
    #   top chord T4-T5   = -M(x=20)/depth  (moments about B4)
    #   bottom chord B4-B5 = +M(x=25)/depth (moments about T5)
    # Beam-analogy moments from the left free body are reported for comparison.
    R = x[nm_ + 1]
    M_x20 = R * 20 - sum(-loads[f"T{i}"][1] * (20 - pl * i) for i in range(5))
    M_x25 = R * 25 - sum(-loads[f"T{i}"][1] * (25 - pl * i) for i in range(6))
    return {"Rx_B0": x[nm_], "Ry_B0": x[nm_ + 1], "Ry_B9": x[nm_ + 2],
            "total_load": -sum(v[1] for v in loads.values()),
            "N_B0_T1": force("B0", "T1"),
            "N_T4_T5": force("T4", "T5"),
            "N_B4_B5": force("B4", "B5"),
            "N_T0_B0": force("T0", "B0"),
            "M_beam_x20": M_x20, "M_beam_x25": M_x25,
            "max_abs_member_force": max(abs(v) for v in x[:nm_])}


# ============================================== 7. Holdown footing stability
def holdown_ftg():
    Lf, B = 13.167, 1.5                              # ft
    P, M = 4000.0, 6000.0                            # lb, lb-ft
    e = M / P
    if e <= Lf / 6:
        q_max = P / (B * Lf) * (1 + 6 * e / Lf)
        q_min = P / (B * Lf) * (1 - 6 * e / Lf)
    else:
        q_max = 2 * P / (3 * B * (Lf / 2 - e))
        q_min = 0.0
    return {"e": e, "kern": Lf / 6, "q_max": q_max, "q_min": q_min,
            "M_ratio": M / (P * Lf / 2)}


cases["panel_tim"] = panel_tim()
cases["cmu_sm"] = cmu_sm()
cases["cmu_weight"] = cmu_weight()
cases["conc_pm"] = conc_pm()
cases["adhesive_row"] = adhesive_row()
cases["truss_parallel"] = truss_parallel()
cases["holdown_ftg"] = holdown_ftg()

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference_p4.json")
with open(path, "w") as fh:
    json.dump(cases, fh, indent=2)
print(f"wrote {len(cases)} cases to {path}")
print(json.dumps(cases, indent=2))
