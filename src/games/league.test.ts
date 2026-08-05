import { describe, it, expect } from 'vitest';
import { computeLeague, leagueStrokesOnHole } from './league';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { LeagueSetup } from '../types';

const FOUR = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')];

function league(pointsPerMatch = 2): LeagueSetup {
  return {
    teams: [
      { name: 'Team 1', aId: 'p1', bId: 'p2' },
      { name: 'Team 2', aId: 'p3', bId: 'p4' },
    ],
    pointsPerMatch,
  };
}

describe('computeLeague — structure', () => {
  it('produces three matches: A, B, and team', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
      p3: Array(9).fill(4),
      p4: Array(9).fill(4),
    });
    const r = computeLeague(
      makeRound({ players: FOUR, holes: hs, options: { league: league() }, scores })
    );
    expect(r.matches.map((m) => m.key)).toEqual(['A', 'B', 'team']);
    expect(r.teams).toHaveLength(2);
  });

  it('splits points on an all-halved night', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
      p3: Array(9).fill(4),
      p4: Array(9).fill(4),
    });
    const r = computeLeague(
      makeRound({ players: FOUR, holes: hs, options: { league: league(2) }, scores })
    );
    // 3 matches all halved, 2 pts each → 3 pts per team.
    expect(r.teams[0].points).toBe(3);
    expect(r.teams[1].points).toBe(3);
    expect(r.complete).toBe(true);
  });
});

describe('computeLeague — winners take points', () => {
  it('awards the full match points to a decisive winner', () => {
    const hs = holes(9);
    // Team 1's players win every hole in every match.
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(3),
      p2: Array(9).fill(3),
      p3: Array(9).fill(5),
      p4: Array(9).fill(5),
    });
    const r = computeLeague(
      makeRound({ players: FOUR, holes: hs, options: { league: league(2) }, scores })
    );
    // Team 1 wins A, B, and team → 3 matches × 2 = 6.
    expect(r.teams[0].points).toBe(6);
    expect(r.teams[1].points).toBe(0);
    r.matches.forEach((m) => expect(m.winner).toBe('A'));
  });
});

describe('computeLeague — handicap cap (1 stroke/hole)', () => {
  it('never gives more than one stroke per hole even with a huge handicap gap', () => {
    // 9 holes. Bo (p2) has a massive raw handicap; capped to at most 9 strokes.
    // Scratch player scores 4s; high-handicap player scores 5s.
    const hs = holes(9); // SI 1..9
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4), // scratch, A player team 1
      p2: Array(9).fill(5), // huge hcp, B player team 1
      p3: Array(9).fill(4), // scratch, A player team 2
      p4: Array(9).fill(4), // scratch, B player team 2
    });
    const round = makeRound({
      players: [
        player('p1', 'Al', 0),
        player('p2', 'Bo', 40), // absurd handicap
        player('p3', 'Cy', 0),
        player('p4', 'Di', 0),
      ],
      holes: hs,
      options: { league: league(2) },
      scores,
    });
    const r = computeLeague(round);
    // B match: Bo (5s, gets 1 stroke/hole → net 4s) vs Di (4s). Every hole halved.
    // With the cap, Bo can only pull level, never go under — so B match is halved,
    // NOT a Bo blowout win. If the cap were broken, Bo's 40 strokes would win.
    const bMatch = r.matches.find((m) => m.key === 'B')!;
    expect(bMatch.winner).toBeNull();
    expect(bMatch.status).toBe('Halved');
  });

  it('strokes come off the lower handicap in a singles match', () => {
    // A match: Al hcp 5 vs Cy hcp 3. Strokes off the low (3) → Al gets 2 net strokes
    // on SI 1 & 2. Both shoot gross 4s; Al nets 3,3,4,4... → Al wins the two hardest holes.
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: Array(9).fill(4),
      p2: Array(9).fill(4),
      p3: Array(9).fill(4),
      p4: Array(9).fill(4),
    });
    const round = makeRound({
      players: [
        player('p1', 'Al', 5),
        player('p2', 'Bo', 0),
        player('p3', 'Cy', 3),
        player('p4', 'Di', 0),
      ],
      holes: hs,
      options: { league: league(2) },
      scores,
    });
    const r = computeLeague(round);
    const aMatch = r.matches.find((m) => m.key === 'A')!;
    // Al gets 5-3=2 strokes on SI 1,2 → wins 2 holes, rest halved → Al 2 UP.
    expect(aMatch.winner).toBe('A');
  });
});

describe('computeLeague — back-nine support', () => {
  it('scores a match played on holes 10–18', () => {
    // Back-nine round: hole numbers 10..18, SI provided so allProvided is true.
    const backHoles = Array.from({ length: 9 }, (_, i) => ({
      number: 10 + i,
      par: 4,
      strokeIndex: i + 1,
    }));
    const scores = scoresFrom(backHoles, {
      p1: Array(9).fill(3),
      p2: Array(9).fill(3),
      p3: Array(9).fill(5),
      p4: Array(9).fill(5),
    });
    const round = makeRound({
      players: FOUR,
      holes: backHoles,
      options: { league: league(2) },
      scores,
    });
    const r = computeLeague(round);
    // Team 1 sweeps on the back nine.
    expect(r.teams[0].points).toBe(6);
    expect(r.complete).toBe(true);
  });
});

