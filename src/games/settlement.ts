import type { Round, GameType, GameResult } from '../types';
import { computeSkins } from './skins';
import { computeStableford } from './stableford';
import { computeWolf } from './wolf';
import { matchSegmentSides, resolveSides } from './matchPlay';
import { nassauSegments, nassauTeams } from './nassau';
import { vegasHoles, vegasTeams } from './vegas';
import { computeQuota } from './quota';
import { computeJunk } from './junk';
import { totalStrokesReceived } from './handicap';
import { netFor } from './scoring';

export interface Transaction {
  from: string; // debtor name
  to: string; // creditor name
  amount: number;
}

export interface GameMoney {
  gameType: GameType;
  label: string;
  unit: string;
  stake: number;
  net: Record<string, number>; // playerId -> dollars (zero-sum)
}

export interface Settlement {
  active: boolean; // any stake > 0
  totals: Record<string, number>; // playerId -> net dollars
  perGame: GameMoney[];
  transactions: Transaction[];
}

const LABEL: Record<GameType, string> = {
  strokePlay: 'Stroke Play',
  matchPlay: 'Match Play',
  skins: 'Skins',
  stableford: 'Stableford',
  wolf: 'Wolf',
  nassau: 'Nassau',
  vegas: 'Vegas',
  quota: 'Quota',
  junk: 'Junk',
};

export const STAKE_UNIT: Record<GameType, string> = {
  strokePlay: 'low round',
  matchPlay: 'the match',
  skins: 'skin',
  stableford: 'point',
  wolf: 'point',
  // No count here: Nassau's bet count depends on the round — see `unitFor`.
  nassau: 'bet',
  vegas: 'point',
  quota: 'point',
  junk: 'junk',
};

/**
 * The stake unit as it reads for a round in progress.
 *
 * Nassau is the one game whose number of bets isn't fixed. The static label
 * used to read "bet (×3)", assuming front, back and total — already wrong on a
 * nine, which has one bet, and wronger with every press running, called or
 * automatic. Anywhere a round is in hand the real count can be shown; the
 * static `STAKE_UNIT` stays for the setup screen, which has no round yet and
 * so says "per bet" without claiming a number.
 */
export function unitFor(round: Round, game: GameType): string {
  if (game !== 'nassau') return STAKE_UNIT[game];
  const bets = nassauSegments(round).length;
  return `bet (×${bets})`;
}

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? `$${abs}` : `$${abs.toFixed(2)}`;
  return n < 0 ? `−${s}` : s;
}

/**
 * The games that settle on a count: each player's standing value is a number of
 * things won, and every one of them is worth the stake against every rival.
 *
 * One map rather than a condition listing the games and a ternary chain
 * choosing between them. Those were two lists of the same five games that had
 * to agree, and adding a sixth meant editing both — which is exactly the shape
 * of edit that gets half-made.
 */
const COUNTED: Partial<Record<GameType, (round: Round) => GameResult>> = {
  junk: computeJunk,
  skins: computeSkins,
  stableford: computeStableford,
  wolf: computeWolf,
  quota: computeQuota,
};

/** Field-difference model: each unit shifts `stake` between you and every rival. */
function fieldNet(
  ids: string[],
  valueById: Record<string, number>,
  stake: number
): Record<string, number> {
  const n = ids.length;
  const total = ids.reduce((a, id) => a + (valueById[id] ?? 0), 0);
  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = stake * (n * (valueById[id] ?? 0) - total)));
  return net;
}

function gameNet(round: Round, gameType: GameType, stake: number): Record<string, number> {
  const ids = round.players.map((p) => p.id);
  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = 0));
  if (stake <= 0) return net;

  const counted = COUNTED[gameType];
  if (counted) {
    const valueById: Record<string, number> = {};
    counted(round).standings.forEach((s) => {
      if (s.playerId) valueById[s.playerId] = s.value;
    });
    return fieldNet(ids, valueById, stake);
  }

  if (gameType === 'strokePlay') {
    const useNet = netFor(round, 'strokePlay');
    const totals = ids
      .map((id) => {
        let gross = 0;
        let played = 0;
        for (const h of round.holes) {
          const s = round.scores[h.number]?.[id];
          if (s != null) {
            gross += s;
            played += 1;
          }
        }
        const total = useNet ? gross - totalStrokesReceived(round, id, 'strokePlay') : gross;
        return { id, total, played };
      })
      .filter((t) => t.played > 0);
    if (totals.length < 2) return net;
    const min = Math.min(...totals.map((t) => t.total));
    const winners = totals.filter((t) => t.total === min);
    const losers = totals.filter((t) => t.total > min);
    const share = (losers.length * stake) / winners.length;
    winners.forEach((w) => (net[w.id] = share));
    losers.forEach((l) => (net[l.id] = -stake));
    return net;
  }

  if (gameType === 'matchPlay') {
    if (round.players.length < 2) return net;
    const { a, b } = resolveSides(round, round.options.matchPlay);
    const seg = matchSegmentSides(round, round.holes, a, b);
    if (seg.winner === 'A') {
      a.ids.forEach((id) => (net[id] += stake));
      b.ids.forEach((id) => (net[id] -= stake));
    } else if (seg.winner === 'B') {
      b.ids.forEach((id) => (net[id] += stake));
      a.ids.forEach((id) => (net[id] -= stake));
    }
    return net;
  }

  if (gameType === 'vegas') {
    // Points are a team figure, so every player on the side collects or pays
    // the same — zero-sum across four players the way match play is across
    // two. A side that is 60 points up at $1 a point is $60 a man, which is
    // how Vegas actually gets settled and why the stake wants to be small.
    const { a, b } = vegasTeams(round);
    if (round.options.vegas?.mode !== '2v2' || a.ids.length < 2 || b.ids.length < 2) return net;
    const { margin } = vegasHoles(round);
    a.ids.forEach((id) => (net[id] += margin * stake));
    b.ids.forEach((id) => (net[id] -= margin * stake));
    return net;
  }

  if (gameType === 'nassau') {
    if (round.players.length < 2) return net;
    // Each bet is worth `stake` per player: winning side collects, losing side pays.
    const { a, b } = nassauTeams(round);
    for (const seg of nassauSegments(round)) {
      const r = matchSegmentSides(round, seg.holes, a, b, 'nassau');
      if (r.winner === 'A') {
        a.ids.forEach((id) => (net[id] += stake));
        b.ids.forEach((id) => (net[id] -= stake));
      } else if (r.winner === 'B') {
        b.ids.forEach((id) => (net[id] += stake));
        a.ids.forEach((id) => (net[id] -= stake));
      }
    }
    return net;
  }

  return net;
}

