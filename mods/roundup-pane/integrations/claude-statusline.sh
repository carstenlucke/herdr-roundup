#!/bin/sh
# Claude Code's status line for Herdr Roundup, switched on by `scripts/agent-integrations.sh install claude`.
# Claude Code hands its status as JSON on stdin (context window, current usage, session, model).
# This keeps it for the pane header, one file per Herdr terminal, then runs the status line the
# person had before (if any) with the same stdin and prints what it prints.
#
#   ~/.cache/herdr-roundup/context/claude/<HC_TERMINAL_ID>.json
#     { "v": 1, "terminal": "t7", "pid": <Claude's pid>, "at": <ms>, "claude": <stdin> }
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
      tmp="$dir/.$HC_TERMINAL_ID.$$"
      printf '{"v":1,"terminal":"%s","pid":%s,"at":%s000,"claude":%s}\n' "$HC_TERMINAL_ID" "$pid" "$(date +%s)" "$json" >"$tmp" 2>/dev/null &&
        mv -f "$tmp" "$dir/$HC_TERMINAL_ID.json" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    fi
    ;;
esac

# The person's own status line, moved aside by `install`.
next="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-roundup/integrations/claude-statusline.next"
if [ -s "$next" ]; then
  printf '%s' "$in" | HERDR_ROUNDUP_STATUSLINE=1 /bin/sh -c "$(cat "$next")"
fi
exit 0
