import type { Round, Hole, LeagueTeam } from '../types';
import { runMatch } from './matchPlay';
import { strokeIndexMap, strokesReceivedOnHole, courseHandicapFor } from './handicap';

export interface LeagueMatchResult {
  key: 'A' | 'B' | 'team';
  label: string;
  matchup: string; // "Al v Bo" or "Team 1 v Team 2"
  status: string;
  winner: 'A' | 'B' | null; // A = team 0's side, B = team 1's side
  over: boolean;
  /** Players who receive strokes in this match (off the low man), for display. */
  strokes: { name: string; strokes: number }[];
}

export interface LeagueResult {
  matches: LeagueMatchResult[];
  teams: { name: string; points: number }[]; // [team 0, team 1]
  pointsPerMatch: number;
  complete: boolean;
}

export type LeagueMatchKey = 'A' | 'B' | 'T';

/**
 * The highest score a league hole can take. League rule: the maximum allowable
 * score on any hole is a 9. Entry stops there, and the engine caps anything
 * higher that arrives (an old round, a share link) rather than trusting it.
 */
export const LEAGUE_MAX_SCORE = 9;

/** League rule: no player gets more than 9 shots in a match. */
export const LEAGUE_MAX_SHOTS = 9;

/** Whether a player picked up ("X") on a hole. */
export const pickedUp = (round: Round, holeNumber: number, id: string): boolean =>
  round.pickups?.[holeNumber]?.includes(id) ?? false;

interface Baselines {
  /** Which singles match a player plays in, or null if they are not in the league. */
  matchOf: (id: string) => 'A' | 'B' | null;
  /** Capped, low-man-adjusted handicap for a player's singles match. */
  singles: (id: string) => number;
  /** Capped, low-man-adjusted handicap for the team match. */
  team: (id: string) => number;
  nameOf: (id: string) => string;
}

/**
 * The stroke baseline a league night is scored off: the lowest handicap of
 * all four players, for every match — A, B and the team.
 *
 * League rule: "The player(s) with the lowest handicap among the foursome in
 * each set of matches gets zero strokes for the matches. The remaining
 * players will get strokes based upon the difference of their handicap and
 * the lowest handicap in the foursome. This amount will NOT exceed (9) shots
 * within the match." Press used to play each singles match off the lower of
 * its own two players instead; with the 9-shot cap the two readings differ
 * (two B players of 12 and 16 against a low man of 2 both cap at 9 and play
 * level), and the league's reading is the one that decides the points.
 *
 * Extracted so computeLeague and leagueStrokesOnHole cannot drift apart;
 * league.test.ts asserts they agree.
 */
function leagueBaselines(round: Round): Baselines {
  const cfg = round.options.league!;
  const total = round.holes.length;
  // League rule: at most 9 shots in a match, and at most 1 stroke per hole —
  // capping at `total` too makes the second-stroke branch of
  // strokesReceivedOnHole unreachable (a league night is nine holes, where the
  // two caps are the same number).
  const capHcp = (v: number) => Math.min(Math.max(0, v), total, LEAGUE_MAX_SHOTS);
  /**
   * The strokes a player plays off on these holes.
   *
   * Through `courseHandicapFor`, so a league night gets the same treatment as
   * every other round: a Handicap Index converted against the course's slope
   * and rating when both are known and plausible, and the typed stroke count
   * when they are not. Everything below — the low-man subtraction, the cap,
   * the allocation — works on whatever number comes back, so league's own
   * rules did not have to change to gain this.
   *
   * Note that a nine-hole league night needs a *nine-hole* rating: an
   * eighteen-hole figure fails `validRating` for nine holes and falls back to
   * the typed handicap rather than halving itself and looking right.
   */
  const hcp = (id: string) => {
    const player = round.players.find((p) => p.id === id);
    return player ? courseHandicapFor(round, player) : 0;
  };
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  const [t0, t1] = cfg.teams;
  const low4 = Math.min(hcp(t0.aId), hcp(t0.bId), hcp(t1.aId), hcp(t1.bId));
  const matchOf = (id: string): 'A' | 'B' | null =>
    id === t0.aId || id === t1.aId ? 'A' : id === t0.bId || id === t1.bId ? 'B' : null;
  const offLow = (id: string) => capHcp(hcp(id) - low4);
  return {
    matchOf,
    singles: (id) => (matchOf(id) == null ? 0 : offLow(id)),
    team: offLow,
    nameOf,
  };
}

/**
 * Which matches give each player a stroke on this hole. Chips, not counts —
 * `capHcp` bounds league allocation to one stroke per hole.
 */
export function leagueStrokesOnHole(
  round: Round,
  hole: Hole
): Record<string, LeagueMatchKey[]> {
  if (!round.options.league) return {};
  const b = leagueBaselines(round);
  const si = strokeIndexMap(round)[hole.number];
  const total = round.holes.length;
  const out: Record<string, LeagueMatchKey[]> = {};
  for (const p of round.players) {
    const keys: LeagueMatchKey[] = [];
    const m = b.matchOf(p.id);
    if (m && strokesReceivedOnHole(b.singles(p.id), si, total) > 0) keys.push(m);
    if (strokesReceivedOnHole(b.team(p.id), si, total) > 0) keys.push('T');
    out[p.id] = keys;
  }
  return out;
}

