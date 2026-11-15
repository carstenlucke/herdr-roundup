#!/bin/sh
# Switches the agents' integrations for the context meter in the pane header on and off.
#
#   scripts/agent-integrations.sh install   <claude|codex|pi|opencode>
#   scripts/agent-integrations.sh uninstall <claude|codex|pi|opencode>
#   scripts/agent-integrations.sh status    [claude|codex|pi|opencode]
#
# claude: Claude Code's status line (`statusLine` in ~/.claude/settings.json) becomes
#         `exec sh '<Herdr App home>/mods/roundup-pane/integrations/claude-statusline.sh'`, which
#         keeps Claude's own context numbers per terminal and then runs the status line the person
#         had before (moved into a file of its own, so it keeps running). Through `sh`, so the
#         script needs no executable bit; with `exec`, so the shell Claude Code runs the command in
#         becomes it and the script's $PPID is Claude itself, whatever that shell does with a
#         plain command (one that forks would leave its own pid there, and the file would count
#         for no process).
# codex:  "thread-id" joins `tui.terminal_title` in ~/.codex/config.toml, last (the person's other
#         title items stay; without any, Codex's defaults stay too), so the pane header finds the
#         thread's rollout file from the terminal's title. Everything that shows the title shows
#         the id too.
# pi:     a link ~/.pi/agent/extensions/roundup-context.js to
#         `<Herdr App home>/mods/roundup-pane/integrations/pi-context.js`, an extension that keeps
#         pi's own context numbers per terminal. pi loads every extension there on start.
# opencode: a link ~/.config/opencode/plugins/roundup-context to the folder
#         `<Herdr App home>/mods/roundup-pane/integrations/opencode`, a TUI plugin (opencode 2) that
#         keeps the shown session's numbers per terminal.
# The links follow the layout's files, so an update of the layout (scripts/sync.sh) updates what
# pi and opencode load; no config file of theirs is edited, so there is nothing to back up.
#
# Each change edits the person's own agent config: run it only after they said yes. `install` is
# idempotent and keeps a backup of the file it changes; `uninstall` restores exactly what `install`
# changed and nothing else; `status` says per agent on, off or broken. Nothing else is touched.
# A config that is a symlink (dotfiles) stays one: its target is changed. A link that leads
# nowhere or in a circle is refused. Paths follow CLAUDE_CONFIG_DIR, CODEX_HOME,
# PI_CODING_AGENT_DIR, OPENCODE_CONFIG_DIR, HERDR_APP_HOME and XDG_CONFIG_HOME when set.
set -eu

app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
script="$app/mods/roundup-pane/integrations/claude-statusline.sh"
state="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-roundup/integrations"
claude_settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
next="$state/claude-statusline.next"
claude_prev="$state/claude.json"
codex_prev="$state/codex.json"
pi_agent=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}
case "$pi_agent" in "~") pi_agent=$HOME ;; "~/"*) pi_agent="$HOME/${pi_agent#"~/"}" ;; esac
pi_link="$pi_agent/extensions/roundup-context.js"
pi_target="$app/mods/roundup-pane/integrations/pi-context.js"
opencode_link="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/plugins/roundup-context"
opencode_target="$app/mods/roundup-pane/integrations/opencode"
# Codex's own default when terminal_title is unset (DEFAULT_TERMINAL_TITLE_ITEMS, codex-rs 0.167),
# with "thread-id" last.
codex_items='["activity", "thread-name", "project-name", "thread-id"]'

