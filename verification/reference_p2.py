"""
HouseCalc independent reference calculations (Phase 2 verification).

Written from first principles and the code text (NDS 2018/2024 ASD,
ASCE 7-16, ACI 318-19, SDPWS-2021) without reference to the TypeScript
engine. Results are written to verification/reference_p2.json as a flat
map of key -> float.

Run:  python3 -I verification/reference_p2.py
"""
import json
import math
import os

OUT = {}


def put(prefix, **values):
    for k, v in values.items():
        OUT[f"{prefix}_{k}"] = float(v)


# ---------------------------------------------------------------- helpers
def sawn(b, d):
    return {"A": b * d, "S": b * d * d / 6.0, "I": b * d ** 3 / 12.0}


def column_stability(FcE, Fcstar, c=0.8):
    a = FcE / Fcstar
    t = (1 + a) / (2 * c)
    return t - math.sqrt(t * t - a / c)


def FcE_of(Emin, le_over_d):
    return 0.822 * Emin / le_over_d ** 2


# ASCE 7-16 §2.4.1 / §2.4.5 ASD combinations: name -> load factors
COMBOS = {
    "D": dict(D=1.0),
    "D + L": dict(D=1.0, L=1.0),
    "D + Lr": dict(D=1.0, Lr=1.0),
    "D + S": dict(D=1.0, S=1.0),
    "D + 0.75L + 0.75Lr": dict(D=1.0, L=0.75, Lr=0.75),
    "D + 0.75L + 0.75S": dict(D=1.0, L=0.75, S=0.75),
    "D + 0.6W": dict(D=1.0, W=0.6),
    "D + 0.75L + 0.45W + 0.75Lr": dict(D=1.0, L=0.75, W=0.45, Lr=0.75),
    "D + 0.75L + 0.45W + 0.75S": dict(D=1.0, L=0.75, W=0.45, S=0.75),
    "0.6D + 0.6W": dict(D=0.6, W=0.6),
}


def seismic_combos(SDS):
    return {
        "(1.0 + 0.14 SDS)D + 0.7E": dict(D=1.0 + 0.14 * SDS, E=0.7),
        "(1.0 + 0.105 SDS)D + 0.75L + 0.525E + 0.75S": dict(D=1.0 + 0.105 * SDS, L=0.75, E=0.525, S=0.75),
        "(0.6 - 0.14 SDS)D + 0.7E": dict(D=0.6 - 0.14 * SDS, E=0.7),
    }


def CD_of(f):
    if f.get("W", 0) or f.get("E", 0):
        return 1.6
    if f.get("Lr", 0):
        return 1.25
    if f.get("S", 0):
        return 1.15
    if f.get("L", 0):
        return 1.0
    return 0.9


def combine(f, loads):
    return sum(f.get(k, 0.0) * v for k, v in loads.items())


# ------------------------------------------------ W1 stud bearing wall
s26 = sawn(1.5, 5.5)
l_stud = 9 * 12 - 3 * 1.5  # 103.5 in
sp = 16 / 12  # ft
Fc_stud, Fb_stud, Emin_stud, E_stud = 850.0, 700.0, 510000.0, 1.4e6
CF_Fc, CF_Fb, Cr = 1.0, 1.0, 1.15
FcE_w = FcE_of(Emin_stud, l_stud / 5.5)  # strong axis; weak axis braced by sheathing
line = {"D": 300.0 + 22.0 * 9, "Lr": 240.0, "L": 0.0, "S": 0.0}
w_wind = 20.0 * sp  # plf, strength-level out-of-plane


def stud_row(name):
    f = COMBOS[name]
    CD = CD_of(f)
    P = combine(f, line) * sp
    fc = P / s26["A"]
    Fcs = Fc_stud * CD * CF_Fc
    CP = column_stability(FcE_w, Fcs)
    Fcp = Fcs * CP
    w = f.get("W", 0.0) * w_wind  # plf
    M = (w / 12.0) * l_stud ** 2 / 8.0  # lb-in
    fb = M / s26["S"]
    Fbp = Fb_stud * CD * CF_Fb * Cr  # C_L = 1
    inter = (fc / Fcp) ** 2 + (fb / (Fbp * (1 - fc / FcE_w)) if fb > 0 else 0.0)
    return dict(P=P, fc=fc, FcStar=Fcs, FcE=FcE_w, CP=CP, FcPrime=Fcp, fb=fb, FbPrime=Fbp, interaction=inter)


