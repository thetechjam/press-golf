import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, saveSettings, DEFAULT_SETTINGS, listRounds, listCourses, saveRound } from './storage';
import { makeRound, player } from './games/testFixtures';

// Vitest runs in node — back localStorage with a Map.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('settings', () => {
  beforeEach(() => store.clear());

  it('defaults keepAwake on when nothing is stored', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings().keepAwake).toBe(true);
  });

  it('persists a patch and reads it back', () => {
    saveSettings({ keepAwake: false });
    expect(getSettings().keepAwake).toBe(false);
    saveSettings({ keepAwake: true });
    expect(getSettings().keepAwake).toBe(true);
  });

  it('returns the merged settings from saveSettings', () => {
    expect(saveSettings({ keepAwake: false })).toEqual({ ...DEFAULT_SETTINGS, keepAwake: false });
  });

  it('merges stored partials over defaults (forward-compatible)', () => {
    store.set('press.settings.v1', '{}');
    expect(getSettings().keepAwake).toBe(true);
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set('press.settings.v1', 'not-json{');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults theme to system and glare off', () => {
    expect(getSettings().theme).toBe('system');
    expect(getSettings().glare).toBe(false);
  });

  it('carries a v1 sunlight:true across to glare', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    expect(getSettings().glare).toBe(true);
  });

  it('drops the legacy sunlight key on the next write', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    saveSettings({ keepAwake: false });
    expect(JSON.parse(store.get('press.settings.v1')!)).toEqual({
      keepAwake: false,
      theme: 'system',
      glare: true,
      reporterName: '',
    });
  });

  it('falls back to system when a stored theme is unrecognized', () => {
    store.set('press.settings.v1', JSON.stringify({ theme: 'sepia' }));
    expect(getSettings().theme).toBe('system');
  });

  it('persists an explicit theme', () => {
    saveSettings({ theme: 'dark' });
    expect(getSettings().theme).toBe('dark');
  });

  it('defaults reporterName to an empty string', () => {
    expect(getSettings().reporterName).toBe('');
  });

  it('round-trips reporterName', () => {
    saveSettings({ reporterName: 'Bo' });
    expect(getSettings().reporterName).toBe('Bo');
  });

  // getSettings and saveSettings both build their result field-by-field (so the
  // legacy `sunlight` key cannot survive a write). A field added to only one of
  // them vanishes on the next unrelated save — this is the guard for that.
  it('keeps reporterName across an unrelated save', () => {
    saveSettings({ reporterName: 'Bo' });
    saveSettings({ keepAwake: false });
    expect(getSettings().reporterName).toBe('Bo');
  });
});

describe('a damaged list', () => {
  // One bad entry used to take the whole list with it: a null threw on
  // Home, and a course with a non-string name threw inside the sort.
  it('keeps the rounds around a null entry', () => {
    const good = makeRound({ players: [player('p1', 'Al')] });
    localStorage.setItem('press.rounds.v1', JSON.stringify([null, good, 5]));
    expect(listRounds().map((r) => r.id)).toEqual([good.id]);
  });

  it('keeps the courses around one with no name', () => {
    localStorage.setItem(
      'press.courses.v1',
      JSON.stringify([
        { id: 'a', name: 'Zed', holes: [] },
        { id: 'b', holes: [] },
        { id: 'c', name: 'Able', holes: [] },
      ])
    );
    expect(listCourses().map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('saveRound', () => {
  beforeEach(() => store.clear());

  it('reports a write that storage refused instead of throwing out of the score handler', () => {
    const r = makeRound({ players: [player('p1', 'Al')] });
    expect(saveRound(r)).toBe(true);
    expect(listRounds().map((x) => x.id)).toEqual([r.id]);

    const real = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(saveRound({ ...r, course: 'Torrey' })).toBe(false);
    } finally {
      localStorage.setItem = real;
    }
    // What was there is still there.
    expect(listRounds()[0].course).toBeUndefined();
  });
});
