import { describe, it, expect } from 'vitest';
import {
  runMatch,
  matchSegment,
  matchSegmentSides,
  resolveSides,
  computeMatchPlay,
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
