"""
Normalise the Tedds sheets extracted from the 14 portfolio permit sets (sets/*.json,
values copied verbatim from the calc packages) into numeric validation cases
(cases.json) for tests/validation.test.ts.

Every expected value keeps its printed precision ("dec"), so the comparison tolerance
is half a unit in the last printed digit or 0.5 %, whichever is larger.

Run: python3 -I verification/portfolio/normalize.py
"""

import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def sym(k):
    k = k.replace("’", "'").replace("‘", "'")
    k = k.split(" = ")[0]
    k = re.split(r" \(| \[", k)[0]
    return k.strip()


NUM = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")


def val(v):
    """'2484 psi' -> {'v': 2484.0, 'dec': 0}; None when no number."""
    if v is None:
        return None
    m = NUM.search(str(v))
    if not m:
        return None
    s = m.group(0).replace(",", "")
    dec = len(s.split(".")[1]) if "." in s else 0
    return {"v": float(s), "dec": dec}


def num(v):
    x = val(v)
    return x["v"] if x else None


def lookup(sheet):
    """symbol -> list of (full key, value), inputs then results."""
    out = {}
    for part in ("inputs", "results"):
        for k, v in (sheet.get(part) or {}).items():
            if isinstance(v, (list, dict)) or "collector" in k.lower():
                continue
            out.setdefault(sym(k), []).append((k, v))
    return out


def first(L, s):
    xs = L.get(s)
    return xs[0][1] if xs else None


def kips(v):
    """values printed in kips -> lb (keeps printed precision in lb)."""
    x = val(v)
    if not x:
        return None
    unit = str(v)
    if "kip" in unit:
        return {"v": x["v"] * 1000, "dec": max(0, x["dec"] - 3)}
    return x


SPECIES = [("Douglas Fir-Larch", "DF-L"), ("Hem-Fir", "HF"), ("Spruce-Pine-Fir", "SPF"), ("Southern Pine", "SP")]
GRADES = [
    ("select structural", "Sel Str"),
    ("no.1 & btr", "No.1 & Btr"),
    ("no.1", "No.1"),
    ("no.2", "No.2"),
    ("no.3", "No.3"),
    ("stud", "Stud"),
]


def species_grade(text):
    t = text or ""
    sp = next((c for n, c in SPECIES if n.lower() in t.lower()), None)
    gr = next((c for n, c in GRADES if n in t.lower()), None)
    return sp, gr


def nominal(text):
    """"2 x 2'' x 6''" -> (2, '2x6'); "2'' x 4''" -> (1, '2x4')."""
    t = (text or "").replace("''", '"')
    m = re.match(r'\s*(\d+)\s*x\s*(\d+)"\s*x\s*(\d+)"', t)
    if m:
        return int(m.group(1)), f"{m.group(2)}x{m.group(3)}"
    m = re.match(r'\s*(\d+)"\s*x\s*(\d+)"', t)
    if m:
        return 1, f"{m.group(1)}x{m.group(2)}"
    return None, None


def sheathing_key(material, fastener):
    m = (material or "").lower()
    f = (fastener or "").lower()
    thick = re.match(r"\s*(\d+/\d+)", m)
    th = thick.group(1) if thick else None
    sp = re.search(r"at (\d+)(?:''|\")", f)
    spacing = int(sp.group(1)) if sp else None
    nail = re.search(r"(\d+d)", f)
    nd = nail.group(1) if nail else None
    key = None
    if "gypsum" in m:
        if "sheathing" in m and th == "5/8" and "4''/7''" in f.replace('"', "''"):
            key = "GSH-5/8-4/7-blocked"
        elif "wallboard" in m and th == "5/8" and "blocking" in m:
            key = "GWB-5/8-4-blocked"
        elif "wallboard" in m and th == "1/2" and "blocking" not in m:
            key = "GWB-1/2-4"
        elif "sheathing" in m and th == "1/2" and "2' x 8'" in m:
            key = "GSH-1/2-2x8-4"
        elif "sheathing" in m and th == "1/2" and "blocking" in m:
            key = "GSH-1/2-4-blocked"
    elif "particleboard" in m:
        key = "PB-5/8-10d" if th == "5/8" and nd == "10d" else None
    elif "siding" in m or "plywood panel siding" in m:
        key = "PS-3/8-8dcasing" if th == "3/8" else None
    elif th and nd:
        if "structural i" in m:
            key = f"SI-{th}-{nd}"
        elif "across studs" in m:
            key = f"SH-{th}-{nd}-across"
        else:
            key = f"SH-{th}-{nd}"
    return key, spacing


