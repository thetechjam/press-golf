import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { compareRounds, forkRound, describeArrival } from './handover';
import { makeRound, holes18, player, scoresFrom, scrambleRound } from './games/testFixtures';
import { mergeRounds } from './backup';
import { packRound, unpackRound } from './shareLink';
import { findTrip, tripLedger } from './trips';

/**
 * Two phones holding the same round.
 *
 * The rule being protected here is the one in `backup.ts`: a collision on
 * round id is resolved by newest `updatedAt`, whole. That is correct when one
 * copy is simply further along and destructive when both have been scored, so
 * everything below is about telling those two apart before anything is written.
 */

const MINE = ['k3f9ab21', 'm7q2xz04'];
/** The ids a round rebuilt from a link carries — deliberately not the above. */
const THEIRS = ['p0', 'p1'];

/** A round scored to `holes`, under whichever set of player ids. */
function card(ids: string[], a: (number | null)[], b: (number | null)[]): Round {
  const hs = holes18();
  return makeRound({
    players: [
      { id: ids[0], name: 'Al' },
      { id: ids[1], name: 'Bo' },
    ],
    holes: hs,
    games: ['skins'],
    scores: scoresFrom(hs, { [ids[0]]: a, [ids[1]]: b }),
  });
}

/** Scores for the first `n` holes, all fours. */
const through = (n: number) => Array.from({ length: n }, () => 4);

describe('an arriving round against the one already here', () => {
  it('is new when this device has never seen it', () => {
    expect(compareRounds(card(THEIRS, through(9), through(9)), undefined)).toEqual({ kind: 'new' });
  });

  it('is the same round when both copies hold the same scores', () => {
    // Different player ids on each side, which is the normal case: a round
    // rebuilt from a link never carries the ids the phone that scored it used.
    const mine = card(MINE, through(9), through(9));
    const theirs = card(THEIRS, through(9), through(9));
    expect(compareRounds(theirs, mine)).toEqual({ kind: 'same' });
  });

  it('is ahead when the arriving copy carries the holes since', () => {
    // The ordinary handover coming home: you scored nine and gave it away,
    // they played it in.
    const mine = card(MINE, through(9), through(9));
    const theirs = card(THEIRS, through(18), through(18));
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('ahead');
    if (arrival.kind === 'ahead') expect(arrival.diff.theirsOnly).toBe(18);
  });

  it('is behind when this device is the one that carried on', () => {
    const mine = card(MINE, through(18), through(18));
    const theirs = card(THEIRS, through(9), through(9));
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('behind');
    if (arrival.kind === 'behind') expect(arrival.diff.mineOnly).toBe(18);
  });

  it('has diverged when both phones scored holes the other does not have', () => {
    // The case the whole module exists for. Left to `mergeRounds`, one of
    // these two back nines disappears with nothing on screen to say so.
    const mine = card(MINE, [...through(9), 4, 4, 4], through(9));
    const theirs = card(THEIRS, through(9), [...through(9), 5, 5]);
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('diverged');
    if (arrival.kind === 'diverged') {
      expect(arrival.diff.mineOnly).toBe(3);
      expect(arrival.diff.theirsOnly).toBe(2);
    }
  });

  it('counts a score corrected on one phone as divergence, not as being ahead', () => {
    // Both copies have a number for the hole; they disagree about what it is.
    // Neither is "further along", and taking either wholesale loses the other.
    const mine = card(MINE, [4, 4, 4], [4, 4, 4]);
    const theirs = card(THEIRS, [4, 7, 4], [4, 4, 4]);
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('diverged');
    if (arrival.kind === 'diverged') {
      expect(arrival.diff.differing).toBe(1);
      expect(arrival.diff.mineOnly).toBe(0);
      expect(arrival.diff.theirsOnly).toBe(0);
    }
  });

  it('ignores a blank cell, which is an unplayed hole and not a disagreement', () => {
    const mine = card(MINE, [4, null, 4], [4, 4, 4]);
    const theirs = card(THEIRS, [4, null, 4], [4, 4, 4]);
    expect(compareRounds(theirs, mine).kind).toBe('same');
  });

  it('treats a hole written as null the same as one left out entirely', () => {
    // The two copies express "nobody has played this yet" differently: a round
    // rebuilt from a link carries an explicit null for every unscored hole,
    // while one scored on this phone simply has no entry. Counted as scores,
    // those nulls would report a nine-hole round as nine holes ahead of itself.
    const mine = card(MINE, through(9), through(9));
    const decoded = card(THEIRS, through(9), through(9));
    for (const h of decoded.holes) {
      decoded.scores[h.number] ??= {};
      for (const p of decoded.players) decoded.scores[h.number][p.id] ??= null;
    }

    expect(compareRounds(decoded, mine).kind).toBe('same');
  });
});

