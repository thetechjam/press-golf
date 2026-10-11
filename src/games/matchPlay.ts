import type { Round, Hole, Player, GameResult, GameStanding, TeamSetup, GameType } from '../types';
import { matchHandicaps, netHoleScore } from './handicap';
import { netFor } from './scoring';
import { creditSide, zeroNet, type MoneyFn } from './moneyModels';

/** A side in a match: one player (1v1) or a team (2v2, best ball). */
export interface Side {
  ids: string[];
  label: string;
}

/** Whether either side is a team — the four-ball the 90% allowance exists for. */
export const isFourBall = (a: Side, b: Side): boolean => a.ids.length > 1 || b.ids.length > 1;

/**
 * The strokes each player in this match plays off, by id — the sides' players
 * only, the lowest handicap at zero and the rest the difference (see
 * `matchHandicaps`). Empty when the game is scored gross, so a caller can tell
 * "no strokes" from "not a net game".
 */
export function matchStrokesFor(
  round: Round,
  a: Side,
  b: Side,
  game: GameType
): Record<string, number> {
  if (!netFor(round, game)) return {};
  return matchHandicaps(round, [...a.ids, ...b.ids], game, isFourBall(a, b));
}

/**
 * Who gets what in this match, for the board: "Bo gets 4 shots, Cy 2". The
 * low man is not named — playing off scratch is the default, not news.
 * Undefined when nobody gets a shot, so the board shows nothing rather than
 * an empty line.
 */
export function matchStrokesNote(round: Round, strokes: Record<string, number>): string | undefined {
  const getters = round.players.filter((p) => (strokes[p.id] ?? 0) > 0);
  if (getters.length === 0) return undefined;
  const [first, ...rest] = getters;
  const n = strokes[first.id];
  const head = `${first.name} gets ${n} shot${n === 1 ? '' : 's'}`;
  return [head, ...rest.map((p) => `${p.name} ${strokes[p.id]}`)].join(', ');
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

/**
 * Best (lowest) score for a side on a hole; null if no member has a score.
 *
 * `strokes` is the match's own allocation from `matchStrokesFor` — relative
 * to the low man, not each player's full handicap — and is empty for a gross
 * game, where a missing entry plays off zero and the card is read as it is.
 */
function sideBest(
  round: Round,
  ids: string[],
  hole: Hole,
  strokes: Record<string, number>
): number | null {
  const scores = ids
    .map((id) => netHoleScore(round, id, hole, strokes[id] ?? 0))
    .filter((s): s is number => s != null);
  return scores.length ? Math.min(...scores) : null;
}

/**
 * Core match-play evaluator: walks the holes comparing two per-hole score
 * accessors (lower wins the hole) and produces status + winner with closeout.
 */
export function runMatch(
  holes: Hole[],
  aScore: (h: Hole) => number | null,
  bScore: (h: Hole) => number | null,
  labelA: string,
  labelB: string
): SegmentResult {
  let margin = 0; // + = side A up
  let played = 0;

  for (const h of holes) {
    const sa = aScore(h);
    const sb = bScore(h);
    if (sa == null || sb == null) continue;
    played += 1;
    if (sa < sb) margin += 1;
    else if (sb < sa) margin -= 1;

    const remaining = holes.length - played;
    if (Math.abs(margin) > remaining) {
      const winner: 'A' | 'B' = margin > 0 ? 'A' : 'B';
      const label = margin > 0 ? labelA : labelB;
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
    const label = margin > 0 ? labelA : labelB;
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

/**
 * Plays out a match between two sides over a set of holes (best ball for teams).
 *
 * `game` says whose gross/net setting to score by, because this routine serves
 * two games that no longer have to agree: Match Play and each of Nassau's
 * segments. Reading the round default here instead would quietly score a net
 * Nassau off a gross Match Play's setting, and the two boards would disagree
 * about who was up.
 */
export function matchSegmentSides(
  round: Round,
  holes: Hole[],
  a: Side,
  b: Side,
  game: GameType = 'matchPlay'
): SegmentResult {
  const strokes = matchStrokesFor(round, a, b, game);
  return runMatch(
    holes,
    (h) => sideBest(round, a.ids, h, strokes),
    (h) => sideBest(round, b.ids, h, strokes),
    a.label,
    b.label
  );
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
      detail: seg.margin > 0 ? `${seg.margin} UP` : seg.margin < 0 ? `${-seg.margin} DN` : 'A.S.',
      value: seg.margin,
      rank: seg.margin >= 0 ? 1 : 2,
      isLeader: seg.margin > 0,
    },
    {
      label: b.label,
      detail: seg.margin < 0 ? `${-seg.margin} UP` : seg.margin > 0 ? `${seg.margin} DN` : 'A.S.',
      value: -seg.margin,
      rank: seg.margin <= 0 ? 1 : 2,
      isLeader: seg.margin < 0,
    },
  ].sort((x, y) => x.rank - y.rank);

  const title = twoTeams
    ? 'Match Play (2v2)'
    : netFor(round, 'matchPlay')
      ? 'Match Play (Net)'
      : 'Match Play';

  // The matchup when it is not obvious from the players, and who gets shots:
  // the Hole tab's markers can only draw one allocation, so in a round that
  // also plays a card game net this line is where the match's own strokes are
  // written down.
  const who = twoTeams || round.players.length > 2 ? `${a.label} vs ${b.label}` : undefined;
  const shots = matchStrokesNote(round, matchStrokesFor(round, a, b, 'matchPlay'));
  const note = [who, shots].filter(Boolean).join(' · ');

  return {
    gameType: 'matchPlay',
    title,
    status: seg.status,
    standings,
    note: note || undefined,
  };
}

/** The winning side collects the stake from the losing side; a halve moves nothing. */
export const matchPlayMoney: MoneyFn = (round, stake) => {
  const net = zeroNet(round);
  if (round.players.length < 2) return net;
  const { a, b } = resolveSides(round, round.options.matchPlay);
  creditSide(net, matchSegmentSides(round, round.holes, a, b).winner, a, b, stake);
  return net;
};
