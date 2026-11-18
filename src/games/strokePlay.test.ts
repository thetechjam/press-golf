import { describe, it, expect } from 'vitest';
import { computeStrokePlay, strokePlayMoney } from './strokePlay';
import { computeSettlement } from './settlement';
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

describe('computeStrokePlay — ties, nines, gross and net, skipped holes', () => {
  const three = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];

  it('shares a rank on a tie for low', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: three,
        holes: hs,
        games: ['strokePlay'],
        scores: scoresFrom(hs, { p1: Array(9).fill(4), p2: Array(9).fill(4), p3: Array(9).fill(5) }),
      })
    );
    expect(r.standings.map((s) => [s.playerId, s.rank])).toEqual([
      ['p1', 1],
      ['p2', 1],
      ['p3', 3],
    ]);
  });

  it('is all square with no leader when everyone is level', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        holes: hs,
        games: ['strokePlay'],
        scores: scoresFrom(hs, { p1: Array(9).fill(4), p2: Array(9).fill(4) }),
      })
    );
    expect(r.status).toBe('All square');
    expect(r.standings.map((s) => s.rank)).toEqual([1, 1]);
    expect(r.standings.some((s) => s.isLeader)).toBe(false);
  });

  it('plays a nine as a nine: an 18 handicap is two strokes a hole', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 18)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true },
        scores: scoresFrom(hs, { p1: Array(9).fill(6) }),
      })
    );
    expect(r.standings[0].value).toBe(36);
    expect(r.standings[0].detail).toBe('36 net (54)');
  });

  it('allocates a part-handicap down the stroke index', () => {
    // Four strokes on a nine land on the four hardest holes and nowhere else.
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 4)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true },
        scores: scoresFrom(hs, { p1: Array(9).fill(5) }),
      })
    );
    expect(r.standings[0].value).toBe(41);
  });

  it('gives a plus handicap its strokes back from the easy end', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', -2)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true },
        scores: scoresFrom(hs, { p1: Array(9).fill(4) }),
      })
    );
    expect(r.standings[0].value).toBe(38);
    expect(r.standings[0].detail).toBe('38 net (36)');
  });

  it("cuts the handicap by the game's allowance", () => {
    const hs = holes(18);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 10)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true, allowanceByGame: { strokePlay: 50 } },
        scores: scoresFrom(hs, { p1: Array(18).fill(5) }),
      })
    );
    // Ten at 50% is five strokes, on stroke indexes 1–5.
    expect(r.standings[0].value).toBe(85);
  });

  it('scores gross when this game is switched to gross on a net round', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 9)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true, netByGame: { strokePlay: false } },
        scores: scoresFrom(hs, { p1: Array(9).fill(5) }),
      })
    );
    expect(r.standings[0].value).toBe(45);
    expect(r.standings[0].detail).toBe('45');
    expect(r.title).toBe('Stroke Play');
  });

  it('scores net when only this game is switched to net', () => {
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 9)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: false, netByGame: { strokePlay: true } },
        scores: scoresFrom(hs, { p1: Array(9).fill(5) }),
      })
    );
    expect(r.standings[0].value).toBe(36);
    expect(r.title).toBe('Stroke Play (Net)');
  });

  it('totals only the holes each player scored, and a finished short card cannot lead', () => {
    // This used to pin a short card leading as an open question. The owner
    // has ruled: while the round is in progress a blank is a hole not played
    // yet, so the card leads on the holes it has; once the round is finished
    // a card with a blank is short, disqualified, and ranked below the
    // complete cards however low its total.
    const hs = holes(9);
    const round = makeRound({
      holes: hs,
      games: ['strokePlay'],
      scores: scoresFrom(hs, {
        p1: [4, 4, undefined, 4, 4, 4, 4, 4, 4],
        p2: Array(9).fill(4),
      }),
    });
    const r = computeStrokePlay(round);
    expect(r.standings.find((s) => s.playerId === 'p1')?.value).toBe(32);
    expect(r.standings.find((s) => s.playerId === 'p2')?.value).toBe(36);
    expect(r.status).toBe('Al leads · 32');

    const done = computeStrokePlay({ ...round, status: 'finished' });
    expect(done.status).toBe('Bo leads · 36');
    expect(done.standings.map((s) => [s.label, s.rank, s.isLeader, s.detail])).toEqual([
      ['Bo', 1, true, '36'],
      ['Al', 2, false, '32 · 1 hole missing'],
    ]);
  });

  it('takes strokes only on the scored holes when some are skipped', () => {
    // Four strokes on a nine sit on indexes 1–4. Holes 1, 2 and 5 scored:
    // two of those strokes apply, the ones on 3 and 4 do not.
    const hs = holes(9);
    const r = computeStrokePlay(
      makeRound({
        players: [player('p1', 'Al', 4)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true },
        scores: scoresFrom(hs, { p1: [5, 5, undefined, undefined, 5] }),
      })
    );
    expect(r.standings[0].value).toBe(13);
    expect(r.standings[0].detail).toBe('13 net (15)');
  });
});