r = stud_row("D + Lr")
put("W1_DLr", **{k: r[k] for k in ("P", "fc", "FcStar", "FcE", "CP", "FcPrime", "interaction")})
for key, name in (("W1_DW", "D + 0.6W"), ("W1_DLW", "D + 0.75L + 0.45W + 0.75Lr")):
    r = stud_row(name)
    put(key, **{k: r[k] for k in ("P", "fc", "CP", "FcPrime", "fb", "FbPrime", "interaction")})

Pmax = max(combine(f, line) * sp for f in COMBOS.values())
Cb = (1.5 + 0.375) / 1.5
OUT["W1_fcperp"] = float(Pmax / s26["A"])
OUT["W1_FcperpPrime"] = float(625.0 * Cb)

w_defl = 0.42 * 20.0 * sp / 12.0  # lb/in
EI = E_stud * s26["I"]
delta0 = 5 * w_defl * l_stud ** 4 / (384 * EI)
Pcr = math.pi ** 2 * EI / l_stud ** 2
P_pd = (line["D"] + 0.75 * line["Lr"]) * sp
OUT["W1_delta0"] = float(delta0)
OUT["W1_Pcr"] = float(Pcr)
OUT["W1_delta"] = float(delta0 / (1 - P_pd / Pcr))
OUT["W1_limit"] = float(l_stud / 240.0)

# ------------------------------------------ P1 built-up column 3-ply 2x6
Fcs = 1350.0 * 1.0 * 1.1
le = 120.0
FcE_d = FcE_of(580000.0, le / 5.5)
CP_d = column_stability(FcE_d, Fcs)
FcE_b = FcE_of(580000.0, le / 4.5)
CP_b = 0.6 * column_stability(FcE_b, Fcs)  # NDS eq 15.3-1, Kf = 0.6 nailed
CP_p1 = min(CP_d, CP_b)
put("P1", FcE_d=FcE_d, CP_d=CP_d, FcE_b=FcE_b, CP_b=CP_b, CP=CP_p1,
    FcPrime=Fcs * CP_p1, fc=7000.0 / (4.5 * 5.5))

# ----------------------------------------------- SW1 segmented WSP wall
b, h = 8.0, 9.0
QE, rho, Wwind, SDS = 2308.0, 1.3, 2500.0, 1.0
Eh = rho * QE
wD = 200.0 + 12.0 * 9
arm = b - 3.0 / 12
vs = 0.7 * Eh / b
vw = 0.6 * Wwind / b


def sw_TC(f):
    V = f.get("E", 0.0) * Eh + f.get("W", 0.0) * Wwind
    wDf = f["D"] * wD
    T = (V * h - wDf * b * b / 2) / arm
    C = V * h / arm + wDf * sp / 2
    return T, C


lat = {k: v for k, v in COMBOS.items() if v.get("W", 0)}
lat.update(seismic_combos(SDS))
TC = {k: sw_TC(f) for k, f in lat.items()}
T_seis = TC["(0.6 - 0.14 SDS)D + 0.7E"][0]
T_wind = TC["0.6D + 0.6W"][0]
C_seis = TC["(1.0 + 0.14 SDS)D + 0.7E"][1]
C_wind = TC["D + 0.6W"][1]
Tmax = max(t for t, _ in TC.values())
Cmax = max(c for _, c in TC.values())

v_d = QE / b
Td = max(0.0, (QE * h - (0.6 - 0.2 * SDS) * wD * b * b / 2) / arm)
ka = 5645.0 / 0.115
Da = Td / ka
bend = 8 * v_d * h ** 3 / (1.6e6 * 10.5 * b)
shear = v_d * h / (1000 * 20.0)
slip = h * Da / b
dxe = bend + shear + slip

