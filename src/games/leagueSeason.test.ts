import { describe, it, expect } from 'vitest';
import { leagueSeason, leagueSeasonYears } from './leagueSeason';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { LeagueTeam, Player, Round } from '../types';

/**
 * A finished league night. `us` and `them` are each [A, B] names; `usScore`
 * and `themScore` are what both of that team's players shoot on every hole.
 * Equal handicaps throughout, so lower score simply wins every match.
 */
function night(
  id: string,
  date: string,
  us: [string, string],
  them: [string, string],
  usScore: number,
  themScore: number,
  extra: { teams?: [Partial<LeagueTeam>, Partial<LeagueTeam>]; drop?: string[] } = {}
): Round {
  const ps: Player[] = [
    player(`${id}a`, us[0]),
    player(`${id}b`, us[1]),
    player(`${id}c`, them[0]),
    player(`${id}d`, them[1]),
  ].filter((p) => !extra.drop?.includes(p.name));
  const hs = holes(9);
  const per: Record<string, number[]> = {};
  for (const p of ps) {
    const mine = p.id.endsWith('a') || p.id.endsWith('b');
    per[p.id] = Array(9).fill(mine ? usScore : themScore);
  }
  const ids = (name: string, pid: string) => (extra.drop?.includes(name) ? '' : pid);
  const r = makeRound({
    players: ps,
    holes: hs,
    scores: scoresFrom(hs, per),
    status: 'finished',
    options: {
      league: {
        teams: [
          { aId: ids(us[0], `${id}a`), bId: ids(us[1], `${id}b`), ...extra.teams?.[0] },
          { aId: ids(them[0], `${id}c`), bId: ids(them[1], `${id}d`), ...extra.teams?.[1] },
        ],
        pointsPerMatch: 1,
      },
    },
  });
  return { ...r, id, date };
}

const AL_BO: [string, string] = ['Al', 'Bo'];
const CY_DI: [string, string] = ['Cy', 'Di'];
const ED_FY: [string, string] = ['Ed', 'Fy'];

describe('league season', () => {
  it('lists the seasons that have a league night, newest first', () => {
    const regular = { ...makeRound(), date: '2027-05-01' };
    const rounds = [
      night('n1', '2025-06-05', AL_BO, CY_DI, 4, 5),
      night('n2', '2026-06-04', AL_BO, CY_DI, 4, 5),
      regular,
    ];
    expect(leagueSeasonYears(rounds)).toEqual([2026, 2025]);
  });

  it('adds up team points and night results across the season', () => {
    const rounds = [
      night('n1', '2026-06-04', AL_BO, CY_DI, 4, 5), // Al & Bo sweep 3–0
      night('n2', '2026-06-11', AL_BO, ED_FY, 5, 4), // Ed & Fy sweep
      night('n3', '2026-06-18', CY_DI, AL_BO, 4, 4), // all halved, 1½ each
    ];
    const s = leagueSeason(rounds, 2026);
    const row = (name: string) => s.teams.find((t) => t.name === name)!;
    expect(row('Al & Bo')).toMatchObject({ nights: 3, won: 1, lost: 1, halved: 1, points: 4.5 });
    expect(row('Ed & Fy')).toMatchObject({ nights: 1, won: 1, points: 3 });
    expect(row('Cy & Di')).toMatchObject({ nights: 2, lost: 1, halved: 1, points: 1.5 });
    // Sorted by points.
    expect(s.teams.map((t) => t.name)).toEqual(['Al & Bo', 'Ed & Fy', 'Cy & Di']);
    // Nights newest first.
    expect(s.nights.map((n) => n.round.id)).toEqual(['n3', 'n2', 'n1']);
    expect(s.nights[2].winner).toBe(0);
    expect(s.nights[0].winner).toBeNull();
  });

  it('keeps a team together whichever slot each player was typed into', () => {
    const rounds = [
      night('n1', '2026-06-04', ['Al', 'Bo'], CY_DI, 4, 5),
      night('n2', '2026-06-11', ['bo ', 'AL'], CY_DI, 4, 5),
    ];
    const s = leagueSeason(rounds, 2026);
    expect(s.teams).toHaveLength(2);
    expect(s.teams[0]).toMatchObject({ nights: 2, won: 2, points: 6 });
  });

  it('uses a team name when the team has one', () => {
    const rounds = [
      night('n1', '2026-06-04', AL_BO, CY_DI, 4, 5, {
        teams: [{ name: 'Sandbaggers' }, {}],
      }),
    ];
    const s = leagueSeason(rounds, 2026);
    expect(s.teams[0].name).toBe('Sandbaggers');
    expect(s.teams[0].players).toEqual(['Al', 'Bo']);
  });

  it('folds a night a player missed into their usual team', () => {
    const rounds = [
      night('n1', '2026-06-04', AL_BO, CY_DI, 4, 5),
      // Bo out, no name given for who was missing.
      night('n2', '2026-06-11', AL_BO, CY_DI, 4, 5, {
        drop: ['Bo'],
        teams: [{ absent: 'b' }, {}],
      }),
    ];
    const s = leagueSeason(rounds, 2026);
    const us = s.teams.find((t) => t.players.includes('Al'))!;
    expect(us.nights).toBe(2);
    expect(s.teams).toHaveLength(2);
  });

  it('leaves unfinished nights out and says how many', () => {
    const live = { ...night('n2', '2026-06-11', AL_BO, CY_DI, 4, 5), scores: {} };
    const s = leagueSeason([night('n1', '2026-06-04', AL_BO, CY_DI, 4, 5), live], 2026);
    expect(s.nights).toHaveLength(1);
    expect(s.unfinished).toBe(1);
  });

  it("records each player's own singles match and their scoring", () => {
    const rounds = [
      night('n1', '2026-06-04', AL_BO, CY_DI, 4, 5),
      night('n2', '2026-06-11', AL_BO, CY_DI, 5, 4),
      night('n3', '2026-06-18', AL_BO, CY_DI, 4, 4),
    ];
    const s = leagueSeason(rounds, 2026);
    const al = s.players.find((p) => p.name === 'Al')!;
    expect(al).toMatchObject({ nights: 3, won: 1, lost: 1, halved: 1, team: 'Al & Bo' });
    // 0 over, +9, 0 over on par-36 nines.
    expect(al.avgOverPar).toBe(3);
    expect(al.playsTo).not.toBeNull();
  });

  it('is empty for a season with no league nights', () => {
    const s = leagueSeason([night('n1', '2025-06-04', AL_BO, CY_DI, 4, 5)], 2026);
    expect(s).toMatchObject({ nights: [], teams: [], players: [], unfinished: 0 });
  });
});
