// A fake gpui context. One object stands for every cx a mod gets (init's, a handler's, a task's), so a
// test reads everything off it: notifies, stops, spawned tasks and their errors, timers, the clipboard.
import { clock } from "./clock.mjs";

export function makeCx() {
  const cx = {
    notified: 0,
    stopped: 0,
    propagated: 0,
    tasks: [], // { promise, done, error }
    errors: [], // what spawned bodies and timer handlers threw
    clipboard: undefined,
    opened: [], // open_url
    focusHandles: [],
    views: [],

    notify() { cx.notified++; },
    stop_propagation() { cx.stopped++; },
    propagate() { cx.propagated++; },
    phase: () => "event",
    theme: () => ({}),
    bind_keys: (bindings) => bindings.length,
    open_url(url) { cx.opened.push(url); },
    read_from_clipboard() { return cx.clipboard; },
    write_to_clipboard(text) { cx.clipboard = text; },
    focus_handle() {
      const h = { focused: false, focus() { h.focused = true; }, blur() { h.focused = false; }, is_focused: () => h.focused, contains_focused: () => h.focused };
      cx.focusHandles.push(h);
      return h;
    },
    // Runs the body at once, as GPUI's spawn starts it on the next tick; a rejection is kept in `errors`.
    spawn(body) {
      const task = { done: false, cancelled: false, error: undefined };
      task.promise = Promise.resolve()
        .then(() => body(cx))
        .catch((e) => { if (!e?.reset) { task.error = e; cx.errors.push(e); } })
        .finally(() => { task.done = true; });
      cx.tasks.push(task);
      return { cancel() { task.cancelled = true; }, is_done: () => task.done };
    },
    sleep(ms = 0) { return new Promise((resolve) => clock.schedule(ms, () => resolve(), cx)); },
    timer: {
      after(ms, handler) { const t = clock.schedule(ms, handler, cx); return { cancel() { t.cancelled = true; }, is_done: () => t.done }; },
      every(ms, handler) { const t = clock.schedule(ms, handler, cx, ms); return { cancel() { t.cancelled = true; }, is_done: () => t.cancelled }; },
    },
    // A retained nested view: constructed, init run, rendered by harness render().
    new(Class, props) { const view = new Class(props); view.init?.(props, cx); cx.views.push(view); return view; },

    // Waits until every spawned task that can finish has finished (loops waiting on nextCommand or
    // watchFolder stay pending; this returns once the rest have settled).
    async settle(rounds = 20) {
      for (let i = 0; i < rounds; i++) {
        await new Promise((r) => setImmediate(r));
        const open = cx.tasks.filter((t) => !t.done).map((t) => t.promise);
        if (!open.length) return;
        await Promise.race([Promise.all(open), new Promise((r) => setTimeout(r, 25))]);
      }
    },
  };
  return cx;
}
