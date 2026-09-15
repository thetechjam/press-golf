import { describe, it, expect } from 'vitest';
import { computeSettlement, formatMoney, unitFor, type Transaction } from './settlement';
import { makeRound, player, holes, holes18, scoresFrom } from './testFixtures';
import type { GameType, Round } from '../types';

/** Sum of all net balances must always be zero (money is conserved). */
function assertZeroSum(totals: Record<string, number>) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  expect(Math.abs(sum)).toBeLessThan(1e-9);
}

/** Verifies that applying the transaction list zeroes out every balance. */
function assertTransactionsSettle(
  totals: Record<string, number>,
  nameById: Record<string, string>,
  tx: Transaction[]
) {
  // Work in name-space since transactions carry names.
  const bal: Record<string, number> = {};
  for (const [id, v] of Object.entries(totals)) bal[nameById[id]] = v;
  for (const t of tx) {
    bal[t.from] += t.amount; // debtor pays, balance rises toward 0
    bal[t.to] -= t.amount; // creditor receives, balance falls toward 0
  }
  // Sub-cent, not sub-dollar. This was a whole cent of slack, which is exactly
  // the size of the error it was there to catch: three players splitting a $5
  // stake were handed $1.67 each against a $5 debt and this still passed.
  for (const v of Object.values(bal)) expect(Math.abs(v)).toBeLessThan(1e-9);
}

function nameMap(round: Round): Record<string, string> {
  const m: Record<string, string> = {};
  round.players.forEach((p) => (m[p.id] = p.name));
  return m;
}

describe('formatMoney', () => {
  it('formats whole dollars without decimals', () => {
    expect(formatMoney(5)).toBe('$5');
    expect(formatMoney(0)).toBe('$0');
  });
  it('formats fractional dollars with two decimals', () => {
    expect(formatMoney(2.5)).toBe('$2.50');
    expect(formatMoney(10.25)).toBe('$10.25');
  });
  it('renders negatives with a unicode minus', () => {
    expect(formatMoney(-5)).toBe('−$5');
    expect(formatMoney(-2.5)).toBe('−$2.50');
  });
});

describe('computeSettlement — inactive / no stakes', () => {
  it('is inactive when no games are selected', () => {
    const s = computeSettlement(makeRound());
    expect(s.active).toBe(false);
    expect(s.perGame).toEqual([]);
    expect(s.transactions).toEqual([]);
  });

  it('is inactive when a game is selected but stake is 0', () => {
    const s = computeSettlement(
      makeRound({ games: ['strokePlay'], options: { stakes: { strokePlay: 0 } } })
    );
    expect(s.active).toBe(false);
    expect(s.perGame).toEqual([]);
  });

  it('zeroes totals and emits no transactions when nobody has played', () => {
    const s = computeSettlement(
      makeRound({ games: ['strokePlay'], options: { stakes: { strokePlay: 5 } } })
    );
    assertZeroSum(s.totals);
    expect(s.transactions).toEqual([]);
  });
});

describe('computeSettlement — stroke play payouts', () => {
  it('single winner collects one stake from each of the other players', () => {
    // 3 players, gross totals: Al 72, Bo 75, Cy 78. Al wins low round.
    const hs = holes18();
    const scores = scoresFrom(hs, {
      p1: Array(18).fill(4), // 72
      p2: Array(18).fill(4).map((v, i) => (i === 0 ? 7 : v)), // 75
      p3: Array(18).fill(4).map((v, i) => (i === 0 ? 10 : v)), // 78
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores,
    });
    const s = computeSettlement(round);
    // 2 losers × $5 all go to the single winner.
    expect(s.totals.p1).toBe(10);
    expect(s.totals.p2).toBe(-5);
    expect(s.totals.p3).toBe(-5);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });

  it('splits the pot when two players tie for low round', () => {
    // Al 72, Bo 72, Cy 78. Winners share (1 loser × $5) / 2 winners = $2.50 each.
    const hs = holes18();
    const scores = scoresFrom(hs, {
      p1: Array(18).fill(4),
      p2: Array(18).fill(4),
      p3: Array(18).fill(4).map((v, i) => (i === 0 ? 10 : v)),
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores,
    });
    const s = computeSettlement(round);
    expect(s.totals.p1).toBe(2.5);
    expect(s.totals.p2).toBe(2.5);
    expect(s.totals.p3).toBe(-5);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });

  it('a three-way tie for low round produces zero movement', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
      p3: Array(9).fill(4),
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores,
    });
    const s = computeSettlement(round);
    expect(s.totals).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(s.transactions).toEqual([]);
  });

  it('uses net scoring when useNet is on (handicap flips the winner)', () => {
    // Gross: Al 72, Bo 74. Net: Bo gets 4 strokes → 70, wins.
    const hs = holes(9); // 9 holes, SI 1..9
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4), // 36
      p2: Array(9).fill(4).map((v, i) => (i < 2 ? 5 : v)), // 38 gross
    });
    const round = makeRound({
      players: [player('p1', 'Al', 0), player('p2', 'Bo', 4)],
      holes: hs,
      games: ['strokePlay'],
      options: { useNet: true, stakes: { strokePlay: 5 } },
      scores,
    });
    // Bo receives 4 strokes (SI 1..4) → net 34 vs Al 36. Bo wins.
    const s = computeSettlement(round);
    expect(s.totals.p2).toBe(5);
    expect(s.totals.p1).toBe(-5);
  });
});

