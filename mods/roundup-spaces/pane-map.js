// The agent quicklook's data: a space's agents by tab, and each tab's panes as a small map.
// Herdr gives mods no split arrangement; it is only in the machine's core document
// `herdr-app` (`doc.get` over `hc connect`), whose schema calls it opaque JSON. Everything
// here is pure and checks the form it reads: an unknown form means no map, never half a map
// and never a throw. tests/pane-map.test.mjs runs it in node.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The document from `hc connect`'s answer to request id 1: { version, value }, or null for
// anything else (an error, another id, no value, broken JSON).
export function docValue(stdout) {
  const answers = [];
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (isObject(m) && m.id === 1) answers.push(m);
    } catch { /* not an answer */ }
  }
  if (answers.length !== 1) return null;
  const [m] = answers;
  if (m.jsonrpc !== "2.0" || m.error !== undefined || !isObject(m.result) || !isObject(m.result.value)) return null;
  return { version: m.result.version ?? null, value: m.result.value };
}

// An id as the machine's own document has it: the app qualifies another machine's ids
// (`vps/t7`), the document on that machine doesn't. Null for an id of any other machine.
export function localId(id, machine) {
  if (typeof id !== "string" || !id) return null;
  if (!machine) return id.includes("/") ? null : id;
  const prefix = `${machine}/`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return rest && !rest.includes("/") ? rest : null;
}

// The tree of tab `tabId` (as the app names it) in that machine's document, or null.
export function tabRoot(value, tabId, machine) {
  const id = localId(tabId, machine);
  if (!id || !isObject(value) || !Array.isArray(value.spaces)) return null;
  for (const s of value.spaces) {
    if (!isObject(s) || !Array.isArray(s.tabs)) continue;
    const t = s.tabs.find((t) => isObject(t) && t.id === id);
    if (t) return t.root ?? null;
  }
  return null;
}

// A node's share: no size counts as 1; a fixed px size or anything not a positive number is
// a form the map doesn't draw (null).
function weightOf(size) {
  if (size === undefined || size === null) return 1;
  if (!isObject(size) || size.px !== undefined) return null;
  const w = size.weight;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : null;
}

// The tree reduced to what the map draws: { dir: "row" | "column", weight, children },
// { terminal, weight } or { mod: true, weight }. Null for the whole tab when any node is
// of a form it doesn't know.
export function paneMap(root) {
  const node = (n) => {
    if (!isObject(n)) return null;
    const weight = weightOf(n.size);
    if (weight === null) return null;
    if (n.type === "row" || n.type === "column") {
      if (!Array.isArray(n.children) || !n.children.length) return null;
      const children = [];
      for (const c of n.children) {
        const k = node(c);
        if (!k) return null;
        children.push(k);
      }
      return { dir: n.type, weight, children };
    }
    if (n.type === "block" && isObject(n.content)) {
      if (typeof n.content.terminal === "string" && n.content.terminal) return { terminal: n.content.terminal, weight };
      if (typeof n.content.mod === "string" && n.content.mod) return { mod: true, weight };
    }
    return null;
  };
  return node(root);
}

// The map's terminal leaves, in reading order (left to right, top to bottom).
export function leaves(map) {
  if (!map) return [];
  if (map.children) return map.children.flatMap(leaves);
  return map.terminal ? [map] : [];
}

// The quicklook of one space: its current agents grouped by tab, in tab order,
// [{ index, name, rows, map }]. Rows are always all current agents, each once; the document
// only orders them within a tab and gives the tab its map, and only when every agent of that
// tab is in that tab's tree. A map's agent leaves carry their agent (`agent`).
// `agents`: agents() of the space; `tabs`: its tabs from spaces(); `value`: the machine's
// document or null; `machine`: the space's machine (null here).
export function quicklook(agents, tabs, value, machine) {
  const groups = new Map();
  const tabOf = new Map((tabs ?? []).map((t) => [t.id, t]));
  for (const a of agents) {
    const t = tabOf.get(a.tab);
    if (!groups.has(a.tab)) groups.set(a.tab, { id: a.tab, index: t?.index ?? a.tab_index ?? 0, name: t?.name ?? a.tab_name ?? "", agents: [] });
    groups.get(a.tab).agents.push(a);
  }
  return [...groups.values()].sort((x, y) => x.index - y.index).map((g) => {
    const tree = value ? paneMap(tabRoot(value, g.id, machine)) : null;
    const local = new Map(g.agents.map((a) => [localId(a.address, machine), a]));
    const order = leaves(tree).map((l) => l.terminal);
    const fits = tree && g.agents.every((a) => order.includes(localId(a.address, machine)));
    if (!fits) return { index: g.index, name: g.name, rows: g.agents, map: null };
    const mark = (n) => (n.children ? { ...n, children: n.children.map(mark) } : n.terminal && local.has(n.terminal) ? { ...n, agent: local.get(n.terminal) } : n);
    const rows = order.filter((id) => local.has(id)).map((id) => local.get(id));
    return { index: g.index, name: g.name, rows: [...new Set(rows)], map: mark(tree) };
  });
}

// Which agents are where: a new one means a new reason to read the document again.
export function fingerprint(agents) {
  return JSON.stringify(agents.map((a) => [a.address, a.tab]).sort());
}