describe('strokePlayMoney', () => {
  const three = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];
  const roundOf = (byPlayer: Record<string, (number | undefined)[]>, options = {}) => {
    const hs = holes(9);
    return makeRound({
      players: three,
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 }, ...options },
      scores: scoresFrom(hs, byPlayer),
    });
  };

  it('low round takes the stake from every other card', () => {
    const round = roundOf({ p1: Array(9).fill(4), p2: Array(9).fill(5), p3: Array(9).fill(6) });
    expect(strokePlayMoney(round, 5)).toEqual({ p1: 10, p2: -5, p3: -5 });
  });

  it('a tie for low splits the pot', () => {
    const round = roundOf({ p1: Array(9).fill(4), p2: Array(9).fill(4), p3: Array(9).fill(6) });
    expect(strokePlayMoney(round, 5)).toEqual({ p1: 2.5, p2: 2.5, p3: -5 });
  });

  it('leaves a player with no card out of it', () => {
    const round = roundOf({ p1: Array(9).fill(4), p2: Array(9).fill(5) });
    expect(strokePlayMoney(round, 5)).toEqual({ p1: 5, p2: -5, p3: 0 });
  });

  it('moves nothing with one card posted', () => {
    const round = roundOf({ p1: Array(9).fill(4) });
    expect(strokePlayMoney(round, 5)).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('is paid out net when the game is net', () => {
    // Gross they are level; Al's nine strokes decide it.
    const hs = holes(9);
    const round = makeRound({
      players: [player('p1', 'Al', 9), player('p2', 'Bo', 0)],
      holes: hs,
      games: ['strokePlay'],
      options: { useNet: true, stakes: { strokePlay: 5 } },
      scores: scoresFrom(hs, { p1: Array(9).fill(5), p2: Array(9).fill(5) }),
    });
    expect(strokePlayMoney(round, 5)).toEqual({ p1: 5, p2: -5 });
    expect(strokePlayMoney({ ...round, options: { ...round.options, useNet: false } }, 5)).toEqual({
      p1: 0,
      p2: 0,
    });
  });

  describe('a short card on a finished round', () => {
    // The owner's rule: once the round is finished, only a complete card can
    // win or share the pot. A short card still pays as a card that lost.
    const finished = (byPlayer: Record<string, (number | undefined)[]>, options = {}) => ({
      ...roundOf(byPlayer, options),
      status: 'finished' as const,
    });
    const sum = (net: Record<string, number>) => Object.values(net).reduce((a, b) => a + b, 0);

    it('cannot win gross, and pays the low complete card', () => {
      // Al skipped a hole: 32 over eight beats Bo's 36 over nine on paper.
      const byPlayer = {
        p1: [4, 4, undefined, 4, 4, 4, 4, 4, 4],
        p2: Array(9).fill(4),
        p3: Array(9).fill(5),
      };
      expect(strokePlayMoney(roundOf(byPlayer), 5)).toEqual({ p1: 10, p2: -5, p3: -5 });
      const net = strokePlayMoney(finished(byPlayer), 5);
      expect(net).toEqual({ p1: -5, p2: 10, p3: -5 });
      expect(sum(net)).toBe(0);
      const r = computeStrokePlay(finished(byPlayer));
      expect(r.standings.map((s) => s.label)).toEqual(['Bo', 'Cy', 'Al']);
      expect(r.standings[2].detail).toBe('32 · 1 hole missing');
      expect(r.standings[2].isLeader).toBe(false);
    });

    it('cannot win net either', () => {
      const hs = holes(9);
      const round = makeRound({
        players: [player('p1', 'Al', 9), player('p2', 'Bo', 0)],
        holes: hs,
        games: ['strokePlay'],
        options: { useNet: true, stakes: { strokePlay: 5 } },
        scores: scoresFrom(hs, {
          p1: [5, 5, 5, 5, 5, 5, 5, undefined, undefined],
          p2: Array(9).fill(4),
        }),
        status: 'finished',
      });
      // Al is 35 − 7 = 28 net over seven holes against Bo's 36.
      expect(strokePlayMoney(round, 5)).toEqual({ p1: -5, p2: 5 });
      const r = computeStrokePlay(round);
      expect(r.status).toBe('Bo leads · 36 net (36)');
      expect(r.standings[1].detail).toBe('28 net (35) · 2 holes missing');
    });

    it('splits the pot between tied complete cards, the short card paying', () => {
      const net = strokePlayMoney(
        finished({ p1: Array(9).fill(4), p2: Array(9).fill(4), p3: Array(8).fill(3) }),
        5
      );
      expect(net).toEqual({ p1: 2.5, p2: 2.5, p3: -5 });
      expect(sum(net)).toBe(0);
    });

    it('pays nobody when every card is short', () => {
      const byPlayer = {
        p1: [4, 4, undefined, 4, 4, 4, 4, 4, 4],
        p2: [5, 5, 5, 5, 5, 5, 5, 5, undefined],
      };
      expect(strokePlayMoney(finished(byPlayer), 5)).toEqual({ p1: 0, p2: 0, p3: 0 });
      const r = computeStrokePlay(finished(byPlayer));
      expect(r.status).toBe('No complete card');
      expect(r.standings.every((s) => !s.isLeader)).toBe(true);
      expect(computeSettlement(finished(byPlayer)).transactions).toEqual([]);
    });

    it('leaves the money with the complete card through settlement', () => {
      const s = computeSettlement(
        finished({ p1: Array(8).fill(3), p2: Array(9).fill(4), p3: Array(9).fill(5) })
      );
      expect(s.totals).toEqual({ p1: -5, p2: 10, p3: -5 });
    });
  });

  it('settles as one payment from each loser to the winner', () => {
    const round = roundOf({ p1: Array(9).fill(4), p2: Array(9).fill(5), p3: Array(9).fill(6) });
    const s = computeSettlement(round);
    expect(s.totals).toEqual({ p1: 10, p2: -5, p3: -5 });
    expect(s.transactions).toEqual([
      { from: 'Bo', to: 'Al', amount: 5 },
      { from: 'Cy', to: 'Al', amount: 5 },
    ]);
  });
});
