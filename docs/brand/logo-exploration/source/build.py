#!/usr/bin/env python3
"""Build the TGS logo exploration: icons, wordmarks, lockups, gallery.

Usage:
    python3 build.py /path/to/fonts

The fonts folder must hold these Google Fonts files (all SIL OFL 1.1), named
as below. Download them from https://github.com/google/fonts/tree/main/ofl:
    cormorantgaramond.ttf  (ofl/cormorantgaramond/CormorantGaramond[wght].ttf)
    manrope.ttf            (ofl/manrope/Manrope[wght].ttf)
    sourceserif4.ttf       (ofl/sourceserif4/SourceSerif4[opsz,wght].ttf)
    spacegrotesk.ttf       (ofl/spacegrotesk/SpaceGrotesk[wght].ttf)
    fraunces.ttf           (ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf)

Text is converted to outlined paths, so the SVGs render without the fonts.
Needs fontTools (pip install fonttools). Kerning is not applied; spacing is
set by hand per wordmark.
"""
import colorsys
import html
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

# ---------------------------------------------------------------- palette

INK = "#0B1F3A"        # Deep Ink Navy
INK_DEEP = "#060F1D"   # dark-mode background
PAPER = "#F7F5F0"      # warm off-white
WHITE = "#FFFFFF"
BLACK = "#000000"
GOLD = "#C8A24A"       # Burnished Gold: on navy only, or large graphics


def _lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(hexc):
    h = hexc.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def darken_until(hexc, bgs, target):
    """Lower the lightness of hexc (same hue) until it meets target on all bgs."""
    h = hexc.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    while ll > 0:
        rr, gg, bb = colorsys.hls_to_rgb(hh, ll, ss)
        cand = "#%02X%02X%02X" % (round(rr * 255), round(gg * 255), round(bb * 255))
        if all(ratio(cand, bg) >= target for bg in bgs):
            return cand
        ll -= 0.005
    return "#000000"


GOLD_DEEP = darken_until(GOLD, [PAPER, WHITE], 4.6)   # gold text/borders on light
GOLD_MARK = darken_until(GOLD, [PAPER, WHITE], 3.0)   # gold graphics on light
MUTED = "#4A5A70"       # secondary text, light mode
MUTED_DARK = "#A7B2C4"  # secondary text, dark mode

PALETTE = [
    ("Deep Ink Navy", INK, "Primary: text, buttons, the mark on light"),
    ("Night Navy", INK_DEEP, "Dark-mode background"),
    ("Warm Paper", PAPER, "Light-mode background"),
    ("Burnished Gold", GOLD, "Accent on navy; large graphics only on light"),
    ("Deep Gold", GOLD_DEEP, "Gold text and borders on light backgrounds"),
    ("Mark Gold", GOLD_MARK, "Gold inside the logo on light backgrounds"),
    ("Slate", MUTED, "Secondary text, light mode"),
    ("Mist", MUTED_DARK, "Secondary text, dark mode"),
]

PAIRS = [
    # (foreground, background, label, use)
    (INK, PAPER, "Ink on Paper", "body text, light"),
    (INK, WHITE, "Ink on white", "body text on white cards"),
    (WHITE, INK, "White on Ink", "primary button text"),
    (PAPER, INK_DEEP, "Paper on Night", "body text, dark"),
    (PAPER, INK, "Paper on Ink", "text on navy panels"),
    (GOLD, INK, "Gold on Ink", "gold text on navy"),
    (GOLD, INK_DEEP, "Gold on Night", "gold text, dark mode"),
    (INK_DEEP, GOLD, "Night on Gold", "text on a gold badge"),
    (GOLD_DEEP, PAPER, "Deep Gold on Paper", "gold text, light"),
    (GOLD_DEEP, WHITE, "Deep Gold on white", "gold text on white cards"),
    (MUTED, PAPER, "Slate on Paper", "secondary text, light"),
    (MUTED_DARK, INK_DEEP, "Mist on Night", "secondary text, dark"),
    (GOLD, PAPER, "Gold on Paper", "DO NOT use for text"),
    (GOLD, WHITE, "Gold on white", "DO NOT use for text"),
]


