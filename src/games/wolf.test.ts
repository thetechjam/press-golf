import { describe, it, expect } from 'vitest';
import { wolfForHole, computeWolf } from './wolf';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { WolfHole } from '../types';

const FOUR = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')];

function byId(r: ReturnType<typeof computeWolf>) {
  const m: Record<string, number> = {};
  r.standings.forEach((s) => {
    if (s.playerId) m[s.playerId] = s.value;
  });
  return m;
}

describe('wolfForHole', () => {
  it('rotates the wolf by tee order', () => {
    const round = makeRound({ players: FOUR, holes: holes(8) });
    expect(wolfForHole(round, round.holes[0])).toBe('p1'); // hole 1
    expect(wolfForHole(round, round.holes[1])).toBe('p2'); // hole 2
    expect(wolfForHole(round, round.holes[3])).toBe('p4'); // hole 4
    expect(wolfForHole(round, round.holes[4])).toBe('p1'); // hole 5 wraps
  });
});

describe('computeWolf', () => {
  it('needs a wolf assignment to start', () => {
    const r = computeWolf(makeRound({ players: FOUR, holes: holes(4), games: ['wolf'] }));
    expect(r.status).toBe('Pick a wolf to start');
  });

  it('awards a point to each partner when the wolf side wins', () => {
    const hs = holes(1);
    // Wolf p1 partners p2. Their best (3) beats opponents' best (4).
    const wolf: Record<number, WolfHole> = {
      1: { wolfPlayerId: 'p1', choice: { type: 'partner', partnerId: 'p2' } },
    };
    const scores = scoresFrom(hs, { p1: [3], p2: [5], p3: [4], p4: [4] });
    const r = computeWolf(makeRound({ players: FOUR, holes: hs, games: ['wolf'], wolf, scores }));
    const v = byId(r);
    expect(v.p1).toBe(1);
    expect(v.p2).toBe(1);
    expect(v.p3).toBe(0);
    expect(v.p4).toBe(0);
  });

  it('awards each opponent a point when the wolf side loses', () => {
    const hs = holes(1);
    const wolf: Record<number, WolfHole> = {
      1: { wolfPlayerId: 'p1', choice: { type: 'partner', partnerId: 'p2' } },
    };
    const scores = scoresFrom(hs, { p1: [5], p2: [5], p3: [3], p4: [4] });
    const r = computeWolf(makeRound({ players: FOUR, holes: hs, games: ['wolf'], wolf, scores }));
    const v = byId(r);
    expect(v.p1).toBe(0);
    expect(v.p2).toBe(0);
    expect(v.p3).toBe(1);
    expect(v.p4).toBe(1);
  });

  it('applies the lone-wolf multiplier on a solo win', () => {
    const hs = holes(1);
    const wolf: Record<number, WolfHole> = {
      1: { wolfPlayerId: 'p1', choice: { type: 'lone' } },
    };
    const scores = scoresFrom(hs, { p1: [2], p2: [4], p3: [4], p4: [4] });
    const r = computeWolf(
      makeRound({
        players: FOUR,
        holes: hs,
        games: ['wolf'],
        options: { loneWolfMultiplier: 2 },
        wolf,
        scores,
      })
    );
    const v = byId(r);
    expect(v.p1).toBe(2); // lone multiplier
    expect(v.p2).toBe(0);
  });

  it('applies the blind-wolf multiplier on a solo win', () => {
    const hs = holes(1);
    const wolf: Record<number, WolfHole> = {
      1: { wolfPlayerId: 'p1', choice: { type: 'blind' } },
    };
    const scores = scoresFrom(hs, { p1: [2], p2: [4], p3: [4], p4: [4] });
    const r = computeWolf(
      makeRound({
        players: FOUR,
        holes: hs,
        games: ['wolf'],
        options: { blindWolfMultiplier: 3 },
        wolf,
        scores,
      })
    );
    const v = byId(r);
    expect(v.p1).toBe(3);
  });

  it('is a push (no points) when the sides tie', () => {
    const hs = holes(1);
    const wolf: Record<number, WolfHole> = {
      1: { wolfPlayerId: 'p1', choice: { type: 'partner', partnerId: 'p2' } },
    };
    const scores = scoresFrom(hs, { p1: [4], p2: [5], p3: [4], p4: [5] });
    const r = computeWolf(makeRound({ players: FOUR, holes: hs, games: ['wolf'], wolf, scores }));
    const v = byId(r);
    expect(Object.values(v).every((x) => x === 0)).toBe(true);
  });
});
