"""
Cut the engineer's library details out of their CONNECTION.dxf files and 3225 set into src/lib/detailTemplates.json.

Each template is the drawing inside one detail cell (title strip excluded), flattened to plain
geometry in the cell's own drawing units: line segments, hatch lines, filled triangles,
circles and text blocks (consecutive TEXT lines merged into paragraphs; keynotes "N- " start a
new one). The app draws a template as-is (the details are N.T.S.) and replaces only the text
blocks whose values come from the calculations.

    python3 -I scripts/extract-detail-templates.py 1CONNECTION.dxf 2CONNECTION.dxf 3225_1.dxf
"""

import json
import re
import sys

import ezdxf
from ezdxf import bbox, path
from ezdxf.math import triangulation
from ezdxf.render import hatching

# template id -> (source file index, (title anchor x, y) of a 312.5 x 276 cell | (x0, y0, x1, y1))
CELLS = {
    # 1CONNECTION.dxf: detail library grid
    "ext-bearing-footing": (0, (6618, -1996)),
    "tie-in": (0, (7244, -1997)),
    "shear-wall-to-existing": (0, (7244, -2273)),
    "hdu-to-existing": (0, (9088, -2122)),
    "roof-tie": (0, (8838, 307)),
    "shear-transfer-clip": (0, (7555, -2548)),
    "ledger-lag": (0, (7555, -2824)),
    # 2CONNECTION.dxf: issued sheets S-5 to S-8 (its footing details are left out: their notes are exploded
    # to line strokes, so the calculated values cannot be written in)
    "shear-wall-section": (1, (14985, 9765, 15365, 10030)),
    "hdu-section": (1, (15370, 9810, 15640, 9955)),
    "tji-hanger": (1, (15948, 9826, 16112, 9959)),
    "sistered-joist": (1, (16826, 9846, 16967, 9968)),
    "panel-edge-blocked": (1, (16971, 9986, 17100, 10037)),
    "opening-framing": (1, (17688, 9838, 17985, 10112)),
    "top-plate-splice": (1, (17688, 9697, 17836, 9824)),
    "bearing-wall-base": (1, (17986, 9697, 18136, 9752)),
    "post-base": (1, (18137, 9697, 18287, 9758)),
    # general typicals (not from the calculations), offered in the details selection
    "bar-bending": (1, (16262, 9972, 16408, 10100)),
    "footing-corner-reinf": (1, (16410, 9972, 16560, 10105)),
    "stair-stringer": (1, (15985, 9700, 16300, 9808)),
    "floor-roof-opening": (1, (16826, 9702, 16958, 9842)),
    "stud-wall-elevation-2story": (1, (17986, 9832, 18290, 10115)),
    "top-conn-nonbearing": (1, (17837, 9688, 17985, 9836)),
    # 3225_1.dxf (portfolio set, sheets S-6 to S-8): 268 wide cells, title under the drawing
    "slab-on-grade": (2, (7739, 378, 8007, 546)),
    "anchor-bolt-interrupting": (2, (7203, 198, 7471, 366)),
    "nonbearing-wall-base": (2, (7471, 198, 7739, 366)),
    "slab-joint": (2, (7203, 19, 7471, 187)),
    "wall-framing-keynotes": (2, (8403, 347, 8939, 535)),
    "wall-elevation-straps": (2, (8403, 183, 8939, 333)),
    "top-plate-splice-alt": (2, (8939, 347, 9207, 535)),
    "exterior-wall-1hr": (2, (8939, 183, 9207, 333)),
    "wsp-building-corner": (2, (8403, 19, 8671, 170)),
    "shear-wall-header": (2, (8671, 19, 8939, 170)),
    "rafter-cj-plate": (2, (9603, 378, 9871, 545)),
    "eave-shear-transfer": (2, (9871, 378, 10139, 545)),
    "gable-end-wall": (2, (10139, 378, 10407, 545)),
    "cj-lap": (2, (9871, 198, 10139, 366)),
    "sheathing-nailing": (2, (9860, 19, 10150, 188)),
}


