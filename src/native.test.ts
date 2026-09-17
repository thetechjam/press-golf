import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isNative, initNativeStorage, PERSISTED_KEYS } from './native';
import { kv, setBackend, type KvBackend } from './kv';
import { listRounds, saveRound, getSettings, saveSettings } from './storage';
import { makeRound } from './games/testFixtures';

/**
 * Pointing Press at storage that survives on a phone.
 *
 * All of it runs against a fake bridge, because the real one only exists
 * inside the native shell. What that can prove is everything except the Swift:
 * that the browser path is untouched, that all four keys come across, that a
 * write reaches the store, and that the failures a phone actually produces —
 * an unreadable key, a store that starts refusing writes — do not take the app
 * down with them.
 */

interface FakeBridge {
  disk: Map<string, string>;
  reads: string[];
  writes: { key: string; value: string | null }[];
}

function installBridge(
  initial: Record<string, string> = {},
  fail: { onGet?: string; onSet?: boolean } = {}
): FakeBridge {
  const disk = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: { key: string; value: string | null }[] = [];
  vi.stubGlobal('Capacitor', {
    isNativePlatform: () => true,
    Plugins: {
      Preferences: {
        get: async ({ key }: { key: string }) => {
          reads.push(key);
          if (fail.onGet === key) throw new Error(`cannot read ${key}`);
          return { value: disk.get(key) ?? null };
        },
        set: async ({ key, value }: { key: string; value: string }) => {
          writes.push({ key, value });
          if (fail.onSet) throw new Error('store is refusing writes');
          disk.set(key, value);
        },
        remove: async ({ key }: { key: string }) => {
          writes.push({ key, value: null });
          if (fail.onSet) throw new Error('store is refusing writes');
          disk.delete(key);
        },
      },
    },
  });
  return { disk, reads, writes };
}

let original: KvBackend | undefined;
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    get length() {
      return store.size;
    },
  });
});
afterEach(() => {
  if (original) {
    setBackend(original);
    original = undefined;
  }
  vi.unstubAllGlobals();
});

describe('on the web', () => {
  it('knows it is not a phone', () => {
    expect(isNative()).toBe(false);
  });

  it('does nothing, and says so', async () => {
    expect(await initNativeStorage()).toBe(false);
    // The backend is still the browser's own store — this is the guarantee
    // that shipping this file changes nothing for anyone using the website.
    kv.setItem('press.probe', 'a');
    expect(localStorage.getItem('press.probe')).toBe('a');
  });

  it('stays on the web path when the bridge says it is a browser', async () => {
    // Capacitor's web runtime is exactly this shape: the bridge is present and
    // the Plugins object is full of browser shims, and `isNativePlatform()` is
    // the only thing that says so. Taking the plugin's existence as proof of a
    // phone would move a browser's storage onto a shim and leave every round
    // already in localStorage behind.
    vi.stubGlobal('Capacitor', {
      isNativePlatform: () => false,
      Plugins: {
        Preferences: {
          get: async () => ({ value: null }),
          set: async () => {},
          remove: async () => {},
        },
      },
    });
    expect(await initNativeStorage()).toBe(false);
    kv.setItem('press.probe', 'a');
    expect(localStorage.getItem('press.probe')).toBe('a');
  });

  it('stays on the web path when the bridge is there but the plugin is not', async () => {
    // A native build missing the Preferences plugin would otherwise hydrate
    // from nothing and look like a wiped install.
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, Plugins: {} });
    expect(await initNativeStorage()).toBe(false);
  });
});

describe('inside the shell', () => {
  it('brings every key across before anything reads', async () => {
    const bridge = installBridge();
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    await initNativeStorage();
    expect(bridge.reads).toEqual([...PERSISTED_KEYS]);
  });

  it('serves what the store already held', async () => {
    const saved = [{ ...makeRound(), id: 'r1', course: 'Pebble Beach' }];
    const bridge = installBridge({ 'press.rounds.v1': JSON.stringify(saved) });
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    await initNativeStorage();
    expect(listRounds().map((r) => r.course)).toEqual(['Pebble Beach']);
    expect(bridge.writes).toHaveLength(0);
  });

  it('sends writes to the store and not to localStorage', async () => {
    const bridge = installBridge();
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    await initNativeStorage();

    saveRound({ ...makeRound(), id: 'r1', course: 'Torrey Pines South' });
    saveSettings({ glare: true });

    expect(bridge.writes.map((w) => w.key)).toEqual(['press.rounds.v1', 'press.settings.v1']);
    // The whole point: nothing reached the store iOS is allowed to empty.
    expect(localStorage.length).toBe(0);
  });

  it('survives a restart, which is the reason any of this exists', async () => {
    const bridge = installBridge();
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    await initNativeStorage();
    saveRound({ ...makeRound(), id: 'r1', course: 'Cypress Point' });

    // App closed and reopened against the same disk.
    installBridge(Object.fromEntries(bridge.disk));
    await initNativeStorage();
    expect(listRounds().map((r) => r.course)).toEqual(['Cypress Point']);
  });

  it('keeps going when one key cannot be read', async () => {
    // That key reads as absent, which for all four means "nothing saved yet".
    const bridge = installBridge(
      { 'press.settings.v1': JSON.stringify({ glare: true }) },
      { onGet: 'press.rounds.v1' }
    );
    const seen: string[] = [];
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    expect(await initNativeStorage((key) => seen.push(key))).toBe(true);

    expect(seen).toEqual(['press.rounds.v1']);
    expect(listRounds()).toEqual([]);
    expect(getSettings().glare).toBe(true);
    expect(bridge.reads).toEqual([...PERSISTED_KEYS]);
  });

  it('reports a write the store rejects instead of losing it silently', async () => {
    // A rejected promise is not a thrown error, so this is caught where the
    // promise is, not where the write was made.
    installBridge({}, { onSet: true });
    const seen: string[] = [];
    original = setBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    await initNativeStorage((key) => seen.push(key));

    expect(() => saveRound({ ...makeRound(), id: 'r1', course: 'Oakmont' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['press.rounds.v1']);
    // The app still agrees with itself, whatever the disk did.
    expect(listRounds().map((r) => r.course)).toEqual(['Oakmont']);
  });
});

/**
 * The guard against the worst-shaped bug available here.
 *
 * A key added to `storage.ts` and not to `PERSISTED_KEYS` works perfectly on
 * the web and silently stops persisting on a phone — no error, no crash, just
 * a setting that forgets itself between launches and a developer who cannot
 * reproduce it on a laptop. Reading the source is the only way to notice.
 */
describe('every key the app writes is a key the phone hydrates', () => {
  const source = (file: string) =>
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

  it('covers every press.* key in storage.ts and feedback.ts', () => {
    const found = new Set<string>();
    for (const file of ['./storage.ts', './feedback.ts']) {
      for (const m of source(file).matchAll(/'(press\.[a-z.]+v\d+)'/g)) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(0);
    expect([...found].sort()).toEqual([...PERSISTED_KEYS].sort());
  });
});
