import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setBackend, snapshotBackend, UnreadableKeyError, type KvBackend } from './kv';
import {
  ALIASES_KEY,
  COURSES_KEY,
  DISTINCT_KEY,
  ROUNDS_KEY,
  RestoreUndoError,
  getAliases,
  getDistinct,
  writeAll,
} from './storage';
import { buildBackup, restoreBackup, restoreFailureMessage } from './backup';
import { makeRound, player } from './games/testFixtures';

/**
 * Every write that can be refused, refused.
 *
 * Two ways a write fails. A full phone throws `QuotaExceededError` from
 * `localStorage`. In the native shell, a key that could not be read at
 * startup is refused by the write block, so a read-modify-write cannot
 * replace data the app never saw. Each writer here must answer false rather
 * than throw, and say the right one of those two reasons.
 */

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

/**
 * A native phone: `disk` is what is really stored, `blocked` the keys that
 * would not load. Returns the disk, to check what really happened to it.
 */
function onNative(disk: Record<string, string>, blocked: string[]) {
  const onDisk = new Map(Object.entries(disk));
  const loaded = Object.fromEntries([...onDisk].filter(([k]) => !blocked.includes(k)));
  const previous = setBackend(
    snapshotBackend(
      loaded,
      (key, value) => {
        if (value === null) onDisk.delete(key);
        else onDisk.set(key, value);
      },
      () => {},
      blocked
    )
  );
  original ??= previous;
  return onDisk;
}

const r = (id: string, name = 'Al') => ({ ...makeRound({ players: [player('p1', name)] }), id });

let original: KvBackend | null = null;
beforeEach(() => {
  store.clear();
  original = null;
});
afterEach(() => {
  if (original) setBackend(original);
});
describe('a restore that fails on an unreadable key (B)', () => {
  const people = { aliases: { al: 'Alex' }, distinct: ['a|b'] };

  it('puts back every key it wrote and leaves the unreadable one alone', () => {
    const realRounds = JSON.stringify([r('mine')]);
    const onDisk = onNative(
      { [ROUNDS_KEY]: realRounds, [ALIASES_KEY]: '{"bo":"Bob"}' },
      [ROUNDS_KEY]
    );
    let thrown: unknown;
    try {
      writeAll([r('theirs')], [], people);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnreadableKeyError);
    // The names went in before the rounds were refused; they are taken out.
    expect(onDisk.get(ALIASES_KEY)).toBe('{"bo":"Bob"}');
    expect(onDisk.has(DISTINCT_KEY)).toBe(false);
    // And the rounds really on disk are untouched — not deleted as "empty".
    expect(onDisk.get(ROUNDS_KEY)).toBe(realRounds);
    expect(getAliases()).toEqual({ bo: 'Bob' });
    expect(getDistinct().size).toBe(0);
  });

  it('puts back the rest when one key will not be put back, and says so', () => {
    store.set(COURSES_KEY, '[]');
    // Rounds write lands, courses is refused, and putting rounds back is refused too.
    let roundsWrites = 0;
    const real = localStorage.setItem;
    localStorage.setItem = (k: string, v: string) => {
      if (k === COURSES_KEY) throw new DOMException('full', 'QuotaExceededError');
      if (k === ROUNDS_KEY && ++roundsWrites > 1) throw new DOMException('full', 'QuotaExceededError');
      real(k, v);
    };
    const realRemove = localStorage.removeItem;
    localStorage.removeItem = (k: string) => {
      if (k === ROUNDS_KEY) throw new DOMException('refused', 'SecurityError');
      realRemove(k);
    };
    let thrown: unknown;
    try {
      writeAll([r('theirs')], [{ id: 'c', name: 'C', holes: [] }], people);
    } catch (err) {
      thrown = err;
    } finally {
      localStorage.setItem = real;
      localStorage.removeItem = realRemove;
    }
    expect(thrown).toBeInstanceOf(RestoreUndoError);
    expect((thrown as RestoreUndoError).keys).toEqual([ROUNDS_KEY]);
    // The names were still put back, after the rounds refused.
    expect(store.has(ALIASES_KEY)).toBe(false);
    expect(store.has(DISTINCT_KEY)).toBe(false);
  });

  it('tells the user the real reason', () => {
    const file = JSON.stringify(buildBackup([r('theirs')], [], '0.2.0', new Date(), people));
    onNative({ [ROUNDS_KEY]: JSON.stringify([r('mine')]) }, [ROUNDS_KEY]);
    const result = restoreBackup(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/couldn't read/);
    expect(result.error).not.toMatch(/wasn't room/);
  });

  it('still blames room when room was the problem', () => {
    expect(restoreFailureMessage(new DOMException('full', 'QuotaExceededError'))).toMatch(
      /wasn't room/
    );
    expect(
      restoreFailureMessage(new RestoreUndoError(new DOMException('full', 'QuotaExceededError'), [ROUNDS_KEY]))
    ).toMatch(/wasn't room.*couldn't be undone/);
  });
});

