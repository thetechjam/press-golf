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
    };
  };

  const aMatch = singles(t0.aId, t1.aId, 'A');
  const bMatch = singles(t0.bId, t1.bId, 'B');

  // Team match: aggregate net (both partners), strokes off the lowest of all four.
  const low4 = Math.min(hcp(t0.aId), hcp(t0.bId), hcp(t1.aId), hcp(t1.bId));
  const teamAgg = (t: LeagueTeam) => (h: Hole): number | null => {
    const n1 = net(t.aId, h, capHcp(hcp(t.aId) - low4));
    const n2 = net(t.bId, h, capHcp(hcp(t.bId) - low4));
    if (n1 == null || n2 == null) return null;
    return n1 + n2;
  };
  const teamSeg = runMatch(
    round.holes,
    teamAgg(t0),
    teamAgg(t1),
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
