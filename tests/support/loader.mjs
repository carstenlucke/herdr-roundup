// Module hooks (installed by harness.mjs): the bare imports Herdr provides to mods resolve to the
// stubs beside this file. Everything else resolves as Node would. `resolveSync` is for
// module.registerHooks(), in this thread (Node 22.15 and later, which the suite needs).
const STUBS = {
  herdr: "./herdr.mjs",
  "gpui-kit": "./gpui-kit.mjs",
  gpui: "./gpui-kit.mjs",
  "gpui-base": "./gpui-base.mjs",
};

const stubFor = (specifier) => (Object.hasOwn(STUBS, specifier) ? { url: new URL(STUBS[specifier], import.meta.url).href, format: "module", shortCircuit: true } : null);

export function resolveSync(specifier, context, next) {
  return stubFor(specifier) ?? next(specifier, context);
}
