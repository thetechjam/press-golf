import { describe, it, expect } from 'vitest';
import { dotHandicapFor } from './strokeDisplay';
import { buildScorecard } from '../scorecardModel';
import { totalStrokesReceived } from './handicap';
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

  it("a card game with an allowance: the game's playing handicap, not the course handicap", () => {
    // A 20 in Stableford at 85% is scored off 17; twenty dots would show three
    // shots the engine never gives.
    const r = makeRound({
      holes: holes(18),
      players: [player('p1', 'Al', 20)],
      games: ['stableford'],
      options: { useNet: true, allowanceByGame: { stableford: 85 } },
    });
    expect(dotHandicapFor(r, 'p1')).toBe(17);
  });

  it('card games on different allowances: stroke play, whose total the Card shows', () => {
    const r = makeRound({
      holes: holes(18),
      players: [player('p1', 'Al', 20)],
      games: ['stableford', 'strokePlay'],
      options: { useNet: true, allowanceByGame: { stableford: 85, strokePlay: 95 } },
    });
    expect(dotHandicapFor(r, 'p1')).toBe(19);
  });

  it('stroke play set to gross: the next net card game in line, at its allowance', () => {
    const r = makeRound({
      holes: holes(18),
      players: [player('p1', 'Al', 20)],
      games: ['strokePlay', 'stableford'],
      options: {
        useNet: true,
        netByGame: { strokePlay: false },
        allowanceByGame: { stableford: 85 },
      },
    });
    expect(dotHandicapFor(r, 'p1')).toBe(17);
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

describe('buildScorecard — a card game played off an allowance', () => {
  it("dots and nets off the game's playing handicap", () => {
    const hs = holes(18);
    const r = makeRound({
      holes: hs,
      players: [player('p1', 'Al', 20)],
      games: ['stableford'],
      options: { useNet: true, allowanceByGame: { stableford: 85 } },
      scores: scoresFrom(hs, { p1: Array(18).fill(5) }),
    });
    const al = buildScorecard(r).rows[0];
    // 17 strokes, on indexes 1–17 — the number the Stableford engine counts.
    expect(al.cells.map((c) => c.dots)).toEqual([...Array(17).fill(1), 0]);
    expect(totalStrokesReceived(r, 'p1', 'stableford')).toBe(17);
    expect(al).toMatchObject({ gross: 90, net: 73 });
    // The HCP badge still reads the course handicap.
    expect(al.handicap).toBe(20);
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