describe('what the merge would have done on its own', () => {
  it('would take the whole of whichever copy was saved last', () => {
    // Not a test of this module so much as the reason for it: the rule that
    // makes restoring a backup safe is the rule that eats a back nine here.
    const mine: Round = { ...card(MINE, [...through(9), 4, 4, 4], through(9)), id: 'r1', updatedAt: 100 };
    const theirs: Round = { ...card(THEIRS, through(9), [...through(9), 5, 5]), id: 'r1', updatedAt: 200 };

    const { rounds, report } = mergeRounds([mine], [theirs]);
    expect(report).toEqual({ added: 0, updated: 1, kept: 0 });
    expect(rounds).toHaveLength(1);
    // Al's tenth, eleventh and twelfth are simply gone.
    expect(rounds[0].scores[10]?.p0).toBeUndefined();
  });

  it('keeps both when the arriving copy is forked instead', () => {
    const mine: Round = { ...card(MINE, [...through(9), 4, 4, 4], through(9)), id: 'r1', updatedAt: 100 };
    const theirs: Round = { ...card(THEIRS, through(9), [...through(9), 5, 5]), id: 'r1', updatedAt: 200 };

    const { rounds } = mergeRounds([mine], [forkRound(theirs, 300)]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].scores[10][MINE[0]]).toBe(4);
    expect(rounds[1].scores[10].p1).toBe(5);
  });
});

describe('forking a round', () => {
  const original = card(THEIRS, through(9), through(9));

  it('gives it an id of its own so nothing can collide with it', () => {
    const fork = forkRound(original);
    expect(fork.id).not.toBe(original.id);
    expect(fork.id).toBeTruthy();
    expect(forkRound(original).id).not.toBe(forkRound(original).id);
  });

  it('keeps every score, and says where it came from', () => {
    const fork = forkRound({ ...original, course: 'Torrey Pines South' });
    expect(fork.scores).toEqual(original.scores);
    expect(fork.players).toEqual(original.players);
    // Two rounds at the same course on the same day are otherwise
    // indistinguishable in a list.
    expect(fork.course).toBe('Torrey Pines South (from a link)');
    expect(forkRound({ ...original, course: undefined }).course).toBe('From a link');
  });

  it('takes it off its trip, so the trip does not count its money twice', () => {
    const trip = { id: 't1', name: 'Myrtle' };
    const hs = holes18();
    const staked = (ids: string[]): Round => ({
      ...makeRound({
        players: [player(ids[0], 'Al'), player(ids[1], 'Bo')],
        holes: hs,
        games: ['skins'],
        options: { stakes: { skins: 5 } },
        scores: scoresFrom(hs, { [ids[0]]: through(18).map(() => 3), [ids[1]]: through(18) }),
        status: 'finished',
      }),
      trip,
    });
    const mine = staked(MINE);
    const fork = forkRound(staked(THEIRS));
    expect(fork.trip).toBeUndefined();

    const onTrip = findTrip([mine, fork], 't1')!;
    expect(onTrip.rounds.map((r) => r.id)).toEqual([mine.id]);
    // Al took all eighteen skins off Bo once, not twice.
    expect(tripLedger(onTrip.rounds).players.find((p) => p.name === 'Al')!.total).toBe(90);
  });

  it('leaves a league setup alone', () => {
    const league = { teams: [{ aId: 'p0', bId: '' }, { aId: 'p1', bId: '' }], pointsPerMatch: 2 } as NonNullable<Round['options']['league']>;
    const fork = forkRound({ ...original, options: { ...original.options, league } });
    expect(fork.options.league).toEqual(league);
  });

  it('still sorts with the round it came from', () => {
    const fork = forkRound(original, 999);
    expect(fork.createdAt).toBe(original.createdAt);
    expect(fork.updatedAt).toBe(999);
  });
});

