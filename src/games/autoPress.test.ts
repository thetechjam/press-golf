import { describe, it, expect } from 'vitest';
import { autoPressStarts, nassauSegments } from './nassau';
import { computeSettlement } from './settlement';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { Round, TeamSetup } from '../types';

const DUEL: TeamSetup = { mode: '1v1', teamA: ['p1'], teamB: ['p2'] };

/**
 * A Nassau round over `n` par-4 holes between Al and Bo.
 *
 * Cards are written as arrays of strokes; a 4 is a par and anything higher
 * loses the hole, which is all these tests need to drive a margin.
 */
const nassau = (
  n: number,
  cards: Record<string, (number | null | undefined)[]>,
  options: Partial<Round['options']> = {}
): Round => {
  const hs = holes(n);
  return makeRound({
    holes: hs,
    players: [player('p1', 'Al'), player('p2', 'Bo')],
    games: ['nassau'],
    options: { nassau: DUEL, autoPress: true, ...options },
    scores: scoresFrom(hs, cards),
  });
};

/** Al pars every hole. */
const allPars = (n = 9) => Array.from({ length: n }, () => 4);

/**
 * Bo bogeys the first `k` holes and pars the rest — so Al wins exactly those
 * `k` holes and everything after is halved.
 */
const bogeysFirst = (k: number, n = 9) =>
  Array.from({ length: n }, (_, i) => (i < k ? 5 : 4));

describe('autoPressStarts', () => {
  it('is empty when the option is off', () => {
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(2) }, { autoPress: false });
    expect(autoPressStarts(r)).toEqual([]);
  });

  it('is empty when nobody is two down', () => {
    // Al wins one hole, everything else halved.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(1) });
    expect(autoPressStarts(r)).toEqual([]);
  });

  it('presses from the next hole once a side goes two down', () => {
    // Al wins holes 1 and 2, so Bo is 2 down after the 2nd.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(2) });
    expect(autoPressStarts(r)).toEqual([3]);
  });

  it('presses either way round — a side going two up is a side going two down', () => {
    const r = nassau(9, { p1: bogeysFirst(2), p2: allPars() });
    expect(autoPressStarts(r)).toEqual([3]);
  });

  it('presses once for the bet, however far down it then goes', () => {
    // Al wins the first four: 2 down after two, 4 down after four. One press
    // comes from this bet; the next has to come from the press itself.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(4) });
    expect(autoPressStarts(r)).toContain(3);
    expect(autoPressStarts(r).filter((h) => h === 3)).toHaveLength(1);
  });

  it('lets a press that goes two down press again — the cascade', () => {
    // Al wins 1,2 (press from 3), then 3,4 — the press is 2 down after the
    // 4th, so a second press starts at 5.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(4) });
    expect(autoPressStarts(r)).toEqual([3, 5]);
  });

  it('will not press onto the last hole of a nine', () => {
    // Bo loses holes 8 and 9 only: two down after the 9th, with nothing left.
    const card = [4, 4, 4, 4, 4, 4, 4, 5, 5];
    const r = nassau(9, { p1: allPars(), p2: card });
    expect(autoPressStarts(r)).toEqual([]);
  });

  it('keeps each nine to its own presses', () => {
    // Nothing happens on the front; Al wins 10 and 11 on the back.
    const front = Array(9).fill(4);
    const r = nassau(18, {
      p1: [...front, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      p2: [...front, 5, 5, 4, 4, 4, 4, 4, 4, 4],
    });
    expect(autoPressStarts(r)).toEqual([12]);
  });

  it('stops at the first hole nobody has finished', () => {
    // Hole 2 is blank, so "two down after the 2nd" has no meaning — and the
    // 3rd and 4th must not be read as though the 2nd had been halved.
    const r = nassau(9, {
      p1: [4, undefined, 4, 4, 4, 4, 4, 4, 4],
      p2: [5, undefined, 5, 5, 4, 4, 4, 4, 4],
    });
    expect(autoPressStarts(r)).toEqual([]);
  });

  it('re-decides itself when a score is corrected', () => {
    const down = nassau(9, { p1: allPars(), p2: bogeysFirst(2) });
    expect(autoPressStarts(down)).toEqual([3]);

    // The 2nd hole is corrected to a half: the press was never earned.
    const fixed = {
      ...down,
      scores: { ...down.scores, 2: { p1: 4, p2: 4 } },
    };
    expect(autoPressStarts(fixed)).toEqual([]);
  });

  it('needs two players', () => {
    const hs = holes(9);
    const r = makeRound({
      holes: hs,
      players: [player('p1', 'Al')],
      games: ['nassau'],
      options: { autoPress: true },
      scores: scoresFrom(hs, { p1: allPars() }),
    });
    expect(autoPressStarts(r)).toEqual([]);
  });
});

describe('nassauSegments with auto-press', () => {
  it('adds the automatic press as a real bet', () => {
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(2) });
    const press = nassauSegments(r).filter((s) => s.isPress);
    expect(press).toHaveLength(1);
    expect(press[0].label).toBe('Press 3–9');
    expect(press[0].isAuto).toBe(true);
    expect(press[0].holes.map((h) => h.number)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('marks a hand-called press as not automatic', () => {
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(1) }, { autoPress: false });
    const withPress = { ...r, presses: [4] };
    const press = nassauSegments(withPress).filter((s) => s.isPress);
    expect(press).toHaveLength(1);
    expect(press[0].isAuto).toBe(false);
  });

  it('counts a hole pressed both ways as one bet, not two', () => {
    // The rule fires at 3 and the user had already tapped Press for 3.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(2) });
    const both = { ...r, presses: [3] };
    const press = nassauSegments(both).filter((s) => s.isPress);
    expect(press).toHaveLength(1);
    // Theirs, not the rule's — a bet somebody called stays called.
    expect(press[0].isAuto).toBe(false);
  });

  it('pays the automatic press like any other bet', () => {
    // Al wins holes 1–4 and halves 5–9. Three bets end up on the card:
    //   the nine itself  — Al 4 up, won          → +$5
    //   press 3–9        — Al wins 3 and 4, 2 up → +$5
    //   press 5–9        — every hole halved     →  $0
    // The second press is the cascade landing exactly where the scoring
    // stopped, which is the honest outcome: a press is a fresh bet, not a
    // bonus, and it pays nothing if nothing happens after it starts.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(4) });
    const staked = { ...r, options: { ...r.options, stakes: { nassau: 5 } } };
    const off = { ...staked, options: { ...staked.options, autoPress: false } };

    expect(computeSettlement(off).totals.p1).toBe(5);
    expect(computeSettlement(staked).totals.p1).toBe(10);
    expect(computeSettlement(staked).totals.p2).toBe(-10);
  });

  it('doubles the damage when the press is also lost', () => {
    // Al wins 1–6 and halves the rest: the nine, press 3–9 and press 5–9 are
    // all won, so the same card costs Bo three bets instead of one.
    const r = nassau(9, { p1: allPars(), p2: bogeysFirst(6) });
    const staked = { ...r, options: { ...r.options, stakes: { nassau: 5 } } };
    expect(computeSettlement(staked).totals.p1).toBe(15);
  });
});
