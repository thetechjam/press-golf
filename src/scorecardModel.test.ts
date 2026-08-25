import { describe, it, expect } from 'vitest';
import { buildScorecard, formatToPar } from './scorecardModel';
import { makeRound, player, holes, holes18, scoresFrom } from './games/testFixtures';
import type { LeagueSetup } from './types';

const FOUR = [
  player('p1', 'Al', 9),
  player('p2', 'Bo', 4),
  player('p3', 'Cy', 12),
  player('p4', 'Di', 2),
];

function league(pointsPerMatch = 2): LeagueSetup {
  return {
    teams: [
      { name: 'Team 1', aId: 'p1', bId: 'p2' },
      { name: 'Team 2', aId: 'p3', bId: 'p4' },
    ],
    pointsPerMatch,
  };
}

describe('buildScorecard — stroke index row', () => {
  it('uses the real course stroke indexes when every hole has one', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5, strokeIndex: 1 },
        { number: 3, par: 3, strokeIndex: 15 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([7, 1, 15]);
  });

  it('falls back to sequential indexing by hole number when none are provided', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 5 },
        { number: 3, par: 3 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([1, 2, 3]);
  });

  it('falls back when only some holes have a stroke index', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5 },
        { number: 3, par: 3, strokeIndex: 15 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([1, 2, 3]);
  });

  it('keeps play order, not hole-number order, for a rotated start', () => {
    const round = makeRound({
      holes: [
        { number: 3, par: 4, strokeIndex: 15 },
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5, strokeIndex: 1 },
      ],
    });
    const model = buildScorecard(round);
    expect(model.holes.map((h) => h.number)).toEqual([3, 1, 2]);
    expect(model.holes.map((h) => h.strokeIndex)).toEqual([15, 7, 1]);
  });

  it('pairs the fallback index with the right hole when play order is rotated', () => {
    const round = makeRound({
      holes: [
        { number: 3, par: 4 },
        { number: 1, par: 4 },
        { number: 2, par: 5 },
      ],
    });
    const model = buildScorecard(round);
    expect(model.holes.map((h) => h.number)).toEqual([3, 1, 2]);
    // strokeIndexMap ranks by ascending hole number, so hole 3 ranks 3rd.
    expect(model.holes.map((h) => h.strokeIndex)).toEqual([3, 1, 2]);
  });
});

describe('buildScorecard — stroke markers', () => {
  it('gives dots and no chips on a net non-league round', () => {
    const hs = holes(9);
    const round = makeRound({
      players: [player('p1', 'Al', 9)],
      holes: hs,
      options: { useNet: true },
    });
    const row = buildScorecard(round).rows[0];
    expect(row.cells.map((c) => c.dots)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(row.cells.every((c) => c.chips.length === 0)).toBe(true);
  });

  it('gives no markers on a gross round', () => {
    const round = makeRound({
      players: [player('p1', 'Al', 9)],
      holes: holes(9),
      options: { useNet: false },
    });
    const row = buildScorecard(round).rows[0];
    expect(row.cells.every((c) => c.dots === 0 && c.chips.length === 0)).toBe(true);
  });

  // Regression guard: league rounds ship useNet: false but still score net.
  // Gating markers on useNet showed a league round zero stroke allocation.
  it('gives chips on a league round despite useNet being false', () => {
    const hs = holes(9);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
    });
    expect(round.options.useNet).toBe(false);
    const model = buildScorecard(round);
    const cy = model.rows.find((r) => r.playerId === 'p3')!;
    expect(cy.cells.some((c) => c.chips.length > 0)).toBe(true);
    expect(cy.cells.every((c) => c.dots === 0)).toBe(true);
  });

  it('matches leagueStrokesOnHole exactly, hole for hole', async () => {
    const { leagueStrokesOnHole } = await import('./games/league');
    const hs = holes(9);
    const round = makeRound({ players: FOUR, holes: hs, options: { league: league() } });
    const model = buildScorecard(round);
    for (const row of model.rows) {
      hs.forEach((h, i) => {
        expect(row.cells[i].chips).toEqual(leagueStrokesOnHole(round, h)[row.playerId]);
      });
    }
  });
});

