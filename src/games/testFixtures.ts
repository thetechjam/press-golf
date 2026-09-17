import type {
  Round,
  Player,
  Hole,
  GameType,
  GameOptions,
  Scores,
} from '../types';
import { DEFAULT_OPTIONS } from '../types';

/**
 * Test-only builders for realistic Round fixtures. Kept out of *.test.ts so the
 * same known-scorecards can be shared across engine suites.
 */

export function player(id: string, name: string, handicap?: number): Player {
  return handicap == null ? { id, name } : { id, name, handicap };
}

/** Builds `count` holes, all par `par`, with sequential stroke indexes 1..count. */
export function holes(count: number, par = 4): Hole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par,
    strokeIndex: i + 1,
  }));
}

/** 18 holes, all par 4, stroke index = hole number. */
export function holes18(par = 4): Hole[] {
  return holes(18, par);
}

/**
 * A scorecard a course would actually print: par 72 from four par 3s and four
 * par 5s, with the stroke indexes allocated odd across the front nine and even
 * across the back, as the Rules of Handicapping lay them out.
 *
 * `holes18()` is eighteen par 4s ranked 1,2,3…18, which is right for the
 * scoring engines — they do not care what the pars are — and wrong for
 * anything that judges whether a card is real. `courses/validate.ts` reads
 * exactly this shape as a placeholder, because that is what it is.
 */
export function realCard18(): Hole[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  const si = [5, 1, 15, 7, 11, 3, 17, 9, 13, 6, 2, 16, 8, 12, 4, 18, 10, 14];
  return pars.map((par, i) => ({ number: i + 1, par, strokeIndex: si[i] }));
}

/**
 * Builds a Scores object from a per-player array of hole scores.
 * `byPlayer` maps playerId -> array of scores indexed by hole order (undefined = not entered).
 */
export function scoresFrom(
  hs: Hole[],
  byPlayer: Record<string, (number | null | undefined)[]>
): Scores {
  const scores: Scores = {};
  hs.forEach((h, i) => {
    scores[h.number] = {};
    for (const [pid, arr] of Object.entries(byPlayer)) {
      const v = arr[i];
      if (v != null) scores[h.number][pid] = v;
    }
  });
  return scores;
}

export interface RoundOverrides {
  players?: Player[];
  holes?: Hole[];
  games?: GameType[];
  options?: Partial<GameOptions>;
  scores?: Scores;
  wolf?: Round['wolf'];
  presses?: number[];
  junk?: Round['junk'];
  /** The course's figures, which turn a player's Index into strokes. */
  slope?: number;
  rating?: number;
  /** How many holes the rating covers, when not the number being played. */
  ratingHoles?: number;
  status?: Round['status'];
}

export function makeRound(o: RoundOverrides = {}): Round {
  const hs = o.holes ?? holes18();
  const ps = o.players ?? [player('p1', 'Al'), player('p2', 'Bo')];
  return {
    id: 'r1',
    date: '2026-07-01',
    createdAt: 0,
    updatedAt: 0,
    players: ps,
    holes: hs,
    games: o.games ?? [],
    options: { ...DEFAULT_OPTIONS, ...o.options, stakes: { ...(o.options?.stakes ?? {}) } },
    scores: o.scores ?? {},
    wolf: o.wolf ?? {},
    presses: o.presses,
    junk: o.junk,
    slope: o.slope,
    rating: o.rating,
    ratingHoles: o.ratingHoles,
    status: o.status ?? 'in_progress',
  };
}
