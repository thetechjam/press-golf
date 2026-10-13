import { describe, it, expect } from 'vitest';
import { computeStableford, stablefordMoney } from './stableford';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
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

describe('computeStableford — ties, nines, gross and net, skipped holes', () => {
  const two = [player('p1', 'Al'), player('p2', 'Bo')];

  it('is all square with no leader when the points are level', () => {
    // Five pars against a birdie, a bogey and three pars: ten each.
    const scores = scoresFrom(par4x5, { p1: [4, 4, 4, 4, 4], p2: [3, 5, 4, 4, 4] });
    const r = computeStableford(makeRound({ players: two, holes: par4x5, games: ['stableford'], scores }));
    expect(r.status).toBe('All square');
    expect(r.standings.map((s) => s.rank)).toEqual([1, 1]);
    expect(r.standings.some((s) => s.isLeader)).toBe(false);
  });

  it('scores each hole against its own par', () => {
    const mixed = [3, 4, 5, 3, 5].map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));
    // Par, par, par, birdie, double: 2 + 2 + 2 + 3 + 0.
    const scores = scoresFrom(mixed, { p1: [3, 4, 5, 2, 7] });
    const r = computeStableford(
      makeRound({ players: [player('p1', 'Al')], holes: mixed, games: ['stableford'], scores })
    );
    expect(r.standings[0].value).toBe(9);
  });

  it('counts only the holes with a score', () => {
    const scores = scoresFrom(par4x5, { p1: [4, undefined, 3, undefined, undefined] });
    const r = computeStableford(
      makeRound({ players: [player('p1', 'Al')], holes: par4x5, games: ['stableford'], scores })
    );
    expect(r.standings[0].value).toBe(5);
    expect(r.standings[0].detail).toBe('5 pts');
  });

  it('shows a dash for a player with no card, ranked after the players who have one', () => {
    const scores = scoresFrom(par4x5, { p1: [5, 5, 5, 5, 5] });
    const r = computeStableford(makeRound({ players: two, holes: par4x5, games: ['stableford'], scores }));
    expect(r.standings[0]).toMatchObject({ playerId: 'p1', rank: 1, detail: '5 pts' });
    expect(r.standings[1]).toMatchObject({ playerId: 'p2', rank: 2, detail: '—', isLeader: false });
  });

  it('does not let a player with no card lead a modified round on 0', () => {
    // Modified scoring goes below zero, so a player who had not teed off was
    // top of the board on the 0 they carried, and the status named them.
    const scores = scoresFrom(par4x5, { p1: [5, 5, 5, 5, 5] });
    const r = computeStableford(
      makeRound({
        players: two,
        holes: par4x5,
        games: ['stableford'],
        options: { stablefordMode: 'modified' },
        scores,
      })
    );
    expect(r.standings[0]).toMatchObject({ playerId: 'p1', rank: 1, value: -5 });
    expect(r.standings[1]).toMatchObject({ playerId: 'p2', rank: 2, isLeader: false });
    expect(r.status).not.toMatch(/Bo/);
  });

  it('plays a nine as a nine: an 18 handicap is two strokes a hole', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, { p1: Array(9).fill(6) });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al', 18)],
        holes: hs,
        games: ['stableford'],
        options: { useNet: true },
        scores,
      })
    );
    // Every 6 nets to a par: two points a hole.
    expect(r.standings[0].value).toBe(18);
  });

  it('gives a plus handicap a stroke back on the easiest hole', () => {
    const scores = scoresFrom(par4x5, { p1: [4, 4, 4, 4, 4] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al', -1)],
        holes: par4x5,
        games: ['stableford'],
        options: { useNet: true },
        scores,
      })
    );
    // Four pars and, on stroke index 5, a par that nets to a bogey.
    expect(r.standings[0].value).toBe(9);
  });

  it('scores gross when this game is switched to gross on a net round', () => {
    const scores = scoresFrom(par4x5, { p1: [5, 5, 5, 5, 5] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al', 2)],
        holes: par4x5,
        games: ['stableford'],
        options: { useNet: true, netByGame: { stableford: false } },
        scores,
      })
    );
    expect(r.standings[0].value).toBe(5);
    expect(r.note).toBeUndefined();
  });

  it('scores net when only this game is switched to net', () => {
    const scores = scoresFrom(par4x5, { p1: [5, 5, 5, 5, 5] });
    const r = computeStableford(
      makeRound({
        players: [player('p1', 'Al', 2)],
        holes: par4x5,
        games: ['stableford'],
        options: { useNet: false, netByGame: { stableford: true } },
        scores,
      })
    );
    expect(r.standings[0].value).toBe(7);
    expect(r.note).toBe('Net scoring');
  });

  it('modified: a run of doubles goes negative and ranks below a par round', () => {
    const scores = scoresFrom(par4x5, { p1: [6, 6, 6, 6, 6], p2: [4, 4, 4, 4, 4] });
    const r = computeStableford(
      makeRound({
        players: two,
        holes: par4x5,
        games: ['stableford'],
        options: { stablefordMode: 'modified' },
        scores,
      })
    );
    expect(r.standings.map((s) => [s.playerId, s.value])).toEqual([
      ['p2', 0],
      ['p1', -15],
    ]);
    expect(r.status).toBe('Bo leads · 0 pts');
  });
});

describe('stablefordMoney', () => {
  const three = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];
  const roundOf = (byPlayer: Record<string, (number | undefined)[]>) =>
    makeRound({ players: three, holes: par4x5, games: ['stableford'], scores: scoresFrom(par4x5, byPlayer) });

  it('settles points among the players who posted a card', () => {
    // Ten points against fifteen: five points apart, a dollar a point. Cy
    // never played and stays at zero rather than collecting from anyone.
    const round = roundOf({ p1: [4, 4, 4, 4, 4], p2: [3, 3, 3, 3, 3] });
    expect(stablefordMoney(round, 1)).toEqual({ p1: -5, p2: 5, p3: 0 });
  });

  it('moves nothing on a tie', () => {
    const round = roundOf({ p1: [4, 4, 4, 4, 4], p2: [4, 4, 4, 4, 4] });
    expect(stablefordMoney(round, 1)).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('scales with the stake', () => {
    const round = roundOf({ p1: [4, 4, 4, 4, 4], p2: [3, 3, 3, 3, 3] });
    expect(stablefordMoney(round, 0.5)).toEqual({ p1: -2.5, p2: 2.5, p3: 0 });
  });

  it('makes each point worth the stake against every rival', () => {
    // 10, 15 and 5 points: Al is level with the field, Bo is five up on one
    // rival and ten up on the other, Cy the mirror of Bo.
    const round = roundOf({ p1: [4, 4, 4, 4, 4], p2: [3, 3, 3, 3, 3], p3: [5, 5, 5, 5, 5] });
    expect(stablefordMoney(round, 1)).toEqual({ p1: 0, p2: 15, p3: -15 });
  });
});