export function computeLeague(round: Round): LeagueResult {
  const cfg = round.options.league!;
  const si = strokeIndexMap(round);
  const total = round.holes.length;

  const b = leagueBaselines(round);
  const { nameOf } = b;
  const teamName = (t: LeagueTeam, i: number) =>
    t.name?.trim() || `${nameOf(t.aId)} & ${nameOf(t.bId)}` || `Team ${i + 1}`;

  // A player's net on a hole given an effective (already-adjusted) handicap.
  // Gross is capped at the league maximum of 9. A pick-up ("X") is a hole
  // forfeited, so it nets to Infinity: it loses to any score, halves against
  // another X, and in the team match drops out of the best-ball min() so the
  // partner's ball still plays.
  const net = (id: string, hole: Hole, effHcp: number): number | null => {
    if (pickedUp(round, hole.number, id)) return Infinity;
    const g = round.scores[hole.number]?.[id];
    if (g == null) return null;
    return Math.min(g, LEAGUE_MAX_SCORE) - strokesReceivedOnHole(effHcp, si[hole.number], total);
  };

  // Strokes a player actually receives in a match, given their effective
  // (already low-man-adjusted) handicap — at most one per hole here.
  const strokesFor = (effHcp: number): number =>
    round.holes.reduce((s, h) => s + strokesReceivedOnHole(effHcp, si[h.number], total), 0);
  // The stroke-getters in a match, so the board can show what it scored off of.
  const strokeList = (ids: string[], eff: (id: string) => number) =>
    ids
      .map((id) => ({ name: nameOf(id), strokes: strokesFor(eff(id)) }))
      .filter((s) => s.strokes > 0);

  const [t0, t1] = cfg.teams;
  const isOver = (seg: { decided: boolean; holesPlayed: number; totalHoles: number }) =>
    seg.decided || (seg.holesPlayed > 0 && seg.holesPlayed === seg.totalHoles);

  // Singles: strokes off the low of the foursome (see leagueBaselines).
  const singles = (id0: string, id1: string, key: 'A' | 'B'): LeagueMatchResult => {
    const seg = runMatch(
      round.holes,
      (h) => net(id0, h, b.singles(id0)),
      (h) => net(id1, h, b.singles(id1)),
      nameOf(id0),
      nameOf(id1)
    );
    return {
      key,
      label: key === 'A' ? 'A Match' : 'B Match',
      matchup: `${nameOf(id0)} v ${nameOf(id1)}`,
      status: seg.status,
      winner: seg.winner,
      over: isOver(seg),
      strokes: strokeList([id0, id1], b.singles),
    };
  };

  const aMatch = singles(t0.aId, t1.aId, 'A');
  const bMatch = singles(t0.bId, t1.bId, 'B');

  // Team match: best ball (the better net of the two partners), strokes off the
  // lowest of all four — the same baseline as the singles.
  // Best ball, not combined total — a partner's blow-up hole is thrown out, and
  // a high-handicapper's stroke-aided holes can carry the team. This matches the
  // app's other team formats (2v2 Match Play, Nassau) and standard league play.
  const teamBest = (t: LeagueTeam) => (h: Hole): number | null => {
    const nets = [net(t.aId, h, b.team(t.aId)), net(t.bId, h, b.team(t.bId))].filter(
      (n): n is number => n != null
    );
    return nets.length ? Math.min(...nets) : null;
  };
  const teamSeg = runMatch(
    round.holes,
    teamBest(t0),
    teamBest(t1),
    teamName(t0, 0),
    teamName(t1, 1)
  );
  const teamMatch: LeagueMatchResult = {
    key: 'team',
    label: 'Team Match',
    matchup: `${teamName(t0, 0)} v ${teamName(t1, 1)}`,
    status: teamSeg.status,
    winner: teamSeg.winner,
    over: isOver(teamSeg),
    strokes: strokeList([t0.aId, t0.bId, t1.aId, t1.bId], b.team),
  };

  const matches = [aMatch, bMatch, teamMatch];

  // Points: winner takes pointsPerMatch; a finished halved match splits it.
  const points = [0, 0];
  for (const m of matches) {
    if (!m.over) continue;
    if (m.winner === 'A') points[0] += cfg.pointsPerMatch;
    else if (m.winner === 'B') points[1] += cfg.pointsPerMatch;
    else {
      points[0] += cfg.pointsPerMatch / 2;
      points[1] += cfg.pointsPerMatch / 2;
    }
  }

  return {
    matches,
    teams: [
      { name: teamName(t0, 0), points: points[0] },
      { name: teamName(t1, 1), points: points[1] },
    ],
    pointsPerMatch: cfg.pointsPerMatch,
    complete: matches.every((m) => m.over),
  };
}
