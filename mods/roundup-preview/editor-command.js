// How "Open in editor" runs on macOS and Linux (Windows has its own in platform.js): the
// person's $VISUAL or $EDITOR without its wait flag (nothing here waits for the file to
// close), else the system's opener. Pure, so node --test covers it.

// Asks the login shell, since Herdr's own environment lacks $EDITOR (zsh sets it in
// .zshenv). All in one process: the menu's popup closes on the click, its copy's tasks
// stop within 250 ms, and only an exec already started goes on.
const EDITOR = `
file=$1 opener=$2
editor=$("\${SHELL:-/bin/sh}" -lc 'printf %s "\${VISUAL:-$EDITOR}"' 2>/dev/null)
set -f
set --
for word in $editor; do
  case $word in --wait|-w) ;; *) set -- "$@" "$word" ;; esac
done
[ $# -gt 0 ] || set -- "$opener"
exec "$@" "$file"`;

/** The command, as [program, args], that opens `file`; `opener`: the system's own. */
export const editorCommand = (file, opener) => ["sh", ["-c", EDITOR, "editor", file, opener]];
