import { describe, it, expect } from 'vitest';
import {
  nassauTeams,
  nineHolesFor,
  endOfNine,
  pressHoles,
  nassauSegments,
  computeNassau,
} from './nassau';
import { makeRound, player, holes, holes18, scoresFrom } from './testFixtures';

describe('nine helpers', () => {
  it('nineHolesFor splits front and back', () => {
    const round = makeRound({ holes: holes18() });
    expect(nineHolesFor(round, 3).map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(nineHolesFor(round, 14).map((h) => h.number)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it('endOfNine returns the last hole of the containing nine', () => {
    const round = makeRound({ holes: holes18() });
    expect(endOfNine(round, 3)).toBe(9);
    expect(endOfNine(round, 14)).toBe(18);
  });

  it('pressHoles covers from the start hole through the end of that nine', () => {
    const round = makeRound({ holes: holes18() });
    expect(pressHoles(round, 13).map((h) => h.number)).toEqual([13, 14, 15, 16, 17, 18]);
  });
});

describe('nassauSegments', () => {
  it('gives front/back/total for an 18-hole round', () => {
    const round = makeRound({ holes: holes18() });
    expect(nassauSegments(round).map((s) => s.label)).toEqual(['Front', 'Back', 'Total']);
  });

  it('collapses to a single total bet for a 9-hole round', () => {
    const round = makeRound({ holes: holes(9) });
    expect(nassauSegments(round).map((s) => s.label)).toEqual(['Total']);
  });

  it('appends press segments after the base bets', () => {
    const round = makeRound({ holes: holes18(), presses: [13] });
    const labels = nassauSegments(round).map((s) => s.label);
    expect(labels).toEqual(['Front', 'Back', 'Total', 'Press h13–18']);
  });
});

describe('computeNassau', () => {
  it('needs two players', () => {
    const r = computeNassau(makeRound({ players: [player('p1', 'Al')] }));
    expect(r.status).toBe('Needs 2 players');
  });

  it('reports a sweep as leading 3–0', () => {
    const hs = holes18();
    const scores = scoresFrom(hs, {
      p1: Array(18).fill(3),
      p2: Array(18).fill(5),
    });
    const r = computeNassau(makeRound({ holes: hs, games: ['nassau'], scores }));
    expect(r.status).toContain('Al leads 3–0');
    expect(r.standings).toHaveLength(3);
  });

  it('reports all bets open before any hole is scored', () => {
    const r = computeNassau(makeRound({ holes: holes18(), games: ['nassau'] }));
    expect(r.status).toBe('All bets open');
  });

  it('defaults sides to the two players and shows the matchup note', () => {
    const r = computeNassau(makeRound({ holes: holes18(), games: ['nassau'] }));
    const { a, b } = nassauTeams(makeRound({ holes: holes18() }));
    expect(r.note).toBe(`${a.label} vs ${b.label}`);
  });
});
