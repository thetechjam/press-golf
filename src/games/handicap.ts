import type { Round, Hole } from '../types';

/**
 * Stroke index per hole. Uses the values the user entered when every hole has
 * one; otherwise falls back to sequential indexing in hole order so net games
 * still allocate strokes deterministically.
 */
export function strokeIndexMap(round: Round): Record<number, number> {
  const allProvided = round.holes.every(
    (h) => typeof h.strokeIndex === 'number' && h.strokeIndex > 0
  );
  const map: Record<number, number> = {};
  round.holes.forEach((h, i) => {
    map[h.number] = allProvided ? (h.strokeIndex as number) : i + 1;
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
