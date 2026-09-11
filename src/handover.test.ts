import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { compareRounds, forkRound, describeArrival } from './handover';
import { makeRound, holes18, scoresFrom } from './games/testFixtures';
import { mergeRounds } from './backup';

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

  it('still sorts with the round it came from', () => {
    const fork = forkRound(original, 999);
    expect(fork.createdAt).toBe(original.createdAt);
    expect(fork.updatedAt).toBe(999);
  });
});

describe('saying it in a sentence', () => {
  const compare = (mineTo: number, theirsTo: number) =>
    compareRounds(card(THEIRS, through(theirsTo), through(theirsTo)), card(MINE, through(mineTo), through(mineTo)));

  it('names the number of scores at stake', () => {
    expect(describeArrival(compare(9, 18))).toBe(
      'The copy you were sent has 18 scores yours doesn’t.'
    );
    expect(describeArrival(compare(18, 9))).toBe(
      'Your copy has 18 scores the one you were sent doesn’t.'
    );
    expect(describeArrival(compare(9, 9))).toContain('already have this round');
  });

  it('counts one score as one, not as “1 scores”', () => {
    const mine = card(MINE, [4], [4]);
    const theirs = card(THEIRS, [4, 4], [4]);
    expect(describeArrival(compareRounds(theirs, mine))).toBe(
      'The copy you were sent has 1 score yours doesn’t.'
    );
  });

  it('spells out both sides of a divergence', () => {
    const mine = card(MINE, [4, 4, 4], [4, 4, 4]);
    const theirs = card(THEIRS, [4, 7], [4, 4, 4, 4]);
    const text = describeArrival(compareRounds(theirs, mine));
    expect(text).toContain('Both phones have scored this round');
    expect(text).toContain('1 score only on the copy you were sent');
    expect(text).toContain('1 score only on yours');
    expect(text).toContain('1 entered differently on each');
  });
});
