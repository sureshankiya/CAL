"""
HouseCalc independent reference calculations (Phase 1 verification).

Written from first principles — closed-form beam formulas, the three-moment
equation for two-span beams, NDS adjustment-factor equations and the NDS 12.3
yield limit equations — without reference to the TypeScript engine. Results
are written to verification/reference.json and compared with the engine by
tests/reference.test.ts.

Run:  python3 -I verification/reference.py
"""
import json
import math
import os

OUT = {}


def case(name, **values):
    OUT[name] = {k: float(v) for k, v in values.items()}


# ---------------------------------------------------------------- helpers
def sawn(b, d):
    return {"A": b * d, "S": b * d * d / 6.0, "I": b * d ** 3 / 12.0}


def beam_stability(FbE, Fbstar):
    a = FbE / Fbstar
    t = (1 + a) / 1.9
    return t - math.sqrt(t * t - a / 0.95)


def column_stability(FcE, Fcstar, c):
    a = FcE / Fcstar
    t = (1 + a) / (2 * c)
    return t - math.sqrt(t * t - a / c)


# ---------------------------------------------------- V1 simple-span joist
# 2x12 DF-L No.2 @ 16 in., L = 14 ft, D = 15 psf, L = 40 psf, Cr = 1.15, CF = 1.0
s = sawn(1.5, 11.25)
trib = 16 / 12
wD, wL = 15 * trib, 40 * trib
w = wD + wL
L = 14.0
M = w * L * L / 8
fb = M * 12 / s["S"]
Fbp = 900 * 1.0 * 1.0 * 1.0 * 1.15  # C_D (D+L) = 1.0, C_F = 1.0 (2x12), C_r = 1.15
d_ft = 11.25 / 12
V_d = w * L / 2 - w * d_ft
fv = 1.5 * V_d / s["A"]
EI = 1.6e6 * s["I"]
L_in = L * 12
d_live = 5 * (wL / 12) * L_in ** 4 / (384 * EI)
d_dead = 5 * (wD / 12) * L_in ** 4 / (384 * EI)
case("V1_joist", fb=fb, Fbp=Fbp, fv=fv, d_live=d_live, d_total_kcr15=1.5 * d_dead + d_live, R=w * L / 2)

# ------------------------------------- V2 two equal spans, pattern live load
# three-moment equation, spans l, UDL q on span 1 only: M_B = -q l^2 / 16; both spans: -q l^2 / 8
l = 12.0
qD, qL = 20.0, 53.33
MB_both = -(qD + qL) * l * l / 8
# max positive moment in span 1 with D on both spans and L on span 1 only
MB = -qD * l * l / 8 - qL * l * l / 16
R_A = (qD + qL) * l / 2 + MB / l          # left end reaction of span 1
x0 = R_A / (qD + qL)                       # location of zero shear
Mpos = R_A * x0 - (qD + qL) * x0 * x0 / 2
# interior reaction, both spans loaded with D + L: 1.25 w l
R_B = 1.25 * (qD + qL) * l
# end reaction minimum: D on both, L on far span only -> R_A = q l/2 + M_B/l
R_A_min = qD * l / 2 + (-qD * l * l / 8) / l + (-qL * l * l / 16) / l
case("V2_two_span", Mneg=MB_both, Mpos=Mpos, R_B=R_B, R_A_min=R_A_min)

# ---------------------------------------------- V3 ridge-board rafter, 6:12
# 2x8 DF-L No.2 @ 24 in., run 12 ft, D = 10 psf on slope, Lr = 20 psf on plan
theta = math.atan(6 / 12)
c, sn, tn = math.cos(theta), math.sin(theta), math.tan(theta)
s8 = sawn(1.5, 7.25)
wv_D = 10 * 2 / c       # vertical dead per ft of plan
wv_Lr = 20 * 2
wv = wv_D + wv_Lr
run = 12.0
H = wv * run / (2 * tn)
N = H * c + wv * run * sn
Ls_in = run / c * 12
FcE = 0.822 * 580000 / (Ls_in / 7.25) ** 2
Fcstar = 1350 * 1.25 * 1.05      # C_D 1.25, C_F(Fc) 2x8 = 1.05
CP = column_stability(FcE, Fcstar, 0.8)
Fcp = Fcstar * CP
fc = N / s8["A"]
M_r = wv * run * run / 8          # moment equals the plan-projection value
fbr = M_r * 12 / s8["S"]
Fbr = 900 * 1.25 * 1.2 * 1.15     # C_D 1.25, C_F 1.2, C_r 1.15
inter = (fc / Fcp) ** 2 + fbr / (Fbr * (1 - fc / FcE))
case("V3_rafter_board", H=H, N=N, CP=CP, interaction=inter, M=M_r)

