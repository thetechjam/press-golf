import { describe, it, expect } from 'vitest';
import { dotHandicapFor } from './strokeDisplay';
import { buildScorecard } from '../scorecardModel';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { GameType, GameOptions } from '../types';

const AL_BO = [player('p1', 'Al', 6), player('p2', 'Bo', 10)];

const round = (games: GameType[], options: Partial<GameOptions> = {}) =>
  makeRound({ holes: holes(18), players: AL_BO, games, options: { useNet: true, ...options } });

describe('dotHandicapFor — which strokes the markers draw', () => {
  it('a match alone: the match strokes, off the low man', () => {
    const r = round(['matchPlay']);
    expect(dotHandicapFor(r, 'p1')).toBe(0);
    expect(dotHandicapFor(r, 'p2')).toBe(4);
  });

  it('Nassau alone: the same', () => {
    const r = round(['nassau']);
    expect(dotHandicapFor(r, 'p1')).toBe(0);
    expect(dotHandicapFor(r, 'p2')).toBe(4);
  });

  it('a card game in the round: the full handicap, which the Card nets off', () => {
    const r = round(['skins', 'matchPlay']);
    expect(dotHandicapFor(r, 'p1')).toBe(6);
    expect(dotHandicapFor(r, 'p2')).toBe(10);
  });

  it('a card game set to gross beside a net match: the match strokes', () => {
    const r = round(['skins', 'matchPlay'], { netByGame: { skins: false } });
    expect(dotHandicapFor(r, 'p2')).toBe(4);
  });

  it('a player outside the match gets none', () => {
    const r = makeRound({
      holes: holes(18),
      players: [...AL_BO, player('p3', 'Cy', 12)],
      games: ['matchPlay'],
      options: { useNet: true, matchPlay: { mode: '1v1', teamA: ['p1'], teamB: ['p2'] } },
    });
    expect(dotHandicapFor(r, 'p3')).toBe(0);
    expect(dotHandicapFor(r, 'p2')).toBe(4);
  });

  it('a gross round draws nothing', () => {
    expect(dotHandicapFor(round(['matchPlay'], { useNet: false }), 'p2')).toBe(0);
    expect(dotHandicapFor(round(['skins'], { useNet: false }), 'p2')).toBe(0);
  });

  it('is zero for a player who is not in the round', () => {
    expect(dotHandicapFor(round(['matchPlay']), 'nobody')).toBe(0);
  });
});

describe('buildScorecard — a match-only net round', () => {
  it('dots the 10 on indexes 1–4 and the 6 nowhere, and nets the total off those', () => {
    const hs = holes(18);
    const r = makeRound({
      holes: hs,
      players: AL_BO,
      games: ['matchPlay'],
      options: { useNet: true },
      scores: scoresFrom(hs, { p1: Array(18).fill(4), p2: Array(18).fill(5) }),
    });
    const model = buildScorecard(r);
    const al = model.rows[0];
    const bo = model.rows[1];
    expect(al.cells.map((c) => c.dots)).toEqual(Array(18).fill(0));
    expect(bo.cells.map((c) => c.dots)).toEqual([1, 1, 1, 1, ...Array(14).fill(0)]);
    expect(bo).toMatchObject({ gross: 90, net: 86 });
    // The HCP badge still reads the course handicap.
    expect(al.handicap).toBe(6);
    expect(bo.handicap).toBe(10);
  });
});
