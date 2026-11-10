// node --test 'tests/*.test.mjs'
// The sidebar's rail (L2): roundup-spaces and the footer of roundup-workspace-chrome centre each item
// in a 32px cell, as Herdr's spaces and workspace-chrome 0.1.14 do.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, byId, find, texts, space, tab, waitFor } from "./support/harness.mjs";

const Spaces = (await import("../mods/roundup-spaces/main.js")).default;
const Chrome = (await import("../mods/roundup-workspace-chrome/main.js")).default;

beforeEach(() => {
  reset();
  // No git here: the rows show without a git line.
  herdr.onExec(() => ({ code: 1, stdout: "", stderr: "not a git repository" }));
});

const sidebar = (px) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", size: { px }, children: [] }] });
// The cell railCell() puts around an element: a centred flex row holding only it.
const cellOf = (root, el) => find(root, (e) => e.kids?.length === 1 && e.kids[0] === el);

test("SPC-19, SPC-37: on the rail a space is a 32px cell with its number and its mark at the right", () => {
  herdr.set({
    layout: sidebar(44),
    spaces: [
      space("s1", [tab("tb1", { active: true })], { active: true, name: "app", status: "blocked" }),
      space("s2", [tab("tb2")], { name: "docs", status: "idle" }),
    ],
  });
  const { cx, render } = mount(Spaces, { props: {} });
  const root = render();
  const active = byId(root, "space-s1"), other = byId(root, "space-s2");
  for (const row of [active, other]) {
    assert.deepEqual([row.style("w"), row.style("h"), row.style("rounded")], [[32], [26], [6]], `${row.elementId}: 32×26, rounded 6`);
    const cell = cellOf(root, row);
    assert.ok(cell?.has("justify_center") && cell.has("flex_none"), `${row.elementId}: centred in its cell`);
  }
  assert.deepEqual(active.style("bg"), ["selected"], "the active space is selected");
  assert.equal(other.style("bg"), undefined, "the others have no background until hovered");
  assert.deepEqual(texts(active), ["1", "●"]);
  assert.deepEqual(texts(other), ["2", "·"]);
  const mark = active.kids[1];
  assert.ok(mark.has("absolute"), "the mark sits apart from the number");
  assert.deepEqual([mark.style("right"), mark.style("text_color")], [[3], ["blocked"]]);
  assert.equal(byText(root, "Spaces"), undefined, "the rail has no header text");
  assert.deepEqual(cx.errors, []);
});

test("SPC-37: on the rail the number has its own 18px zone at the left, so two digits keep clear of the mark", () => {
  herdr.set({
    layout: sidebar(44),
    spaces: Array.from({ length: 10 }, (_, i) => space(`s${i + 1}`, [tab(`tb${i + 1}`)], { name: `w${i + 1}`, status: i === 9 ? "done" : "idle", active: i === 0 })),
  });
  const root = mount(Spaces, { props: {} }).render();
  for (const [id, n, mark] of [["space-s9", "9", "·"], ["space-s10", "10", "●"]]) {
    const row = byId(root, id);
    assert.deepEqual(texts(row), [n, mark]);
    const [number, glyph] = row.kids;
    assert.ok(number.has("absolute") && number.has("justify_center"), `${id}: the number is centred in its zone`);
    assert.deepEqual([number.style("left"), number.style("w")], [[0], [18]], `${id}: the zone is the cell's left 18px`);
    assert.deepEqual(glyph.style("right"), [3], `${id}: the mark 3px from the right, past the zone`);
  }
});

test("SPC-38: on the rail a machine is its icon with a connection dot and its name as tooltip; New space is a boxed +", () => {
  herdr.set({
    layout: sidebar(44),
    spaces: [space("s2", [tab("tb2")], { active: true, name: "srv", machine: "box" })],
  });
  const { render } = mount(Spaces, { props: {} });
  const root = render();
  const local = byId(root, "machine-local"), box = byId(root, "machine-box");
  assert.deepEqual(local.style("tooltip"), ["This computer"]);
  assert.deepEqual(box.style("tooltip"), ["box · asleep"], "a machine not connected says its state");
  for (const head of [local, box]) {
    assert.deepEqual([head.style("w"), head.style("mt")], [[32], [4]]);
    assert.ok(cellOf(root, head)?.has("justify_center"), `${head.elementId}: centred in its cell`);
  }
  const dot = (head) => find(head, (e) => e.has("absolute") && e.style("size")?.[0] === 6);
  assert.equal(dot(local), undefined, "this computer has no dot");
  assert.deepEqual([dot(box).style("bg"), dot(box).style("border_color")], [["dim"], ["chrome"]], "a gray dot, ringed in chrome");
  assert.equal(texts(box).length, 0, "no name, state or chevron on the rail");
  const empty = byId(root, "machine-new-local");
  assert.deepEqual(empty.style("tooltip"), ["New space on this computer"]);
  assert.ok(cellOf(root, empty)?.has("justify_center"));
  assert.ok(find(empty, (e) => e.style("size")?.[0] === 18 && e.style("border_color")?.[0] === "dim"), "the + sits in an 18px box");
  assert.equal(byText(root, "New space there"), undefined);
});