def shear_wall(set_id, s):
    L = lookup(s)
    sp, gr = species_grade(first(L, "Species, grade and size classification"))
    _, stud = nominal(first(L, "Nominal stud size"))
    plies, post = nominal(first(L, "Nominal end post size"))
    segs = sorted(
        [(int(k[1:]), num(v[0][1])) for k, v in L.items() if re.fullmatch(r"b\d", k) and num(v[0][1])],
    )
    b = num(first(L, "b"))
    openings = len([k for k in L if re.fullmatch(r"wo\d", k)])
    sides = []
    # one-side walls print vs / vw / Ga; two-side walls vs1 / vs2 ...
    mats = [(k, v) for k, v in L.items() if k.lower().startswith("sheathing material") or re.fullmatch(r"side \d sheathing material", k.lower())]
    fasts = [(k, v) for k, v in L.items() if k.lower().startswith("fastener type") or re.fullmatch(r"side \d fastener type", k.lower())]
    mat_list = [v for _, vs in sorted(mats) for (_, v) in vs]
    fas_list = [v for _, vs in sorted(fasts) for (_, v) in vs]
    for i in (1, 2):
        vs = first(L, f"vs{i}")
        if vs is None:
            continue
        mat = mat_list[i - 1] if len(mat_list) >= i else None
        fas = fas_list[i - 1] if len(fas_list) >= i else None
        key, spacing = sheathing_key(mat, fas)
        sides.append(
            {"material": mat, "fastener": fas, "key": key, "spacing": spacing, "vs": num(vs), "vw": num(first(L, f"vw{i}")), "Ga": num(first(L, f"Ga{i}"))}
        )
    if not sides and first(L, "vs") is not None:
        mat = mat_list[0] if mat_list else None
        fas = fas_list[0] if fas_list else None
        key, spacing = sheathing_key(mat, fas)
        both = "both sides" in (first(L, "Panel details") or "")
        side = {"material": mat, "fastener": fas, "key": key, "spacing": spacing, "vs": num(first(L, "vs")), "vw": num(first(L, "vw")), "Ga": num(first(L, "Ga"))}
        sides = [side, dict(side)] if both else [side]

    def res(symbol, pick=0):
        xs = L.get(symbol) or []
        return val(xs[pick][1]) if len(xs) > pick else None

    def res_kips(symbol):
        xs = L.get(symbol) or []
        return kips(xs[0][1]) if xs else None

    def max_kips(symbol):
        xs = [kips(v) for _, v in (L.get(symbol) or [])]
        xs = [x for x in xs if x]
        return max(xs, key=lambda x: x["v"]) if xs else None

    # chord compression / tension values: first value of each symbol is the end post (chords 1 and 2)
    case = {
        "id": f"{set_id}/{s['section']}",
        "set": set_id,
        "kind": "shearWall",
        "section": s["section"],
        "codeRefs": [c for c in s.get("codeRefs", []) if re.search(r"NDS|IBC|SDPWS|ASCE", c)][:3],
        "h": num(first(L, "h")),
        "b": b,
        "segments": [x for _, x in segs],
        "openings": openings,
        "species": sp,
        "grade": gr,
        "stud": stud,
        "spacing": num(first(L, "s")),
        "post": {"size": post, "plies": plies},
        "holeDia": num(first(L, "Dia")),
        "ka": num(first(L, "ka")),
        "ref": {k: num(first(L, k)) for k in ("Ft", "Fc", "E", "Emin")},
        "sides": sides,
        "loads": {k: num(first(L, k)) or 0 for k in ("D", "Lf", "Lr", "S", "Swt", "W", "Eq", "SDS")},
        "fWserv": num(first(L, "fWserv")) or 1,
        "Cd": num(first(L, "Cdδ")),
        "Ie": num(first(L, "Ie")),
        "expected": {
            "vsc": res("vsc"),
            "vwc": res("vwc"),
            "Gac": res("Gac"),
            "CD": res("CD"),
            "CFc": res("CFc"),
            "CFt": res("CFt"),
            "FcE": res("FcE"),
            "FcStar": res("Fc*"),
            "CP": res("CP"),
            "FcPrime": res("Fc'"),
            "FtPrime": res("Ft'"),
            "Vs": res_kips("Vs"),
            "Vw": res_kips("Vw"),
            "C": res_kips("C"),
            "T": res_kips("T"),
            "dsww": res("δsww"),
            "dsws": res("δsws"),
        },
    }
    if segs or openings:
        # segmented walls with openings: Tedds distributes the wall force to the segments by
        # stiffness; HouseCalc designs each segment as its own wall, so chord forces and
        # deflections are not compared (capacity and material values are)
        for k in ("C", "T", "dsww", "dsws"):
            case["expected"].pop(k, None)
    case["expected"] = {k: v for k, v in case["expected"].items() if v is not None}
    return case