def grade(r):
    if r >= 7:
        return "AAA"
    if r >= 4.5:
        return "AA"
    if r >= 3:
        return "AA large only"
    return "Fail"


VARIANTS = {
    "light": {"ink": INK, "accent": GOLD_MARK, "accentText": GOLD_DEEP, "bg": PAPER},
    "dark": {"ink": PAPER, "accent": GOLD, "accentText": GOLD, "bg": INK_DEEP},
    "mono-navy": {"ink": INK, "accent": INK, "accentText": INK, "bg": PAPER},
    "mono-white": {"ink": WHITE, "accent": WHITE, "accentText": WHITE, "bg": INK},
    "mono-black": {"ink": BLACK, "accent": BLACK, "accentText": BLACK, "bg": WHITE},
}

# ---------------------------------------------------------------- fonts

FONT_SPECS = {
    "cormorant": ("cormorantgaramond.ttf", {"wght": 600}),
    "manrope6": ("manrope.ttf", {"wght": 600}),
    "manrope7": ("manrope.ttf", {"wght": 700}),
    "sserif": ("sourceserif4.ttf", {"wght": 600, "opsz": 48}),
    "grotesk7": ("spacegrotesk.ttf", {"wght": 700}),
    "grotesk5": ("spacegrotesk.ttf", {"wght": 500}),
    "fraunces": ("fraunces.ttf", {"wght": 600, "opsz": 72, "SOFT": 0, "WONK": 0}),
}
_FONTS = {}
FONT_DIR = None


def font(key):
    if key not in _FONTS:
        fn, loc = FONT_SPECS[key]
        f = TTFont(os.path.join(FONT_DIR, fn))
        if "fvar" in f:
            full = {a.axisTag: a.defaultValue for a in f["fvar"].axes}
            full.update(loc)
            f = instantiateVariableFont(f, full)
        _FONTS[key] = f
    return _FONTS[key]


class Mark:
    """A list of filled shapes with known bounds, in user units."""

    def __init__(self):
        self.items = []  # (svg string with {role} fill placeholder, bounds)

    def add(self, svg, bounds):
        self.items.append((svg, bounds))

    def bounds(self):
        xs0, ys0, xs1, ys1 = zip(*[b for _, b in self.items])
        return min(xs0), min(ys0), max(xs1), max(ys1)


def text(mark, key, s, size, x, baseline, role="ink", tracking=0.0):
    """Outline s into mark; return the x after the last glyph's advance."""
    f = font(key)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    sc = size / upm
    pen = SVGPathPen(gs)
    bp = BoundsPen(gs)
    for i, ch in enumerate(s):
        gn = cmap[ord(ch)]
        t = (sc, 0, 0, -sc, x, baseline)
        gs[gn].draw(TransformPen(pen, t))
        gs[gn].draw(TransformPen(bp, t))
        x += f["hmtx"][gn][0] * sc
        if i < len(s) - 1:
            x += tracking * size
    d = pen.getCommands()
    if bp.bounds:
        mark.add('<path fill="{%s}" d="%s"/>' % (role, d), bp.bounds)
    return x


def measure(key, s, size, tracking=0.0):
    m = Mark()
    end = text(m, key, s, size, 0, 0, tracking=tracking)
    x0, y0, x1, y1 = m.bounds()
    return end, (x0, y0, x1, y1)


def rect(mark, x, y, w, h, role="ink"):
    mark.add('<rect fill="{%s}" x="%g" y="%g" width="%g" height="%g"/>' % (role, x, y, w, h),
             (x, y, x + w, y + h))


def circle(mark, cx, cy, r, role="ink"):
    mark.add('<circle fill="{%s}" cx="%g" cy="%g" r="%g"/>' % (role, cx, cy, r),
             (cx - r, cy - r, cx + r, cy + r))


def render(mark, variant, pad=0.06, title="", square=None, height=None):
    cols = VARIANTS[variant]
    if square:
        x0, y0, x1, y1 = square
    else:
        x0, y0, x1, y1 = mark.bounds()
        p = (y1 - y0) * pad
        x0, y0, x1, y1 = x0 - p, y0 - p, x1 + p, y1 + p
    w, h = x1 - x0, y1 - y0
    if height:
        attrs = 'width="%g" height="%g"' % (round(height * w / h, 1), height)
    else:
        attrs = ""
    body = "".join(s.format(**cols) for s, _ in mark.items)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%g %g %g %g" %s role="img">'
            '<title>%s</title>%s</svg>' % (round(x0, 2), round(y0, 2), round(w, 2), round(h, 2),
                                           attrs, html.escape(title), body))


