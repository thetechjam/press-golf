import type { Round, Hole, GameResult, GameStanding } from '../types';
import { strokeIndexMap, strokesReceivedOnHole } from './handicap';
import { rankStandings } from './util';

/**
 * Quota (also called Points, or 39-ing).
 *
 * Every player is set a target — 2 points a hole, less their handicap — and
 * then plays for points on the Stableford scale. Beat your number and you are
 * plus; miss it and you are minus. The handicap is spent entirely on the
 * target, which is why this game is scored on **gross** strokes: taking
 * handicap strokes off the card as well would hand every stroke out twice.
 * That is the one rule in here worth getting wrong only once.
 */

/** Quota points for a hole: par = 2, one more per stroke better, never below 0. */
export const quotaPointsFor = (toPar: number): number => Math.max(0, 2 - toPar);

/**
 * Strokes a player receives over a set of holes — the handicap that the quota
 * is actually built from.
 *
 * Read through the round's own stroke-index allocation rather than by halving
 * a handicap for a nine, so a player's quota and the strokes they would get in
 * any other net game on the same card always tell the same story.
 */
function strokesOver(round: Round, playerId: string, holes: Hole[]): number {
  const hcp = round.players.find((p) => p.id === playerId)?.handicap ?? 0;
  if (hcp <= 0) return 0;
  const si = strokeIndexMap(round);
  return holes.reduce(
    (sum, h) => sum + strokesReceivedOnHole(hcp, si[h.number], round.holes.length),
    0
  );
}

/** A player's target for the full round: 2 a hole, less the strokes they get. */
export function quotaFor(round: Round, playerId: string): number {
  return 2 * round.holes.length - strokesOver(round, playerId, round.holes);
}

export function computeQuota(round: Round): GameResult {
  const standings: GameStanding[] = round.players.map((p) => {
    const played: Hole[] = [];
    let points = 0;
    for (const h of round.holes) {
      const gross = round.scores[h.number]?.[p.id];
      if (gross == null) continue;
      played.push(h);
      points += quotaPointsFor(gross - h.par);
    }

    // The quota is a full-round target, so measuring against all of it while
    // the round is half played would put every player deep in the red — and,
    // worse, would move money between players whose quotas differ before a
    // ball was struck. Prorating to the holes actually scored asks the honest
    // mid-round question ("are you keeping pace?") and lands on exactly the
    // full quota once the last hole is in.
    const pace = 2 * played.length - strokesOver(round, p.id, played);
    const full = quotaFor(round, p.id);

    return {
      playerId: p.id,
      label: p.name,
      detail: played.length === 0 ? `quota ${full}` : `${points} pts · quota ${full}`,
      value: points - pace,
      rank: 0,
      isLeader: false,
    };
  });

  const sorted = rankStandings(standings, false);
  const leader = sorted.find((s) => s.isLeader);
  const anyScores = round.players.some((p) =>
    round.holes.some((h) => round.scores[h.number]?.[p.id] != null)
  );

  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return {
    gameType: 'quota',
    title: 'Quota',
    status: !anyScores
      ? 'No scores yet'
      : leader
        ? `${leader.label} is ${signed(leader.value)} on quota`
        : 'All square',
    standings: sorted,
    note: 'Gross scores — the handicap is already in the quota.',
  };
}
