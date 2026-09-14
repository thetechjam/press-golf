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

  it('reports a carryover while there is still a hole to carry it to', () => {
    const hs = holes(3);
    const scores = scoresFrom(hs, {
      p1: [3, 4, undefined],
      p2: [4, 4, undefined],
    });
    const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
    // Hole 1: Al wins 1 skin. Hole 2: tie → 1 carried, and hole 3 is unplayed.
    expect(r.status).toContain('carried over');
    expect(r.note).toBe('1 on the line next hole');
  });

  /**
   * A tie on the last hole of the round.
   *
   * The pot has no hole left to carry to, so those skins are won by nobody and
   * paid for by nobody — they die. The standings and the settlement both stay
   * silent about it, which is correct and is also why the note has to say it:
   * a card reading "2 on the line next hole" on a finished round's Results
   * screen was the bug, and saying nothing at all would only be quieter.
   */
  describe('a carry with nowhere to go', () => {
    const scoredOut = (extra: Partial<Parameters<typeof makeRound>[0]> = {}) => {
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 4, 4],
        p2: [4, 4, 4],
      });
      return computeSkins(makeRound({ holes: hs, games: ['skins'], scores, ...extra }));
    };

    it('says how many died and which hole they died on', () => {
      // Al wins hole 1; holes 2 and 3 tie, so 2 skins ride on a fourth hole
      // that does not exist.
      const r = scoredOut();
      expect(r.status).toBe('2 skins died');
      expect(r.note).toBe('2 skins died on the 3rd — nobody won them');
    });

    it('leaves nobody holding them', () => {
      const v = byId(scoredOut());
      expect(v.p1).toBe(1);
      expect(v.p2).toBe(0);
    });

    it('says the same on a round finished with holes left unplayed', () => {
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 4, undefined],
        p2: [4, 4, undefined],
      });
      const r = computeSkins(
        makeRound({ holes: hs, games: ['skins'], scores, status: 'finished' })
      );
      // Singular, and named for the last hole actually played rather than the
      // last hole on the card.
      expect(r.status).toBe('1 skin died');
      expect(r.note).toBe('1 skin died on the 2nd — nobody won it');
    });

    it('never promises a next hole once the round is over', () => {
      expect(scoredOut({ status: 'finished' }).note).not.toContain('next hole');
    });

    it('stays live while a hole is only half scored', () => {
      // Hole 3 has one score on it, which the scoring loop skips over — so the
      // hole is still to be played, and the carry is still going somewhere.
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 4, 5],
        p2: [4, 4, undefined],
      });
      const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
      expect(r.note).toBe('1 on the line next hole');
    });

    it('counts an all-halved round as nobody winning anything', () => {
      const hs = holes(4);
      const scores = scoresFrom(hs, { p1: [4, 4, 4, 4], p2: [4, 4, 4, 4] });
      const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
      const v = byId(r);
      expect(v.p1).toBe(0);
      expect(v.p2).toBe(0);
      expect(r.note).toBe('4 skins died on the 4th — nobody won them');
    });
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