# ---------------------------------------------------------------- icons (64 x 64 grid)

def icon_compass():
    m = Mark()
    # G as a bearing ring: r=20, stroke 7, open at the upper right
    m.add('<path fill="none" stroke="{ink}" stroke-width="7" d="M47.76 19.69A20 20 0 1 0 52 32"/>',
          (8.5, 8.5, 55.5, 55.5))
    rect(m, 40, 28.5, 15.5, 7)               # crossbar
    circle(m, 32, 32, 4.5, "accent")         # the aim point
    rect(m, 30.25, 1.5, 3.5, 5.5)            # north tick
    rect(m, 1.5, 30.25, 5.5, 3.5)            # west tick
    rect(m, 30.25, 57, 3.5, 5.5)             # south tick
    return m


def icon_apex():
    m = Mark()
    apex, mids, bots = (32, 12), [(19, 34), (45, 34)], [(8, 54), (32, 54), (56, 54)]
    edges = [(apex, mids[0]), (apex, mids[1]), (mids[0], bots[0]), (mids[0], bots[1]),
             (mids[1], bots[1]), (mids[1], bots[2])]
    for (a, b) in edges:
        m.add('<line stroke="{ink}" stroke-width="3.5" x1="%g" y1="%g" x2="%g" y2="%g"/>'
              % (a[0], a[1], b[0], b[1]), (min(a[0], b[0]), min(a[1], b[1]),
                                           max(a[0], b[0]), max(a[1], b[1])))
    for (x, y) in mids + bots:
        circle(m, x, y, 6)
    circle(m, apex[0], apex[1], 8.5, "accent")
    return m


def icon_knight():
    m = Mark()
    body = [(20, 47), (23, 38), (29, 31), (21, 33.5), (15, 31.5), (13, 26), (22, 16), (28, 12),
            (31, 5), (35, 10.5), (41, 13.5), (47, 21), (50, 31), (48.5, 40), (46, 47)]
    d = "M" + " L".join("%g %g" % p for p in body) + " Z"
    d += " M32.5 17.5 L38 18.5 L34 21.5 Z"   # eye, cut out so it survives one colour
    m.add('<path fill="{ink}" fill-rule="evenodd" d="%s"/>' % d, (13, 5, 50, 47))
    rect(m, 14, 50.5, 36, 7, "accent")       # gold base
    return m


def icon_pillar():
    m = Mark()
    import math
    # a laurel wreath, open at the top: pointed leaves along an arc, tilted outwards
    cx, cy, r = 32, 12.5, 10.5
    for a in (112, 144, 176, 208):
        rad = math.radians(a)
        x, y = cx + r * math.cos(rad), cy + r * math.sin(rad)
        rot = a + 90 - 28
        for sx, sr in ((x, rot), (64 - x, 180 - rot)):
            leaf = "M-5.5 0 Q0 -3.2 5.5 0 Q0 3.2 -5.5 0Z"
            m.add('<path fill="{accent}" transform="translate(%.2f %.2f) rotate(%.1f)" d="%s"/>'
                  % (sx, y, sr, leaf), (sx - 5.5, y - 5.5, sx + 5.5, y + 5.5))
    rect(m, 14, 26.5, 36, 5)                 # capital
    for x in (19, 29, 39):
        rect(m, x, 33.5, 6, 16.5)            # three flutes
    rect(m, 12, 52, 40, 6)                   # base
    return m


def icon_glass():
    m = Mark()
    rect(m, 14, 5, 36, 6)
    rect(m, 14, 53, 36, 6)
    m.add('<path fill="{ink}" d="M18 14 H46 L34.5 30.5 H29.5 Z"/>', (18, 14, 46, 30.5))
    m.add('<path fill="none" stroke="{ink}" stroke-width="3" stroke-linejoin="miter" '
          'd="M30 34 L18.5 49.5 H45.5 L34 34"/>', (17, 33, 47, 51))
    rect(m, 31, 31, 2, 9.5, "accent")       # the falling grain
    m.add('<path fill="{accent}" d="M23 48 H41 L32 40.5 Z"/>', (23, 40.5, 41, 48))
    return m


