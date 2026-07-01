import type { Round, Hole, Player, GameResult, GameStanding, TeamSetup } from '../types';
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

/** Resolves two sides from a team setup (defaults to 1v1, first two players). */
export function resolveSides(round: Round, setup?: TeamSetup): { a: Side; b: Side } {
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  if (setup?.mode === '2v2' && setup.teamA.length === 2 && setup.teamB.length === 2) {
    return {
      a: { ids: setup.teamA, label: setup.teamA.map(nameOf).join(' & ') },
      b: { ids: setup.teamB, label: setup.teamB.map(nameOf).join(' & ') },
    };
  }
  const ids = round.players.map((p) => p.id);
  const aId = setup?.teamA?.[0] ?? ids[0];
  const bId = setup?.teamB?.[0] ?? ids[1];
  return { a: { ids: [aId], label: nameOf(aId) }, b: { ids: [bId], label: nameOf(bId) } };
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

  const twoTeams = round.options.matchPlay?.mode === '2v2';
  const { a, b } = resolveSides(round, round.options.matchPlay);
  const seg = matchSegmentSides(round, round.holes, a, b);

  const standings: GameStanding[] = [
    {
      label: a.label,
      detail: seg.margin > 0 ? `${seg.margin} UP` : seg.margin < 0 ? `${seg.margin} DN` : 'A.S.',
      value: seg.margin,
      rank: seg.margin >= 0 ? 1 : 2,
      isLeader: seg.margin > 0,
    },
    {
      label: b.label,
      detail: seg.margin < 0 ? `${-seg.margin} UP` : seg.margin > 0 ? `${-seg.margin} DN` : 'A.S.',
      value: -seg.margin,
      rank: seg.margin <= 0 ? 1 : 2,
      isLeader: seg.margin < 0,
    },
  ].sort((x, y) => x.rank - y.rank);

  const title = twoTeams
    ? 'Match Play (2v2)'
    : round.options.useNet
      ? 'Match Play (Net)'
      : 'Match Play';

  return {
    gameType: 'matchPlay',
    title,
    status: seg.status,
    standings,
    note: twoTeams || round.players.length > 2 ? `${a.label} vs ${b.label}` : undefined,
  };
}
