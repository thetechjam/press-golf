import type { LeagueTeam, Round } from '../types';
import { LEAGUE_MAX_SCORE, computeLeague, pickedUp } from './league';
import { leagueHistory } from './leagueHandicap';
import { nameKey } from '../people';

/**
 * A league season, added up from the league nights on this phone.
 *
 * Each foursome scores its own night on its own phone, so a phone holds the
 * nights it scored and any that were shared to it — usually one team's
 * season, not the whole league's. Everything here is worded and counted with
 * that in mind: a table of the teams this phone has seen, not a claim to be
 * the league's official standings (the league director's sheet is that).
 *
 * Teams and players are matched by name, as Stats matches players: a
 * `Player.id` belongs to one round, and the same two people are two new ids
 * every Thursday.
 */

export interface SeasonNightTeam {
  key: string;
  name: string;
  points: number;
}

export interface SeasonNight {
  round: Round;
  teams: [SeasonNightTeam, SeasonNightTeam];
  /** Index of the team that took more points, or null for a tie. */
  winner: 0 | 1 | null;
  /** Called for darkness or weather before all nine were played. */
  called: boolean;
  /** A first-night player's handicap is still to be set. */
  provisional: boolean;
}

export interface TeamStanding {
  key: string;
  /** The team's own name if it has used one, otherwise "Al & Bo". */
  name: string;
  /** The two players, for a team whose name does not already say. */
  players: string[];
  nights: number;
  won: number;
  lost: number;
  halved: number;
  points: number;
}

export interface PlayerStanding {
  name: string;
  /** Display name of the team they played for most recently. */
  team: string;
  nights: number;
  /** Their own singles match (A or B), night by night. */
  won: number;
  lost: number;
  halved: number;
  /**
   * Mean over par on the nights they finished every hole of — a called night,
   * or one with holes missing, would average as a good night.
   */
  avgOverPar: number | null;
  /** What their last five league nights on this phone play to. A hint. */
  playsTo: number | null;
}

export interface LeagueSeason {
  year: number;
  /** Finished nights, newest first. */
  nights: SeasonNight[];
  /** League rounds this season that are not finished, so not counted. */
  unfinished: number;
  teams: TeamStanding[];
  players: PlayerStanding[];
}

const norm = nameKey;
const yearOf = (r: Round) => Number(/^(\d{4})-/.exec(r.date)?.[1]);
const isLeague = (r: Round) => !!r.options.league;

/** Seasons with a league night in them, newest first. */
export function leagueSeasonYears(rounds: Round[]): number[] {
  const years = new Set<number>();
  for (const r of rounds) if (isLeague(r) && Number.isInteger(yearOf(r))) years.add(yearOf(r));
  return [...years].sort((a, b) => b - a);
}

/** The names in a team's two slots: the player, or whoever was missing. */
function slotNames(round: Round, t: LeagueTeam): string[] {
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name.trim() ?? '';
  const a = t.absent === 'a' ? (t.absentName?.trim() ?? '') : nameOf(t.aId);
  const b = t.absent === 'b' ? (t.absentName?.trim() ?? '') : nameOf(t.bId);
  return [a, b].filter(Boolean);
}

/** One team, whatever order its two names were typed in. */
const teamKey = (names: string[]) => names.map(norm).sort().join(' + ');

/**
 * Over par for one player on a night, or null unless they finished every
 * hole. A pick-up is the league maximum, as `leagueHistory` counts it.
 */
function overPar(round: Round, id: string): number | null {
  let total = 0;
  for (const h of round.holes) {
    const g = pickedUp(round, h.number, id) ? LEAGUE_MAX_SCORE : round.scores[h.number]?.[id];
    if (g == null) return null;
    total += Math.min(g, LEAGUE_MAX_SCORE) - h.par;
  }
  return total;
}

