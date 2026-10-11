import { describe, it, expect } from 'vitest';
import { matchAllowanceFor, matchHandicaps, strokeIndexMap, strokesReceivedOnHole } from './handicap';
import {
  computeMatchPlay,
  isFourBall,
  matchSegmentSides,
  matchStrokesFor,
  matchStrokesNote,
  resolveSides,
} from './matchPlay';
import { autoPressStarts, computeNassau, nassauTeams } from './nassau';
import { computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { GameOptions, Round } from '../types';

/**
 * Rules of Handicapping, Appendix C: in match play "the player with the lowest
 * Playing Handicap plays off zero strokes relative to the other player(s). The
 * other player(s) receive(s) the difference" — Individual 100%, Four-Ball 90%,
 * the four-ball's 90% applied to the difference in Course Handicap from the
 * low player. The worked examples below are the Appendix's own.
 */

const pars = (n: number) => Array.from({ length: n }, () => 4);

/** Al against Bo, net match play, stroke index = hole number. */
const duel = (
  hcpA: number,
  hcpB: number,
  n = 18,
  cards?: Record<string, (number | null | undefined)[]>,
  options: Partial<GameOptions> = {}
): Round => {
  const hs = holes(n);
  return makeRound({
    holes: hs,
    players: [player('p1', 'Al', hcpA), player('p2', 'Bo', hcpB)],
    games: ['matchPlay'],
    options: { useNet: true, ...options },
    scores: cards ? scoresFrom(hs, cards) : {},
  });
};

const sidesOf = (round: Round, game: 'matchPlay' | 'nassau' = 'matchPlay') =>
  game === 'nassau' ? nassauTeams(round) : resolveSides(round, round.options.matchPlay);

const strokesOf = (round: Round, game: 'matchPlay' | 'nassau' = 'matchPlay') => {
  const { a, b } = sidesOf(round, game);
  return matchStrokesFor(round, a, b, game);
};

/** Which holes a player gets a shot on, and how many, in hole order. */
const shotsByHole = (round: Round, id: string, game: 'matchPlay' | 'nassau' = 'matchPlay') => {
  const strokes = strokesOf(round, game);
  const si = strokeIndexMap(round);
  return round.holes.map((h) => strokesReceivedOnHole(strokes[id] ?? 0, si[h.number], round.holes.length));
};

describe('matchHandicaps — singles', () => {
  it('gives the low player nothing and the other the difference', () => {
    expect(matchHandicaps(duel(6, 10), ['p1', 'p2'], 'matchPlay', false)).toEqual({ p1: 0, p2: 4 });
  });

  it('reads the Appendix C example: a 10 against an 18, the 18 receives 8', () => {
    expect(strokesOf(duel(10, 18))).toEqual({ p1: 0, p2: 8 });
  });

  it('lands the shots on stroke indexes 1 to the difference, and nowhere else', () => {
    const r = duel(6, 10);
    expect(shotsByHole(r, 'p2')).toEqual([1, 1, 1, 1, ...Array(14).fill(0)]);
    expect(shotsByHole(r, 'p1')).toEqual(Array(18).fill(0));
  });

  it('treats a plus handicap as the low man at scratch', () => {
    // +3 against a 5: the difference is 8. The plus player gives nothing back.
    expect(strokesOf(duel(-3, 5))).toEqual({ p1: 0, p2: 8 });
    expect(shotsByHole(duel(-3, 5), 'p1')).toEqual(Array(18).fill(0));
  });

  it('is level between equal handicaps', () => {
    expect(strokesOf(duel(12, 12))).toEqual({ p1: 0, p2: 0 });
  });

  it('laps a nine when the difference exceeds the holes', () => {
    // 2 against 14 on nine holes: 12 shots — two on indexes 1–3, one elsewhere.
    const r = duel(2, 14, 9);
    expect(strokesOf(r)).toEqual({ p1: 0, p2: 12 });
    expect(shotsByHole(r, 'p2')).toEqual([2, 2, 2, 1, 1, 1, 1, 1, 1]);
  });

  it('laps an eighteen for a difference over eighteen', () => {
    // Scratch against a 22: a second shot on the four hardest.
    expect(shotsByHole(duel(0, 22), 'p2')).toEqual([2, 2, 2, 2, ...Array(14).fill(1)]);
  });

  it('gives nobody anything when the match is scored gross', () => {
    expect(strokesOf(duel(6, 10, 18, undefined, { useNet: false }))).toEqual({});
    expect(strokesOf(duel(6, 10, 18, undefined, { netByGame: { matchPlay: false } }))).toEqual({});
  });

  it('works off the course handicap an Index derives, not the typed count', () => {
    // Slope 113, rating 72, par 72: course handicap = Index. Al typed 0 but
    // carries a 6.0 Index; Bo a 10.0.
    const hs = holes(18);
    const r = makeRound({
      holes: hs,
      players: [
        { id: 'p1', name: 'Al', handicap: 0, index: 6 },
        { id: 'p2', name: 'Bo', handicap: 0, index: 10 },
      ],
      games: ['matchPlay'],
      options: { useNet: true },
      slope: 113,
      rating: 72,
    });
    expect(strokesOf(r)).toEqual({ p1: 0, p2: 4 });
  });
});

describe('matchSegmentSides — the match is decided off the difference', () => {
  it('a 10 against a 6: shots on indexes 1–4 halve a bogey, and none on the 7th and 8th', () => {
    // Al pars everything. Bo bogeys the 1st to 4th — his four shots bring
    // those back to level — pars the 5th and 6th, and bogeys the 7th and 8th.
    // Off full handicaps Bo had a shot on 1–10, so the 7th and 8th were
    // halved too; off the difference his shots stop at the 4th and Al wins
    // both, and with the 18th still to play the match is over on the 17th.
    const p2 = pars(18);
    for (const i of [0, 1, 2, 3, 6, 7]) p2[i] = 5;
    const r = duel(6, 10, 18, { p1: pars(18), p2 });
    const { a, b } = sidesOf(r);
    const seg = matchSegmentSides(r, r.holes, a, b);
    expect(seg.margin).toBe(2);
    expect(seg.winner).toBe('A');
    expect(seg.decided).toBe(true);
    expect(seg.status).toBe('Al won 2&1');
    // Hole by hole: the 1st is halved by Bo's shot, the 7th and 8th are Al's.
    expect(matchSegmentSides(r, [r.holes[0]], a, b).status).toBe('Halved');
    expect(matchSegmentSides(r, [r.holes[6], r.holes[7]], a, b).margin).toBe(2);
    // And a par against a par on a shot hole is Bo's: the 2nd, both 4s.
    const level = duel(6, 10, 18, { p1: pars(18), p2: pars(18) });
    expect(matchSegmentSides(level, [level.holes[1]], a, b).margin).toBe(-1);
    expect(matchSegmentSides(level, [level.holes[4]], a, b).status).toBe('Halved');
  });

  it('a plus player plays off scratch rather than giving a shot back', () => {
    // +3 against a 5, both par the 18th (index 18). Off his own handicap Al
    // gave a shot back there and lost the hole to a par; off the difference
    // it is halved. On the 1st Bo's shot (one of eight) wins it.
    const r = duel(-3, 5, 18, { p1: pars(18), p2: pars(18) });
    const { a, b } = sidesOf(r);
    expect(matchSegmentSides(r, [r.holes[17]], a, b).status).toBe('Halved');
    expect(matchSegmentSides(r, [r.holes[0]], a, b).margin).toBe(-1);
  });

  it('settles the money on the same result', () => {
    const p1 = pars(9);
    const p2 = pars(9);
    // Bo bogeys his four shot holes (halved) and the 7th, where he has no
    // shot off the difference: Al wins it and the match, 1 UP.
    for (const i of [0, 1, 2, 3, 6]) p2[i] = 5;
    const hs = holes(9);
    const r = makeRound({
      holes: hs,
      players: [player('p1', 'Al', 6), player('p2', 'Bo', 10)],
      games: ['matchPlay'],
      options: { useNet: true, stakes: { matchPlay: 10 } },
      scores: scoresFrom(hs, { p1, p2 }),
    });
    expect(computeSettlement(r).totals).toEqual({ p1: 10, p2: -10 });
  });
});

describe('four-ball', () => {
  const fourBall = (hcps: [number, number, number, number], options: Partial<GameOptions> = {}) =>
    makeRound({
      players: [
        player('p1', 'A', hcps[0]),
        player('p2', 'B', hcps[1]),
        player('p3', 'C', hcps[2]),
        player('p4', 'D', hcps[3]),
      ],
      games: ['matchPlay'],
      options: {
        useNet: true,
        matchPlay: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
        ...options,
      },
    });

  it('is a four-ball when either side is a team', () => {
    expect(isFourBall({ ids: ['a'], label: '' }, { ids: ['b'], label: '' })).toBe(false);
    expect(isFourBall({ ids: ['a', 'b'], label: '' }, { ids: ['c', 'd'], label: '' })).toBe(true);
  });

  it('applies 90% to the difference from the low player — Appendix C, example 3', () => {
    // 10, 18, 27 and 39: A plays off zero, B gets 7 (90% of 8), C 15 (90% of
    // 17), D 26 (90% of 29).
    expect(strokesOf(fourBall([10, 18, 27, 39]))).toEqual({ p1: 0, p2: 7, p3: 15, p4: 26 });
  });

  it('measures from a plus-handicap low man — Appendix C/3', () => {
    // +4, 16, 7 and 26: B gets 18 (90% of 20), C 10 (90% of 11), D 27 (90% of 30).
    expect(strokesOf(fourBall([-4, 16, 7, 26]))).toEqual({ p1: 0, p2: 18, p3: 10, p4: 27 });
  });

  it('defaults a four-ball to 90% and a singles match to 100%', () => {
    expect(matchAllowanceFor(fourBall([10, 18, 27, 39]), 'matchPlay', true)).toBe(90);
    expect(matchAllowanceFor(duel(6, 10), 'matchPlay', false)).toBe(100);
    expect(matchAllowanceFor(duel(6, 10), 'nassau', true)).toBe(90);
  });

  it('uses an allowance chosen in Setup instead of the default, never on top of it', () => {
    // Chosen 90% is the same answer as the default — applied once.
    expect(strokesOf(fourBall([10, 18, 27, 39], { allowanceByGame: { matchPlay: 90 } }))).toEqual({
      p1: 0, p2: 7, p3: 15, p4: 26,
    });
    // Chosen 100% is the full difference.
    expect(strokesOf(fourBall([10, 18, 27, 39], { allowanceByGame: { matchPlay: 100 } }))).toEqual({
      p1: 0, p2: 8, p3: 17, p4: 29,
    });
    // And a singles match cut to 90% is 90% of its difference.
    expect(strokesOf(duel(10, 18, 18, undefined, { allowanceByGame: { matchPlay: 90 } }))).toEqual({
      p1: 0, p2: 7,
    });
  });

  it('decides a best-ball hole on those strokes', () => {
    // A (0 shots) and D (26: two on indexes 1–8) against B (7) and C (15).
    // Everyone pars the 1st: D nets 2, the best ball on either side, A & D win.
    const hs = holes(18);
    const r = makeRound({
      holes: hs,
      players: [
        player('p1', 'A', 10),
        player('p2', 'B', 18),
        player('p3', 'C', 27),
        player('p4', 'D', 39),
      ],
      games: ['matchPlay'],
      options: {
        useNet: true,
        matchPlay: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
      },
      scores: scoresFrom(hs, { p1: pars(18), p2: pars(18), p3: pars(18), p4: pars(18) }),
    });
    const { a, b } = resolveSides(r, r.options.matchPlay);
    expect(matchSegmentSides(r, [r.holes[0]], a, b).margin).toBe(1);
    // On the 9th (index 9) only C and D have a shot, one each: halved.
    expect(matchSegmentSides(r, [r.holes[8]], a, b).margin).toBe(0);
  });
});

describe('Nassau plays off the same strokes', () => {
  // Nine holes, Al 6 against Bo 10, pressing automatically. Al pars
  // everything; Bo bogeys the 1st to 4th (his shot holes: halved) and the 7th
  // and 8th, and pars the rest.
  const nassau = () => {
    const hs = holes(9);
    const p2 = pars(9);
    for (const i of [0, 1, 2, 3, 6, 7]) p2[i] = 5;
    return makeRound({
      holes: hs,
      players: [player('p1', 'Al', 6), player('p2', 'Bo', 10)],
      games: ['nassau'],
      options: {
        useNet: true,
        autoPress: true,
        nassau: { mode: '1v1', teamA: ['p1'], teamB: ['p2'] },
      },
      scores: scoresFrom(hs, { p1: pars(9), p2 }),
    });
  };

  it('gives the 10 four shots on indexes 1–4', () => {
    expect(strokesOf(nassau(), 'nassau')).toEqual({ p1: 0, p2: 4 });
    expect(shotsByHole(nassau(), 'p2', 'nassau')).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0]);
  });

  it('decides a press off the difference', () => {
    // Off full handicaps Bo had a shot on the 7th and 8th and both were
    // halved: nothing pressed. Off the difference Al wins both, Bo is two
    // down after the 8th, and a press starts on the 9th.
    expect(autoPressStarts(nassau())).toEqual([9]);
    expect(computeNassau(nassau()).standings.map((s) => s.label)).toEqual(['Total', 'Press 9–9']);
  });

  it('names the shots on the board', () => {
    expect(computeNassau(nassau()).note).toBe('Al vs Bo · Bo gets 4 shots');
  });

  it('keeps the plain matchup when nobody gets a shot', () => {
    const r = makeRound({ holes: holes(18), games: ['nassau'] });
    const { a, b } = nassauTeams(r);
    expect(computeNassau(r).note).toBe(`${a.label} vs ${b.label}`);
  });
});

describe('the board names who gets shots', () => {
  it('for a singles match', () => {
    expect(computeMatchPlay(duel(6, 10)).note).toBe('Bo gets 4 shots');
    expect(computeMatchPlay(duel(10, 6)).note).toBe('Al gets 4 shots');
    expect(computeMatchPlay(duel(9, 10)).note).toBe('Bo gets 1 shot');
  });

  it('for a four-ball, after the matchup', () => {
    const r = makeRound({
      players: [
        player('p1', 'A', 10),
        player('p2', 'B', 18),
        player('p3', 'C', 27),
        player('p4', 'D', 39),
      ],
      games: ['matchPlay'],
      options: {
        useNet: true,
        matchPlay: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
      },
    });
    expect(computeMatchPlay(r).note).toBe('A & D vs B & C · B gets 7 shots, C 15, D 26');
  });

  it('says nothing when nobody gets one', () => {
    expect(computeMatchPlay(duel(8, 8)).note).toBeUndefined();
    expect(computeMatchPlay(duel(6, 10, 18, undefined, { useNet: false })).note).toBeUndefined();
    expect(matchStrokesNote(duel(8, 8), {})).toBeUndefined();
  });
});
