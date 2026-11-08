# The L2 harness

Mod code that imports `herdr`, `gpui-kit` or `gpui-base` runs in Node with `node --test 'tests/*.test.mjs'`, no flags. Importing `harness.mjs` installs module hooks (`loader.mjs`) that send those three imports to the stubs here. Nothing in this folder runs as a test: the files don't match Node's test-file patterns.

The hooks need Node 22.15 or later (`module.registerHooks`); on an older Node `harness.mjs` stops with that message. Run the suite with `node --test 'tests/*.test.mjs'`: `node --test tests/` with a folder works only from Node 26.8 on.

## Writing a test

```js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, byId, click, space, tab, pane } from "./support/harness.mjs";

// After the harness, and with await import: a static import would load `herdr` before the hooks.
const { closeTab } = await import("../mods/roundup-tabs/close.js");
const Tabs = (await import("../mods/roundup-tabs/main.js")).default;

beforeEach(reset); // every test starts from the defaults

test("the shown tab's × closes it", () => {
  herdr.set({
    spaces: [space("s1", [tab("tb1", { name: "tb1", active: true }), tab("t2")], { active: true })],
    panes: [pane("p1", "tb1", { terminal: "t1" })],
    shared: { "roundup-tabs.confirm-close": "never" },
  });
  const { cx, render } = mount(Tabs, { props: {} });
  click(byId(render(), "close-tb1"), cx);
  assert.deepEqual(herdr.calls("run"), [["tab.close", { id: "tb1", confirmed: true }]]);
});
```

## What there is

**`herdr` stub** (`herdr.mjs`, state in `herdr-state.mjs`): every name in `~/.config/herdr-app/herdr.d.ts`, same signatures.

- Fixtures: `herdr.set({ spaces, panes, agents, terminals, machines, focused, layout, window, settings, theme, props, updates, knownAgents, home, appHome, env, shared: {key: value} })`. A fixture may be a function (called on each read) and is handed out as a copy. Builders with every field `herdr.d.ts` names: `space(id, tabs, extra)`, `tab(id, extra)`, `pane(pane, tab, extra)`, `agent(address, extra)`, `terminal(address, extra)`, `program(key, extra)`, `agentProgram(key, name)`.
- Defaults: no spaces or panes, `window().platform` `"macos"`, `home()` a path under the temp folder (nothing there), `theme()` maps each color to its own name (`t.chrome === "chrome"`), `knownAgents()` `[]`, `shared(key)` `null` when unset.
- Recorders: `herdr.calls("run")` gives the argument lists of every call to `run`, likewise `exec`, `hc`, `notify`, `openOverlay` (spec, id), `closeOverlay`, `setShared`, `readTextFile`, `knownAgents`, `watchFolder`, `playSound`. `herdr.log` has all calls in order; `herdr.clear()` forgets them.
- `exec(command, args, {cwd, on})` runs the real program (`child_process.spawn`, 30 s, 8 MiB), resolves `{code, stdout, stderr}` and rejects when it can't start (no such program or folder), as Herdr's does. `on` runs here too. `herdr.onExec(call => answer)`: `undefined` runs the real process, `{code, stdout, stderr}` (partial) resolves, an `Error` rejects, a function or promise is awaited first. `herdr.failExec("git")` makes a program fail to start. Hooks run newest first; `{ times: n }` limits one. **Hook every program with side effects** (`open`, `xdg-open`, an editor): exec is real.
- `hc()` never runs: it answers `{code: 0}` unless `herdr.onHc` says otherwise. `run`, `notify`, `openOverlay`, `closeOverlay` only record; `herdr.onRun` can throw or change fixtures.
- `readTextFile` reads real files (null when absent); `writeTextFile` writes real files but only below the system temp folder, with the `expected` check.
- `nextCommand()`: `await herdr.command("close")` delivers one and resolves once the mod's loop has handled it (asked for the next one). It reaches one waiting loop, not every copy: Herdr sends `<mod>.<command>` to each shown copy, so a test with two mounted copies can't show a command running twice.
- `watchFolder(path)` waits until `herdr.change(path, paths)`; `herdr.failWatch(path)` rejects it; `herdr.watching(path)` counts the waiting loops.

