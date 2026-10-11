import type { Round, GameType } from '../types';
import { GAMES, gameMeta } from './index';
import { nassauSegments } from './nassau';
import { zeroNet } from './moneyModels';

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

/**
 * The stake unit of each game, for a screen with no round in hand — the
 * setup screen says "per bet" without claiming a number. Read off the
 * registry, where each game declares it beside its money rule.
 */
export const STAKE_UNIT: Record<GameType, string> = Object.fromEntries(
  GAMES.map((g) => [g.id, g.unit])
) as Record<GameType, string>;

/**
 * The stake unit as it reads for a round in progress.
 *
 * Nassau is the one game whose number of bets isn't fixed. The static label
 * used to read "bet (×3)", assuming front, back and total — already wrong on a
 * nine, which has one bet, and wronger with every press running, called or
 * automatic. Anywhere a round is in hand the real count can be shown.
 */
export function unitFor(round: Round, game: GameType): string {
  if (game !== 'nassau') return gameMeta(game).unit;
  const bets = nassauSegments(round).length;
  return `bet (×${bets})`;
}

/**
 * `$5`, `$2.50`, `−$165`, `$1,648`. Grouped by hand rather than through
 * toLocaleString: the unicode minus and the dropped `.00` are already ours, and
 * a phone set to a comma-decimal locale would otherwise print `$1.648` on the
 * Stats screen — a different number to anyone reading it.
 */
export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const [whole, cents] = (Number.isInteger(abs) ? String(abs) : abs.toFixed(2)).split('.');
  const s = `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${cents ? `.${cents}` : ''}`;
  return n < 0 ? `−${s}` : s;
}

/**
 * One game's net in dollars, every player present, zero when nothing is at
 * stake. The rule itself is the game's own (`GameMeta.money`): this used to
 * be a table of which games settle on a count, a second list of which of
 * those are scored on points, and a chain of ifs for the rest — three places
 * that had to agree, and a new game meant editing all of them.
 */
function gameNet(round: Round, gameType: GameType, stake: number): Record<string, number> {
  const net = zeroNet(round);
  if (stake <= 0) return net;
  return { ...net, ...gameMeta(gameType).money(round, stake) };
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
  // Snapped to a millionth of a cent first: 0.3 × 3 × 100 is 89.999999…, and
  // truncating that dropped a real cent on $0.30-a-point games with nothing
  // left over to put it back.
  const exact = ids.map((id) => Math.round((raw[id] ?? 0) * 100 * 1e6) / 1e6);
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

/**
 * Who pays whom for balances already keyed by name — the trip ledger's, which
 * adds up several rounds whose player ids have nothing to do with each other.
 */
export function settleBalances(byName: Record<string, number>): Transaction[] {
  const names: Record<string, string> = {};
  for (const n of Object.keys(byName)) names[n] = n;
  return settleTransactions(byName, names);
}

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
      label: gameMeta(gt).label,
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
