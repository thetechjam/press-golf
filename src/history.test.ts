import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import {
  searchRounds,
  filterByStatus,
  groupByMonth,
  describeEmpty,
  roundYears,
  filterByYear,
  describeNoMatches,
} from './history';
import { makeRound, holes18 } from './games/testFixtures';

/** A round with the handful of fields the history screen looks at. */
const round = (over: Partial<Round>): Round => ({
  ...makeRound({ holes: holes18() }),
  ...over,
});

const torrey = round({
  id: 'a',
  course: 'Torrey Pines South',
  date: '2026-09-11',
  players: [
    { id: 'p1', name: 'Alex' },
    { id: 'p2', name: 'Sam Whitfield' },
  ],
  games: ['skins'],
  status: 'finished',
});

const pebble = round({
  id: 'b',
  course: 'Pebble Beach',
  date: '2026-09-02',
  players: [
    { id: 'p1', name: 'Jordan' },
    { id: 'p2', name: 'Casey' },
  ],
  games: ['nassau'],
  status: 'in_progress',
});

const august = round({
  id: 'c',
  course: 'Torrey Pines North',
  date: '2026-08-20',
  players: [{ id: 'p1', name: 'Sam Whitfield' }],
  games: ['stableford'],
  status: 'finished',
});

const lastYear = round({ id: 'd', course: 'Muirfield', date: '2025-11-04', status: 'finished' });

const all = [torrey, pebble, august, lastYear];
const ids = (rs: Round[]) => rs.map((r) => r.id);

