import { describe, it, expect } from 'vitest';
import { computeStableford } from './stableford';
import { makeRound, player, scoresFrom } from './testFixtures';
import type { Hole } from '../types';

const par4x5: Hole[] = Array.from({ length: 5 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

describe('computeStableford — standard scoring', () => {
  it('scores 2 for par, 3 birdie, 4 eagle, 1 bogey, 0 double+', () => {
    // scores vs par 4: 4(par=2), 3(birdie=3), 2(eagle=4), 5(bogey=1), 6(double=0)
    const scores = scoresFrom(par4x5, { p1: [4, 3, 2, 5, 6] });
    const r = computeStableford(
      makeRound({ players: [player('p1', 'Al')], holes: par4x5, games: ['stableford'], scores })
    );
    // 2 + 3 + 4 + 1 + 0 = 10.
    expect(r.standings[0].value).toBe(10);
    expect(r.standings[0].detail).toBe('10 pts');
  });

  it('floors at 0 for very high scores', () => {
    const scores = scoresFrom(par4x5, { p1: [9, 9, 9, 9, 9] });
    const r = computeStableford(
      makeRound({ players: [player('p1', 'Al')], holes: par4x5, games: ['stableford'], scores })
    );
    expect(r.standings[0].value).toBe(0);
  });

  it('reports no scores yet before any entry', () => {
    const r = computeStableford(
      makeRound({ players: [player('p1', 'Al')], holes: par4x5, games: ['stableford'] })
    );
    expect(r.status).toBe('No scores yet');
  });
});

describe('computeStableford — modified scoring', () => {
  it('uses the modified point table (eagle 5, birdie 2, par 0, bogey -1, double -3)', () => {
    // vs par 4: 2(eagle=5), 3(birdie=2), 4(par=0), 5(bogey=-1), 6(double=-3)
    const scores = scoresFrom(par4x5, { p1: [2, 3, 4, 5, 6] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al')],
        holes: par4x5,
        games: ['stableford'],
        options: { stablefordMode: 'modified' },
        scores,
      })
    );
    // 5 + 2 + 0 - 1 - 3 = 3.
    expect(r.standings[0].value).toBe(3);
    expect(r.title).toBe('Modified Stableford');
  });

  it('awards 8 for albatross or better', () => {
    const scores = scoresFrom(par4x5, { p1: [1, undefined, undefined, undefined, undefined] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al')],
        holes: par4x5,
        games: ['stableford'],
        options: { stablefordMode: 'modified' },
        scores,
      })
    );
    // 1 on a par 4 is -3 → 8 points.
    expect(r.standings[0].value).toBe(8);
  });
});

describe('computeStableford — net + ranking', () => {
  it('applies handicap strokes when net is on', () => {
    // Al hcp 2, par 4 holes. Raw all 5 (bogey). Net: SI 1 & 2 drop to 4 (par).
    const scores = scoresFrom(par4x5, { p1: [5, 5, 5, 5, 5] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al', 2)],
        holes: par4x5,
        games: ['stableford'],
        options: { useNet: true },
        scores,
      })
    );
    // Holes 1,2 net→4 (par=2 pts each), holes 3-5 stay 5 (bogey=1 pt each).
    // 2+2+1+1+1 = 7.
    expect(r.standings[0].value).toBe(7);
    expect(r.note).toBe('Net scoring');
  });

  it('ranks highest points first and names the leader', () => {
    const scores = scoresFrom(par4x5, {
      p1: [4, 4, 4, 4, 4], // 10 pts
      p2: [3, 3, 3, 3, 3], // 15 pts
    });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al'), player('p2', 'Bo')],
        holes: par4x5,
        games: ['stableford'],
        scores,
      })
    );
    expect(r.standings[0].playerId).toBe('p2');
    expect(r.status).toContain('Bo leads');
  });
});
