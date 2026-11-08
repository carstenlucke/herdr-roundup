// globalThis.fetch in tests: never the network. Each call is recorded; `fake.respond` decides the
// answer (default: rejects as an offline fetch does).
const realFetch = globalThis.fetch;

export const fake = {
  calls: [], // { url, init }
  respond: null, // (url, init) → Response | Error | promise of one; null: reject

  install() {
    globalThis.fetch = async (url, init = {}) => {
      fake.calls.push({ url: String(url), init });
      const r = fake.respond ? await fake.respond(String(url), init) : new TypeError("fetch failed (no network in tests)");
      if (r instanceof Error) throw r;
      return r;
    };
  },
  reset() {
    fake.calls = [];
    fake.respond = null;
    fake.install();
  },
  restore() { globalThis.fetch = realFetch; },

  // Answers every fetch with this status and body (an object goes out as JSON, a string as is).
  reply(status, body = {}) {
    fake.respond = () => response(status, body);
  },
  // The next fetch waits until the test calls the returned resolve(status, body) or reject(error).
  defer() {
    let release;
    const gate = new Promise((r) => { release = r; });
    const prev = fake.respond;
    let used = false;
    fake.respond = (url, init) => {
      if (used) return prev ? prev(url, init) : new TypeError("fetch failed");
      used = true;
      return gate;
    };
    return {
      resolve: (status, body) => release(response(status, body)),
      reject: (error = new TypeError("fetch failed")) => release(error),
    };
  },
};

export const response = (status, body = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
