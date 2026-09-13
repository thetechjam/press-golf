import { describe, it, expect } from 'vitest';
import type { JunkKind } from '../types';
import {
  JUNK,
  computeJunk,
  claimsOn,
  hasClaim,
  isJunkKind,
  junkCounts,
  junkOnHole,
  toggleJunk,
} from './junk';
import { computeSettlement } from './settlement';
import { makeRound, player, holes18 } from './testFixtures';

/**
 * Junk is the one engine here that derives nothing.
 *
 * A sandie is a par out of a bunker; the card shows a 4 and cannot tell you
 * where it came from. So there is no scorecard to check a claim against, and
 * these tests are about the two things that can still go wrong: claims that
 * stop referring to anything, and the money they add up to.
 */

const four = [
  player('p1', 'Al'),
  player('p2', 'Bo'),
  player('p3', 'Cy'),
  player('p4', 'Di'),
];

const round = (junk?: Record<number, Record<string, JunkKind[]>>) =>
  makeRound({ players: four, holes: holes18(), games: ['junk'], junk });

describe('claiming junk', () => {
  it('turns one on and off again', () => {
    const empty = round();
    const on = round(toggleJunk(empty, 3, 'p1', 'sandie'));
    expect(hasClaim(on, 3, 'p1', 'sandie')).toBe(true);

    const off = round(toggleJunk(on, 3, 'p1', 'sandie'));
    expect(hasClaim(off, 3, 'p1', 'sandie')).toBe(false);
  });

  it('lets one hole carry more than one for the same player', () => {
    // A tree, then up and down out of sand for the par. Anyone who has done it
    // wants both.
    let r = round();
    r = round(toggleJunk(r, 7, 'p2', 'barkie'));
    r = round(toggleJunk(r, 7, 'p2', 'sandie'));
    expect(claimsOn(r, 7, 'p2')).toEqual(['sandie', 'barkie']);
  });

  it('keeps list order however they were tapped', () => {
    // So a row does not reshuffle itself under the thumb that is adding to it.
    let r = round();
    for (const k of ['polie', 'greenie', 'chipIn'] as JunkKind[]) r = round(toggleJunk(r, 1, 'p1', k));
    expect(claimsOn(r, 1, 'p1')).toEqual(['greenie', 'chipIn', 'polie']);
  });

  it('leaves nothing behind when the last claim on a hole comes off', () => {
    // These rounds travel as share links, where an empty object is bytes in a
    // QR code: tapped and untapped has to serialise like never touched.
    const empty = round();
    const on = round(toggleJunk(empty, 5, 'p1', 'polie'));
    const off = toggleJunk(on, 5, 'p1', 'polie');
    expect(off).toEqual({});
  });

  it('keeps the other players on a hole when one clears theirs', () => {
    let r = round();
    r = round(toggleJunk(r, 5, 'p1', 'polie'));
    r = round(toggleJunk(r, 5, 'p2', 'greenie'));
    const after = toggleJunk(r, 5, 'p1', 'polie');
    expect(after).toEqual({ 5: { p2: ['greenie'] } });
  });
});

describe('claims that no longer refer to anything', () => {
  it('ignores a kind it does not recognise', () => {
    // A share link from a later version, or a hand-edited backup.
    const r = round({ 2: { p1: ['moonshot' as JunkKind, 'sandie'] } });
    expect(claimsOn(r, 2, 'p1')).toEqual(['sandie']);
    expect(junkCounts(r).p1).toBe(1);
  });

  it('ignores a duplicate of the same kind', () => {
    const r = round({ 2: { p1: ['sandie', 'sandie'] } });
    expect(junkCounts(r).p1).toBe(1);
  });

  it('pays nobody for a claim on a player who has left the round', () => {
    const r = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: holes18(),
      games: ['junk'],
      junk: { 4: { p1: ['sandie'], gone: ['greenie', 'polie'] } },
    });
    expect(junkCounts(r)).toEqual({ p1: 1, p2: 0 });
    expect(junkOnHole(r, 4).map((row) => row.playerId)).toEqual(['p1']);
  });

  it('pays nobody for a claim on a hole that is not being played', () => {
    // Nine holes, a claim on the twelfth: a round shortened after the fact.
    const r = makeRound({
      players: four,
      holes: holes18().slice(0, 9),
      games: ['junk'],
      junk: { 12: { p1: ['sandie'] } },
    });
    expect(junkCounts(r).p1).toBe(0);
    // Left where it is rather than deleted — the round may be edited back.
    expect(r.junk?.[12]).toBeTruthy();
  });
});

describe('the standings', () => {
  it('says nothing has happened before anything is claimed', () => {
    expect(computeJunk(round()).status).toBe('Nothing claimed yet');
  });

  it('names the leader', () => {
    const r = round({ 1: { p1: ['greenie', 'polie'] }, 2: { p2: ['sandie'] } });
    const res = computeJunk(r);
    expect(res.status).toBe('Al leads on 2');
    expect(res.standings[0].label).toBe('Al');
    expect(res.standings[0].detail).toBe('2 junk');
  });

  it('counts a tie rather than picking one', () => {
    const r = round({ 1: { p1: ['greenie'], p2: ['sandie'], p3: ['polie'] } });
    expect(computeJunk(r).status).toBe('3 tied on 1');
  });

  it('reads one as junk too, because junk is uncountable', () => {
    const r = round({ 1: { p1: ['greenie'] } });
    expect(computeJunk(r).standings[0].detail).toBe('1 junk');
  });
});

describe('what junk is worth', () => {
  it('collects the stake from every other player, per junk', () => {
    // One greenie at $2 among four: the winner is up $6 and everyone else is
    // down $2. That is how junk is actually settled, and it is the same
    // field-difference model skins already uses.
    const r = makeRound({
      players: four,
      holes: holes18(),
      games: ['junk'],
      options: { stakes: { junk: 2 } },
      junk: { 1: { p1: ['greenie'] } },
    });
    const s = computeSettlement(r);
    expect(s.totals).toEqual({ p1: 6, p2: -2, p3: -2, p4: -2 });
  });

  it('nets two players holding one each against the other two', () => {
    const r = makeRound({
      players: four,
      holes: holes18(),
      games: ['junk'],
      options: { stakes: { junk: 2 } },
      junk: { 1: { p1: ['greenie'] }, 2: { p2: ['sandie'] } },
    });
    expect(computeSettlement(r).totals).toEqual({ p1: 4, p2: 4, p3: -4, p4: -4 });
  });

  it('pays nothing when everyone has the same', () => {
    const r = makeRound({
      players: four,
      holes: holes18(),
      games: ['junk'],
      options: { stakes: { junk: 5 } },
      junk: { 1: { p1: ['greenie'], p2: ['greenie'], p3: ['greenie'], p4: ['greenie'] } },
    });
    expect(computeSettlement(r).totals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('is worth nothing without a stake', () => {
    const r = round({ 1: { p1: ['greenie'] } });
    expect(computeSettlement(r).active).toBe(false);
  });
});

describe('the six', () => {
  it('offers exactly the six, each with a claim condition', () => {
    expect(JUNK.map((j) => j.id)).toEqual([
      'greenie',
      'sandie',
      'barkie',
      'arnie',
      'chipIn',
      'polie',
    ]);
    for (const j of JUNK) {
      expect(j.label.length).toBeGreaterThan(0);
      expect(j.blurb.length).toBeGreaterThan(10);
    }
  });

  it('recognises its own and nothing else', () => {
    expect(isJunkKind('sandie')).toBe(true);
    expect(isJunkKind('snake')).toBe(false);
  });
});
