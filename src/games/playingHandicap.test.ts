import { describe, it, expect } from 'vitest';
import { playingHandicap, courseHandicapFor, allowanceFor, totalStrokesReceived } from './handicap';
import { computeSkins } from './skins';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Round } from '../types';

/** 18 par-4 holes (par 72), ranked 1..18. */
const card = () => holes(18);

const round18 = (over: Partial<Round> = {}): Round => ({
  ...makeRound({ holes: card(), players: [player('p1', 'Al')] }),
  ...over,
});

describe('courseHandicapFor', () => {
  it('uses the typed stroke count when there is no rating to work from', () => {
    const r = round18({ players: [player('p1', 'Al', 14)] });
    expect(courseHandicapFor(r, r.players[0])).toBe(14);
  });

  it('derives from the Index once the round carries slope and rating', () => {
    const r = round18({
      players: [{ id: 'p1', name: 'Al', index: 14 }],
      slope: 131,
      rating: 74.2,
    });
    // 14 × (131/113) + (74.2 − 72) = 18.
    expect(courseHandicapFor(r, r.players[0])).toBe(18);
  });

  it('prefers the Index over a stale stroke count when both are present', () => {
    const r = round18({
      players: [{ id: 'p1', name: 'Al', handicap: 14, index: 14 }],
      slope: 131,
      rating: 74.2,
    });
    // The 14 was worked out for some other course; this one plays harder.
    expect(courseHandicapFor(r, r.players[0])).toBe(18);
  });

  it('falls back to the stroke count when the slope is nonsense', () => {
    const r = round18({
      players: [{ id: 'p1', name: 'Al', handicap: 12, index: 14 }],
      slope: 999,
      rating: 74.2,
    });
    expect(courseHandicapFor(r, r.players[0])).toBe(12);
  });

  it('falls back when the rating does not fit the holes being played', () => {
    // An 18-hole rating left on a 9-hole round: near enough to look fine and
    // twice what it should be, so it is not used.
    const r = {
      ...makeRound({ holes: holes(9), players: [{ id: 'p1', name: 'Al', handicap: 6, index: 14 }] }),
      slope: 113,
      rating: 72,
    };
    expect(courseHandicapFor(r, r.players[0])).toBe(6);
  });

  it('is zero for a player with neither', () => {
    const r = round18({ players: [player('p1', 'Al')] });
    expect(courseHandicapFor(r, r.players[0])).toBe(0);
  });
});

describe('allowanceFor', () => {
  it('is full when nothing was set', () => {
    expect(allowanceFor(round18(), 'matchPlay')).toBe(100);
  });

  it('reads the game its own percentage', () => {
    const r = round18({
      options: { ...round18().options, allowanceByGame: { matchPlay: 90, skins: 100 } },
    });
    expect(allowanceFor(r, 'matchPlay')).toBe(90);
    expect(allowanceFor(r, 'skins')).toBe(100);
    // A game with no entry is unaffected by another game's allowance.
    expect(allowanceFor(r, 'stableford')).toBe(100);
  });

  it('ignores a percentage that could not be one', () => {
    const r = round18({
      options: { ...round18().options, allowanceByGame: { skins: 0 } },
    });
    expect(allowanceFor(r, 'skins')).toBe(100);
  });
});

describe('playingHandicap', () => {
  const staked = (allowanceByGame: Record<string, number>) =>
    round18({
      players: [player('p1', 'Al', 20)],
      options: { ...round18().options, allowanceByGame },
    });

  it('is the course handicap when no game is named', () => {
    expect(playingHandicap(staked({ skins: 85 }), 'p1')).toBe(20);
  });

  it('applies the allowance for that game', () => {
    expect(playingHandicap(staked({ skins: 85 }), 'p1', 'skins')).toBe(17);
  });

  it('leaves the other games at full handicap', () => {
    const r = staked({ skins: 85 });
    expect(playingHandicap(r, 'p1', 'stableford')).toBe(20);
  });

  it('is zero for a player who is not in the round', () => {
    expect(playingHandicap(round18(), 'nobody')).toBe(0);
  });
});

describe('an allowance reaching the card', () => {
  it('changes how many strokes a player actually receives', () => {
    const r = round18({ players: [player('p1', 'Al', 18)] });
    expect(totalStrokesReceived(r, 'p1')).toBe(18);

    const cut = round18({
      players: [player('p1', 'Al', 18)],
      options: { ...round18().options, allowanceByGame: { skins: 50 } },
    });
    expect(totalStrokesReceived(cut, 'p1', 'skins')).toBe(9);
  });

  it('decides a hole in a real game', () => {
    // Stroke index equals hole number here. Al plays off 2, so at full
    // allowance he has a shot on holes 1 and 2 and nowhere else. He bogeys
    // both of those and pars the rest; Bo pars everything.
    const hs = holes(18);
    const base = makeRound({
      holes: hs,
      players: [player('p1', 'Al', 2), player('p2', 'Bo')],
      games: ['skins'],
      options: { useNet: true },
      scores: scoresFrom(hs, {
        p1: [5, 5, ...Array(16).fill(4)],
        p2: Array(18).fill(4),
      }),
    });

    // Full allowance: both bogeys net down to par, every hole is halved, and
    // nobody takes a skin all day.
    const atFull = computeSkins(base).standings;
    expect(atFull.find((s) => s.playerId === 'p1')?.value).toBe(0);
    expect(atFull.find((s) => s.playerId === 'p2')?.value).toBe(0);

    // Cut to 50% Al plays off 1. His shot on hole 1 still saves that half, but
    // hole 2 is now outside his allocation: the 5 stands, and Bo takes the
    // hole along with the skin carried off the first.
    const cut = {
      ...base,
      options: { ...base.options, allowanceByGame: { skins: 50 } },
    };
    const atHalf = computeSkins(cut).standings;
    expect(atHalf.find((s) => s.playerId === 'p2')?.value).toBe(2);
    expect(atHalf.find((s) => s.playerId === 'p1')?.value).toBe(0);
  });
});
