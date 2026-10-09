import type { Round } from '../types';
import { netByDefault, roundRated } from './handicap';

/** playerId -> new handicap (or Index, on a rated round), or undefined to clear it. */
export type HandicapEdits = Record<string, number | undefined>;

/**
 * Which number the sheet edits for this round. On a course with a slope and
 * rating the strokes come from the Index, so that is the number to change —
 * a typed stroke count is ignored while a valid Index exists, and editing it
 * would have done nothing.
 */
export const editsIndex = (round: Round): boolean => !round.options.league && roundRated(round);

const MAX_HANDICAP = 54;
/** A plus handicap, as a negative number: +10 is the best the system issues. */
const MIN_HANDICAP = -10;

const clamp = (v: number): number =>
  Math.min(Math.max(MIN_HANDICAP, Math.round(v)), MAX_HANDICAP);

/** The Handicap Index range the system issues, same as courseHandicap's. */
const MAX_INDEX = 54;
const MIN_INDEX = -10;
const clampIndex = (v: number): number =>
  Math.min(Math.max(MIN_INDEX, Math.round(v * 10) / 10), MAX_INDEX);

const merged = (round: Round, edits: HandicapEdits) => {
  const index = editsIndex(round);
  return round.players.map((p) => {
    if (!(p.id in edits)) return p;
    const v = edits[p.id];
    const blank = v == null || Number.isNaN(v);
    if (index) return { ...p, index: blank ? undefined : clampIndex(v) };
    return { ...p, handicap: blank ? undefined : clamp(v) };
  });
};

/** Returns an error message, or null when the edits are valid to save. */
export function validateHandicaps(round: Round, edits: HandicapEdits): string | null {
  if (!round.options.league) return null;
  // League scoring is net off these values in all three matches — a blank must
  // not silently become scratch (same rule LeagueSetup enforces at creation).
  // A first-night player may stay blank: tonight's score is what sets it.
  const firstNight = round.options.league.firstNight ?? [];
  const ok = merged(round, edits).every((p) => p.handicap != null || firstNight.includes(p.id));
  return ok ? null : 'Enter a handicap for every player — league scoring needs it.';
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
    : netByDefault(players, roundRated(round));
  return { ...round, players, options: { ...round.options, useNet } };
}

/**
 * Settles a first-night league player's handicap: writes it onto the player
 * and takes them off the first-night list, which turns the board's results
 * from provisional into scored.
 */
export function setFirstNightHandicap(round: Round, playerId: string, handicap: number): Round {
  const league = round.options.league;
  if (!league) return round;
  const firstNight = (league.firstNight ?? []).filter((id) => id !== playerId);
  const nextLeague = { ...league };
  if (firstNight.length) nextLeague.firstNight = firstNight;
  else delete nextLeague.firstNight;
  return {
    ...round,
    players: round.players.map((p) => (p.id === playerId ? { ...p, handicap } : p)),
    options: { ...round.options, league: nextLeague },
  };
}
