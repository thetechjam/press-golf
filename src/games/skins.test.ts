import { describe, it, expect } from 'vitest';
import { computeSkins } from './skins';
import { makeRound, holes, scoresFrom } from './testFixtures';

function byId(r: ReturnType<typeof computeSkins>) {
  const m: Record<string, number> = {};
  r.standings.forEach((s) => {
    if (s.playerId) m[s.playerId] = s.value;
  });
  return m;
}

describe('computeSkins', () => {
  it('awards one skin for an outright hole win', () => {
    const hs = holes(3);
    const scores = scoresFrom(hs, {
      p1: [3, 4, 4],
      p2: [4, 4, 4],
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    const v = byId(r);
    expect(v.p1).toBe(1);
    expect(v.p2).toBe(0);
  });

  it('carries a tied hole over to the next winner', () => {
    // Hole 1 tied, hole 2 Al wins → Al takes 2 skins (carry + current).
    const hs = holes(3);
    const scores = scoresFrom(hs, {
      p1: [4, 3, 4],
      p2: [4, 4, 4],
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    const v = byId(r);
    expect(v.p1).toBe(2);
    expect(v.p2).toBe(0);
  });

  it('reports carryover in the status/note when the last hole ties', () => {
    const hs = holes(2);
    const scores = scoresFrom(hs, {
      p1: [3, 4],
      p2: [4, 4],
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    // Hole 1: Al wins 1 skin. Hole 2: tie → 1 carried.
    expect(r.status).toContain('carried over');
    expect(r.note).toContain('on the line');
  });

  it('only scores a hole once every player has a score', () => {
    const hs = holes(2);
    const scores = scoresFrom(hs, {
      p1: [3, 3],
      p2: [4, undefined], // hole 2 incomplete
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    const v = byId(r);
    // Only hole 1 counts → Al 1 skin.
    expect(v.p1).toBe(1);
    expect(r.status).toContain('won the last skin');
  });

  it('reports no holes completed when nothing is scored', () => {
    const hs = holes(3);
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'] }));
    expect(r.status).toBe('No holes completed');
  });

  it('accumulates a multi-hole carry onto the eventual winner', () => {
    // Holes 1,2,3 all tie; hole 4 Bo wins → Bo takes 4 skins.
    const hs = holes(4);
    const scores = scoresFrom(hs, {
      p1: [4, 4, 4, 5],
      p2: [4, 4, 4, 3],
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    const v = byId(r);
    expect(v.p2).toBe(4);
    expect(v.p1).toBe(0);
  });
});