describe('computeSettlement — field games (skins)', () => {
  it('distributes skins on the field-difference model, zero-sum', () => {
    // 3 players over 3 holes. Al wins holes 1 & 2 outright (2 skins), hole 3 tied.
    const hs = holes(3);
    const scores = scoresFrom(hs, {
      p1: [3, 3, 4],
      p2: [4, 4, 4],
      p3: [4, 4, 4],
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 2 } },
      scores,
    });
    const s = computeSettlement(round);
    // Skins: Al 2, Bo 0, Cy 0 (hole 3 tie carries, never resolved).
    // fieldNet: stake * (n*value - total). total=2, n=3.
    // Al: 2*(3*2 - 2) = 8 ; Bo: 2*(0 - 2) = -4 ; Cy: -4.
    expect(s.totals.p1).toBe(8);
    expect(s.totals.p2).toBe(-4);
    expect(s.totals.p3).toBe(-4);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });
});

describe('computeSettlement — match play', () => {
  it('winner of the match collects the stake from the loser (1v1)', () => {
    // Al wins holes 1-2, halves the rest → Al 2 UP.
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: [3, 3, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['matchPlay'],
      options: { stakes: { matchPlay: 10 } },
      scores,
    });
    const s = computeSettlement(round);
    expect(s.totals.p1).toBe(10);
    expect(s.totals.p2).toBe(-10);
    assertZeroSum(s.totals);
  });

  it('a halved match moves no money', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
    });
    const round = makeRound({
      games: ['matchPlay'],
      holes: hs,
      options: { stakes: { matchPlay: 10 } },
      scores,
    });
    const s = computeSettlement(round);
    expect(s.totals.p1).toBe(0);
    expect(s.totals.p2).toBe(0);
    expect(s.transactions).toEqual([]);
  });

  it('2v2 match play splits winnings across the winning team, drains the losers', () => {
    const hs = holes(9);
    // Team A (p1,p2) posts a 3 on hole 1, everyone else 4s → A wins 1 UP.
    const scores = scoresFrom(hs, {
      p1: [3, 4, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      p3: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      p4: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const round = makeRound({
      players: [
        player('p1', 'Al'),
        player('p2', 'Bo'),
        player('p3', 'Cy'),
        player('p4', 'Di'),
      ],
      holes: hs,
      games: ['matchPlay'],
      options: {
        stakes: { matchPlay: 5 },
        matchPlay: { mode: '2v2', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
      },
      scores,
    });
    const s = computeSettlement(round);
    // Each winner +5, each loser -5.
    expect(s.totals.p1).toBe(5);
    expect(s.totals.p2).toBe(5);
    expect(s.totals.p3).toBe(-5);
    expect(s.totals.p4).toBe(-5);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });
});

describe('computeSettlement — nassau (three bets)', () => {
  it('sweeping all three bets pays 3× the stake (front, back, total)', () => {
    // Al beats Bo on every hole → wins front, back, and total.
    const hs = holes18();
    const scores = scoresFrom(hs, {
      p1: Array(18).fill(3),
      p2: Array(18).fill(5),
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['nassau'],
      options: { stakes: { nassau: 4 } },
      scores,
    });
    const s = computeSettlement(round);
    // 3 bets × $4 = $12.
    expect(s.totals.p1).toBe(12);
    expect(s.totals.p2).toBe(-12);
    assertZeroSum(s.totals);
  });

  it('splitting the nines nets only the total bet', () => {
    // Al wins the front, Bo wins the back; total is decided by aggregate margin.
    const hs = holes18();
    const front = (n: number) => (n <= 9 ? 3 : 5); // Al: 3 front, 5 back
    const back = (n: number) => (n <= 9 ? 5 : 3); // Bo: 5 front, 3 back
    const scores = scoresFrom(hs, {
      p1: hs.map((h) => front(h.number)),
      p2: hs.map((h) => back(h.number)),
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['nassau'],
      options: { stakes: { nassau: 4 } },
      scores,
    });
    const s = computeSettlement(round);
    // Front: Al +1 bet. Back: Bo +1 bet. Total: dead even (9 holes each way) → halved.
    // Net front/back cancel → 0.
    expect(s.totals.p1).toBe(0);
    expect(s.totals.p2).toBe(0);
  });

  it('presses add extra bets on top of the base three', () => {
    const hs = holes18();
    const scores = scoresFrom(hs, {
      p1: Array(18).fill(3),
      p2: Array(18).fill(5),
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['nassau'],
      options: { stakes: { nassau: 4 } },
      scores,
      presses: [13], // press on the back nine
    });
    const s = computeSettlement(round);
    // Base 3 bets + 1 press = 4 bets × $4 = $16 to Al.
    expect(s.totals.p1).toBe(16);
    expect(s.totals.p2).toBe(-16);
  });
});

describe('computeSettlement — multiple games combine', () => {
  it('sums nets across games and still settles to zero', () => {
    const hs = holes(9);
    // Stroke play: Al low. Match play: Al up.
    const scores = scoresFrom(hs, {
      p1: [3, 3, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['strokePlay', 'matchPlay'],
      options: { stakes: { strokePlay: 5, matchPlay: 10 } },
      scores,
    });
    const s = computeSettlement(round);
    expect(s.perGame).toHaveLength(2);
    // Stroke: Al +5 / Bo -5. Match: Al +10 / Bo -10. Total Al +15.
    expect(s.totals.p1).toBe(15);
    expect(s.totals.p2).toBe(-15);
    // Minimum-transaction settlement: exactly one payment.
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toEqual({ from: 'Bo', to: 'Al', amount: 15 });
  });

  it('games that cancel out leave the players square with no transactions', () => {
    const hs = holes(9);
    // Al wins stroke play; Bo wins match play by the same stake.
    // Design: Al scores lower total, but Bo wins more holes.
    const scores = scoresFrom(hs, {
      // Al: one very low hole, rest higher -> low total but loses most holes.
      p1: [1, 5, 5, 5, 5, 5, 4, 4, 4], // total 38
      p2: [4, 4, 4, 4, 4, 4, 5, 5, 5], // total 39
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['strokePlay', 'matchPlay'],
      options: { stakes: { strokePlay: 5, matchPlay: 5 } },
      scores,
    });
    const s = computeSettlement(round);
    // Al total 38 < Bo 39 → Al wins stroke play (+5).
    // Holes: Al wins h1; Bo wins h2-h6 (5 holes); Al wins h7-h9 (3). Margin Al = 1+3-5 = -1 → Bo wins match (+5).
    // Net: Al +5 -5 = 0.
    expect(s.totals.p1).toBe(0);
    expect(s.totals.p2).toBe(0);
    expect(s.transactions).toEqual([]);
  });
});

describe('settleTransactions — greedy minimum transactions', () => {
  it('routes a big debtor to multiple creditors correctly', () => {
    // One player loses to two winners across skins → asymmetric balances.
    const hs = holes(4);
    // Cy is worst; Al and Bo split the skins.
    const scores = scoresFrom(hs, {
      p1: [3, 4, 3, 4], // wins h1, h3
      p2: [4, 3, 4, 3], // wins h2, h4
      p3: [5, 5, 5, 5], // wins nothing
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 3 } },
      scores,
    });
    const s = computeSettlement(round);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
    // No transaction should ever exceed a debtor's total debt.
    for (const t of s.transactions) expect(t.amount).toBeGreaterThan(0);
  });

  it('never creates a transaction from a player to themselves', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: [3, 3, 4, 4, 4, 4, 4, 4, 4],
      p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      p3: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores,
    });
    const s = computeSettlement(round);
    for (const t of s.transactions) expect(t.from).not.toBe(t.to);
  });
});