def wood_post(set_id, s):
    L = lookup(s)
    if first(L, "Fc* = Fc × CD") is None and first(L, "Fc*") is None:
        return None
    mat = first(L, "Material selected") or ""
    sp, gr = species_grade(mat)
    b = num(first(L, "b"))
    d = num(first(L, "d"))
    size = f"{int(round(num(first(L, 'bnom')) or 0))}x{int(round(num(first(L, 'dnom')) or 0))}"
    dur = (first(L, "Load duration - Table 2.3.2") or "").lower()
    ltype = {"permanent": "D", "ten years": "L", "two months": "S", "seven days": "Lr"}.get(dur)
    P = num(first(L, "P"))
    if P is None:
        return None

    def res(symbol):
        xs = L.get(symbol) or []
        return val(xs[0][1]) if xs else None

    inter = None
    for k, v in L.items():
        if k.startswith("max((fc / Fc')2"):
            inter = val(v[0][1])
    return {
        "id": f"{set_id}/{s['section']}/{first(L, 'User note') or ''}",
        "set": set_id,
        "kind": "post",
        "section": f"{s['section']} {first(L, 'User note') or ''}".strip(),
        "species": sp,
        "grade": gr,
        "size": size,
        "b": b,
        "d": d,
        "Lx": num(first(L, "Lx")),
        "duration": dur,
        "type": ltype,
        "P": P,
        "Mx": num(first(L, "Mx")) or 0,
        "expected": {
            k: v
            for k, v in {
                "CD": res("CD"),
                "FcStar": res("Fc*"),
                "FcE": res("FcE"),
                "CP": res("CP"),
                "FcPrime": res("Fc'"),
                "fc": res("fc"),
                "FbPrime": res("Fb,x'"),
                "fb": res("fb,x"),
                "interaction": inter,
            }.items()
            if v is not None
        },
    }


def footing(set_id, s):
    L = lookup(s)
    g = lambda *names: next((first(L, n) for n in names if first(L, n) is not None), None)
    Lx = num(g("Lx"))
    Ly = num(g("Ly"))
    h = num(g("h"))
    if None in (Lx, Ly, h):
        return None
    loads = {}
    for k, xs in L.items():
        m = re.fullmatch(r"F([DLS]|Lr|W|E)z(\d*)", k)
        if m:
            loads.setdefault(m.group(1), 0)
            loads[m.group(1)] += (num(xs[0][1]) or 0) * (1000 if "kip" in str(xs[0][1]) else 1)
    bars = g("Tension reinforcement provided", "Bottom reinforcement provided", "Final bar callout")

    def res(*names):
        for n in names:
            xs = L.get(n) or []
            if xs:
                return val(xs[0][1])
        return None

    def res_kft(*names):
        for n in names:
            xs = L.get(n) or []
            if xs:
                x = val(xs[0][1])
                return {"v": x["v"] * 12000, "dec": max(0, x["dec"] - 3)} if x else None
        return None

    def res_ksf(*names):
        for n in names:
            xs = L.get(n) or []
            if xs:
                x = val(xs[0][1])
                return {"v": x["v"] * 1000, "dec": max(0, x["dec"] - 3)} if x and "ksf" in str(xs[0][1]) else x
        return None

    return {
        "id": f"{set_id}/{s['section']}",
        "set": set_id,
        "kind": "footing",
        "type": "strip" if s["type"] == "footingStrip" else "pad",
        "section": s["section"],
        "Lx": Lx,
        "Ly": Ly,
        "h": h,
        "hsoil": num(g("hsoil")) or 0,
        "wall": num(g("ly1", "lx1")) or 0,
        "col": [num(g("lx1")) or 0, num(g("ly1")) or 0],
        "qallow": num(g("qallow_Gross", "qallow")),
        "fc": num(g("f'c")),
        "fy": num(g("fy")),
        "cover": num(g("cnom")),
        "gammaSoil": num(g("γsoil")) or 120,
        "bars": bars,
        "loads": loads,
        "expected": {
            k: v
            for k, v in {
                "qmax": res_ksf("qmax"),
                "d": res("d"),
                "a": res("a"),
                "epsT": res("εt"),
                "phiMn": res_kft("ϕMn"),
                "AsMin": res("As.min", "As,min", "Asy.bot.req", "As.min.y"),
            }.items()
            if v is not None
        },
    }


def main():
    cases = []
    skipped = []
    for f in sorted(glob.glob(os.path.join(HERE, "sets", "*.json"))):
        d = json.load(open(f))
        set_id = d["set"]
        for s in d["sheets"]:
            c = None
            if s["type"] == "shearWall":
                c = shear_wall(set_id, s)
            elif s["type"] == "woodPost":
                c = wood_post(set_id, s)
            elif s["type"] in ("footingStrip", "footingPad"):
                c = footing(set_id, s)
            if c:
                cases.append(c)
            else:
                skipped.append(f"{set_id}/{s['section']} ({s['type']})")
    json.dump({"cases": cases, "notAutomated": skipped}, open(os.path.join(HERE, "cases.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(cases)} cases; {len(skipped)} sheets not automated")


if __name__ == "__main__":
    main()
