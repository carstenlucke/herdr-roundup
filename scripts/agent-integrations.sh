#!/bin/sh
# Switches the agents' integrations for the context meter in the pane header on and off.
#
#   scripts/agent-integrations.sh install   <claude|codex>
#   scripts/agent-integrations.sh uninstall <claude|codex>
#   scripts/agent-integrations.sh status    [claude|codex]
#
# claude: Claude Code's status line (`statusLine` in ~/.claude/settings.json) becomes
#         mods/roundup-pane/integrations/claude-statusline.sh in the Herdr App home, which keeps
#         Claude's own context numbers per terminal and then runs the status line the person had
#         before (moved into a file of its own, so it keeps running).
# codex:  "thread-id" joins `tui.terminal_title` in ~/.codex/config.toml (the person's other title
#         items stay; without any, Codex's defaults stay too), so the pane header finds the thread's
#         rollout file from the terminal's title.
#
# Each change edits the person's own agent config: run it only after they said yes. `install` is
# idempotent and keeps a backup of the file it changes; `uninstall` restores exactly what `install`
# changed and nothing else; `status` says per agent on, off or broken. Nothing else is touched.
# Paths follow CLAUDE_CONFIG_DIR, CODEX_HOME, HERDR_APP_HOME and XDG_CONFIG_HOME when set.
set -eu

app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
script="$app/mods/roundup-pane/integrations/claude-statusline.sh"
state="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-roundup/integrations"
claude_settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
next="$state/claude-statusline.next"
claude_prev="$state/claude.json"
codex_prev="$state/codex.json"
# Codex's own default when terminal_title is unset (DEFAULT_TERMINAL_TITLE_ITEMS, codex-rs 0.167),
# with "thread-id" after "activity".
codex_items='["activity", "thread-id", "thread-name", "project-name"]'

die() { echo "$*" >&2; exit 1; }
need_jq() { command -v jq >/dev/null 2>&1 || die "jq is needed (brew install jq)"; }
backup() { # file → a copy under $state/backup, named by the file and the time
  [ -f "$1" ] || return 0
  mkdir -p "$state/backup"
  cp -p "$1" "$state/backup/$(echo "$1" | sed 's|^/||; s|/|_|g').$(date +%Y%m%d-%H%M%S)"
}
replace() { # tmp → file, atomically, keeping the file's mode
  [ -f "$2" ] && chmod "$(stat -f %Lp "$2" 2>/dev/null || stat -c %a "$2")" "$1" 2>/dev/null || true
  mv -f "$1" "$2"
}

# --- Claude Code -------------------------------------------------------------------------------

claude_ours() { [ -f "$claude_settings" ] && [ "$(jq -r '.statusLine.command // empty' "$claude_settings")" = "$script" ]; }

claude_install() {
  need_jq
  [ -x "$script" ] || die "$script is missing: install the layout first (scripts/sync.sh)"
  if claude_ours; then echo "claude: already on"; return 0; fi
  mkdir -p "$state" "$(dirname "$claude_settings")"
  existed=true
  [ -f "$claude_settings" ] || { existed=false; echo '{}' >"$claude_settings"; }
  jq -e 'type == "object"' "$claude_settings" >/dev/null 2>&1 || die "$claude_settings is not a JSON object: not changed"
  [ "$existed" = true ] && backup "$claude_settings"
  # The previous status line, whole, for uninstall; its command for the script to run.
  jq --argjson existed "$existed" '{existed: $existed, statusLine: (.statusLine // null)}' "$claude_settings" >"$claude_prev"
  prev_type=$(jq -r '.statusLine.type // empty' "$claude_settings")
  if [ "$prev_type" = command ]; then jq -r '.statusLine.command // empty' "$claude_settings" >"$next"; else : >"$next"; fi
  tmp="$claude_settings.roundup-tmp"
  jq --arg cmd "$script" '.statusLine = ((.statusLine // {}) + {type: "command", command: $cmd})' "$claude_settings" >"$tmp"
  replace "$tmp" "$claude_settings"
  if [ -s "$next" ]; then echo "claude: on (your status line keeps running after it: $(cat "$next"))"; else echo "claude: on"; fi
}

claude_uninstall() {
  need_jq
  if ! claude_ours; then
    [ -f "$claude_prev" ] && die "claude: the status line is no longer Roundup's ($claude_settings): left as it is"
    echo "claude: already off"; return 0
  fi
  [ -f "$claude_prev" ] || die "claude: $claude_prev is missing, so the previous status line is unknown: remove statusLine from $claude_settings by hand"
  backup "$claude_settings"
  tmp="$claude_settings.roundup-tmp"
  jq --slurpfile p "$claude_prev" 'if $p[0].statusLine == null then del(.statusLine) else .statusLine = $p[0].statusLine end' "$claude_settings" >"$tmp"
  if [ "$(jq -r .existed "$claude_prev")" = false ] && [ "$(jq -c . "$tmp")" = "{}" ]; then
    rm -f "$tmp" "$claude_settings"
  else
    replace "$tmp" "$claude_settings"
  fi
  rm -f "$claude_prev" "$next"
  echo "claude: off"
}

