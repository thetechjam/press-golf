import { describe, it, expect } from 'vitest';
import type { Round } from '../types';
import { leagueAllowance, leagueHandicap, leagueHistory } from './leagueHandicap';
import { makeRound, player, holes, scoresFrom } from './testFixtures';

describe('the league handicap formula', () => {
  it('plays a 6-over average to a 5 at 90%, as the rule sheet works it', () => {
    expect(leagueHandicap(6, 5)).toBe(5); // 5.4 rounds to 5
  });

  it('gives 70% until a player has 3 matches, and 90% from the 4th', () => {
    expect(leagueAllowance(0)).toBe(0.7);
    expect(leagueAllowance(2)).toBe(0.7);
    expect(leagueAllowance(3)).toBe(0.9);
    expect(leagueHandicap(10, 1)).toBe(7);
  });

  it('rounds to the nearest whole number', () => {
    expect(leagueHandicap(5, 5)).toBe(5); // 4.5 → 5
    expect(leagueHandicap(4.9, 5)).toBe(4); // 4.41 → 4
  });
});

describe("a player's league history on this phone", () => {
  const hs = holes(9);
  /** A league night where Al shoots `overPar` over par across the nine. */
  const night = (date: string, overPar: number, extra: Partial<Round> = {}): Round => {
    // Spread across the nine so no hole passes the league maximum of 9.
    const card = Array.from({ length: 9 }, (_, i) =>
      4 + Math.floor(overPar / 9) + (i < overPar % 9 ? 1 : 0)
    );
    return {
      ...makeRound({
        players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
        holes: hs,
        options: {
          league: {
            pointsPerMatch: 1,
            teams: [
              { aId: 'p1', bId: 'p2' },
              { aId: 'p3', bId: 'p4' },
            ],
          },
        },
        scores: scoresFrom(hs, { p1: card, p2: Array(9).fill(4), p3: Array(9).fill(4), p4: Array(9).fill(4) }),
      }),
      id: date,
      date,
      ...extra,
    };
  };

  it('averages the most recent five nights, newest first', () => {
    const rounds = [2, 4, 6, 8, 10, 30].map((n, i) => night(`2026-0${i + 1}-01`, n));
    const h = leagueHistory(rounds, 'al')!;
    expect(h.matches).toBe(6);
    expect(h.recent).toEqual([30, 10, 8, 6, 4]);
    expect(h.average).toBe(11.6);
    expect(h.handicap).toBe(10); // 11.6 × 0.9 = 10.44
  });

  it('uses the 70% allowance for a player with fewer than three nights', () => {
    const h = leagueHistory([night('2026-05-01', 6), night('2026-05-08', 4)], 'Al')!;
    expect(h.average).toBe(5);
    expect(h.handicap).toBe(4); // 5 × 0.7 = 3.5 → 4
  });

  it('leaves out a night with holes missing', () => {
    const partial = night('2026-05-08', 0);
    delete partial.scores[9].p1;
    expect(leagueHistory([night('2026-05-01', 6), partial], 'Al')!.matches).toBe(1);
  });

  it('counts a pick-up as a 9', () => {
    const r = night('2026-05-01', 0, { pickups: { 2: ['p1'] } });
    expect(leagueHistory([r], 'Al')!.recent).toEqual([5]);
  });

  it('knows nothing about a player it has never seen', () => {
    expect(leagueHistory([night('2026-05-01', 6)], 'Zed')).toBeNull();
  });
});
