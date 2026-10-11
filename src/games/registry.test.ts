import { describe, it, expect } from 'vitest';
import { GAMES, gameMeta } from './index';
import { STAKE_UNIT, computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { GameType } from '../types';

/**
 * The registry is the one list of games. The settlement engine, the stake
 * editor and the boards all read it, so what this pins is that every game in
 * the type is there, exactly once, and that each one can settle money.
 */

/** Every member of the union, so adding one to the type fails here first. */
const EVERY_GAME: Record<GameType, true> = {
  strokePlay: true,
  matchPlay: true,
  skins: true,
  stableford: true,
  wolf: true,
  nassau: true,
  vegas: true,
  quota: true,
  junk: true,
};

/** Four players with full cards, teams set for every team game. */
const fourBall = () => {
  const hs = holes(18);
  const card = (n: number) => Array.from({ length: 18 }, (_, i) => n + ((i * 7) % 3) - 1);
  return makeRound({
    holes: hs,
    players: [
      player('p1', 'Al', 4),
      player('p2', 'Bo', 9),
      player('p3', 'Cy', 15),
      player('p4', 'Di', 22),
    ],
    games: GAMES.map((g) => g.id),
    options: {
      useNet: true,
      matchPlay: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
      nassau: { mode: '2v2', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
      vegas: { mode: '2v2', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] },
      autoPress: true,
    },
    scores: scoresFrom(hs, { p1: card(4), p2: card(5), p3: card(5), p4: card(6) }),
    wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'lone' } }, 2: { wolfPlayerId: 'p2', choice: { type: 'partner', partnerId: 'p3' } } },
    junk: { 3: { p2: ['sandie'], p4: ['greenie', 'barkie'] } },
  });
};

describe('the game registry', () => {
  it('holds every game type exactly once, and nothing else', () => {
    const ids = GAMES.map((g) => g.id);
    expect([...ids].sort()).toEqual(Object.keys(EVERY_GAME).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every game a money rule and a stake unit', () => {
    for (const g of GAMES) {
      expect(typeof g.money, g.id).toBe('function');
      expect(g.unit, g.id).toMatch(/\S/);
      expect(STAKE_UNIT[g.id]).toBe(g.unit);
    }
  });

  it('every money rule names every player and sums to zero', () => {
    const round = fourBall();
    for (const g of GAMES) {
      const net = g.money(round, 5);
      expect(Object.keys(net).sort(), g.id).toEqual(['p1', 'p2', 'p3', 'p4']);
      const sum = Object.values(net).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum), `${g.id} is not zero-sum: ${JSON.stringify(net)}`).toBeLessThan(1e-9);
    }
  });

  it('every money rule moves nothing on an empty card', () => {
    const empty = makeRound({ players: fourBall().players, games: GAMES.map((g) => g.id) });
    for (const g of GAMES) {
      expect(Object.values(g.money(empty, 5)).every((v) => v === 0), g.id).toBe(true);
    }
  });

  it('is what the settlement engine reads', () => {
    const round = fourBall();
    round.options.stakes = Object.fromEntries(GAMES.map((g) => [g.id, 2]));
    const s = computeSettlement(round);
    expect(s.perGame.map((g) => g.gameType)).toEqual(round.games);
    for (const g of s.perGame) {
      expect(g.label).toBe(gameMeta(g.gameType).label);
      expect(g.unit.startsWith(gameMeta(g.gameType).unit)).toBe(true);
    }
    const total = Object.values(s.totals).reduce((a, b) => a + b, 0);
    expect(Math.abs(total)).toBeLessThan(1e-9);
  });
});