# leftovers to cut out of a template, in its own coordinates: values drawn as strokes (PDF imports)
# that would otherwise show beside the calculated text
ERASE = {
    "shear-wall-section": [(345, 165, 395, 184), (309, 157, 320, 178), (309, 97, 318, 108)],
}


# details drawn as one block (whole cell): exploded so the parts are tested one by one
EXPLODE = {"wall-framing-keynotes"}
# keynote lists set in separate number / text columns: each TEXT stays its own note
NOMERGE = {"wall-framing-keynotes"}


def box_of(a):
    if len(a) == 4:
        return a
    x, y = a
    return (x - 75, y + 11, x + 237, y + 253)


R = lambda v: round(v, 2)


def explode(e, out, box):
    t = e.dxftype()
    if t in ("INSERT", "DIMENSION", "LEADER"):
        try:
            for v in e.virtual_entities():
                explode(v, out, box)
        except Exception:
            pass
        return
    x0, y0 = box[0], box[1]
    if t == "LINE":
        s, f = e.dxf.start, e.dxf.end
        out["lines"].append([R(s.x - x0), R(s.y - y0), R(f.x - x0), R(f.y - y0)])
    elif t == "CIRCLE":
        c = e.dxf.center
        out["circles"].append([R(c.x - x0), R(c.y - y0), R(e.dxf.radius)])
    elif t in ("SOLID", "TRACE"):
        q = [e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx3, e.dxf.vtx2]
        out["tris"].append([R(v) for p in (q[0], q[1], q[2]) for v in (p.x - x0, p.y - y0)])
        out["tris"].append([R(v) for p in (q[0], q[2], q[3]) for v in (p.x - x0, p.y - y0)])
    elif t in ("LWPOLYLINE", "POLYLINE", "ARC", "ELLIPSE", "SPLINE"):
        try:
            pts = list(path.make_path(e).flattening(0.15))
        except Exception:
            return
        for a, b in zip(pts, pts[1:]):
            out["lines"].append([R(a.x - x0), R(a.y - y0), R(b.x - x0), R(b.y - y0)])
    elif t == "HATCH":
        if e.dxf.solid_fill:
            for p in e.paths.rendering_paths(e.dxf.hatch_style):
                pts = [(v.x, v.y) for v in path.from_hatch_boundary_path(p).flattening(0.15)]
                try:
                    for tri in triangulation.mapbox_earcut_2d([ezdxf.math.Vec2(*v) for v in pts]):
                        out["tris"].append([R(c) for v in tri for c in (v.x - x0, v.y - y0)])
                except Exception:
                    pass
        else:
            try:
                for a, b in hatching.hatch_entity(e):
                    out["hatch"].append([R(a.x - x0), R(a.y - y0), R(b.x - x0), R(b.y - y0)])
            except Exception:
                pass
    elif t == "TEXT":
        ha, va = e.dxf.get("halign", 0), e.dxf.get("valign", 0)
        p = e.dxf.align_point if (ha or va) and e.dxf.hasattr("align_point") else e.dxf.insert
        out["texts"].append(
            dict(x=R(p.x - x0), y=R(p.y - y0), h=R(e.dxf.height), rot=R(e.dxf.get("rotation", 0)),
                 ha=min(ha, 2), va=va, s=e.plain_text().strip())
        )
    elif t == "MTEXT":
        h = e.dxf.char_height
        width = e.dxf.get("width", 0) or 0
        lines = []
        for para in e.plain_text().split("\n"):
            if width > 0:
                n = max(6, int(width / (0.85 * h)))
                words, cur = para.split(), ""
                for w in words:
                    if cur and len(cur) + 1 + len(w) > n:
                        lines.append(cur)
                        cur = w
                    else:
                        cur = f"{cur} {w}".strip()
                lines.append(cur)
            else:
                lines.append(para)
        lines = [l for l in lines if l.strip()] or [""]
        ls = 1.667 * h * e.dxf.get("line_spacing_factor", 1)
        ap = e.dxf.get("attachment_point", 1)
        ins = e.dxf.insert
        col, row = (ap - 1) % 3, (ap - 1) // 3
        y = ins.y - h if row == 0 else ins.y + (len(lines) - 1) * ls / 2 - h / 2 if row == 1 else ins.y + (len(lines) - 1) * ls
        out["blocks"].append(
            dict(x=R(ins.x - x0), y=R(y - y0), h=R(h), rot=R(e.get_rotation()), ha=col, ls=R(ls), lines=lines)
        )