describe('saying it in a sentence', () => {
  const compare = (mineTo: number, theirsTo: number) =>
    compareRounds(card(THEIRS, through(theirsTo), through(theirsTo)), card(MINE, through(mineTo), through(mineTo)));

  it('names the number of entries at stake', () => {
    expect(describeArrival(compare(9, 18))).toBe(
      'The copy you were sent has 18 entries yours doesn’t.'
    );
    expect(describeArrival(compare(18, 9))).toBe(
      'Your copy has 18 entries the one you were sent doesn’t.'
    );
    expect(describeArrival(compare(9, 9))).toContain('already have this round');
  });

  it('counts one entry as one, not as “1 entries”', () => {
    const mine = card(MINE, [4], [4]);
    const theirs = card(THEIRS, [4, 4], [4]);
    expect(describeArrival(compareRounds(theirs, mine))).toBe(
      'The copy you were sent has 1 entry yours doesn’t.'
    );
  });

  it('spells out both sides of a divergence', () => {
    const mine = card(MINE, [4, 4, 4], [4, 4, 4]);
    const theirs = card(THEIRS, [4, 7], [4, 4, 4, 4]);
    const text = describeArrival(compareRounds(theirs, mine));
    expect(text).toContain('Both phones have been used on this round');
    expect(text).toContain('1 entry only on the copy you were sent');
    expect(text).toContain('1 entry only on yours');
    expect(text).toContain('1 entered differently on each');
  });
});

describe('junk on a handed-over round', () => {
  /** Two copies of one round, differing only in a claimed greenie. */
  const withJunk = (junk?: Round['junk']): Round => ({
    ...makeRound({
      players: [player('a', 'Al'), player('b', 'Bo')],
      holes: holes18(),
      games: ['junk'],
      scores: { 1: { a: 4, b: 5 } },
    }),
    junk,
  });

  it('is not the same round just because the scores match', () => {
    // Nobody can work a sandie out from a 4. Compared on scores alone these
    // two read as identical, and accepting or declining throws the claim away
    // without a word.
    const arrival = compareRounds(withJunk({ 2: { a: ['greenie'] } }), withJunk());
    expect(arrival.kind).toBe('ahead');
  });

  it('counts a claim only this device holds as behind', () => {
    const arrival = compareRounds(withJunk(), withJunk({ 2: { a: ['greenie'] } }));
    expect(arrival.kind).toBe('behind');
  });

  it('calls two different claims on one hole a divergence', () => {
    const arrival = compareRounds(
      withJunk({ 2: { a: ['greenie'] } }),
      withJunk({ 2: { a: ['sandie'] } })
    );
    expect(arrival.kind).toBe('diverged');
  });

  it('does not mind which order they were tapped in', () => {
    // Two phones, same two claims, different taps. That is agreement.
    const arrival = compareRounds(
      withJunk({ 2: { a: ['greenie', 'polie'] } }),
      withJunk({ 2: { a: ['polie', 'greenie'] } })
    );
    expect(arrival.kind).toBe('same');
  });

  it('still reads as the same round when neither has any', () => {
    expect(compareRounds(withJunk(), withJunk()).kind).toBe('same');
  });
});

describe('league pick-ups on a handed-over round', () => {
  const withPickups = (pickups?: Round['pickups']): Round => ({
    ...makeRound({
      players: [player('a', 'Al'), player('b', 'Bo')],
      holes: holes18(),
      scores: { 1: { a: 9, b: 5 } },
    }),
    pickups,
  });

  it('is not the same round when only one copy has the X', () => {
    // The score is a 9 either way; the X is what loses Al the hole.
    expect(compareRounds(withPickups({ 1: ['a'] }), withPickups()).kind).toBe('ahead');
    expect(compareRounds(withPickups(), withPickups({ 1: ['a'] })).kind).toBe('behind');
  });
});

