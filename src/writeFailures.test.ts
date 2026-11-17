import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  kv,
  setBackend,
  snapshotBackend,
  UnreadableKeyError,
  writeFailureReason,
  type KvBackend,
} from './kv';
import {
  ALIASES_KEY,
  COURSES_KEY,
  DISTINCT_KEY,
  ROUNDS_KEY,
  SETTINGS_KEY,
  RestoreUndoError,
  deleteCourse,
  deleteRound,
  deleteRounds,
  getAliases,
  getDistinct,
  getSettings,
  listCourses,
  listRounds,
  markDistinct,
  mergePeople,
  saveCourse,
  saveRound,
  saveRounds,
  saveSettings,
  writeAll,
} from './storage';
import { eraseEverything } from './erase';
import { PERSISTED_KEYS } from './native';
import { buildBackup, restoreBackup, restoreFailureMessage } from './backup';
import { QUEUE_KEY, buildFeedback, clearQueue, enqueue, flushQueue, listQueue } from './feedback';
import { notSavedReason } from './notSaved';
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

/** Throws `QuotaExceededError` for the given keys, as a full phone does. */
function refuse(...keys: string[]) {
  const real = localStorage.setItem;
  const realRemove = localStorage.removeItem;
  localStorage.setItem = (k: string, v: string) => {
    if (keys.includes(k)) throw new DOMException('full', 'QuotaExceededError');
    real(k, v);
  };
  localStorage.removeItem = (k: string) => {
    if (keys.includes(k)) throw new DOMException('refused', 'SecurityError');
    realRemove(k);
  };
  return () => {
    localStorage.setItem = real;
    localStorage.removeItem = realRemove;
  };
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
describe('the write block says why', () => {
  it('refuses with its own error, which reads as "unreadable"', () => {
    const backend = snapshotBackend({}, () => {}, () => {}, [ROUNDS_KEY]);
    let thrown: unknown;
    try {
      backend.setItem(ROUNDS_KEY, '[]');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnreadableKeyError);
    expect(writeFailureReason(thrown)).toBe('unreadable');
    expect(writeFailureReason(new DOMException('full', 'QuotaExceededError'))).toBe('full');
  });

  it('answers which keys are blocked, and none on the web', () => {
    expect(kv.isUnreadable(ROUNDS_KEY)).toBe(false);
    onNative({}, [ROUNDS_KEY]);
    expect(kv.isUnreadable(ROUNDS_KEY)).toBe(true);
    expect(kv.isUnreadable(COURSES_KEY)).toBe(false);
  });

  it('gives the screen a reason that matches the cause', () => {
    expect(notSavedReason(ROUNDS_KEY)).toMatch(/storage is full/);
    onNative({}, [ROUNDS_KEY]);
    expect(notSavedReason(ROUNDS_KEY)).toMatch(/couldn’t read/);
    expect(notSavedReason([ALIASES_KEY, ROUNDS_KEY])).toMatch(/couldn’t read/);
    expect(notSavedReason(COURSES_KEY)).toMatch(/storage is full/);
    // A failed delete is not answered with "delete old rounds".
    expect(notSavedReason(COURSES_KEY, true)).not.toMatch(/delete old rounds/);
  });
});

describe('Erase everything on a phone with an unreadable key (A)', () => {
  it('removes every key, the unreadable one included, and reports nothing left', () => {
    const disk = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, '"something"']));
    // A key in the middle of the list, so a stop there would leave some behind.
    const blocked = PERSISTED_KEYS[Math.floor(PERSISTED_KEYS.length / 2)];
    const onDisk = onNative(disk, [blocked]);
    expect(eraseEverything()).toEqual([]);
    expect([...onDisk.keys()]).toEqual([]);
    // Gone, so writable again: a new round after the wipe is kept.
    expect(kv.isUnreadable(blocked)).toBe(false);
  });

  it('carries on past a key the store refuses, and returns it', () => {
    for (const k of PERSISTED_KEYS) store.set(k, '"x"');
    const restore = refuse(SETTINGS_KEY);
    try {
      expect(eraseEverything()).toEqual([SETTINGS_KEY]);
    } finally {
      restore();
    }
    expect([...store.keys()]).toEqual([SETTINGS_KEY]);
  });
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