ICONS = [
    ("icon-01", "Bearing G", icon_compass,
     "A G drawn as a bearing ring with a gold aim point at its centre: direction and calculated aim."),
    ("icon-02", "Apex", icon_apex,
     "Many linked navy voices resolve into one gold node at the top: one Grand Strategist from many."),
    ("icon-03", "Knight", icon_knight,
     "The one piece that moves around the board rather than through it, cut to straight lines."),
    ("icon-04", "Laurel column", icon_pillar,
     "A fluted column under a laurel crown: classical rigour, and the single winner's honour."),
    ("icon-05", "Campaign glass", icon_glass,
     "An hourglass with gold settling at the base: time-boxed Campaigns and what they leave behind."),
]

# ---------------------------------------------------------------- wordmarks

def wm_editorial():
    m = Mark()
    text(m, "cormorant", "The Grand Strategist", 64, 0, 0, tracking=0.005)
    return m


def wm_caps():
    m = Mark()
    text(m, "manrope6", "THE GRAND STRATEGIST", 40, 0, 0, tracking=0.2)
    return m


def wm_tier():
    m = Mark()
    big_end, (bx0, by0, bx1, by1) = measure("sserif", "GRAND STRATEGIST", 48, 0.05)
    text(m, "sserif", "GRAND STRATEGIST", 48, 0, 0, tracking=0.05)
    the_size = 15
    t_end, (tx0, ty0, tx1, ty1) = measure("manrope7", "THE", the_size, 0.45)
    tw = tx1 - tx0
    cx = (bx0 + bx1) / 2
    base = by0 - 14            # baseline of THE, above the caps
    text(m, "manrope7", "THE", the_size, cx - tw / 2 - tx0, base, role="accentText", tracking=0.45)
    mid = base + (ty0 + ty1) / 2   # vertical centre of THE
    gap = 14
    rect(m, bx0, mid - 0.75, (cx - tw / 2 - gap) - bx0, 1.5)
    rect(m, cx + tw / 2 + gap, mid - 0.75, bx1 - (cx + tw / 2 + gap), 1.5)
    return m


def wm_tgs():
    m = Mark()
    size = 104
    end = text(m, "grotesk7", "TGS", size, 0, 0, tracking=0.0)
    r = size * 0.085
    circle(m, end + r * 1.2, -r, r, "accent")
    x0, y0, x1, y1 = m.bounds()
    width = x1 - x0
    sub = "THE GRAND STRATEGIST"
    _, (sx0, sy0, sx1, sy1) = measure("grotesk5", sub, 10, 0.22)
    s = 10 * width / (sx1 - sx0)
    _, (sx0, sy0, sx1, sy1) = measure("grotesk5", sub, s, 0.22)
    text(m, "grotesk5", sub, s, x0 - sx0, (sy1 - sy0) + 20, tracking=0.22)
    return m


def wm_mixed():
    m = Mark()
    x = text(m, "fraunces", "G", 68, 0, 0, role="accentText")
    x = text(m, "fraunces", "rand", 68, x, 0)
    x += 68 * 0.24
    text(m, "manrope6", "Strategist", 60, x, 0, tracking=-0.01)
    return m


WORDMARKS = [
    ("wordmark-01", "Editorial serif", wm_editorial, "Cormorant Garamond SemiBold",
     "One line of high-contrast serif, like a journal masthead: calm, established, editorial."),
    ("wordmark-02", "Spaced caps", wm_caps, "Manrope SemiBold",
     "Widely spaced geometric capitals: institutional and modern, and plain enough to read at any size."),
    ("wordmark-03", "Two-tier", wm_tier, "Source Serif 4 SemiBold + Manrope Bold",
     "Small gold THE between rules over serif capitals: a title-page lockup for formal use."),
    ("wordmark-04", "TGS short form", wm_tgs, "Space Grotesk Bold + Medium",
     "A compact TGS with a gold full stop and the name beneath: survives avatars and app icons."),
    ("wordmark-05", "Grand meets Strategist", wm_mixed, "Fraunces SemiBold + Manrope SemiBold",
     "Serif Grand meets sans Strategist, with a gold G: tradition and modern thinking in one name."),
]