describe('computeLeague — team match is best ball (better ball)', () => {
  it("lets a high-handicap partner's stroke-aided holes carry the team", () => {
    // The real league night that surfaced the bug: three 6s and a 14.
    // Team 1: Alex (6, A) & Jesse (14, B).  Team 2: Mike (6, A) & Tyler (6, B).
    // Front nine, SI 1..9. Strokes come off the low man of all four (6), so
    // Jesse plays to an 8 → a stroke on SI 1..8; everyone else plays scratch.
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      // Alex: steady bogeys → net 5 every hole.
      p1: [5, 5, 5, 5, 5, 5, 5, 5, 5],
      // Jesse: nets 3 on the four hardest (stroke), fades to 4, then blows up on
      // 8 & 9. His good balls beat the field; his blow-ups are junk to throw out.
      p2: [4, 4, 4, 4, 5, 5, 5, 8, 7],
      // Mike & Tyler: steady net 4s (scratch here).
      p3: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      p4: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    const round = makeRound({
      players: [
        player('p1', 'Alex', 6),
        player('p2', 'Jesse', 14),
        player('p3', 'Mike', 6),
        player('p4', 'Tyler', 6),
      ],
      holes: hs,
      options: {
        league: {
          teams: [
            { name: 'Alex & Jesse', aId: 'p1', bId: 'p2' },
            { name: 'Mike & Tyler', aId: 'p3', bId: 'p4' },
          ],
          pointsPerMatch: 1,
        },
      },
      scores,
    });
    const r = computeLeague(round);

    // Jesse wins his singles vs Tyler on strokes.
    const bMatch = r.matches.find((m) => m.key === 'B')!;
    expect(bMatch.winner).toBe('A');

    // Team match: best ball takes each team's BETTER net ball per hole, so
    // Jesse's blow-ups are thrown out (Alex covers) and his stroke holes carry
    // the team. Alex & Jesse win. Aggregate/combined-total would hand this to
    // Mike & Tyler — that was the bug.
    const teamMatch = r.matches.find((m) => m.key === 'team')!;
    expect(teamMatch.winner).toBe('A');

    // Alex & Jesse take the B match and the team match → 2 points to 1.
    expect(r.teams[0].points).toBe(2);
    expect(r.teams[1].points).toBe(1);

    // Board shows what each match scored off of: strokes come off the low man,
    // so only Jesse (14) receives them — 8 in his singles and 8 in the team.
    expect(bMatch.strokes).toEqual([{ name: 'Jesse', strokes: 8 }]);
    expect(teamMatch.strokes).toEqual([{ name: 'Jesse', strokes: 8 }]);
    // A match is two 6s → dead even, no strokes.
    const aMatch = r.matches.find((m) => m.key === 'A')!;
    expect(aMatch.strokes).toEqual([]);
  });
});

describe('computeLeague — incomplete night', () => {
  it('marks matches not over and the night incomplete when holes are unscored', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, {
      p1: [4, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
      p2: [4, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
      p3: [4, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
      p4: [4, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    });
    const r = computeLeague(
      makeRound({ players: FOUR, holes: hs, options: { league: league() }, scores })
    );
    expect(r.complete).toBe(false);
    r.matches.forEach((m) => expect(m.over).toBe(false));
    // No points awarded on unfinished matches.
    expect(r.teams[0].points).toBe(0);
    expect(r.teams[1].points).toBe(0);
  });
});

describe('leagueStrokesOnHole', () => {
  // Team 1 (10, 14) v Team 2 (6, 8). A match plays off 6, B match off 8,
  // team match off 4 — three different baselines, so one player receives
  // different strokes in their singles and team matches at the same time.
  const FOUR_H = [
    player('p1', 'Al', 10),
    player('p2', 'Bo', 14),
    player('p3', 'Cy', 6),
    player('p4', 'Di', 8),
  ];
  const hs = holes(9);
  const r = makeRound({ players: FOUR_H, holes: hs, options: { league: league() } });

  it('gives Bo the B match stroke only on the holes the B match allows', () => {
    // B match: 14 - 8 = 6 strokes, on stroke indexes 1..6.
    expect(leagueStrokesOnHole(r, hs[0])['p2']).toContain('B');
    expect(leagueStrokesOnHole(r, hs[6])['p2']).not.toContain('B');
  });

  it('gives Di team strokes where she gets none in her singles match', () => {
    // B match: 8 - 8 = 0. Team match: 8 - 6 = 2, on stroke indexes 1..2.
    expect(leagueStrokesOnHole(r, hs[0])['p4']).toEqual(['T']);
    expect(leagueStrokesOnHole(r, hs[5])['p4']).toEqual([]);
  });

  it('gives the low man no strokes anywhere', () => {
    for (const h of hs) expect(leagueStrokesOnHole(r, h)['p3']).toEqual([]);
  });

  it('returns an empty map for a non-league round', () => {
    expect(leagueStrokesOnHole(makeRound({ holes: hs }), hs[0])).toEqual({});
  });

  // Drift guard: the chips and the scoring must never disagree. If someone
  // changes a baseline in one place and not the other, this fails.
  it('agrees with computeLeague on every per-match stroke total', () => {
    const league_ = computeLeague(r);
    const perHole = hs.map((h) => leagueStrokesOnHole(r, h));
    const countFor = (pid: string, key: 'A' | 'B' | 'T') =>
      perHole.filter((m) => m[pid]?.includes(key)).length;

    for (const m of league_.matches) {
      const key = m.key === 'team' ? 'T' : m.key;
      for (const s of m.strokes) {
        const p = FOUR_H.find((x) => x.name === s.name)!;
        expect(countFor(p.id, key)).toBe(s.strokes);
      }
    }
  });
});
