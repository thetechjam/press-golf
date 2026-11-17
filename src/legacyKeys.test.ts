import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEGACY_KEY_FOR, LEGACY_KEYS, migrateLegacyKeys, migratedRecord } from './legacyKeys';
import { PERSISTED_KEYS } from './native';
import { listRounds } from './storage';
import { makeRound } from './games/testFixtures';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
});

describe('migratedRecord', () => {
  it('moves a value that exists only under the old name', () => {
    const plan = migratedRecord({ 'press.rounds.v1': '[]' });
    expect(plan.record).toEqual({ 'trunk.rounds.v1': '[]' });
    expect(plan.copies).toEqual([{ key: 'trunk.rounds.v1', value: '[]', drop: 'press.rounds.v1' }]);
    expect(plan.drops).toEqual([]);
  });

  it('keeps the new key when both names are present, and drops the old one', () => {
    const plan = migratedRecord({ 'press.rounds.v1': 'old', 'trunk.rounds.v1': 'new' });
    expect(plan.record['trunk.rounds.v1']).toBe('new');
    expect(plan.record['press.rounds.v1']).toBeUndefined();
    expect(plan.copies).toEqual([]);
    expect(plan.drops).toEqual(['press.rounds.v1']);
  });

  it('names an old key for every key the app still writes', () => {
    expect(Object.keys(LEGACY_KEY_FOR).sort()).toEqual([...PERSISTED_KEYS].sort());
    expect(LEGACY_KEYS).toHaveLength(PERSISTED_KEYS.length);
  });
});

describe('migrateLegacyKeys', () => {
  it('copies every old key and then deletes it, so a saved round is still there', () => {
    const round = { ...makeRound(), id: 'r1', course: 'Pebble Beach' };
    store.set('press.rounds.v1', JSON.stringify([round]));
    store.set('press.settings.v1', JSON.stringify({ glare: true }));
    migrateLegacyKeys();
    expect(store.has('press.rounds.v1')).toBe(false);
    expect(store.has('press.settings.v1')).toBe(false);
    expect(listRounds().map((r) => r.course)).toEqual(['Pebble Beach']);
    expect(JSON.parse(store.get('trunk.settings.v1') as string).glare).toBe(true);
  });

  it('does not overwrite a key that was already migrated', () => {
    store.set('press.rounds.v1', JSON.stringify([{ ...makeRound(), id: 'old' }]));
    store.set('trunk.rounds.v1', JSON.stringify([{ ...makeRound(), id: 'new' }]));
    migrateLegacyKeys();
    expect(store.has('press.rounds.v1')).toBe(false);
    expect(JSON.parse(store.get('trunk.rounds.v1') as string)[0].id).toBe('new');
  });

  it('leaves the old key in place when the copy cannot be written', () => {
    store.set('press.rounds.v1', '[]');
    const real = store.set.bind(store);
    vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
      if (k === 'trunk.rounds.v1') throw new DOMException('quota', 'QuotaExceededError');
      real(k, String(v));
    });
    migrateLegacyKeys();
    expect(store.get('press.rounds.v1')).toBe('[]');
    expect(store.has('trunk.rounds.v1')).toBe(false);
  });
});