# ---------------------------------------------------------------- lockups

def lockup(icon_fn, wm_fn, icon_scale):
    """Icon left, wordmark right, both vertically centred."""
    wm = wm_fn()
    x0, y0, x1, y1 = wm.bounds()
    wh = y1 - y0
    ih = wh * icon_scale
    k = ih / 64
    cy = (y0 + y1) / 2
    gap = ih * 0.38
    ix = x0 - gap - ih
    iy = cy - ih / 2
    ic = icon_fn()
    m = Mark()
    inner = "".join(s for s, _ in ic.items)
    m.add('<g transform="translate(%g %g) scale(%g)">%s</g>' % (ix, iy, k, inner),
          (ix, iy, ix + ih, iy + ih))
    for it in wm.items:
        m.add(*it)
    return m


LOCKUPS = [
    ("lockup-01", "icon-02", "wordmark-03", icon_apex, wm_tier, 1.15,
     "Apex + Two-tier: the formal pairing. The gold node and the gold THE carry the same idea."),
    ("lockup-02", "icon-01", "wordmark-02", icon_compass, wm_caps, 1.9,
     "Bearing G + Spaced caps: the modern pairing, cleanest in a narrow header."),
    ("lockup-03", "icon-02", "wordmark-01", icon_apex, wm_editorial, 1.25,
     "Apex + Editorial serif: the warmer, more literary pairing."),
]

# ---------------------------------------------------------------- write files

def write(path, s):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(s + "\n")


def main():
    global FONT_DIR
    FONT_DIR = sys.argv[1]
    out_svgs = {}

    for key, name, fn, _ in ICONS:
        for v in VARIANTS:
            svg = render(fn(), v, title="The Grand Strategist: %s" % name, square=(0, 0, 64, 64))
            out_svgs[(key, v)] = svg
            write(os.path.join(OUT, "icons", "%s-%s.svg" % (key, v)), svg)
        write(os.path.join(OUT, "icons", key + ".svg"), out_svgs[(key, "light")])

    for key, name, fn, _, _ in WORDMARKS:
        for v in VARIANTS:
            svg = render(fn(), v, title="The Grand Strategist")
            out_svgs[(key, v)] = svg
            write(os.path.join(OUT, "wordmarks", "%s-%s.svg" % (key, v)), svg)
        write(os.path.join(OUT, "wordmarks", key + ".svg"), out_svgs[(key, "light")])

    for key, _, _, ifn, wfn, sc, _ in LOCKUPS:
        for v in VARIANTS:
            svg = render(lockup(ifn, wfn, sc), v, pad=0.1, title="The Grand Strategist")
            out_svgs[(key, v)] = svg
            write(os.path.join(OUT, "lockups", "%s-%s.svg" % (key, v)), svg)

    write(os.path.join(OUT, "gallery.html"), gallery(out_svgs))
    write(os.path.join(HERE, "contrast.md"), contrast_md())
    print("Deep Gold", GOLD_DEEP, "Mark Gold", GOLD_MARK)
    print(contrast_md())


def contrast_md():
    rows = ["| Foreground | Background | Pair | Use | Ratio | WCAG |", "| --- | --- | --- | --- | --- | --- |"]
    for fg, bg, label, use in PAIRS:
        r = ratio(fg, bg)
        rows.append("| `%s` | `%s` | %s | %s | %.2f:1 | %s |" % (fg, bg, label, use, r, grade(r)))
    return "\n".join(rows)