def merge_texts(texts, merge=True):
    """single-line TEXT entities of one height and column, one under the other -> paragraph blocks"""
    blocks = []
    for t in sorted(texts, key=lambda t: (-t["y"], t["x"])):
        if (t["h"] >= 7.9 and t["y"] < 8) or t["y"] < 0 or t["h"] < 0.5:  # title lines below the cut, specks
            continue
        def follows(b):
            return (
                b["ha"] == 0 and t["ha"] == 0 and t["rot"] == 0 and b["rot"] == 0
                and abs(b["h"] - t["h"]) < 0.05 and abs(b["x"] - t["x"]) < 4.5 * t["h"]
                and 0 < b["y"] - (len(b["lines"]) - 1) * b["ls"] - t["y"] <= 2.3 * t["h"]
                and not re.match(r"^\d+-\s", t["s"])
            )
        b = next((b for b in reversed(blocks) if follows(b)), None) if merge else None
        if b:
            if len(b["lines"]) == 1:
                b["ls"] = R(b["y"] - t["y"])
            b["lines"].append(t["s"].strip())
        else:
            blocks.append(dict(x=t["x"], y=t["y"], h=t["h"], rot=t["rot"], ha=t["ha"], va=t["va"], ls=R(1.667 * t["h"]), lines=[t["s"]]))
    return blocks


def main(srcs, dst, only=None):
    docs = [ezdxf.readfile(s) for s in srcs]
    caches = [bbox.Cache() for _ in docs]
    out = {}
    if only:  # re-cut the named templates, keep the others
        with open(dst) as f:
            out = json.load(f)
    for tid, (fi, anchor) in CELLS.items():
        if only and tid not in only:
            continue
        msp, cache = docs[fi].modelspace(), caches[fi]
        box = box_of(anchor)
        W, H = box[2] - box[0], box[3] - box[1]
        acc = dict(lines=[], hatch=[], tris=[], circles=[], texts=[], blocks=[])
        def entities():
            for e in msp:
                b = bbox.extents([e], fast=True, cache=cache)
                if tid in EXPLODE and e.dxftype() == "INSERT" and b.has_data and (b.size.x > 0.9 * W or b.size.y > 0.9 * H):
                    try:  # a whole detail drawn as one block: test its parts one by one
                        yield from e.virtual_entities()
                        continue
                    except Exception:
                        pass
                yield e

        for e in entities():
            if e.dxftype() in ("POINT", "ATTDEF", "VIEWPORT", "IMAGE"):
                continue
            b = bbox.extents([e], fast=True)
            if not b.has_data:
                continue
            cx, cy = (b.extmin.x + b.extmax.x) / 2, (b.extmin.y + b.extmax.y) / 2
            if not (box[0] < cx < box[2] and box[1] < cy < box[3]):
                continue
            if b.size.x > 0.9 * W or b.size.y > 0.9 * H:  # sheet grid / cell borders
                continue
            if e.dxftype() not in ("TEXT", "MTEXT") and any(
                e0 < cx - box[0] < e1 and f0 < cy - box[1] < f1 for e0, f0, e1, f1 in ERASE.get(tid, [])
            ):
                continue
            explode(e, acc, box)
        blocks = acc["blocks"] + merge_texts(acc["texts"], tid not in NOMERGE)
        out[tid] = dict(w=R(W), h=R(H), lines=acc["lines"], hatch=acc["hatch"], tris=acc["tris"], circles=acc["circles"], blocks=blocks)
        print(tid, {k: len(v) for k, v in out[tid].items() if isinstance(v, list)})
    with open(dst, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    # extract-detail-templates.py 1CONNECTION.dxf 2CONNECTION.dxf 3225_1.dxf [out.json [id,id,...]]
    main(
        sys.argv[1:4],
        sys.argv[4] if len(sys.argv) > 4 else "src/lib/detailTemplates.json",
        set(sys.argv[5].split(",")) if len(sys.argv) > 5 else None,
    )
