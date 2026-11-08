// node --test tests/
// The ⋯ menu's commands per system, and how values reach PowerShell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commands, revealLabel, powershell, systemOf } from "../mods/roundup-preview/platform.js";
import { programs } from "../mods/roundup-preview/programs.js";

const FILE = "/Users/a/My \"Docs\"/x.md";
const none = new Set(), xdg = new Set(["xdg-open"]);

// MNU-01
test("commands: macOS opens with open, reveals with open -R, edits through the login shell", () => {
  const c = commands("macos", none);
  assert.deepEqual(Object.keys(c).sort(), ["editor", "open", "reveal"]);
  assert.deepEqual(c.open(FILE), ["open", [FILE]]);
  assert.deepEqual(c.reveal(FILE), ["open", ["-R", FILE]]);
  const [program, args] = c.editor(FILE);
  assert.equal(program, "sh");
  assert.deepEqual(args.slice(-3), ["editor", FILE, "open"], "the file and the system's opener as arguments, never in the script");
});

test("commands: Linux edits always, opens and reveals only with xdg-open", () => {
  assert.deepEqual(Object.keys(commands("linux", none)), ["editor"]);
  assert.deepEqual(commands("linux", none).editor(FILE)[1].slice(-2), [FILE, "xdg-open"]);
  const c = commands("linux", xdg);
  assert.deepEqual(Object.keys(c).sort(), ["editor", "open", "reveal"]);
  assert.deepEqual(c.open(FILE), ["xdg-open", [FILE]]);
  assert.deepEqual(c.reveal(FILE), ["xdg-open", ["/Users/a/My \"Docs\""]], "the folder: xdg-open selects nothing");
});

test("commands: Windows runs PowerShell, a remote file gets none", () => {
  const c = commands("windows", none);
  assert.deepEqual(Object.keys(c).sort(), ["editor", "open", "reveal"]);
  for (const [name, run] of Object.entries(c)) assert.equal(run("C:/a/b.md")[0], "powershell", name);
  assert.ok(c.open("C:/a/b.md")[1].includes("-NoProfile"));
  assert.ok(!c.editor("C:/a/b.md")[1].includes("-NoProfile"), "the editor runs with the person's profile");
  assert.deepEqual(commands("remote", xdg), {});
  assert.equal(systemOf("macos", "vps"), "remote");
  assert.equal(systemOf("linux", null), "linux");
});

// MNU-02
test("revealLabel: each system's file manager", () => {
  assert.equal(revealLabel("macos"), "Reveal in Finder");
  assert.equal(revealLabel("linux"), "Open containing folder");
  assert.equal(revealLabel("windows"), "Show in Explorer");
});

// MNU-04
// The values a PowerShell command line carries, decoded from its [char[]] codes.
const values = (line) => [...line.matchAll(/\(-join \[char\[\]\]@\(([\d,]*)\)\)/g)].map((m) => String.fromCharCode(...(m[1] ? m[1].split(",").map(Number) : [])));
test("powershell: each value goes as character codes, in order, whatever it holds", () => {
  const odd = ["a\"b", "it's", "$env:x `n", "é😀", "", "C:\\x y\\z"];
  const [program, args] = powershell("Write-Output $args", ...odd);
  assert.equal(program, "powershell");
  assert.deepEqual(args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
  assert.deepEqual(values(args.at(-1)), odd);
  for (const v of ["it's", "$env", "C:\\x"]) assert.ok(!args.at(-1).includes(v), `${v} is not in the script as text`);
});

test("no PowerShell script of the preview holds a double quote", () => {
  const odd = 'C:/a "b"/c.md';
  const all = { ...Object.fromEntries(Object.entries(commands("windows", none)).map(([k, f]) => [`menu ${k}`, f])),
    ...Object.fromEntries(Object.entries(programs("windows")).filter(([k, f]) => typeof f === "function" && k !== "pages").map(([k, f]) => [`programs ${k}`, f])) };
  assert.ok(Object.keys(all).length >= 13, Object.keys(all).join(", "));
  for (const [name, run] of Object.entries(all)) {
    const [program, args] = run(odd, odd, "key", "png", 1, 2, 800);
    assert.equal(program, "powershell", name);
    assert.ok(!args.at(-1).includes('"'), `${name}: Windows PowerShell 5 mangles " on its command line`);
    assert.ok(values(args.at(-1)).includes(odd.replaceAll("/", "\\")), `${name}: the path goes as a value, in Windows form`);
  }
});
