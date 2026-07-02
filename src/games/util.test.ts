import { describe, it, expect } from 'vitest';
import { rankStandings, ordinal, firstIncompleteHole, completedHoleCount } from './util';
import { makeRound, holes, scoresFrom } from './testFixtures';
import type { GameStanding } from '../types';

function s(label: string, value: number): GameStanding {
  return { label, value, detail: '', rank: 0, isLeader: false };
}

describe('rankStandings', () => {
  it('ranks lower values first when lowerIsBetter', () => {
    const st = [s('Al', 74), s('Bo', 72), s('Cy', 78)];
    const ordered = rankStandings(st, true);
    expect(ordered.map((x) => x.label)).toEqual(['Bo', 'Al', 'Cy']);
    expect(ordered.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('ranks higher values first when higher is better', () => {
    const st = [s('Al', 20), s('Bo', 35), s('Cy', 10)];
    const ordered = rankStandings(st, false);
    expect(ordered.map((x) => x.label)).toEqual(['Bo', 'Al', 'Cy']);
    expect(ordered.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank on ties and skips the following rank', () => {
    const st = [s('Al', 72), s('Bo', 72), s('Cy', 78)];
    const ordered = rankStandings(st, true);
    // Both leaders rank 1, next is rank 3 (standard competition ranking).
    expect(ordered.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('flags a single leader when scores differ', () => {
    const st = [s('Al', 72), s('Bo', 74)];
    rankStandings(st, true);
    expect(st.find((x) => x.label === 'Al')!.isLeader).toBe(true);
    expect(st.find((x) => x.label === 'Bo')!.isLeader).toBe(false);
  });

  it('flags no leader when everyone is tied (no spread)', () => {
    const st = [s('Al', 72), s('Bo', 72)];
    rankStandings(st, true);
    expect(st.every((x) => x.isLeader === false)).toBe(true);
  });

  it('flags co-leaders when there is a spread but a shared top', () => {
    const st = [s('Al', 72), s('Bo', 72), s('Cy', 80)];
    rankStandings(st, true);
    expect(st.filter((x) => x.isLeader).map((x) => x.label).sort()).toEqual(['Al', 'Bo']);
  });
});

describe('firstIncompleteHole', () => {
  it('returns 0 for an unstarted round', () => {
    expect(firstIncompleteHole(makeRound())).toBe(0);
  });

  it('returns the first hole where any player is blank', () => {
    const hs = holes(9);
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [4, 4, 4, 4],
        p2: [4, 4, 4], // p2 blank on hole 4
      }),
    });
    expect(firstIncompleteHole(round)).toBe(3);
  });

  it('skips past a fully-scored front and lands mid-round', () => {
    const hs = holes(18);
    const full = Array.from({ length: 12 }, () => 4);
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, { p1: full, p2: full }),
    });
    expect(firstIncompleteHole(round)).toBe(12);
  });

  it('returns the last hole when every hole is complete', () => {
    const hs = holes(9);
    const full = Array.from({ length: 9 }, () => 4);
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, { p1: full, p2: full }),
    });
    expect(firstIncompleteHole(round)).toBe(8);
  });
});

describe('completedHoleCount', () => {
  it('is 0 for an unstarted round', () => {
    expect(completedHoleCount(makeRound())).toBe(0);
  });

  it('only counts holes where every player has scored', () => {
    const hs = holes(9);
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [4, 4, 4, 4],
        p2: [4, 4, null, 4], // hole 3 incomplete
      }),
    });
    expect(completedHoleCount(round)).toBe(3);
  });

  it('counts all holes when the round is fully scored', () => {
    const hs = holes(9);
    const full = Array.from({ length: 9 }, () => 4);
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, { p1: full, p2: full }),
    });
    expect(completedHoleCount(round)).toBe(9);
  });
});

describe('ordinal', () => {
  it('handles the common cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  it('handles the teens exception', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles higher numbers', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(101)).toBe('101st');
    expect(ordinal(111)).toBe('111th');
  });
});
