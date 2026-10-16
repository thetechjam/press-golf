import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eraseEverything } from './erase';
import { PERSISTED_KEYS } from './native';
import {
  saveRound,
  saveCourse,
  saveSettings,
  mergePeople,
  markDistinct,
  listRounds,
  listCourses,
  getSettings,
  getAliases,
  getDistinct,
  DEFAULT_SETTINGS,
} from './storage';
import { buildFeedback, enqueue, listQueue } from './feedback';
import { makeRound } from './games/testFixtures';

/**
 * One button, every key.
 *
 * The test writes through the real modules rather than poking keys in by
 * hand, because the promise on the privacy page is about what the app does,
 * not about a list in a source file: a module that started writing somewhere
 * new would show up here as a key left behind.
 */

// Vitest runs in node — back localStorage with a Map that can be counted.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
});

/** One write of every kind the app makes, through the module that owns it. */
function fillEverything(): void {
  saveRound({ ...makeRound(), id: 'r1', course: 'Pebble Beach' });
  saveCourse({ id: 'c1', name: 'Pebble Beach', holes: makeRound().holes });
  saveSettings({ glare: true, reporterName: 'Al' });
  mergePeople('Al', 'Alex');
  markDistinct('Mike', 'Mike S');
  enqueue(
    buildFeedback(
      { kind: 'bug', reporter: 'Al', message: 'The 9th', includeRound: false },
      { screen: 'play', version: '0.2.0', userAgent: 'ua', viewport: '393x852' }
    )
  );
}

beforeEach(() => store.clear());

describe('eraseEverything', () => {
  it('writes one of each key first, so the test is checking all of them', () => {
    fillEverything();
    // The fixture above has to touch every key the phone hydrates. If a key
    // is added to the app and not here, this is the line that says so, before
    // the next test passes for the wrong reason.
    expect([...store.keys()].sort()).toEqual([...PERSISTED_KEYS].sort());
  });

  it('leaves nothing behind', () => {
    fillEverything();
    expect(localStorage.length).toBeGreaterThan(0);
    eraseEverything();
    expect(localStorage.length).toBe(0);
    expect([...store.keys()]).toEqual([]);
  });

  it('reads back as a first launch', () => {
    fillEverything();
    eraseEverything();
    expect(listRounds()).toEqual([]);
    expect(listCourses()).toEqual([]);
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getAliases()).toEqual({});
    expect(getDistinct().size).toBe(0);
    expect(listQueue()).toEqual([]);
  });

  it('is safe to run on a phone with nothing on it', () => {
    expect(() => eraseEverything()).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
