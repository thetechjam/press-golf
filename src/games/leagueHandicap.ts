import type { Round } from '../types';
import { LEAGUE_MAX_SCORE, pickedUp } from './league';

/**
 * The league's own handicap system, from the 2025 rule sheet:
 *
 *   "an 'over par average of your most recent 5 matches' at 90% … (6 x .90 =
 *   5.4 and we round to the nearest whole number) … Brand new players and
 *   players with less than 3 matches played, will only receive 70% of their
 *   'over par average' until they complete 3 matches. In their 4th match,
 *   they will get 90%."
 *
 * The league director's spreadsheet is the official number. This is here so
 * a sub or a new player can be worked out on the spot, and so a regular's
 * history on this phone can be offered as a hint.
 */

/** How many recent matches the average is taken over. */
export const LEAGUE_HCP_MATCHES = 5;
/** Matches a player needs before the full allowance applies. */
export const LEAGUE_FULL_ALLOWANCE_AFTER = 3;

/** 70% until a player has completed 3 matches; 90% from their 4th. */
export const leagueAllowance = (matchesPlayed: number): number =>
  matchesPlayed < LEAGUE_FULL_ALLOWANCE_AFTER ? 0.7 : 0.9;

/** The handicap an over-par average plays to, rounded to the nearest whole. */
export function leagueHandicap(avgOverPar: number, matchesPlayed: number): number {
  // + 0 turns a -0 from rounding a small negative into a plain 0.
  return Math.round(avgOverPar * leagueAllowance(matchesPlayed)) + 0;
}

export interface LeagueHistory {
  /** League nights this player finished on this phone. */
  matches: number;
  /** Over par in each of the most recent (up to 5), newest first. */
  recent: number[];
  /** Mean of `recent`. */
  average: number;
  /** What that plays to under the allowance their match count earns. */
  handicap: number;
}

/**
 * A player's league record on this phone, matched by name, or null when
 * there is none. Only nights they finished every hole of count — a card with
 * holes missing would average as a good night. A pick-up counts as the
 * league maximum of 9, the number the card holds for it.
 */
export function leagueHistory(rounds: Round[], name: string): LeagueHistory | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  const nights: { date: string; at: number; overPar: number }[] = [];
  for (const r of rounds) {
    if (!r.options.league) continue;
    const p = r.players.find((x) => x.name.trim().toLowerCase() === key);
    if (!p) continue;
    let overPar = 0;
    let complete = true;
    for (const h of r.holes) {
      const g = pickedUp(r, h.number, p.id) ? LEAGUE_MAX_SCORE : r.scores[h.number]?.[p.id];
      if (g == null) {
        complete = false;
        break;
      }
      overPar += Math.min(g, LEAGUE_MAX_SCORE) - h.par;
    }
    if (complete) nights.push({ date: r.date, at: r.updatedAt, overPar });
  }
  if (!nights.length) return null;

  nights.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const recent = nights.slice(0, LEAGUE_HCP_MATCHES).map((n) => n.overPar);
  const average = recent.reduce((s, n) => s + n, 0) / recent.length;
  return {
    matches: nights.length,
    recent,
    average,
    handicap: leagueHandicap(average, nights.length),
  };
}
