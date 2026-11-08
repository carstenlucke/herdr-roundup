#!/bin/bash
# L3 smoke tests (tests/CATALOG.md, level L3) in a second, isolated Herdr window beside yours.
#
# Usage: scripts/smoke.sh [--offline] [--out DIR] [--keep-home]
#   --offline    no request to api.github.com: CHR-33 is skipped and the update check is seeded off,
#                so CHR-34 only tests its second half
#   --out DIR    where the shots, the result list and the logs go (default: $TMPDIR/herdr-smoke-<time>)
#   --keep-home  keep the test home and the fixtures afterwards (the window and its core still go)
#
# It starts /Applications/Herdr.app with its own HERDR_APP_HOME (/tmp/hrs-<pid>, a symlink to a
# folder under $TMPDIR: the control socket's path has a length limit), its own HERDR_APP_ID and
# HC_SESSION, no sounds, no telemetry and no app update (HERDR_RELEASES_URL points nowhere). The home
# is seeded so no Welcome or What's new opens; this checkout is installed there with scripts/sync.sh.
# Your window, your home (~/.config/herdr-app) and your terminals are never touched: every
# herdr-app call goes through app(), which refuses any home but the test one.
# The test window comes to the front while it runs (a covered window doesn't draw, and a shot
# would show an old frame): keep your hands off it for the minute or two it takes.
# It prints ok / FAIL / SHOT (look at the picture) / skip per catalog id and exits 1 on any FAIL.
# On exit, error or ctrl-c it quits the test window, stops its herdr-core session and removes the home.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
APP_BIN=/Applications/Herdr.app/Contents/MacOS/Herdr
OFFLINE=0 KEEP=0 OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1 ;;
    --keep-home) KEEP=1 ;;
    --out) OUT=${2:?--out needs a folder}; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "smoke.sh: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "smoke.sh: $*" >&2; exit 1; }
for tool in jq git python3 rsync sips osascript herdr-app hc; do command -v "$tool" >/dev/null || die "needs $tool"; done
[ -x "$APP_BIN" ] || die "no Herdr app at $APP_BIN"

# ── the isolated instance ─────────────────────────────────────────────────────────────────
TAG=hrs-$$
TH=/tmp/$TAG                       # the test home, as Herdr sees it (short: socket path limit)
SESSION=$TAG                       # its herdr-core session
APP_ID=roundup-smoke-$$
USER_APP_HOME=$HOME/.config/herdr-app
# Your core, read before anything points at ours: cleanup only stops a core that isn't this one.
USER_CORE=$(hc server status 2>/dev/null | jq -r '.core.id // empty' || true)
[ ! -e "$TH" ] || die "$TH exists already"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/herdr-smoke.XXXXXX")
WORK=$(cd "$WORK" && pwd -P)
mkdir "$WORK/home" "$WORK/fx"
ln -s "$WORK/home" "$TH"
OUT=${OUT:-${TMPDIR:-/tmp}/herdr-smoke-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd -P)
PID="" STARTED=0

# Everything below that could reach Herdr reaches the test instance, even a call that forgot app().
export HERDR_APP_HOME=$TH HC_SESSION=$SESSION

# The test home, or stop: never the person's ~/.config/herdr-app, never anything outside $WORK.
guard() {
  [ -n "${TH:-}" ] && [ -L "$TH" ] && [ -d "$TH" ] || die "test home $TH is missing"
  local real mine
  real=$(cd "$TH" && pwd -P)
  mine=$(cd "$USER_APP_HOME" 2>/dev/null && pwd -P || echo /nonexistent)
  [ "$real" != "$mine" ] || die "test home points at $USER_APP_HOME"
  [ "$real" = "$WORK/home" ] || die "test home $TH points at $real, not $WORK/home"
}
# The only way this script runs herdr-app.
app() { guard; HERDR_APP_HOME=$TH HC_SESSION=$SESSION command herdr-app "$@"; }
# And the only way it runs scripts/sync.sh (which calls herdr-app itself).
sync_home() { guard; HERDR_APP_HOME=$TH HC_SESSION=$SESSION "$REPO/scripts/sync.sh"; }