describe('searching', () => {
  it('finds a round by its course', () => {
    expect(ids(searchRounds(all, 'pebble'))).toEqual(['b']);
  });

  it('finds a round by who was playing', () => {
    expect(ids(searchRounds(all, 'casey'))).toEqual(['b']);
  });

  it('finds a round by the game played', () => {
    expect(ids(searchRounds(all, 'stableford'))).toEqual(['c']);
  });

  it('narrows with each word rather than widening', () => {
    // "sam torrey" means the round with both — which is what somebody typing
    // a second word is trying to do. Matching any word would grow the list.
    expect(ids(searchRounds(all, 'torrey'))).toEqual(['a', 'c']);
    expect(ids(searchRounds(all, 'torrey sam'))).toEqual(['a', 'c']);
    expect(ids(searchRounds(all, 'torrey alex'))).toEqual(['a']);
  });

  it('matches part of a word, so it works while you are still typing', () => {
    expect(ids(searchRounds(all, 'torr'))).toEqual(['a', 'c']);
    expect(ids(searchRounds(all, 'whitf'))).toEqual(['a', 'c']);
  });

  it('ignores case and stray spacing', () => {
    expect(ids(searchRounds(all, '  PEBBLE   beach '))).toEqual(['b']);
  });

  it('returns everything for an empty query rather than nothing', () => {
    expect(ids(searchRounds(all, ''))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(searchRounds(all, '   '))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not match on the date', () => {
    // A round is remembered as "Torrey with Sam", not as "the eleventh", and
    // matching digits would make "18" find every round played on the 18th as
    // well as every eighteen-hole round.
    expect(searchRounds(all, '2026')).toEqual([]);
    expect(searchRounds(all, '11')).toEqual([]);
  });

  it('copes with a round that never got a course name', () => {
    const unnamed = round({ id: 'e', course: undefined, players: [{ id: 'p1', name: 'Robin' }] });
    expect(ids(searchRounds([...all, unnamed], 'robin'))).toEqual(['e']);
  });
});

describe('filtering by status', () => {
  it('separates what you can still play from what is done', () => {
    expect(ids(filterByStatus(all, 'in_progress'))).toEqual(['b']);
    expect(ids(filterByStatus(all, 'finished'))).toEqual(['a', 'c', 'd']);
    expect(ids(filterByStatus(all, 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('grouping by month', () => {
  const now = new Date(2026, 8, 12); // September 2026

  it('puts each round under the month it was played, newest first', () => {
    const groups = groupByMonth(all, now);
    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-08', '2025-11']);
    expect(groups.map((g) => ids(g.rounds))).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('drops the year inside the current one, and keeps it outside', () => {
    const groups = groupByMonth(all, now);
    expect(groups[0].label).toBe('September');
    expect(groups[1].label).toBe('August');
    expect(groups[2].label).toBe('November 2025');
  });

  it('keeps the order it was given inside a month', () => {
    // `listRounds` sorts by updatedAt, so a round edited today sits above one
    // played the same week and untouched since. Re-sorting by date here would
    // undo that.
    const groups = groupByMonth([pebble, torrey], now);
    expect(ids(groups[0].rounds)).toEqual(['b', 'a']);
  });

  it('does not lose a round whose date is unreadable', () => {
    const broken = round({ id: 'x', date: 'not-a-date' });
    const groups = groupByMonth([...all, broken], now);
    expect(groups.flatMap((g) => ids(g.rounds))).toContain('x');
    expect(groups.find((g) => g.rounds.some((r) => r.id === 'x'))?.label).toBe('Undated');
  });

  it('is empty for no rounds rather than a month with nothing in it', () => {
    expect(groupByMonth([], now)).toEqual([]);
  });
});

describe('saying why the list is empty', () => {
  it('names the filter that emptied it, not just the emptiness', () => {
    // "No rounds" in front of somebody who has played forty is a bug report
    // waiting to happen.
    expect(describeEmpty('torrey', 'all')).toBe('No rounds match “torrey”.');
    expect(describeEmpty('', 'finished')).toBe('No finished rounds yet.');
    expect(describeEmpty('', 'in_progress')).toBe('No rounds in progress.');
    expect(describeEmpty('sam', 'finished')).toBe('No finished rounds match “sam”.');
    expect(describeEmpty('sam', 'in_progress')).toBe('No unfinished rounds match “sam”.');
  });

  it('says the plain thing when nothing is filtered at all', () => {
    expect(describeEmpty('', 'all')).toBe('No rounds yet.');
    expect(describeEmpty('   ', 'all')).toBe('No rounds yet.');
  });
});

describe('narrowing by year', () => {
  it('lists the years actually played in, newest first', () => {
    // Derived from the rounds, not a fixed set of windows: a history is lumpy,
    // and a rolling window hides half a season behind arithmetic.
    expect(roundYears(all)).toEqual([2026, 2025]);
  });

  it('has nothing to offer for no rounds', () => {
    expect(roundYears([])).toEqual([]);
  });

  it('ignores a round whose date cannot be read', () => {
    expect(roundYears([...all, round({ id: 'x', date: 'whenever' })])).toEqual([2026, 2025]);
  });

  it('keeps only the year asked for', () => {
    expect(ids(filterByYear(all, 2026))).toEqual(['a', 'b', 'c']);
    expect(ids(filterByYear(all, 2025))).toEqual(['d']);
    expect(ids(filterByYear(all, 2024))).toEqual([]);
  });

  it('passes everything through for all time', () => {
    expect(ids(filterByYear(all, 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('saying why a year came up empty', () => {
  it('keeps the year in the sentence, so a good search is not blamed', () => {
    expect(describeNoMatches('sam', 2025)).toBe('No rounds in 2025 match “sam”.');
  });

  it('drops the year when there is not one set', () => {
    expect(describeNoMatches('sam', 'all')).toBe('No rounds match “sam”.');
  });

  it('covers the year alone, which the screen should never produce', () => {
    // The years offered come from the rounds, so this is unreachable from the
    // UI. It still has to say something true if it is ever reached.
    expect(describeNoMatches('  ', 2024)).toBe('No rounds in 2024.');
  });

  it('says the plain thing when nothing is filtered at all', () => {
    expect(describeNoMatches('', 'all')).toBe('No rounds yet.');
  });
});