describe('unitFor', () => {
  const nassauRound = (holeCount: number, options: Partial<Round['options']> = {}): Round => {
    const hs = holes(holeCount);
    return makeRound({
      holes: hs,
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      games: ['nassau'],
      options: { nassau: { mode: '1v1', teamA: ['p1'], teamB: ['p2'] }, ...options },
      scores: scoresFrom(hs, {
        p1: Array(holeCount).fill(4),
        p2: Array(holeCount).fill(5),
      }),
    });
  };

  it('counts the three Nassau bets over eighteen holes', () => {
    expect(unitFor(nassauRound(18), 'nassau')).toBe('bet (×3)');
  });

  it('counts one bet over a nine, not three', () => {
    // The old static "(×3)" claimed three bets on a card that only ever has
    // the one — the label overstated a league night's exposure threefold.
    expect(unitFor(nassauRound(9), 'nassau')).toBe('bet (×1)');
  });

  it('counts the presses a round has actually run up', () => {
    // Al wins every hole, so the two-down rule keeps firing: the nine presses
    // at 3, that press presses at 5, and so on to 7 and 9 — five bets running
    // off one $5 stake. Exactly the exposure the old fixed "(×3)" hid, and the
    // reason this label is worth computing.
    expect(unitFor(nassauRound(9, { autoPress: true }), 'nassau')).toBe('bet (×5)');
  });

  it('leaves the other games alone', () => {
    expect(unitFor(nassauRound(18), 'skins')).toBe('skin');
    expect(unitFor(nassauRound(18), 'matchPlay')).toBe('the match');
  });
});

