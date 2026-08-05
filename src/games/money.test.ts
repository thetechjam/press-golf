import { describe, it, expect } from 'vitest';
import { lastCompletedHole, holeSwing, visibleSwing } from './money';
import { makeRound, player, holes, scoresFrom } from './testFixtures';

/** 2 players, 3 holes, $5 per skin. Al wins h1; h2 halved and carries; Bo takes h3 worth 2 skins. */
function skinsRound() {
  const hs = holes(3);
  return makeRound({
    players: [player('p1', 'Al'), player('p2', 'Bo')],
    holes: hs,
    games: ['skins'],
    options: { stakes: { skins: 5 } },
    scores: scoresFrom(hs, { p1: [4, 5, 5], p2: [5, 5, 4] }),
  });
}

describe('lastCompletedHole', () => {
  it('returns null when no hole is fully scored', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, { p1: [4, 4, 4], p2: [] }),
    });
    expect(lastCompletedHole(round)).toBeNull();
  });

  it('returns the highest fully-scored hole', () => {
    expect(lastCompletedHole(skinsRound())).toBe(3);
  });

  it('ignores a partially-scored hole after a complete one', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, { p1: [4, 4, 4], p2: [5, 5, undefined] }),
    });
    expect(lastCompletedHole(round)).toBe(2);
  });
});

describe('holeSwing', () => {
  it('attributes the carried skins pot to the hole that won it', () => {
    // With h3: Al 1 skin, Bo 2 → Al −$5, Bo +$5.
    // Without h3: Al 1 skin, Bo 0 → Al +$5, Bo −$5.
    expect(holeSwing(skinsRound(), 3)).toEqual({ p1: -10, p2: 10 });
  });

  it('is zero-sum', () => {
    const swing = holeSwing(skinsRound(), 3);
    const sum = Object.values(swing).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 2);
  });

  it('returns all zeros when no stake is set', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, { p1: [4, 5, 5], p2: [5, 5, 4] }),
    });
    expect(holeSwing(round, 3)).toEqual({ p1: 0, p2: 0 });
  });

  it('leaves the source round untouched', () => {
    const round = skinsRound();
    const before = JSON.stringify(round);
    holeSwing(round, 3);
    expect(JSON.stringify(round)).toBe(before);
  });
});

describe('visibleSwing', () => {
  it('returns the swing for the most recently completed hole when money is active', () => {
    const round = skinsRound();
    expect(visibleSwing(round, round.holes[2])).toEqual({ p1: -10, p2: 10 });
  });

  it('returns null for a hole that is not the most recently completed one', () => {
    const round = skinsRound();
    // Hole 2 is complete, but hole 3 completed after it — hole 2's delta is a
    // counterfactual (see holeSwing's doc comment), so it must not surface.
    expect(visibleSwing(round, round.holes[1])).toBeNull();
  });

  it('returns null when no hole is complete yet', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      scores: scoresFrom(hs, { p1: [4], p2: [] }),
    });
    expect(visibleSwing(round, hs[0])).toBeNull();
  });

  it('returns null when no stake is active', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, { p1: [4, 5, 5], p2: [5, 5, 4] }),
    });
    expect(visibleSwing(round, hs[2])).toBeNull();
  });

  it('returns null for a league round even though a hole just completed with an active stake', () => {
    const round = skinsRound();
    round.options.league = {
      teams: [
        { aId: 'p1', bId: 'p2' },
        { aId: 'p1', bId: 'p2' },
      ],
      pointsPerMatch: 1,
    };
    expect(visibleSwing(round, round.holes[2])).toBeNull();
  });

  it('returns null when the completed hole moved no money', () => {
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      // Hole 1: Al wins outright. Hole 2: tie — carries nothing, changes no total.
      scores: scoresFrom(hs, { p1: [4, 4], p2: [5, 4] }),
    });
    expect(visibleSwing(round, hs[1])).toBeNull();
  });
});
