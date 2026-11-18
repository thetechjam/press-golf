import { describe, it, expect } from 'vitest';
import {
  runMatch,
  matchSegment,
  matchSegmentSides,
  resolveSides,
  computeMatchPlay,
  matchPlayMoney,
} from './matchPlay';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Hole } from '../types';

const H = (n: number): Hole => ({ number: n, par: 4, strokeIndex: n });

describe('runMatch — core evaluator', () => {
  it('reports not started when no hole has both scores', () => {
    const seg = runMatch([H(1), H(2)], () => null, () => null, 'A', 'B');
    expect(seg.status).toBe('Not started');
    expect(seg.winner).toBeNull();
  });

  it('closes out when the lead exceeds holes remaining (3&2)', () => {
    // A wins holes 1-3 of a 5-hole match → 3 UP with 2 to play → 3&2.
    const hs = [H(1), H(2), H(3), H(4), H(5)];
    const aScores = [3, 3, 3, 4, 4];
    const bScores = [4, 4, 4, 4, 4];
    const seg = runMatch(
      hs,
      (h) => aScores[h.number - 1],
      (h) => bScores[h.number - 1],
      'A',
      'B'
    );
    expect(seg.decided).toBe(true);
    expect(seg.winner).toBe('A');
    expect(seg.status).toBe('A won 3&2');
  });

  it('reports a win that runs to the final hole as N UP', () => {
    // A wins both holes of a 2-hole match → 2 UP, closed out on the last hole.
    const hs = [H(1), H(2)];
    const seg = runMatch(hs, () => 3, () => 4, 'A', 'B');
    expect(seg.decided).toBe(true);
    expect(seg.winner).toBe('A');
    expect(seg.status).toBe('A won 2 UP');
  });

  it('halves a completed all-square match', () => {
    const hs = [H(1), H(2), H(3)];
    const seg = runMatch(hs, () => 4, () => 4, 'A', 'B');
    expect(seg.status).toBe('Halved');
    expect(seg.winner).toBeNull();
  });

  it('reports a mid-round lead as "N UP · M to play"', () => {
    // A wins hole 1 of a 4-hole match, rest not yet played.
    const hs = [H(1), H(2), H(3), H(4)];
    const seg = runMatch(
      hs,
      (h) => (h.number === 1 ? 3 : null),
      (h) => (h.number === 1 ? 4 : null),
      'A',
      'B'
    );
    expect(seg.decided).toBe(false);
    expect(seg.status).toContain('1 UP');
    expect(seg.status).toContain('to play');
  });
});

describe('matchSegment / matchSegmentSides', () => {
  it('scores a 1v1 segment using per-hole low score', () => {
    const hs = holes(3);
    const scores = scoresFrom(hs, { p1: [3, 4, 4], p2: [4, 4, 4] });
    const round = makeRound({ holes: hs, scores });
    const seg = matchSegment(round, hs, round.players[0], round.players[1]);
    expect(seg.margin).toBe(1); // A up 1
  });

  it('uses best-ball for team sides', () => {
    const hs = holes(3);
    // Team A best is 3 on hole 1 (p2 posts it); team B posts 4s.
    const scores = scoresFrom(hs, {
      p1: [5, 4, 4],
      p2: [3, 4, 4],
      p3: [4, 4, 4],
      p4: [4, 4, 4],
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
      holes: hs,
      scores,
    });
    const seg = matchSegmentSides(
      round,
      hs,
      { ids: ['p1', 'p2'], label: 'A' },
      { ids: ['p3', 'p4'], label: 'B' }
    );
    expect(seg.margin).toBe(1); // team A wins hole 1 on best ball
  });
});

describe('resolveSides', () => {
  it('defaults to the first two players 1v1', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
    });
    const { a, b } = resolveSides(round);
    expect(a.ids).toEqual(['p1']);
    expect(b.ids).toEqual(['p2']);
  });

  it('builds 2v2 sides from the setup', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
    });
    const { a, b } = resolveSides(round, { mode: '2v2', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] });
    expect(a.ids).toEqual(['p1', 'p3']);
    expect(a.label).toBe('Al & Cy');
    expect(b.ids).toEqual(['p2', 'p4']);
  });
});

describe('computeMatchPlay', () => {
  it('needs two players', () => {
    const r = computeMatchPlay(makeRound({ players: [player('p1', 'Al')] }));
    expect(r.status).toBe('Needs 2 players');
  });

  it('produces standings with the leader up and a UP/DN detail', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: [3, 3, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const r = computeMatchPlay(makeRound({ holes: hs, games: ['matchPlay'], scores }));
    expect(r.standings[0].label).toBe('Al');
    expect(r.standings[0].detail).toBe('2 UP');
    expect(r.standings[0].isLeader).toBe(true);
    expect(r.standings[1].detail).toBe('2 DN');
  });

  it('labels a 2v2 match', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
      p3: Array(9).fill(4),
      p4: Array(9).fill(4),
    });
    const r = computeMatchPlay(
      makeRound({
        players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
        holes: hs,
        games: ['matchPlay'],
        options: { matchPlay: { mode: '2v2', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } },
        scores,
      })
    );
    expect(r.title).toBe('Match Play (2v2)');
  });
});

