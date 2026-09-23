import { describe, it, expect } from 'vitest';
import { canCallLeagueMatch, computeLeague, leagueStrokesOnHole } from './league';
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
  // Team 1 (10, 14) v Team 2 (6, 8). Every match plays off the low of the
  // foursome, 6 — so a player's singles strokes and team strokes are the same.
  const FOUR_H = [
    player('p1', 'Al', 10),
    player('p2', 'Bo', 14),
    player('p3', 'Cy', 6),
    player('p4', 'Di', 8),
  ];
  const hs = holes(9);
  const r = makeRound({ players: FOUR_H, holes: hs, options: { league: league() } });

  it('gives Bo his strokes off the foursome low, in the B match and the team match', () => {
    // 14 - 6 = 8, on stroke indexes 1..8.
    expect(leagueStrokesOnHole(r, hs[0])['p2']).toEqual(['B', 'T']);
    expect(leagueStrokesOnHole(r, hs[7])['p2']).toEqual(['B', 'T']);
    expect(leagueStrokesOnHole(r, hs[8])['p2']).toEqual([]);
  });

  it('gives Di strokes in her B match even though her B opponent is higher', () => {
    // 8 - 6 = 2, on stroke indexes 1..2. Off the low of the pair she would
    // have had none; off the foursome she gets two, and so does the team.
    expect(leagueStrokesOnHole(r, hs[0])['p4']).toEqual(['B', 'T']);
    expect(leagueStrokesOnHole(r, hs[2])['p4']).toEqual([]);
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

describe('a league night off a Handicap Index', () => {
  /**
   * Nine holes, all par 4 — par 36. On a course of average difficulty rated at
   * par, `Index × (slope ÷ 113) + (rating − par)` over nine holes is half the
   * Index, so these four Indexes are worth 7, 3, 8 and 2 strokes here. Picked
   * so the arithmetic is checkable by eye rather than by running the code.
   */
  const hs = holes(9);
  const rated = { slope: 113, rating: 36 };
  const INDEXED = [
    { id: 'p1', name: 'Al', index: 14 },
    { id: 'p2', name: 'Bo', index: 6 },
    { id: 'p3', name: 'Cy', index: 16 },
    { id: 'p4', name: 'Di', index: 4 },
  ];
  /** The same four, as the stroke counts somebody would otherwise have typed. */
  const TYPED = [
    player('p1', 'Al', 7),
    player('p2', 'Bo', 3),
    player('p3', 'Cy', 8),
    player('p4', 'Di', 2),
  ];
  const scores = scoresFrom(hs, {
    p1: [5, 4, 4, 5, 4, 4, 5, 4, 4],
    p2: [4, 4, 5, 4, 4, 4, 4, 5, 4],
    p3: [5, 5, 4, 4, 5, 4, 4, 4, 5],
    p4: [4, 4, 4, 4, 4, 5, 4, 4, 4],
  });

  const indexed = makeRound({
    players: INDEXED,
    holes: hs,
    options: { league: league() },
    scores,
    ...rated,
  });
  const typed = makeRound({ players: TYPED, holes: hs, options: { league: league() }, scores });

  it('scores exactly as it would off the stroke counts those Indexes are worth', () => {
    // The point of the change: league gains the Index route without its own
    // rules — the low-man subtraction, the one-stroke cap, the allocation —
    // being touched at all.
    const fromIndex = computeLeague(indexed);
    const fromTyped = computeLeague(typed);
    expect(fromIndex.matches.map((m) => m.status)).toEqual(fromTyped.matches.map((m) => m.status));
    expect(fromIndex.teams).toEqual(fromTyped.teams);
    expect(fromIndex.matches.map((m) => m.strokes)).toEqual(
      fromTyped.matches.map((m) => m.strokes)
    );
  });

  it('plays the singles off the low of the foursome, as the league rules say', () => {
    // Di (2) is the low of all four. A is Al 7 v Cy 8, so 5 and 6; B is Bo 3
    // v Di 2, so Bo gets 1.
    const byKey = Object.fromEntries(computeLeague(indexed).matches.map((m) => [m.key, m]));
    expect(byKey.A.strokes).toEqual([
      { name: 'Al', strokes: 5 },
      { name: 'Cy', strokes: 6 },
    ]);
    expect(byKey.B.strokes).toEqual([{ name: 'Bo', strokes: 1 }]);
  });

  it('still plays the team match off the low man of all four', () => {
    // Di is off 2, so the other three get 5, 1 and 6 — derived, then adjusted.
    const team = computeLeague(indexed).matches.find((m) => m.key === 'team')!;
    expect(team.strokes).toEqual([
      { name: 'Al', strokes: 5 },
      { name: 'Bo', strokes: 1 },
      { name: 'Cy', strokes: 6 },
    ]);
  });

  it('still gives at most one stroke a hole, however big the Index', () => {
    // An Index of 54 is worth 27 over nine holes, which is three times the
    // holes available. The cap is what keeps a league night a league night.
    const monster = makeRound({
      players: [{ id: 'p1', name: 'Al', index: 54 }, ...INDEXED.slice(1)],
      holes: hs,
      options: { league: league() },
      scores,
      ...rated,
    });
    for (const h of hs) {
      const chips = leagueStrokesOnHole(monster, h);
      // One chip per match at most — 'A' for the singles, 'T' for the team.
      expect(chips.p1.length).toBeLessThanOrEqual(2);
      expect(new Set(chips.p1).size).toBe(chips.p1.length);
    }
  });

  it('falls back to the typed count when the course carries no rating', () => {
    // Every league round saved before this existed, and every one played
    // somewhere nobody has looked the rating up.
    const unrated = makeRound({
      players: INDEXED.map((p, i) => ({ ...p, handicap: [7, 3, 8, 2][i] })),
      holes: hs,
      options: { league: league() },
      scores,
    });
    expect(computeLeague(unrated).teams).toEqual(computeLeague(typed).teams);
  });

  it('halves an eighteen-hole rating when told that is what it covers', () => {
    // The case a league night actually is: a course saved once with its
    // eighteen-hole figures, the front nine played off it every week.
    // `ratingHoles` is what lets the same 74.6 mean "for eighteen holes" here
    // and be converted rather than rejected.
    const fromEighteen = makeRound({
      players: INDEXED,
      holes: hs,
      options: { league: league() },
      scores,
      slope: 113,
      rating: 72,
      ratingHoles: 18,
    });
    // 72 over eighteen is 36 over these nine, which is their par — so the same
    // strokes as the nine-hole rating of 36 above.
    expect(computeLeague(fromEighteen).matches.map((m) => m.strokes)).toEqual(
      computeLeague(indexed).matches.map((m) => m.strokes)
    );
  });

  it('refuses an eighteen-hole rating presented as a nine-hole one', () => {
    // 74.6 on nine holes is not a rating, it is a rating for twice these
    // holes. Better to fall back to the typed number than to halve it and
    // look confident.
    const wrong = makeRound({
      players: INDEXED.map((p, i) => ({ ...p, handicap: [7, 3, 8, 2][i] })),
      holes: hs,
      options: { league: league() },
      scores,
      slope: 113,
      rating: 74.6,
    });
    expect(computeLeague(wrong).teams).toEqual(computeLeague(typed).teams);
  });
});

describe('league rules from the 2025 rule sheet', () => {
  const hs = holes(9);
  const flat = (n: number) => Array(9).fill(n);

  it('caps two high handicaps at 9 shots each, which plays them level', () => {
    // A: 2 v 4. B: 12 v 16 — off the foursome low of 2 that is 10 and 14,
    // and both cap at 9.
    const r = makeRound({
      players: [player('p1', 'Al', 2), player('p2', 'Bo', 12), player('p3', 'Cy', 4), player('p4', 'Di', 16)],
      holes: hs,
      options: { league: league() },
    });
    const b = computeLeague(r).matches.find((m) => m.key === 'B')!;
    expect(b.strokes).toEqual([
      { name: 'Bo', strokes: 9 },
      { name: 'Di', strokes: 9 },
    ]);
  });

  it('counts anything over 9 as a 9', () => {
    // Al takes 12 on the first hole, Cy a 9: halved, not lost.
    const r = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
      scores: scoresFrom(hs, {
        p1: [12, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: flat(4),
        p3: [9, 4, 4, 4, 4, 4, 4, 4, 4],
        p4: flat(4),
      }),
    });
    expect(computeLeague(r).matches[0].status).toBe('Halved');
  });

  it('loses the singles hole to a pick-up, whatever the other player scored', () => {
    // Al picks up on hole 1 (recorded as a 9); Cy makes an 8. Otherwise square.
    const r = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
      scores: scoresFrom(hs, {
        p1: [9, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: flat(4),
        p3: [9, 4, 4, 4, 4, 4, 4, 4, 4],
        p4: flat(4),
      }),
      pickups: { 1: ['p1'] },
    });
    const a = computeLeague(r).matches.find((m) => m.key === 'A')!;
    expect(a.winner).toBe('B');
  });

  it('halves a hole where both singles players pick up', () => {
    const r = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
      scores: scoresFrom(hs, { p1: [9, ...flat(4).slice(1)], p2: flat(4), p3: [9, ...flat(4).slice(1)], p4: flat(4) }),
      pickups: { 1: ['p1', 'p3'] },
    });
    expect(computeLeague(r).matches[0].status).toBe('Halved');
  });

  it("keeps the partner's ball in the team match after a pick-up", () => {
    // Al picks up on hole 1, but Bo birdies it: Team 1 still wins the hole
    // against Team 2's pars, and every other hole is level.
    const r = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
      scores: scoresFrom(hs, {
        p1: [9, ...flat(4).slice(1)],
        p2: [3, ...flat(4).slice(1)],
        p3: flat(4),
        p4: flat(4),
      }),
      pickups: { 1: ['p1'] },
    });
    const team = computeLeague(r).matches.find((m) => m.key === 'team')!;
    expect(team.winner).toBe('A');
  });

  it('loses the team hole when both partners pick up', () => {
    const r = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
      scores: scoresFrom(hs, {
        p1: [9, ...flat(4).slice(1)],
        p2: [9, ...flat(4).slice(1)],
        p3: [9, ...flat(4).slice(1)],
        p4: flat(4),
      }),
      pickups: { 1: ['p1', 'p2'] },
    });
    const team = computeLeague(r).matches.find((m) => m.key === 'team')!;
    expect(team.winner).toBe('B');
  });
});