**gpui stubs** (`gpui-kit.mjs`, `gpui-base.mjs`, tree in `gpui-tree.mjs`): builders return an `El` that records everything: `el.elementId`, `el.kids` (elements and strings), `el.styles` (`[name, ...args]`, read with `el.style("bg")`, `el.has("truncate")`), `el.handlers` (`click`, `mouse_down:left`, `key_down`, …), `el.hovered`. Any builder method the stub doesn't know is recorded as a style, so new calls in mods need no change here. `.when(cond, fn)` behaves as GPUI's. Finders: `byId`, `hasId`, `ids`, `byText` (string or RegExp), `find`/`findAll(root, pred)`, `walk`, `texts`; `click(el, cx, event)` and `fire(el, "mouse_down:right", event, cx)` call handlers. `InputState` keeps its value: `input.set_value("x")`, `input.emit("submit")`. `v_virtual_list(...)` keeps its row renderer: `el.rows(start, end)`. `View` is a plain base class: `mount(Class, { props })` constructs it, runs `init(props, cx)`, and returns `{ view, cx, render }`.

**`cx`** (`cx.mjs`): one fake context per mount, passed to every callback. It counts `notified` and `stopped`, keeps `clipboard`, `opened` (open_url), `focusHandles`, and runs `spawn` bodies at once, keeping their failures in `cx.errors` (assert it is empty). `cx.timer.after/every` and `cx.sleep` run on the virtual clock (`clock.mjs`): nothing fires until `await clock.advance(ms)`. `clock.useFakeNow(start)` makes `Date.now()` follow it too (reset puts the real one back).

**`fetch`** (`fetch.mjs`): `globalThis.fetch` never reaches the network. It rejects like an offline fetch until a test answers: `fetch.reply(status, body)`, `fetch.respond = (url, init) => Response | Error`, or `const gate = fetch.defer()` then `gate.resolve(status, body)` / `gate.reject()`. `fetch.calls` has `{url, init}`.

**`localStorage`**: an in-memory one on `globalThis`, emptied by `reset()`.

**Git repos** (`git-repo.mjs`): importing it makes git hermetic in that test process (no global or system config, a fixed identity, `LC_ALL=C`, no repo search above the temp folder). `repo(files)` makes a committed repo in a temp folder, `git(dir, ...args)`, `write(dir, files)`, `link(dir, rel, target)`, `commit(dir)`, `tempDir()`, `snapshot(dir)` (mtimes and sizes, to see a read wrote nothing), `cleanup()` in `after()`.

**`waitFor(cond, ms)`** waits for a condition (independent of a faked `Date.now`).

## What the stubs leave out on purpose

- No layout, drawing or real events: sizes, `on_size_change`, scrolling, hover state, focus moves and key dispatch don't happen by themselves. A test calls the handler it means.
- One `cx` stands for all of a mount's contexts: a `cx` kept past its call isn't caught, and `cx.notify()` doesn't re-render (call `render()` again). `cx.new(Class)` constructs and inits a child view, without retaining or updating it.
- Herdr's reaction to commands: `run("tab.close")` changes no fixture unless a test's `onRun` hook does.
- `on` (another machine) runs locally; machines, the core, `hc` and terminals exist only as fixtures.
- Shared state isn't persisted, and setting it doesn't re-render other copies. A module's own state (a cache like git.js's per-machine git) lives as long as the test file's process: import it with a query (`git.js?fresh`) for a separate instance.
- Mod copies share one `localStorage`; Herdr gives each copy its own.
- `exec` inherits this process's environment (or `env` from `herdr.set`), not the person's login shell; the 1 MiB cut of `readTextFile` is by characters, not bytes.
- Only the gpui-base controls the mods use are named (`Input`, `InputState`, `Button`, `Checkbox`, `Switch`, `Editor`, `EditorState`, `TextView`, `HoverCard`, `Popup`, `Scrollbar`, `v_virtual_list`, `VirtualListScrollHandle`); add an export in `gpui-base.mjs` when a mod imports another.
