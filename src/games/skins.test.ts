import { describe, it, expect } from 'vitest';
import { computeSkins } from './skins';
import { makeRound, holes, player, scoresFrom } from './testFixtures';

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
   * The pot carries to a hole that does not exist, so those skins are won by
   * nobody — and the settlement already agrees, because it pays out of
   * `value`, which only counts skins actually taken. It was the sentence that
   * lied: a finished round's Results screen said "2 on the line next hole"
   * under a card with no next hole anywhere near it.
   */
  /**
   * A tie on the last hole of the round.
   *
   * The pot has no hole left to carry to, so it goes back to the players who
   * tied for it — what a group does standing on the last green rather than let
   * the money evaporate. It used to vanish, and the card said "2 on the line
   * next hole" on a finished round's Results screen to explain it.
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

    it('splits the pot between the players who tied for it', () => {
      // Al wins hole 1; holes 2 and 3 tie, so 2 skins ride on a fourth hole
      // that does not exist. One each — as money, not as skins.
      const r = scoredOut();
      const al = r.standings.find((s) => s.playerId === 'p1');
      const bo = r.standings.find((s) => s.playerId === 'p2');
      expect(al?.settleValue).toBe(2);
      expect(bo?.settleValue).toBe(1);
    });

    it('leaves the count as holes won outright', () => {
      // The half the old behaviour got right: Al won one hole, Bo won none,
      // and a share of a dead pot is not a hole won by anybody.
      const r = scoredOut();
      const v = byId(r);
      expect(v.p1).toBe(1);
      expect(v.p2).toBe(0);
      expect(r.standings.find((s) => s.playerId === 'p2')?.detail).toBe('0 skins');
    });

    it('says who split it, and what', () => {
      const r = scoredOut();
      expect(r.status).toBe('Split the last 2 skins');
      expect(r.note).toBe('Al and Bo split the last 2 skins');
    });

    it('splits on a round finished with holes left unplayed', () => {
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 4, undefined],
        p2: [4, 4, undefined],
      });
      const r = computeSkins(
        makeRound({ holes: hs, games: ['skins'], scores, status: 'finished' })
      );
      expect(r.standings.find((s) => s.playerId === 'p1')?.settleValue).toBe(1.5);
      expect(r.standings.find((s) => s.playerId === 'p2')?.settleValue).toBe(0.5);
      expect(r.note).toBe('Al and Bo split the last skin');
    });

    it('pays nobody a share while the pot is still live', () => {
      // Mid-round the carry belongs to whoever wins the next hole, so nothing
      // may reach the settlement yet — the count was already whole, so
      // `settleValue` is the only thing that could leak it.
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 3, undefined],
        p2: [4, 3, undefined],
        p3: [4, 4, undefined],
      });
      const r = computeSkins(
        makeRound({
          holes: hs,
          players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
          games: ['skins'],
          scores,
        })
      );
      expect(r.note).toBe('1 on the line next hole');
      expect(r.standings.every((x) => x.settleValue === undefined)).toBe(true);
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
      expect(byId(r).p1).toBe(1);
    });

    it('keeps the exact share when the pot will not divide evenly', () => {
      // Two skins between three: the card rounds, the value does not, because
      // the settlement multiplies it by the stake.
      const hs = holes(3);
      const scores = scoresFrom(hs, {
        p1: [3, 4, 4],
        p2: [4, 4, 4],
        p3: [4, 4, 4],
      });
      const r = computeSkins(
        makeRound({
          holes: hs,
          players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
          games: ['skins'],
          scores,
        })
      );
      const settle = (id: string) => r.standings.find((s) => s.playerId === id)?.settleValue ?? 0;
      expect(settle('p2')).toBeCloseTo(2 / 3, 10);
      expect(settle('p1') + settle('p2') + settle('p3')).toBeCloseTo(3, 10);
      // Whole on the card, exact underneath.
      expect(r.standings.find((s) => s.playerId === 'p2')?.detail).toBe('0 skins');
      expect(r.note).toBe('Al, Bo and Cy split the last 2 skins');
    });

    it('leaves an all-halved round reading as nobody won anything', () => {
      // The case that decided the model: every hole tied, so the pot is split
      // and the money is a wash — but the card must not claim either of them
      // won half a skin, and the season stats must not record it.
      const hs = holes(4);
      const scores = scoresFrom(hs, { p1: [4, 4, 4, 4], p2: [4, 4, 4, 4] });
      const r = computeSkins(makeRound({ holes: hs, games: ['skins'], scores }));
      const v = byId(r);
      expect(v.p1).toBe(0);
      expect(v.p2).toBe(0);
      expect(r.standings.every((s) => s.detail === '0 skins')).toBe(true);
      expect(r.note).toBe('Al and Bo split the last 4 skins');
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