/**
 * A game's net, in whole cents, still summing to exactly zero.
 *
 * Money that will not divide evenly is ordinary here, not exotic: four players,
 * a plain $5 stake, and three of them tied for the win is a third of a cent
 * each. Rounding every figure on its own is what a display does, and it broke
 * the one invariant the screen has — what one player is up, the others are
 * down. That round told the loser he owed $5 and then gave him three payments
 * of $1.67 to make.
 *
 * Every share is truncated to a cent and the leftover cents go back only to
 * the players who were truncated. That is the part that matters: the loser's
 * figure is the stake and divides exactly, so he is not a candidate, and the
 * indivisible cent lands on one of the three sharing the pot. $5 three ways is
 * 1.67, 1.67, 1.66.
 *
 * Which of the three absorbs it is decided by order, and order is all that is
 * available — every net this app produces is one group sharing an identical
 * amount against another group paying an identical amount, so the remainders
 * are either equal or zero and there is no "most truncated" player to prefer.
 */
function toCents(ids: string[], raw: Record<string, number>): Record<string, number> {
  const exact = ids.map((id) => (raw[id] ?? 0) * 100);
  const cents = exact.map((v) => Math.trunc(v));
  let residual = -cents.reduce((a, c) => a + c, 0);

  for (let i = 0; i < ids.length && residual !== 0; i += 1) {
    // Below a millionth of a cent the difference is float noise from the
    // multiplication above, not a share of anything, and stepping on it would
    // move real money.
    const step = Math.abs(exact[i] - cents[i]) < 1e-6 ? 0 : Math.sign(exact[i] - cents[i]);
    if (step === 0) continue;
    cents[i] += step;
    residual -= step;
  }

  // Unreachable while every caller hands in a zero-sum net, which they all do.
  // Kept because zero-sum is the invariant the settlement is read through, and
  // a screen that does not balance is worse than one player's cent being off.
  if (residual !== 0) {
    let at = 0;
    for (let i = 1; i < cents.length; i += 1) {
      if (Math.abs(cents[i]) > Math.abs(cents[at])) at = i;
    }
    cents[at] += residual;
  }

  const out: Record<string, number> = {};
  ids.forEach((id, i) => (out[id] = cents[i]));
  return out;
}

const fromCents = (ids: string[], cents: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  ids.forEach((id) => (out[id] = cents[id] / 100));
  return out;
};

/** Greedy minimum-transaction settlement from net balances. */
function settleTransactions(
  totals: Record<string, number>,
  nameById: Record<string, string>
): Transaction[] {
  const creditors = Object.entries(totals)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v);
  const debtors = Object.entries(totals)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v);

  const tx: Transaction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    tx.push({
      from: nameById[debtors[i].id],
      to: nameById[creditors[j].id],
      amount: Math.round(amount * 100) / 100,
    });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v <= 0.005) i += 1;
    if (creditors[j].v <= 0.005) j += 1;
  }
  return tx;
}

export function computeSettlement(round: Round): Settlement {
  const ids = round.players.map((p) => p.id);
  const nameById: Record<string, string> = {};
  round.players.forEach((p) => (nameById[p.id] = p.name));

  // Accumulated in whole cents rather than dollars: a round playing three games
  // adds three rounded figures together, and 0.01 + 0.02 is not 0.03 in
  // binary floating point. Integers make the sum exact and keep the totals
  // row agreeing with the per-game rows above it.
  const totalCents: Record<string, number> = {};
  ids.forEach((id) => (totalCents[id] = 0));
  const perGame: GameMoney[] = [];

  for (const gt of round.games) {
    const stake = round.options.stakes?.[gt] ?? 0;
    if (stake <= 0) continue;
    const cents = toCents(ids, gameNet(round, gt, stake));
    perGame.push({
      gameType: gt,
      label: LABEL[gt],
      unit: unitFor(round, gt),
      stake,
      net: fromCents(ids, cents),
    });
    ids.forEach((id) => (totalCents[id] += cents[id]));
  }

  const totals = fromCents(ids, totalCents);
  return {
    active: perGame.length > 0,
    totals,
    perGame,
    transactions: settleTransactions(totals, nameById),
  };
}
