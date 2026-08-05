import type { Round } from '../types';

/** playerId -> new handicap, or undefined to clear it. */
export type HandicapEdits = Record<string, number | undefined>;

const MAX_HANDICAP = 54;

const clamp = (v: number): number => Math.min(Math.max(0, Math.round(v)), MAX_HANDICAP);

const merged = (round: Round, edits: HandicapEdits) =>
  round.players.map((p) => {
    if (!(p.id in edits)) return p;
    const v = edits[p.id];
    return v == null || Number.isNaN(v) ? { ...p, handicap: undefined } : { ...p, handicap: clamp(v) };
  });

/** Returns an error message, or null when the edits are valid to save. */
export function validateHandicaps(round: Round, edits: HandicapEdits): string | null {
  if (!round.options.league) return null;
  // League scoring is net off these values in all three matches — a blank must
  // not silently become scratch (same rule LeagueSetup enforces at creation).
  const ok = merged(round, edits).every((p) => p.handicap != null);
  return ok ? null : 'Enter a handicap for all four players — league scoring needs it.';
}

/**
 * Applies handicap edits and recomputes `useNet` with Setup's rule, so adding a
 * handicap to a round that started gross actually switches on net scoring
 * instead of writing a value nothing reads.
 */
export function applyHandicaps(round: Round, edits: HandicapEdits): Round {
  const players = merged(round, edits);
  // League rounds carry useNet: false by construction and score net through
  // computeLeague regardless. Recomputing it here would switch on stroke dots
  // they have never shown — a behavior change this has no mandate to make.
  const useNet = round.options.league
    ? round.options.useNet
    : players.some((p) => (p.handicap ?? 0) > 0);
  return { ...round, players, options: { ...round.options, useNet } };
}
