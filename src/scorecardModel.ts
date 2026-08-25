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

/**
 * A subtotal column standing between the holes of one nine and the next.
 * `afterIndex` indexes into `ScorecardModel.holes`, so a renderer can walk the
 * holes in order and drop the column in without knowing anything about nines.
 */
export interface ScorecardNine {
  label: 'OUT' | 'IN';
  afterIndex: number;
  par: number;
}

export interface ScorecardRow {
  playerId: string;
  name: string;
  handicap: number;
  cells: ScorecardCell[];
  /** Parallel to ScorecardModel.nines. null when that nine has no scores yet. */
  nineTotals: (number | null)[];
  /** null when the player has no scores yet. */
  gross: number | null;
  /** Against the par of played holes only. null when none played. */
  toPar: number | null;
}

export interface ScorecardModel {
  holes: ScorecardHole[];
  parTotal: number;
  showHandicap: boolean;
  /** Empty for a round covering only one nine, where a subtotal restates TOT. */
  nines: ScorecardNine[];
  rows: ScorecardRow[];
}

/**
 * Splits the holes, in play order, into runs belonging to the same nine.
 *
 * Deliberately keyed off play order rather than hole number: a shotgun start
 * off the 10th renders 10–18 first, and a subtotal is only meaningful sitting
 * beside the nine it sums, so that card gets IN then OUT. A round that covers
 * a single nine yields one run and therefore no subtotal columns at all.
 */
function nineRuns(holes: ScorecardHole[]): { label: 'OUT' | 'IN'; from: number; to: number }[] {
  const runs: { label: 'OUT' | 'IN'; from: number; to: number }[] = [];
  holes.forEach((h, i) => {
    const label: 'OUT' | 'IN' = h.number <= 9 ? 'OUT' : 'IN';
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.to = i;
    else runs.push({ label, from: i, to: i });
  });
  return runs;
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

  const runs = nineRuns(holes);
  // One run means the only subtotal available would repeat TOT verbatim.
  const nines: ScorecardNine[] =
    runs.length > 1
      ? runs.map((r) => ({
          label: r.label,
          afterIndex: r.to,
          par: holes.slice(r.from, r.to + 1).reduce((s, h) => s + h.par, 0),
        }))
      : [];

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

    // Played holes only, matching `gross` — a half-finished nine shows its
    // running total rather than waiting for the ninth score.
    const nineTotals = (nines.length ? runs : []).map((r) => {
      let sum = 0;
      let any = false;
      for (let i = r.from; i <= r.to; i += 1) {
        const v = cells[i].score;
        if (v != null) {
          sum += v;
          any = true;
        }
      }
      return any ? sum : null;
    });

    return {
      playerId: p.id,
      name: p.name,
      handicap,
      cells,
      nineTotals,
      gross: played ? gross : null,
      toPar: played ? gross - playedPar : null,
    };
  });

  return {
    holes,
    parTotal: round.holes.reduce((s, h) => s + h.par, 0),
    showHandicap: usesHandicaps(round),
    nines,
    rows,
  };
}
