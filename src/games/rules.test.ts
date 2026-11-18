import { describe, it, expect } from 'vitest';
import { GAME_RULES } from './rules';
import { computeStableford } from './stableford';
import { makeRound, player, holes, scoresFrom } from './testFixtures';

/** Points one hole of `score` on a par 4 earns, in the given mode. */
const points = (score: number, mode: 'standard' | 'modified') => {
  const hs = holes(1);
  const round = makeRound({
    holes: hs,
    players: [player('p1', 'Al')],
    games: ['stableford'],
    options: { stablefordMode: mode },
    scores: scoresFrom(hs, { p1: [score] }),
  });
  return computeStableford(round).standings[0].value;
};

describe('the Stableford rules text', () => {
  // Read off the text itself, so the help and the engine cannot drift apart again.
  const said = (re: RegExp) =>
    Number((GAME_RULES.stableford.match(re)?.[1] ?? 'NaN').replace('−', '-'));

  it('gives the standard scale the engine scores', () => {
    expect(said(/double bogey or worse (\d+), bogey/)).toBe(points(6, 'standard'));
    expect(said(/, bogey (\d+), par/)).toBe(points(5, 'standard'));
    expect(said(/, par (\d+), birdie/)).toBe(points(4, 'standard'));
    expect(said(/, birdie (\d+), eagle/)).toBe(points(3, 'standard'));
    expect(said(/, eagle (\d+), and/)).toBe(points(2, 'standard'));
  });

  it('gives the modified scale the engine scores', () => {
    expect(said(/albatross (−?\d+)/)).toBe(points(1, 'modified'));
    expect(said(/albatross \d+, eagle (−?\d+)/)).toBe(points(2, 'modified'));
    expect(said(/eagle 5, birdie (−?\d+)/)).toBe(points(3, 'modified'));
    expect(said(/birdie 2, par (−?\d+)/)).toBe(points(4, 'modified'));
    expect(said(/par 0, bogey (−?\d+)/)).toBe(points(5, 'modified'));
    expect(said(/bogey −1, double bogey or worse (−?\d+)/)).toBe(points(6, 'modified'));
  });

  it('quotes the same scale as the Quota rule', () => {
    expect(GAME_RULES.quota).toContain('bogey 1, par 2, birdie 3, eagle 4');
    expect(GAME_RULES.stableford).toContain('bogey 1, par 2, birdie 3, eagle 4');
  });
});
