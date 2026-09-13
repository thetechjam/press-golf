import type { JunkKind, Round } from './types';
import { strokeIndexMap, strokesReceivedOnHole, usesHandicaps } from './games/handicap';
import { claimsOn, junkMeta } from './games/junk';
import { ordinal } from './games/util';
import { anyNetScoring } from './games/scoring';
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

/**
 * One hole's worth of one player's junk.
 *
 * Grouped by hole rather than listed flat because two bets picked up on the
 * same hole are one story — out of the sand and holed it — and the hole number
 * is the part somebody cross-references against the grid above.
 */
export interface ScorecardJunkHole {
  holeNumber: number;
  kinds: JunkKind[];
  /** 'Sandie + Barkie' */
  label: string;
}

export interface ScorecardJunkEntry {
  playerId: string;
  name: string;
  holes: ScorecardJunkHole[];
  /** Claims in total — the number the money settles on. */
  count: number;
  /** 'Greenie (3rd) · Sandie + Barkie (7th)' */
  detail: string;
}

export interface ScorecardModel {
  holes: ScorecardHole[];
  parTotal: number;
  showHandicap: boolean;
  /** Empty for a round covering only one nine, where a subtotal restates TOT. */
  nines: ScorecardNine[];
  rows: ScorecardRow[];
  /** Empty unless the round is playing junk and somebody claimed some. */
  junk: ScorecardJunkEntry[];
}

/**
 * The junk claimed, written out under the card.
 *
 * There is no column for it and there cannot be one: junk is claimed rather
 * than scored, so a cell that already holds a score, a stroke dot and a league
 * chip has nothing left to say a greenie with. Underneath is where a paper
 * card carries side bets too, and in a junk round it is the half of the
 * afternoon the grid above is blind to.
 *
 * Only players who claimed something appear — a name with nothing after it is
 * a line somebody has to read to learn nothing. Holes run in play order so the
 * footer scans the same direction as the grid, and kinds within a hole keep
 * `claimsOn`'s list order so the same haul reads the same way twice.
 */
function junkEntries(round: Round): ScorecardJunkEntry[] {
  // Claims can outlive the game being deselected. They stay in storage, but a
  // card should show the games the round is playing, which is the same rule
  // settlement and the awards apply.
  if (!round.games.includes('junk')) return [];

  const entries: ScorecardJunkEntry[] = [];
  for (const p of round.players) {
    const holes: ScorecardJunkHole[] = [];
    for (const h of round.holes) {
      const kinds = claimsOn(round, h.number, p.id);
      if (kinds.length === 0) continue;
      holes.push({
        holeNumber: h.number,
        kinds,
        label: kinds.map((k) => junkMeta(k).label).join(' + '),
      });
    }
    if (holes.length === 0) continue;
    entries.push({
      playerId: p.id,
      name: p.name,
      holes,
      count: holes.reduce((n, g) => n + g.kinds.length, 0),
      detail: holes.map((g) => `${g.label} (${ordinal(g.holeNumber)})`).join(' · '),
    });
  }
  return entries;
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
  // The stroke dots say "a stroke falls on this hole", which is true as soon as
  // one game is scored net — not only when the whole round is.
  const useNet = anyNetScoring(round);
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
    junk: junkEntries(round),
  };
}
