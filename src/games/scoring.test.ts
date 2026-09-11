import { describe, it, expect } from 'vitest';
import { netFor, canScoreNet, usesHandicap, anyNetScoring, usesHandicaps } from './scoring';
import { computeStrokePlay } from './strokePlay';
import { computeSkins } from './skins';
import { computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Round, GameType } from '../types';

const round = (games: GameType[], options: Partial<Round['options']> = {}): Round =>
  makeRound({ games, options });

describe('canScoreNet / usesHandicap', () => {
  it('lets the card-scored games be played either way', () => {
    for (const g of ['strokePlay', 'matchPlay', 'skins', 'stableford', 'wolf', 'nassau', 'vegas'] as const) {
      expect(canScoreNet(g)).toBe(true);
      expect(usesHandicap(g)).toBe(true);
    }
  });

  it('never offers net Quota, but still wants the handicap', () => {
    expect(canScoreNet('quota')).toBe(false);
    expect(usesHandicap('quota')).toBe(true);
  });
});

describe('netFor', () => {
  it('follows the round default when the game has no override', () => {
    expect(netFor(round(['skins'], { useNet: true }), 'skins')).toBe(true);
    expect(netFor(round(['skins'], { useNet: false }), 'skins')).toBe(false);
  });

  it('lets one game go gross while the rest stay net', () => {
    const r = round(['strokePlay', 'skins'], { useNet: true, netByGame: { skins: false } });
    expect(netFor(r, 'strokePlay')).toBe(true);
    expect(netFor(r, 'skins')).toBe(false);
  });

  it('lets one game go net in an otherwise gross round', () => {
    const r = round(['strokePlay', 'skins'], { useNet: false, netByGame: { skins: true } });
    expect(netFor(r, 'strokePlay')).toBe(false);
    expect(netFor(r, 'skins')).toBe(true);
  });

  it('refuses to score Quota net however the map is set', () => {
    const r = round(['quota'], { useNet: true, netByGame: { quota: true } });
    expect(netFor(r, 'quota')).toBe(false);
  });

  it('reads a round saved before per-game scoring exactly as before', () => {
    const r = round(['strokePlay', 'skins'], { useNet: true });
    expect(r.options.netByGame).toBeUndefined();
    expect(netFor(r, 'strokePlay')).toBe(true);
    expect(netFor(r, 'skins')).toBe(true);
  });
});

describe('anyNetScoring', () => {
  it('is true when a single game is net', () => {
    expect(
      anyNetScoring(round(['strokePlay', 'skins'], { useNet: false, netByGame: { skins: true } }))
    ).toBe(true);
  });

  it('is false when every game has been set to gross', () => {
    const r = round(['strokePlay', 'skins'], {
      useNet: true,
      netByGame: { strokePlay: false, skins: false },
    });
    expect(anyNetScoring(r)).toBe(false);
  });

  it('is false for a Quota round, which scores no card net', () => {
    expect(anyNetScoring(round(['quota'], { useNet: true }))).toBe(false);
    // ...while handicaps are still on screen, which is the whole reason these
    // are two predicates and not one.
    expect(usesHandicaps(round(['quota'], { useNet: true }))).toBe(true);
  });

  it('is true for a league round, which scores net with useNet false', () => {
    const r = makeRound({ options: { useNet: false } });
    const league = { ...r, options: { ...r.options, league: {} as never } };
    expect(anyNetScoring(league)).toBe(true);
  });
});

describe('per-game scoring end to end', () => {
  // Al gives Bo nine shots. Gross, Bo wins by a stroke; net, Al wins by eight.
  const hs = holes(9);
  const players = [player('p1', 'Al', 0), player('p2', 'Bo', 9)];
  const cards = { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4], p2: [5, 5, 5, 5, 5, 5, 5, 5, 4] };

  const build = (options: Partial<Round['options']>): Round =>
    makeRound({
      holes: hs,
      players,
      games: ['strokePlay', 'skins'],
      options,
      scores: scoresFrom(hs, cards),
    });

  it('scores two games in one round by two different rules', () => {
    const r = build({ useNet: true, netByGame: { skins: false } });

    // Stroke play is net: Bo's 44 off nine shots is a 35 to Al's 36.
    const sp = computeStrokePlay(r);
    expect(sp.title).toBe('Stroke Play (Net)');
    expect(sp.standings[0].label).toBe('Bo');

    // Skins is gross on the same card: Al wins the first eight holes outright.
    const sk = computeSkins(r);
    expect(sk.title).toBe('Skins');
    const alSkins = sk.standings.find((s) => s.playerId === 'p1');
    expect(alSkins?.value).toBe(8);
  });

  it('settles each game by its own rule', () => {
    const r = build({
      useNet: true,
      netByGame: { skins: false },
      stakes: { strokePlay: 10, skins: 5 },
    });
    const s = computeSettlement(r);

    const sp = s.perGame.find((g) => g.gameType === 'strokePlay');
    const sk = s.perGame.find((g) => g.gameType === 'skins');
    // Net stroke play goes to Bo...
    expect(sp?.net.p2).toBeGreaterThan(0);
    // ...while the gross skins go to Al, on the very same scores.
    expect(sk?.net.p1).toBeGreaterThan(0);
  });

  it('is unchanged from the old behaviour when nothing is overridden', () => {
    const withMap = build({ useNet: true, netByGame: {} });
    const without = build({ useNet: true });
    expect(computeStrokePlay(withMap)).toEqual(computeStrokePlay(without));
    expect(computeSkins(withMap)).toEqual(computeSkins(without));
  });
});
