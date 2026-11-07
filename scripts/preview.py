# Draws the Herdr-Roundup window as an SVG, with made-up spaces, agents and terminals:
# no one's real spaces, paths or sessions. Sizes come from layouts/Herdr-Roundup.json and
# the roundup- mods, colors from the graphite theme. A newer release is out (the brand row
# says so), and the side panel shows roundup-files in its All or Changed view. Run from the repo:
#   python3 scripts/preview.py . layouts/Herdr-Roundup.svg all
#   rsvg-convert -z 2 layouts/Herdr-Roundup.svg -o preview.png
#   python3 scripts/preview.py . /tmp/changed.svg changed
#   rsvg-convert -z 2 /tmp/changed.svg -o preview-changed.png
# Settings shows the SVG (All); RECIPE.md shows both PNGs.
import base64, json, os, re, sys
from html import escape

REPO, OUT = sys.argv[1], sys.argv[2]
VIEW = sys.argv[3] if len(sys.argv) > 3 else "all"
INSTALLED, RELEASE = "0.7.0", "0.8.0"
# Program icons come from the install, as Herdr draws them.
HOME = os.environ.get("HERDR_APP_HOME", os.path.expanduser("~/.config/herdr-app"))
W, H = 1440, 900

T = {
    "accent": "#96b2d7", "background": "#17191d", "blocked": "#f0705f", "border": "#ffffff18",
    "canvas": "#131518", "chrome": "#101114", "dim": "#696a6d", "done": "#76a8ff",
    "foreground": "#eeeeef", "hover": "#ffffff0e", "muted": "#98999b", "selected": "#ffffff17",
    "terminal": "#d2d4d9", "working": "#e5c07b", "raised": "#2c2e31",
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
    "terminal": '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    "sidebar": '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9.5 4v16"/>',
    "settings": '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    "bot": '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>',
    "split-right": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16"/>',
    "split-down": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 12h18"/>',
    "zoom": '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    "close": '<path d="M18 6 6 18M6 6l12 12"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
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

out = []
def add(s): out.append(s)

def paint(c):
    """A color as fill and opacity: #rrggbbaa isn't drawn everywhere."""
    c = T.get(c, c)
    if len(c) == 9:
        return c[:7], int(c[7:], 16) / 255
    return c, 1.0

def rect(x, y, w, h, fill, rx=0, op=None, stroke=None):
    f, o = paint(fill)
    o = o if op is None else op
    s = ""
    if stroke:
        sc, so = paint(stroke)
        s = f' stroke="{sc}" stroke-opacity="{so:.3f}" stroke-width="1"'
    fo = f' fill-opacity="{o:.3f}"' if o < 1 else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{f}"{fo}{s}/>')

def frame(x, y, w, h, stroke, rx=0):
    sc, so = paint(stroke)
    add(f'<rect x="{x + .5}" y="{y + .5}" width="{w - 1}" height="{h - 1}" rx="{rx}" fill="none" stroke="{sc}" stroke-opacity="{so:.3f}"/>')

def line(x1, y1, x2, y2, color):
    c, o = paint(color)
    add(f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{c}" stroke-opacity="{o:.3f}" stroke-width="1"/>')

def text(x, y, s, size=13, fill="foreground", weight=400, anchor="start", family=UI, spaces=False):
    c, o = paint(fill)
    fo = f' fill-opacity="{o:.3f}"' if o < 1 else ""
    ws = ' xml:space="preserve"' if spaces else ""
    add(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{c}"{fo} text-anchor="{anchor}"{ws}>{escape(s)}</text>')

def spans(x, y, parts, size=13, family=MONO):
    """One line of text in several colors: [(text, color, weight), ...]."""
    inner = "".join(
        f'<tspan fill="{paint(c)[0]}" font-weight="{w}">{escape(s)}</tspan>' for s, c, w in parts)
    add(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" xml:space="preserve">{inner}</text>')

def icon(name, x, y, size, color, sw=1.5):
    c, o = paint(color)
    k = size / 24
    add(f'<g transform="translate({x} {y}) scale({k:.4f})" fill="none" stroke="{c}" stroke-opacity="{o:.3f}" '
        f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" color="{c}">{ICON[name]}</g>')

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
    add(f'<image x="{x}" y="{y}" width="{size}" height="{size}" href="data:image/svg+xml;base64,{data}"/>')

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
    add(f'<image x="{x}" y="{y}" width="{size}" height="{size}"{o} href="data:image/svg+xml;base64,{data}"/>')

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

# ---- window ----
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add(f'<defs><clipPath id="win"><rect width="{W}" height="{H}" rx="12"/></clipPath></defs>')
add('<g clip-path="url(#win)">')
rect(0, 0, W, H, "canvas")

# ---- sidebar (268px, chrome) ----
SB = 268
rect(0, 0, SB, H, "chrome")
line(SB + .5, 0, SB + .5, H, "border")

# Brand row, 46px: traffic lights at [12, 16], then the sheep, the name, search and toggle.
for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
    add(f'<circle cx="{18 + 20 * i}" cy="22" r="6" fill="{c}"/>')
logo = base64.b64encode(open(f"{REPO}/mods/roundup-workspace-chrome/logo.png", "rb").read()).decode()
add(f'<clipPath id="logo"><rect x="76" y="13" width="20" height="20" rx="5"/></clipPath>')
add(f'<image x="76" y="13" width="20" height="20" clip-path="url(#logo)" href="data:image/png;base64,{logo}"/>')
# A newer release: a point on the logo's corner (10px, a 2px chrome ring) and "<version> available" under the name.
add(f'<circle cx="94" cy="15" r="5" fill="{paint("chrome")[0]}"/><circle cx="94" cy="15" r="3" fill="{paint("accent")[0]}"/>')
text(104, 21.5, "Herdr Roundup", 13, "foreground", 600)
text(104, 35, f"{RELEASE} available", 11, "accent")
icon("search", 207.5, 15.5, 15, "muted")
icon("sidebar", 237.5, 15.5, 15, "muted")

# Spaces, 46..490: a header row, then the rows.
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

y = 77
# A repo and two worktrees on one card.
y += 6
cx, cw = 8, 252
card_top = y
inner = []
inner.append(dict(name="search-filters", tree=True, git=("", 3, 0, 5), crew=(2, "working"), active=True))
inner.append(dict(name="fix-login", tree=True, git=("fix/login-redirect", 0, 0, 1), crew=(1, "blocked")))
inner.append(dict(name="release-2.4", tree=True, git=("release/2.4", 0, 2, 0)))
# No space in the main checkout (Herdr makes each worktree its own space): the repo's name heads the card.
icon("folder", cx + 3 + 9, y + 3 + 6, 12, "dim", sw=2)
text(cx + 3 + 9 + 12 + 7, y + 3 + 16, "atlas", 11.5, "muted", 500)
ry = y + 3 + 24 + 2
for r in inner:
    ry += row(cx + 3, ry, cw - 6, **r) + 2
card_h = ry - 2 + 3 - card_top
frame(cx, card_top, cw, card_h, "border", rx=10)
y = card_top + card_h + 6 + 2
for r in [
    dict(name="website", letter="W", color="ansi3", git=("acme-site · feat/pricing", 1, 0, 0), crew=(1, "done")),
    dict(name="api-gateway", letter="A", color="ansi4", git=("", 0, 4, 0), crew=(1, "idle")),
    dict(name="notes", letter="N", color="ansi5"),
    dict(name="dotfiles", letter="D", color="ansi2", git=("", 0, 0, 7), crew=(1, "idle")),
    dict(name="research", letter="R", color="ansi1", git=("papers · draft-v2", 0, 0, 0), crew=(1, "working")),
]:
    y += row(8, y, 252, **r) + 2

# Agents (Herdr's shipped list), 490..831.
AY = 490
text(16, AY + 20, "Agents", 11.5, "dim")
icon("clock", 238, AY + 9, 13, "dim", sw=2)
ay = AY + 31

def spinner(cx, cy, color):
    c, _ = paint(color)
    add(f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="none" stroke="{paint("raised")[0]}" stroke-width="1.5"/>')
    add(f'<path d="M{cx} {cy - 4.5}a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>')

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
group("Done", 1, "done", [("claude", "website", "Pricing page", "12m", "done")])
group("Working", 2, "working", [("claude", "search-filters", "Facet filters", "1m", "working", True),
                                ("pi", "research", "Benchmarks", "3m", "working")])
group("Idle", 3, "dim", [("codex", "search-filters", "Tests", "18m", "idle"),
                         ("pi", "dotfiles", "brew bundle", "1h", "idle"),
                         ("claude", "api-gateway", "Rate limits", "1d", "idle")])

# Footer, 69px.
FY = H - 69
line(0, FY + .5, SB, FY + .5, "border")
icon("settings", 16, FY + 11, 14, "muted", sw=2)
text(39, FY + 23, "Settings", 13, "muted")
icon("plus", 16, FY + 39, 14, "dim", sw=2)
text(39, FY + 51, "Add machine", 13, "dim")

# ---- work area ----
WX = SB + 1
# Tabs, 42px.
rect(WX + 8, 8, 150, 26, "selected", rx=6)
program("claude", WX + 18, 14, 14, "muted")
text(WX + 38, 25.5, "search-filters", 13, "foreground", 500)
icon("close", WX + 140, 16, 10, "dim", sw=2.5)
program("shell", WX + 171, 14, 14, "muted")
text(WX + 189, 25.5, "zsh", 13, "muted")
program("vite", WX + 227, 14, 14, "muted")
text(WX + 245, 25.5, "dev server", 13, "muted")
# The panel buttons (26px, 8px sides, 14px icon, 5px gap), 3px apart, 10px from the edge; Files is on.
bx = W - 10
for name, label, glyph, on in reversed([("files", "Files", "files", True), ("changes", "Changes", "compare", False)]):
    bw = 8 + 14 + 5 + tw(label, 12) + 8
    bx -= bw
    if on:
        rect(round(bx, 1), 8, round(bw, 1), 26, "selected", rx=6)
    icon(glyph, round(bx + 8, 1), 14, 14, "foreground" if on else "muted", sw=2)
    text(round(bx + 27, 1), 25.5, label, 12, "foreground" if on else "muted")
    bx -= 3
icon("plus", round(bx - 22, 1), 15, 12, "dim", sw=2)

# The active tab's pane and the side panel, 8px padding and gap, rounded 10px. The panel is 368px.
PY, PH = 50, H - 28 - 8 - 50
PW = 368
PX = W - 8 - PW
panes = [(WX + 8, PX - 8 - (WX + 8), True)]
add(f'<defs><clipPath id="left"><rect x="{WX + 9}" y="{PY + 31}" width="{panes[0][1] - 2}" height="{PH - 32}"/></clipPath></defs>')
for px, pw, focus in panes:
    rect(px, PY, pw, PH, "background", rx=10)
    frame(px, PY, pw, PH, "accent" if focus else "border", rx=10)
    line(px + 1, PY + 30.5, px + pw - 1, PY + 30.5, "border")
    for k, name in enumerate(["close", "zoom", "split-down", "split-right"]):
        icon(name, px + pw - 22 - 26 * k, PY + 9, 12, "dim", sw=2)

lx, lw = panes[0][0], panes[0][1]
program("claude", lx + 12, PY + 8, 14, "dim")
text(lx + 32, PY + 19.5, "Claude Code", 12.5, "foreground", 600)
text(lx + 112, PY + 19.5, "~/code/atlas-search-filters", 12, "dim")

def term(x, y, lines, clip):
    add(f'<g clip-path="url(#{clip})">')
    for i, parts in enumerate(lines):
        if parts:
            spans(x, y + 21 * i, parts, 13)
    add('</g>')

F, D, M = "terminal", "dim", "muted"
term(lx + 14, PY + 30 + 12 + 14, [
    [("● ", F, 400), ("I'll add facet filters to the search endpoint, then", F, 400)],
    [("  the filter chips above the results.", F, 400)],
    [],
    [("● ", "ansi2", 400), ("Read ", F, 600), ("src/search/query.ts", D, 400)],
    [("● ", "ansi2", 400), ("Read ", F, 600), ("src/search/facets.ts", D, 400)],
    [("● ", "ansi2", 400), ("Update ", F, 600), ("src/search/facets.ts", D, 400)],
    [("   14 ", D, 400), ("+ export function facetCounts(hits, fields) {", "ansi2", 400)],
    [("   15 ", D, 400), ("+   const counts = new Map();", "ansi2", 400)],
    [("   16 ", D, 400), ("+   for (const hit of hits) {", "ansi2", 400)],
    [("   17 ", D, 400), ("+     for (const f of fields) bump(counts, f, hit[f]);", "ansi2", 400)],
    [("   18 ", D, 400), ("+   }", "ansi2", 400)],
    [("   19 ", D, 400), ("+   return counts;", "ansi2", 400)],
    [("   20 ", D, 400), ("+ }", "ansi2", 400)],
    [],
    [("● ", "ansi2", 400), ("Bash ", F, 600), ("npm test -- search", D, 400)],
    [("  ✓ 42 tests passed ", "ansi2", 400), ("(1.8s)", D, 400)],
    [],
    [("● ", F, 400), ("Every search now returns facet counts. Next: the", F, 400)],
    [("  chips in the results header, and a test for an", F, 400)],
    [("  empty hit list.", F, 400)],
    [],
    [("● ", "ansi2", 400), ("Update ", F, 600), ("src/ui/ResultsHeader.tsx", D, 400)],
    [("   31 ", D, 400), ("+ <div className=\"chips\">", "ansi2", 400)],
    [("   32 ", D, 400), ("+   {facets.map((f) => <FilterChip {...f} />)}", "ansi2", 400)],
    [("   33 ", D, 400), ("+ </div>", "ansi2", 400)],
    [],
    [],
    [],
    [],
    [("✻ ", "working", 400), ("Wiring the chips… ", "working", 400), ("(1m 12s · esc to interrupt)", D, 400)],
    [],
    [("› ", M, 400), ("", F, 400)],
    [],
    [("  ? for shortcuts", D, 400)],
], "left")
# The prompt's box and cursor.
add(f'<path d="M{lx + 14} {PY + 30 + 12 + 14 + 21 * 30 - 15}h{lw - 28}" stroke="{paint("raised")[0]}"/>')
add(f'<path d="M{lx + 14} {PY + 30 + 12 + 14 + 21 * 32 - 15}h{lw - 28}" stroke="{paint("raised")[0]}"/>')
rect(lx + 30, PY + 30 + 12 + 14 + 21 * 31 - 13, 8, 17, "terminal", op=0.85)

# ---- side panel: roundup-files, 368px ----
# The same folder as the pane: three files modified, two new, three commits ahead.
def r(v):
    return round(v, 1)

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
rect(r(sx), hcy - 12, r(2 + w_all + 2 + w_ch + 2), 24, "raised", rx=7)
for view, label, bw, bx_ in [("all", "All", w_all, sx + 2), ("changed", "Changed", w_ch, sx + 2 + w_all + 2)]:
    on = VIEW == view
    if on:
        rect(r(bx_), hcy - 10, r(bw), 20, "background", rx=5)
    text(r(bx_ + 8), hcy + 4, label, 12, "foreground" if on else "dim")
    if view == "changed":
        text(r(bx_ + 8 + tw(label, 12) + 5), hcy + 4, str(CHANGED), 11, "muted" if on else "dim")
folder = "atlas-search-filters"
text(X1 - 12, hcy + 4, folder, 12, "dim", anchor="end")
file_icon(ICONS["rootFolder"], r(X1 - 12 - tw(folder, 12) - 6 - 14), hcy - 7, 14)
line(X0, PY + 1 + 41.5, X1, PY + 1 + 41.5, "border")

# Branch row, 46px: the branch, ↑ahead, the lines changed; under it the bar of modified and new paths.
by = PY + 1 + 42
l1 = by + 14.5
icon("branch", X0 + 12, l1 - 6, 12, "muted")
text(X0 + 30, l1 + 4, "search-filters", 12, "foreground", 500)
text(r(X0 + 30 + tw("search-filters", 12, 500) + 6), l1 + 4, "↑3", 12, "muted")
text(X1 - 12, l1 + 4, "−14", 11.5, "ansi1", anchor="end")
text(r(X1 - 12 - tw("−14", 11.5) - 6), l1 + 4, "+48", 11.5, "ansi2", anchor="end")
bar = by + 6.5 + 16 + 7 + 3
room = PW - 26 - 26 * 2 - 2 * 2
xb = X0 + 12
for n, col in [(3, "ansi3"), (2, "ansi2")]:
    w_ = max(3, room * n / 5)
    rect(r(xb), bar, r(w_), 4, col, rx=2)
    xb += w_ + 2
text(X1 - 12 - 26, bar + 4.5, "3", 10.5, "ansi3", anchor="end")
text(X1 - 12, bar + 4.5, "2", 10.5, "ansi2", anchor="end")
line(X0, by + 45.5, X1, by + 45.5, "border")

# Search field, 28px; in All the source switch at its end, lit: search reads git's files.
sy = by + 46 + 8
rect(X0 + 8, sy, X1 - X0 - 16, 28, "canvas", rx=7)
frame(X0 + 8, sy, X1 - X0 - 16, 28, "border", rx=7)
icon("search", X0 + 16, sy + 7.5, 13, "dim")
text(X0 + 16 + 13 + 6, sy + 18, "Search files", 12, "dim")
if VIEW == "all":
    rect(X1 - 16 - 20, sy + 4, 20, 20, "raised", rx=5)
    icon("branch", X1 - 16 - 20 + 3.5, sy + 7.5, 13, "accent")

# The tree: 26px rows, 14px a level. Names in their status color, files end with +N −N and their
# letter, folders with a dot and count for new, modified and deleted below them, and their +N −N.
STATUS = {"M": "ansi3", "?": "ansi2", "A": "ansi2", "D": "ansi1"}

def frow(y, rel, depth, folder=False, open_=False, st=None, lines=(0, 0), counts=None, ignored=False, selected=False):
    x0, x1 = X0 + 4, X1 - 4
    if selected:
        rect(x0, y, x1 - x0, 26, "selected", rx=6)
    cy = y + 13
    x = x0 + 8 + depth * 14
    if folder:
        icon("chevron-down" if open_ else "chevron-right", x, cy - 6, 12, "dim", sw=2)
    x += 12 + 6
    file_icon(icon_for(rel, folder, open_), x, cy - 8, 16, 0.5 if ignored else 1)
    x += 16 + 6
    color = "dim" if ignored else STATUS.get(st, "foreground")
    text(x, cy + 4.5, rel.split("/")[-1], 13, color)
    rr = x1 - 10
    if st and not folder:
        text(rr, cy + 4, st, 11, color, 600, anchor="end")
    rr -= 12
    parts = [(str(n), ["ansi2", "ansi3", "ansi1"][i], True) for i, n in enumerate(counts or []) if n]
    parts += [(f"+{lines[0]}", "ansi2", False)] if lines[0] else []
    parts += [(f"−{lines[1]}", "ansi1", False)] if lines[1] else []
    for s, col, dot in reversed(parts):
        rr -= 6
        text(r(rr), cy + 4, s, 11, col, anchor="end")
        rr -= tw(s, 11)
        if dot:
            add(f'<circle cx="{r(rr - 6)}" cy="{cy}" r="3" fill="{paint(col)[0]}"/>')
            rr -= 3 + 6

if VIEW == "all":
    tree = [
        (".github", 0, dict(folder=True)),
        ("node_modules", 0, dict(folder=True, ignored=True)),
        ("public", 0, dict(folder=True)),
        ("src", 0, dict(folder=True, open_=True, counts=(1, 3, 0), lines=(48, 14))),
        ("src/search", 1, dict(folder=True, open_=True, counts=(0, 2, 0), lines=(31, 9))),
        ("src/search/facets.ts", 2, dict(st="M", lines=(24, 3), selected=True)),
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
        ("index.html", 0, {}),
        ("package.json", 0, {}),
        ("package-lock.json", 0, {}),
        ("README.md", 0, {}),
        ("tsconfig.json", 0, {}),
        ("vite.config.ts", 0, {}),
    ]
else:
    tree = [
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
ly = sy + 28 + 4
for i, (rel, depth, kw) in enumerate(tree):
    frow(ly + 26 * i, rel, depth, **kw)

# Status bar, 28px.
SY = H - 28
rect(WX, SY, W - WX, 28, "chrome")
icon("monitor", WX + 14, SY + 8, 12, "dim")
text(WX + 31, SY + 18, "This computer", 11.5, "muted")
icon("branch", WX + 128, SY + 8, 12, "dim")
text(WX + 145, SY + 18, "search-filters", 11.5, "muted")
# Herdr's workspace-status mod: a dim dot, the count, and the blocked ones in their color.
add(f'<circle cx="{WX + 243}" cy="{SY + 14}" r="3" fill="{paint("dim")[0]}"/>')
spans(WX + 252, SY + 18, [("7 agents", "muted", 400), ("  · 1 needs you", "blocked", 400)], 11.5, UI)
text(W - 14, SY + 18, "⌘⇧P  commands", 11, "dim", anchor="end")

add('</g></svg>')
open(OUT, "w").write("\n".join(out) + "\n")