describe('settings that are not entries on the card', () => {
  const stakes = (r: Round, skins: number, updatedAt: number): Round => ({
    ...r,
    updatedAt,
    options: { ...r.options, stakes: { skins } },
  });

  it('a changed stake on identical cards is not "exactly the same round"', () => {
    const mine = stakes(card(MINE, through(9), through(9)), 5, 1000);
    const theirs = stakes(card(THEIRS, through(9), through(9)), 10, 2000);
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('ahead');
    if (arrival.kind !== 'ahead') return;
    expect(arrival.diff).toMatchObject({ theirsOnly: 0, mineOnly: 0, differing: 0, settings: 1 });
    expect(describeArrival(arrival)).toMatch(
      /1 setting — names, pars, stakes, handicaps, presses or Wolf calls — set differently/
    );
  });

  it('is "behind" when my copy is the one written more recently', () => {
    const mine = stakes(card(MINE, through(9), through(9)), 5, 3000);
    const theirs = stakes(card(THEIRS, through(9), through(9)), 10, 2000);
    expect(compareRounds(theirs, mine).kind).toBe('behind');
  });

  it('counts a corrected handicap, a press and a Wolf call', () => {
    const base = card(MINE, through(9), through(9));
    const mine: Round = { ...base, updatedAt: 1 };
    const theirs: Round = {
      ...card(THEIRS, through(9), through(9)),
      updatedAt: 2,
      players: [{ id: 'p0', name: 'Al', handicap: 14 }, { id: 'p1', name: 'Bo' }],
      presses: [5],
      wolf: { 3: { wolfPlayerId: 'p0', choice: { type: 'lone' } } },
    };
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('ahead');
    if (arrival.kind === 'ahead') expect(arrival.diff.settings).toBe(3);
  });

  it('says so beside the entries when both differ', () => {
    const mine = stakes(card(MINE, through(9), through(9)), 5, 1000);
    const theirs = stakes(card(THEIRS, through(12), through(12)), 10, 2000);
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('ahead');
    expect(describeArrival(arrival)).toMatch(/6 entries yours doesn’t, and 1 setting/);
  });

  it('reads a rated round back from its own link as the same round', () => {
    const mine: Round = {
      ...card(MINE, through(18), through(18)),
      players: [
        { id: MINE[0], name: 'Al', index: 8.4 },
        { id: MINE[1], name: 'Bo', index: 12.1 },
      ],
      slope: 131,
      rating: 72.4,
      ratingHoles: 18,
      presses: [4],
      wolf: { 2: { wolfPlayerId: MINE[0], choice: { type: 'partner', partnerId: MINE[1] } } },
      options: { useNet: true, stablefordMode: 'standard', loneWolfMultiplier: 2, blindWolfMultiplier: 3, stakes: { skins: 5 }, autoPress: true, netByGame: { skins: false }, allowanceByGame: { nassau: 90 } },
    };
    const back = unpackRound(packRound(mine)!);
    if (!back.ok) throw new Error(back.error);
    expect(compareRounds(back.round, mine)).toEqual({ kind: 'same' });
  });

  it('counts a renamed player, a fixed par and a moved stroke index', () => {
    // Each of these read as "exactly as it is here", and bringing the other
    // copy in replaced the local round whole: a par fix undone, or a row
    // quietly turned into somebody else.
    const mine: Round = { ...card(MINE, through(9), through(9)), updatedAt: 1 };
    const base = card(THEIRS, through(9), through(9));
    const theirs: Round = {
      ...base,
      updatedAt: 2,
      players: [{ id: 'p0', name: 'Alan' }, base.players[1]],
      holes: base.holes.map((h) =>
        h.number === 3 ? { ...h, par: h.par + 1 } : h.number === 4 ? { ...h, strokeIndex: 99 } : h
      ),
    };
    const arrival = compareRounds(theirs, mine);
    expect(arrival.kind).toBe('ahead');
    if (arrival.kind !== 'ahead') return;
    expect(arrival.diff).toMatchObject({ theirsOnly: 0, mineOnly: 0, differing: 0, settings: 3 });
    expect(describeArrival(arrival)).toBe(
      'The copy you were sent has 3 settings — names, pars, stakes, handicaps, presses or Wolf calls — set differently from yours.'
    );
  });

  it('counts the course, a finished round, its trip and the league setup', () => {
    const plain = card(MINE, through(9), through(9));
    const differs = (over: Partial<Round>) =>
      compareRounds({ ...card(THEIRS, through(9), through(9)), ...over }, plain);
    expect(differs({ course: 'Elsewhere' }).kind).not.toBe('same');
    expect(differs({ status: 'finished' }).kind).not.toBe('same');
    expect(differs({ trip: { id: 't1', name: 'Myrtle' } }).kind).not.toBe('same');

    const league = (pointsPerMatch: number, ended?: boolean): Round['options']['league'] => ({
      teams: [
        { aId: 'x', bId: 'y' },
        { aId: 'z', bId: 'w' },
      ],
      pointsPerMatch,
      ended,
    });
    const withLeague = (ids: string[], l: Round['options']['league']): Round => {
      const r = card(ids, through(9), through(9));
      return { ...r, options: { ...r.options, league: l } };
    };
    expect(compareRounds(withLeague(THEIRS, league(2)), withLeague(MINE, league(2))).kind).toBe('same');
    expect(compareRounds(withLeague(THEIRS, league(3)), withLeague(MINE, league(2))).kind).not.toBe('same');
    expect(compareRounds(withLeague(THEIRS, league(2, true)), withLeague(MINE, league(2))).kind).not.toBe('same');
  });

  it('does not count timestamps, or a blank course against a missing one', () => {
    const mine: Round = { ...card(MINE, through(9), through(9)), course: '', createdAt: 1, updatedAt: 1 };
    const theirs: Round = { ...card(THEIRS, through(9), through(9)), course: undefined, createdAt: 5, updatedAt: 9 };
    expect(compareRounds(theirs, mine)).toEqual({ kind: 'same' });
  });

  it('reads a league night back from its own link as the same round', () => {
    const r = card(MINE, through(9), through(9));
    const mine: Round = {
      ...r,
      course: 'Home Club',
      status: 'finished',
      trip: { id: 't1', name: 'Myrtle' },
      options: {
        ...r.options,
        league: {
          teams: [
            { aId: MINE[0], bId: '', absent: 'b', absentName: 'Cy' },
            { aId: MINE[1], bId: '', absent: 'b' },
          ],
          pointsPerMatch: 2,
          firstNight: [MINE[1]],
        },
      },
    };
    const back = unpackRound(packRound(mine)!);
    if (!back.ok) throw new Error(back.error);
    expect(compareRounds(back.round, mine)).toEqual({ kind: 'same' });
  });

  it('is still the same round when nothing differs', () => {
    const mine = stakes(card(MINE, through(9), through(9)), 5, 1000);
    const theirs = stakes(card(THEIRS, through(9), through(9)), 5, 2000);
    expect(compareRounds(theirs, mine)).toEqual({ kind: 'same' });
  });
});

