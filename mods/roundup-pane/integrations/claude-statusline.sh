#!/bin/sh
# Claude Code's status line for Herdr Roundup, switched on by `scripts/agent-integrations.sh install claude`.
# Claude Code hands its status as JSON on stdin (context window, current usage, session, model).
# This keeps it for the pane header, one file per Herdr terminal, then runs the status line the
# person had before (if any) with the same stdin and prints what it prints.
#
#   ~/.cache/herdr-roundup/context/claude/<HC_TERMINAL_ID>.json
#     { "v": 1, "terminal": "t7", "pid": <Claude's pid>, "at": <ms>, "api": <ms>, "session": "<id>",
#       "limitsAt": <ms or null>, "claude": <stdin> }
#
# `limitsAt` is about when the stdin's plan limits (`rate_limits`) are from. Claude Code runs the
# status line on a mode change, a start and a resume too, with the numbers of its last answer, so
# `at` says nothing about their age. `api` is the stdin's `cost.total_api_duration_ms`, which grows
# with every answer: larger than in this script's last file of the same process and session, and
# the limits are from now; the same, and the last `limitsAt` stays. Without a last file, for
# another process or session, with a smaller counter or without the fields it is null: unknown,
# until the next answer. It is the time this script saw the activity, not the measurement's own
# (the status line is debounced, and a run can be cancelled): close to it, never exact.
#
# Written atomically (a temp file, then mv). Outside a Herdr terminal nothing is written.
# Claude's pid is $PPID: install writes the command as `exec sh '<script>'`, so the shell Claude
# Code runs it in becomes this script instead of forking it (CLAUDE_PID overrides, for tests).
# Plain sh, no jq or node: it runs on every update of Claude's status line.
#
# The previous status line runs under /bin/sh, as Claude Code runs a status line command (not
# under $SHELL, which may be fish), and gets stdin byte for byte, its trailing newline too. It runs
# with HERDR_ROUNDUP_STATUSLINE=1: should it lead back to this script (another spelling, a link),
# that copy stops at once instead of calling itself without end.

[ -n "${HERDR_ROUNDUP_STATUSLINE:-}" ] && exit 0
# num <name> <text>: r = the digits after "<name>": in text, or nothing (no fork).
num() {
  r=
  case "$2" in *"\"$1\":"*) r=${2#*"\"$1\":"}; r=${r%%[!0-9]*} ;; esac
}
in=$(cat; printf x)
in=${in%x}
json=$(printf '%s' "$in") # for the file: without trailing newlines
dir="$HOME/.cache/herdr-roundup/context/claude"
case "$HC_TERMINAL_ID" in
  "" | *[!A-Za-z0-9_-]*) ;;
  *)
    pid=${CLAUDE_PID:-$PPID}
    case "$pid" in "" | *[!0-9]*) pid=$PPID ;; esac
    if [ -n "$json" ] && mkdir -p "$dir" 2>/dev/null; then
      file="$dir/$HC_TERMINAL_ID.json"
      now=$(date +%s)
      # Claude Code writes its JSON without spaces: with another spelling the fields aren't found,
      # and the time stays unknown.
      num total_api_duration_ms "$json"
      api=$r
      sid=
      case "$json" in *'"session_id":"'*) sid=${json#*'"session_id":"'}; sid=${sid%%\"*} ;; esac
      case "$sid" in "" | *[!A-Za-z0-9_-]*) sid= ;; esac
      limits_at=null
      old=
      if [ -n "$api" ] && [ -n "$sid" ] && [ -r "$file" ]; then
        IFS= read -r old <"$file" 2>/dev/null
        old=${old%%'"claude":'*} # this script's own fields, before Claude's
        num pid "$old"
        old_pid=$r
        num api "$old"
        old_api=$r
        num limitsAt "$old"
        old_at=$r
        case "$old" in
          *"\"session\":\"$sid\""*)
            if [ "$old_pid" = "$pid" ] && [ -n "$old_api" ]; then
              if [ "$api" -gt "$old_api" ] 2>/dev/null; then
                limits_at=${now}000
              elif [ "$api" -eq "$old_api" ] 2>/dev/null && [ -n "$old_at" ]; then
                limits_at=$old_at
              fi
            fi
            ;;
        esac
      fi
      tmp="$dir/.$HC_TERMINAL_ID.$$"
      printf '{"v":1,"terminal":"%s","pid":%s,"at":%s000,"api":%s,"session":"%s","limitsAt":%s,"claude":%s}\n' \
        "$HC_TERMINAL_ID" "$pid" "$now" "${api:-null}" "$sid" "$limits_at" "$json" >"$tmp" 2>/dev/null &&
        mv -f "$tmp" "$file" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    fi
    ;;
esac

# The person's own status line, moved aside by `install`.
next="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-roundup/integrations/claude-statusline.next"
if [ -s "$next" ]; then
  printf '%s' "$in" | HERDR_ROUNDUP_STATUSLINE=1 /bin/sh -c "$(cat "$next")"
fi
exit 0
