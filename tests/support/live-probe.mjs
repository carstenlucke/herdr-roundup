// Not a test: reads the real context of live terminals through the mod's own context-io.js and
// strategies, with the herdr stub's exec and a real `hc`. For live checks by hand:
//   node tests/support/live-probe.mjs t7 [t8 ...]
// Read-only: it runs hc get, ps, stat, tail, lsof and awk, and changes nothing.
import { spawnSync } from "node:child_process";
import { herdr } from "./harness.mjs";

herdr.onHc((call) => {
  const args = call.args ?? call[0] ?? call;
  const r = spawnSync("hc", Array.isArray(args) ? args : args.args, { encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
});
herdr.set({ home: process.env.HOME });
const { makeIo } = await import("../../mods/roundup-pane/context-io.js");
const { STRATEGIES } = await import("../../mods/roundup-pane/context/registry.js");

const io = makeIo();
for (const terminal of process.argv.slice(2)) {
  const t0 = performance.now();
  const fg = await io.terminal(terminal);
  const s = STRATEGIES.find((x) => x.matches.some((m) => (fg?.title ?? "").toLowerCase().includes(m))) ?? null;
  const tried = [];
  for (const strategy of s ? [s, ...STRATEGIES.filter((x) => x !== s)] : STRATEGIES) {
    const src = await strategy.locate({ terminal }, io, {});
    if (!src) { tried.push(strategy.id); continue; }
    const r = await strategy.read(src, io, {});
    console.log(JSON.stringify({ terminal, strategy: strategy.id, ms: Math.round(performance.now() - t0), source: { ...src, files: undefined }, reading: r }, null, 1));
    break;
  }
  if (tried.length === STRATEGIES.length) console.log(JSON.stringify({ terminal, reading: null, tried }));
}