describe('a blank hole on a finished round', () => {
  // The owner's rule: once the round is finished, a hole somebody left blank
  // ("Finish anyway") is halved. It used to stay "to play", so the match read
  // "Al 1 UP · 1 to play" for good and paid nobody.
  const hs = holes(9);
  const twoBall = (status: 'in_progress' | 'finished') =>
    makeRound({
      holes: hs,
      games: ['matchPlay'],
      options: { stakes: { matchPlay: 10 } },
      scores: scoresFrom(hs, {
        p1: [3, 4, 4, 4, 4, 4, 4, 4, undefined],
        p2: [4, 4, 4, 4, 4, 4, 4, 4, undefined],
      }),
      status,
    });

  it('reads as still to play while the round is in progress', () => {
    expect(computeMatchPlay(twoBall('in_progress')).status).toBe('Al 1 UP · 1 to play');
    expect(matchPlayMoney(twoBall('in_progress'), 10)).toEqual({ p1: 0, p2: 0 });
  });

  it('is halved once the round is finished, and the match pays its winner', () => {
    const round = twoBall('finished');
    const seg = matchSegment(round, hs, round.players[0], round.players[1]);
    expect(seg.status).toBe('Al won 1 UP');
    expect(seg.winner).toBe('A');
    expect(seg.holesPlayed).toBe(9);
    expect(computeMatchPlay(round).status).toBe('Al won 1 UP');
    expect(matchPlayMoney(round, 10)).toEqual({ p1: 10, p2: -10 });
  });

  it('halves a blank in the middle of the card, not only at the end', () => {
    // Bo blank on the 5th only; Al wins the 1st and the 9th. Counted as still
    // to play, the 5th made that "won 2&1" with every hole done.
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [3, 4, 4, 4, 4, 4, 4, 4, 3],
        p2: [4, 4, 4, 4, undefined, 4, 4, 4, 4],
      }),
      status: 'finished',
    });
    expect(computeMatchPlay(round).status).toBe('Al won 2 UP');
  });

  it('halves an all-square match with a blank rather than leaving it open', () => {
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, { p1: Array(8).fill(4), p2: Array(8).fill(4) }),
      status: 'finished',
    });
    expect(computeMatchPlay(round).status).toBe('Halved');
    expect(matchPlayMoney(round, 10)).toEqual({ p1: 0, p2: 0 });
  });

  it('still reads "Not started" when nobody scored a hole', () => {
    const round = makeRound({ holes: hs, status: 'finished' });
    const seg = matchSegment(round, hs, round.players[0], round.players[1]);
    expect(seg.status).toBe('Not started');
    expect(seg.holesPlayed).toBe(0);
    expect(seg.winner).toBeNull();
  });

  it('halves a hole neither partner of a 2v2 side scored, and pays the team', () => {
    const four = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')];
    const round = makeRound({
      players: four,
      holes: hs,
      games: ['matchPlay'],
      options: {
        matchPlay: { mode: '2v2', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
        stakes: { matchPlay: 5 },
      },
      scores: scoresFrom(hs, {
        // Team A wins the 1st; the 9th is blank for both of team B.
        p1: [3, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: [5, 5, 5, 5, 5, 5, 5, 5, 5],
        p3: [4, 4, 4, 4, 4, 4, 4, 4, undefined],
        p4: [4, 4, 4, 4, 4, 4, 4, 4, undefined],
      }),
      status: 'in_progress',
    });
    expect(computeMatchPlay(round).status).toBe('Al & Bo 1 UP · 1 to play');
    expect(matchPlayMoney(round, 5)).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });

    const done = { ...round, status: 'finished' as const };
    expect(computeMatchPlay(done).status).toBe('Al & Bo won 1 UP');
    const money = matchPlayMoney(done, 5);
    expect(money).toEqual({ p1: 5, p2: 5, p3: -5, p4: -5 });
    expect(Object.values(money).reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe('runMatch — finished flag', () => {
  it('leaves an in-progress blank behind later holes still to play', () => {
    // The 2nd skipped, the 1st and 3rd played: the 2nd is the one left.
    const hs = [H(1), H(2), H(3)];
    const a = [3, null, 4];
    const b = [4, null, 4];
    const live = runMatch(hs, (h) => a[h.number - 1], (h) => b[h.number - 1], 'A', 'B');
    expect(live.status).toBe('A 1 UP · 1 to play');
    const done = runMatch(hs, (h) => a[h.number - 1], (h) => b[h.number - 1], 'A', 'B', true);
    expect(done.status).toBe('A won 1 UP');
    expect(done.winner).toBe('A');
  });
});
