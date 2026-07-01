import type { Round, GameOptions } from '../src/types';
import { computeSkins } from '../src/games/skins';
import { computeStableford } from '../src/games/stableford';
import { computeMatchPlay } from '../src/games/matchPlay';
import { computeWolf } from '../src/games/wolf';

import { computeSettlement } from '../src/games/settlement';

const opts: GameOptions = {
  useNet: false,
  stablefordMode: 'standard',
  loneWolfMultiplier: 2,
  blindWolfMultiplier: 3,
  stakes: {},
};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`);
  }
}

function baseRound(partial: Partial<Round>): Round {
  return {
    id: 'x',
    date: '2026-06-30',
    createdAt: 0,
    updatedAt: 0,
    players: [],
    holes: [],
    games: [],
    options: opts,
    scores: {},
    wolf: {},
    status: 'in_progress',
    ...partial,
  };
}

// --- Skins: tie on hole 1 carries to hole 2 ---
console.log('Skins carryover:');
{
  const r = baseRound({
    players: [
      { id: 'a', name: 'Al' },
      { id: 'b', name: 'Bo' },
    ],
    holes: [
      { number: 1, par: 4 },
      { number: 2, par: 4 },
    ],
    scores: {
      1: { a: 4, b: 4 }, // tie → carry
      2: { a: 3, b: 5 }, // Al wins, takes 2 skins
    },
  });
  const res = computeSkins(r);
  const al = res.standings.find((s) => s.playerId === 'a')!;
  check('Al wins 2 skins after carryover', al.value === 2, al.value);
}

// --- Stableford standard points ---
console.log('Stableford points:');
{
  const r = baseRound({
    players: [{ id: 'a', name: 'Al' }],
    holes: [
      { number: 1, par: 4 }, // birdie (3) → 3 pts
      { number: 2, par: 4 }, // par (4) → 2 pts
      { number: 3, par: 4 }, // bogey (5) → 1 pt
      { number: 4, par: 4 }, // double (6) → 0 pts
    ],
    scores: { 1: { a: 3 }, 2: { a: 4 }, 3: { a: 5 }, 4: { a: 6 } },
  });
  const res = computeStableford(r);
  check('birdie+par+bogey+double = 6 pts', res.standings[0].value === 6, res.standings[0].value);
}

// --- Match play: 2&1 closeout ---
console.log('Match play closeout:');
{
  // Al wins holes 1,2,3 (3 UP with 2 to play after hole... ) build a clean 2&1.
  // After hole 7 of 8: Al up 3 with 1 remaining → decided "3&1". Let's craft 2&1.
  const holes = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4 }));
  const scores: Round['scores'] = {};
  // Al wins holes 1,2,3 (3 up), halve 4,5,6,7 → after hole 7 Al 3 up, 2 to play = 3&2.
  scores[1] = { a: 3, b: 4 };
  scores[2] = { a: 3, b: 4 };
  scores[3] = { a: 3, b: 4 };
  scores[4] = { a: 4, b: 4 };
  scores[5] = { a: 4, b: 4 };
  scores[6] = { a: 4, b: 4 };
  scores[7] = { a: 4, b: 4 };
  const r = baseRound({
    players: [
      { id: 'a', name: 'Al' },
      { id: 'b', name: 'Bo' },
    ],
    holes,
    scores,
  });
  const res = computeMatchPlay(r);
  check('Al closes out 3&2', res.status === 'Al won 3&2', res.status);
}

// --- Wolf: lone wolf win scores the multiplier ---
console.log('Wolf lone win:');
{
  const r = baseRound({
    players: [
      { id: 'a', name: 'Al' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
      { id: 'd', name: 'Di' },
    ],
    holes: [{ number: 1, par: 4 }],
    scores: { 1: { a: 3, b: 4, c: 5, d: 4 } }, // wolf Al best with 3
    wolf: { 1: { wolfPlayerId: 'a', choice: { type: 'lone' } } },
  });
  const res = computeWolf(r);
  const al = res.standings.find((s) => s.playerId === 'a')!;
  check('lone wolf Al gets ×2 = 2 pts', al.value === 2, al.value);
}

// --- Settlement: skins at $5, Al wins 2 skins heads-up over 2 holes ---
console.log('Settlement — skins ($/skin):');
{
  const r = baseRound({
    players: [
      { id: 'a', name: 'Al' },
      { id: 'b', name: 'Bo' },
    ],
    holes: [
      { number: 1, par: 4 },
      { number: 2, par: 4 },
    ],
    games: ['skins'],
    options: { ...opts, stakes: { skins: 5 } },
    scores: {
      1: { a: 4, b: 4 }, // tie carries
      2: { a: 3, b: 5 }, // Al wins 2 skins
    },
  });
  const s = computeSettlement(r);
  const sum = Object.values(s.totals).reduce((x, y) => x + y, 0);
  check('zero-sum', Math.abs(sum) < 1e-9, sum);
  check('Al +$10, Bo −$10', s.totals.a === 10 && s.totals.b === -10, s.totals);
  check(
    'one payment: Bo pays Al $10',
    s.transactions.length === 1 &&
      s.transactions[0].from === 'Bo' &&
      s.transactions[0].to === 'Al' &&
      s.transactions[0].amount === 10,
    s.transactions
  );
}

// --- Settlement: 4-player skins pot, Al 3 skins @ $5 ---
console.log('Settlement — 4-player skins pot:');
{
  const r = baseRound({
    players: [
      { id: 'a', name: 'Al' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
      { id: 'd', name: 'Di' },
    ],
    holes: [
      { number: 1, par: 4 },
      { number: 2, par: 4 },
      { number: 3, par: 4 },
    ],
    games: ['skins'],
    options: { ...opts, stakes: { skins: 5 } },
    scores: {
      1: { a: 3, b: 4, c: 4, d: 4 },
      2: { a: 3, b: 4, c: 4, d: 4 },
      3: { a: 3, b: 4, c: 4, d: 4 },
    },
  });
  const s = computeSettlement(r);
  check('Al +$45 (3 skins × $5 × 3 rivals)', s.totals.a === 45, s.totals.a);
  check('each rival −$15', s.totals.b === -15 && s.totals.c === -15 && s.totals.d === -15, s.totals);
  check('3 payments to Al', s.transactions.length === 3, s.transactions.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