/**
 * Money that will not divide evenly.
 *
 * Nothing exotic is needed to get there: four players, a plain $5 stake, and
 * three of them tied for the win is a third of a cent each. The totals were
 * exact and every figure *shown* was rounded on its own, so the screen said
 * one player owed $5 and then told him to hand over $1.67 three times.
 */
describe('computeSettlement — cents', () => {
  const threeWayTie = (stake: number) => {
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: stake } },
      scores: scoresFrom(hs, { p1: [4, 4], p2: [4, 4], p3: [4, 4], p4: [5, 5] }),
    });
    return { round, s: computeSettlement(round) };
  };

  it('pays out exactly what the loser owes, to the cent', () => {
    const { round, s } = threeWayTie(5);
    expect(s.totals.p4).toBe(-5);
    // The indivisible cent lands on one of the three sharing the pot, not on
    // the player whose figure is exact — he owes the stake and nothing else.
    expect([s.totals.p1, s.totals.p2, s.totals.p3].sort()).toEqual([1.66, 1.67, 1.67]);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });

  it('leaves an exact figure exact, wherever the player sits in the round', () => {
    // The loser first this time. His figure is the stake and divides cleanly,
    // so he must not be the one who absorbs the cent just by being listed
    // first — only the players actually sharing the pot are candidates.
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Di'), player('p2', 'Al'), player('p3', 'Bo'), player('p4', 'Cy')],
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores: scoresFrom(hs, { p1: [5, 5], p2: [4, 4], p3: [4, 4], p4: [4, 4] }),
    });
    const s = computeSettlement(round);
    expect(s.totals.p1).toBe(-5);
    expect([s.totals.p2, s.totals.p3, s.totals.p4].sort()).toEqual([1.66, 1.67, 1.67]);
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });

  it('splits ten dollars three ways the way a person would', () => {
    const { s } = threeWayTie(10);
    expect([s.totals.p1, s.totals.p2, s.totals.p3].sort()).toEqual([3.33, 3.33, 3.34]);
    expect(s.totals.p4).toBe(-10);
  });

  it('gives every total a whole number of cents', () => {
    const { s } = threeWayTie(5);
    for (const v of Object.values(s.totals)) {
      expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
    }
  });

  it('keeps the totals row equal to the per-game rows above it', () => {
    // Two games at once: the totals used to be a sum of unrounded dollars, and
    // 0.01 + 0.02 is not 0.03 in binary.
    const hs = holes(2);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')],
      holes: hs,
      games: ['strokePlay', 'skins'],
      options: { stakes: { strokePlay: 5, skins: 1.33 } },
      scores: scoresFrom(hs, { p1: [4, 4], p2: [4, 4], p3: [4, 4], p4: [5, 5] }),
    });
    const s = computeSettlement(round);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      const fromGames = s.perGame.reduce((a, g) => a + Math.round((g.net[id] ?? 0) * 100), 0);
      expect(fromGames).toBe(Math.round(s.totals[id] * 100));
    }
    assertZeroSum(s.totals);
    assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
  });

  it('settles the same way twice', () => {
    // Largest remainder is order-dependent by nature, so the tie-break has to
    // be stable or the same card settles two different ways on two phones.
    expect(computeSettlement(threeWayTie(5).round).totals).toEqual(
      computeSettlement(threeWayTie(5).round).totals
    );
  });
});