def gallery(S):
    def strip(s):
        return s

    css = """
:root{--paper:%(paper)s;--ink:%(ink)s;--night:%(night)s;--gold:%(gold)s;--golddeep:%(gd)s;--muted:%(muted)s;--line:#DDD8CC}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0 0 4px} h2{font-size:21px;margin:48px 0 6px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:0} p.lede{color:var(--muted);margin:0 0 8px;max-width:70ch}
.why{color:var(--muted);font-size:14px;margin:4px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tile{border-radius:10px;display:flex;align-items:center;justify-content:center;padding:16px;min-width:0}
.tile.l{background:var(--paper);border:1px solid var(--line)} .tile.d{background:var(--night)} .tile.n{background:var(--ink)} .tile.w{background:#fff;border:1px solid var(--line)}
.big svg{width:100%%;max-width:150px;height:auto;display:block}
.wbig svg{width:100%%;height:auto;max-height:110px;display:block}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:stretch}
.row .tile{flex:1 1 0;padding:10px;flex-direction:column;gap:4px}
.cap{font-size:12px;color:var(--muted)} .d .cap,.n .cap{color:%(mutedd)s}
.s32 svg{width:32px;height:32px;display:block} .s16 svg{width:16px;height:16px;display:block}
.h32 svg{height:32px;width:auto;max-width:100%%;display:block} .h16 svg{height:16px;width:auto;max-width:100%%;display:block}
.mono svg{width:44px;height:44px;display:block} .wmono svg{height:26px;width:auto;max-width:100%%;display:block}
.sizes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.sizes .tile{gap:14px;justify-content:flex-start;padding:10px 14px}
.lock .tile{padding:22px} .lock svg{width:100%%;height:auto;max-height:90px;display:block}
.lock .h32 svg{height:32px;width:auto;max-width:100%%;max-height:none} .lock .h16 svg{height:16px;width:auto;max-width:100%%;max-height:none}
table{border-collapse:collapse;width:100%%;font-size:14px;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.tablewrap{overflow-x:auto}
.sw{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.chip{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.chip .c{height:56px} .chip div.t{padding:8px 10px;font-size:13px} .chip b{display:block}
.demo{display:inline-block;padding:2px 8px;border-radius:6px;font-weight:600}
.fail{color:#9B1C1C;font-weight:600}
code{font-size:13px}
@media (max-width:520px){.grid{grid-template-columns:1fr}.sizes{grid-template-columns:1fr}}
""" % {"paper": PAPER, "ink": INK, "night": INK_DEEP, "gold": GOLD, "gd": GOLD_DEEP,
       "muted": MUTED, "mutedd": MUTED_DARK}

    h = ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>TGS logo exploration</title><style>%s</style></head><body><main>' % css,
         '<h1>The Grand Strategist: logo exploration</h1>',
         '<p class="lede">Five icons, five wordmarks and three lockups. Every file is a hand-built SVG with '
         'text converted to outlines. Each is shown on light and dark, at large size, 32px and 16px, and in '
         'one flat colour (navy, white, black). Nothing here is applied to the app.</p>']

    # palette
    h.append('<h2>Palette</h2><p class="why">Burnished Gold is for navy backgrounds and large graphics only. '
             'On light backgrounds, gold text and borders use Deep Gold, and gold inside the logo uses Mark Gold.</p>')
    h.append('<div class="sw">')
    for name, hexc, use in PALETTE:
        h.append('<div class="chip"><div class="c" style="background:%s"></div><div class="t"><b>%s</b>'
                 '<code>%s</code><br>%s</div></div>' % (hexc, name, hexc, use))
    h.append('</div><h3 style="margin:20px 0 8px">Contrast (WCAG 2.2)</h3><div class="tablewrap"><table>'
             '<tr><th>Sample</th><th>Pair</th><th>Use</th><th>Ratio</th><th>Result</th></tr>')
    for fg, bg, label, use in PAIRS:
        r = ratio(fg, bg)
        g = grade(r)
        cls = ' class="fail"' if g in ("Fail", "AA large only") else ""
        h.append('<tr><td><span class="demo" style="color:%s;background:%s;border:1px solid var(--line)">Aa</span></td>'
                 '<td>%s<br><code>%s</code> on <code>%s</code></td><td>%s</td><td>%.2f:1</td><td%s>%s</td></tr>'
                 % (fg, bg, label, fg, bg, use, r, cls, g))
    h.append('</table></div>')

    # icons
    h.append('<h2>Icons</h2><p class="why">Square marks on a 64-unit grid. Top: light and dark. '
             'Middle: one flat colour. Bottom: real favicon sizes.</p><div class="grid">')
    for key, name, _, why in ICONS:
        h.append('<div class="card"><h3>%s · %s</h3><p class="why">%s</p>' % (key, name, html.escape(why)))
        h.append('<div class="pair"><div class="tile l big">%s</div><div class="tile d big">%s</div></div>'
                 % (S[(key, "light")], S[(key, "dark")]))
        h.append('<div class="row"><div class="tile w mono">%s<span class="cap">Navy</span></div>'
                 '<div class="tile n mono">%s<span class="cap">White</span></div>'
                 '<div class="tile w mono">%s<span class="cap">Black</span></div></div>'
                 % (S[(key, "mono-navy")], S[(key, "mono-white")], S[(key, "mono-black")]))
        h.append('<div class="sizes"><div class="tile l"><span class="s32">%s</span><span class="s16">%s</span>'
                 '<span class="cap">32 · 16 light</span></div><div class="tile d"><span class="s32">%s</span>'
                 '<span class="s16">%s</span><span class="cap">32 · 16 dark</span></div></div></div>'
                 % (S[(key, "light")], S[(key, "light")], S[(key, "dark")], S[(key, "dark")]))
    h.append('</div>')

    # wordmarks
    h.append('<h2>Wordmarks</h2><p class="why">Free Google Fonts (SIL OFL 1.1), outlined to paths. '
             'Small sizes are set by height: 32px and 16px tall.</p><div class="grid">')
    for key, name, _, fonts, why in WORDMARKS:
        h.append('<div class="card"><h3>%s · %s</h3><p class="why">%s<br><i>%s</i></p>'
                 % (key, name, html.escape(why), fonts))
        h.append('<div class="tile l wbig">%s</div><div class="tile d wbig" style="margin-top:8px">%s</div>'
                 % (S[(key, "light")], S[(key, "dark")]))
        h.append('<div class="row"><div class="tile w wmono">%s<span class="cap">Navy</span></div>'
                 '<div class="tile n wmono">%s<span class="cap">White</span></div>'
                 '<div class="tile w wmono">%s<span class="cap">Black</span></div></div>'
                 % (S[(key, "mono-navy")], S[(key, "mono-white")], S[(key, "mono-black")]))
        h.append('<div class="sizes"><div class="tile l" style="flex-direction:column;align-items:flex-start">'
                 '<span class="h32">%s</span><span class="h16">%s</span><span class="cap">32px · 16px tall</span></div>'
                 '<div class="tile d" style="flex-direction:column;align-items:flex-start"><span class="h32">%s</span>'
                 '<span class="h16">%s</span><span class="cap">32px · 16px tall</span></div></div></div>'
                 % (S[(key, "light")], S[(key, "light")], S[(key, "dark")], S[(key, "dark")]))
    h.append('</div>')

    # lockups
    h.append('<h2>Best three lockups</h2><p class="why">Icon and wordmark side by side, as they would sit in the '
             'site header.</p>')
    for key, ik, wk, _, _, _, why in LOCKUPS:
        h.append('<div class="card lock" style="margin-bottom:16px"><h3>%s · %s + %s</h3><p class="why">%s</p>'
                 % (key, ik, wk, html.escape(why)))
        h.append('<div class="pair"><div class="tile l">%s</div><div class="tile d">%s</div></div>'
                 % (S[(key, "light")], S[(key, "dark")]))
        h.append('<div class="sizes"><div class="tile l" style="flex-direction:column;align-items:flex-start">'
                 '<span class="h32">%s</span><span class="h16">%s</span><span class="cap">32px · 16px tall</span></div>'
                 '<div class="tile n" style="flex-direction:column;align-items:flex-start"><span class="h32">%s</span>'
                 '<span class="h16">%s</span><span class="cap">One colour white, 32px · 16px</span></div></div></div>'
                 % (S[(key, "light")], S[(key, "light")], S[(key, "mono-white")], S[(key, "mono-white")]))
    h.append('<p class="why">Source: <code>source/build.py</code> regenerates every file here. '
             'See <code>README.md</code> for the recommendation.</p></main></body></html>')
    return "\n".join(h)


if __name__ == "__main__":
    main()