describe('scramble credits on a handed-over round', () => {
  /** One copy of a scramble, under `ids`, with these credits on it. */
  const copy = (ids: string[], shots?: Round['shots']): Round => {
    const r = scrambleRound({
      teams: [
        { id: ids[0], name: 'Jesse & Sam', members: ['Jesse', 'Sam'] },
        { id: ids[1], name: 'Cy & Di', members: ['Cy', 'Di'] },
      ],
      scores: { 1: { [ids[0]]: 4, [ids[1]]: 5 } },
      minDrives: 2,
    });
    return shots ? { ...r, shots } : r;
  };

  it('is not the same round when only one copy says whose drive it was', () => {
    // A 4 either way; whose drive made it is what the minimum counts.
    const theirs = copy(THEIRS, { 1: { p0: [1] } });
    expect(compareRounds(theirs, copy(MINE)).kind).toBe('ahead');
    expect(compareRounds(copy(MINE), theirs).kind).toBe('behind');
  });

  it('calls two different credits for one shot a divergence', () => {
    const arrival = compareRounds(copy(THEIRS, { 1: { p0: [1] } }), copy(MINE, { 1: { [MINE[0]]: [0] } }));
    expect(arrival.kind).toBe('diverged');
    if (arrival.kind === 'diverged') expect(arrival.diff.differing).toBe(1);
  });

  it('matches the credits by team position, whatever ids each phone uses', () => {
    const arrival = compareRounds(
      copy(THEIRS, { 1: { p1: [0, 1] } }),
      copy(MINE, { 1: { [MINE[1]]: [0, 1] } })
    );
    expect(arrival.kind).toBe('same');
  });

  it('survives a link, and comes back the same round', () => {
    const mine = copy(MINE, { 1: { [MINE[0]]: [1, -1, 0] } });
    const result = unpackRound(packRound(mine)!);
    if (!result.ok) throw new Error(result.error);
    expect(compareRounds(result.round, mine).kind).toBe('same');
  });

  it('counts a changed minimum or a renamed member as a setting', () => {
    const mine = copy(MINE);
    const theirs = copy(THEIRS);
    const min = { ...theirs, options: { ...theirs.options, scramble: { ...theirs.options.scramble!, minDrives: 3 } } };
    const arrival = compareRounds(min, mine);
    expect(arrival.kind === 'ahead' || arrival.kind === 'behind').toBe(true);
    if (arrival.kind === 'ahead' || arrival.kind === 'behind') expect(arrival.diff.settings).toBe(1);
  });

  it('changes nothing about a round that is not a scramble', () => {
    const plain = makeRound({ players: [player('a', 'Al'), player('b', 'Bo')], scores: { 1: { a: 4 } } });
    expect(compareRounds(plain, { ...plain, shots: { 1: { a: [0] } } }).kind).toBe('same');
  });
});