test("SPC-40: on the rail a rebuilt machine says so in its tooltip, connects on a click and shows its error; its old spaces stay out", async () => {
  herdr.set({
    layout: sidebar(44),
    spaces: [space("s2", [tab("tb2")], { active: true, name: "srv", machine: "box" })],
  });
  const { view, cx, render } = mount(Spaces, { props: {} });
  view.machines = [{ name: "box", target: "box.example", state: "unreachable", why: 'a different core answers there ("abc123")' }];
  let root = render();
  let box = byId(root, "machine-box");
  assert.deepEqual(box.style("tooltip"), ["box · rebuilt · click to connect to the new one"]);
  assert.equal(find(root, (e) => e.elementId === "space-s2"), undefined, "the old core's spaces are not listed");

  // The connect fails after the rm: the error shows in the tooltip and on the dot; a click tries again.
  herdr.onHc(({ args }) => (args[1] === "add" ? { code: 1, stdout: JSON.stringify({ error: { message: "host key changed" } }), stderr: "" } : { code: 0, stdout: "{}", stderr: "" }));
  box.handlers.click({}, cx);
  assert.deepEqual(byId(render(), "machine-box").style("tooltip"), ["box · connecting…"]);
  await waitFor(() => view.reconnecting.box?.error);
  root = render();
  box = byId(root, "machine-box");
  assert.deepEqual(box.style("tooltip"), ["box · host key changed · click to try again"]);
  assert.deepEqual(find(box, (e) => e.has("absolute") && e.style("size")?.[0] === 6).style("bg"), ["blocked"]);
  assert.ok(!view.folded.has("box"), "a click on a rebuilt machine connects, it doesn't fold");
  box.handlers.click({}, cx);
  await waitFor(() => herdr.calls("hc").filter(([a]) => a[1] === "add").length === 2);
  const changes = herdr.calls("hc").map(([a]) => a.slice(0, 2).join(" ")).filter((c) => c !== "machine ls");
  assert.deepEqual(changes, ["machine rm", "machine add", "machine add"], "the retry only adds");
  assert.deepEqual(cx.errors, []);
});

test("SPC-38: wide, the machine header and New space there keep their row look", () => {
  herdr.set({
    layout: sidebar(268),
    spaces: [space("s2", [tab("tb2")], { active: true, name: "srv", machine: "box" })],
  });
  const root = mount(Spaces, { props: {} }).render();
  const box = byId(root, "machine-box");
  assert.equal(box.style("tooltip"), undefined);
  assert.deepEqual(box.style("px"), [8]);
  assert.ok(texts(box).includes("box"));
  assert.ok(byText(root, "New space there"));
});

test("CHR-32, CHR-47: the footer on the rail centres its icons with the label as tooltip, the update dot on the icon", () => {
  herdr.set({ layout: sidebar(44), updates: { app: { version: "0.1.14", ready: "0.1.15", updates: true }, notes: [], core: {}, checked: null, checks: true, checking: false } });
  const { cx, render } = mount(Chrome, { props: { footer: true } });
  let root = render();
  const settings = byId(root, "settings"), machine = byId(root, "machine");
  for (const [row, label] of [[settings, "Settings"], [machine, "Add machine"]]) {
    assert.deepEqual([row.style("w"), row.style("px"), row.style("tooltip")], [[32], [0], [label]]);
    assert.ok(row.has("justify_center"));
    assert.ok(!texts(row).includes(label), `${label}: icon only`);
  }
  const dot = find(settings, (e) => e.style("bg")?.[0] === "accent");
  assert.ok(dot.has("absolute"));
  assert.deepEqual([dot.style("top"), dot.style("right")], [[5], [6]]);
  assert.ok(root.has("items_center"));
  machine.handlers.click({}, cx);
  assert.deepEqual(herdr.calls("run"), [["mod.open", { name: "machine-add" }]]);

  herdr.set({ layout: sidebar(268) });
  root = render();
  const wide = byId(root, "settings");
  assert.equal(wide.style("tooltip"), undefined);
  assert.ok(texts(wide).includes("Settings"));
  assert.ok(!find(wide, (e) => e.style("bg")?.[0] === "accent").has("absolute"), "wide, the dot follows the label");

  herdr.set({ updates: { app: { version: "0.1.14", ready: null, updates: true }, notes: [], core: {}, checked: null, checks: true, checking: false } });
  assert.equal(find(byId(render(), "settings"), (e) => e.style("bg")?.[0] === "accent"), undefined, "no dot without a ready update");
  assert.deepEqual(cx.errors, []);
});

function byText(root, text) {
  return find(root, (e) => e.kids?.some((k) => k === text));
}
