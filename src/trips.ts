import type { Round, RoundTrip } from './types';
import { computeSettlement, formatMoney, settleBalances, type Transaction } from './games/settlement';
import { nameKey } from './people';
import { daysSince } from './roundDate';

/**
 * Trips: several rounds that settle their money once, at the end.
 *
 * A buddies trip is four rounds in three days, and settling each one on the
 * eighteenth green is twelve payments where the trip needed three — Sam pays
 * Alex on Friday and Alex pays Sam on Saturday. Here the rounds keep their own
 * settlements and the trip adds them up and settles the sum.
 *
 * A trip is not stored anywhere: it is the rounds whose `trip.id` matches.
 * Players are matched across rounds by name, as Stats matches them, because a
 * `Player.id` belongs to one round.
 */

export interface Trip extends RoundTrip {
  /** Newest first: by date, then by last touched. */
  rounds: Round[];
  /** First and last dates played, yyyy-mm-dd. */
  first: string;
  last: string;
  /** When any of its rounds was last changed. */
  touched: number;
}

const norm = nameKey;
const newestFirst = (a: Round, b: Round) =>
  b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt;

/** Every trip on the phone, the one played most recently first. */
export function listTrips(rounds: Round[]): Trip[] {
  const byId = new Map<string, Round[]>();
  for (const r of rounds) {
    if (!r.trip?.id) continue;
    const list = byId.get(r.trip.id);
    if (list) list.push(r);
    else byId.set(r.trip.id, [r]);
  }
  return [...byId.entries()]
    .map(([id, list]) => {
      const sorted = [...list].sort(newestFirst);
      // The name on the most recently touched round wins: that is the one a
      // rename last wrote, should a copy from before it arrive by link.
      const named = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return {
        id,
        name: named.trip!.name,
        rounds: sorted,
        first: sorted[sorted.length - 1].date,
        last: sorted[0].date,
        touched: Math.max(...list.map((r) => r.updatedAt)),
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last) || b.touched - a.touched);
}

export function findTrip(rounds: Round[], id: string): Trip | null {
  return listTrips(rounds).find((t) => t.id === id) ?? null;
}

/** How long after its last round a trip still counts as the one being played. */
export const ACTIVE_TRIP_DAYS = 4;

/**
 * The trip being played now, if there is one: the latest trip with a round
 * touched in the last few days. A trip is a long weekend, and the gap between
 * its rounds is a night or two — four days covers a rest day without keeping
 * last month's trip on Home.
 */
export function activeTrip(rounds: Round[], now: number = Date.now()): Trip | null {
  // By the date its last round was played, not by when a round was last
  // written: renaming June's trip in October, or merging a name that
  // appears in it, used to put it back on Home and start the next round on
  // it.
  const today = new Date(now);
  const recent = listTrips(rounds).filter((t) => {
    const days = daysSince(t.last, today);
    return days !== null && days >= 0 && days < ACTIVE_TRIP_DAYS;
  });
  return recent.sort((a, b) => b.last.localeCompare(a.last) || b.touched - a.touched)[0] ?? null;
}

export interface TripPlayer {
  name: string;
  /** Net across the trip, in dollars. */
  total: number;
  /** Net in each round they played that had money on it, by round id. */
  byRound: Record<string, number>;
}

export interface TripLedger {
  /** Biggest winner first. */
  players: TripPlayer[];
  /** The trip settled as one: fewest payments for the summed balances. */
  transactions: Transaction[];
  /** Rounds that had a stake on them, so moved money. */
  moneyRounds: number;
  /** Rounds still being played, whose money is in the totals so far. */
  unfinished: number;
}

/**
 * The trip's money, added up by player.
 *
 * Summed in whole cents: each round's figures are already rounded to the cent,
 * and adding dollars in floating point would leave the totals a fraction off
 * zero — enough for the settlement to invent a one-cent payment.
 */
export function tripLedger(rounds: Round[]): TripLedger {
  const cents = new Map<string, { name: string; total: number; byRound: Record<string, number> }>();
  let moneyRounds = 0;
  // Oldest first, so the name a player was last entered under is the one shown.
  for (const r of [...rounds].sort((a, b) => -newestFirst(a, b))) {
    if (r.options.league) continue;
    const s = computeSettlement(r);
    if (!s.active) continue;
    moneyRounds += 1;
    for (const p of r.players) {
      const key = norm(p.name);
      if (!key) continue;
      const row = cents.get(key) ?? { name: p.name.trim(), total: 0, byRound: {} };
      const c = Math.round((s.totals[p.id] ?? 0) * 100);
      row.name = p.name.trim();
      row.total += c;
      row.byRound[r.id] = (row.byRound[r.id] ?? 0) + c / 100;
      cents.set(key, row);
    }
  }

  const players = [...cents.values()]
    .map((p) => ({ name: p.name, total: p.total / 100, byRound: p.byRound }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const balances: Record<string, number> = {};
  for (const p of players) balances[p.name] = p.total;

  return {
    players,
    transactions: settleBalances(balances),
    moneyRounds,
    unfinished: rounds.filter((r) => r.status !== 'finished').length,
  };
}

/** A round with its trip set, or cleared. */
export const withTrip = (round: Round, trip: RoundTrip | null): Round => {
  const { trip: _old, ...rest } = round;
  return trip ? { ...rest, trip: { id: trip.id, name: trip.name.trim() } } : rest;
};

/** How far either side of a trip's dates a round can be offered for it. */
const NEARBY_DAYS = 7;

/**
 * Rounds that could be put on this trip: ones played within a week of it
 * that are not on another trip. League nights are left out — they settle on
 * points, not money, and belong to the league's season.
 */
export function tripCandidates(rounds: Round[], trip: Trip): Round[] {
  const ms = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const from = ms(trip.first) - NEARBY_DAYS * 864e5;
  const to = ms(trip.last) + NEARBY_DAYS * 864e5;
  return rounds
    .filter((r) => !r.options.league)
    .filter((r) => r.trip?.id === trip.id || (!r.trip && ms(r.date) >= from && ms(r.date) <= to))
    .sort(newestFirst);
}

/**
 * The trip's settle-up as text for the group chat: who is up, who is down,
 * and the payments. Plain text, because that is what every chat app takes.
 */
export function tripSettleText(trip: Trip, ledger: TripLedger): string {
  const lines = [`${trip.name} — trip settle-up`];
  const n = trip.rounds.length;
  lines.push(`${n} ${n === 1 ? 'round' : 'rounds'}${ledger.unfinished ? ` (${ledger.unfinished} still being played)` : ''}`);
  lines.push('');
  for (const p of ledger.players) {
    lines.push(`${p.name}: ${p.total === 0 ? 'even' : formatMoney(p.total)}`);
  }
  if (ledger.transactions.length) {
    lines.push('');
    for (const t of ledger.transactions) lines.push(`${t.from} pays ${t.to} ${formatMoney(t.amount)}`);
  }
  lines.push('', 'Scored with Press');
  return lines.join('\n');
}
