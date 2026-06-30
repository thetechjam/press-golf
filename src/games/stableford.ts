import type { Round, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { rankStandings } from './util';

/** Points for a hole given score-relative-to-par (negative = under par). */
function pointsFor(scoreToPar: number, mode: 'standard' | 'modified'): number {
  if (mode === 'modified') {
    // Modified Stableford (International / PGA-style).
    if (scoreToPar <= -3) return 8; // albatross+
    if (scoreToPar === -2) return 5; // eagle
    if (scoreToPar === -1) return 2; // birdie
    if (scoreToPar === 0) return 0; // par
    if (scoreToPar === 1) return -1; // bogey
    return -3; // double bogey or worse
  }
  // Standard Stableford: par = 2, +1 per stroke better, floored at 0.
  return Math.max(0, 2 - scoreToPar);
}

export function computeStableford(round: Round): GameResult {
  const { useNet, stablefordMode } = round.options;

  const standings: GameStanding[] = round.players.map((p) => {
    let points = 0;
    let played = 0;
    for (const h of round.holes) {
      const score = holeScore(round, p.id, h, useNet);
      if (score == null) continue;
      played += 1;
      points += pointsFor(score - h.par, stablefordMode);
    }
    return {
      playerId: p.id,
      label: p.name,
      detail: played === 0 ? '—' : `${points} pts`,
      value: points,
      rank: 0,
      isLeader: false,
    };
  });

  const sorted = rankStandings(standings, false);
  const leader = sorted.find((s) => s.isLeader);
  const anyScores = round.players.some((p) =>
    round.holes.some((h) => round.scores[h.number]?.[p.id] != null)
  );

  return {
    gameType: 'stableford',
    title:
      stablefordMode === 'modified' ? 'Modified Stableford' : 'Stableford',
    status: !anyScores
      ? 'No scores yet'
      : leader
        ? `${leader.label} leads · ${leader.detail}`
        : 'All square',
    standings: sorted,
    note: useNet ? 'Net scoring' : undefined,
  };
}