# wait_for <seconds> <shell condition>: true once the condition holds, false after the time.
wait_for() {
  local end=$((SECONDS + $1)); shift
  while :; do
    if eval "$*"; then return 0; fi
    [ "$SECONDS" -lt "$end" ] || return 1
    sleep 0.25
  done
}

alive() { app status >/dev/null 2>&1; }
status_json() { app status 2>/dev/null; }
ls_json() { app ls 2>/dev/null; }
errors() { status_json | jq -c '.errors // []'; }
clean() { [ "$(errors)" = "[]" ]; }
# A shared key of the test home, as JSON (null when unset). Herdr writes shared.json with a delay.
sh_get() { jq -c --arg k "$1" 'if has($k) then .[$k] else null end' "$TH/shared.json" 2>/dev/null || echo null; }
# Edits shared.json with a jq filter, while the window is closed (it would write over it).
sh_edit() {
  ! alive || die "shared.json edited while the window runs"
  jq "$1" "$TH/shared.json" > "$TH/shared.json.tmp" && mv "$TH/shared.json.tmp" "$TH/shared.json"
}
# `do`: prints the result, fails on {"error"}.
cmd() { app do "$@"; }

find_pid() {
  # The app holding the test home's control socket; its command line is the same as yours.
  lsof -t -U 2>/dev/null | while read -r p; do
    lsof -a -p "$p" -U 2>/dev/null | grep -q "$WORK/home/herdr-app.sock\|$TH/herdr-app.sock" && { echo "$p"; break; }
  done
}
frontmost() { osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true' 2>/dev/null; }
# Brings the test window to the front; false when it isn't there after a few tries (someone clicked elsewhere).
front() {
  [ -n "$PID" ] || return 1
  local i
  for i in 1 2 3 4 5 6 7 8; do
    osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $PID) to true" >/dev/null 2>&1 || true
    sleep 0.25
    [ "$(frontmost)" != "$PID" ] || return 0
    sleep 0.5
  done
  return 1
}
# shot <name>: the window, in front and a frame or two later. A covered window doesn't draw, and
# its shot would be an old frame: without the front, no shot.
shot() {
  front || { echo "  shot $1: the test window isn't in front (frontmost pid $(frontmost), test pid ${PID:-?})" >&2; return 1; }
  sleep 1
  [ "$(frontmost)" = "$PID" ] || { echo "  shot $1: the test window lost the front" >&2; return 1; }
  app shot "$OUT/$1.png" >/dev/null 2>&1 || { echo "  (no shot $1)" >&2; return 1; }
}
# crop_md5 <png> <x0 fraction> <y0 fraction>: md5 of the part right of x0 and below y0 (the panel).
crop_md5() {
  python3 -I - "$@" <<'PY'
import sys, zlib, struct, hashlib
path, fx, fy = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
data = open(path, "rb").read()
pos, chunks = 8, []
w = h = 0
while pos < len(data):
    n, = struct.unpack(">I", data[pos:pos+4]); t = data[pos+4:pos+8]; body = data[pos+8:pos+8+n]; pos += 12 + n
    if t == b"IHDR": w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
    elif t == b"IDAT": chunks.append(body)
raw = zlib.decompress(b"".join(chunks))
bpp = {6: 4, 2: 3}[ctype]
stride = w * bpp
x0, y0 = int(w * fx), int(h * fy)
# Undo the PNG filters row by row, hashing the cropped part of each row.
prev = bytearray(stride); out = hashlib.md5(); i = 0
for y in range(h):
    f = raw[i]; row = bytearray(raw[i+1:i+1+stride]); i += 1 + stride
    for x in range(stride):
        a = row[x-bpp] if x >= bpp else 0; b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
        if f == 1: row[x] = (row[x] + a) & 255
        elif f == 2: row[x] = (row[x] + b) & 255
        elif f == 3: row[x] = (row[x] + (a + b) // 2) & 255
        elif f == 4:
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            row[x] = (row[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    if y >= y0: out.update(row[x0*bpp:])
    prev = row
print(out.hexdigest())
PY
}

start_app() {
  guard
  ! alive || die "a test window runs already"
  (cd "$WORK" && HERDR_APP_HOME=$TH HERDR_APP_ID=$APP_ID HC_SESSION=$SESSION HERDR_APP_NO_SOUND=1 \
    HERDR_TELEMETRY=0 HERDR_RELEASES_URL=http://127.0.0.1:9/ nohup "$APP_BIN" >>"$OUT/app.log" 2>&1 &)
  STARTED=1
  wait_for 60 alive || die "the test window didn't answer within 60 s (see $OUT/app.log)"
  PID=$(find_pid || true)
  [ -n "$PID" ] || die "can't find the test window's process"
  echo "test window: pid $PID" >> "$OUT/app.log"
  # The first frame: shot fails before it.
  wait_for 30 'front && app shot "$WORK/first.png" >/dev/null 2>&1' || die "the test window drew no frame (or didn't come to the front)"
}
gone() { [ -z "$PID" ] || ! ps -p "$PID" >/dev/null 2>&1; }
quit_app() {
  alive || return 0
  app do app.quit >/dev/null 2>&1 || true
  wait_for 30 '! alive' || echo "smoke.sh: the test window didn't quit" >&2
  # The socket goes before the process: shared.json may still be written until it ends.
  wait_for 30 gone || echo "smoke.sh: the test app (pid $PID) is still running" >&2
  PID=""
  sleep 1
}
restart_app() { quit_app; start_app; }

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  set +e
  if [ -L "$TH" ]; then
    quit_app
    # Its core: only when this session's core isn't yours (another id) and the session is ours.
    if [ "$STARTED" = 1 ] && [ "$HC_SESSION" = "$SESSION" ]; then
      local core
      core=$(HC_SESSION=$SESSION hc server status 2>/dev/null | jq -r '.core.id // empty')
      if [ -n "$core" ] && [ "$core" != "$USER_CORE" ]; then
        HC_SESSION=$SESSION hc ls > "$OUT/hc-ls-at-exit.json" 2>&1
        HC_SESSION=$SESSION hc server stop >/dev/null 2>&1 || echo "smoke.sh: couldn't stop core session $SESSION" >&2
      fi
    fi
    rm -f "$TH"
  fi
  if [ "$KEEP" = 1 ]; then echo "test home kept: $WORK/home"; else rm -rf "$WORK"; fi
  echo "shots and logs: $OUT"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── results ───────────────────────────────────────────────────────────────────────────────
FAILS=0
: > "$OUT/results.txt"
res() {
  printf '%-7s %-4s %s\n' "$1" "$2" "$3" | tee -a "$OUT/results.txt"
  [ "$2" != FAIL ] || FAILS=$((FAILS + 1))
}
# case_ <id> <function>: the function returns 0 for ok, 1 for FAIL (reason in WHY), 2 for SHOT
# (passed what can be checked, the picture needs a look), 3 for skip.
WHY=""
case_() {
  local id=$1 rc=0; WHY=""
  "$2" || rc=$?
  case $rc in
    0) res "$id" ok "${WHY:-}" ;;
    2) res "$id" SHOT "${WHY:-}" ;;
    3) res "$id" skip "${WHY:-}" ;;
    *) res "$id" FAIL "${WHY:-failed}" ;;
  esac
}
# fail <why>: for the result line; status and ls at that moment go to $OUT/fail-<n>-*.json.
NFAIL=0
fail() {
  WHY=$*
  NFAIL=$((NFAIL + 1))
  status_json > "$OUT/fail-$NFAIL-status.json" 2>/dev/null || true
  ls_json > "$OUT/fail-$NFAIL-ls.json" 2>/dev/null || true
  WHY="$WHY (fail-$NFAIL-*.json)"
  return 1
}

