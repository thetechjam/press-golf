import type { GameStanding } from '../types';

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