# -------------------------------- V4 16d common nail, single shear (NDS 12.3)
D, ls, lm = 0.162, 1.5, 1.5
G = 0.50
Fe = 16600 * G ** 1.84
Fyb = 90000
Rd = 2.2
Re, Rt = 1.0, lm / ls
k1 = (math.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re)
k2 = -1 + math.sqrt(2 * (1 + Re) + 2 * Fyb * (1 + 2 * Re) * D ** 2 / (3 * Fe * lm ** 2))
k3 = -1 + math.sqrt(2 * (1 + Re) / Re + 2 * Fyb * (2 + Re) * D ** 2 / (3 * Fe * ls ** 2))
modes = {
    "Im": D * lm * Fe / Rd,
    "Is": D * ls * Fe / Rd,
    "II": k1 * D * ls * Fe / Rd,
    "IIIm": k2 * D * lm * Fe / ((1 + 2 * Re) * Rd),
    "IIIs": k3 * D * ls * Fe / ((2 + Re) * Rd),
    "IV": D ** 2 / Rd * math.sqrt(2 * Fe * Fyb / (3 * (1 + Re))),
}
case("V4_nail_16d", Z=min(modes.values()), IIIs=modes["IIIs"], IV=modes["IV"])

# ------------------------------------- V5 glulam 5-1/8 x 24 24F-V4, L = 24 ft
b, d = 5.125, 24.0
CV = min(1.0, (21 / 24) ** 0.1 * (12 / d) ** 0.1 * (5.125 / b) ** 0.1)
lu = 8 * 12.0                     # top edge braced at 8 ft
ratio = lu / d
le = 2.06 * lu if ratio < 7 else (1.63 * lu + 3 * d if ratio <= 14.3 else 1.84 * lu)
RB = math.sqrt(le * d / b ** 2)
FbE = 1.20 * 850000 / RB ** 2     # E_y,min for 24F-V4
Fbstar = 2400 * 1.0               # D + L
CL = beam_stability(FbE, Fbstar)
case("V5_glulam", CV=CV, CL=CL, Fbp=Fbstar * min(CV, CL), le=le, RB=RB)

# ------------------------------- V6 TJI 210 11-7/8 @ 16, 16 ft, 15 + 40 psf + sw
wT = 55 * 16 / 12 + 2.9
wLi = 40 * 16 / 12
EIj, K = 348e6, 5.3e6
Lj = 16 * 12
bend = lambda q: 5 * (q / 12) * Lj ** 4 / (384 * EIj)
shear = lambda q: (q / 12) * Lj ** 2 / K
case("V6_tji", M=wT * 16 ** 2 / 8, V=wT * 16 / 2, d_live=bend(wLi) + shear(wLi), d_total=bend(wT) + shear(wT))

# --------------------------------------------- V7 overhang tip deflection
# 2x12 DF-L No.2, backspan 12 ft, overhang 3 ft, live 60 plf on the overhang only
s12 = sawn(1.5, 11.25)
EI12 = 1.6e6 * s12["I"]
q, a, lb = 60 / 12, 36.0, 144.0
tip = q * a * (4 * a * a * lb + 3 * a ** 3) / (24 * EI12)
case("V7_overhang", tip=tip, limit=2 * 3 * 12 / 360)

# --------------------------------------------------------- V8 snow, roof live
pg, Ce, Ct, Is = 30.0, 1.0, 1.0, 1.1
case("V8_snow", pf716=0.7 * Ce * Ct * Is * pg, pf722=0.7 * Ce * Ct * pg,
     Cs45=1 - (45 - 30) / 40, pm_low=20 * Is, Lr_400_6=20 * (1.2 - 0.001 * 400) * (1.2 - 0.05 * 6))

# ------------------------------------------- V9 header, sloped roof dead
# 4x10 DF-L No.2, 8 ft, roof trib 12 ft at 4:12, D = 10 psf (slope), Lr = 20 psf, self weight
s410 = sawn(3.5, 9.25)
G_df = 0.5
rho = 62.4 * (G_df / (1 + G_df * 0.009 * 19)) * (1 + 19 / 100)
sw = rho * s410["A"] / 144
wDh = 10 * 12 / math.cos(math.atan(4 / 12))
Mh = (wDh + sw + 20 * 12) * 8 ** 2 / 8
case("V9_header", sw=sw, fb=Mh * 12 / s410["S"], Fbp=900 * 1.25 * 1.2, R_D=(wDh + sw) * 4, R_Lr=20 * 12 * 4)

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference.json")
with open(path, "w") as f:
    json.dump(OUT, f, indent=2, sort_keys=True)
print(f"wrote {len(OUT)} cases to {path}")
for k, v in OUT.items():
    print(k, {kk: round(vv, 4) for kk, vv in v.items()})