Fcs_post = 1350.0 * 1.6 * 1.15
FcE_post = 0.822 * 580000.0 / (108.0 / 3.5) ** 2
CP_post = column_stability(FcE_post, Fcs_post)
put("SW1", vs=vs, vw=vw, T_seis=T_seis, T_wind=T_wind, C_seis=C_seis, C_wind=C_wind,
    Tmax=Tmax, Td=Td, bend=bend, shear=shear, slip=slip, dxe=dxe, dx=4 * dxe / 1.0,
    FcPrime=Fcs_post * CP_post, fc=Cmax / 10.5)

# -------------------------------------- F1 plain concrete wall footing
B, hF, fc_ = 15.0, 12.0, 2500.0
Pu = 1.2 * 800 + 1.6 * 600  # plf
qu = Pu / (B / 12)  # psf
c_in = (B - 5.5) / 2
Mu = qu * (c_in / 12) ** 2 / 2  # lb-ft/ft
heff = hF - 2.0
Sm = 12 * heff ** 2 / 6
phiMn = 0.60 * 5 * math.sqrt(fc_) * Sm / 12  # lb-ft/ft
Vu = max(0.0, qu * (c_in - heff) / 12)  # lb/ft
phiVn = 0.60 * (4.0 / 3.0) * math.sqrt(fc_) * 12 * heff
q = (800 + 600 + 150 * 1.0 * B / 12 + 110 * 0.5 * (B - 5.5) / 12) / (B / 12)
put("F1", qu=qu, Mu=Mu, phiMn=phiMn, Vu=Vu, phiVn=phiVn, q=q)

# ------------------------------------- F2 reinforced square pad footing
L2, d2, fy, As = 30.0, 8.75, 60000.0, 3 * 0.20
Pu2 = 1.2 * 6000 + 1.6 * 4000
qu2 = Pu2 / (L2 * L2)
c2 = (L2 - 5.5) / 2
Mu2 = qu2 * L2 * c2 ** 2 / 2
a2 = As * fy / (0.85 * fc_ * L2)
cna = a2 / 0.85
eps_t = 0.003 * (d2 - cna) / cna
assert eps_t >= 0.005, "not tension-controlled"
phiMn2 = 0.9 * As * fy * (d2 - a2 / 2)
lam_s = min(1.0, math.sqrt(2 / (1 + d2 / 10)))
rho_w = As / (L2 * d2)
Vc1 = min(8 * lam_s * rho_w ** (1 / 3) * math.sqrt(fc_) * L2 * d2, 5 * math.sqrt(fc_) * L2 * d2)
Vu1 = qu2 * L2 * (c2 - d2)
bo = 4 * (5.5 + d2)
Vu2 = Pu2 - qu2 * (5.5 + d2) ** 2
vc2 = lam_s * min(4.0, 2 + 4 / 1.0, 2 + 40 * d2 / bo) * math.sqrt(fc_)
put("F2", Mu=Mu2, phiMn=phiMn2, Vu1=Vu1, phiVc1=0.75 * Vc1, Vu2=Vu2, phiVc2=0.75 * vc2 * bo * d2)

# ------------------------------------------- L1 seismic ELF + wind MWFRS
Wseis, SD1, R, Ie = 30000.0, 0.6, 6.5, 1.0
hn = 9 + 5 / 2
Ta = 0.02 * hn ** 0.75
Cs = SDS / (R / Ie)
Cs = min(Cs, SD1 / (Ta * R / Ie))
Cs = max(Cs, 0.044 * SDS * Ie, 0.01)
Kh = 0.70
qh = 0.00256 * Kh * 1.0 * 0.85 * 1.0 * 95.0 ** 2
a_w = max(min(0.1 * 30, 0.4 * hn), 0.04 * 30, 3.0)
theta = math.degrees(math.atan(4 / 12))
t = (theta - 5) / 15
lo = {"1": 0.40, "2": -0.69, "3": -0.37, "4": -0.29, "1E": 0.61, "2E": -1.07, "3E": -0.53, "4E": -0.43}
hi = {"1": 0.53, "2": -0.69, "3": -0.48, "4": -0.43, "1E": 0.80, "2E": -1.07, "3E": -0.69, "4E": -0.64}
g = {k: lo[k] + (hi[k] - lo[k]) * t for k in lo}
e2 = 2 * a_w
FY_env = qh * (4.5 * ((g["1E"] - g["4E"]) * e2 + (g["1"] - g["4"]) * (40 - e2))
               + 5.0 * ((g["2E"] - g["3E"]) * e2 + (g["2"] - g["3"]) * (40 - e2)))
