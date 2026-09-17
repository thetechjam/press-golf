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
    const backend = snapshotBackend({}, native.persist, (key) => seen.push(key));
    native.failWrites();
    expect(() => backend.setItem('press.rounds.v1', '[]')).not.toThrow();
    expect(seen).toEqual(['press.rounds.v1']);
    // And the snapshot still moved, so the app is consistent with itself.
    expect(backend.getItem('press.rounds.v1')).toBe('[]');
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
