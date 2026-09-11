import { describe, it, expect } from 'vitest';
import { computeVegas, vegasHoles, vegasNumber } from './vegas';
import { computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Round, TeamSetup } from '../types';

const TEAMS: TeamSetup = { mode: '2v2', teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] };

const four = [
  player('a1', 'Al'),
  player('a2', 'Ann'),
  player('b1', 'Bo'),
  player('b2', 'Bea'),
];

/** A Vegas round over `n` par-4 holes with the given cards. */
const v = (
  n: number,
  cards: Record<string, (number | null | undefined)[]>,
  options: Partial<Round['options']> = {}
): Round => {
  const hs = holes(n);
  return makeRound({
    holes: hs,
    players: four,
    games: ['vegas'],
    options: { vegas: TEAMS, ...options },
    scores: scoresFrom(hs, cards),
  });
};

describe('vegasNumber', () => {
  it('writes the lower score first', () => {
    expect(vegasNumber(4, 5, false)).toBe(45);
  });

  it('turns the number around when flipped', () => {
    expect(vegasNumber(4, 5, true)).toBe(54);
  });

  it('keeps a double-figure score as a digit run, not arithmetic', () => {
    // A 5 and a 10 is 510 — what a group writes down. `lo * 10 + hi` would
    // have made it 105, a number that wins holes it should lose.
    expect(vegasNumber(5, 10, false)).toBe(510);
    expect(vegasNumber(10, 12, false)).toBe(1012);
  });
});

describe('vegasHoles', () => {
  it('gives the hole to the lower number, by the gap between them', () => {
    // A: 4 and 5 = 45. B: 5 and 6 = 56. A wins 11.
    const r = v(1, { a1: [4], a2: [5], b1: [5], b2: [6] });
    const { holes: hs, margin } = vegasHoles(r);
    expect(hs[0]).toEqual({ hole: 1, a: 45, b: 56, swing: 11 });
    expect(margin).toBe(11);
  });

  it('makes one blow-up cost a hundred, not a hole', () => {
    // A pars and doubles: 4 and 6 = 46. B pars twice: 44. B wins by only 2.
    // Put the 6 first and it would have been 64 — a 20-point hole.
    const r = v(1, { a1: [4], a2: [6], b1: [4], b2: [4] });
    expect(vegasHoles(r).margin).toBe(-2);
  });

  it('flips the other side when a birdie is made', () => {
    // B birdies, so A's 45 becomes 54. B's own number is 34.
    const r = v(1, { a1: [4], a2: [5], b1: [3], b2: [4] });
    const { holes: hs } = vegasHoles(r);
    expect(hs[0].a).toBe(54);
    expect(hs[0].b).toBe(34);
    expect(hs[0].swing).toBe(-20);
  });

  it('leaves the numbers alone when the flip is turned off', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [3], b2: [4] }, { vegasFlip: false });
    const { holes: hs } = vegasHoles(r);
    expect(hs[0].a).toBe(45);
    expect(hs[0].swing).toBe(-11);
  });

  it('flips for an eagle as well as a birdie', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [2], b2: [4] });
    expect(vegasHoles(r).holes[0].a).toBe(54);
  });

  it('flips both ways when both sides birdie', () => {
    const r = v(1, { a1: [3], a2: [5], b1: [3], b2: [6] });
    const { holes: hs } = vegasHoles(r);
    expect(hs[0].a).toBe(53);
    expect(hs[0].b).toBe(63);
  });

  it('keeps the flip on for a round saved before the option existed', () => {
    // vegasFlip undefined means on, so an old round scores as it was played.
    const r = v(1, { a1: [4], a2: [5], b1: [3], b2: [4] });
    expect(r.options.vegasFlip).toBeUndefined();
    expect(vegasHoles(r).holes[0].a).toBe(54);
  });

  it('will not value a hole with a ball still out', () => {
    const r = v(2, { a1: [4, 4], a2: [5, 5], b1: [5, 5], b2: [6, undefined] });
    const { holes: hs, margin } = vegasHoles(r);
    expect(hs).toHaveLength(1);
    expect(margin).toBe(11);
  });

  it('runs the margin across holes', () => {
    const r = v(2, { a1: [4, 5], a2: [5, 6], b1: [5, 4], b2: [6, 4] });
    // Hole 1: 45 to 56, A +11. Hole 2: 56 to 44, B +12. Net B +1.
    expect(vegasHoles(r).margin).toBe(-1);
  });

  it('scores net when handicaps are on', () => {
    const hs = holes(1);
    const r = makeRound({
      holes: hs,
      players: [player('a1', 'Al', 1), ...four.slice(1)],
      games: ['vegas'],
      options: { vegas: TEAMS, useNet: true },
      scores: scoresFrom(hs, { a1: [5], a2: [5], b1: [5], b2: [5] }),
    });
    // Al's stroke turns his 5 into a 4, so A is 45 against B's 55.
    expect(vegasHoles(r).holes[0]).toMatchObject({ a: 45, b: 55 });
  });

  it('lets a net birdie flip, since the whole hole is judged net', () => {
    // Al's stroke turns a 4 into a 3 on a par 4. In a net round that is a
    // birdie everywhere else in the app, so it flips here too — the flip is
    // read off the same scores that win the hole, never a second set.
    const hs = holes(1);
    const r = makeRound({
      holes: hs,
      players: [player('a1', 'Al', 1), ...four.slice(1)],
      games: ['vegas'],
      options: { vegas: TEAMS, useNet: true },
      scores: scoresFrom(hs, { a1: [4], a2: [5], b1: [4], b2: [5] }),
    });
    expect(vegasHoles(r).holes[0]).toMatchObject({ a: 35, b: 54 });
  });
});

