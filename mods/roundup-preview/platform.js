// The commands behind the ⋯ menu's Open in editor, Open with default app and Reveal,
// per system. Pure, so node --test covers it.
// A system is "macos", "linux" or "windows" for files on this computer, or "remote" for
// files on another machine: no desktop to open them in, so no command at all.
// A command is [program, args]; an action with no command on a system is hidden.
import { dirname, native } from "./paths.js";
import { editorCommand } from "./editor-command.js";

export function systemOf(platform, on) {
  return on ? "remote" : platform;
}

// PowerShell reads everything after -Command as script and takes no argv, so each value
// reaches it as character codes, which leave nothing to quote or escape. Scripts use no
// double quotes: Windows PowerShell 5 mangles them on its command line. A failure
// prints its message alone, the one line a toast or the preview shows.
const value = (text) => `(-join [char[]]@(${Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).join(",")}))`;
const shell = (...flags) => (script, ...values) => ["powershell", [...flags, "-NonInteractive", "-Command",
  `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = 'Stop'; & { try { ${script} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 } } ${values.map(value).join(" ")}`]];

export const powershell = shell("-NoProfile");
const withProfile = shell();

export const win = (path) => native(path, "windows");

// $VISUAL or $EDITOR without its wait flag, else the default app. The program may be
// quoted, or be a whole path with spaces and no quotes at all. Runs with the person's
// profile, Windows' counterpart of the login shell, and in one process: the menu's popup
// closes on the click, its copy's tasks stop within 250 ms, and only an exec already
// started goes on, so nothing can wait for a first program.
const EDITOR = String.raw`
$file = $args[0]
$editor = if ($env:VISUAL) { $env:VISUAL } else { $env:EDITOR }
$quote = [string][char]34
$text = ([string]$editor -replace '(^|\s)(--wait|-w)(?=\s|$)', '').Trim()
if (-not $text) { Invoke-Item -LiteralPath $file; return }
if ($text.StartsWith($quote)) {
  $end = $text.IndexOf($quote, 1)
  $program = $text.Substring(1, $end - 1)
  $rest = $text.Substring($end + 1)
} elseif (Test-Path -LiteralPath $text) {
  $program = $text
  $rest = ''
} else {
  $program, $rest = $text -split '\s+', 2
}
Start-Process -FilePath $program -ArgumentList (@(([string]$rest).Trim() -split '\s+' | Where-Object { $_ }) + ($quote + $file + $quote))`;

const WINDOWS = {
  open: (path) => powershell("Invoke-Item -LiteralPath $args[0]", win(path)),
  reveal: (path) => powershell("Start-Process explorer.exe -ArgumentList ('/select,' + [char]34 + $args[0] + [char]34)", win(path)),
  editor: (path) => withProfile(EDITOR, win(path)),
};

/** The commands for `system`. `tools`: the optional programs found on this computer (`xdg-open`). */
export function commands(system, tools) {
  if (system === "windows") return WINDOWS;
  if (system === "macos") return { editor: (p) => editorCommand(p, "open"), open: (p) => ["open", [p]], reveal: (p) => ["open", ["-R", p]] };
  if (system === "linux") return { editor: (p) => editorCommand(p, "xdg-open"),
    ...(tools.has("xdg-open") ? { open: (p) => ["xdg-open", [p]], reveal: (p) => ["xdg-open", [dirname(p)]] } : {}) };
  return {};
}

/** The Reveal item's label, naming the system's own file manager. */
export function revealLabel(system) {
  return system === "windows" ? "Show in Explorer" : system === "linux" ? "Open containing folder" : "Reveal in Finder";
}
