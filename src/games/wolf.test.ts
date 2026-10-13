import { describe, it, expect } from 'vitest';
import { wolfForHole, computeWolf, wolfOutcomes, wolfMoney } from './wolf';
import { computeSettlement } from './settlement';
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

describe('computeWolf — calls, sides, net and gross, across a round', () => {
  const partner = (wolfPlayerId: string, partnerId: string): WolfHole => ({
    wolfPlayerId,
    choice: { type: 'partner', partnerId },
  });
  const lone = (wolfPlayerId: string): WolfHole => ({ wolfPlayerId, choice: { type: 'lone' } });
  const blind = (wolfPlayerId: string): WolfHole => ({ wolfPlayerId, choice: { type: 'blind' } });

  it('waits for the wolf to make a call', () => {
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: { wolfPlayerId: 'p1', choice: null } },
      scores: scoresFrom(hs, { p1: [3], p2: [4], p3: [4], p4: [4] }),
    });
    expect(wolfOutcomes(round)).toEqual([]);
    const r = computeWolf(round);
    expect(Object.values(byId(r)).every((x) => x === 0)).toBe(true);
    expect(r.status).toBe('Pick a wolf to start');
  });

  it('waits for both sides to hole out', () => {
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: partner('p1', 'p2') },
      scores: scoresFrom(hs, { p1: [3], p2: [4], p3: [4] }),
    });
    expect(wolfOutcomes(round)).toEqual([]);
    expect(Object.values(byId(computeWolf(round))).every((x) => x === 0)).toBe(true);
  });

  it('takes the best ball of each side', () => {
    const hs = holes(1);
    // The wolf's own 7 does not matter: the partner's 3 beats the 4.
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: partner('p1', 'p2') },
      scores: scoresFrom(hs, { p1: [7], p2: [3], p3: [4], p4: [8] }),
    });
    expect(byId(computeWolf(round))).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 });
  });

  it("pays each opponent one point when a lone wolf loses — the multiplier is the wolf's upside", () => {
    // The rule as the help sheet states it: going alone is "a bigger points
    // swing if they win". A loss costs the wolf a point to each opponent,
    // which the money model turns into three stakes against six won.
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { loneWolfMultiplier: 2 },
      wolf: { 1: lone('p1') },
      scores: scoresFrom(hs, { p1: [5], p2: [4], p3: [4], p4: [4] }),
    });
    expect(byId(computeWolf(round))).toEqual({ p1: 0, p2: 1, p3: 1, p4: 1 });
  });

  it('pays each opponent one point when a blind wolf loses', () => {
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { blindWolfMultiplier: 3 },
      wolf: { 1: blind('p1') },
      scores: scoresFrom(hs, { p1: [5], p2: [4], p3: [4], p4: [4] }),
    });
    expect(byId(computeWolf(round))).toEqual({ p1: 0, p2: 1, p3: 1, p4: 1 });
  });

  it('compares net scores when wolf is played net', () => {
    // Al gets a stroke on index 1: his 5 nets to the field's 4 and the hole
    // is halved. Gross, he loses it.
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Al', 1), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
      holes: hs,
      games: ['wolf'],
      options: { useNet: true },
      wolf: { 1: lone('p1') },
      scores: scoresFrom(hs, { p1: [5], p2: [4], p3: [4], p4: [4] }),
    });
    expect(wolfOutcomes(round).map((o) => o.result)).toEqual(['push']);
    expect(Object.values(byId(computeWolf(round))).every((x) => x === 0)).toBe(true);

    const gross = { ...round, options: { ...round.options, useNet: false } };
    expect(wolfOutcomes(gross).map((o) => o.result)).toEqual(['lost']);
  });

  it('compares gross when this game is switched to gross on a net round', () => {
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Al', 1), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
      holes: hs,
      games: ['wolf'],
      options: { useNet: true, netByGame: { wolf: false } },
      wolf: { 1: lone('p1') },
      scores: scoresFrom(hs, { p1: [5], p2: [4], p3: [4], p4: [4] }),
    });
    expect(byId(computeWolf(round))).toEqual({ p1: 0, p2: 1, p3: 1, p4: 1 });
  });

  it('rotates through three players across a nine, wrapping', () => {
    const three = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];
    const round = makeRound({ players: three, holes: holes(9) });
    expect(round.holes.map((h) => wolfForHole(round, h))).toEqual([
      'p1', 'p2', 'p3', 'p1', 'p2', 'p3', 'p1', 'p2', 'p3',
    ]);
  });

  it('uses the wolf the hole names over the rotation', () => {
    // Hole 1 would be Al's by rotation; the card says Cy took it.
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { loneWolfMultiplier: 2 },
      wolf: { 1: lone('p3') },
      scores: scoresFrom(hs, { p1: [4], p2: [4], p3: [2], p4: [4] }),
    });
    expect(wolfOutcomes(round)[0].wolfId).toBe('p3');
    expect(byId(computeWolf(round))).toEqual({ p1: 0, p2: 0, p3: 2, p4: 0 });
  });

  it('adds up across the holes and names the leader', () => {
    const hs = holes(4);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { loneWolfMultiplier: 2, blindWolfMultiplier: 3 },
      wolf: {
        1: lone('p1'), // Al alone, wins: 2
        2: partner('p2', 'p3'), // Bo and Cy, win: 1 each
        3: blind('p3'), // Cy blind, loses: 1 to each of the others
        4: partner('p4', 'p1'), // halved
      },
      scores: scoresFrom(hs, {
        p1: [2, 4, 4, 5],
        p2: [4, 3, 4, 4],
        p3: [4, 5, 6, 5],
        p4: [4, 4, 4, 4],
      }),
    });
    const r = computeWolf(round);
    expect(byId(r)).toEqual({ p1: 3, p2: 2, p3: 1, p4: 1 });
    expect(r.status).toBe('Al leads · 3 pts');
    expect(r.standings.map((s) => [s.playerId, s.rank])).toEqual([
      ['p1', 1],
      ['p2', 2],
      ['p3', 3],
      ['p4', 3],
    ]);
  });

  it('is all square when the points are level', () => {
    const hs = holes(2);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: partner('p1', 'p2'), 2: partner('p3', 'p4') },
      scores: scoresFrom(hs, { p1: [3, 5], p2: [5, 5], p3: [4, 3], p4: [4, 5] }),
    });
    const r = computeWolf(round);
    expect(byId(r)).toEqual({ p1: 1, p2: 1, p3: 1, p4: 1 });
    expect(r.status).toBe('All square');
    expect(r.standings.some((s) => s.isLeader)).toBe(false);
  });

  it('notes that two players is thin', () => {
    expect(computeWolf(makeRound({ games: ['wolf'] })).note).toBe('Wolf is best with 3–4 players');
    expect(computeWolf(makeRound({ players: FOUR, games: ['wolf'] })).note).toBeUndefined();
  });

  it("records each hole's side, opponents and multiplier", () => {
    const hs = holes(2);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { blindWolfMultiplier: 3 },
      wolf: { 2: blind('p2') },
      scores: scoresFrom(hs, { p1: [4, 4], p2: [4, 3], p3: [4, 4], p4: [4, 4] }),
    });
    expect(wolfOutcomes(round)).toEqual([
      {
        hole: 2,
        wolfId: 'p2',
        choice: 'blind',
        side: ['p2'],
        opponents: ['p1', 'p3', 'p4'],
        result: 'won',
        multiplier: 3,
      },
    ]);
  });
});

describe('wolfMoney', () => {
  it('makes each point worth the stake against every rival', () => {
    // A lone win at ×2 is two points against three rivals: six in, two out
    // of each of them.
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      options: { loneWolfMultiplier: 2, stakes: { wolf: 1 } },
      wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'lone' } } },
      scores: scoresFrom(hs, { p1: [2], p2: [4], p3: [4], p4: [4] }),
    });
    expect(wolfMoney(round, 1)).toEqual({ p1: 6, p2: -2, p3: -2, p4: -2 });
    const s = computeSettlement(round);
    expect(s.totals).toEqual({ p1: 6, p2: -2, p3: -2, p4: -2 });
    expect(s.transactions).toHaveLength(3);
    expect(s.transactions.every((t) => t.to === 'Al' && t.amount === 2)).toBe(true);
  });

  it('moves nothing on a pushed hole', () => {
    const hs = holes(1);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'partner', partnerId: 'p2' } } },
      scores: scoresFrom(hs, { p1: [4], p2: [5], p3: [4], p4: [5] }),
    });
    expect(wolfMoney(round, 5)).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });
});
