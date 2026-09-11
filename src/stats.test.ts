import { describe, it, expect } from 'vitest';
import { computeStats, countsForStats, formatToPar } from './stats';
import { makeRound, player, holes, scoresFrom } from './games/testFixtures';
import type { Round } from './types';

const finish = (r: Round): Round => ({ ...r, status: 'finished' });

/** A finished 9-hole par-4 round with the given per-player cards. */
const round9 = (
  cards: Record<string, (number | null | undefined)[]>,
  over: Partial<Round> = {}
): Round => {
  const hs = holes(9);
  const ids = Object.keys(cards);
  return finish({
    ...makeRound({
      holes: hs,
      players: ids.map((id) => player(id, id.toUpperCase())),
      scores: scoresFrom(hs, cards),
    }),
    ...over,
  });
};

const statsFor = (rounds: Round[], name: string) =>
  computeStats(rounds).players.find((p) => p.key === name.toLowerCase());

describe('countsForStats', () => {
  it('counts a finished round', () => {
    expect(countsForStats(round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }))).toBe(true);
  });

  it('counts a fully scored round whose Finish was never tapped', () => {
    const r = { ...round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }), status: 'in_progress' as const };
    expect(countsForStats(r)).toBe(true);
  });

  it('excludes a round abandoned partway', () => {
    const r = { ...round9({ p1: [4, 4, 4] }), status: 'in_progress' as const };
    expect(countsForStats(r)).toBe(false);
  });

  it('excludes a round with no players or no holes', () => {
    expect(countsForStats(makeRound({ players: [], holes: holes(9) }))).toBe(false);
    expect(countsForStats(makeRound({ holes: [] }))).toBe(false);
  });
});

