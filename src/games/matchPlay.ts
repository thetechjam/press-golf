import type { Round, Hole, Player, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';

export interface SegmentResult {
  /** Holes won by p1 minus holes won by p2. */
  margin: number;
  holesPlayed: number;
  totalHoles: number;
  decided: boolean;
  /** Winner's player id, or null while undecided / halved. */
  winnerId: string | null;
  status: string;
}

/** Plays out a match between two players over a set of holes. */
export function matchSegment(
  round: Round,
  holes: Hole[],
  p1: Player,
  p2: Player
): SegmentResult {
  let margin = 0;
  let played = 0;
  let decided = false;
  let winnerId: string | null = null;
  const useNet = round.options.useNet;

  for (const h of holes) {
    const s1 = holeScore(round, p1.id, h, useNet);
    const s2 = holeScore(round, p2.id, h, useNet);
    if (s1 == null || s2 == null) continue;
    played += 1;
    if (s1 < s2) margin += 1;
    else if (s2 < s1) margin -= 1;

    const remaining = holes.length - played;
    if (Math.abs(margin) > remaining) {
      decided = true;
      winnerId = margin > 0 ? p1.id : p2.id;
      // Closeout notation: "{up}&{remaining}", or "{up} UP" if it went the distance.
      const up = Math.abs(margin);
      const winner = margin > 0 ? p1 : p2;
      const status =
        remaining > 0 ? `${winner.name} won ${up}&${remaining}` : `${winner.name} won ${up} UP`;
      return { margin, holesPlayed: played, totalHoles: holes.length, decided, winnerId, status };
    }
  }

  let status: string;
  if (played === 0) {
    status = 'Not started';
  } else if (margin === 0) {
    status = played === holes.length ? 'Halved' : 'All square';
  } else {
    const leader = margin > 0 ? p1 : p2;
    const up = Math.abs(margin);
    const remaining = holes.length - played;
    status =
      played === holes.length
        ? `${leader.name} won ${up} UP`
        : `${leader.name} ${up} UP · ${remaining} to play`;
    if (played === holes.length) winnerId = leader.id;
  }

  return { margin, holesPlayed: played, totalHoles: holes.length, decided, winnerId, status };
}

function twoPlayerGuard(round: Round, gameType: 'matchPlay' | 'nassau'): GameResult | null {
  if (round.players.length >= 2) return null;
  return {
    gameType,
    title: gameType === 'nassau' ? 'Nassau' : 'Match Play',
    status: 'Needs 2 players',
    standings: [],
    note: 'Add a second player to start this match.',
  };
}

export function computeMatchPlay(round: Round): GameResult {
  const guard = twoPlayerGuard(round, 'matchPlay');
  if (guard) return guard;

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
    note:
      round.players.length > 2 ? 'Match is between the first two players' : undefined,
  };
}
