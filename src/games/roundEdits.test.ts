import { describe, it, expect } from 'vitest';
import { applyHandicaps, validateHandicaps } from './roundEdits';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { LeagueSetup } from '../types';

const cfg: LeagueSetup = {
  teams: [
    { aId: 'p1', bId: 'p2' },
    { aId: 'p3', bId: 'p4' },
  ],
  pointsPerMatch: 1,
};
const FOUR = [
  player('p1', 'Al', 10),
  player('p2', 'Bo', 14),
  player('p3', 'Cy', 6),
  player('p4', 'Di', 8),
];

describe('applyHandicaps', () => {
  it('turns useNet on when a handicap is added to a gross round', () => {
    const r = makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')] });
    expect(r.options.useNet).toBe(false);
    const next = applyHandicaps(r, { p1: 8 });
    expect(next.options.useNet).toBe(true);
    expect(next.players[0].handicap).toBe(8);
  });

  it('turns useNet off when the last handicap is cleared', () => {
    const r = makeRound({
      players: [player('p1', 'Al', 8), player('p2', 'Bo')],
      options: { useNet: true },
    });
    expect(applyHandicaps(r, { p1: undefined }).options.useNet).toBe(false);
  });

  // League rounds ship useNet: false by construction and score net regardless.
  // Flipping it would switch on stroke dots league rounds have never shown.
  it('leaves useNet alone on a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(applyHandicaps(r, { p1: 12 }).options.useNet).toBe(false);
  });

  it('does not touch scores', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, { p1: Array(9).fill(4), p2: Array(9).fill(5) });
    const r = makeRound({ players: FOUR, holes: hs, scores });
    expect(applyHandicaps(r, { p1: 3 }).scores).toEqual(scores);
  });

  it('clamps a handicap to 0..54', () => {
    const r = makeRound({ players: [player('p1', 'Al')] });
    expect(applyHandicaps(r, { p1: -4 }).players[0].handicap).toBe(0);
    expect(applyHandicaps(r, { p1: 99 }).players[0].handicap).toBe(54);
  });
});

describe('validateHandicaps', () => {
  it('accepts a blank in a non-league round', () => {
    const r = makeRound({ players: [player('p1', 'Al', 8)] });
    expect(validateHandicaps(r, { p1: undefined })).toBeNull();
  });

  it('rejects a blank in a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(validateHandicaps(r, { p2: undefined })).toMatch(/all four/i);
  });

  it('accepts a full set in a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(validateHandicaps(r, { p2: 12 })).toBeNull();
  });
});
