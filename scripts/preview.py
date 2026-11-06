# Draws the Herdr-Roundup window as an SVG, with made-up spaces, agents and terminals:
# no one's real spaces, paths or sessions. Sizes come from layouts/Herdr-Roundup.json and
# the roundup- mods, colors from the graphite theme. Run from the repo:
#   python3 scripts/preview.py . layouts/Herdr-Roundup.svg
#   rsvg-convert -z 2 layouts/Herdr-Roundup.svg -o preview.png
import base64, sys
from html import escape

REPO, OUT = sys.argv[1], sys.argv[2]
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
}

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
add(f'<defs><clipPath id="win"><rect width="{W}" height="{H}" rx="12"/></clipPath>'
    f'<clipPath id="left"><rect x="278" y="80" width="571" height="782"/></clipPath>'
    f'<clipPath id="right"><rect x="859" y="80" width="572" height="782"/></clipPath></defs>')
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
text(104, 27.5, "Herdr Roundup", 13.5, "foreground", 600)
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

def agent(y, space, task, when, status, active=False):
    if active:
        rect(8, y, 252, 26, "selected", rx=7)
    icon("bot", 16, y + 6, 14, "ansi3", sw=2)
    spans(38, y + 17.5, [(space, "foreground", 500), (f" · {task}", "dim", 400)], 12.5, UI)
    text(234, y + 17.5, when, 11, "dim", anchor="end")
    if status == "working":
        spinner(248, y + 13, "working")
    elif status in ("blocked", "done"):
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

group("Blocked", 1, "blocked", [("fix-login", "Run the migration?", "4m", "blocked")])
group("Done", 1, "done", [("website", "Pricing page", "12m", "done")])
group("Working", 2, "working", [("search-filters", "Facet filters", "1m", "working", True),
                                ("research", "Benchmarks", "3m", "working")])
group("Idle", 3, "dim", [("search-filters", "Tests", "18m", "idle"),
                         ("dotfiles", "brew bundle", "1h", "idle"),
                         ("api-gateway", "Rate limits", "1d", "idle")])

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
icon("bot", WX + 18, 14, 14, "ansi3", sw=2)
text(WX + 38, 25.5, "search-filters", 13, "foreground", 500)
icon("close", WX + 140, 16, 10, "dim", sw=2.5)
icon("terminal", WX + 172, 15, 12, "muted", sw=2)
text(WX + 189, 25.5, "zsh", 13, "muted")
icon("terminal", WX + 228, 15, 12, "muted", sw=2)
text(WX + 245, 25.5, "dev server", 13, "muted")
icon("plus", W - 190, 15, 12, "dim", sw=2)
icon("files", W - 160, 15, 12, "muted", sw=2)
text(W - 144, 25.5, "Files", 12, "muted")
icon("compare", W - 98, 15, 12, "muted", sw=2)
text(W - 82, 25.5, "Changes", 12, "muted")

# The active tab's panes, 8px padding and gap, rounded 10px.
PY, PH = 50, H - 28 - 8 - 50
panes = [(WX + 8, 573, True), (WX + 8 + 573 + 8, W - 8 - (WX + 8 + 573 + 8), False)]
for px, pw, focus in panes:
    rect(px, PY, pw, PH, "background", rx=10)
    frame(px, PY, pw, PH, "accent" if focus else "border", rx=10)
    line(px + 1, PY + 30.5, px + pw - 1, PY + 30.5, "border")
    for k, name in enumerate(["close", "zoom", "split-down", "split-right"]):
        icon(name, px + pw - 22 - 26 * k, PY + 9, 12, "dim", sw=2)

lx, rx_ = panes[0][0], panes[1][0]
icon("bot", lx + 12, PY + 8, 14, "ansi3", sw=2)
text(lx + 32, PY + 19.5, "Claude Code", 12.5, "foreground", 600)
text(lx + 112, PY + 19.5, "~/code/atlas-search-filters", 12, "dim")
icon("terminal", rx_ + 12, PY + 9, 12, "muted", sw=2)
text(rx_ + 30, PY + 19.5, "zsh", 12.5, "foreground", 600)
text(rx_ + 56, PY + 19.5, "~/code/atlas-search-filters", 12, "dim")

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
add(f'<path d="M{lx + 14} {PY + 30 + 12 + 14 + 21 * 30 - 15}h545" stroke="{paint("raised")[0]}"/>')
add(f'<path d="M{lx + 14} {PY + 30 + 12 + 14 + 21 * 32 - 15}h545" stroke="{paint("raised")[0]}"/>')
rect(lx + 30, PY + 30 + 12 + 14 + 21 * 31 - 13, 8, 17, "terminal", op=0.85)

term(rx_ + 14, PY + 30 + 12 + 14, [
    [("~/code/atlas-search-filters ", "ansi6", 600), ("search-filters ", "ansi5", 400), ("↑3 ±5", D, 400)],
    [("❯ ", "ansi2", 600), ("git log --oneline -4", F, 400)],
    [("a41c2e9 ", "ansi3", 400), ("feat: facet counts in search results", F, 400)],
    [("7be03d1 ", "ansi3", 400), ("test: facets for an empty index", F, 400)],
    [("19f8a6c ", "ansi3", 400), ("refactor: one query builder for search", F, 400)],
    [("c02d5aa ", "ansi3", 400), ("chore: search index v3", F, 400)],
    [],
    [("~/code/atlas-search-filters ", "ansi6", 600), ("search-filters ", "ansi5", 400), ("↑3 ±5", D, 400)],
    [("❯ ", "ansi2", 600), ("git status --short", F, 400)],
    [(" M ", "ansi1", 400), ("src/search/facets.ts", F, 400)],
    [(" M ", "ansi1", 400), ("src/search/query.ts", F, 400)],
    [(" M ", "ansi1", 400), ("src/ui/ResultsHeader.tsx", F, 400)],
    [("?? ", "ansi1", 400), ("src/ui/FilterChip.tsx", F, 400)],
    [("?? ", "ansi1", 400), ("test/facets.test.ts", F, 400)],
    [],
    [("~/code/atlas-search-filters ", "ansi6", 600), ("search-filters ", "ansi5", 400), ("↑3 ±5", D, 400)],
    [("❯ ", "ansi2", 600)],
], "right")
rect(rx_ + 14 + 16, PY + 30 + 12 + 14 + 21 * 16 - 13, 8, 17, "terminal", op=0.5)

# Status bar, 28px.
SY = H - 28
rect(WX, SY, W - WX, 28, "chrome")
icon("monitor", WX + 14, SY + 8, 12, "dim")
text(WX + 31, SY + 18, "This computer", 11.5, "muted")
icon("branch", WX + 128, SY + 8, 12, "dim")
text(WX + 145, SY + 18, "search-filters", 11.5, "muted")
add(f'<circle cx="{WX + 243}" cy="{SY + 14}" r="2.5" fill="{paint("working")[0]}"/>')
text(WX + 251, SY + 18, "7 agents", 11.5, "muted")
text(W - 14, SY + 18, "⌘⇧P  commands", 11, "dim", anchor="end")

add('</g></svg>')
open(OUT, "w").write("\n".join(out) + "\n")
