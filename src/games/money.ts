import type { Round, Hole } from '../types';
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

/**
 * The swing to show in the Hole tab's ticker slot for `hole`, or null when it
 * shouldn't be shown there and the running-total ticker should render instead.
 *
 * This is the single copy of the swing's correctness gate — never league
 * play, only while stakes are active, only for the most recently completed
 * hole (see `holeSwing`'s doc comment for why), and only when it actually
 * moved money. Callers must not re-implement this gate themselves.
 */
export function visibleSwing(round: Round, hole: Hole): Record<string, number> | null {
  if (round.options.league) return null;
  if (!computeSettlement(round).active) return null;
  if (lastCompletedHole(round) !== hole.number) return null;
  const s = holeSwing(round, hole.number);
  return Object.values(s).some((v) => v !== 0) ? s : null;
}
