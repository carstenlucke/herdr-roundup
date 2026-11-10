# Draws the Herdr-Roundup window as an SVG, with made-up spaces, agents, terminals and files:
# no one's real spaces, paths or sessions. Sizes come from layouts/Herdr-Roundup.json and
# the roundup- mods, colors from the graphite theme. The active tab has Claude Code (working) on
# the left, Codex (done) above a shell on the right, the side panel shows roundup-files (with a symlink, AGENTS.md), and roundup-preview's floating window shows the
# project's README. Run from the repo:
#   python3 scripts/preview.py . layouts/Herdr-Roundup.svg
#   rsvg-convert -z 2 layouts/Herdr-Roundup.svg -o preview.png
# Settings shows the SVG: the bare window, as it is without a scene (or with the scene "window").
# README.md and RECIPE.md show the PNG, drawn from the poster instead:
#   python3 scripts/preview.py . /tmp/poster.svg poster && rsvg-convert -z 2 /tmp/poster.svg -o preview.png
# The poster puts the window beside name, claim and the main features (FEATURES), the sheep sunk
# into the background above it; its window shows the quicklook card of search-filters' agents. assets/logo-mark.png is assets/logo.png in grey, 480px, 8 colors;
# a filter turns its dark wool into the light mark. "poster" is no scene: --scenes leaves it out.
# A third argument draws one of the scenes the project's site shows instead, cropped to what it
# is about (scripts/site.sh renders them all): SCENES below names them, CROPS at the end crops
# them. `python3 scripts/preview.py --scenes` prints their names.
import base64, json, os, re, sys
from html import escape

SCENES = ["spaces", "quicklook", "files", "files-changed", "search", "symlink", "pane-header", "rename",
          "close-menu", "close-confirm", "update", "preview-tab", "float"]
if sys.argv[1:] == ["--scenes"]:
    print("\n".join(SCENES))
    sys.exit()
REPO, OUT = sys.argv[1], sys.argv[2]
# "poster": the bare window in its poster, for preview.png. No scene: the bare window, Settings' preview.
POSTER = sys.argv[3:4] == ["poster"]
SCENE = sys.argv[3] if len(sys.argv) > 3 and not POSTER else "window"
if SCENE != "window" and SCENE not in SCENES:
    sys.exit(f"preview.py: unknown scene {SCENE!r}; the scenes are: window, {', '.join(SCENES)}")
LAYOUT = json.load(open(f"{REPO}/layouts/Herdr-Roundup.json"))
VERSION = LAYOUT["version"]
# Program icons come from the install, as Herdr draws them.
HOME = os.environ.get("HERDR_APP_HOME", os.path.expanduser("~/.config/herdr-app"))
# Scenes about one pane draw a smaller window, so their crop needs less scaling down on the site.
W, H = {"float": (1440, 900), "preview-tab": (1440, 900)}.get(SCENE, (1920, 1200))

T = {
    "accent": "#96b2d7", "background": "#17191d", "blocked": "#f0705f", "border": "#ffffff18",
    "canvas": "#131518", "chrome": "#101114", "dim": "#696a6d", "done": "#76a8ff",
    "foreground": "#eeeeef", "hover": "#ffffff0e", "muted": "#98999b", "selected": "#ffffff17",
    "terminal": "#d2d4d9", "working": "#e5c07b", "raised": "#2c2e31",
    "popover": "#25272b", "input": "#ffffff24", "solid": "#eeeeef", "solid-foreground": "#111215",
    "ansi1": "#dc8c95", "ansi2": "#a6bd91", "ansi3": "#d8be87", "ansi4": "#96b2d7",
    "ansi5": "#b5a2ce", "ansi6": "#8cbdc3", "ansi8": "#818793",
}
UI = "Helvetica Neue, Helvetica, Arial, sans-serif"
MONO = "JetBrains Mono, JetBrainsMono NFM, Menlo, monospace"

ICON = {
    "branch": '<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="7.5" r="2"/><path d="M6 7.5v9M18 9.5c0 4.5-6.5 3.5-11 7.5"/>',
    "folder": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "plus": '<path d="M5 12h14M12 5v14"/>',
    "monitor": '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8.5 20h7M12 16v4"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "files": '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    "compare": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    "sidebar": '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9.5 4v16"/>',
    "settings": '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    "bot": '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>',
    "close": '<path d="M18 6 6 18M6 6l12 12"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    # roundup-files' link.svg: the arrow after a symlink's name.
    "link": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    # roundup-preview's own icons (toc.svg and more.svg drawn at 16, here at 24).
    "toc": '<path d="M3.75 6h16.5M7.5 12h12.75M7.5 18h12.75"/>',
    "more": '<circle cx="5.25" cy="12" r="1.95" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.95" fill="currentColor" stroke="none"/><circle cx="18.75" cy="12" r="1.95" fill="currentColor" stroke="none"/>',
    "to-tab": '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M9 5v5"/>',
    # roundup-workspace-chrome's menu icons, and Lucide's square-pen for the tab menu's Rename.
    "refresh": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    "agent": '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    "notes": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    "skip": '<circle cx="12" cy="12" r="10"/><path d="m9 15 6-6"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "square-pen": '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
}
# roundup-pane's and roundup-preview's own icons, drawn on a 16px grid.
ICON16 = {
    "rename": '<path d="M10.5 3.2l2.3 2.3L6 12.3l-2.9.6.6-2.9z"/><path d="M9.2 4.5l2.3 2.3"/>',
    "split-right": '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/>',
    "split-down": '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 8h12"/>',
    "zoom": '<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/>',
    "x": '<path d="M4 4l8 8M12 4l-8 8"/>',
    "collapse": '<path d="M5 2.5l3 3 3-3M5 13.5l3-3 3 3"/>',
}

# Helvetica's widths (1/1000 em) for placing text that follows other text.
_HW = dict(zip(" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278] + [556] * 10 +
    [278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
     722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
     556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
     278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]))

def tw(s, size, weight=400):
    return sum(_HW.get(ch, 556) for ch in s) * size / 1000 * (1.05 if weight >= 600 else 1.02 if weight >= 500 else 1)

def mw(s, size):
    """A monospaced text's width: JetBrains Mono advances 0.6 em."""
    return len(s) * size * 0.6

out = []
def add(s): out.append(s)

def paint(c):
    """A color as fill and opacity: #rrggbbaa isn't drawn everywhere."""
    c = T.get(c, c)
    if len(c) == 9:
        return c[:7], int(c[7:], 16) / 255
    return c, 1.0

def r(v):
    return round(v, 1)

def rect(x, y, w, h, fill, rx=0, op=None, stroke=None):
    f, o = paint(fill)
    o = o if op is None else op
    s = ""
    if stroke:
        sc, so = paint(stroke)
        s = f' stroke="{sc}" stroke-opacity="{so:.3f}" stroke-width="1"'
    fo = f' fill-opacity="{o:.3f}"' if o < 1 else ""
    add(f'<rect x="{r(x)}" y="{r(y)}" width="{r(w)}" height="{r(h)}" rx="{rx}" fill="{f}"{fo}{s}/>')

def frame(x, y, w, h, stroke, rx=0):
    sc, so = paint(stroke)
    add(f'<rect x="{r(x + .5)}" y="{r(y + .5)}" width="{r(w - 1)}" height="{r(h - 1)}" rx="{rx}" fill="none" stroke="{sc}" stroke-opacity="{so:.3f}"/>')

def line(x1, y1, x2, y2, color):
    c, o = paint(color)
    add(f'<path d="M{r(x1)} {r(y1)}L{r(x2)} {r(y2)}" stroke="{c}" stroke-opacity="{o:.3f}" stroke-width="1"/>')

def text(x, y, s, size=13, fill="foreground", weight=400, anchor="start", family=UI, spaces=False, italic=False):
    c, o = paint(fill)
    fo = f' fill-opacity="{o:.3f}"' if o < 1 else ""
    ws = ' xml:space="preserve"' if spaces else ""
    it = ' font-style="italic"' if italic else ""
    add(f'<text x="{r(x)}" y="{r(y)}" font-family="{family}" font-size="{size}" font-weight="{weight}"{it} fill="{c}"{fo} text-anchor="{anchor}"{ws}>{escape(s)}</text>')

def spans(x, y, parts, size=13, family=MONO):
    """One line of text in several colors: [(text, color, weight), ...]."""
    inner = "".join(
        f'<tspan fill="{paint(c)[0]}" font-weight="{w}">{escape(s)}</tspan>' for s, c, w in parts)
    add(f'<text x="{r(x)}" y="{r(y)}" font-family="{family}" font-size="{size}" xml:space="preserve">{inner}</text>')

