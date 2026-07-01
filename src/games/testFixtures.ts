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
    status: 'in_progress',
  };
}
