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

describe('net stroke play mid-round', () => {
  // An 18-handicap through nine was shown nine shots clear of a scratch player
  // level with them, because the whole round's strokes came off half a card.
  it('takes off only the strokes on the holes scored so far', () => {
    const hs = holes(18);
    const r = makeRound({
      holes: hs,
      players: [player('p1', 'Al', 18), player('p2', 'Bo', 0)],
      games: ['strokePlay'],
      options: { useNet: true },
      scores: scoresFrom(hs, { p1: Array(9).fill(5), p2: Array(9).fill(4) }),
    });
    const res = computeStrokePlay(r);
    const al = res.standings.find((s) => s.playerId === 'p1')!;
    const bo = res.standings.find((s) => s.playerId === 'p2')!;
    expect(al.value).toBe(45 - 9);
    expect(bo.value).toBe(36);
    expect(res.status).toBe('All square');
  });
});

describe('a player with no scores yet', () => {
  it('is ranked last rather than leading on a total of 0', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al'), player('p2', 'Bo')],
        holes: hs,
        games: ['strokePlay'],
        scores: scoresFrom(hs, { p1: [4] }),
      })
    );
    expect(r.standings[0]).toMatchObject({ playerId: 'p1', rank: 1 });
    expect(r.standings[1]).toMatchObject({ playerId: 'p2', rank: 2, isLeader: false, detail: '—' });
    expect(r.status).not.toMatch(/Bo/);
  });
});
