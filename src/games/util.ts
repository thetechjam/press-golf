import type { GameStanding, Round } from '../types';

type ScoredRound = Pick<Round, 'holes' | 'players' | 'scores'>;

/** A hole is complete when every player has a non-null score on it. */
const isHoleComplete = (round: ScoredRound, holeNumber: number): boolean =>
  round.players.every((p) => round.scores[holeNumber]?.[p.id] != null);

/**
 * Index of the first hole with any blank score — where a resumed round
 * should land. Falls back to the last hole when everything is scored,
 * so the Finish button is at hand.
 */
export function firstIncompleteHole(round: ScoredRound): number {
  const i = round.holes.findIndex((h) => !isHoleComplete(round, h.number));
  return i === -1 ? round.holes.length - 1 : i;
}

/** Number of fully-scored holes ("thru N" on the Home screen). */
export function completedHoleCount(round: ScoredRound): number {
  return round.holes.filter((h) => isHoleComplete(round, h.number)).length;
}

/**
 * Assigns ranks to standings (ties share a rank) and flags leaders.
 * Mutates the passed objects, then returns them sorted by rank.
 */
export function rankStandings(
  standings: GameStanding[],
  lowerIsBetter: boolean
): GameStanding[] {
  const ordered = [...standings].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value
  );

  let rank = 0;
  let prev: number | null = null;
  ordered.forEach((s, i) => {
    if (prev === null || s.value !== prev) {
      rank = i + 1;
      prev = s.value;
    }
    s.rank = rank;
  });

  // Only highlight a leader when scores actually differ.
  const hasSpread = new Set(standings.map((s) => s.value)).size > 1;
  standings.forEach((s) => {
    s.isLeader = hasSpread && s.rank === 1;
  });

  return ordered;
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
