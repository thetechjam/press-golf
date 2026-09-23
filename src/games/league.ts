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
  /** Decided by a no-show rather than played. */
  forfeit?: boolean;
  /** A match nobody could play (both players absent): worth nothing to either side. */
  void?: boolean;
}

export interface LeagueResult {
  /** Set when play was called for darkness or weather: the holes it stood on. */
  endedAfter?: number;
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
  const [t0, t1] = cfg.teams;
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  // Off the low of the players actually there: an absent player has no
  // handicap to be the low man with ("handicaps will be distributed
  // accordingly" — the rule for a team one short).
  const present = [t0.aId, t0.bId, t1.aId, t1.bId].filter(Boolean);
  const low4 = Math.min(...present.map(hcp));
  const matchOf = (id: string): 'A' | 'B' | null =>
    !id ? null : id === t0.aId || id === t1.aId ? 'A' : id === t0.bId || id === t1.bId ? 'B' : null;
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

/**
 * The holes every player in the group has finished — a score or an X.
 *
 * League rule: when play is called after 5 or more holes, "shots subsequently
 * played on the following holes will NOT be counted unless the entire foursome
 * has completed the hole."
 */
export function holesFinishedByAll(round: Round): Hole[] {
  return round.holes.filter((h) =>
    round.players.every(
      (p) => round.scores[h.number]?.[p.id] != null || pickedUp(round, h.number, p.id)
    )
  );
}

/** How many holes must be finished before a called match counts as complete. */
export const LEAGUE_MIN_HOLES_TO_CALL = 5;

/**
 * Whether the match can be called for darkness or weather now: a league
 * round, not already called, with at least five holes finished by everyone
 * and some still to play.
 */
export function canCallLeagueMatch(round: Round): boolean {
  if (!round.options.league || round.options.league.ended) return false;
  const done = holesFinishedByAll(round).length;
  return done >= LEAGUE_MIN_HOLES_TO_CALL && done < round.holes.length;
}

export function computeLeague(round: Round): LeagueResult {
  const cfg = round.options.league!;
  const si = strokeIndexMap(round);
  const total = round.holes.length;
  // Called for darkness or weather: only the holes the whole group finished
  // count, and every match is final on them.
  const holes = cfg.ended ? holesFinishedByAll(round) : round.holes;

  const b = leagueBaselines(round);
  /** A slot's player by name — or, for an absent slot, whoever was missing. */
  const slotName = (t: LeagueTeam, slot: 'a' | 'b') =>
    t.absent === slot
      ? t.absentName?.trim() || 'No-show'
      : b.nameOf(slot === 'a' ? t.aId : t.bId);
  const nameOf = b.nameOf;
  const teamName = (t: LeagueTeam, i: number) =>
    t.name?.trim() || `${slotName(t, 'a')} & ${slotName(t, 'b')}` || `Team ${i + 1}`;

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
    holes.reduce((s, h) => s + strokesReceivedOnHole(effHcp, si[h.number], total), 0);
  // The stroke-getters in a match, so the board can show what it scored off of.
  const strokeList = (ids: string[], eff: (id: string) => number) =>
    ids
      .filter(Boolean)
      .map((id) => ({ name: nameOf(id), strokes: strokesFor(eff(id)) }))
      .filter((s) => s.strokes > 0);

  const [t0, t1] = cfg.teams;
  const isOver = (seg: { decided: boolean; holesPlayed: number; totalHoles: number }) =>
    !!cfg.ended || seg.decided || (seg.holesPlayed > 0 && seg.holesPlayed === seg.totalHoles);

  // Singles: strokes off the low of the foursome (see leagueBaselines).
  const singles = (key: 'A' | 'B'): LeagueMatchResult => {
    const slot = key === 'A' ? 'a' : 'b';
    const id0 = slot === 'a' ? t0.aId : t0.bId;
    const id1 = slot === 'a' ? t1.aId : t1.bId;
    const n0 = slotName(t0, slot);
    const n1 = slotName(t1, slot);
    const label = key === 'A' ? 'A Match' : 'B Match';
    const matchup = `${n0} v ${n1}`;
    // League rule: a player who fails to show forfeits the points for their
    // match. Both missing and nobody gets them.
    if (!id0 || !id1) {
      const winner: 'A' | 'B' | null = !id0 && !id1 ? null : id0 ? 'A' : 'B';
      return {
        key,
        label,
        matchup,
        status:
          winner == null
            ? 'Not played — both absent'
            : `${winner === 'A' ? n0 : n1} wins — ${winner === 'A' ? n1 : n0} absent`,
        winner,
        over: true,
        strokes: [],
        forfeit: true,
        void: winner == null,
      };
    }
    const seg = runMatch(
      holes,
      (h) => net(id0, h, b.singles(id0)),
      (h) => net(id1, h, b.singles(id1)),
      n0,
      n1
    );
    return {
      key,
      label,
      matchup,
      status: seg.status,
      winner: seg.winner,
      over: isOver(seg),
      strokes: strokeList([id0, id1], b.singles),
    };
  };

  const aMatch = singles('A');
  const bMatch = singles('B');

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
    holes,
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
    if (!m.over || m.void) continue;
    if (m.winner === 'A') points[0] += cfg.pointsPerMatch;
    else if (m.winner === 'B') points[1] += cfg.pointsPerMatch;
    else {
      points[0] += cfg.pointsPerMatch / 2;
      points[1] += cfg.pointsPerMatch / 2;
    }
  }

  return {
    endedAfter: cfg.ended ? holes.length : undefined,
    matches,
    teams: [
      { name: teamName(t0, 0), points: points[0] },
      { name: teamName(t1, 1), points: points[1] },
    ],
    pointsPerMatch: cfg.pointsPerMatch,
    complete: matches.every((m) => m.over),
  };
}
