import type { Round, Player, GameType } from '../types';
import type { Hole } from '../types';
import { strokeIndexesUsable } from './strokeIndex';
import { courseHandicap, withAllowance, validIndex, validSlope, validRating } from './courseHandicap';

/**
 * Stroke index per hole. Uses the values the round carries when they form a
 * usable 1..N ranking; otherwise falls back to sequential indexing by
 * ascending hole number, so net games allocate strokes the same way regardless
 * of which hole the round started on (league rounds rotate holes into play
 * order).
 *
 * "Usable" is the load-bearing word, and it means more than "present". A
 * stroke index is a ranking, and allocation reads it as one — a shot wherever
 * the index is at or below the handicap. Feed it a set that repeats a rank or
 * strays outside 1..N and it hands out the wrong *number* of shots, silently:
 * eighteen holes all indexed 5 give a 4-handicap nothing at all and a
 * 6-handicap a shot a hole. Falling back is not a guess at the real course —
 * it is the same thing the app does when nobody set an index, and at least it
 * gives every player the shots their handicap is owed. The setup screens warn
 * so the numbers can be fixed; this is the floor under that.
 */
export function strokeIndexMap(round: Round): Record<number, number> {
  const usable = strokeIndexesUsable(round.holes);
  const byNumber = [...round.holes].sort((a, b) => a.number - b.number);
  const map: Record<number, number> = {};
  byNumber.forEach((h, i) => {
    map[h.number] = usable ? (h.strokeIndex as number) : i + 1;
  });
  return map;
}

/**
 * The allowance this game is played off, as a percentage. 100 when unset.
 */
export function allowanceFor(round: Round, game: GameType): number {
  const pct = round.options.allowanceByGame?.[game];
  return typeof pct === 'number' && pct > 0 && pct <= 100 ? pct : 100;
}

/**
 * A player's course handicap for this round, before any allowance.
 *
 * Derived from their Handicap Index when the round carries a slope and rating
 * to derive it with, and taken from the stored stroke count otherwise. That
 * order matters: an Index plus a rated course is the more precise answer, but
 * a number somebody typed on the first tee has to keep working, because most
 * rounds will never have a rating attached and a few will have one that is
 * wrong. `handicap` therefore remains what it always was — the strokes this
 * round is scored on — and the Index is an input to it, not a replacement.
 *
 * `round.rating` covers the holes actually being played; Setup converts when
 * it copies a rating off a course that spans more holes than the round does.
 */
export function courseHandicapFor(round: Round, player: Player): number {
  const holes = round.holes.length;
  // The rating describes `ratingHoles` holes, which is not always the number
  // being played — nine off an eighteen-hole card is the common case, and
  // `courseHandicap` converts per hole precisely so it can be told apart.
  const ratingHoles = round.ratingHoles ?? holes;
  if (
    validIndex(player.index) &&
    validSlope(round.slope) &&
    validRating(round.rating, ratingHoles) &&
    holes > 0 &&
    ratingHoles > 0
  ) {
    return courseHandicap({
      index: player.index,
      slope: round.slope,
      rating: round.rating,
      ratingHoles,
      playingHoles: holes,
      playingPar: round.holes.reduce((sum, h) => sum + h.par, 0),
    });
  }
  return player.handicap ?? 0;
}

/**
 * The strokes a player actually plays off in a given game: their course
 * handicap, cut by that game's allowance.
 *
 * `game` is optional because not every caller is scoring one — the stats
 * screen and the Sandbagger award ask what a player's handicap is worth in
 * general, and an allowance is a property of a format being played.
 */
export function playingHandicap(round: Round, playerId: string, game?: GameType): number {
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return 0;
  const base = courseHandicapFor(round, player);
  if (!game) return base;
  const allowance = allowanceFor(round, game);
  return allowance === 100 ? base : withAllowance(base, allowance);
}

/** Strokes a player receives on a single hole given their course handicap. */
export function strokesReceivedOnHole(
  courseHandicap: number,
  strokeIndex: number,
  totalHoles: number
): number {
  if (!courseHandicap || courseHandicap <= 0 || !strokeIndex) return 0;
  let strokes = 0;
  if (strokeIndex <= courseHandicap) strokes += 1;
  if (strokeIndex <= courseHandicap - totalHoles) strokes += 1;
  return strokes;
}

/**
 * A player's score on a hole, net of handicap strokes when `useNet` is on.
 * Returns null when no score has been entered.
 */
export function holeScore(
  round: Round,
  playerId: string,
  hole: Hole,
  useNet: boolean,
  game?: GameType
): number | null {
  const raw = round.scores[hole.number]?.[playerId];
  if (raw == null) return null;
  if (!useNet) return raw;
  const hcp = playingHandicap(round, playerId, game);
  const si = strokeIndexMap(round)[hole.number];
  return raw - strokesReceivedOnHole(hcp, si, round.holes.length);
}

/** Total handicap strokes a player receives across the whole round. */
export function totalStrokesReceived(
  round: Round,
  playerId: string,
  game?: GameType
): number {
  const hcp = playingHandicap(round, playerId, game);
  if (hcp <= 0) return 0;
  const si = strokeIndexMap(round);
  return round.holes.reduce(
    (sum, h) => sum + strokesReceivedOnHole(hcp, si[h.number], round.holes.length),
    0
  );
}

/**
 * Whether this round uses handicaps at all — the gate for every handicap
 * display.
 *
 * Not the same as `options.useNet`, on two counts: league rounds ship
 * `useNet: false` (LeagueSetup spreads DEFAULT_OPTIONS) yet score net through
 * computeLeague, which reads `player.handicap` directly; and since scoring
 * went per-game, the round default is no longer the whole answer — one game
 * set to net is enough. Re-exported from `scoring.ts`, which owns that rule.
 */
export { usesHandicaps } from './scoring';