die() { echo "$*" >&2; exit 1; }
need_jq() { command -v jq >/dev/null 2>&1 || die "jq is needed (brew install jq)"; }
backup() { # file → a copy under $state/backup, named by the file and the time
  [ -f "$1" ] || return 0
  mkdir -p "$state/backup"
  cp -p "$1" "$state/backup/$(echo "$1" | sed 's|^/||; s|/|_|g').$(date +%Y%m%d-%H%M%S)"
}
replace() { # tmp → file, atomically, keeping the file's mode (callers pass resolved paths: real())
  if [ -f "$2" ]; then
    # GNU's form first: macOS' stat refuses -c and prints nothing, while GNU's would take -f for
    # "file system" and print that block before failing on the format given as a file name.
    mode=$(stat -c %a "$2" 2>/dev/null) || mode=$(stat -f %Lp "$2" 2>/dev/null) || mode=
    case "$mode" in
      '' | *[!0-7]*) rm -f "$1"; die "the mode of $2 can't be read: not changed" ;;
    esac
    chmod "$mode" "$1" || { rm -f "$1"; die "the mode of $2 can't be kept: not changed"; }
  fi
  mv -f "$1" "$2"
}
# The file a path names once its symlinks are followed (relative ones against their folder, at
# most 40 hops). A path that isn't a link comes back as it is, existing or not; a link that leads
# nowhere or in a circle fails.
resolve() {
  p=$1 hops=0
  while [ -L "$p" ]; do
    hops=$((hops + 1))
    [ "$hops" -le 40 ] || return 1
    l=$(readlink "$p") || return 1
    case "$l" in /*) p=$l ;; *) p="$(dirname "$p")/$l" ;; esac
  done
  [ "$p" = "$1" ] || [ -e "$p" ] || return 1
  printf '%s\n' "$p"
}
# Points the variable named $1 at its config's real file, so temp files sit beside it and the
# link stays a link.
real() {
  eval "path=\$$1"
  if [ -L "$path" ]; then eval "${1}_linked=true"; else eval "${1}_linked=false"; fi
  resolved=$(resolve "$path") || die "$path is a symlink that leads nowhere or in a circle: not changed"
  eval "$1=\$resolved"
}
# A word for sh, in single quotes.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# --- Claude Code -------------------------------------------------------------------------------

command_now="exec sh $(quote "$script")"
# What the status line is now: "canonical" (command_now), "older" (another spelling this script
# wrote or that names the script plainly: the bare path, with ~/ or $HOME/, `sh` or `/bin/sh`
# before it, `exec` before any of these; `sh '<script>'` is what it wrote before `exec`),
# "mentions" (some other command that names claude-statusline.sh), or "other".
claude_form() {
  [ -f "$claude_settings" ] || { echo other; return 0; }
  cmd=$(jq -r 'if (.statusLine | type) == "object" then .statusLine.command // "" else "" end' "$claude_settings" 2>/dev/null) || cmd=
  [ "$cmd" = "$command_now" ] && { echo canonical; return 0; }
  if spelled "$script" || spelled "$(quote "$script")" || spelled "\"$script\""; then echo older; return 0; fi
  case "$script" in "$HOME"/*)
    rel=${script#"$HOME"/}
    if spelled "~/$rel" || spelled "\$HOME/$rel" || spelled "\${HOME}/$rel" || spelled "\"\$HOME/$rel\""; then echo older; return 0; fi ;;
  esac
  case "$cmd" in *claude-statusline.sh*) echo mentions ;; *) echo other ;; esac
}
spelled() { for c in "$1" "sh $1" "/bin/sh $1" "exec $1" "exec /bin/sh $1"; do [ "$cmd" = "$c" ] && return 0; done; return 1; }
claude_ours() { case "$(claude_form)" in canonical | older) return 0 ;; *) return 1 ;; esac; }
set_command() { # the status line's command → command_now, nothing else
  tmp="$claude_settings.roundup-tmp"
  jq --arg cmd "$command_now" '.statusLine = ((.statusLine // {}) + {type: "command", command: $cmd})' "$claude_settings" >"$tmp"
  replace "$tmp" "$claude_settings"
}

claude_install() {
  need_jq
  real claude_settings
  [ -f "$script" ] || die "$script is missing: install the layout first (scripts/sync.sh)"
  case "$(claude_form)" in
    canonical) echo "claude: already on"; return 0 ;;
    older)
      # An earlier install (or the same script spelled otherwise): only the command changes; what
      # uninstall restores and the status line that runs after it stay as they are.
      [ -f "$claude_prev" ] || die "claude: broken ($claude_prev is missing, so the previous status line is unknown): not changed"
      backup "$claude_settings"
      set_command
      echo "claude: on (the status line now runs through exec sh: $command_now)"
      return 0 ;;
    mentions)
      die "claude: your status line appears to reference Roundup's script ($(jq -r '.statusLine.command' "$claude_settings")): not changed. Remove that first, then install again." ;;
  esac
  mkdir -p "$state" "$(dirname "$claude_settings")"
  existed=true
  [ -f "$claude_settings" ] || { existed=false; echo '{}' >"$claude_settings"; }
  jq -e 'type == "object"' "$claude_settings" >/dev/null 2>&1 || die "$claude_settings is not a JSON object: not changed"
  [ "$existed" = true ] && backup "$claude_settings"
  # The previous status line, whole, for uninstall; its command for the script to run.
  jq --argjson existed "$existed" '{existed: $existed, statusLine: (.statusLine // null)}' "$claude_settings" >"$claude_prev"
  prev_type=$(jq -r '.statusLine.type // empty' "$claude_settings")
  if [ "$prev_type" = command ]; then jq -r '.statusLine.command // empty' "$claude_settings" >"$next"; else : >"$next"; fi
  set_command
  if [ -s "$next" ]; then echo "claude: on (your status line keeps running after it: $(cat "$next"))"; else echo "claude: on"; fi
}

claude_uninstall() {
  need_jq
  real claude_settings
  if ! claude_ours; then
    [ -f "$claude_prev" ] && die "claude: the status line is no longer Roundup's ($claude_settings): left as it is"
    echo "claude: already off"; return 0
  fi
  [ -f "$claude_prev" ] || die "claude: $claude_prev is missing, so the previous status line is unknown: remove statusLine from $claude_settings by hand"
  backup "$claude_settings"
  tmp="$claude_settings.roundup-tmp"
  jq --slurpfile p "$claude_prev" 'if $p[0].statusLine == null then del(.statusLine) else .statusLine = $p[0].statusLine end' "$claude_settings" >"$tmp"
  # A file install created for the status line alone goes again; not one reached through a link
  # (moved into dotfiles since): the link would point nowhere.
  if [ "$(jq -r .existed "$claude_prev")" = false ] && [ "$claude_settings_linked" = false ] && [ "$(jq -c . "$tmp")" = "{}" ]; then
    rm -f "$tmp" "$claude_settings"
  else
    replace "$tmp" "$claude_settings"
  fi
  rm -f "$claude_prev" "$next"
  echo "claude: off"
}

claude_status() {
  if ! command -v jq >/dev/null 2>&1; then echo "claude: unknown (jq is needed)"; return 0; fi
  form=$(claude_form)
  if [ "$form" = canonical ] || [ "$form" = older ]; then
    if [ ! -f "$script" ]; then echo "claude: broken ($script is missing: run scripts/sync.sh)"
    elif [ ! -f "$claude_prev" ]; then echo "claude: broken ($claude_prev is missing: uninstall can't restore the previous status line)"
    elif [ "$form" = older ]; then echo "claude: on (an older form: run install claude again, so it runs through exec sh)"
    elif [ -s "$next" ]; then echo "claude: on (then: $(cat "$next"))"
    else echo "claude: on"; fi
  elif [ -f "$claude_prev" ]; then echo "claude: broken (the status line was changed since install: $claude_settings)"
  else echo "claude: off"; fi
}

# --- Codex -------------------------------------------------------------------------------------

# Where terminal_title stands: "table <n>" (inside [tui], line n), "dotted <n>" (tui.terminal_title
# at the root), "tui <n>" (no key, [tui] header at line n), "dotted-tui" (no [tui] table, but
# tui.* dotted keys at the root), "inline <n>" (tui itself assigned at the root, line n: an inline
# table, refused), or "none".
codex_where() {
  awk '
    /^[ \t]*\[/ { root = 0; tui = ($0 ~ /^[ \t]*\[[ \t]*tui[ \t]*\][ \t]*(#.*)?$/); if (tui && !hdr) hdr = NR; next }
    BEGIN { root = 1 }
    # tui itself assigned at the top (an inline table `tui = { … }`, bare or quoted): not edited.
    root && /^[ \t]*(tui|"tui"|\047tui\047)[ \t]*=/ { print "inline " NR; found = 1; exit }
    root && /^[ \t]*tui\.terminal_title[ \t]*=/ { print "dotted " NR; found = 1; exit }
    root && /^[ \t]*tui\./ { dotted = 1 }
    tui && /^[ \t]*terminal_title[ \t]*=/ { print "table " NR; found = 1; exit }
    END { if (!found) { if (hdr) print "tui " hdr; else if (dotted) print "dotted-tui"; else print "none" } }
  ' "$codex_config"
}
line_at() { sed -n "${1}p" "$codex_config"; }
# Inserts after line n (0: at the top); or replaces line n with text (mode r).
edit_line() { # mode n text
  tmp="$codex_config.roundup-tmp"
  # The text goes through the environment: awk's -v would turn its backslashes into escapes.
  ROUNDUP_LINE_TEXT=$3 awk -v mode="$1" -v n="$2" '
    BEGIN { text = ENVIRON["ROUNDUP_LINE_TEXT"] }
    mode == "a" && n == 0 && NR == 1 { print text }
    mode == "r" && NR == n { print text; next }
    { print }
    mode == "a" && NR == n && n > 0 { print text }
    END { if (mode == "a" && n == 0 && NR == 0) print text }
  ' "$codex_config" >"$tmp"
  replace "$tmp" "$codex_config"
}
# The first line that is exactly `text`, or nothing.
find_line() { ROUNDUP_LINE_TEXT=$1 awk 'BEGIN { text = ENVIRON["ROUNDUP_LINE_TEXT"] } $0 == text { print NR; exit }' "$codex_config"; }
# One title line's array, read with its strings and comments in mind (TOML: "…" with escapes,
# '…' without, # to the end of the line outside a string). Its own `]` must come on that line,
# before any comment, else the array spans several lines: exit 2. mode "has": exit 0 when the
# array holds the thread id (or the session id); "last": when it is the last item; "add": prints
# the line with "thread-id" added last.
title_array() { # mode line
  printf '%s\n' "$2" | awk -v mode="$1" '
    function scan(   k, c, q) {
      i = index($0, "["); j = 0; q = ""
      if (!i) return 0
      for (k = i + 1; k <= length($0); k++) {
        c = substr($0, k, 1)
        if (q != "") { if (c == "\\" && q == "\"") k++; else if (c == q) q = ""; continue }
        if (c == "\"" || c == "\047") { q = c; continue }
        if (c == "#") return 0
        if (c == "]") { j = k; return 1 }
      }
      return 0
    }
    {
      if (!scan()) exit 2
      body = substr($0, i + 1, j - i - 1); sub(/[ \t]*,?[ \t]*$/, "", body)
      id = "[\"\047](thread|session)-id[\"\047]"
      if (mode == "has") exit (body ~ ("(^|[[ \t,])" id "([ \t,]|$)") ? 0 : 1)
      if (mode == "last") exit (body ~ ("(^|[ \t,])" id "$") ? 0 : 1)
      print substr($0, 1, i) body (body ~ /[^ \t]/ ? ", " : "") "\"thread-id\"" substr($0, j)
    }'
}
id_last() { title_array last "$1"; }
# Whether Roundup's line is still in the config, as install wrote it.
codex_ours() { [ -f "$codex_prev" ] && [ -f "$codex_config" ] && [ -n "$(find_line "$(jq -r .to "$codex_prev")")" ]; }
not_last='thread id not last: run uninstall, then install, to move it'

codex_install() {
  need_jq
  real codex_config
  mkdir -p "$state" "$(dirname "$codex_config")"
  existed=true
  [ -f "$codex_config" ] || { existed=false; : >"$codex_config"; }
  set -- $(codex_where)
  case "$1" in
    inline) die "codex: tui in $codex_config is an inline table: add \"thread-id\" to its terminal_title by hand" ;;
    table | dotted)
      line=$(line_at "$2")
      rc=0; title_array has "$line" || rc=$?
      [ "$rc" = 2 ] && die "codex: terminal_title in $codex_config spans several lines: add \"thread-id\" to it by hand"
      if [ "$rc" = 0 ]; then
        # An install before the id went last (0.11.0 before release) put it after "activity".
        if codex_ours && ! id_last "$line"; then echo "codex: already on ($not_last)"
        else echo "codex: already on (terminal_title has the thread id)"; fi
        return 0
      fi
      # "thread-id" last: before the array's own `]`, not one in a string or a trailing comment.
      new=$(title_array add "$line")
      backup "$codex_config"
      jq -n --arg from "$line" --arg to "$new" --argjson existed "$existed" '{mode: "replace", from: $from, to: $to, existed: $existed}' >"$codex_prev"
      edit_line r "$2" "$new"
      ;;
    tui)
      new="terminal_title = $codex_items"
      backup "$codex_config"
      jq -n --arg to "$new" --argjson existed "$existed" '{mode: "insert", to: $to, existed: $existed}' >"$codex_prev"
      edit_line a "$2" "$new"
      ;;
    dotted-tui | none)
      # Without a [tui] table a dotted key at the top is valid either way.
      new="tui.terminal_title = $codex_items"
      backup "$codex_config"
      jq -n --arg to "$new" --argjson existed "$existed" '{mode: "insert", to: $to, existed: $existed}' >"$codex_prev"
      edit_line a 0 "$new"
      ;;
  esac
  echo "codex: on (new Codex sessions show the thread id in their title)"
}

codex_uninstall() {
  need_jq
  real codex_config
  if [ ! -f "$codex_prev" ]; then echo "codex: already off"; return 0; fi
  to=$(jq -r .to "$codex_prev")
  n=$( [ -f "$codex_config" ] && find_line "$to" || true)
  [ -n "$n" ] || die "codex: the line Roundup wrote is no longer in $codex_config ($to): left as it is"
  backup "$codex_config"
  if [ "$(jq -r .mode "$codex_prev")" = replace ]; then
    edit_line r "$n" "$(jq -r .from "$codex_prev")"
  else
    tmp="$codex_config.roundup-tmp"
    awk -v n="$n" 'NR != n' "$codex_config" >"$tmp"
    replace "$tmp" "$codex_config"
  fi
  # A file install made for the line alone goes again, unless reached through a link (as claude).
  # (`.existed`, not `.existed // true`: jq's // takes false for missing.)
  if [ "$(jq -r .existed "$codex_prev")" = false ] && [ "$codex_config_linked" = false ] && [ ! -s "$codex_config" ]; then rm -f "$codex_config"; fi
  rm -f "$codex_prev"
  echo "codex: off"
}

codex_status() {
  if ! command -v jq >/dev/null 2>&1; then echo "codex: unknown (jq is needed)"; return 0; fi
  if [ -f "$codex_prev" ]; then
    to=$(jq -r .to "$codex_prev")
    if codex_ours; then if id_last "$to"; then echo "codex: on"; else echo "codex: on ($not_last)"; fi
    else echo "codex: broken (terminal_title was changed since install: $codex_config)"; fi
  elif [ -f "$codex_config" ]; then
    set -- $(codex_where)
    case "$1" in
      inline) echo "codex: unknown (inline tui table; inspect by hand)"; return 0 ;;
      table | dotted)
        if title_array has "$(line_at "$2")"; then echo "codex: on (set by hand)"; return 0; fi ;;
    esac
    echo "codex: off"
  else echo "codex: off"; fi
}

# --- pi and opencode: a link to the layout's file ----------------------------------------------

# What stands at the link's place: "ours" (a link to the target, or to the same file of another
# Herdr App home: an older install), "missing", or "other" (anything else, the person's own).
link_form() { # link suffix
  if [ -L "$1" ]; then
    case "$(readlink "$1")" in */mods/roundup-pane/integrations/"$2") echo ours ;; *) echo other ;; esac
  elif [ -e "$1" ]; then echo other
  else echo missing; fi
}
link_install() { # agent link target suffix
  [ -e "$3" ] || die "$1: $3 is missing: install the layout first (scripts/sync.sh)"
  case "$(link_form "$2" "$4")" in
    ours)
      if [ "$(readlink "$2")" = "$3" ]; then echo "$1: already on"; return 0; fi
      rm -f "$2" ;; # an older install's link: pointed here again
    other) die "$1: $2 is there and isn't Roundup's: not changed" ;;
  esac
  mkdir -p "$(dirname "$2")"
  ln -s "$3" "$2"
  echo "$1: on (new $1 sessions keep their context for the pane header: $2)"
}
link_uninstall() { # agent link suffix
  case "$(link_form "$2" "$3")" in
    ours) rm -f "$2"; echo "$1: off" ;;
    missing) echo "$1: already off" ;;
    other) die "$1: $2 isn't Roundup's: left as it is" ;;
  esac
}
link_status() { # agent link target suffix
  case "$(link_form "$2" "$4")" in
    ours)
      if [ ! -e "$2" ]; then echo "$1: broken ($(readlink "$2") is missing: run scripts/sync.sh, or install $1 again)"
      elif [ "$(readlink "$2")" != "$3" ]; then echo "$1: on (an older install: run install $1 again, so it follows this layout)"
      else echo "$1: on"; fi ;;
    missing) echo "$1: off" ;;
    other) echo "$1: unknown ($2 is there and isn't Roundup's)" ;;
  esac
}
pi_install() { link_install pi "$pi_link" "$pi_target" pi-context.js; }
pi_uninstall() { link_uninstall pi "$pi_link" pi-context.js; }
pi_status() { link_status pi "$pi_link" "$pi_target" pi-context.js; }
opencode_install() { link_install opencode "$opencode_link" "$opencode_target" opencode; }
opencode_uninstall() { link_uninstall opencode "$opencode_link" opencode; }
opencode_status() { link_status opencode "$opencode_link" "$opencode_target" opencode; }

# -------------------------------------------------------------------------------------------------

usage() { die "usage: $0 install|uninstall <claude|codex|pi|opencode>, or $0 status [claude|codex|pi|opencode]"; }
[ $# -ge 1 ] || usage
action=$1
agent=${2:-}
case "$action" in
  status)
    case "$agent" in "") claude_status; codex_status; pi_status; opencode_status ;; claude | codex | pi | opencode) "${agent}_status" ;; *) usage ;; esac ;;
  install | uninstall)
    case "$agent" in claude | codex | pi | opencode) "${agent}_${action}" ;; *) usage ;; esac ;;
  *) usage ;;
esac
