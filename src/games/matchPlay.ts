import type { Round, Hole, Player, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';

/** A side in a match: one player (1v1) or a team (2v2, best ball). */
export interface Side {
  ids: string[];
  label: string;
}

export interface SegmentResult {
  /** Holes won by side A minus holes won by side B. */
  margin: number;
  holesPlayed: number;
  totalHoles: number;
  decided: boolean;
  /** Winning side, or null while undecided / halved. */
  winner: 'A' | 'B' | null;
  status: string;
}

/** Best (lowest) score for a side on a hole; null if no member has a score. */
function sideBest(round: Round, ids: string[], hole: Hole, useNet: boolean): number | null {
  const scores = ids
    .map((id) => holeScore(round, id, hole, useNet))
    .filter((s): s is number => s != null);
  return scores.length ? Math.min(...scores) : null;
}

/** Plays out a match between two sides over a set of holes (best ball for teams). */
export function matchSegmentSides(
  round: Round,
  holes: Hole[],
  a: Side,
  b: Side
): SegmentResult {
  let margin = 0; // + = side A up
  let played = 0;
  const useNet = round.options.useNet;

  for (const h of holes) {
    const sa = sideBest(round, a.ids, h, useNet);
    const sb = sideBest(round, b.ids, h, useNet);
    if (sa == null || sb == null) continue;
    played += 1;
    if (sa < sb) margin += 1;
    else if (sb < sa) margin -= 1;

    const remaining = holes.length - played;
    if (Math.abs(margin) > remaining) {
      const winner: 'A' | 'B' = margin > 0 ? 'A' : 'B';
      const label = margin > 0 ? a.label : b.label;
      const up = Math.abs(margin);
      const status =
        remaining > 0 ? `${label} won ${up}&${remaining}` : `${label} won ${up} UP`;
      return { margin, holesPlayed: played, totalHoles: holes.length, decided: true, winner, status };
    }
  }

  let status: string;
  let winner: 'A' | 'B' | null = null;
  if (played === 0) {
    status = 'Not started';
  } else if (margin === 0) {
    status = played === holes.length ? 'Halved' : 'All square';
  } else {
    const label = margin > 0 ? a.label : b.label;
    const up = Math.abs(margin);
    const remaining = holes.length - played;
    if (played === holes.length) {
      status = `${label} won ${up} UP`;
      winner = margin > 0 ? 'A' : 'B';
    } else {
      status = `${label} ${up} UP · ${remaining} to play`;
    }
  }

  return { margin, holesPlayed: played, totalHoles: holes.length, decided: false, winner, status };
}

/** 1v1 convenience wrapper. */
export function matchSegment(
  round: Round,
  holes: Hole[],
  p1: Player,
  p2: Player
): SegmentResult {
  return matchSegmentSides(
    round,
    holes,
    { ids: [p1.id], label: p1.name },
    { ids: [p2.id], label: p2.name }
  );
}

export function computeMatchPlay(round: Round): GameResult {
  if (round.players.length < 2) {
    return {
      gameType: 'matchPlay',
      title: 'Match Play',
      status: 'Needs 2 players',
      standings: [],
      note: 'Add a second player to start this match.',
    };
  }

  const [p1, p2] = round.players;
  const seg = matchSegment(round, round.holes, p1, p2);

  const standings: GameStanding[] = [
    {
      playerId: p1.id,
      label: p1.name,
      detail: seg.margin > 0 ? `${seg.margin} UP` : seg.margin < 0 ? `${seg.margin} DN` : 'A.S.',
      value: seg.margin,
      rank: seg.margin >= 0 ? 1 : 2,
      isLeader: seg.margin > 0,
    },
    {
      playerId: p2.id,
      label: p2.name,
      detail: seg.margin < 0 ? `${-seg.margin} UP` : seg.margin > 0 ? `${-seg.margin} DN` : 'A.S.',
      value: -seg.margin,
      rank: seg.margin <= 0 ? 1 : 2,
      isLeader: seg.margin < 0,
    },
  ].sort((a, b) => a.rank - b.rank);

  return {
    gameType: 'matchPlay',
    title: round.options.useNet ? 'Match Play (Net)' : 'Match Play',
    status: seg.status,
    standings,
    note: round.players.length > 2 ? 'Match is between the first two players' : undefined,
  };
}
