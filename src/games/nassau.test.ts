import { describe, it, expect } from 'vitest';
import {
  nassauTeams,
  nineHolesFor,
  endOfNine,
  pressHoles,
  nassauSegments,
  computeNassau,
  nassauMoney,
  autoPressStarts,
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
    expect(labels).toEqual(['Front', 'Back', 'Total', 'Press 13–18']);
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

describe('a round played on the back nine alone', () => {
  it('is one bet, not an empty front, a back and a total over the same holes', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: holes18().slice(9),
      games: ['nassau'],
    });
    const segs = nassauSegments(round);
    expect(segs.map((s) => s.label)).toEqual(['Total']);
    expect(segs[0].holes.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe('a blank hole on a finished round', () => {
  // The owner's rule: once the round is finished a blank hole is halved, in
  // every Nassau bet as in Match Play. Left "to play", the bets with a blank
  // in them never closed and paid nobody.
  const hs = holes18();
  const roundAs = (status: 'in_progress' | 'finished') =>
    makeRound({
      holes: hs,
      games: ['nassau'],
      options: { stakes: { nassau: 10 } },
      scores: scoresFrom(hs, {
        // Front: Al wins the 1st, Bo blank on the 9th.
        // Back: Al wins the 10th and 11th, Bo the 12th, the 18th blank for both.
        p1: [3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 5, 4, 4, 4, 4, 4, undefined],
        p2: [4, 4, 4, 4, 4, 4, 4, 4, undefined, 4, 4, 4, 4, 4, 4, 4, 4, undefined],
      }),
      status,
    });

  it('leaves every bet open while the round is in progress', () => {
    const r = computeNassau(roundAs('in_progress'));
    expect(r.standings.map((s) => s.detail)).toEqual([
      'Al 1 UP · 1 to play',
      'Al 1 UP · 1 to play',
      'Al 2 UP · 2 to play',
    ]);
    expect(nassauMoney(roundAs('in_progress'), 10)).toEqual({ p1: 0, p2: 0 });
  });

  it('settles front, back and total once the round is finished', () => {
    const round = roundAs('finished');
    const r = computeNassau(round);
    // The total: the 9th halved, Al is two up with only the 18th left.
    expect(r.standings.map((s) => s.detail)).toEqual([
      'Al won 1 UP',
      'Al won 1 UP',
      'Al won 2&1',
    ]);
    expect(r.status).toBe('Al leads 3–0');
    const money = nassauMoney(round, 10);
    expect(money).toEqual({ p1: 30, p2: -30 });
    expect(money.p1 + money.p2).toBe(0);
  });

  it('reads won N UP, not N&1, when every hole of the nine was played but one is blank', () => {
    // Bo blank on the 5th; Al wins the 1st and the 9th. With the 5th left
    // "to play" the front read "Al won 2&1" though the nine was done.
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [3, 4, 4, 4, 4, 4, 4, 4, 3],
        p2: [4, 4, 4, 4, undefined, 4, 4, 4, 4],
      }),
      status: 'finished',
    });
    expect(computeNassau(round).standings[0].detail).toBe('Al won 2 UP');
    expect(computeNassau({ ...round, status: 'in_progress' }).standings[0].detail).toBe(
      'Al won 2&1'
    );
  });

  it('settles a 2v2 Nassau with a blank, zero-sum', () => {
    const four = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')];
    const round = makeRound({
      players: four,
      holes: hs,
      games: ['nassau'],
      options: { nassau: { mode: '2v2', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } },
      scores: scoresFrom(hs, {
        // Team A wins the 1st; team B has nothing on the 9th; the back is level.
        p1: [3, ...Array(17).fill(4)],
        p2: Array(18).fill(5),
        p3: [...Array(8).fill(4), undefined, ...Array(9).fill(4)],
        p4: [...Array(8).fill(4), undefined, ...Array(9).fill(4)],
      }),
      status: 'finished',
    });
    expect(computeNassau(round).standings.map((s) => s.detail)).toEqual([
      'Al & Bo won 1 UP',
      'Halved',
      'Al & Bo won 1 UP',
    ]);
    const money = nassauMoney(round, 5);
    expect(money).toEqual({ p1: 10, p2: 10, p3: -10, p4: -10 });
    expect(Object.values(money).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('lets the two-down rule look past a blank once it is a halved hole', () => {
    // Al wins the 1st and 3rd; the 2nd is blank for Bo. In progress the rule
    // waits on the 2nd; finished, the 2nd is halved and Bo is two down after
    // the 3rd, so a press starts on the 4th.
    const round = makeRound({
      holes: hs,
      options: { autoPress: true },
      scores: scoresFrom(hs, {
        p1: [3, 4, 3, ...Array(15).fill(4)],
        p2: [4, undefined, 4, ...Array(15).fill(4)],
      }),
      status: 'in_progress',
    });
    expect(autoPressStarts(round)).toEqual([]);
    expect(autoPressStarts({ ...round, status: 'finished' })).toEqual([4]);
  });
});
