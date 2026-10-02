import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildBackup,
  backupFilename,
  parseBackup,
  mergeRounds,
  mergeCourses,
  restoreBackup,
  BACKUP_FORMAT,
} from './backup';
import { makeRound, player } from './games/testFixtures';
import type { Round, SavedCourse } from './types';

// Vitest runs in node — back localStorage with a Map, as storage.test.ts does.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const round = (id: string, updatedAt: number, over: Partial<Round> = {}): Round => ({
  ...makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')] }),
  id,
  updatedAt,
  ...over,
});

const course = (id: string, name: string): SavedCourse => ({
  id,
  name,
  holes: [{ number: 1, par: 4, strokeIndex: 1 }],
});

const text = (v: unknown) => JSON.stringify(v);

describe('buildBackup', () => {
  it('stamps the file so a reader can identify it', () => {
    const b = buildBackup([], [], '1.2.3', new Date('2026-09-11T12:00:00Z'));
    expect(b.app).toBe('press');
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.appVersion).toBe('1.2.3');
    expect(b.exportedAt).toBe('2026-09-11T12:00:00.000Z');
  });

  it('carries the rounds and courses it was given', () => {
    const b = buildBackup([round('a', 1)], [course('c1', 'Pebble')], '1.0.0');
    expect(b.rounds).toHaveLength(1);
    expect(b.courses[0].name).toBe('Pebble');
  });

  it('round-trips through JSON', () => {
    const b = buildBackup([round('a', 5)], [course('c1', 'Pebble')], '1.0.0');
    const parsed = parseBackup(text(b));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.rounds).toEqual(b.rounds);
    expect(parsed.file.courses).toEqual(b.courses);
  });
});

