import type { GameResult, Round } from '../types';
import type { Side } from './matchPlay';

/**
 * The shapes money takes, shared by the games' own `money` rules.
 *
 * Every game settles one of three ways — a count of things won against the
 * field, a points figure against the players who posted one, or a side
 * beating a side — and the registry (`games/index.ts`) hands the settlement
 * engine each game's rule beside its scoring rule. These are the pieces the
 * rules are built from, kept below every game module so none of them has to
 * reach up into the registry or the engine (which would be a cycle: the
 * registry imports the games).
 *
 * A rule returns the net for every player in the round, in dollars, summing
 * to zero. The engine zero-fills, guards a stake of nothing, and turns the
 * result into whole cents; the rule only has to say who owes whom what.
 */

/** A game's net per player for a stake. Zero-sum; every player present. */
export type MoneyFn = (round: Round, stake: number) => Record<string, number>;

/** Every player at zero — the starting point of every rule. */
export function zeroNet(round: Round): Record<string, number> {
  const net: Record<string, number> = {};
  for (const p of round.players) net[p.id] = 0;
  return net;
}

/** Field-difference model: each unit shifts `stake` between you and every rival. */
export function fieldNet(
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

/** Each player's standing value, by id, from a game's own result. */
const valuesOf = (result: GameResult): Record<string, number> => {
  const v: Record<string, number> = {};
  result.standings.forEach((s) => {
    if (s.playerId) v[s.playerId] = s.value;
  });
  return v;
};

/**
 * A game that settles on a count: each player's standing value is a number of
 * things won — skins, Wolf points, junk — and every one of them is worth the
 * stake against every rival. A 0 is a true 0 here, and every rival pays.
 */
export const countedMoney =
  (compute: (round: Round) => GameResult): MoneyFn =>
  (round, stake) => {
    const ids = round.players.map((p) => p.id);
    return { ...zeroNet(round), ...fieldNet(ids, valuesOf(compute(round)), stake) };
  };

/**
 * A game scored on points — Stableford, Quota — settles the same way, among
 * the players who posted a score. Somebody with no score on any hole did not
 * play: their 0 is not zero points, and under the field model it had them
 * collecting from everyone whose quota pace was negative. The others settle
 * among themselves and they stay at 0.
 */
export const pointsMoney =
  (compute: (round: Round) => GameResult): MoneyFn =>
  (round, stake) => {
    const net = zeroNet(round);
    const played = round.players
      .map((p) => p.id)
      .filter((id) => round.holes.some((h) => round.scores[h.number]?.[id] != null));
    if (played.length < 2) return net;
    return { ...net, ...fieldNet(played, valuesOf(compute(round)), stake) };
  };

/**
 * A side beating a side: every player on the winning side collects the stake
 * and every player on the losing side pays it. Nothing moves on a halve or a
 * match still open. Accumulates into `net`, so a game of several bets —
 * Nassau — can call it once per bet.
 */
export function creditSide(
  net: Record<string, number>,
  winner: 'A' | 'B' | null,
  a: Side,
  b: Side,
  stake: number
): void {
  if (winner === 'A') {
    a.ids.forEach((id) => (net[id] += stake));
    b.ids.forEach((id) => (net[id] -= stake));
  } else if (winner === 'B') {
    b.ids.forEach((id) => (net[id] += stake));
    a.ids.forEach((id) => (net[id] -= stake));
  }
}
