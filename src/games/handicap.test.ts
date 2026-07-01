import { describe, it, expect } from 'vitest';
import {
  strokeIndexMap,
  strokesReceivedOnHole,
  holeScore,
  totalStrokesReceived,
} from './handicap';
import { makeRound, player, holes } from './testFixtures';

describe('strokeIndexMap', () => {
  it('uses provided stroke indexes when every hole has one', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 5 },
        { number: 2, par: 4, strokeIndex: 1 },
        { number: 3, par: 4, strokeIndex: 9 },
      ],
    });
    expect(strokeIndexMap(round)).toEqual({ 1: 5, 2: 1, 3: 9 });
  });

  it('falls back to sequential order when any stroke index is missing', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 5 },
        { number: 2, par: 4 }, // missing
        { number: 3, par: 4, strokeIndex: 9 },
      ],
    });
    expect(strokeIndexMap(round)).toEqual({ 1: 1, 2: 2, 3: 3 });
  });
});

describe('strokesReceivedOnHole', () => {
  it('gives one stroke when stroke index is within the handicap', () => {
    expect(strokesReceivedOnHole(9, 1, 18)).toBe(1);
    expect(strokesReceivedOnHole(9, 9, 18)).toBe(1);
  });

  it('gives no stroke when stroke index exceeds the handicap', () => {
    expect(strokesReceivedOnHole(9, 10, 18)).toBe(0);
  });

  it('gives two strokes on the hardest holes when handicap exceeds hole count', () => {
    // 18 holes, handicap 20 → SI 1 and 2 get a second stroke.
    expect(strokesReceivedOnHole(20, 1, 18)).toBe(2);
    expect(strokesReceivedOnHole(20, 2, 18)).toBe(2);
    expect(strokesReceivedOnHole(20, 3, 18)).toBe(1);
  });

  it('returns 0 for non-positive handicap or missing stroke index', () => {
    expect(strokesReceivedOnHole(0, 1, 18)).toBe(0);
    expect(strokesReceivedOnHole(-3, 1, 18)).toBe(0);
    expect(strokesReceivedOnHole(9, 0, 18)).toBe(0);
  });
});

describe('holeScore', () => {
  const round = makeRound({
    players: [player('p1', 'Al', 4)],
    holes: holes(9), // SI = hole number
    scores: { 1: { p1: 5 }, 5: { p1: 4 } },
  });

  it('returns the raw score when net scoring is off', () => {
    expect(holeScore(round, 'p1', round.holes[0], false)).toBe(5);
  });

  it('subtracts a stroke on holes within the handicap when net is on', () => {
    // Hole 1 (SI 1) is within handicap 4 → net 5-1 = 4.
    expect(holeScore(round, 'p1', round.holes[0], true)).toBe(4);
  });

  it('does not subtract a stroke on holes outside the handicap', () => {
    // Hole 5 (SI 5) is outside handicap 4 → net stays 4.
    expect(holeScore(round, 'p1', round.holes[4], true)).toBe(4);
  });

  it('returns null when no score is entered', () => {
    expect(holeScore(round, 'p1', round.holes[2], true)).toBeNull();
  });
});

describe('totalStrokesReceived', () => {
  it('is zero for a scratch player', () => {
    const round = makeRound({ players: [player('p1', 'Al', 0)], holes: holes(18) });
    expect(totalStrokesReceived(round, 'p1')).toBe(0);
  });

  it('equals the handicap when handicap <= hole count', () => {
    const round = makeRound({ players: [player('p1', 'Al', 7)], holes: holes(18) });
    expect(totalStrokesReceived(round, 'p1')).toBe(7);
  });

  it('exceeds the hole count for a high handicap (second strokes)', () => {
    // 18 holes, handicap 22 → 18 first strokes + 4 second strokes = 22.
    const round = makeRound({ players: [player('p1', 'Al', 22)], holes: holes(18) });
    expect(totalStrokesReceived(round, 'p1')).toBe(22);
  });

  it('is zero when the player is unknown', () => {
    const round = makeRound({ players: [player('p1', 'Al', 7)], holes: holes(18) });
    expect(totalStrokesReceived(round, 'ghost')).toBe(0);
  });
});
