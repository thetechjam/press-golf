import type { Round } from '../types';
import { computeSettlement } from './settlement';

/**
 * Highest hole number where every player has a score, or null when no hole is
 * complete. Gates which hole may display a money swing.
 */
export function lastCompletedHole(round: Round): number | null {
  let last: number | null = null;
  for (const h of round.holes) {
    const complete = round.players.every((p) => round.scores[h.number]?.[p.id] != null);
    if (complete) last = h.number;
  }
  return last;
}

/**
 * Per-player money delta attributable to one hole: the settlement as-is minus
 * the settlement with that hole's scores removed.
 *
 * Only exact for the most recently completed hole. Removing an earlier hole
 * changes skins carry-over on every hole after it, which makes the delta a
 * counterfactual ("what if this hole had never been played") rather than that
 * hole's value. Callers MUST gate on `lastCompletedHole`.
 */
export function holeSwing(round: Round, holeNumber: number): Record<string, number> {
  const withHole = computeSettlement(round).totals;
  const scores = { ...round.scores };
  delete scores[holeNumber];
  const withoutHole = computeSettlement({ ...round, scores }).totals;

  const swing: Record<string, number> = {};
  for (const p of round.players) {
    const delta = (withHole[p.id] ?? 0) - (withoutHole[p.id] ?? 0);
    swing[p.id] = Math.round(delta * 100) / 100;
  }
  return swing;
}
