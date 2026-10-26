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
/**
 * Whether the round carries a slope and rating good enough to turn an Index
 * into strokes — judged against the holes the rating covers, not the holes
 * being played, for the nine-off-an-eighteen case `ratingHoles` exists for.
 */
export function roundRated(round: Pick<Round, 'holes' | 'slope' | 'rating' | 'ratingHoles'>): boolean {
  const holes = round.holes.length;
  const ratingHoles = round.ratingHoles ?? holes;
  return validSlope(round.slope) && validRating(round.rating, ratingHoles) && holes > 0 && ratingHoles > 0;
}

/**
 * The round's default for net scoring: on when anybody brought a handicap, by
 * either route — a stroke count other than 0, or an Index the course can
 * convert. The one rule, shared by Setup and Edit handicaps: the two used to
 * disagree, and saving the handicap sheet unchanged on an Index round turned
 * every untouched game gross.
 */
export function netByDefault(players: Player[], rated: boolean): boolean {
  return players.some((p) => (p.handicap ?? 0) !== 0 || (rated && validIndex(p.index)));
}

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

/**
 * The Rules of Handicapping's recommended allowances for a match (Appendix C):
 * a singles match at 100%, a four-ball at 90%.
 */
export const MATCH_ALLOWANCE = { singles: 100, fourBall: 90 } as const;

/**
 * The allowance a match is played off: the one chosen for the game in Setup
 * when there is one, otherwise the handbook's figure for the format. The
 * Setup row shows the same fallback, so what it says and what is played agree.
 */
export function matchAllowanceFor(round: Round, game: GameType, fourBall: boolean): number {
  const pct = round.options.allowanceByGame?.[game];
  if (typeof pct === 'number' && pct > 0 && pct <= 100) return pct;
  return fourBall ? MATCH_ALLOWANCE.fourBall : MATCH_ALLOWANCE.singles;
}

/**
 * The strokes each player in a match plays off, by id.
 *
 * A match is scored between its players, not against the course, so each
 * player's own course handicap is not what they play off. Rules of
 * Handicapping, Appendix C: "the player with the lowest Playing Handicap plays
 * off zero strokes relative to the other player(s). The other player(s)
 * receive(s) the difference" — and in a four-ball the 90% allowance is applied
 * to that difference, so 10, 18, 27 and 39 play off 0, 7, 15 and 26. A plus
 * handicap is simply the low man: they play off scratch and everyone else's
 * difference is measured from them.
 *
 * Trunk used to hand each side its full handicap on its own stroke-index holes,
 * which gave a 10 against a 6 shots on indexes 1–10 and the 6 shots on 1–6 —
 * six halved holes that should have been played level, and four shots for the
 * 10 on the wrong holes. The allocation itself (`strokesReceivedOnHole`) is
 * unchanged; only the number fed into it is.
 */
export function matchHandicaps(
  round: Round,
  ids: readonly string[],
  game: GameType,
  fourBall: boolean
): Record<string, number> {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  const course: Record<string, number> = {};
  for (const id of ids) {
    const player = round.players.find((p) => p.id === id);
    course[id] = player ? courseHandicapFor(round, player) : 0;
  }
  const low = Math.min(...ids.map((id) => course[id]));
  const pct = matchAllowanceFor(round, game, fourBall);
  for (const id of ids) out[id] = withAllowance(course[id] - low, pct);
  return out;
}

/**
 * A player's score on a hole, net of the strokes a given handicap gives them
 * there. Null when no score has been entered. The handicap is passed in rather
 * than looked up because a match plays off a relative one — see
 * `matchHandicaps`.
 */
export function netHoleScore(
  round: Round,
  playerId: string,
  hole: Hole,
  handicap: number
): number | null {
  const raw = round.scores[hole.number]?.[playerId];
  if (raw == null) return null;
  if (!handicap) return raw;
  const si = strokeIndexMap(round)[hole.number];
  return raw - strokesReceivedOnHole(handicap, si, round.holes.length);
}

/** A handicap for display: a plus player's negative number reads as "+3". */
export const formatHandicap = (n: number): string => (n < 0 ? `+${-n}` : `${n}`);

/**
 * Strokes a player receives on a single hole given their course handicap.
 *
 * One stroke a hole down the stroke index, then round again from the top for
 * every full lap of the card the handicap covers: a 40 on eighteen holes gets
 * two everywhere and a third on the four hardest. The old two-stroke ceiling
 * quietly lost four of those strokes while the entry field accepted 54.
 *
 * A plus handicap is negative here and gives strokes back, one a hole from the
 * easiest end of the card — the same walk in the other direction.
 */
export function strokesReceivedOnHole(
  courseHandicap: number,
  strokeIndex: number,
  totalHoles: number
): number {
  if (!courseHandicap || !strokeIndex || totalHoles <= 0) return 0;
  const hcp = Math.abs(courseHandicap);
  const laps = Math.floor(hcp / totalHoles);
  const rest = hcp % totalHoles;
  const extra =
    courseHandicap > 0
      ? strokeIndex <= rest ? 1 : 0
      : strokeIndex > totalHoles - rest ? 1 : 0;
  const strokes = laps + extra;
  // `0 * -1` is -0, which Object.is-based assertions tell apart from 0.
  return strokes === 0 ? 0 : Math.sign(courseHandicap) * strokes;
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
  return netHoleScore(round, playerId, hole, playingHandicap(round, playerId, game));
}

/**
 * Handicap strokes a player receives over some of the round's holes — the
 * ones scored so far, when a running total is being compared mid-round.
 * Allocation is always off the full card, so a stroke lands on the same hole
 * here as it does on the scorecard.
 */
export function strokesReceivedOver(
  round: Round,
  playerId: string,
  holes: readonly Hole[],
  game?: GameType
): number {
  const hcp = playingHandicap(round, playerId, game);
  if (hcp === 0) return 0;
  const si = strokeIndexMap(round);
  return holes.reduce(
    (sum, h) => sum + strokesReceivedOnHole(hcp, si[h.number], round.holes.length),
    0
  );
}

/** Total handicap strokes a player receives across the whole round. */
export function totalStrokesReceived(
  round: Round,
  playerId: string,
  game?: GameType
): number {
  return strokesReceivedOver(round, playerId, round.holes, game);
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