describe('a team one player short', () => {
  const hs = holes(9);
  const flat = (n: number) => Array(9).fill(n);
  // Team 1 is Al alone (Bo absent). Cy and Di are there.
  const short = (overrides: { p1?: number[]; p3?: number[]; p4?: number[] } = {}) =>
    makeRound({
      players: [player('p1', 'Al', 6), player('p3', 'Cy', 2), player('p4', 'Di', 8)],
      holes: hs,
      options: {
        league: {
          pointsPerMatch: 1,
          teams: [
            { aId: 'p1', bId: '', absent: 'b', absentName: 'Bo' },
            { aId: 'p3', bId: 'p4' },
          ],
        },
      },
      scores: scoresFrom(hs, {
        p1: overrides.p1 ?? flat(4),
        p3: overrides.p3 ?? flat(4),
        p4: overrides.p4 ?? flat(4),
      }),
    });

  it("forfeits the absent player's match to their opponent", () => {
    const b = computeLeague(short()).matches.find((m) => m.key === 'B')!;
    expect(b.winner).toBe('B');
    expect(b.over).toBe(true);
    expect(b.status).toBe('Di wins — Bo absent');
  });

  it('lets the lone player play the team match on his own ball', () => {
    // Al makes birdie on every hole; Team 2's better ball is par.
    const team = computeLeague(short({ p1: flat(3) })).matches.find((m) => m.key === 'team')!;
    expect(team.winner).toBe('A');
  });

  it('takes strokes off the low of the players who are there', () => {
    // Cy (2) is the low of the three: Al gets 4, Di 6.
    const team = computeLeague(short()).matches.find((m) => m.key === 'team')!;
    expect(team.strokes).toEqual([
      { name: 'Al', strokes: 4 },
      { name: 'Di', strokes: 6 },
    ]);
  });

  it("names the team with the missing player's name", () => {
    const r = short();
    r.options.league!.teams[0].name = undefined;
    expect(computeLeague(r).teams[0].name).toBe('Al & Bo');
  });

  it('gives nobody the points when both players in a match are absent', () => {
    const r = short();
    r.options.league!.teams[1] = { aId: 'p3', bId: '', absent: 'b' };
    r.players = r.players.filter((p) => p.id !== 'p4');
    const b = computeLeague(r).matches.find((m) => m.key === 'B')!;
    expect(b.void).toBe(true);
    // The A and team matches are worth a point each, however they went; the
    // B match adds nothing to either side.
    const res = computeLeague(r);
    expect(res.teams[0].points + res.teams[1].points).toBe(2);
  });
});