describe('backupFilename', () => {
  it('is dated so downloads sort chronologically', () => {
    // Constructed in local time, because that is what the name reads from.
    expect(backupFilename(new Date(2026, 8, 11))).toBe('press-backup-2026-09-11.json');
  });

  it('zero-pads single-digit months and days', () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe('press-backup-2026-01-05.json');
  });
});

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    const r = parseBackup('not json {');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valid JSON/);
  });

  it('rejects JSON that is not a Press backup', () => {
    const r = parseBackup(text({ some: 'other file' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Press backup/);
  });

  it('rejects a format from a newer version rather than guessing', () => {
    const r = parseBackup(text({ app: 'press', format: BACKUP_FORMAT + 1, rounds: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('accepts a file with no rounds or courses key at all', () => {
    const r = parseBackup(text({ app: 'press', format: 1 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rounds).toEqual([]);
    expect(r.file.courses).toEqual([]);
  });

  it('drops a damaged round but keeps the rest of the file', () => {
    const r = parseBackup(
      text({ app: 'press', format: 1, rounds: [round('good', 1), { id: 'bad' }], courses: [] })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rounds.map((x) => x.id)).toEqual(['good']);
    expect(r.droppedRounds).toBe(1);
  });

  it('drops a round naming a game this build has no engine for', () => {
    const r = parseBackup(
      text({ app: 'press', format: 1, rounds: [round('x', 1, { games: ['bridge'] } as never)] })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rounds).toEqual([]);
    expect(r.droppedRounds).toBe(1);
  });

  it('keeps a round using a game that does exist', () => {
    const r = parseBackup(text({ app: 'press', format: 1, rounds: [round('x', 1, { games: ['skins'] })] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rounds).toHaveLength(1);
  });

  it('drops a round with no timestamps, which every merge rule reads', () => {
    const { updatedAt: _u, ...noStamp } = round('x', 1);
    const r = parseBackup(text({ app: 'press', format: 1, rounds: [noStamp] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rounds).toEqual([]);
  });

  it('drops a malformed course', () => {
    const r = parseBackup(
      text({ app: 'press', format: 1, courses: [course('c1', 'Ok'), { id: 'c2' }] })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.courses.map((c) => c.id)).toEqual(['c1']);
    expect(r.droppedCourses).toBe(1);
  });
});

describe('mergeRounds', () => {
  it('adds a round the device has never seen', () => {
    const { rounds, report } = mergeRounds([round('a', 1)], [round('b', 1)]);
    expect(rounds.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(report).toEqual({ added: 1, updated: 0, kept: 0 });
  });

  it('takes the newer copy on a collision', () => {
    const { rounds, report } = mergeRounds([round('a', 10)], [round('a', 20)]);
    expect(rounds[0].updatedAt).toBe(20);
    expect(report).toEqual({ added: 0, updated: 1, kept: 0 });
  });

  it('keeps local work that is newer than the backup', () => {
    const { rounds, report } = mergeRounds([round('a', 30)], [round('a', 20)]);
    expect(rounds[0].updatedAt).toBe(30);
    expect(report).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it('keeps the local copy on a tie — not overwriting is the reversible choice', () => {
    const mine = round('a', 20, { course: 'mine' });
    const { rounds } = mergeRounds([mine], [round('a', 20, { course: 'theirs' })]);
    expect(rounds[0].course).toBe('mine');
  });

  it('never deletes a local round the backup does not contain', () => {
    const { rounds } = mergeRounds([round('a', 1), round('b', 1)], [round('c', 1)]);
    expect(rounds.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('is idempotent — restoring the same file twice changes nothing', () => {
    const incoming = [round('a', 5), round('b', 5)];
    const once = mergeRounds([], incoming);
    const twice = mergeRounds(once.rounds, incoming);
    expect(twice.rounds).toEqual(once.rounds);
    expect(twice.report).toEqual({ added: 0, updated: 0, kept: 2 });
  });
});

describe('mergeCourses', () => {
  it('adds a course the device does not have', () => {
    const { courses, report } = mergeCourses([course('c1', 'A')], [course('c2', 'B')]);
    expect(courses).toHaveLength(2);
    expect(report.added).toBe(1);
  });

  it('never overwrites a saved course edited on this device', () => {
    const { courses, report } = mergeCourses(
      [course('c1', 'My corrected name')],
      [course('c1', 'Old name')]
    );
    expect(courses[0].name).toBe('My corrected name');
    expect(report).toEqual({ added: 0, updated: 0, kept: 1 });
  });
});

describe('restoreBackup', () => {
  beforeEach(() => store.clear());

  it('writes merged rounds and courses into storage', () => {
    store.set('press.rounds.v1', text([round('a', 1)]));
    const file = buildBackup([round('b', 1)], [course('c1', 'Pebble')], '1.0.0');

    const r = restoreBackup(text(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toEqual({ added: 1, updated: 0, kept: 0 });
    expect(r.courses.added).toBe(1);

    const saved = JSON.parse(store.get('press.rounds.v1') as string) as Round[];
    expect(saved.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(JSON.parse(store.get('press.courses.v1') as string)).toHaveLength(1);
  });

  it('reports the parse failure and writes nothing', () => {
    store.set('press.rounds.v1', text([round('a', 1)]));
    const r = restoreBackup('nope');
    expect(r.ok).toBe(false);
    expect(JSON.parse(store.get('press.rounds.v1') as string)).toHaveLength(1);
  });

  it('leaves storage untouched when the write does not fit', () => {
    const before = text([round('a', 1)]);
    store.set('press.rounds.v1', before);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    const r = restoreBackup(text(buildBackup([round('b', 1)], [], '1.0.0')));
    setItem.mockRestore();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/room/);
    expect(store.get('press.rounds.v1')).toBe(before);
  });

  it('counts entries dropped as damaged so the user is told', () => {
    const r = restoreBackup(text({ app: 'press', format: 1, rounds: [{ id: 'bad' }], courses: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dropped).toBe(1);
  });
});

describe('who is who travels with the backup', () => {
  beforeEach(() => store.clear());

  const people = { aliases: { al: 'Alex' }, distinct: ['jordan|jordy'] };
  const names = () =>
    (JSON.parse(store.get('press.rounds.v1') as string) as Round[]).map((r) => r.players[0].name);

  it('is written when there is some, and left out when there is none', () => {
    expect(buildBackup([], [], '1', new Date(), people).people).toEqual(people);
    expect(buildBackup([], [], '1', new Date(), { aliases: {}, distinct: [] })).not.toHaveProperty(
      'people'
    );
  });

  it('reads back only well-formed entries', () => {
    const parsed = parseBackup(
      text({
        app: 'press',
        format: BACKUP_FORMAT,
        rounds: [],
        courses: [],
        people: { aliases: { al: 'Alex', bad: 4, '': 'X' }, distinct: ['a|b', 'nope', 7] },
      })
    );
    expect(parsed.ok && parsed.file.people).toEqual({ aliases: { al: 'Alex' }, distinct: ['a|b'] });
  });

  it('restores merged names, and renames the rounds on this phone to match', () => {
    store.set('press.rounds.v1', text([round('a', 1)])); // Al and Bo, typed here
    const r = restoreBackup(text(buildBackup([], [], '1', new Date(), people)));
    expect(r.ok && r.people).toBe(1);
    expect(names()).toEqual(['Alex']);
    expect(JSON.parse(store.get('press.aliases.v1') as string)).toEqual({ al: 'Alex' });
    expect(JSON.parse(store.get('press.distinct.v1') as string)).toEqual(['jordan|jordy']);
  });

  it('keeps this phone’s own answer when the two disagree', () => {
    store.set('press.aliases.v1', text({ al: 'Albert' }));
    const r = restoreBackup(text(buildBackup([round('a', 1)], [], '1', new Date(), people)));
    expect(r.ok && r.people).toBe(0);
    expect(names()).toEqual(['Albert']);
  });

  it('will not restore a merge that loops against one made here', () => {
    store.set('press.aliases.v1', text({ alex: 'Al' }));
    restoreBackup(text(buildBackup([], [], '1', new Date(), people)));
    expect(JSON.parse(store.get('press.aliases.v1') as string)).toEqual({ alex: 'Al' });
  });

  it('drops a "two people" answer for a pair since merged', () => {
    store.set('press.distinct.v1', text(['al|alex']));
    restoreBackup(text(buildBackup([], [], '1', new Date(), people)));
    expect(JSON.parse(store.get('press.distinct.v1') as string)).toEqual(['jordan|jordy']);
  });

  it('restores an older file with no people data exactly as before', () => {
    store.set('press.aliases.v1', text({ al: 'Alex' }));
    const r = restoreBackup(text({ app: 'press', format: 1, rounds: [round('b', 1)], courses: [] }));
    expect(r.ok && r.people).toBe(0);
    expect(JSON.parse(store.get('press.aliases.v1') as string)).toEqual({ al: 'Alex' });
  });

  it('puts the names back when the rounds write fails after they were written', () => {
    store.set('press.aliases.v1', text({ bo: 'Bob' }));
    const real = localStorage.setItem;
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
      if (k === 'press.rounds.v1') throw new DOMException('quota', 'QuotaExceededError');
      real(k, v);
    });
    const r = restoreBackup(text(buildBackup([round('b', 1)], [], '1', new Date(), people)));
    setItem.mockRestore();
    expect(r.ok).toBe(false);
    expect(JSON.parse(store.get('press.aliases.v1') as string)).toEqual({ bo: 'Bob' });
    expect(store.has('press.distinct.v1')).toBe(false);
  });

  it('leaves the names untouched too when the write does not fit', () => {
    store.set('press.aliases.v1', text({ bo: 'Bob' }));
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const r = restoreBackup(text(buildBackup([round('b', 1)], [], '1', new Date(), people)));
    setItem.mockRestore();
    expect(r.ok).toBe(false);
    expect(JSON.parse(store.get('press.aliases.v1') as string)).toEqual({ bo: 'Bob' });
    expect(store.has('press.distinct.v1')).toBe(false);
  });
});