FY_min = 16 * 4.5 * 40 + 8 * 5 * 40
FX_env = qh * 7.0 * ((0.61 + 0.43) * e2 + (0.40 + 0.29) * (30 - e2))
FX_min = 16 * 7.0 * 30
put("L1", Ta=Ta, Cs=Cs, V=Cs * Wseis, Kh=Kh, qh=qh, a=a_w, FY_env=FY_env, FY_min=FY_min,
    FY=max(FY_env, FY_min), FX_env=FX_env, FX_min=FX_min, FX=max(FX_env, FX_min))

# ---------------------------------------------- A1 cast-in headed anchor
da, nt, futa, fya = 0.625, 11.0, 58000.0, 36000.0
Ase = math.pi / 4 * (da - 0.9743 / nt) ** 2
Nsa = Ase * min(futa, 1.9 * fya, 125000.0)
hef = 10.0
edges = (6.0, 6.0, 30.0, 30.0)  # two opposite pairs: (6, 6) and (30, 30)
ANc = (min(edges[0], 1.5 * hef) + min(edges[1], 1.5 * hef)) * (min(edges[2], 1.5 * hef) + min(edges[3], 1.5 * hef))
ANco = 9 * hef ** 2
ca_min = min(edges)
psi_ed = min(1.0, 0.7 + 0.3 * ca_min / (1.5 * hef))
Nb = 24 * 1.0 * math.sqrt(fc_) * hef ** 1.5
Ncb = ANc / ANco * psi_ed * 1.0 * 1.0 * Nb
Abrg = 2 * 2 - math.pi / 4 * (da + 1 / 16) ** 2
Np = 8 * Abrg * fc_
Nsb = 160 * ca_min * math.sqrt(Abrg) * 1.0 * math.sqrt(fc_)
sb_applies = ca_min < 0.4 * hef
phiNsa = 0.75 * Nsa
phiNcb = 0.75 * 0.70 * Ncb
phiNpn = 0.75 * 0.70 * Np
phiNsb = 0.75 * 0.70 * Nsb
gov = [phiNsa, phiNcb, phiNpn] + ([phiNsb] if sb_applies else [])
# A1_phiNsb is the formula value; it only enters the governing minimum when c_a1 < 0.4 hef
put("A1", Ase=Ase, phiNsa=phiNsa, phiNcb=phiNcb, phiNpn=phiNpn, phiNsb=phiNsb,
    sb_applies=1.0 if sb_applies else 0.0, phiNn=min(gov))

# ---------------------------------------- B1 NDS 12.3.1 yield limit, bolt
D, ls, lm, Fem, Fyb = 0.625, 1.5, 7.0, 7500.0, 45000.0
Fes = 11200 * 0.50
Re, Rt = Fem / Fes, lm / ls
k1 = (math.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re)
k2 = -1 + math.sqrt(2 * (1 + Re) + 2 * Fyb * (1 + 2 * Re) * D ** 2 / (3 * Fem * lm ** 2))
k3 = -1 + math.sqrt(2 * (1 + Re) / Re + 2 * Fyb * (2 + Re) * D ** 2 / (3 * Fem * ls ** 2))
modes = {
    "Im": D * lm * Fem / 4.0,
    "Is": D * ls * Fes / 4.0,
    "II": k1 * D * ls * Fes / 3.6,
    "IIIm": k2 * D * lm * Fem / ((1 + 2 * Re) * 3.2),
    "IIIs": k3 * D * ls * Fem / ((2 + Re) * 3.2),
    "IV": D ** 2 / 3.2 * math.sqrt(2 * Fem * Fyb / (3 * (1 + Re))),
}
put("B1", Z=min(modes.values()), **modes)

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference_p2.json")
with open(path, "w") as fh:
    json.dump(OUT, fh, indent=2, sort_keys=True)
print(f"wrote {len(OUT)} values to {path}")
for k in sorted(OUT):
    print(f"{k:22s} {OUT[k]:.6g}")
