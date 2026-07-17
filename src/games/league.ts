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

export function computeLeague(round: Round): LeagueResult {
  const cfg = round.options.league!;
  const si = strokeIndexMap(round);
  const total = round.holes.length;

  // League rule: a player gets at most 1 stroke per hole, so at most `total`
  // (9) strokes in a match. Capping the effective handicap at `total` makes the
  // second-stroke branch of strokesReceivedOnHole unreachable and bounds the
  // total, regardless of how large the raw handicap difference is.
  const capHcp = (v: number) => Math.min(Math.max(0, v), total);

  const hcp = (id: string) => round.players.find((p) => p.id === id)?.handicap ?? 0;
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
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
  const strokeList = (ids: string[], low: number) =>
    ids
      .map((id) => ({ name: nameOf(id), strokes: strokesFor(capHcp(hcp(id) - low)) }))
      .filter((s) => s.strokes > 0);

  const [t0, t1] = cfg.teams;
  const isOver = (seg: { decided: boolean; holesPlayed: number; totalHoles: number }) =>
    seg.decided || (seg.holesPlayed > 0 && seg.holesPlayed === seg.totalHoles);

  // Singles: strokes off the lower handicap of the two.
  const singles = (id0: string, id1: string, key: 'A' | 'B'): LeagueMatchResult => {
    const low = Math.min(hcp(id0), hcp(id1));
    const seg = runMatch(
      round.holes,
      (h) => net(id0, h, capHcp(hcp(id0) - low)),
      (h) => net(id1, h, capHcp(hcp(id1) - low)),
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
      strokes: strokeList([id0, id1], low),
    };
  };

  const aMatch = singles(t0.aId, t1.aId, 'A');
  const bMatch = singles(t0.bId, t1.bId, 'B');

  // Team match: best ball (the better net of the two partners), strokes off the
  // lowest of all four so the team plays to the same baseline as the singles.
  // Best ball, not combined total — a partner's blow-up hole is thrown out, and
  // a high-handicapper's stroke-aided holes can carry the team. This matches the
  // app's other team formats (2v2 Match Play, Nassau) and standard league play.
  const low4 = Math.min(hcp(t0.aId), hcp(t0.bId), hcp(t1.aId), hcp(t1.bId));
  const teamBest = (t: LeagueTeam) => (h: Hole): number | null => {
    const nets = [
      net(t.aId, h, capHcp(hcp(t.aId) - low4)),
      net(t.bId, h, capHcp(hcp(t.bId) - low4)),
    ].filter((n): n is number => n != null);
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
    strokes: strokeList([t0.aId, t0.bId, t1.aId, t1.bId], low4),
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