claude_status() {
  if ! command -v jq >/dev/null 2>&1; then echo "claude: unknown (jq is needed)"; return 0; fi
  if claude_ours; then
    if [ ! -x "$script" ]; then echo "claude: broken ($script is missing: run scripts/sync.sh)"
    elif [ ! -f "$claude_prev" ]; then echo "claude: broken ($claude_prev is missing: uninstall can't restore the previous status line)"
    elif [ -s "$next" ]; then echo "claude: on (then: $(cat "$next"))"
    else echo "claude: on"; fi
  elif [ -f "$claude_prev" ]; then echo "claude: broken (the status line was changed since install: $claude_settings)"
  else echo "claude: off"; fi
}

# --- Codex -------------------------------------------------------------------------------------

# Where terminal_title stands: "table <n>" (inside [tui], line n), "dotted <n>" (tui.terminal_title
# at the root), "tui <n>" (no key, [tui] header at line n), "dotted-tui" (no [tui] table, but
# tui.* dotted keys at the root), or "none".
codex_where() {
  awk '
    /^[ \t]*\[/ { root = 0; tui = ($0 ~ /^[ \t]*\[[ \t]*tui[ \t]*\][ \t]*(#.*)?$/); if (tui && !hdr) hdr = NR; next }
    BEGIN { root = 1 }
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
  awk -v mode="$1" -v n="$2" -v text="$3" '
    mode == "a" && n == 0 && NR == 1 { print text }
    mode == "r" && NR == n { print text; next }
    { print }
    mode == "a" && NR == n && n > 0 { print text }
    END { if (mode == "a" && n == 0 && NR == 0) print text }
  ' "$codex_config" >"$tmp"
  replace "$tmp" "$codex_config"
}
# The first line that is exactly `text`, or nothing.
find_line() { awk -v text="$1" '$0 == text { print NR; exit }' "$codex_config"; }

codex_install() {
  need_jq
  mkdir -p "$state" "$(dirname "$codex_config")"
  existed=true
  [ -f "$codex_config" ] || { existed=false; : >"$codex_config"; }
  set -- $(codex_where)
  case "$1" in
    table | dotted)
      line=$(line_at "$2")
      case "$line" in *'"thread-id"'* | *"'thread-id'"* | *'"session-id"'* | *"'session-id'"*)
        echo "codex: already on (terminal_title has the thread id)"; return 0 ;;
      esac
      case "$line" in *\]*) ;; *) die "codex: terminal_title in $codex_config spans several lines: add \"thread-id\" to it by hand" ;; esac
      # "thread-id" after "activity" when the person has it, else first.
      new=$(printf '%s\n' "$line" | awk '{
        if (match($0, /"activity"[ \t]*,?/)) { a = substr($0, 1, RSTART + 9); r = substr($0, RSTART + 10)
          sub(/^[ \t]*,?[ \t]*/, "", r); print a ", \"thread-id\"" (r ~ /^\]/ ? "" : ", ") r }
        else { i = index($0, "["); r = substr($0, i + 1); print substr($0, 1, i) "\"thread-id\"" (r ~ /^[ \t]*\]/ ? "" : ", ") r }
      }')
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
  # A file install made for the line alone goes again.
  # (`.existed`, not `.existed // true`: jq's // takes false for missing.)
  if [ "$(jq -r .existed "$codex_prev")" = false ] && [ ! -s "$codex_config" ]; then rm -f "$codex_config"; fi
  rm -f "$codex_prev"
  echo "codex: off"
}

codex_status() {
  if ! command -v jq >/dev/null 2>&1; then echo "codex: unknown (jq is needed)"; return 0; fi
  if [ -f "$codex_prev" ]; then
    to=$(jq -r .to "$codex_prev")
    if [ -f "$codex_config" ] && [ -n "$(find_line "$to")" ]; then echo "codex: on"
    else echo "codex: broken (terminal_title was changed since install: $codex_config)"; fi
  elif [ -f "$codex_config" ]; then
    set -- $(codex_where)
    case "$1" in table | dotted)
      case "$(line_at "$2")" in *thread-id* | *session-id*) echo "codex: on (set by hand)"; return 0 ;; esac ;;
    esac
    echo "codex: off"
  else echo "codex: off"; fi
}

# -------------------------------------------------------------------------------------------------

usage() { die "usage: $0 install|uninstall <claude|codex>, or $0 status [claude|codex]"; }
[ $# -ge 1 ] || usage
action=$1
agent=${2:-}
case "$action" in
  status)
    case "$agent" in "") claude_status; codex_status ;; claude | codex) "${agent}_status" ;; *) usage ;; esac ;;
  install | uninstall)
    case "$agent" in claude | codex) "${agent}_${action}" ;; *) usage ;; esac ;;
  *) usage ;;
esac
