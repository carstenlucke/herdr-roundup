# 0005: The file menu acts through the panel

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `mods/roundup-files/main.js` (`openMenu`, `renderMenu`, `request`)

## Context

Right-clicking a row in `roundup-files` opens a context menu: Preview, Open
with default app, Reveal in Finder, Copy relative / absolute path, Send
@path to agent. Mods can't draw outside their block, so the menu is a popup
overlay: a second copy of the same mod, opened with `openOverlay({ mod:
"roundup-files", kind: "popup", props: { menu } })`.

The popup closes as soon as an item is clicked, and with it its tasks and
timers. Some items need to outlive it: "Send @path to agent" puts the path on
the clipboard, pastes it into the agent and puts the old clipboard back
600 ms later (a timer); opening a file waits for `open` to answer so a failure
can be shown; Preview has to change what the panel shows, which the popup
can't reach.

## Options

### A. The popup does everything itself (as `filetree` does)

- Con: the clipboard may never be restored when the popup's timer dies with
  it; Preview needs a channel to the panel anyway.

### B. A key command to the panel (`run("roundup-files.preview:…")`)

- Con: `<mod>.<command>` reaches every shown copy of the mod, and the popup
  is one; its value is a single string, so the path would have to be packed
  into it.

### C. The popup writes a request to shared state; the panel runs it (chosen)

`setShared("roundup-files.request", { n, action, root, on, rel })`; the panel
compares `n` with the last one it ran, checks that `root` and `on` are still
the folder it shows, and acts with its own `cx`.

- Pro: the work runs in the copy that lives on; the clipboard is restored.
- Pro: one way for every item that changes state or waits.
- Con: one shared key more. It is under the mod's own name, as the repo's
  rules ask.

## Decision

Option C for Preview, Open, Reveal and Send. The two Copy items run in the
popup itself: they finish at once.

## Consequences

- A request left in `shared.json` from an earlier run is ignored: the panel
  starts from the `n` it finds there.
- On another machine (`on`) the menu leaves out Open and Reveal, which work
  only on this computer; a deleted file (Changed view) offers no Preview,
  Open or Reveal.