describe('a match called for darkness', () => {
  const hs = holes(9);
  const called = (thru: number, ended = true) => {
    const card = (n: number) => Array.from({ length: 9 }, (_, i) => (i < thru ? n : null));
    return makeRound({
      players: FOUR,
      holes: hs,
      // Al birdies every hole he plays; everyone else pars.
      scores: scoresFrom(hs, { p1: card(3), p2: card(4), p3: card(4), p4: card(4) }),
      options: { league: { ...league(1), ended } },
    });
  };

  it('is final on the holes played, once called', () => {
    const r = computeLeague(called(6));
    expect(r.endedAfter).toBe(6);
    expect(r.complete).toBe(true);
    const a = r.matches.find((m) => m.key === 'A')!;
    expect(a.status).toBe('Al won 4&2'); // closed out within the six holes played
    // A and team won; the B match (Bo v Di, all pars) is halved and final.
    expect(r.teams[0].points).toBe(2.5);
  });

  it('ignores a hole the whole group did not finish', () => {
    const r = called(6);
    // Al alone played on into hole 7.
    r.scores[7] = { p1: 3 };
    expect(computeLeague(r).endedAfter).toBe(6);
  });

  it('is only offered once five holes are finished and some remain', () => {
    expect(canCallLeagueMatch(called(4, false))).toBe(false);
    expect(canCallLeagueMatch(called(5, false))).toBe(true);
    expect(canCallLeagueMatch(called(9, false))).toBe(false);
    expect(canCallLeagueMatch(called(6, true))).toBe(false);
  });

  it('plays on as normal when resumed', () => {
    const r = computeLeague(called(6, false));
    expect(r.endedAfter).toBeUndefined();
    expect(r.complete).toBe(false);
  });
});
