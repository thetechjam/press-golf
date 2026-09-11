import type { Round, Player } from './types';

/** A remembered player, derived from saved rounds rather than stored. */
export interface RosterEntry {
  name: string;
  /** Most recent handicap seen for this name; absent if never set. */
  handicap?: number;
  /**
   * Most recent Handicap Index seen for this name.
   *
   * Worth more than the handicap when recalling somebody: a course handicap
   * was worked out for the course it was played on and means nothing at the
   * next one, while an Index is the same number wherever it is carried. Kept
   * alongside rather than instead, because a player who has only ever entered
   * strokes still has to come back with them.
   */
  index?: number;
}

/** The chip row is a shortcut, not a directory. */
export const ROSTER_LIMIT = 12;

/** Trimmed name, or '' for a player who was never named. */
const nameOf = (name: string): string => name.trim();

/** A roster entry carrying only the figures this player actually has. */
const entryFor = (name: string, p: Player): RosterEntry => ({
  name,
  ...(p.handicap == null ? {} : { handicap: p.handicap }),
  ...(p.index == null ? {} : { index: p.index }),
});

/**
 * Distinct players across every saved round, most-recent-first.
 *
 * Callers pass `listRounds()`, which is already sorted newest-first, so
 * "first seen while walking" means "most recent" throughout — that is what
 * makes both the spelling and the handicap rules below one-liners. Do not
 * sort here; re-sorting would silently invert both.
 */
export function buildRoster(rounds: Round[]): RosterEntry[] {
  const byKey = new Map<string, RosterEntry>();

  for (const round of rounds) {
    for (const p of round.players) {
      const name = nameOf(p.name);
      // Setup seeds every new round with two blank players, so abandoned
      // rounds are full of them. They must never reach the roster.
      if (!name) continue;

      const key = name.toLowerCase();
      const seen = byKey.get(key);

      if (!seen) {
        byKey.set(key, entryFor(name, p));
      } else {
        // Keeps a figure alive for someone whose recent rounds were gross,
        // rather than dropping it because the newest round happened not to
        // carry one. Each is filled independently: a player can have an Index
        // from one round and strokes from another.
        if (seen.handicap == null && p.handicap != null) seen.handicap = p.handicap;
        if (seen.index == null && p.index != null) seen.index = p.index;
      }
    }
  }

  return [...byKey.values()].slice(0, ROSTER_LIMIT);
}

/**
 * The players of the most recent round, in that round's order — the "same
 * crew" shortcut. Empty when there is nothing worth offering.
 */
export function lastCrew(rounds: Round[]): RosterEntry[] {
  const latest = rounds[0];
  if (!latest) return [];

  const named: RosterEntry[] = [];
  for (const p of latest.players) {
    const name = nameOf(p.name);
    if (!name) continue;
    named.push(entryFor(name, p));
  }

  // One named player is a round someone abandoned during setup, not a crew.
  return named.length >= 2 ? named : [];
}

/** True when this user has never saved a round — drives first-run affordances. */
export function isFirstEverRound(rounds: Round[]): boolean {
  return rounds.length === 0;
}

/**
 * Places a recalled player into the roster of a round being set up: into the
 * first empty slot if there is one, appended otherwise.
 *
 * Setup seeds every new round with two blank players, so a plain append left
 * those blanks stranded above the people just picked — two taps produced four
 * rows, two of them empty. `start()` filters blanks out, so the round created
 * was correct while the screen said otherwise, which is the worse of the two
 * failures: nothing looked broken until you counted the rows.
 *
 * Fills the first blank wherever it sits, not only a trailing one — a slot
 * cleared in the middle is still a slot the user expects to be used.
 */
export function placePlayer(players: Player[], entry: Player): Player[] {
  const blank = players.findIndex((p) => !p.name.trim());
  if (blank === -1) return [...players, entry];
  return players.map((p, i) => (i === blank ? entry : p));
}