# ── the home, seeded ──────────────────────────────────────────────────────────────────────
# frame/welcome records `frame.welcomed` (finished/skipped) and `workspace.panels` in shared.json;
# update-notes.json's `presented` keeps What's new from opening for this version.
VERSION=$(herdr-app --version | awk '{print $2}')
jq -n --argjson off "$OFFLINE" '{"frame.welcomed": "finished", "workspace.panels": ["files", "changes"]}
  + (if $off == 1 then {"roundup-workspace-chrome.update.auto": false} else {} end)' > "$TH/shared.json"
jq -n --arg v "$VERSION" '{last_run: $v, presented: [$v]}' > "$TH/update-notes.json"
jq -n '{sounds: {enabled: false}, telemetry: false}' > "$TH/settings.json"
echo '{}' > "$TH/keys.json"

# ── fixtures ──────────────────────────────────────────────────────────────────────────────
FX=$WORK/fx
g() { git -C "$FX/repo" -c user.name=smoke -c user.email=smoke@example.invalid -c commit.gpgsign=false "$@"; }
mkdir "$FX/repo"
g init -q -b main
for f in gone changed staged kept; do echo "$f" > "$FX/repo/$f.txt"; done
g add -A && g commit -qm fixture
rm "$FX/repo/gone.txt"                                  # D
echo more >> "$FX/repo/changed.txt"                     # M
echo new > "$FX/repo/new.txt"                           # ?
echo more >> "$FX/repo/staged.txt" && g add staged.txt  # M, staged