/**
 * The cent invariants, over a spread of rounds rather than a chosen one.
 *
 * The bug this covers was reachable from an ordinary four-ball at a $5 stake
 * and survived a suite with twenty-five settlement tests in it, because every
 * one of them picked a card where the money happened to divide. So this picks
 * cards it did not choose: narrow score ranges and duplicated cards, because
 * ties are what make money indivisible, and every game and stake mixed in.
 *
 * Deterministic — a fixed seed and a written-out generator, so a failure names
 * a round that can be pasted into a test of its own rather than a round that
 * only existed once.
 */
describe('computeSettlement — cent invariants across many rounds', () => {
  const GAMES: GameType[] = ['strokePlay', 'matchPlay', 'skins', 'stableford', 'quota'];
  const NAMES = ['Al', 'Bo', 'Cy', 'Di', 'Ed'];
  const STAKES = [1, 2, 5, 10, 20, 0.5, 0.25, 1.33, 3.33, 0.05];

  /** mulberry32. The obvious hand-rolled LCG loses its low bits to float
   *  precision and returns zero forever, which passes everything. */
  function rng(seed: number) {
    let s = seed;
    return (n: number) => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
  }

  const cents = (v: number) => Math.round(v * 100);

  it('holds over 400 generated rounds', () => {
    const rnd = rng(7);
    let withSplit = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const np = 2 + rnd(4);
      const ids = Array.from({ length: np }, (_, i) => `p${i}`);
      const hs = holes([1, 2, 3, 9][rnd(4)]);
      const games = GAMES.filter(() => rnd(3) === 0);
      if (games.length === 0) continue;

      const stakes: Partial<Record<GameType, number>> = {};
      for (const g of games) stakes[g] = STAKES[rnd(STAKES.length)];

      // A two-stroke range makes ties ordinary; copying a card makes them certain.
      const cards: Record<string, (number | undefined)[]> = {};
      for (const id of ids) cards[id] = hs.map(() => (rnd(8) === 0 ? undefined : 4 + rnd(2)));
      for (let c = rnd(np); c > 0; c -= 1) cards[ids[rnd(np)]] = [...cards[ids[rnd(np)]]];

      const round = makeRound({
        players: ids.map((id, i) => player(id, NAMES[i])),
        holes: hs,
        games,
        options: { stakes, useNet: false },
        scores: scoresFrom(hs, cards),
      });
      const s = computeSettlement(round);
      if (Object.values(s.totals).some((v) => cents(v) % 100 !== 0)) withSplit += 1;

      // Every figure is exactly a whole number of cents — not merely within a
      // rounding error of one. `formatMoney` prints an integer dollar amount
      // without decimals, so −16 shows as "−$16" and the −15.999999999999998
      // that dollar arithmetic produces shows as "−$16.00" in the same column.
      for (const v of Object.values(s.totals)) {
        expect(v).toBe(cents(v) / 100);
      }
      // What one player is up, the others are down.
      expect(Object.values(s.totals).reduce((a, v) => a + cents(v), 0)).toBe(0);
      // Each game's row balances on its own, and the rows add up to the total.
      for (const g of s.perGame) {
        expect(ids.reduce((a, id) => a + cents(g.net[id] ?? 0), 0)).toBe(0);
      }
      for (const id of ids) {
        const fromGames = s.perGame.reduce((a, g) => a + cents(g.net[id] ?? 0), 0);
        expect(fromGames).toBe(cents(s.totals[id]));
      }
      // The payment instructions discharge every balance exactly.
      assertTransactionsSettle(s.totals, nameMap(round), s.transactions);
    }

    // Guards the generator itself: a sweep that never produces an uneven split
    // proves nothing, and the first version of this silently produced one
    // round four thousand times.
    expect(withSplit).toBeGreaterThan(20);
  });
});
