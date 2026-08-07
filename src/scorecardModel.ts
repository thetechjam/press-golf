import type { Round } from './types';
import { strokeIndexMap, strokesReceivedOnHole, usesHandicaps } from './games/handicap';
import { leagueStrokesOnHole, type LeagueMatchKey } from './games/league';
import { scoreMarkClass } from './scoreMark';

/**
 * The scorecard grid, computed once from a Round. Both the on-screen table and
 * the shareable PNG render from this, so the image can't drift from the screen.
 */

export interface ScorecardHole {
  number: number;
  par: number;
  strokeIndex: number;
}

export interface ScorecardCell {
  holeNumber: number;
  score: number | null;
  /** 0 when there's no score. */
  toPar: number;
  /** '' when there's no score. */
  markClass: string;
  /** Handicap strokes received — non-league net rounds only. */
  dots: number;
  /** Which matches give a stroke here — league rounds only. */
  chips: LeagueMatchKey[];
}

export interface ScorecardRow {
  playerId: string;
  name: string;
  handicap: number;
  cells: ScorecardCell[];
  /** null when the player has no scores yet. */
  gross: number | null;
  /** Against the par of played holes only. null when none played. */
  toPar: number | null;
}

export interface ScorecardModel {
  holes: ScorecardHole[];
  parTotal: number;
  showHandicap: boolean;
  rows: ScorecardRow[];
}

export const formatToPar = (n: number): string =>
  n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;

export function buildScorecard(round: Round): ScorecardModel {
  const siMap = strokeIndexMap(round);
  const isLeague = round.options.league != null;
  const useNet = round.options.useNet;
  const total = round.holes.length;

  // League strokes come off three baselines, so a dot count would be ambiguous
  // about which match a stroke applies to — HoleView names the matches with
  // chips for the same reason. leagueStrokesOnHole recomputes its baselines on
  // every call, so build the whole map once rather than calling per cell.
  const chipsByHole: Record<number, Record<string, LeagueMatchKey[]>> = {};
  if (isLeague) {
    for (const h of round.holes) chipsByHole[h.number] = leagueStrokesOnHole(round, h);
  }

  const holes: ScorecardHole[] = round.holes.map((h) => ({
    number: h.number,
    par: h.par,
    strokeIndex: siMap[h.number],
  }));

  const rows: ScorecardRow[] = round.players.map((p) => {
    const handicap = p.handicap ?? 0;
    let gross = 0;
    let playedPar = 0;
    let played = 0;

    const cells: ScorecardCell[] = round.holes.map((h) => {
      const score = round.scores[h.number]?.[p.id] ?? null;
      if (score != null) {
        gross += score;
        playedPar += h.par;
        played += 1;
      }
      return {
        holeNumber: h.number,
        score,
        toPar: score == null ? 0 : score - h.par,
        markClass: score == null ? '' : scoreMarkClass(score - h.par),
        dots:
          !isLeague && useNet
            ? strokesReceivedOnHole(handicap, siMap[h.number], total)
            : 0,
        chips: isLeague ? (chipsByHole[h.number][p.id] ?? []) : [],
      };
    });

    return {
      playerId: p.id,
      name: p.name,
      handicap,
      cells,
      gross: played ? gross : null,
      toPar: played ? gross - playedPar : null,
    };
  });

  return {
    holes,
    parTotal: round.holes.reduce((s, h) => s + h.par, 0),
    showHandicap: usesHandicaps(round),
    rows,
  };
}
