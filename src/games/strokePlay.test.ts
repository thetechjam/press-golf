import { describe, it, expect } from 'vitest';
import { computeStrokePlay } from './strokePlay';
import { makeRound, player, holes, scoresFrom } from './testFixtures';

describe('computeStrokePlay', () => {
  it('reports no scores yet before any hole is entered', () => {
    const r = computeStrokePlay(makeRound({ games: ['strokePlay'] }));
    expect(r.status).toBe('No scores yet');
  });

  it('ranks by gross total, lowest first', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4), // 36
      p2: Array(9).fill(4).map((v, i) => (i === 0 ? 6 : v)), // 38
    });
    const r = computeStrokePlay(
      makeRound({ holes: hs, games: ['strokePlay'], scores })
    );
    expect(r.standings[0].playerId).toBe('p1');
    expect(r.standings[0].value).toBe(36);
    expect(r.standings[1].value).toBe(38);
    expect(r.title).toBe('Stroke Play');
  });

  it('applies net scoring and reports net (gross) in the detail', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, { p1: Array(9).fill(5) }); // gross 45
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 9)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true },
        scores,
      })
    );
    // Handicap 9 over 9 holes → 9 strokes → net 36.
    expect(r.standings[0].value).toBe(36);
    expect(r.standings[0].detail).toBe('36 net (45)');
    expect(r.title).toBe('Stroke Play (Net)');
  });

  it('only totals holes that have a score', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, { p1: [4, 4, 4, undefined, undefined, undefined, undefined, undefined, undefined] });
    const r = computeStrokePlay(
      makeRound({ players: [player('p1', 'Al')], holes: hs, games: ['strokePlay'], scores })
    );
    expect(r.standings[0].value).toBe(12);
  });
});
