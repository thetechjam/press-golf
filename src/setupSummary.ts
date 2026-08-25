import type { Hole, GameType, Stakes } from './types';
import { gameMeta } from './games';

/**
 * One-line summaries for the collapsed rows on New Round.
 *
 * These carry real weight: a row showing "18 holes · par 72" tells a
 * first-time user the question is already answered, which is what makes
 * skipping it feel safe rather than negligent. Every function therefore
 * returns a meaningful string for the empty case — never ''.
 */

export function courseSummary(course: string): string {
  const name = course.trim();
  return name || 'Not set';
}

export function holesSummary(holes: Hole[]): string {
  if (holes.length === 0) return 'No holes';
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  return `${holes.length} holes · par ${par}`;
}

export function gamesSummary(games: GameType[]): string {
  if (games.length === 0) return 'No games';
  return games.map((g) => gameMeta(g).label).join(', ');
}

/** `$5` for whole dollars, `$2.50` otherwise. */
function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function stakesSummary(games: GameType[], stakes: Stakes): string {
  // Driven by `games`, not by the keys of `stakes`: deselecting a game leaves
  // its stake behind in options.stakes, and that money is not in play.
  const staked = games
    .filter((g) => (stakes?.[g] ?? 0) > 0)
    .map((g) => `${money(stakes[g] as number)} ${gameMeta(g).label}`);

  return staked.length === 0 ? 'No stakes' : staked.join(' · ');
}

/**
 * Summary for the League screen's collapsed pars/stroke-index row.
 *
 * Shows par always, and calls out an incomplete stroke index only when there
 * is one. League nights allocate handicap strokes down the stroke index, so a
 * hole missing its index changes how the match scores — that is worth saying
 * out loud from a collapsed row. The complete case stays silent: league holes
 * are seeded with an index by default, so "SI set" would be noise on almost
 * every round and would train the eye to skip the line that matters.
 *
 * The hole count is deliberately omitted — a league nine is always nine.
 */
export function leagueCourseSummary(holes: Hole[]): string {
  if (holes.length === 0) return 'No holes';
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  const missingSI = holes.some((h) => h.strokeIndex == null);
  // "SI gaps" rather than "SI incomplete": the row header gives the summary
  // ~110px beside a long label, and "incomplete" truncated to "SI inco…" —
  // cutting off the one word the line exists to deliver. Short enough to
  // survive is a hard requirement for a summary, not a stylistic preference.
  return missingSI ? `Par ${par} · SI gaps` : `Par ${par}`;
}
