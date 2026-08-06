import type { Round, Hole, LeagueTeam } from '../types';
import { runMatch } from './matchPlay';
import { strokeIndexMap, strokesReceivedOnHole } from './handicap';

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
 * The three stroke baselines a league night is scored off — A match off the low
 * of the two A players, B match off the low of the two B players, team match off
 * the low of all four. Extracted so computeLeague and leagueStrokesOnHole cannot
 * drift apart; league.test.ts asserts they agree.
 */
function leagueBaselines(round: Round): Baselines {
  const cfg = round.options.league!;
  const total = round.holes.length;
  // League rule: at most 1 stroke per hole, so capping the effective handicap at
  // `total` makes the second-stroke branch of strokesReceivedOnHole unreachable.
  const capHcp = (v: number) => Math.min(Math.max(0, v), total);
  const hcp = (id: string) => round.players.find((p) => p.id === id)?.handicap ?? 0;
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  const [t0, t1] = cfg.teams;
  const aLow = Math.min(hcp(t0.aId), hcp(t1.aId));
  const bLow = Math.min(hcp(t0.bId), hcp(t1.bId));
  const low4 = Math.min(hcp(t0.aId), hcp(t0.bId), hcp(t1.aId), hcp(t1.bId));
  const matchOf = (id: string): 'A' | 'B' | null =>
    id === t0.aId || id === t1.aId ? 'A' : id === t0.bId || id === t1.bId ? 'B' : null;
  return {
    matchOf,
    singles: (id) => {
      const m = matchOf(id);
      return m == null ? 0 : capHcp(hcp(id) - (m === 'A' ? aLow : bLow));
    },
    team: (id) => capHcp(hcp(id) - low4),
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
  const net = (id: string, hole: Hole, effHcp: number): number | null => {
    const g = round.scores[hole.number]?.[id];
    if (g == null) return null;
    return g - strokesReceivedOnHole(effHcp, si[hole.number], total);
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

  // Singles: strokes off the lower handicap of the two.
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
  // lowest of all four so the team plays to the same baseline as the singles.
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