describe('computeStats', () => {
  it('is empty for no rounds', () => {
    expect(computeStats([])).toEqual({ rounds: 0, holes: 0, moneyMoved: 0, players: [] });
  });

  it('counts rounds and holes played', () => {
    const s = computeStats([round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] })]);
    expect(s.rounds).toBe(1);
    expect(s.holes).toBe(9);
    expect(s.players[0].rounds).toBe(1);
    expect(s.players[0].holes).toBe(9);
  });

  it('counts holes of golf, not one per player per hole', () => {
    // Three players round one nine is nine holes of golf, not twenty-seven.
    const s = computeStats([
      round9({
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: [5, 5, 5, 5, 5, 5, 5, 5, 5],
        p3: [6, 6, 6, 6, 6, 6, 6, 6, 6],
      }),
    ]);
    expect(s.holes).toBe(9);
    // Each player's own denominator is still their own scored holes.
    expect(s.players.every((p) => p.holes === 9)).toBe(true);
  });

  it('ignores an abandoned round entirely', () => {
    const played = round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] });
    const abandoned = { ...round9({ p1: [9, 9, 9] }, { id: 'r2' }), status: 'in_progress' as const };
    const s = computeStats([played, abandoned]);
    expect(s.rounds).toBe(1);
    expect(s.players[0].toPar).toBe(0);
  });

  it('totals strokes over par', () => {
    // Two birdies, one double, six pars on a par-4 nine: −2 +2 = even.
    const s = statsFor([round9({ p1: [3, 3, 6, 4, 4, 4, 4, 4, 4] })], 'p1');
    expect(s?.toPar).toBe(0);
  });

  it('scales the average to 18 holes so a nine compares to a full round', () => {
    // +9 over a nine is +18 per eighteen.
    const s = statsFor([round9({ p1: [5, 5, 5, 5, 5, 5, 5, 5, 5] })], 'p1');
    expect(s?.avgToPar).toBe(18);
  });

  it('averages across rounds by hole, not by round', () => {
    const a = round9({ p1: [5, 5, 5, 5, 5, 5, 5, 5, 5] }); // +9
    const b = { ...round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }), id: 'r2' }; // E
    const s = statsFor([a, b], 'p1');
    expect(s?.holes).toBe(18);
    expect(s?.toPar).toBe(9);
    expect(s?.avgToPar).toBe(9);
  });

  it('tallies the scoring mix', () => {
    const s = statsFor([round9({ p1: [2, 3, 4, 5, 6, 4, 4, 4, 4] })], 'p1');
    expect(s?.tally).toEqual({ eagles: 1, birdies: 1, pars: 5, bogeys: 1, others: 1 });
  });

  it('counts net to par from the handicap strokes actually received', () => {
    // Handicap 9 over a 9-hole card: a stroke on every hole, so +9 gross is
    // level net.
    const hs = holes(9);
    const r = finish(
      makeRound({
        holes: hs,
        players: [player('p1', 'Al', 9)],
        options: { useNet: true },
        scores: scoresFrom(hs, { p1: [5, 5, 5, 5, 5, 5, 5, 5, 5] }),
      })
    );
    const s = statsFor([r], 'Al');
    expect(s?.toPar).toBe(9);
    expect(s?.netToPar).toBe(0);
  });

  it('keeps the lowest fully scored round as the best', () => {
    const a = round9({ p1: [5, 5, 5, 5, 5, 5, 5, 5, 5] }, { course: 'Muni', date: '2026-05-01' });
    const b = {
      ...round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 3] }, { course: 'Links', date: '2026-06-01' }),
      id: 'r2',
    };
    const s = statsFor([a, b], 'p1');
    expect(s?.best).toEqual({ toPar: -1, course: 'Links', date: '2026-06-01', holes: 9 });
  });

  it('will not call a partly scored round somebody best', () => {
    // Finished with three holes blank: −3 over the holes played, which would
    // beat the complete round if incomplete cards were eligible.
    const gappy = round9({ p1: [3, 3, 3, 4, 4, 4, undefined, undefined, undefined] });
    const s = statsFor([gappy], 'p1');
    expect(s?.best).toBeNull();
    expect(s?.holes).toBe(6);
  });

  it('sums money across rounds and reports what changed hands', () => {
    const hs = holes(9);
    const mk = (id: string, cards: Record<string, number[]>) =>
      finish(
        makeRound({
          holes: hs,
          players: [player('p1', 'Al'), player('p2', 'Bo')],
          games: ['strokePlay'],
          options: { stakes: { strokePlay: 10 } },
          scores: scoresFrom(hs, cards),
        })
      );
    const r1 = { ...mk('r1', { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4], p2: [5, 5, 5, 5, 5, 5, 5, 5, 5] }) };
    const s = computeStats([r1]);
    expect(statsFor([r1], 'Al')?.money).toBe(10);
    expect(statsFor([r1], 'Bo')?.money).toBe(-10);
    expect(statsFor([r1], 'Al')?.moneyRounds).toBe(1);
    expect(s.moneyMoved).toBe(10);
  });

  it('leaves money at zero for rounds with no stakes', () => {
    const s = statsFor([round9({ p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] })], 'p1');
    expect(s?.money).toBe(0);
    expect(s?.moneyRounds).toBe(0);
  });

  it('totals skins only for rounds that played skins', () => {
    const hs = holes(9);
    const withSkins = finish(
      makeRound({
        holes: hs,
        players: [player('p1', 'Al'), player('p2', 'Bo')],
        games: ['skins'],
        scores: scoresFrom(hs, {
          p1: [3, 4, 4, 4, 4, 4, 4, 4, 4],
          p2: [4, 4, 4, 4, 4, 4, 4, 4, 4],
        }),
      })
    );
    expect(statsFor([withSkins], 'Al')?.skins).toBe(1);
    expect(statsFor([withSkins], 'Bo')?.skins).toBe(0);

    // The same card without skins in play earns nobody a skin.
    const noSkins = { ...withSkins, games: [] };
    expect(statsFor([noSkins], 'Al')?.skins).toBe(0);
  });

  it('follows one player across rounds by name, not by id', () => {
    const hs = holes(9);
    const a = finish(
      makeRound({
        holes: hs,
        players: [player('x1', 'Al')],
        scores: scoresFrom(hs, { x1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }),
      })
    );
    // Same person, new round, new uid — and a different spelling of the name.
    const b = {
      ...finish(
        makeRound({
          holes: hs,
          players: [player('z9', '  al ')],
          scores: scoresFrom(hs, { z9: [4, 4, 4, 4, 4, 4, 4, 4, 4] }),
        })
      ),
      id: 'r2',
    };
    const s = computeStats([a, b]);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].rounds).toBe(2);
  });

  it('takes the display spelling from the most recent round', () => {
    const hs = holes(9);
    const card = { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] };
    // listRounds() hands back newest first, so this order means "AL" is newer.
    const newest = finish(
      makeRound({ holes: hs, players: [player('p1', 'AL')], scores: scoresFrom(hs, card) })
    );
    const older = {
      ...finish(
        makeRound({ holes: hs, players: [player('p1', 'al')], scores: scoresFrom(hs, card) })
      ),
      id: 'r2',
    };
    expect(computeStats([newest, older]).players[0].name).toBe('AL');
  });

  it('never lets a blank player become a row', () => {
    const hs = holes(9);
    const r = finish(
      makeRound({
        holes: hs,
        players: [player('p1', 'Al'), player('p2', '  ')],
        scores: scoresFrom(hs, { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }),
      })
    );
    expect(computeStats([r]).players.map((p) => p.name)).toEqual(['Al']);
  });

  it('does not count a player who has no scores in a round', () => {
    const hs = holes(9);
    const r = finish(
      makeRound({
        holes: hs,
        players: [player('p1', 'Al'), player('p2', 'Bo')],
        scores: scoresFrom(hs, { p1: [4, 4, 4, 4, 4, 4, 4, 4, 4] }),
      })
    );
    expect(statsFor([r], 'Bo')).toBeUndefined();
  });

  it('sorts by rounds played, then by scoring average', () => {
    const hs = holes(9);
    const mk = (id: string, cards: Record<string, number[]>) =>
      finish(makeRound({ holes: hs, players: Object.keys(cards).map((k) => player(k, k)), scores: scoresFrom(hs, cards), ...{ id } as object }));
    const r1 = mk('r1', {
      lo: [4, 4, 4, 4, 4, 4, 4, 4, 4],
      hi: [6, 6, 6, 6, 6, 6, 6, 6, 6],
    });
    const s = computeStats([r1]);
    expect(s.players.map((p) => p.name)).toEqual(['lo', 'hi']);
  });
});

describe('formatToPar', () => {
  it('writes even par as E', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(0.04, 1)).toBe('E');
  });

  it('signs over and under par', () => {
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe('−2');
    expect(formatToPar(2.45, 1)).toBe('+2.5');
  });
});
