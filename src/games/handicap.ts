import type { Round, Hole } from '../types';
import { strokeIndexesUsable } from './strokeIndex';

/**
 * Stroke index per hole. Uses the values the round carries when they form a
 * usable 1..N ranking; otherwise falls back to sequential indexing by
 * ascending hole number, so net games allocate strokes the same way regardless
 * of which hole the round started on (league rounds rotate holes into play
 * order).
 *
 * "Usable" is the load-bearing word, and it means more than "present". A
 * stroke index is a ranking, and allocation reads it as one — a shot wherever
 * the index is at or below the handicap. Feed it a set that repeats a rank or
 * strays outside 1..N and it hands out the wrong *number* of shots, silently:
 * eighteen holes all indexed 5 give a 4-handicap nothing at all and a
 * 6-handicap a shot a hole. Falling back is not a guess at the real course —
 * it is the same thing the app does when nobody set an index, and at least it
 * gives every player the shots their handicap is owed. The setup screens warn
 * so the numbers can be fixed; this is the floor under that.
 */
export function strokeIndexMap(round: Round): Record<number, number> {
  const usable = strokeIndexesUsable(round.holes);
  const byNumber = [...round.holes].sort((a, b) => a.number - b.number);
  const map: Record<number, number> = {};
  byNumber.forEach((h, i) => {
    map[h.number] = usable ? (h.strokeIndex as number) : i + 1;
  });
  return map;
}

/** Strokes a player receives on a single hole given their course handicap. */
export function strokesReceivedOnHole(
  courseHandicap: number,
  strokeIndex: number,
  totalHoles: number
): number {
  if (!courseHandicap || courseHandicap <= 0 || !strokeIndex) return 0;
  let strokes = 0;
  if (strokeIndex <= courseHandicap) strokes += 1;
  if (strokeIndex <= courseHandicap - totalHoles) strokes += 1;
  return strokes;
}

/**
 * A player's score on a hole, net of handicap strokes when `useNet` is on.
 * Returns null when no score has been entered.
 */
export function holeScore(
  round: Round,
  playerId: string,
  hole: Hole,
  useNet: boolean
): number | null {
  const raw = round.scores[hole.number]?.[playerId];
  if (raw == null) return null;
  if (!useNet) return raw;
  const player = round.players.find((p) => p.id === playerId);
  const hcp = player?.handicap ?? 0;
  const si = strokeIndexMap(round)[hole.number];
  return raw - strokesReceivedOnHole(hcp, si, round.holes.length);
}

/** Total handicap strokes a player receives across the whole round. */
export function totalStrokesReceived(round: Round, playerId: string): number {
  const player = round.players.find((p) => p.id === playerId);
  const hcp = player?.handicap ?? 0;
  if (hcp <= 0) return 0;
  const si = strokeIndexMap(round);
  return round.holes.reduce(
    (sum, h) => sum + strokesReceivedOnHole(hcp, si[h.number], round.holes.length),
    0
  );
}

/**
 * Whether this round uses handicaps at all — the gate for every handicap
 * display.
 *
 * Not the same as `options.useNet`, on two counts: league rounds ship
 * `useNet: false` (LeagueSetup spreads DEFAULT_OPTIONS) yet score net through
 * computeLeague, which reads `player.handicap` directly; and since scoring
 * went per-game, the round default is no longer the whole answer — one game
 * set to net is enough. Re-exported from `scoring.ts`, which owns that rule.
 */
export { usesHandicaps } from './scoring';
