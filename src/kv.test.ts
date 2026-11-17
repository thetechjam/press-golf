import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { kv, setBackend, snapshotBackend, type KvBackend } from './kv';
import { listRounds, saveRound, deleteRound, getSettings, saveSettings } from './storage';
import { makeRound } from './games/testFixtures';

/** `makeRound` fixes the id and carries no course, so both are set here. */
const round = (id: string, course: string) => ({ ...makeRound(), id, course });

/**
 * The seam between the app and wherever its strings actually live.
 *
 * On the web that is `localStorage` and nothing here changes what happens. The
 * reason the seam exists is iOS: inside a WKWebView, local storage is transient
 * and the system reclaims it, so an App Store build of Press would lose every
 * round somebody had played. `snapshotBackend` is the shape that survives —
 * and it is tested here, against a fake asynchronous store, rather than
 * discovered on a device.
 */

/** Stands in for Capacitor Preferences: reachable only by promise. */
function fakeNativeStore(initial: Record<string, string> = {}) {
  const disk = new Map(Object.entries(initial));
  const writes: { key: string; value: string | null }[] = [];
  let failNext = false;
  return {
    disk,
    writes,
    failWrites: () => {
      failNext = true;
    },
    /** What the app awaits once, while the splash screen is up. */
    load: async () => Object.fromEntries(disk),
    persist: (key: string, value: string | null) => {
      writes.push({ key, value });
      if (failNext) throw new Error('native store unavailable');
      if (value === null) disk.delete(key);
      else disk.set(key, value);
    },
  };
}

let original: KvBackend;
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});
afterEach(() => {
  if (original) setBackend(original);
  vi.unstubAllGlobals();
});

describe('the default backend', () => {
  it('is the browser store itself, not a copy of it', () => {
    kv.setItem('press.probe', 'a');
    expect(localStorage.getItem('press.probe')).toBe('a');
    localStorage.setItem('press.probe', 'b');
    // No cache in front of it: a value written behind the seam is still read
    // through it. Twelve test files seed localStorage directly and rely on this.
    expect(kv.getItem('press.probe')).toBe('b');
  });

  it('removes through to the same place', () => {
    kv.setItem('press.probe', 'a');
    kv.removeItem('press.probe');
    expect(localStorage.getItem('press.probe')).toBeNull();
  });
});