describe('several rounds in one write (C)', () => {
  it('saves all of them or none of them', () => {
    saveRounds([r('a'), r('b')]);
    const renamed = listRounds().map((x) => ({ ...x, course: 'Renamed' }));
    const restore = refuse(ROUNDS_KEY);
    try {
      expect(saveRounds(renamed)).toBe(false);
    } finally {
      restore();
    }
    expect(listRounds().map((x) => x.course)).toEqual([undefined, undefined]);
    expect(saveRounds(renamed)).toBe(true);
    expect(listRounds().map((x) => x.course)).toEqual(['Renamed', 'Renamed']);
  });
});

describe('the writes that used to throw', () => {
  beforeEach(() => {
    saveRounds([r('a', 'Al'), r('b', 'Alex')]);
    saveCourse({ id: 'c1', name: 'Pebble', holes: [] });
  });

  it('deleting rounds answers false and keeps them', () => {
    const restore = refuse(ROUNDS_KEY);
    try {
      expect(deleteRound('a')).toBe(false);
      expect(deleteRounds(['a', 'b'])).toBe(false);
    } finally {
      restore();
    }
    expect(listRounds()).toHaveLength(2);
    expect(deleteRounds(['a', 'b'])).toBe(true);
    expect(listRounds()).toHaveLength(0);
  });

  it('deleting a course answers false and keeps it', () => {
    const restore = refuse(COURSES_KEY);
    try {
      expect(deleteCourse('c1')).toBe(false);
    } finally {
      restore();
    }
    expect(listCourses()).toHaveLength(1);
  });

  it('marking two people different answers false', () => {
    const restore = refuse(DISTINCT_KEY);
    try {
      expect(markDistinct('Al', 'Alex')).toBe(false);
    } finally {
      restore();
    }
    expect(getDistinct().size).toBe(0);
  });

  it('a merge is both writes or neither', () => {
    const restore = refuse(ROUNDS_KEY);
    try {
      expect(mergePeople('Al', 'Alex')).toBe(false);
    } finally {
      restore();
    }
    // The alias that went in first is taken back out.
    expect(getAliases()).toEqual({});
    expect(listRounds().map((x) => x.players[0].name).sort()).toEqual(['Al', 'Alex']);
    expect(mergePeople('Al', 'Alex')).toBe(true);
    expect(listRounds().map((x) => x.players[0].name)).toEqual(['Alex', 'Alex']);
  });

  it('a merge refused on an unreadable alias key changes nothing', () => {
    const rounds = JSON.stringify([r('a', 'Al'), r('b', 'Alex')]);
    const onDisk = onNative({ [ROUNDS_KEY]: rounds }, [ALIASES_KEY]);
    expect(mergePeople('Al', 'Alex')).toBe(false);
    expect(onDisk.get(ROUNDS_KEY)).toBe(rounds);
  });

  it('settings answer null and keep what was stored', () => {
    saveSettings({ glare: true });
    const restore = refuse(SETTINGS_KEY);
    try {
      expect(saveSettings({ glare: false })).toBeNull();
    } finally {
      restore();
    }
    expect(getSettings().glare).toBe(true);
  });

  it('a round save on an unreadable rounds key is refused, not thrown', () => {
    onNative({}, [ROUNDS_KEY]);
    expect(saveRound(r('x'))).toBe(false);
  });
});

describe('the feedback queue', () => {
  const entry = () =>
    buildFeedback(
      { kind: 'bug', reporter: '', message: 'hi', includeRound: false },
      { screen: 'home', version: '0', userAgent: 'ua', viewport: '1x1' }
    );

  it('answers false when a report cannot be queued', () => {
    const restore = refuse(QUEUE_KEY);
    try {
      expect(enqueue(entry())).toBe(false);
    } finally {
      restore();
    }
    expect(listQueue()).toEqual([]);
  });

  it('answers false when the queue cannot be cleared, and keeps it', () => {
    expect(enqueue(entry())).toBe(true);
    const restore = refuse(QUEUE_KEY);
    try {
      expect(clearQueue()).toBe(false);
    } finally {
      restore();
    }
    expect(listQueue()).toHaveLength(1);
  });

  it('does not throw out of a flush whose final write is refused', async () => {
    expect(enqueue(entry())).toBe(true);
    const restore = refuse(QUEUE_KEY);
    try {
      await expect(flushQueue(async () => {})).resolves.toEqual({ sent: 1, remaining: 0 });
    } finally {
      restore();
    }
  });
});