export function leagueSeason(rounds: Round[], year: number): LeagueSeason {
  const inSeason = rounds.filter((r) => isLeague(r) && yearOf(r) === year);
  const finished = inSeason
    .map((round) => ({ round, result: computeLeague(round) }))
    .filter((n) => n.result.complete)
    // Oldest first while adding up, so "most recent" names and teams win.
    .sort((a, b) => a.round.date.localeCompare(b.round.date) || a.round.updatedAt - b.round.updatedAt);

  // A team missing a player with no name given for them is one name short of
  // its usual key. Fold it into the one full team that player is on, if there
  // is exactly one — otherwise it stands as its own row rather than guessing.
  const fullKeys = new Set<string>();
  for (const { round } of finished) {
    for (const t of round.options.league!.teams) {
      const names = slotNames(round, t);
      if (names.length === 2) fullKeys.add(teamKey(names));
    }
  }
  const keyFor = (names: string[]) => {
    if (names.length !== 1) return teamKey(names);
    const one = norm(names[0]);
    const homes = [...fullKeys].filter((k) => k.split(' + ').includes(one));
    return homes.length === 1 ? homes[0] : teamKey(names);
  };

  const teams = new Map<string, TeamStanding>();
  const players = new Map<string, PlayerStanding & { overs: number[] }>();
  const nights: SeasonNight[] = [];

  for (const { round, result } of finished) {
    const cfg = round.options.league!;
    const pts = result.teams.map((t) => t.points);
    const winner: 0 | 1 | null = pts[0] === pts[1] ? null : pts[0] > pts[1] ? 0 : 1;
    const keys = cfg.teams.map((t) => keyFor(slotNames(round, t)));

    cfg.teams.forEach((t, i) => {
      const names = slotNames(round, t);
      const row = teams.get(keys[i]) ?? {
        key: keys[i],
        name: '',
        players: [],
        nights: 0,
        won: 0,
        lost: 0,
        halved: 0,
        points: 0,
      };
      row.nights += 1;
      row.points += pts[i];
      if (winner === null) row.halved += 1;
      else if (winner === i) row.won += 1;
      else row.lost += 1;
      row.name = result.teams[i].name;
      if (names.length === 2) row.players = names;
      teams.set(keys[i], row);
    });

    // Singles: A is team 0's A player against team 1's, and likewise B.
    const singles = result.matches.filter((m) => m.key !== 'team');
    for (const m of singles) {
      if (m.void) continue;
      const slot = m.key === 'A' ? 'aId' : 'bId';
      cfg.teams.forEach((t, i) => {
        const id = t[slot];
        const p = id && round.players.find((x) => x.id === id);
        if (!p) return;
        const k = norm(p.name);
        if (!k) return;
        const row = players.get(k) ?? {
          name: p.name.trim(),
          team: '',
          nights: 0,
          won: 0,
          lost: 0,
          halved: 0,
          avgOverPar: null,
          playsTo: null,
          overs: [],
        };
        row.name = p.name.trim();
        row.team = result.teams[i].name;
        row.nights += 1;
        const side = i === 0 ? 'A' : 'B';
        if (m.winner == null) row.halved += 1;
        else if (m.winner === side) row.won += 1;
        else row.lost += 1;
        // Only a night played to the end says how somebody scores.
        if (!cfg.ended) {
          const o = overPar(round, id);
          if (o != null) row.overs.push(o);
        }
        players.set(k, row);
      });
    }

    nights.push({
      round,
      teams: [
        { key: keys[0], name: result.teams[0].name, points: pts[0] },
        { key: keys[1], name: result.teams[1].name, points: pts[1] },
      ],
      winner,
      called: result.endedAfter != null,
      provisional: result.provisional.length > 0,
    });
  }

  const teamRows = [...teams.values()].sort(
    (a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name)
  );
  const playerRows: PlayerStanding[] = [...players.values()]
    .map(({ overs, ...p }) => ({
      ...p,
      avgOverPar: overs.length ? overs.reduce((s, n) => s + n, 0) / overs.length : null,
      // Over every league night on the phone, not just this season's: the
      // league's average runs across seasons, five matches back.
      playsTo: leagueHistory(rounds, p.name)?.handicap ?? null,
    }))
    .sort(
      (a, b) =>
        b.won - b.lost - (a.won - a.lost) || b.won - a.won || a.name.localeCompare(b.name)
    );

  return {
    year,
    nights: nights.reverse(),
    unfinished: inSeason.length - finished.length,
    teams: teamRows,
    players: playerRows,
  };
}