describe('buildScorecard — totals and header', () => {
  it('totals gross and to-par over played holes only', () => {
    const hs = holes(9, 4);
    const scores = scoresFrom(hs, { p1: [5, 3, 4, undefined, undefined, undefined, undefined, undefined, undefined] });
    const round = makeRound({ players: [player('p1', 'Al')], holes: hs, scores });
    const row = buildScorecard(round).rows[0];
    expect(row.gross).toBe(12);
    // 3 played holes of par 4 = 12; 12 - 12 = E
    expect(row.toPar).toBe(0);
  });

  it('reports null totals when nothing is scored', () => {
    const round = makeRound({ players: [player('p1', 'Al')], holes: holes(9) });
    const row = buildScorecard(round).rows[0];
    expect(row.gross).toBeNull();
    expect(row.toPar).toBeNull();
  });

  it('sums par across every hole', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 5 },
        { number: 3, par: 3 },
      ],
    });
    expect(buildScorecard(round).parTotal).toBe(12);
  });

  it('marks scores with the golf circle/square convention', () => {
    const hs = holes(3, 4);
    const scores = scoresFrom(hs, { p1: [3, 4, 6] });
    const round = makeRound({ players: [player('p1', 'Al')], holes: hs, scores });
    const cells = buildScorecard(round).rows[0].cells;
    expect(cells[0].markClass).toBe('mark mark-circle');
    expect(cells[1].markClass).toBe('');
    expect(cells[2].markClass).toBe('mark mark-square mark-double');
  });

  it('shows handicaps for net and league rounds, not for gross', () => {
    const net = makeRound({ options: { useNet: true } });
    const lg = makeRound({ players: FOUR, options: { league: league() } });
    const gross = makeRound({ options: { useNet: false } });
    expect(buildScorecard(net).showHandicap).toBe(true);
    expect(buildScorecard(lg).showHandicap).toBe(true);
    expect(buildScorecard(gross).showHandicap).toBe(false);
  });

  it('defaults a missing handicap to 0', () => {
    const round = makeRound({ players: [player('p1', 'Al')], options: { useNet: true } });
    expect(buildScorecard(round).rows[0].handicap).toBe(0);
  });
});

describe('formatToPar', () => {
  it('renders even, over, and under', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe('-2');
  });
});

describe('buildScorecard — OUT / IN subtotals', () => {
  const par4s = (nums: number[]) =>
    nums.map((n) => ({ number: n, par: n % 3 === 0 ? 3 : 4, strokeIndex: n }));

  it('emits OUT then IN for a standard 18, each after its own nine', () => {
    const model = buildScorecard(makeRound({ holes: holes18() }));
    expect(model.nines.map((n) => n.label)).toEqual(['OUT', 'IN']);
    expect(model.nines.map((n) => n.afterIndex)).toEqual([8, 17]);
  });

  it('sums par per nine', () => {
    const hs = par4s([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    const model = buildScorecard(makeRound({ holes: hs }));
    const frontPar = hs.slice(0, 9).reduce((s, h) => s + h.par, 0);
    const backPar = hs.slice(9).reduce((s, h) => s + h.par, 0);
    expect(model.nines.map((n) => n.par)).toEqual([frontPar, backPar]);
    expect(frontPar + backPar).toBe(model.parTotal);
  });

  it('totals each nine over played holes only, like gross', () => {
    const hs = holes18();
    // Front nine complete at 5s; back nine only holes 10 and 11 played.
    const card = [5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6];
    const round = makeRound({
      players: [player('p1', 'Al')],
      holes: hs,
      scores: scoresFrom(hs, { p1: card }),
    });
    const row = buildScorecard(round).rows[0];
    expect(row.nineTotals).toEqual([45, 12]);
    expect(row.gross).toBe(57);
  });

  it('reports null for a nine with nothing played', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al')],
      holes: hs,
      scores: scoresFrom(hs, { p1: [4, 4, 4] }),
    });
    const row = buildScorecard(round).rows[0];
    expect(row.nineTotals).toEqual([12, null]);
  });

  it('emits no subtotal column for a nine-hole round', () => {
    // One nine means OUT would just restate TOT.
    const model = buildScorecard(makeRound({ holes: holes(9) }));
    expect(model.nines).toEqual([]);
    expect(model.rows[0].nineTotals).toEqual([]);
  });

  it('emits no subtotal for a back-nine-only round', () => {
    const hs = par4s([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(buildScorecard(makeRound({ holes: hs })).nines).toEqual([]);
  });

  it('follows play order for a rotated start, so IN comes first off the 10th', () => {
    const hs = par4s([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const model = buildScorecard(makeRound({ holes: hs }));
    // Each subtotal must sit next to the nine it sums, not in paper-card order.
    expect(model.nines.map((n) => n.label)).toEqual(['IN', 'OUT']);
    expect(model.nines.map((n) => n.afterIndex)).toEqual([8, 17]);
  });

  it('keeps a rotated start’s nine totals with the right nine', () => {
    const hs = par4s([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const round = makeRound({
      players: [player('p1', 'Al')],
      holes: hs,
      // Nine 6s off the 10th, then nine 4s on the front.
      scores: scoresFrom(hs, { p1: [6, 6, 6, 6, 6, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4] }),
    });
    const row = buildScorecard(round).rows[0];
    expect(row.nineTotals).toEqual([54, 36]);
  });

  it('keeps nineTotals aligned to model.nines for every row', () => {
    const model = buildScorecard(
      makeRound({ holes: holes18(), players: FOUR, scores: {} })
    );
    for (const row of model.rows) {
      expect(row.nineTotals).toHaveLength(model.nines.length);
    }
  });
});
