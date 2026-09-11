/**
 * Course handicap from a Handicap Index, and the allowance applied on top.
 *
 * A Handicap Index is portable — it is the number a player carries between
 * courses. A course handicap is what that Index is worth on a particular set
 * of holes, and it is what stroke allocation actually spends. Press has always
 * stored the second; this converts the first into it.
 *
 *   course handicap = Index × (Slope ÷ 113) + (Rating − Par)
 *
 * 113 is the slope of a course of average difficulty, so the ratio scales the
 * Index by how much harder these holes are than average. The rating term adds
 * the strokes a scratch player is expected to be over par here.
 */

/** Slope is defined over this range; anything outside is a typo or bad data. */
export const MIN_SLOPE = 55;
export const MAX_SLOPE = 155;
/** The slope of a course of average difficulty — the divisor in the formula. */
const STANDARD_SLOPE = 113;

/** A Handicap Index runs from +10 (better than scratch) to 54. */
export const MIN_INDEX = -10;
export const MAX_INDEX = 54;

export interface CourseHandicapInput {
  /** The player's 18-hole Handicap Index. */
  index: number;
  slope: number;
  /** Course rating in strokes, covering `ratingHoles` holes. */
  rating: number;
  /** How many holes the slope and rating describe — 18 for a full card. */
  ratingHoles: number;
  /** How many holes are actually being played. */
  playingHoles: number;
  /** Total par of the holes being played. */
  playingPar: number;
}

/**
 * The course handicap for the holes being played, rounded to whole strokes.
 *
 * Everything is converted to a per-hole basis first, which is what lets one
 * formula cover the three real cases without special-casing any of them: a
 * full round off an 18-hole rating; a nine played off an 18-hole rating, where
 * both the Index and the rating are worth half; and a nine played off a course
 * record that already carries nine-hole figures, where the rating is used
 * whole. An Index is always an 18-hole number, so it is halved by the ratio of
 * holes played, never by which rating it met.
 */
export function courseHandicap({
  index,
  slope,
  rating,
  ratingHoles,
  playingHoles,
  playingPar,
}: CourseHandicapInput): number {
  if (ratingHoles <= 0 || playingHoles <= 0) return 0;
  const indexForHoles = (index / 18) * playingHoles;
  const ratingForHoles = (rating / ratingHoles) * playingHoles;
  const rounded = Math.round(
    indexForHoles * (slope / STANDARD_SLOPE) + (ratingForHoles - playingPar)
  );
  // Math.round(-0.1) is -0, which prints as "-0" wherever a handicap is shown
  // and reads as a mistake. A shade under scratch is scratch.
  return rounded === 0 ? 0 : rounded;
}

/**
 * A handicap reduced by an allowance, rounded to whole strokes.
 *
 * Allowances exist because a format can be unfair at full handicap: in a
 * four-ball the high handicapper only has to produce one good hole to take it,
 * so the handbook cuts everyone to 85%. Applied to the course handicap, after
 * it has been worked out — never to the Index, which is not a number of
 * strokes.
 */
export function withAllowance(handicap: number, allowancePercent: number): number {
  const rounded = Math.round(handicap * (allowancePercent / 100));
  return rounded === 0 ? 0 : rounded;
}

/** True when a slope could be a real one. */
export const validSlope = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_SLOPE && n <= MAX_SLOPE;

/**
 * True when a rating could be a real one for this many holes.
 *
 * Ratings sit near the par of the holes rated, so the test is "within a dozen
 * strokes of a plausible par" rather than a fixed range — that way a nine-hole
 * rating of 35.2 and an eighteen-hole 74.8 both pass, and a 72 typed into a
 * nine-hole record does not.
 */
export function validRating(n: unknown, holes: number): n is number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  const nominalPar = holes * 4;
  return n >= nominalPar - 12 && n <= nominalPar + 12;
}

/** True when an Index could be a real one. */
export const validIndex = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_INDEX && n <= MAX_INDEX;