describe('kv.forget', () => {
  it('answers a refusal on the web as a rejection, the same way native does', async () => {
    localStorage.removeItem = () => {
      throw new DOMException('refused', 'SecurityError');
    };
    await expect(kv.forget('press.rounds.v1')).rejects.toThrow('refused');
  });

  it('waits for a native delete to land before resolving', async () => {
    let land!: () => void;
    let landed = false;
    original = setBackend(
      snapshotBackend({ 'press.rounds.v1': '[]' }, () =>
        new Promise<void>((resolve) => {
          land = () => {
            landed = true;
            resolve();
          };
        })
      )
    );
    const forgetting = kv.forget('press.rounds.v1');
    let settled = false;
    void forgetting.then(() => (settled = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    land();
    await forgetting;
    expect(landed).toBe(true);
  });
});

describe('swapping the backend', () => {
  it('hands back the one it replaced, so a caller can put it back', () => {
    const fake: KvBackend = { getItem: () => 'x', setItem: () => {}, removeItem: () => {} };
    const previous = setBackend(fake);
    expect(kv.getItem('anything')).toBe('x');
    setBackend(previous);
    expect(kv.getItem('anything')).toBeNull();
  });
});

describe('snapshotBackend — the shape iOS needs', () => {
  it('answers reads from the snapshot it was loaded with', async () => {
    const native = fakeNativeStore({ 'press.rounds.v1': '[]' });
    const backend = snapshotBackend(await native.load(), native.persist);
    expect(backend.getItem('press.rounds.v1')).toBe('[]');
    expect(backend.getItem('press.missing')).toBeNull();
    // Reading is not a store operation at all, which is the entire point:
    // the store is only reachable by promise and readers are synchronous.
    expect(native.writes).toHaveLength(0);
  });

  it('reads back a value the instant it is written, not once the write lands', () => {
    // The write is in flight. A reader that saw the old value here would be a
    // bug nobody could reproduce.
    const native = fakeNativeStore();
    const backend = snapshotBackend({}, native.persist);
    backend.setItem('press.rounds.v1', '[1]');
    expect(backend.getItem('press.rounds.v1')).toBe('[1]');
  });

  it('forgets a removed key the instant it is removed', () => {
    // The mirror of the test above, and the one the feedback queue depends on:
    // it clears itself with removeItem, and a read that still saw the old
    // queue would resend reports that were already delivered.
    const native = fakeNativeStore({ 'press.feedback.queue.v1': '[{}]' });
    const backend = snapshotBackend({ 'press.feedback.queue.v1': '[{}]' }, native.persist);
    backend.removeItem('press.feedback.queue.v1');
    expect(backend.getItem('press.feedback.queue.v1')).toBeNull();
  });

  it('sends every write out to the store', () => {
    const native = fakeNativeStore();
    const backend = snapshotBackend({}, native.persist);
    backend.setItem('press.settings.v1', '{"glare":true}');
    backend.removeItem('press.settings.v1');
    expect(native.writes).toEqual([
      { key: 'press.settings.v1', value: '{"glare":true}' },
      { key: 'press.settings.v1', value: null },
    ]);
    expect(native.disk.has('press.settings.v1')).toBe(false);
  });

  it('keeps going when the store rejects a write, and says so', () => {
    // A failed native write cannot be reported to the caller — it has already
    // returned. Throwing here would take down the screen that wrote; the
    // honest answer is to keep the app usable and hand the failure somewhere
    // it can be reported.
    const native = fakeNativeStore();
    const seen: string[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = snapshotBackend({}, native.persist, (key) => seen.push(key));
    native.failWrites();
    expect(() => backend.setItem('press.rounds.v1', '[]')).not.toThrow();
    expect(seen).toEqual(['press.rounds.v1']);
    expect(logged).toHaveBeenCalled();
    // And the snapshot still moved, so the app is consistent with itself.
    expect(backend.getItem('press.rounds.v1')).toBe('[]');
    logged.mockRestore();
  });

  it('reports a write whose promise rejects, which a try/catch cannot see', async () => {
    // Capacitor's Preferences calls return a promise. Leaving that promise
    // uncaught is a full disk with a round that looks saved.
    const seen: string[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = snapshotBackend(
      {},
      () => Promise.reject(new Error('disk full')),
      (key) => seen.push(key)
    );
    expect(() => backend.setItem('press.rounds.v1', '[]')).not.toThrow();
    await Promise.resolve();
    expect(seen).toEqual(['press.rounds.v1']);
    expect(logged.mock.calls.some((c) => String(c[0]).includes('press.rounds.v1'))).toBe(true);
    expect(backend.getItem('press.rounds.v1')).toBe('[]');
    logged.mockRestore();
  });

  it('reports a rejection from a thenable that is not this realm’s Promise', async () => {
    // A bridge can hand back a promise built in another realm, which
    // `instanceof Promise` does not recognise.
    const seen: string[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const foreign = {
      then(_ok: unknown, fail: (err: unknown) => void) {
        fail(new Error('disk full'));
      },
    } as unknown as Promise<void>;
    const backend = snapshotBackend({}, () => foreign, (key) => seen.push(key));
    backend.setItem('press.rounds.v1', '[]');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['press.rounds.v1']);
    logged.mockRestore();
  });

  it('refuses to write or remove a key that could not be read', () => {
    const native = fakeNativeStore();
    const backend = snapshotBackend({}, native.persist, undefined, ['press.rounds.v1']);
    expect(() => backend.setItem('press.rounds.v1', '[]')).toThrow(/will not overwrite/);
    expect(() => backend.removeItem('press.rounds.v1')).toThrow(/will not overwrite/);
    expect(backend.getItem('press.rounds.v1')).toBeNull();
    expect(native.writes).toEqual([]);
    backend.setItem('press.settings.v1', '{}');
    expect(native.writes).toEqual([{ key: 'press.settings.v1', value: '{}' }]);
  });

  it('forgets a key that could not be read, and unlocks it only once the delete lands', async () => {
    let land!: () => void;
    const persist = vi.fn(
      (_key: string, _value: string | null) => new Promise<void>((resolve) => (land = resolve))
    );
    const backend = snapshotBackend({}, persist, () => {}, ['press.rounds.v1']);
    const forgetting = backend.forget!('press.rounds.v1');
    expect(persist).toHaveBeenCalledWith('press.rounds.v1', null);
    // In flight: whatever is on disk is still there, so writes stay refused.
    expect(backend.isUnreadable!('press.rounds.v1')).toBe(true);
    expect(() => backend.setItem('press.rounds.v1', '[]')).toThrow(/will not overwrite/);
    land();
    await forgetting;
    expect(backend.isUnreadable!('press.rounds.v1')).toBe(false);
    backend.setItem('press.rounds.v1', '[]');
    expect(backend.getItem('press.rounds.v1')).toBe('[]');
  });

  it('rejects a forget whose delete the store later refuses, logs it, and keeps the lock', async () => {
    const seen: string[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = snapshotBackend(
      {},
      () => Promise.reject(new Error('refused')),
      (key) => seen.push(key),
      ['press.rounds.v1']
    );
    await expect(backend.forget!('press.rounds.v1')).rejects.toThrow('refused');
    expect(seen).toEqual(['press.rounds.v1']);
    expect(logged.mock.calls.some((c) => String(c[0]).includes('press.rounds.v1'))).toBe(true);
    expect(backend.isUnreadable!('press.rounds.v1')).toBe(true);
    logged.mockRestore();
  });

  it('rejects a forget whose store throws straight away', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = snapshotBackend({ 'press.settings.v1': '{}' }, () => {
      throw new Error('bridge gone');
    });
    await expect(backend.forget!('press.settings.v1')).rejects.toThrow('bridge gone');
    logged.mockRestore();
  });

  it('still logs when nobody handed in a handler', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = snapshotBackend({}, () => Promise.reject(new Error('disk full')));
    backend.setItem('press.settings.v1', '{}');
    await Promise.resolve();
    expect(logged.mock.calls.some((c) => String(c[0]).includes('press.settings.v1'))).toBe(true);
    logged.mockRestore();
  });
});

describe('the whole app, on a store that is only reachable by promise', () => {
  /** What `main.tsx` would do on iOS: load once, then hand over. */
  const boot = async (native: ReturnType<typeof fakeNativeStore>) => {
    original = setBackend(snapshotBackend(await native.load(), native.persist));
  };

  it('saves and lists rounds with no promise in sight', async () => {
    const native = fakeNativeStore();
    await boot(native);

    saveRound(round('r1', 'Torrey Pines South'));
    saveRound(round('r2', 'Cypress Point'));

    expect(listRounds().map((r) => r.course)).toContain('Cypress Point');
    expect(listRounds()).toHaveLength(2);

    deleteRound('r1');
    expect(listRounds().map((r) => r.id)).toEqual(['r2']);
  });

  it('puts the rounds somewhere that outlives the process', async () => {
    const native = fakeNativeStore();
    await boot(native);
    saveRound(round('r1', 'Pebble Beach'));

    // The app is closed and reopened: a second boot off the same store.
    const second = fakeNativeStore(Object.fromEntries(native.disk));
    setBackend(snapshotBackend(await second.load(), second.persist));
    expect(listRounds().map((r) => r.course)).toEqual(['Pebble Beach']);
  });

  it('carries settings across a restart too', async () => {
    const native = fakeNativeStore();
    await boot(native);
    saveSettings({ glare: true, theme: 'dark' });

    const second = fakeNativeStore(Object.fromEntries(native.disk));
    setBackend(snapshotBackend(await second.load(), second.persist));
    expect(getSettings().glare).toBe(true);
    expect(getSettings().theme).toBe('dark');
  });

  it('starts empty on a fresh install rather than throwing', async () => {
    const native = fakeNativeStore();
    await boot(native);
    expect(listRounds()).toEqual([]);
    expect(getSettings()).toEqual(expect.objectContaining({ glare: false }));
  });
});
