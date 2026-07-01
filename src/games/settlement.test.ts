import { describe, it, expect } from 'vitest';
import { computeSettlement, formatMoney, type Transaction } from './settlement';
import { makeRound, player, holes, holes18, scoresFrom } from './testFixtures';
import type { Round } from '../types';

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
  for (const v of Object.values(bal)) expect(Math.abs(v)).toBeLessThan(0.01);
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
