import type { GameType, Round } from '../types';

/**
 * Which games care about handicaps, and how each one is being scored in a
 * given round.
 *
 * This lives in its own module rather than on `GameMeta` because `handicap.ts`
 * and every engine need it, and `games/index.ts` imports those engines — the
 * facts have to sit below the registry or the import graph turns into a cycle.
 * The registry reads from here, so there is still one source of truth.
 */

/**
 * Games that can be played either gross or net.
 *
 * Quota is the deliberate omission: it spends the handicap on the player's
 * target and then reads the card gross, so "net Quota" is not a thing that
 * exists — offering the choice would only invite handing every stroke out
 * twice. See `quota.ts`.
 */
const NET_CAPABLE: readonly GameType[] = [
  'strokePlay',
  'matchPlay',
  'skins',
  'stableford',
  'wolf',
  'nassau',
  'vegas',
];

/** Games where a handicap changes the result at all — the gate for the setup fields. */
const USES_HANDICAP: readonly GameType[] = [...NET_CAPABLE, 'quota'];

export const canScoreNet = (game: GameType): boolean => NET_CAPABLE.includes(game);

export const usesHandicap = (game: GameType): boolean => USES_HANDICAP.includes(game);

/**
 * Whether one game in this round is being scored net.
 *
 * `options.useNet` is the round's default, still derived at setup from whether
 * anybody entered a handicap. `options.netByGame` holds only the games the
 * user has explicitly overridden, so an absent entry means "follow the
 * default" — which is what keeps every round saved before per-game scoring
 * existed scoring exactly as it did, and what lets adding a handicap mid-round
 * still switch the untouched games over (see `roundEdits.ts`).
 *
 * A game that cannot be scored net never is, whatever the map says.
 */
export function netFor(round: Round, game: GameType): boolean {
  if (!canScoreNet(game)) return false;
  return round.options.netByGame?.[game] ?? round.options.useNet;
}

/**
 * Whether anything in this round is scored net — the gate for the whole-round
 * net displays: the net figures on the scorecard and under a score on the Hole
 * tab.
 *
 * League rounds count: they carry `useNet: false` by construction and score
 * net through `computeLeague`, which reads `player.handicap` directly.
 */
export function anyNetScoring(round: Round): boolean {
  if (round.options.league) return true;
  return round.games.some((g) => netFor(round, g));
}

/**
 * Whether a player's handicap changes this game's result in this round.
 *
 * For a net-capable game that is exactly the gross/net choice. For a game that
 * uses a handicap without ever scoring net — Quota, which spends it on the
 * target — it is always true. Written against the two lists rather than naming
 * Quota, so the next game of either kind needs no change here.
 */
const handicapMatters = (round: Round, game: GameType): boolean =>
  usesHandicap(game) && (canScoreNet(game) ? netFor(round, game) : true);

/**
 * Whether handicaps are in play at all — the gate for every handicap display,
 * such as the badges on the leaderboards and the stroke dots on the hole.
 *
 * Deliberately broader than `anyNetScoring`: a Quota round shows handicaps
 * everywhere and yet scores no card net, so a single flag could not serve both
 * and the scorecard would start printing net strokes that no game used.
 */
export function usesHandicaps(round: Round): boolean {
  if (round.options.league) return true;
  return round.games.some((g) => handicapMatters(round, g));
}
