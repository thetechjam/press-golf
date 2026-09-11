import { describe, it, expect } from 'vitest';
import { computeQuota, quotaFor, quotaPointsFor } from './quota';
import { computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Round } from '../types';

/** A round on `n` par-4 holes with stroke index 1..n. */
const q = (
  n: number,
  players: Parameters<typeof makeRound>[0]['players'],
  cards: Record<string, (number | null | undefined)[]>,
  over: Partial<Round> = {}
): Round => {
  const hs = holes(n);
  return {
    ...makeRound({ holes: hs, players, games: ['quota'], scores: scoresFrom(hs, cards) }),
    ...over,
  };
};

const valueOf = (r: Round, id: string) =>
  computeQuota(r).standings.find((s) => s.playerId === id)?.value;

describe('quotaPointsFor', () => {
  it('pays 2 for par and one more per stroke better', () => {
    expect(quotaPointsFor(0)).toBe(2);
    expect(quotaPointsFor(-1)).toBe(3);
    expect(quotaPointsFor(-2)).toBe(4);
  });

  it('pays 1 for bogey and nothing below that', () => {
    expect(quotaPointsFor(1)).toBe(1);
    expect(quotaPointsFor(2)).toBe(0);
    expect(quotaPointsFor(5)).toBe(0);
  });
});

describe('quotaFor', () => {
  it('is 36 less the handicap over 18 holes', () => {
    const r = q(18, [player('p1', 'Al', 14)], {});
    expect(quotaFor(r, 'p1')).toBe(22);
  });

  it('is two a hole for a scratch player', () => {
    const r = q(18, [player('p1', 'Al')], {});
    expect(quotaFor(r, 'p1')).toBe(36);
  });

  it('scales to the holes being played', () => {
    // Nine holes, handicap 4: 18 points less the 4 strokes that fall on them.
    const r = q(9, [player('p1', 'Al', 4)], {});
    expect(quotaFor(r, 'p1')).toBe(14);
  });

  it('counts a second stroke on the hardest holes', () => {
    // Handicap 20 over 18: a stroke everywhere, plus a second on SI 1 and 2.
    const r = q(18, [player('p1', 'Al', 20)], {});
    expect(quotaFor(r, 'p1')).toBe(16);
  });
});

describe('computeQuota', () => {
  it('scores gross — the handicap must not be spent twice', () => {
    // Nine par 4s, all bogeys: 9 points gross. A 9-handicap's quota over these
    // holes is 18 − 9 = 9, so they are exactly on it. Were the card also
    // played net, every hole would be a par and the total would be +9.
    const r = q(9, [player('p1', 'Al', 9)], { p1: [5, 5, 5, 5, 5, 5, 5, 5, 5] });
    expect(valueOf(r, 'p1')).toBe(0);
    expect(computeQuota(r).standings[0].detail).toBe('9 pts · quota 9');
  });

  it('goes plus when the card beats the target', () => {
    // Nine pars is 18 points against a 9-handicap's quota of 9.
    const r = q(9, [player('p1', 'Al', 9)], { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] });
    expect(valueOf(r, 'p1')).toBe(9);
  });

  it('goes minus when it misses', () => {
    // Nine doubles is 0 points against a quota of 9.
    const r = q(9, [player('p1', 'Al', 9)], { p1: [6, 6, 6, 6, 6, 6, 6, 6, 6] });
    expect(valueOf(r, 'p1')).toBe(-9);
  });

  it('measures against the pace, not the whole target, mid-round', () => {
    // Three pars of a nine: 6 points, and three holes of a scratch player's
    // quota is 6. On pace, not 6 − 18.
    const r = q(9, [player('p1', 'Al')], { p1: [4, 4, 4] });
    expect(valueOf(r, 'p1')).toBe(0);
  });

  it('starts everyone level, whatever their handicaps', () => {
    // The bug this guards: measuring against a full-round quota before a ball
    // is struck puts players with different handicaps at different values —
    // and moves money between them.
    const r = q(18, [player('p1', 'Al', 2), player('p2', 'Bo', 24)], {});
    expect(valueOf(r, 'p1')).toBe(0);
    expect(valueOf(r, 'p2')).toBe(0);
    expect(computeQuota(r).status).toBe('No scores yet');
  });

  it('lands on the full quota once the round is complete', () => {
    const r = q(18, [player('p1', 'Al', 14)], { p1: Array(18).fill(4) });
    // 18 pars is 36 points against a quota of 22.
    expect(valueOf(r, 'p1')).toBe(36 - 22);
  });

  it('names the leader and how far up they are', () => {
    const r = q(9, [player('p1', 'Al'), player('p2', 'Bo')], {
      p1: [3, 4, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    expect(computeQuota(r).status).toBe('Al is +1 on quota');
  });

  it('reports all square when nobody is ahead', () => {
    const card = [4, 4, 4, 4, 4, 4, 4, 4, 4];
    const r = q(9, [player('p1', 'Al'), player('p2', 'Bo')], { p1: card, p2: card });
    expect(computeQuota(r).status).toBe('All square');
  });

  it('gives the higher handicap a real chance at the same gross score', () => {
    // Identical cards, different targets: the gap between two players is
    // exactly the strokes between them, which is the point of the game.
    const card = [5, 5, 5, 5, 5, 5, 5, 5, 5];
    const r = q(9, [player('p1', 'Al'), player('p2', 'Bo', 6)], { p1: card, p2: card });
    expect((valueOf(r, 'p2') as number) - (valueOf(r, 'p1') as number)).toBe(6);
  });

  it('allocates a second stroke on a short card the way every other game does', () => {
    // A handicap above the hole count gets two a hole, per
    // `strokesReceivedOnHole` — so an 18 over a nine is 18 strokes, and the
    // quota is zero. Quota deliberately inherits that rule rather than
    // halving handicaps itself, so one card never allocates strokes two ways.
    const r = q(9, [player('p1', 'Al', 18)], {});
    expect(quotaFor(r, 'p1')).toBe(0);
  });

  it('settles on the difference in quota result', () => {
    // Al is +9, Bo is level: a 9-point gap at $1 a point, paid one to one.
    const r = q(9, [player('p1', 'Al'), player('p2', 'Bo')], {
      p1: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      p2: [5, 5, 5, 5, 5, 5, 5, 5, 5],
    });
    const s = computeSettlement({ ...r, options: { ...r.options, stakes: { quota: 1 } } });
    expect(s.totals.p1).toBe(9);
    expect(s.totals.p2).toBe(-9);
  });

  it('moves no money before a shot is struck', () => {
    const r = q(18, [player('p1', 'Al', 2), player('p2', 'Bo', 24)], {});
    const s = computeSettlement({ ...r, options: { ...r.options, stakes: { quota: 5 } } });
    expect(s.totals.p1).toBe(0);
    expect(s.totals.p2).toBe(0);
  });
});