mkdir -p "$FX/links/real"
echo target > "$FX/links/target.txt"
echo inside > "$FX/links/real/inside.txt"
ln -s target.txt "$FX/links/to-file"
ln -s real "$FX/links/to-folder"
ln -s missing.txt "$FX/links/broken"

P=$FX/preview
mkdir "$P"
cp "$REPO/mods/roundup-workspace-chrome/logo.png" "$P/image.png"
cat > "$P/pic.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" rx="8" fill="#3b82f6"/><circle cx="60" cy="30" r="16" fill="white"/></svg>
SVG
cat > "$P/notes.md" <<'MD'
# Smoke notes

A paragraph with **bold**, `code` and a [link](https://example.invalid).

![a local svg](pic.svg)

- one
- two

| a | b |
|---|---|
| 1 | 2 |
MD
printf 'name,count\nalpha,1\nbeta,2\ngamma,3\n' > "$P/data.csv"
echo '{"name": "smoke", "list": [1, 2, 3], "nested": {"ok": true}}' > "$P/data.json"
printf 'export function add(a: number, b: number): number {\n  return a + b;\n}\n' > "$P/code.ts"
# A two-page PDF, written by hand.
python3 -I - "$P/two-pages.pdf" <<'PY'
import sys
objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"]
for page, text in ((3, "Page one"), (5, "Page two")):
    stream = f"BT /F1 36 Tf 72 700 Td ({text}) Tj ET"
    objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {page + 1} 0 R /Resources << /Font << /F1 7 0 R >> >> >>")
    objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
out, offsets = b"%PDF-1.4\n", []
for i, o in enumerate(objs, 1):
    offsets.append(len(out)); out += f"{i} 0 obj\n{o}\nendobj\n".encode()
xref = len(out)
out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
open(sys.argv[1], "wb").write(out)
PY

# ── helpers on the running window ─────────────────────────────────────────────────────────
space_by_name() { ls_json | jq -r --arg n "$1" '.spaces[] | select(.name == $n) | .id' | head -1; }
tabs_of() { ls_json | jq -c --arg s "$1" '[.spaces[] | select(.id == $s) | .tabs[] | .id]'; }
# The panel (Files) shown for the focused space.
show_files() {
  cmd layout.select --stack panel-body --child files >/dev/null &&
    cmd layout.show --id panel >/dev/null
}
new_space() { # new_space <name> <folder>: prints its id
  local name=$1
  cmd space.new --name "$name" --folder "$2" >/dev/null || return 1
  wait_for 10 '[ -n "$(space_by_name "$name")" ]' || return 1
  space_by_name "$name"
}
focused_space() { status_json | jq -r '.space // .focused_space // empty'; }

# ── run ───────────────────────────────────────────────────────────────────────────────────
echo "Herdr smoke: test home $TH -> $WORK/home, session $SESSION, out $OUT"
start_app
sync_home > "$OUT/sync.log" 2>&1 || { cat "$OUT/sync.log" >&2; die "scripts/sync.sh failed"; }
status_json > "$OUT/status-start.json" || true

t_lay18() {
  local m bad=""
  for m in "$TH"/mods/roundup-*/; do
    app check "$m" > "$OUT/check-$(basename "$m").log" 2>&1 || bad="$bad $(basename "$m")"
  done
  [ -z "$bad" ] || { fail "check failed:$bad"; return; }
  wait_for 10 clean || { fail "status errors: $(errors)"; return; }
}
t_lay19() {
  cmd layout.switch --name Herdr-Roundup >/dev/null || { fail "layout.switch failed"; return; }
  wait_for 10 '[ "$(status_json | jq -r .layout)" = Herdr-Roundup ]' || { fail "status layout: $(status_json | jq -r .layout)"; return; }
}
t_lay20() {
  local f missing=""
  for f in workspace-chrome/{spinner,check,branch,folder,plus,monitor,server,chevron-down,chevron-right,square-pen,x,panel-right,square,terminal}.svg \
           pane/close.svg files/file.svg changes/changes.svg; do
    [ -f "$TH/mods/$f" ] || missing="$missing $f"
  done
  [ -z "$missing" ] || { fail "missing:$missing"; return; }
}
t_vw28() { app check "$TH/mods/roundup-preview" > "$OUT/check-roundup-preview.log" 2>&1 || { fail "$(tail -3 "$OUT/check-roundup-preview.log")"; }; return; }

case_ LAY-19 t_lay19
case_ LAY-18 t_lay18
case_ LAY-20 t_lay20
case_ VW-28 t_vw28
status_json > "$OUT/status-roundup.json" || true
ls_json > "$OUT/ls-start.json" || true
shot 00-roundup || true

# The update check at start (CHR-34): `lastCheck` is written before the fetch answers.
LAST1=null
if [ "$OFFLINE" = 0 ]; then
  wait_for 15 '[ "$(sh_get roundup-workspace-chrome.update.lastCheck)" != null ]' || true
  LAST1=$(sh_get roundup-workspace-chrome.update.lastCheck)
fi

# ── tabs and panes ────────────────────────────────────────────────────────────────────────
SP_TABS=$(new_space smoke-tabs "$FX/repo") || die "space smoke-tabs didn't open"
t_tab14a() {
  local extra
  extra=$(cmd tab.new --space "$SP_TABS" --name extra | jq -r '.tab // empty') || { fail "tab.new failed"; return; }
  [ -n "$extra" ] || { fail "tab.new gave no tab"; return; }
  wait_for 5 '[ "$(tabs_of "$SP_TABS" | jq length)" = 2 ]' || { fail "no second tab"; return; }
  cmd "roundup-tabs.close:$extra" >/dev/null || { fail "roundup-tabs.close:$extra failed"; return; }
  wait_for 5 '! tabs_of "$SP_TABS" | jq -e --arg t "$extra" "index(\$t)" >/dev/null' || { fail "tab $extra still there"; return; }
  [ "$(sh_get roundup-confirm.open)" = null ] || { fail "a dialog opened: $(sh_get roundup-confirm.open)"; return; }
}
t_pan16() {
  local tab first second n
  tab=$(cmd tab.new --space "$SP_TABS" --name split | jq -r '.tab // empty')
  [ -n "$tab" ] || { fail "tab.new failed"; return; }
  cmd pane.split --direction right >/dev/null || { fail "pane.split failed"; return; }
  wait_for 5 '[ "$(ls_json | jq --arg t "$tab" "[.spaces[].tabs[] | select(.id == \$t) | .terminals[]?] | length")" = 2 ]' ||
    { fail "no second pane: $(ls_json | jq -c --arg t "$tab" '.spaces[].tabs[] | select(.id == $t)')"; return; }
  first=$(ls_json | jq -r --arg t "$tab" '[.spaces[].tabs[] | select(.id == $t) | .terminals[]?][0] | .pane')
  second=$(ls_json | jq -r --arg t "$tab" '[.spaces[].tabs[] | select(.id == $t) | .terminals[]?][1] | .pane')
  cmd pane.focus --pane "$first" >/dev/null || { fail "pane.focus failed"; return; }
  wait_for 5 '[ "$(status_json | jq -r ".pane // .focused_pane // empty")" = "$first" ]' || { fail "focus isn't on $first: $(status_json | jq -c '{pane, focused_pane}')"; return; }
  cmd roundup-tabs.close-pane >/dev/null || { fail "roundup-tabs.close-pane failed"; return; }
  wait_for 5 '[ "$(ls_json | jq -c --arg t "$tab" "[.spaces[].tabs[] | select(.id == \$t) | .terminals[]? | .pane]")" = "[\"$second\"]" ]' ||
    { fail "panes now: $(ls_json | jq -c --arg t "$tab" '[.spaces[].tabs[] | select(.id == $t) | .terminals[]? | .pane]')"; return; }
  [ "$(sh_get roundup-confirm.open)" = null ] || { fail "a dialog opened"; return; }
  cmd tab.close --id "$tab" --confirmed true >/dev/null || true
}
case_ TAB-14 t_tab14a   # first half: default mode; the second half runs after a restart below
case_ PAN-16 t_pan16

# ── roundup-files ─────────────────────────────────────────────────────────────────────────
SP_REPO=$(new_space smoke-repo "$FX/repo") || die "space smoke-repo didn't open"
cmd space.select --id "$SP_REPO" >/dev/null
show_files || die "the Files panel didn't show"
sleep 2
t_fil103() {
  local c bad=""
  for c in focus search view:all view:changed source:git source:disk menu; do
    cmd "roundup-files.$c" >/dev/null 2>&1 || bad="$bad $c(do)"
    sleep 0.5
    clean || bad="$bad $c(errors: $(errors))"
    # menu (and maybe search) open popups: close them again.
    status_json | jq -r '.overlays[]? | (.id // empty)' | while read -r o; do cmd overlay.close --id "$o" >/dev/null 2>&1 || true; done
  done
  [ -z "$bad" ] || { fail "$bad"; return; }
  cmd roundup-files.focus >/dev/null 2>&1 || true
}
case_ FIL-103 t_fil103   # the commands; persistence after the restart below
cmd roundup-files.view:changed >/dev/null 2>&1 || true

t_fil86() {
  local a b c
  shot 10-changed-before || { fail "no shot"; return; }
  a=$(crop_md5 "$OUT/10-changed-before.png" 0.7 0.05)
  echo edited >> "$FX/repo/kept.txt"            # appears as M
  sleep 3
  shot 11-changed-after-edit || { fail "no shot"; return; }
  b=$(crop_md5 "$OUT/11-changed-after-edit.png" 0.7 0.05)
  rm "$FX/repo/new.txt"                          # the ? row goes
  sleep 3
  shot 12-changed-after-delete || { fail "no shot"; return; }
  c=$(crop_md5 "$OUT/12-changed-after-delete.png" 0.7 0.05)
  [ "$a" != "$b" ] || { fail "the panel didn't change after an edit (shots 10/11)"; return; }
  [ "$b" != "$c" ] || { fail "the panel didn't change after a delete (shots 11/12)"; return; }
  WHY="panel redrew after edit and delete; check shots 10-12 for M kept.txt and no new.txt"
  return 2
}
case_ FIL-86 t_fil86

SP_LINKS=$(new_space smoke-links "$FX/links") || die "space smoke-links didn't open"
cmd space.select --id "$SP_LINKS" >/dev/null
show_files || true
# What the restart must keep (FIL-103).
cmd roundup-files.view:changed >/dev/null 2>&1 || true
cmd roundup-files.source:disk >/dev/null 2>&1 || true

# ── roundup-preview ───────────────────────────────────────────────────────────────────────
SP_PV=$(new_space smoke-preview "$P") || die "space smoke-preview didn't open"
cmd space.select --id "$SP_PV" >/dev/null
t_vw27() {
  local f n=30 bad="" prev="" md
  for f in notes.md two-pages.pdf image.png data.csv data.json code.ts; do
    cmd tab.new "$(jq -nc --arg s "$SP_PV" --arg n "$f" --arg f "$P/$f" '{space: $s, name: $n, mod: "roundup-preview", props: {file: $f, on: null}}')" >/dev/null ||
      { bad="$bad $f(tab.new)"; continue; }
    sleep 2
    clean || bad="$bad $f(errors: $(errors))"
    shot "$n-preview-${f%%.*}" || bad="$bad $f(shot)"
    md=$(crop_md5 "$OUT/$n-preview-${f%%.*}.png" 0.3 0.1 2>/dev/null || echo x)
    [ "$md" != "$prev" ] || bad="$bad $f(same picture as the one before)"
    prev=$md n=$((n + 1))
  done
  [ -z "$bad" ] || { fail "$bad"; return; }
  WHY="status clean for all six; check shots 30-35 (md with the svg, both pdf pages, png, csv table, json tree, ts)"
  return 2
}
case_ VW-27 t_vw27

# ── restart 1: what has to outlive it ─────────────────────────────────────────────────────
PREFS_BEFORE=$(jq -c '.prefs // empty' "$TH/data/roundup-files/store.json" 2>/dev/null || true)
quit_app
sh_edit '. + {"roundup-tabs.confirm-close": "always"}'
start_app
[ "$(sh_get roundup-tabs.confirm-close)" = '"always"' ] || res seed FAIL "confirm-close \"always\" didn't survive the start"
cmd space.select --id "$SP_LINKS" >/dev/null 2>&1 || true
show_files >/dev/null 2>&1 || true
sleep 2

t_fil103b() {
  local now
  now=$(jq -c '.prefs // empty' "$TH/data/roundup-files/store.json" 2>/dev/null || true)
  [ -n "$PREFS_BEFORE" ] || { fail "no prefs saved before the restart ($TH/data/roundup-files/store.json)"; return; }
  echo "$PREFS_BEFORE" | jq -e 'fromjson | .view == "changed" and .source == "disk"' >/dev/null ||
    { fail "prefs before the restart: $PREFS_BEFORE"; return; }
  [ "$now" = "$PREFS_BEFORE" ] || { fail "prefs after the restart: $now (before: $PREFS_BEFORE)"; return; }
  shot 40-files-after-restart || true
  WHY="view changed and source disk kept in store.json; shot 40 shows the Changed view"
}
case_ FIL-103 t_fil103b

# Only now: a mod's fonts/ (roundup-files' Geist-Italic.ttf) load when Herdr starts, not when a mod is installed.
cmd roundup-files.view:all >/dev/null 2>&1 || true
t_fil56() {
  sleep 2
  shot 20-links || { fail "no shot"; return; }
  # Twice the size as well: italics are hard to tell at 1x.
  jq '. + {zoom: 2}' "$TH/settings.json" > "$WORK/settings.json" && cp "$WORK/settings.json" "$TH/settings.json"
  sleep 2
  shot 21-links-zoom2 || true
  jq 'del(.zoom)' "$TH/settings.json" > "$WORK/settings.json" && cp "$WORK/settings.json" "$TH/settings.json"
  sleep 2
  WHY="shots 20/21-links: to-file, to-folder, broken in italics with an arrow (broken's red)"
  return 2
}
case_ FIL-56 t_fil56

t_chr34a() {
  local now
  [ "$OFFLINE" = 0 ] || { WHY="--offline"; return 3; }
  [ "$LAST1" != null ] || { fail "no lastCheck after the first start"; return; }
  sleep 3
  now=$(sh_get roundup-workspace-chrome.update.lastCheck)
  [ "$now" = "$LAST1" ] || { fail "lastCheck $LAST1 -> $now after one restart"; return; }
}
case_ CHR-34 t_chr34a

# TAB-14, second half, and CNF-07: with confirm-close "always" a shell tab asks.
t_tab14b() {
  local extra open
  extra=$(cmd tab.new --space "$SP_TABS" --name asks | jq -r '.tab // empty') || { fail "tab.new failed"; return; }
  wait_for 5 'tabs_of "$SP_TABS" | jq -e --arg t "$extra" "index(\$t)" >/dev/null' || { fail "no tab"; return; }
  cmd "roundup-tabs.close:$extra" >/dev/null || { fail "roundup-tabs.close failed"; return; }
  wait_for 5 '[ "$(sh_get roundup-confirm.open)" != null ]' || { fail "roundup-confirm.open stayed null"; return; }
  sleep 1
  tabs_of "$SP_TABS" | jq -e --arg t "$extra" 'index($t)' >/dev/null || { fail "the tab closed without asking"; return; }
  TAB14_TAB=$extra
  # status names an overlay by its mod.
  status_json | jq -e '.overlays | index("roundup-confirm")' >/dev/null ||
    { fail "status lists no roundup-confirm overlay: $(status_json | jq -c .overlays)"; return; }
  shot 50-confirm-dialog || true
}
TAB14_TAB=""
case_ TAB-14 t_tab14b
t_cnf07() {
  local open
  [ -n "$TAB14_TAB" ] || { fail "no dialog from TAB-14"; return; }
  open=$(sh_get roundup-confirm.open | jq -r '.')
  cmd overlay.close --id "$open" >/dev/null || { fail "overlay.close $open failed"; return; }
  wait_for 5 '[ "$(sh_get roundup-confirm.open)" = null ]' || { fail "roundup-confirm.open still $(sh_get roundup-confirm.open)"; return; }
  tabs_of "$SP_TABS" | jq -e --arg t "$TAB14_TAB" 'index($t)' >/dev/null || { fail "the tab went with the dialog"; return; }
}
case_ CNF-07 t_cnf07

# ── restart 2 ─────────────────────────────────────────────────────────────────────────────
restart_app
t_chr34b() {
  local now
  [ "$OFFLINE" = 0 ] || { WHY="--offline"; return 3; }
  sleep 3
  now=$(sh_get roundup-workspace-chrome.update.lastCheck)
  [ "$now" = "$LAST1" ] || { fail "lastCheck $LAST1 -> $now after the second restart"; return; }
}
case_ CHR-34 t_chr34b

t_chr33() {
  [ "$OFFLINE" = 0 ] || { WHY="--offline"; return 3; }
  local before
  before=$(sh_get roundup-workspace-chrome.update.lastCheck)
  cmd roundup-workspace-chrome.check >/dev/null || { fail "the command failed"; return; }
  wait_for 20 '[ "$(sh_get roundup-workspace-chrome.update.lastCheck)" != "$before" ] && [ "$(sh_get roundup-workspace-chrome.update.checked)" != null ]' ||
    { fail "no new lastCheck/checked"; return; }
  sleep 2
  [ "$(sh_get roundup-workspace-chrome.update.error)" = null ] || { fail "error: $(sh_get roundup-workspace-chrome.update.error)"; return; }
  [ "$(sh_get roundup-workspace-chrome.update.latest | jq -r '.version // empty')" != "" ] || { fail "latest: $(sh_get roundup-workspace-chrome.update.latest)"; return; }
  WHY="latest $(sh_get roundup-workspace-chrome.update.latest | jq -r .version)"
}
case_ CHR-33 t_chr33

# ── restart 3: the update check switched off writes no lastCheck ──────────────────────────
quit_app
sh_edit 'del(."roundup-workspace-chrome.update.lastCheck", ."roundup-workspace-chrome.update.checked",
  ."roundup-workspace-chrome.update.error", ."roundup-workspace-chrome.update.latest")
  + {"roundup-workspace-chrome.update.auto": false}'
start_app
t_chr34c() {
  sleep 6
  [ "$(sh_get roundup-workspace-chrome.update.lastCheck)" = null ] || { fail "lastCheck written with auto off"; return; }
  [ "$(sh_get roundup-workspace-chrome.update.auto)" = false ] || { fail "auto isn't false any more"; return; }
}
case_ CHR-34 t_chr34c

clean || res status FAIL "errors at the end: $(errors)"
status_json > "$OUT/status-end.json" || true

for id in OPN-14 OPN-15 FLT-10 WIN-06 CHG-08; do res "$id" skip "needs a debug command in the mod"; done
echo
if [ "$FAILS" = 0 ]; then echo "smoke: no failures"; else echo "smoke: $FAILS failed"; fi
[ "$FAILS" = 0 ]
