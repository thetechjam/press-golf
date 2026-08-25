import type { Round } from './types';

/** A remembered player, derived from saved rounds rather than stored. */
export interface RosterEntry {
  name: string;
  /** Most recent handicap seen for this name; absent if never set. */
  handicap?: number;
}

/** The chip row is a shortcut, not a directory. */
export const ROSTER_LIMIT = 12;

/** Trimmed name, or '' for a player who was never named. */
const nameOf = (name: string): string => name.trim();

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
        byKey.set(key, p.handicap == null ? { name } : { name, handicap: p.handicap });
      } else if (seen.handicap == null && p.handicap != null) {
        // Keeps a handicap alive for someone whose recent rounds were gross,
        // rather than dropping it because the newest round happened not to
        // carry one.
        seen.handicap = p.handicap;
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
    named.push(p.handicap == null ? { name } : { name, handicap: p.handicap });
  }

  // One named player is a round someone abandoned during setup, not a crew.
  return named.length >= 2 ? named : [];
}

/** True when this user has never saved a round — drives first-run affordances. */
export function isFirstEverRound(rounds: Round[]): boolean {
  return rounds.length === 0;
}