describe('computeVegas', () => {
  it('asks for teams before it will score', () => {
    const hs = holes(1);
    const r = makeRound({
      holes: hs,
      players: four,
      games: ['vegas'],
      scores: scoresFrom(hs, { a1: [4], a2: [5], b1: [5], b2: [6] }),
    });
    expect(computeVegas(r).status).toBe('Needs two teams of 2');
    expect(computeVegas(r).standings).toEqual([]);
  });

  it('leads with the side that is up', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [5], b2: [6] });
    const res = computeVegas(r);
    expect(res.status).toBe('Al & Ann up 11');
    expect(res.standings[0].label).toBe('Al & Ann');
    expect(res.standings[0].isLeader).toBe(true);
    expect(res.standings[1].detail).toBe('-11 pts');
  });

  it('puts the side that is up on top', () => {
    const r = v(1, { a1: [5], a2: [6], b1: [4], b2: [5] });
    expect(computeVegas(r).standings.map((s) => s.label)).toEqual(['Bo & Bea', 'Al & Ann']);
    expect(computeVegas(r).standings[0].rank).toBe(1);
  });

  it('keeps the picked order at all square, and ties them for first', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [4], b2: [5] });
    const res = computeVegas(r);
    expect(res.standings.map((s) => s.label)).toEqual(['Al & Ann', 'Bo & Bea']);
    expect(res.standings.map((s) => s.rank)).toEqual([1, 1]);
  });

  it('reports all square at nil', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [4], b2: [5] });
    expect(computeVegas(r).status).toBe('All square');
    expect(computeVegas(r).standings.every((s) => !s.isLeader)).toBe(true);
  });

  it('says nothing has happened before a hole is complete', () => {
    const r = v(1, {});
    expect(computeVegas(r).status).toBe('No holes completed');
  });

  it('cites the most recent hole', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [5], b2: [6] });
    expect(computeVegas(r).note).toBe('Hole 1: 45 to 56');
  });

  it('settles the points per player on each side', () => {
    const r = v(1, { a1: [4], a2: [5], b1: [5], b2: [6] });
    const s = computeSettlement({ ...r, options: { ...r.options, stakes: { vegas: 1 } } });
    // 11 points at $1 — every player on the winning side collects $11.
    expect(s.totals.a1).toBe(11);
    expect(s.totals.a2).toBe(11);
    expect(s.totals.b1).toBe(-11);
    expect(s.totals.b2).toBe(-11);
  });

  it('moves no money without teams', () => {
    const hs = holes(1);
    const r = makeRound({
      holes: hs,
      players: four,
      games: ['vegas'],
      options: { stakes: { vegas: 5 } },
      scores: scoresFrom(hs, { a1: [4], a2: [5], b1: [5], b2: [6] }),
    });
    const s = computeSettlement(r);
    expect(Object.values(s.totals).every((v) => v === 0)).toBe(true);
  });
});