def icon(name, x, y, size, color, sw=1.5):
    c, o = paint(color)
    k = size / (16 if name in ICON16 else 24)
    add(f'<g transform="translate({r(x)} {r(y)}) scale({k:.4f})" fill="none" stroke="{c}" stroke-opacity="{o:.3f}" '
        f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" color="{c}">{ICON16.get(name) or ICON[name]}</g>')

# Herdr's program table (built into the app): tint true is a one-color glyph drawn in the
# text color, tint false a picture drawn as it is.
PROGRAM = {"claude": False, "codex": False, "pi": True, "shell": True, "vite": True}

def program(key, x, y, size, color):
    src = open(f"{HOME}/icons/{key}.svg").read()
    src = re.sub(r"<\?xml[^>]*>\s*", "", src)
    if PROGRAM[key]:
        c = paint(color)[0]
        src = re.sub(r'(fill|stroke)="(?!none)[^"]*"', rf'\1="{c}"', src)
        src = src.replace("currentColor", c)
        if not re.search(r'<svg[^>]*\sfill=', src):
            src = src.replace("<svg", f'<svg fill="{c}"', 1)
    data = base64.b64encode(src.encode()).decode()
    add(f'<image x="{r(x)}" y="{r(y)}" width="{size}" height="{size}" href="data:image/svg+xml;base64,{data}"/>')

# roundup-files' icons (Symbols), picked as its icon.js does; they carry their own colors.
_src = open(f"{REPO}/mods/roundup-files/icons.js").read()
ICONS = json.loads(_src[_src.index("export default ") + 15:].strip().rstrip(";"))

def icon_for(rel, folder, open_):
    parts = [p for p in rel.lower().split("/") if p]
    name = parts[-1] if parts else ""
    def find(table):
        for i in range(len(parts) - 1):
            if "/".join(parts[i:]) in table:
                return table["/".join(parts[i:])]
        return table.get(name)
    if folder:
        return (open_ and find(ICONS["folderNamesExpanded"])) or find(ICONS["folderNames"]) or \
            (ICONS["folderExpanded"] if open_ else ICONS["folder"])
    found = find(ICONS["fileNames"])
    exts = [name] + [name[i + 1:] for i, ch in enumerate(name) if ch == "."]
    for e in exts:
        found = found or ICONS["fileExtensions"].get(e)
    return found or ICONS["file"]

def file_icon(id_, x, y, size, op=1.0):
    data = base64.b64encode(open(f"{REPO}/mods/roundup-files/icons/{id_}.svg", "rb").read()).decode()
    o = f' opacity="{op}"' if op < 1 else ""
    add(f'<image x="{r(x)}" y="{r(y)}" width="{size}" height="{size}"{o} href="data:image/svg+xml;base64,{data}"/>')

def avatar(x, y, letter, color):
    rect(x, y, 22, 22, color, rx=6, op=0x2e / 255)  # dark themes tint with alpha 2e
    text(x + 11, y + 15.2, letter, 11.5, color, 700, "middle")

def badge(right, cy, n, status):
    calm = status == "idle"
    color = "dim" if calm else status
    w = 6 + 11 + 4 + 7 + 6
    x = right - w
    if calm:
        rect(x, cy - 9, w, 18, "selected", rx=9)
    else:
        rect(x, cy - 9, w, 18, color, rx=9, op=0x26 / 255)
    icon("bot", x + 6, cy - 5.5, 11, color, sw=2)
    text(x + 6 + 11 + 4, cy + 4, str(n), 11, color, 600)

def spinner(cx, cy, color, radius=4.5):
    c, _ = paint(color)
    add(f'<circle cx="{r(cx)}" cy="{r(cy)}" r="{radius}" fill="none" stroke="{paint("raised")[0]}" stroke-width="1.5"/>')
    add(f'<path d="M{r(cx)} {r(cy - radius)}a{radius} {radius} 0 0 1 {radius} {radius}" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>')

def clip_since(mark, x, y, w, h, rx=0):
    """Clips what was drawn since out[mark] to a box, as a list scrolls in its section. Only
    when needed: a window tall enough draws nothing extra (the default picture stays as it is)."""
    cid = f"clip{len(out)}"
    out.insert(mark, f'<defs><clipPath id="{cid}"><rect x="{r(x)}" y="{r(y)}" width="{r(w)}" height="{r(h)}" rx="{rx}"/></clipPath></defs><g clip-path="url(#{cid})">')
    add('</g>')

# ---- window ----
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add(f'<defs><clipPath id="win"><rect width="{W}" height="{H}" rx="12"/></clipPath>'
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter></defs>')
add('<g clip-path="url(#win)">')
rect(0, 0, W, H, "canvas")

# ---- sidebar (268px, chrome) ----
SB = 268
rect(0, 0, SB, H, "chrome")
line(SB + .5, 0, SB + .5, H, "border")

# Brand row, 46px: traffic lights at [12, 16], then the sheep, the name and its version, search and toggle.
for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
    add(f'<circle cx="{18 + 20 * i}" cy="22" r="6" fill="{c}"/>')
UPDATE = SCENE == "update"
if UPDATE:
    # The release the update scene offers: the next minor one. Only this scene needs it, so a
    # version of another shape can't stop the other pictures.
    _v = VERSION.split(".")
    NEXT = f"{_v[0]}.{int(_v[1]) + 1}.0"
second = f"{NEXT} available" if UPDATE else VERSION
if UPDATE:
    # The pointer rests on logo and name: their 36px area, rounded 8px, lights up.
    rect(70, 5, 104 - 70 + tw("Herdr Roundup", 13, 600) + 8, 36, "hover", rx=8)
logo = base64.b64encode(open(f"{REPO}/mods/roundup-workspace-chrome/logo.png", "rb").read()).decode()
add(f'<clipPath id="logo"><rect x="76" y="13" width="20" height="20" rx="5"/></clipPath>')
add(f'<image x="76" y="13" width="20" height="20" clip-path="url(#logo)" href="data:image/png;base64,{logo}"/>')
if UPDATE:
    # A newer release: a 10px accent point with a 2px chrome ring, 3px out from the logo's top right.
    add(f'<circle cx="94" cy="15" r="6" fill="{paint("chrome")[0]}"/><circle cx="94" cy="15" r="5" fill="{paint("accent")[0]}"/>')
text(104, 21.5, "Herdr Roundup", 13, "foreground", 600)
text(104, 35, second, 11, "accent" if UPDATE else "dim")
icon("search", 207.5, 15.5, 15, "muted")
icon("sidebar", 237.5, 15.5, 15, "muted")

# Spaces and agents share the height between the brand row and the footer.
text(16, 66, "Spaces", 11.5, "dim")
icon("plus", 237, 54.5, 14, "dim", sw=2)

def row(x, y, w, name, letter=None, color=None, tree=False, git=None, crew=None, active=False):
    """git: (where, ahead, behind, dirty) or None. crew: (count, top status) or None."""
    h = 44 if git else 32
    if active:
        rect(x, y, w, h, "selected", rx=8)
    pl = 12 if tree else 8
    ax = x + pl
    cy = y + h / 2
    if tree:
        icon("branch", ax + 4.5, cy - 6.5, 13, "dim")
    else:
        avatar(ax, cy - 11, letter, color)
    tx = ax + 22 + 9
    if git:
        text(tx, y + 19, name, 13, "foreground", 500)
        where, ahead, behind, dirty = git
        gx = tx
        if where and not tree:
            icon("branch", gx, y + 25.5, 11, "dim")
            gx += 11 + 5
        # One text line, so the parts sit where the font puts them, 5px apart.
        parts = [(where, "dim", 400)] if where else []
        parts += [p for p in ((f"↑{ahead}", "muted", 400) if ahead else None,
                              (f"↓{behind}", "muted", 400) if behind else None,
                              (f"±{dirty}", "dim", 400) if dirty else None) if p]
        inner = "".join(f'<tspan dx="{5 if i else 0}" fill="{paint(c)[0]}">{escape(t)}</tspan>'
                        for i, (t, c, _w) in enumerate(parts))
        add(f'<text x="{gx}" y="{y + 35}" font-family="{UI}" font-size="11.5">{inner}</text>')
    else:
        text(tx, cy + 4.5, name, 13, "foreground", 500)
    if crew:
        badge(x + w - 8, cy, *crew)
    return h

# Spaces and agents each get half the height between the brand row and the footer; a list
# longer than its half scrolls, so a shorter window shows less of it.
AY = 46 + (H - 46 - 69) // 2
FY = H - 69
spaces_mark = len(out)
y = 77 + 6
# A repo and two worktrees on one card.
cx, cw = 8, 252
card_top = y
inner = [
    dict(name="search-filters", tree=True, git=("", 3, 0, 5), crew=(2, "done"), active=True),
    dict(name="fix-login", tree=True, git=("fix/login-redirect", 0, 0, 1), crew=(1, "blocked")),
    dict(name="release-2.4", tree=True, git=("release/2.4", 0, 2, 0)),
]
# No space in the main checkout (Herdr makes each worktree its own space): the repo's name heads the card.
icon("folder", cx + 3 + 9, y + 3 + 6, 12, "dim", sw=2)
text(cx + 3 + 9 + 12 + 7, y + 3 + 16, "atlas", 11.5, "muted", 500)
ry = y + 3 + 24 + 2
for it in inner:
    if it["name"] == "search-filters":
        QB = (cx + 3 + cw - 6 - 8, ry + 22)  # its badge: right edge, middle (the quicklook scene)
    ry += row(cx + 3, ry, cw - 6, **it) + 2
card_h = ry - 2 + 3 - card_top
frame(cx, card_top, cw, card_h, "border", rx=10)
y = card_top + card_h + 6 + 2
for it in [
    dict(name="website", letter="W", color="ansi3", git=("acme-site · feat/pricing", 1, 0, 0), crew=(1, "done")),
    dict(name="api-gateway", letter="A", color="ansi4", git=("", 0, 4, 0), crew=(1, "idle")),
    dict(name="notes", letter="N", color="ansi5"),
    dict(name="dotfiles", letter="D", color="ansi2", git=("", 0, 0, 7), crew=(1, "idle")),
    dict(name="research", letter="R", color="ansi1", git=("papers · draft-v2", 0, 0, 0), crew=(1, "working")),
    dict(name="mobile-app", letter="M", color="ansi6", git=("", 0, 0, 2), crew=(1, "idle")),
    dict(name="infra", letter="I", color="ansi8", git=("terraform · main", 0, 1, 0), crew=(1, "idle")),
]:
    y += row(8, y, 252, **it) + 2
if y > AY:
    clip_since(spaces_mark, 0, 46, SB, AY - 46)

# Agents (Herdr's shipped list).
text(16, AY + 20, "Agents", 11.5, "dim")
icon("clock", 238, AY + 9, 13, "dim", sw=2)
ay = AY + 31
agents_mark = len(out)

def agent(y, prog, space, task, when, status, active=False):
    if active:
        rect(8, y, 252, 26, "selected", rx=7)
    program(prog, 16, y + 5, 16, "foreground")
    spans(38, y + 17.5, [(space, "foreground", 500), (f" · {task}", "dim", 400)], 12.5, UI)
    text(234, y + 17.5, when, 11, "dim", anchor="end")
    if status == "working":
        spinner(248, y + 13, "working")
    elif status == "blocked":
        # Under the "Needs you" header Herdr marks the row with a ! in a 14px square, not a dot.
        rect(241, y + 6, 14, 14, "blocked", rx=4, op=0x26 / 255)
        text(248, y + 17, "!", 10.5, "blocked", 700, "middle")
    elif status == "done":
        add(f'<circle cx="248" cy="{y + 13}" r="4" fill="{paint(status)[0]}"/>')
    else:
        add(f'<circle cx="248" cy="{y + 13}" r="3.5" fill="none" stroke="{paint("dim")[0]}" stroke-width="1.3"/>')

def group(label, n, color, items):
    global ay
    spans(16, ay + 16, [(label, color, 500), (f"  {n}", "dim", 400)], 11.5, UI)
    ay += 24
    for it in items:
        agent(ay, *it)
        ay += 28

group("Needs you", 1, "blocked", [("codex", "fix-login", "Run the migration?", "4m", "blocked")])
group("Done", 2, "done", [("codex", "search-filters", "Review facets", "2m", "done"),
                          ("claude", "website", "Pricing page", "12m", "done")])
group("Working", 2, "working", [("claude", "search-filters", "Facet filters", "1m", "working", True),
                                ("pi", "research", "Benchmarks", "3m", "working")])
group("Idle", 4, "dim", [("claude", "mobile-app", "Onboarding flow", "40m", "idle"),
                         ("pi", "dotfiles", "brew bundle", "1h", "idle"),
                         ("codex", "infra", "Terraform plan", "3h", "idle"),
                         ("claude", "api-gateway", "Rate limits", "1d", "idle")])

if ay > FY:
    clip_since(agents_mark, 0, AY, SB, FY - AY)

# Footer, 69px.
line(0, FY + .5, SB, FY + .5, "border")
icon("settings", 16, FY + 11, 14, "muted", sw=2)
text(39, FY + 23, "Settings", 13, "muted")
icon("plus", 16, FY + 39, 14, "dim", sw=2)
text(39, FY + 51, "Add machine", 13, "dim")

# ---- work area ----
WX = SB + 1
# Tabs, 42px.
# The preview-tab scene brings package.json's tab to the front.
ACTIVE = "package.json" if SCENE == "preview-tab" else "search-filters"
first = ACTIVE == "search-filters"
if first:
    rect(WX + 8, 8, 150, 26, "selected", rx=6)
program("claude", WX + 18, 14, 14, "muted")
text(WX + 38, 25.5, "search-filters", 13, "foreground" if first else "muted", 500 if first else 400)
if first:
    icon("close", WX + 140, 16, 10, "dim", sw=2.5)
program("shell", WX + 171, 14, 14, "muted")
text(WX + 189, 25.5, "zsh", 13, "muted")
program("vite", WX + 227, 14, 14, "muted")
text(WX + 245, 25.5, "dev server", 13, "muted")
# Files opened in roundup-preview tabs: a mod's pane has no program, so its tab shows the name alone.
tx_ = WX + 245 + tw("dev server", 13)
for name in ["CONTRIBUTING.md", "query.ts", "package.json"]:
    tx_ += 26
    if name == ACTIVE:
        rect(tx_ - 10, 8, 10 + tw(name, 13, 500) + 10 + 10 + 8, 26, "selected", rx=6)
        text(tx_, 25.5, name, 13, "foreground", 500)
        icon("close", tx_ + tw(name, 13, 500) + 10, 16, 10, "dim", sw=2.5)
    else:
        text(tx_, 25.5, name, 13, "muted")
    tx_ += tw(name, 13)
# The panel buttons (26px, 8px sides, 14px icon, 5px gap), 3px apart, 10px from the edge; Files is on.
bx = W - 10
for name, label, glyph, on in reversed([("files", "Files", "files", True), ("changes", "Changes", "compare", False)]):
    bw = 8 + 14 + 5 + tw(label, 12) + 8
    bx -= bw
    if on:
        rect(bx, 8, bw, 26, "selected", rx=6)
    icon(glyph, bx + 8, 14, 14, "foreground" if on else "muted", sw=2)
    text(bx + 27, 25.5, label, 12, "foreground" if on else "muted")
    bx -= 3
icon("plus", bx - 22, 15, 12, "dim", sw=2)

# The active tab's panes, Claude Code on the left, Codex above a shell on the right, and the side
# panel: 8px padding and gap, rounded 10px.
PY, PH = 50, H - 28 - 8 - 50
PW = 368
PX = W - 8 - PW
LX = WX + 8
LW = (PX - 8 - LX - 8) // 2
RX = LX + LW + 8
RW = PX - 8 - RX
# The right side's split: Codex on top, the shell below, 8px apart.
CH = round((PH - 8) * 0.58)
SY, SH = PY + CH + 8, PH - CH - 8
LH = 21  # terminal line height
TOP = PY + 30 + 12 + 14  # first baseline: header, padding, ascent
ROWS = (PY + PH - 12 - TOP) // LH + 1

def pane(x, w, prog, name, address, status, focus, lines, bottom, hover=False, y=PY, h=PH):
    """A pane: roundup-pane's header (icon, name, id chip, folder, status), then the terminal.
    `lines` run from the top, `bottom` sits on the last rows. `hover`: the pointer is on the
    header, on its pencil, so the header shows rename, split right, split down, zoom and close.
    `y`, `h`: its top and height, the tab's whole height unless it is split."""
    PY, PH = y, h
    rect(x, PY, w, PH, "background", rx=10)
    frame(x, PY, w, PH, "accent" if focus else "border", rx=10)
    line(x + 1, PY + 30.5, x + w - 1, PY + 30.5, "border")
    hx = x + 10
    program(prog, hx, PY + 8, 14, "dim")
    hx += 14 + 8
    text(hx, PY + 19.5, name, 12, "foreground", 500)
    hx += tw(name, 12, 500) + 8
    chip = mw(address, 10.5) + 10
    rect(hx, PY + 6, chip, 18, "hover", rx=4)
    text(hx + 5, PY + 18.5, address, 10.5, "dim", family=MONO)
    hx += chip + 8
    text(hx, PY + 19.5, "~/code/atlas-search-filters", 12, "dim")
    right = x + w - 10
    if hover:
        # 20px buttons (3px padding round a 14px icon), 8px apart, as the header's gap.
        right -= 5 * 20 + 4 * 8
        for i, glyph in enumerate(["rename", "split-right", "split-down", "zoom", "x"]):
            bx_ = right + i * 28
            if i == 0:
                rect(bx_, PY + 5, 20, 20, "hover", rx=4)
            icon(glyph, bx_ + 3, PY + 8, 14, "foreground" if i == 0 else "dim", sw=1.3)
        right -= 8
    if status == "working":
        spinner(right - 6, PY + 15, "working", 5)
    elif status == "done":
        # roundup-pane's done mark: a 7px dot in the done color.
        add(f'<circle cx="{r(right - 6)}" cy="{r(PY + 15)}" r="3.5" fill="{paint("done")[0]}"/>')
    clip = f"term-{address}"
    add(f'<defs><clipPath id="{clip}"><rect x="{x + 1}" y="{PY + 31}" width="{w - 2}" height="{PH - 32}"/></clipPath></defs>')
    add(f'<g clip-path="url(#{clip})">')
    # Like a terminal, it scrolls: the lines that don't fit above the bottom rows leave at the top.
    top = PY + 30 + 12 + 14
    rows = (PY + PH - 12 - top) // LH + 1
    room = max(0, rows - len(bottom))
    if len(lines) > room:
        lines = lines[-room:] if room else []
    for i, parts in enumerate(lines):
        if parts:
            spans(x + 14, top + LH * i, parts, 13)
    for i, parts in enumerate(bottom):
        if parts:
            spans(x + 14, top + LH * (rows - len(bottom) + i), parts, 13)
    add('</g>')

F, D, M, G = "terminal", "dim", "muted", "ansi2"
pane(LX, LW, "claude", "Claude Code", "t4", "working", True, [
    [("● ", F, 400), ("I'll add facet filters to the search endpoint, then", F, 400)],
    [("  the filter chips above the results.", F, 400)],
    [],
    [("● ", G, 400), ("Read ", F, 600), ("src/search/query.ts", D, 400)],
    [("● ", G, 400), ("Read ", F, 600), ("src/search/facets.ts", D, 400)],
    [("● ", G, 400), ("Update ", F, 600), ("src/search/facets.ts", D, 400)],
    [("   14 ", D, 400), ("+ export function facetCounts(hits, fields) {", G, 400)],
    [("   15 ", D, 400), ("+   const counts = new Map();", G, 400)],
    [("   16 ", D, 400), ("+   for (const hit of hits) {", G, 400)],
    [("   17 ", D, 400), ("+     for (const f of fields) bump(counts, f, hit[f]);", G, 400)],
    [("   18 ", D, 400), ("+   }", G, 400)],
    [("   19 ", D, 400), ("+   return counts;", G, 400)],
    [("   20 ", D, 400), ("+ }", G, 400)],
    [],
    [("● ", G, 400), ("Bash ", F, 600), ("npm test -- search", D, 400)],
    [("  ✓ 42 tests passed ", G, 400), ("(1.8s)", D, 400)],
    [],
    [("● ", F, 400), ("Every search now returns facet counts. Next: the", F, 400)],
    [("  chips in the results header, and a test for an", F, 400)],
    [("  empty hit list.", F, 400)],
    [],
    [("● ", G, 400), ("Update ", F, 600), ("src/ui/ResultsHeader.tsx", D, 400)],
    [("   31 ", D, 400), ("+ <div className=\"chips\">", G, 400)],
    [("   32 ", D, 400), ("+   {facets.map((f) => <FilterChip {...f} />)}", G, 400)],
    [("   33 ", D, 400), ("+ </div>", G, 400)],
    [],
    [("● ", G, 400), ("Write ", F, 600), ("test/facets.test.ts", D, 400)],
    [("   1 ", D, 400), ("+ test(\"an empty hit list keeps its facets\", () => {", G, 400)],
    [("   2 ", D, 400), ("+   expect(facetCounts([], [\"brand\"])).toEqual(", G, 400)],
    [("   3 ", D, 400), ("+     new Map([[\"brand\", new Map()]]));", G, 400)],
    [("   4 ", D, 400), ("+ });", G, 400)],
    [],
    [("● ", G, 400), ("Bash ", F, 600), ("npm test -- facets", D, 400)],
    [("  ✓ 13 tests passed ", G, 400), ("(0.9s)", D, 400)],
    [],
    [("● ", F, 400), ("The README now documents the facets option.", F, 400)],
], [
    [("✻ ", "working", 400), ("Wiring the chips… ", "working", 400), ("(1m 12s · esc to interrupt)", D, 400)],
    [],
    [("› ", M, 400)],
    [],
    [("  ? for shortcuts", D, 400)],
])
# The prompt's box and cursor.
pb = TOP + LH * (ROWS - 3)
for ry_ in (pb - 15 - LH, pb - 15 + LH):
    add(f'<path d="M{LX + 14} {ry_}h{LW - 28}" stroke="{paint("raised")[0]}"/>')
rect(LX + 30, pb - 13, 8, 17, "terminal", op=0.85)

# In the panes scene the reviewer has a name of its own, and the pointer is on its header.
PANES = SCENE in ("pane-header", "rename")
pane(RX, RW, "codex", "Reviewer" if PANES else "Codex", "t7", "done", False, [
    [("› ", M, 400), ("Review src/search/facets.ts: does an empty hit list", F, 400)],
    [("  still return every facet, at zero?", F, 400)],
    [],
    [("• ", D, 400), ("Explored", F, 600)],
    [("  └ ", D, 400), ("Read facets.ts, query.ts, facets.test.ts", D, 400)],
    [],
    [("• ", D, 400), ("Ran ", F, 600), ("npm test -- facets", D, 400)],
    [("  └ ", D, 400), ("13 passed", G, 400)],
    [],
    [("• ", F, 400), ("facetCounts keeps a field with no hits, but the", F, 400)],
    [("  route drops empty maps before it answers.", F, 400)],
    [],
    [("• ", F, 400), ("Fix: return the empty maps in src/search/query.ts;", F, 400)],
    [("  the rest of the change looks good.", F, 400)],
], [
    [("› ", M, 400), ("Ask for a follow-up", D, 400)],
    [],
    [("  ⏎ send   ⌃J newline", D, 400)],
], hover=SCENE == "pane-header", h=CH)

# Below it a shell in the same folder: the files the agents changed, as the side panel shows them.
pane(RX, RW, "shell", "zsh", "t8", None, False, [
    [("atlas-search-filters ", "ansi4", 400), ("search-filters ", "ansi5", 400), ("❯ ", G, 400), ("git status --short", F, 400)],
    [(" M ", "ansi3", 400), ("src/search/facets.ts", F, 400)],
    [(" M ", "ansi3", 400), ("src/search/query.ts", F, 400)],
    [(" M ", "ansi3", 400), ("src/ui/ResultsHeader.tsx", F, 400)],
    [("?? ", "ansi2", 400), ("src/ui/FilterChip.tsx", F, 400)],
    [("?? ", "ansi2", 400), ("test/facets.test.ts", F, 400)],
], [
    [("atlas-search-filters ", "ansi4", 400), ("search-filters ", "ansi5", 400), ("❯ ", G, 400)],
], y=SY, h=SH)

# ---- side panel: roundup-files, 368px ----
# The same folder as the panes: three files modified, two new, three commits ahead.
rect(PX, PY, PW, PH, "background", rx=10)
frame(PX, PY, PW, PH, "border", rx=10)
X0, X1 = PX + 1, PX + PW - 1  # inside the 1px border

# Header, 42px: "Files", the All | Changed switch (Changed with its count), the folder at the right.
hcy = PY + 1 + 21
text(X0 + 12, hcy + 4.5, "Files", 13, "foreground", 600)
sx = X0 + 12 + tw("Files", 13, 600) + 8
CHANGED = 5
w_all = 8 + tw("All", 12) + 8
w_ch = 8 + tw("Changed", 12) + 5 + tw(str(CHANGED), 11) + 8
# The files-changed scene picks Changed, the search scene types into the search field.
VIEW = {"files-changed": "changed", "search": "search"}.get(SCENE, "all")
ALL = VIEW != "changed"
rect(sx, hcy - 12, 2 + w_all + 2 + w_ch + 2, 24, "raised", rx=7)
if ALL:
    rect(sx + 2, hcy - 10, w_all, 20, "background", rx=5)
else:
    rect(sx + 4 + w_all, hcy - 10, w_ch, 20, "background", rx=5)
text(sx + 2 + 8, hcy + 4, "All", 12, "foreground" if ALL else "dim")
text(sx + 4 + w_all + 8, hcy + 4, "Changed", 12, "dim" if ALL else "foreground")
text(sx + 4 + w_all + 8 + tw("Changed", 12) + 5, hcy + 4, str(CHANGED), 11, "dim")
folder = "atlas-search-filters"
text(X1 - 12, hcy + 4, folder, 12, "dim", anchor="end")
file_icon(ICONS["rootFolder"], X1 - 12 - tw(folder, 12) - 6 - 14, hcy - 7, 14)
line(X0, PY + 1 + 41.5, X1, PY + 1 + 41.5, "border")

# Branch row, 46px: the branch, ↑ahead, the lines changed; under it the bar of modified and new paths.
by = PY + 1 + 42
l1 = by + 14.5
icon("branch", X0 + 12, l1 - 6, 12, "muted")
text(X0 + 30, l1 + 4, "search-filters", 12, "foreground", 500)
text(X0 + 30 + tw("search-filters", 12, 500) + 6, l1 + 4, "↑3", 12, "muted")
text(X1 - 12, l1 + 4, "−14", 11.5, "ansi1", anchor="end")
text(X1 - 12 - tw("−14", 11.5) - 6, l1 + 4, "+48", 11.5, "ansi2", anchor="end")
bar = by + 6.5 + 16 + 7 + 3
room = PW - 26 - 26 * 2 - 2 * 2
xb = X0 + 12
for n, col in [(3, "ansi3"), (2, "ansi2")]:
    w_ = max(3, room * n / 5)
    rect(xb, bar, w_, 4, col, rx=2)
    xb += w_ + 2
text(X1 - 12 - 26, bar + 4.5, "3", 10.5, "ansi3", anchor="end")
text(X1 - 12, bar + 4.5, "2", 10.5, "ansi2", anchor="end")
line(X0, by + 45.5, X1, by + 45.5, "border")

# Search field, 28px, with the source switch at its end, lit: search reads git's files.
sy = by + 46 + 8
QUERY = "facets"
rect(X0 + 8, sy, X1 - X0 - 16, 28, "canvas", rx=7)
frame(X0 + 8, sy, X1 - X0 - 16, 28, "accent" if VIEW == "search" else "border", rx=7)
icon("search", X0 + 16, sy + 7.5, 13, "dim")
if VIEW == "search":
    text(X0 + 16 + 13 + 6, sy + 18, QUERY, 12, "foreground")
    rect(X0 + 16 + 13 + 6 + tw(QUERY, 12) + 1, sy + 7, 1.5, 14, "foreground")
    icon("close", X1 - 16 - 20 - 8 - 10, sy + 9, 10, "dim", sw=2.5)
else:
    text(X0 + 16 + 13 + 6, sy + 18, "Search files", 12, "dim")
# Changed has no switch: it searches git's paths anyway.
if VIEW != "changed":
    rect(X1 - 16 - 20, sy + 4, 20, 20, "raised", rx=5)
    icon("branch", X1 - 16 - 20 + 3.5, sy + 7.5, 13, "accent")

# The tree: 26px rows, 14px a level. Names in their status color, files end with +N −N and their
# letter, folders with a dot and count for new, modified and deleted below them, and their +N −N.
# A symlink: its name in italics and a 14px arrow in accent after it.
STATUS = {"M": "ansi3", "?": "ansi2", "A": "ansi2", "D": "ansi1"}

def frow(y, rel, depth, folder=False, open_=False, st=None, lines=(0, 0), counts=None, ignored=False, selected=False, link=False, hover=False):
    x0, x1 = X0 + 4, X1 - 4
    if selected or hover:
        rect(x0, y, x1 - x0, 26, "selected" if selected else "hover", rx=6)
    cy = y + 13
    x = x0 + 8 + depth * 14
    if folder:
        icon("chevron-down" if open_ else "chevron-right", x, cy - 6, 12, "dim", sw=2)
    x += 12 + 6
    file_icon(icon_for(rel, folder, open_), x, cy - 8, 16, 0.5 if ignored else 1)
    x += 16 + 6
    color = "dim" if ignored else STATUS.get(st, "foreground")
    name = rel.split("/")[-1]
    text(x, cy + 4.5, name, 13, color, italic=link)
    if link:
        icon("link", x + tw(name, 13) + 6, cy - 7, 14, "accent", sw=2.5)
    rr = x1 - 10
    if st and not folder:
        text(rr, cy + 4, st, 11, color, 600, anchor="end")
    rr -= 12
    parts = [(str(n), ["ansi2", "ansi3", "ansi1"][i], True) for i, n in enumerate(counts or []) if n]
    parts += [(f"+{lines[0]}", "ansi2", False)] if lines[0] else []
    parts += [(f"−{lines[1]}", "ansi1", False)] if lines[1] else []
    for s, col, dot in reversed(parts):
        rr -= 6
        text(rr, cy + 4, s, 11, col, anchor="end")
        rr -= tw(s, 11)
        if dot:
            add(f'<circle cx="{r(rr - 6)}" cy="{cy}" r="3" fill="{paint(col)[0]}"/>')
            rr -= 3 + 6

tree = [
    (".github", 0, dict(folder=True)),
    ("docs", 0, dict(folder=True)),
    ("node_modules", 0, dict(folder=True, ignored=True)),
    ("public", 0, dict(folder=True)),
    ("src", 0, dict(folder=True, open_=True, counts=(1, 3, 0), lines=(48, 14))),
    ("src/search", 1, dict(folder=True, open_=True, counts=(0, 2, 0), lines=(31, 9))),
    ("src/search/facets.ts", 2, dict(st="M", lines=(24, 3))),
    ("src/search/index.ts", 2, {}),
    ("src/search/query.ts", 2, dict(st="M", lines=(7, 6))),
    ("src/search/ranking.ts", 2, {}),
    ("src/ui", 1, dict(folder=True, open_=True, counts=(1, 1, 0), lines=(17, 5))),
    ("src/ui/FilterChip.tsx", 2, dict(st="?")),
    ("src/ui/ResultsHeader.tsx", 2, dict(st="M", lines=(17, 5))),
    ("src/ui/SearchBox.tsx", 2, {}),
    ("src/main.ts", 1, {}),
    ("test", 0, dict(folder=True, open_=True, counts=(1, 0, 0))),
    ("test/facets.test.ts", 1, dict(st="?")),
    ("test/query.test.ts", 1, {}),
    (".gitignore", 0, {}),
    ("AGENTS.md", 0, dict(link=True)),
    ("CONTRIBUTING.md", 0, {}),
    ("index.html", 0, {}),
    ("LICENSE", 0, {}),
    ("package.json", 0, {}),
    ("package-lock.json", 0, {}),
    ("README.md", 0, dict(selected=True)),
    ("tsconfig.json", 0, {}),
    ("vite.config.ts", 0, {}),
]
# Changed: exactly what git status lists, as a tree with every folder open.
changed = [
    ("src", 0, dict(folder=True, open_=True, counts=(1, 3, 0), lines=(48, 14))),
    ("src/search", 1, dict(folder=True, open_=True, counts=(0, 2, 0), lines=(31, 9))),
    ("src/search/facets.ts", 2, dict(st="M", lines=(24, 3), selected=True)),
    ("src/search/query.ts", 2, dict(st="M", lines=(7, 6))),
    ("src/ui", 1, dict(folder=True, open_=True, counts=(1, 1, 0), lines=(17, 5))),
    ("src/ui/FilterChip.tsx", 2, dict(st="?")),
    ("src/ui/ResultsHeader.tsx", 2, dict(st="M", lines=(17, 5))),
    ("test", 0, dict(folder=True, open_=True, counts=(1, 0, 0))),
    ("test/facets.test.ts", 1, dict(st="?")),
]
# A search finds files in folders not opened yet (docs), and shows them as a tree.
found = [
    ("docs", 0, dict(folder=True, open_=True)),
    ("docs/facets.md", 1, {}),
    ("src", 0, dict(folder=True, open_=True, counts=(1, 3, 0), lines=(48, 14))),
    ("src/search", 1, dict(folder=True, open_=True, counts=(0, 2, 0), lines=(31, 9))),
    ("src/search/facets.ts", 2, dict(st="M", lines=(24, 3), selected=True)),
    ("test", 0, dict(folder=True, open_=True, counts=(1, 0, 0))),
    ("test/facets.test.ts", 1, dict(st="?")),
]
ly = sy + 28 + 4
# AGENTS.md's row in the All view: the symlink scene hovers it, and its crop follows it.
LINK_Y = ly + 26 * [rel for rel, _, _ in tree].index("AGENTS.md")
tree_mark = len(out)
rows = {"all": tree, "changed": changed, "search": found}[VIEW]
for i, (rel, depth, kw) in enumerate(rows):
    if SCENE == "symlink" and rel == "AGENTS.md":
        kw = dict(kw, hover=True)
    frow(ly + 26 * i, rel, depth, **kw)
if ly + 26 * len(rows) > PY + PH - 1:
    clip_since(tree_mark, X0, PY + 1, X1 - X0, PH - 2, rx=9)

# Status bar, 28px.
SY = H - 28
rect(WX, SY, W - WX, 28, "chrome")
icon("monitor", WX + 14, SY + 8, 12, "dim")
text(WX + 31, SY + 18, "This computer", 11.5, "muted")
icon("branch", WX + 128, SY + 8, 12, "dim")
text(WX + 145, SY + 18, "search-filters", 11.5, "muted")
# Herdr's workspace-status mod: a dim dot, the count, and the blocked ones in their color.
add(f'<circle cx="{WX + 243}" cy="{SY + 14}" r="3" fill="{paint("dim")[0]}"/>')
spans(WX + 252, SY + 18, [("9 agents", "muted", 400), ("  · 1 needs you", "blocked", 400)], 11.5, UI)
text(W - 14, SY + 18, "⌘⇧P  commands", 11, "dim", anchor="end")

# ---- roundup-preview's header controls, in the floating window and in a preview tab ----
# `y` is the middle of the header's 42px.
def viewer_button(x, y, glyph, color="muted", sw=2):
    """A header button: 28px, rounded 7, a 14px icon."""
    rect(x, y - 14, 28, 28, "chrome", rx=7)
    icon(glyph, x + 7, y - 7, 14, color, sw=sw)

def viewer_switch(right, y, items):
    """The switch (Preview | Raw): 2px padding, buttons 10px aside and 2px apart, the one on
    raised. `items` are (label, on); it ends at `right`. Returns its left edge."""
    w = 2 + sum(10 + tw(l, 12) + 10 for l, _ in items) + 2 * (len(items) - 1) + 2
    x = right - w
    rect(x, y - 12.5, w, 25, "chrome", rx=7)
    sx = x + 2
    for label, on in items:
        bw = 10 + tw(label, 12) + 10
        if on:
            rect(sx, y - 10.5, bw, 21, "raised", rx=5)
        text(sx + 10, y + 4, label, 12, "foreground" if on else "muted")
        sx += bw + 2
    return x

# ---- roundup-preview's floating window: README.md, rendered ----
# Only in the window and the float scene: the others show what's under it.
# floatSpec: 0.6 of the window's width, 0.75 of its height; dragged up a little, so the
# panes' last lines show below it.
FW, FH = round(W * 0.6), round(H * 0.75)
FX, FT = (W - FW) // 2, (H - FH) // 2 - 22
if SCENE in ("window", "float"):
    rect(FX - 6, FT + 14, FW + 12, FH + 10, "#000000", rx=16, op=0.6)
    out[-1] = out[-1].replace("/>", ' filter="url(#shadow)"/>')
    rect(FX, FT, FW, FH, "background", rx=10)
    frame(FX, FT, FW, FH, "border", rx=10)

    # Header, 42px: name, folder and size; at the right the viewer's ToC and Preview | Raw, then
    # ⋯ (the menu), Open in tab and Close.
    hy = FT + 21
    text(FX + 14, hy + 4.5, "README.md", 13, "foreground", 600)
    px_ = FX + 14 + tw("README.md", 13, 600) + 8
    text(px_, hy + 4, "/Users/sam/code/atlas-search-filters", 12, "dim")
    px_ += tw("/Users/sam/code/atlas-search-filters", 12) + 8
    text(px_, hy + 4, "3.1 KB", 12, "dim")
    line(FX + 1, FT + 41.5, FX + FW - 1, FT + 41.5, "border")

    bx = FX + FW - 10 - 28
    viewer_button(bx, hy, "close")
    bx -= 8 + 28
    viewer_button(bx, hy, "to-tab")
    bx -= 8 + 28
    viewer_button(bx, hy, "more")
    bx = viewer_switch(bx - 8, hy, [("Preview", True), ("Raw", False)])
    bx -= 6 + 28
    viewer_button(bx, hy, "toc")

    # The document: a 920px column, 40px aside, 28px from the top, 14.5px text.
    add(f'<defs><clipPath id="doc"><rect x="{FX + 1}" y="{FT + 42}" width="{FW - 2}" height="{FH - 43}" rx="9"/></clipPath></defs>')
    add('<g clip-path="url(#doc)">')
    DX = FX + (FW - min(920, FW)) / 2 + 40
    DW = min(920, FW) - 80
    BODY, LEAD = 14.5, 23

    def flow(x, y, width, runs, size=BODY, lead=LEAD, color="foreground"):
        """Runs of text wrapped to `width` from baseline `y`: [(text, kind)], kind t (text), b (bold),
        c (inline code) or a (link). Returns the baseline after the last line."""
        pieces = []  # (text, kind), a space being (" ", None)
        for s, kind in runs:
            for part in ([s] if kind == "c" else re.findall(r"\s+|\S+", s)):
                pieces.append((" ", None) if part.isspace() else (part, kind))
        cx_ = x
        for word, kind in pieces:
            if kind is None:
                cx_ += tw(" ", size) if cx_ > x else 0
                continue
            width_ = mw(word, 13) + 8 if kind == "c" else tw(word, size, 600 if kind == "b" else 400)
            if cx_ > x and cx_ + width_ > x + width:
                cx_, y = x, y + lead
            if kind == "c":
                rect(cx_, y - 13.5, width_, 19, "raised", rx=4)
                text(cx_ + 4, y, word, 13, "foreground", family=MONO)
            else:
                text(cx_, y, word, size, "accent" if kind == "a" else color, 600 if kind == "b" else 400)
            cx_ += width_
        return y + lead

    def code(y, rows):
        """A fenced block: one line per row of [(text, color)], on the chrome color."""
        h = 14 + 19 * len(rows) + 10
        rect(DX, y, DW, h, "chrome", rx=6)
        frame(DX, y, DW, h, "border", rx=6)
        for i, parts in enumerate(rows):
            spans(DX + 14, y + 14 + 13 + 19 * i, [(s, c, 400) for s, c in parts], 13)
        return y + h

    K, S, N, C, P = "ansi5", "ansi2", "ansi1", "dim", "terminal"
    y = FT + 42 + 28
    y += 26
    text(DX, y, "Atlas Search", 26, "foreground", 600)
    y += 14 + LEAD
    y = flow(DX, y, DW, [("Atlas is the search service behind the Acme storefront: one endpoint that takes a query and a "
                          "set of filters and returns ranked hits with their facet counts, fast enough to run on every keystroke.", "t")])
    y += 16 + 20
    text(DX, y, "Facet filters", 20, "foreground", 600)
    y += 12 + LEAD
    y = flow(DX, y, DW, [("Every search counts the hits for each field it names in ", "t"), ("facets", "c"),
                         (", so the results header can show how many hits each filter chip would leave.", "t")])
    y += 6
    for item in [
        [("brand", "c"), (", ", "t"), ("color", "c"), (" and ", "t"), ("size", "c"), (" are counted on every request", "t")],
        [("Counts follow the other active filters, ", "t"), ("not", "b"), (" the whole index", "t")],
        [("An empty hit list still returns its facets, all at zero", "t")],
    ]:
        text(DX + 6, y, "•", BODY, "muted")
        y = flow(DX + 22, y, DW - 22, item)
    y += 2
    y = code(y - 14, [
        [("const ", K), ("res ", P), ("= ", P), ("await ", K), ("search", "ansi4"), ("({", P)],
        [("  query: ", P), ('"trail shoes"', S), (",", P)],
        [("  filters: { color: [", P), ('"blue"', S), ("] },", P)],
        [("  facets: [", P), ('"brand"', S), (", ", P), ('"size"', S), ("],", P)],
        [("});", P)],
        [("// res.facets.get(", C), ('"size"', C), (") → Map { 42 → 12, 43 → 9, … }", C)],
    ])
    y += 16 + 16 + 20
    text(DX, y, "Getting started", 20, "foreground", 600)
    y += 12 + LEAD
    y = flow(DX, y, DW, [("Install the dependencies and start the dev server. It reloads on every change under ", "t"),
                         ("src/", "c"), (" and serves the demo storefront on port 5173.", "t")])
    y = code(y - 8, [
        [("npm ", "ansi4"), ("install", P)],
        [("npm ", "ansi4"), ("run dev", P)],
    ])
    y += 16 + 16 + 20
    text(DX, y, "Tests", 20, "foreground", 600)
    y += 12 + LEAD
    y = flow(DX, y, DW, [("npm test", "c"), (" runs the unit tests in ", "t"), ("test/", "c"), ("; ", "t"),
                         ("npm run e2e", "c"), (" drives a browser against the dev server. Read ", "t"),
                         ("CONTRIBUTING.md", "a"), (" before you open a pull request.", "t")])
    add('</g>')

# ---- the site's scenes: what a click, a hover or a preview tab adds ----
def wrap(s, size, width, weight=400):
    """`s` broken into lines that fit `width`."""
    lines, cur = [], ""
    for word in s.split():
        if cur and tw(f"{cur} {word}", size, weight) > width:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    return lines + [cur] if cur else lines

def overlay(x, y, w, h, rx=10):
    """Herdr's frame round a popup, dialog or tooltip: popover, a 1px border, rounded, a shadow."""
    rect(x - 2, y + 6, w + 4, h + 4, "#000000", rx=rx + 2, op=0.5)
    out[-1] = out[-1].replace("/>", ' filter="url(#soft)"/>')
    rect(x, y, w, h, "popover", rx=rx)
    frame(x, y, w, h, "border", rx=rx)

def menu(x, y, w, items):
    """Rows as Herdr's menus draw them: 31px, rounded 7, a 14px icon (or the place of a check),
    12.8px text; `sep` puts a divider above, `head` a dim heading. Returns the bottom."""
    for it in items:
        if it.get("sep"):
            line(x + 7, y + 4.5, x + w - 7, y + 4.5, "border")
            y += 9
        if it.get("head"):
            text(x + 8, y + 14, it["head"], 11, "dim")
            y += 19
        color = "accent" if it.get("accent") else "foreground"
        if it.get("at"):
            rect(x, y, w, 31, "selected", rx=7)
        if it.get("glyph"):
            icon(it["glyph"], x + 8, y + 8.5, 14, "accent" if it.get("accent") else "muted", sw=2)
        elif it.get("check"):
            icon("check", x + 8, y + 8.5, 14, "accent", sw=2)
        text(x + 8 + 14 + 9, y + 20, it["label"], 12.8, color)
        if it.get("keys"):
            text(x + w - 8, y + 20, it["keys"], 11, "dim", anchor="end")
        y += 31
    return y

def buttons(right, y, specs):
    """Dialog buttons, right-aligned, 32px high and rounded 8: (label, primary, ring, size)."""
    for label, primary, ring, size in reversed(specs):
        bw = 14 + tw(label, size, 500) + 14
        right -= bw
        if ring:  # the keyboard's button: a 2px accent ring 3px out
            c, _ = paint("accent")
            add(f'<rect x="{r(right - 3)}" y="{r(y - 3)}" width="{r(bw + 6)}" height="38" rx="10" fill="none" stroke="{c}" stroke-width="2"/>')
        rect(right, y, bw, 32, "solid" if primary else "raised", rx=8)
        frame(right, y, bw, 32, "solid" if primary else "input", rx=8)
        text(right + 14, y + 20.5, label, size, "solid-foreground" if primary else "foreground", 500)
        right -= 8

def dialog_head(x, y, w, title):
    text(x + 18, y + 18 + 15, title, 15, "foreground", 600)
    text(x + w - 18, y + 18 + 14, "Esc", 11, "dim", anchor="end")

if SCENE != "window" or POSTER:
    add('<defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter></defs>')

if SCENE == "update":
    # A click on logo or name: the menu at the pointer (300px, brand.js's MENU_WIDTH), the details on top.
    # Its height: padding, the head and its divider, 8 rows, one heading and 3 dividers.
    MX, MY, MW = 120, 40, 300
    MH = 10 + 12 + 91 + 9 + 8 * 31 + 19 + 3 * 9
    overlay(MX, MY, MW, MH)
    ix, iy = MX + 5 + 8, MY + 5 + 6
    text(ix, iy + 12, "Herdr Roundup", 13, "foreground", 600)
    ky = iy + 16 + 3 + 3
    for k, v, c in [("Installed", VERSION, "foreground"), ("Based on", f"Herdr {LAYOUT['cloned_from']['version']}", "foreground"),
                    ("Latest", NEXT, "accent"), ("Checked", "today 09:12", "foreground")]:
        text(ix, ky + 11.5, k, 12, "dim")
        text(MX + MW - 5 - 8, ky + 11.5, v, 12, c, anchor="end")
        ky += 18
    ry = MY + 5 + 12 + 91
    line(MX + 5 + 7, ry + 4.5, MX + MW - 5 - 7, ry + 4.5, "border")
    menu(MX + 5, ry + 9, MW - 10, [
        dict(label="Check for updates", glyph="refresh"),
        dict(label=f"Update to {NEXT} with an agent…", glyph="agent", accent=True, at=True),
        dict(label=f"Release notes {NEXT}", glyph="notes"),
        dict(label=f"Skip {NEXT}", glyph="skip"),
        dict(label="Daily", check=True, sep=True, head="Check for updates"),
        dict(label="Only when I ask"),
        dict(label="Include pre-releases", sep=True),
        dict(label="Show details on hover", check=True, sep=True),
    ])

if SCENE == "close-menu":
    # A right-click on the first tab: roundup-tabs' menu, ending in when closing asks.
    MX, MY = WX + 96, 30
    overlay(MX, MY, 220, 237)
    menu(MX + 5, MY + 5, 210, [
        dict(label="Rename", glyph="square-pen"),
        dict(label="New tab", glyph="plus"),
        dict(label="Close", glyph="close", sep=True, keys="cmd-w"),
        dict(label="Never", sep=True, head="Ask before closing a tab"),
        dict(label="While an agent works", check=True, at=True),
        dict(label="Always"),
    ])

# The two dialogs' sizes, which their crops follow.
CONFIRM_W, CONFIRM_H = 400, 170
RENAME_W, RENAME_H = 380, 196

if SCENE == "close-confirm":
    # cmd-w while both agents work: roundup-confirm asks, Cancel holding the keyboard.
    DW_, DH_ = CONFIRM_W, CONFIRM_H
    dx, dy = (W - DW_) / 2, (H - DH_) / 2
    overlay(dx, dy, DW_, DH_, rx=12)
    dialog_head(dx, dy, DW_, 'Close tab "search-filters"?')
    ty = dy + 18 + 20 + 12 + 13
    for l in wrap("2 agents are still running in it (Claude Code, Codex). Closing ends them.", 13, DW_ - 36):
        text(dx + 18, ty, l, 13, "muted")
        ty += 18
    buttons(dx + DW_ - 18, dy + DH_ - 18 - 32, [("Cancel", False, True, 12), ("Confirm", True, False, 12)])

if SCENE == "rename":
    # A double-click on the left pane's name: roundup-pane's dialog, a name being typed.
    DW_, DH_ = RENAME_W, RENAME_H
    dx, dy = (W - DW_) / 2, (H - DH_) / 2
    overlay(dx, dy, DW_, DH_, rx=12)
    dialog_head(dx, dy, DW_, "Rename pane")
    text(dx + 18, dy + 18 + 20 + 16 + 11, "Name (empty: the program's name)", 11.5, "dim")
    iy = dy + 18 + 20 + 16 + 15 + 7
    rect(dx + 18, iy, DW_ - 36, 36, "background", rx=9)
    frame(dx + 18, iy, DW_ - 36, 36, "accent", rx=9)
    text(dx + 28, iy + 22.5, "Facet filters", 12.8, "foreground")
    rect(dx + 28 + tw("Facet filters", 12.8) + 1, iy + 10, 1.5, 16, "foreground")
    buttons(dx + DW_ - 18, iy + 36 + 20, [("Cancel", False, False, 12.5), ("Save", True, False, 12.5)])

if SCENE == "symlink":
    # The pointer on AGENTS.md's arrow: where the link points.
    ax = X0 + 52 + tw("AGENTS.md", 13) + 6
    tip = "Link to docs/agents.md"
    tw_ = 8 + tw(tip, 12) + 8
    tx0 = min(ax + 7 - tw_ / 2, X1 - 8 - tw_)
    overlay(tx0, LINK_Y + 26 + 4, tw_, 26, rx=6)
    text(tx0 + 8, LINK_Y + 26 + 4 + 17, tip, 12, "foreground")

if SCENE == "preview-tab":
    # package.json's preview tab in front: one pane over the body, with roundup-pane's header
    # (a mod pane: no program icon, its id shortened), roundup-preview's header and the JSON tree.
    x, w = LX, PX - 8 - LX
    rect(x, PY, w, PH, "background", rx=10)
    frame(x, PY, w, PH, "accent", rx=10)
    line(x + 1, PY + 30.5, x + w - 1, PY + 30.5, "border")
    text(x + 10, PY + 19.5, "package.json", 12, "foreground", 500)
    hx = x + 10 + tw("package.json", 12, 500) + 8
    rect(hx, PY + 6, mw("p3f9a1c", 10.5) + 10, 18, "hover", rx=4)
    text(hx + 5, PY + 18.5, "p3f9a1c", 10.5, "dim", family=MONO)
    hy = PY + 31 + 21
    text(x + 14, hy + 4.5, "package.json", 13, "foreground", 600)
    px_ = x + 14 + tw("package.json", 13, 600) + 8
    text(px_, hy + 4, "/Users/sam/code/atlas-search-filters", 12, "dim")
    text(px_ + tw("/Users/sam/code/atlas-search-filters", 12) + 8, hy + 4, "1.1 KB", 12, "dim")
    line(x + 1, PY + 31 + 41.5, x + w - 1, PY + 31 + 41.5, "border")
    bx = x + w - 10 - 28
    viewer_button(bx, hy, "more")
    bx = viewer_switch(bx - 8, hy, [("Tree", True), ("Raw", False)])
    bx -= 6 + 28
    viewer_button(bx, hy, "collapse", sw=1.5)
    # The tree: 24px rows, 18px a level; keys ansi4, strings ansi2, numbers ansi1, true/false/null ansi6.
    pkg = [
        (0, None, "▾", "{ 9 keys }", "dim"),
        (1, '"name":', "", '"atlas-search"', "ansi2"),
        (1, '"version":', "", '"2.4.0"', "ansi2"),
        (1, '"private":', "", "true", "ansi6"),
        (1, '"type":', "", '"module"', "ansi2"),
        (1, '"keywords":', "▾", "[ 2 items ]", "dim"),
        (2, "0:", "", '"search"', "ansi2"),
        (2, "1:", "", '"facets"', "ansi2"),
        (1, '"scripts":', "▾", "{ 4 keys }", "dim"),
        (2, '"dev":', "", '"vite"', "ansi2"),
        (2, '"build":', "", '"tsc && vite build"', "ansi2"),
        (2, '"test":', "", '"vitest run"', "ansi2"),
        (2, '"e2e":', "", '"playwright test"', "ansi2"),
        (1, '"dependencies":', "▾", "{ 3 keys }", "dim"),
        (2, '"react":', "", '"^18.3.1"', "ansi2"),
        (2, '"react-dom":', "", '"^18.3.1"', "ansi2"),
        (2, '"zod":', "", '"^3.23.8"', "ansi2"),
        (1, '"devDependencies":', "▸", "{ 4 keys }", "dim"),
        (1, '"engines":', "▾", "{ 1 key }", "dim"),
        (2, '"node":', "", '">=20"', "ansi2"),
    ]
    ty = PY + 31 + 42 + 6
    for depth, key, chev, val, col in pkg:
        cx_ = x + 1 + 14 + depth * 18
        if chev:
            text(cx_, ty + 16.5, chev, 12.5, "dim", family=MONO)
        cx_ += 10 + 6
        if key:
            text(cx_, ty + 16.5, key, 12.5, "dim" if key[0].isdigit() else "ansi4", family=MONO)
            cx_ += mw(key, 12.5) + 6
        text(cx_, ty + 16.5, val, 12.5, col, family=MONO)
        ty += 24

if SCENE == "quicklook" or POSTER:
    # The pointer rests on search-filters' badge: roundup-spaces' card with its two agents, Claude
    # Code working on the left, Codex done above the shell on the right; Codex's row hovered and
    # its pane lit. Sizes as main.js draws them. The
    # poster shows it too, above the floating preview; Settings' bare window doesn't.
    bx_ = QB[0] - (6 + 11 + 4 + 7 + 6)
    QX, QY, QW = bx_, QB[1] + 9 + 4, 330
    rows_ = [("claude", "Facet filters", "working", False), ("codex", "Review facets", "done", True)]
    QH = 6 + 7 + 13 + 4 + len(rows_) * 26 + (len(rows_) - 1) + 4 + 6
    add('<g id="quicklook">')
    overlay(QX, QY, QW, QH)
    hy = QY + 6 + 7 + 10
    text(QX + 6 + 8, hy, "1", 11, "muted", 600)
    text(QX + 6 + 8 + tw("1", 11, 600) + 8, hy, "search-filters", 11, "dim")
    MW_, MH_ = 60, 40
    ly = QY + 6 + 7 + 13 + 4
    lx, lw = QX + 6 + 4, QW - 12 - 8 - 8 - MW_
    for i, (prog, title, status, lit) in enumerate(rows_):
        y_ = ly + i * 27
        if lit:
            rect(lx, y_, lw, 26, "hover", rx=6)
        add(f'<circle cx="{r(lx + 6 + 3.5)}" cy="{r(y_ + 13)}" r="3.5" fill="{paint(status)[0]}"/>')
        program(prog, lx + 6 + 7 + 8, y_ + 6, 14, "foreground")
        text(lx + 6 + 7 + 8 + 14 + 8, y_ + 17, title, 12, "foreground")
        text(lx + lw - 6, y_ + 17, {"blocked": "needs you"}.get(status, status), 11, status, anchor="end")
    # The map: the tab's panes split as on screen, 2px apart in a 2px frame: a row of Claude Code
    # and a column of Codex over the shell. An agent's pane in its status color, the shell gray.
    mx, my = QX + QW - 6 - 4 - MW_, ly + (len(rows_) * 27 - 1 - MH_) / 2
    frame(mx, my, MW_, MH_, "border", rx=5)
    iw, ih = MW_ - 6 - 2, MH_ - 6
    lw_ = iw * LW / (LW + RW)
    ch_ = (ih - 2) * CH / (CH + SH)
    rx_ = mx + 3 + lw_ + 2
    for (px_, py_, pw_, ph_), row_ in [((mx + 3, my + 3, lw_, ih), rows_[0]), ((rx_, my + 3, iw - lw_, ch_), rows_[1]),
                                       ((rx_, my + 3 + ch_ + 2, iw - lw_, ih - 2 - ch_), None)]:
        if row_ is None:
            rect(px_, py_, pw_, ph_, "selected", rx=2)
            continue
        lit = row_[3]
        rect(px_, py_, pw_, ph_, row_[2], rx=2, op=1 if lit else 0.45)
        if lit:
            frame(px_, py_, pw_, ph_, "foreground", rx=2)
    add('</g>')

# What each scene is cropped to: x, y, width, height. A fourth argument "full" keeps the window.
CROPS = {
    "spaces": (0, 0, SB + 1, 480),
    "quicklook": (0, 0, QX + QW + 40, QY + QH + 40) if SCENE == "quicklook" else None,
    "files": (PX - 8, 0, W - PX + 8, 600),
    "files-changed": (PX - 8, 0, W - PX + 8, 600),
    "search": (PX - 8, 42, W - PX + 8, 352),
    "symlink": (PX - 8, LINK_Y - 107, W - PX + 8, 200),
    "pane-header": (RX - 8, 42, RW + 16, 120),
    "rename": ((W - RENAME_W) / 2 - 60, (H - RENAME_H) / 2 - 50, RENAME_W + 120, RENAME_H + 100),
    "close-menu": (WX, 0, 520, 290),
    "close-confirm": ((W - CONFIRM_W) / 2 - 60, (H - CONFIRM_H) / 2 - 50, CONFIRM_W + 120, CONFIRM_H + 100),
    "update": (0, 0, MX + MW + 40, MY + MH + 24) if SCENE == "update" else None,
    "preview-tab": (WX, 0, PX - WX, 640),
    "float": (FX - 40, FT - 40, FW + 80, FH + 90),
}
assert set(CROPS) == set(SCENES), "CROPS and SCENES name different scenes"
CROP = CROPS.get(SCENE)
if CROP and not (len(sys.argv) > 4 and sys.argv[4] == "full"):
    cx_, cy_, cw_, ch_ = (r(v) for v in CROP)
    out[0] = f'<svg xmlns="http://www.w3.org/2000/svg" width="{cw_}" height="{ch_}" viewBox="{cx_} {cy_} {cw_} {ch_}">'
add('</g></svg>')

# preview.png's poster: the window, 3/4 size and bleeding off the right, beside name, claim and features.
FEATURES = [
    ("Spaces at a glance", "git state and agents, pane by pane"),
    ("Files with git built in", "all files, or only what changed"),
    ("A preview for every file", "Markdown, PDF, images, CSV, JSON, code"),
    ("Panes with names", "you give them"),
    ("Updates through your agent", "asks before it changes anything"),
]

def poster(window):
    inner = window[window.index(">") + 1: window.rindex("</svg>")]
    # The poster's own tones: amber for the claim, and text a touch softer than the window's.
    amber, mute, fg, accent = "#e8912a", "#8a8e96", "#f3f3f4", T["accent"]
    mark = base64.b64encode(open(f"{REPO}/assets/logo-mark.png", "rb").read()).decode()
    ww, wx, wy = 1440, 700, 372
    wh = ww * H / W
    def big(x, y, s, size, fill=fg, weight=700, ls=0):
        return f'<text x="{x}" y="{y}" font-family="{UI}" font-size="{size}" font-weight="{weight}" fill="{fill}" letter-spacing="{ls}">{escape(s)}</text>'
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         '<defs>'
         f'<symbol id="window" viewBox="0 0 {W} {H}">{inner}</symbol>'
         '<filter id="poster-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/></filter>'
         # Dark wool becomes white, the cream ground and the faces clear; only inside the picture.
         '<filter id="poster-mark" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'
         '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -.85 -.85 -.85 0 1.25"/></filter>'
         '<linearGradient id="poster-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121317"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>'
         f'<radialGradient id="poster-warm" cx="0%" cy="100%" r="60%"><stop offset="0" stop-color="{amber}" stop-opacity=".20"/><stop offset="1" stop-color="{amber}" stop-opacity="0"/></radialGradient>'
         f'<radialGradient id="poster-cool" cx="64%" cy="62%" r="55%"><stop offset="0" stop-color="{accent}" stop-opacity=".30"/>'
         '<stop offset=".5" stop-color="#7f8fc8" stop-opacity=".07"/><stop offset="1" stop-color="#7f8fc8" stop-opacity="0"/></radialGradient>'
         f'<clipPath id="poster-window"><rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" rx="16"/></clipPath>'
         '<clipPath id="poster-logo"><rect x="110" y="84" width="96" height="96" rx="23"/></clipPath>'
         '</defs>',
         f'<rect width="{W}" height="{H}" fill="url(#poster-bg)"/>',
         f'<rect width="{W}" height="{H}" fill="url(#poster-warm)"/>',
         f'<rect width="{W}" height="{H}" fill="url(#poster-cool)"/>',
         f'<g opacity=".08"><image x="1140" y="-78" width="560" height="560" filter="url(#poster-mark)" href="data:image/png;base64,{mark}"/></g>']
    # Rings around the herd, one arc of them in amber. The window covers the inner ring below
    # y = wy (from about -136deg on): the arc starts at -120deg, so all its 180px stay above it.
    arc = -120
    for i, rr in enumerate((560, 760, 980)):
        p.append(f'<circle cx="1420" cy="760" r="{rr}" fill="none" stroke="{accent}" stroke-opacity="{.12 - i * .03:.2f}" stroke-width="2"/>')
    p.append(f'<circle cx="1420" cy="760" r="560" fill="none" stroke="{amber}" stroke-opacity=".55" stroke-width="3" stroke-dasharray="180 3340" transform="rotate({arc} 1420 760)"/>')
    p += [f'<rect x="{wx}" y="{wy + 30}" width="{ww}" height="{wh}" rx="16" fill="#000" opacity=".75" filter="url(#poster-soft)"/>',
          f'<use href="#window" x="{wx}" y="{wy}" width="{ww}" height="{wh}" clip-path="url(#poster-window)"/>',
          f'<rect x="{wx + .5}" y="{wy + .5}" width="{ww - 1}" height="{wh - 1}" rx="16" fill="none" stroke="#ffffff" stroke-opacity=".13"/>',
          f'<image x="110" y="84" width="96" height="96" clip-path="url(#poster-logo)" href="data:image/png;base64,{logo}"/>',
          big(104, 316, "Herdr", 124, ls=-5), big(104, 440, "Roundup", 124, ls=-5),
          big(110, 520, "Round up the herd.", 46, amber, 600, -1.5),
          '<path d="M110 586H600" stroke="#ffffff" stroke-opacity=".10" stroke-width="2"/>']
    y = 652
    for title, sub in FEATURES:
        p += [f'<circle cx="122" cy="{y - 9}" r="6" fill="{amber}"/>',
              big(148, y, title, 30, weight=600, ls=-.5), big(148, y + 36, sub, 23, mute, 400)]
        y += 104
    p.append('</svg>')
    return p

if POSTER:
    out = poster("\n".join(out))
open(OUT, "w").write("\n".join(out) + "\n")
