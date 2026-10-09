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

/**
 * Where a resumed round should open: the hole after the furthest one with a
 * score on it, or that hole itself while it is still part-scored. The first
 * blank is not it — a hole skipped on purpose with "Skip anyway" put the card
 * back on it every time the round was reopened, eleven holes behind the
 * group. Falls back to the last hole when everything is scored, so the
 * Finish button is at hand, and to the first for a round not started.
 */
export function resumeHole(round: ScoredRound): number {
  let furthest = -1;
  round.holes.forEach((h, i) => {
    if (round.players.some((p) => round.scores[h.number]?.[p.id] != null)) furthest = i;
  });
  if (furthest === -1) return 0;
  if (!isHoleComplete(round, round.holes[furthest].number)) return furthest;
  return Math.min(furthest + 1, round.holes.length - 1);
}

/** Whether a hole has some scores but not everyone's. */
export const isHolePartial = (round: ScoredRound, holeNumber: number): boolean =>
  !isHoleComplete(round, holeNumber) &&
  round.players.some((p) => round.scores[holeNumber]?.[p.id] != null);

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

/**
 * Ranks the standings of the players who have scored, and puts everyone with
 * no score on any hole after them, unranked as leader. Ranked on the 0 they
 * would otherwise carry, a player who had not teed off led stroke play, and
 * led quota once the field was under pace.
 */
export function rankPlayed(
  round: ScoredRound,
  standings: GameStanding[],
  lowerIsBetter: boolean
): GameStanding[] {
  const played = (s: GameStanding) =>
    !s.playerId || round.holes.some((h) => round.scores[h.number]?.[s.playerId!] != null);
  const sorted = rankStandings(standings.filter(played), lowerIsBetter);
  for (const s of standings) {
    if (played(s)) continue;
    s.rank = sorted.length + 1;
    s.isLeader = false;
    sorted.push(s);
  }
  return sorted;
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
