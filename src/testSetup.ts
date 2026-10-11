/**
 * Runs before every test file (vite.config.ts `test.setupFiles`).
 *
 * Node 25+ defines `globalThis.localStorage` and `sessionStorage` itself: an
 * experimental Web Storage whose getter returns `undefined` unless Node is
 * started with `--localstorage-file`. Vitest's happy-dom environment makes
 * `window` the global object and copies the DOM's own properties onto it only
 * where nothing is defined yet — so on those Node versions every screen test
 * saw Node's undefined stub instead of a working storage and fell over on the
 * first `localStorage.clear()`. There is no separate `window.localStorage` to
 * copy back; what the environment does leave behind is happy-dom's `Storage`
 * constructor, so one of those is installed in the stub's place.
 *
 * Node 24 (`.nvmrc`, CI) has no such global, so this is a no-op there, and the
 * test is on the objects rather than the Node version so it stays a no-op if a
 * later Vitest resolves the collision itself. Pure-node suites have no DOM
 * and are left alone — they stub storage with `vi.stubGlobal` where they need
 * it.
 */
if (typeof document !== 'undefined') {
  const g = globalThis as unknown as Record<string, unknown>;
  const Storage = g.Storage as (new () => globalThis.Storage) | undefined;
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const current = g[key] as { getItem?: unknown } | undefined;
    if (typeof current?.getItem === 'function') continue;
    if (typeof Storage !== 'function') break;
    Object.defineProperty(globalThis, key, {
      value: new Storage(),
      configurable: true,
      writable: true,
    });
  }
}
