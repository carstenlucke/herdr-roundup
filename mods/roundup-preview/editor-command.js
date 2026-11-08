// How "Open in editor" runs on macOS and Linux (Windows has its own in platform.js): the
// person's $VISUAL or $EDITOR without its wait flag (nothing here waits for the file to
// close), else the system's opener. Pure (no Herdr imports); this repo has no tests for it yet.

// Asks the login shell, since Herdr's own environment lacks $EDITOR (zsh sets it in
// .zshenv). The value is read as the shell reads a command, quotes included, as git does:
// "/Applications/My Editor.app/x" --wait is one program. A whole path with spaces and no
// quotes at all is one program too, and a value the shell can't read opens the system's
// opener. All in one process: the menu's popup closes on the click, its copy's tasks stop
// within 250 ms, and only an exec already started goes on.
const EDITOR = `
file=$1 opener=$2
editor=$("\${SHELL:-/bin/sh}" -lc 'printf %s "\${VISUAL:-$EDITOR}"' 2>/dev/null)
set -f
if [ -n "$editor" ] && [ -f "$editor" ] && [ -x "$editor" ]; then set -- "$editor"
elif (eval ": $editor") 2>/dev/null; then eval "set -- $editor"
else set --
fi
for word do
  shift
  case $word in --wait|-w) ;; *) set -- "$@" "$word" ;; esac
done
[ $# -gt 0 ] || set -- "$opener"
exec "$@" "$file"`;

/** The command, as [program, args], that opens `file`; `opener`: the system's own. */
export const editorCommand = (file, opener) => ["sh", ["-c", EDITOR, "editor", file, opener]];
