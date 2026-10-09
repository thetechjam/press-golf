// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAliases,
  likelySame,
  looksAlike,
  pairKey,
  mergeInRounds,
  nameKey,
  nearMatches,
  resolveName,
  withAlias,
} from './people';
import { makeRound, player } from './games/testFixtures';
import { getAliases, listRounds, mergePeople, saveRound } from './storage';
import { tripLedger } from './trips';
import type { Round } from './types';

describe('nameKey', () => {
  it('ignores case, outer space and doubled inner space', () => {
    expect(nameKey('  Alex   M ')).toBe('alex m');
  });
});

describe('looksAlike — only ever a question, so it may be generous but not silly', () => {
  it.each([
    ['Al', 'Alex'],
    ['alex m', 'Alex'],
    ['Mike', 'Michael'],
    ['Bob', 'Robert'],
    ['Jordon', 'Jordan'],
    ['Alex M', 'Alex Morgan'],
  ])('%s ~ %s', (a, b) => expect(looksAlike(a, b)).toBe(true));

  it.each([
    ['Tim', 'Tom'],
    ['Sam', 'Casey'],
    ['Alex', 'alex'], // the same name is a match, not a "probably"
    ['Alex Morgan', 'Alex Smith'],
    ['A', 'Alex'],
  ])('%s ≁ %s', (a, b) => expect(looksAlike(a, b)).toBe(false));
});

describe('nearMatches', () => {
  it('puts the same first name ahead of a prefix', () => {
    expect(nearMatches('Al', ['Alfie', 'Al Jones', 'Sam'])).toEqual(['Al Jones', 'Alfie']);
  });
  it('never offers the name itself, and offers each person once', () => {
    expect(nearMatches('Alex', ['alex', 'Alexander', 'ALEXANDER'])).toEqual(['Alexander']);
  });
});

describe('aliases', () => {
  it('follows a chain and survives a loop', () => {
    expect(resolveName('al', { al: 'Alex', alex: 'Alexander' })).toBe('Alexander');
    expect(resolveName('al', { al: 'Alex', alex: 'Al' })).toBeTruthy();
  });

  it('repoints anything that pointed at the merged name, and drops the reverse', () => {
    const a = withAlias({ al: 'Alex' }, 'Alex', 'Alexander');
    expect(a).toEqual({ al: 'Alexander', alex: 'Alexander' });
    expect(withAlias({ alex: 'Al' }, 'Al', 'Alex')).toEqual({ al: 'Alex' });
  });

  it('renames a round’s players, and leaves an untouched round as it was', () => {
    const r = makeRound({ players: [player('p1', 'al'), player('p2', 'Sam')] });
    expect(applyAliases(r, { al: 'Alex' }).players.map((p) => p.name)).toEqual(['Alex', 'Sam']);
    expect(applyAliases(r, {})).toBe(r);
  });

  it('leaves a spelling as typed when the merged name is already on the card', () => {
    // Rob was merged into Robert once; this round has father and son.
    const r = makeRound({ players: [player('p1', 'Rob'), player('p2', 'Robert')] });
    expect(applyAliases(r, { rob: 'Robert' })).toBe(r);
  });

  it('will not merge two players on the same card', () => {
    const both = makeRound({ players: [player('p1', 'Al'), player('p2', 'Alex')] });
    const one = makeRound({ players: [player('p1', 'Al'), player('p2', 'Sam')] });
    const [a, b] = mergeInRounds([both, one], 'Al', 'Alex');
    expect(a).toBe(both);
    expect(b.players[0].name).toBe('Alex');
  });
});

describe('merging people on the phone', () => {
  beforeEach(() => localStorage.clear());

  const skins = (id: string, names: string[], winner: number): Round => {
    const r = makeRound({
      players: names.map((n, i) => player(`${id}${i}`, n)),
      games: ['skins'],
      options: { stakes: { skins: 5 } },
    });
    const scores: Round['scores'] = {};
    for (const h of r.holes) {
      scores[h.number] = {};
      r.players.forEach((p, i) => (scores[h.number][p.id] = i === winner ? 3 : 5));
    }
    return { ...r, id, scores, status: 'finished' };
  };

  it('rewrites saved rounds, and the trip then counts one person', () => {
    saveRound(skins('a', ['Al', 'Sam'], 0));
    saveRound(skins('b', ['Alex', 'Sam'], 0));
    expect(tripLedger(listRounds()).players).toHaveLength(3);
    mergePeople('Al', 'Alex');
    const ledger = tripLedger(listRounds());
    expect(ledger.players.map((p) => p.name).sort()).toEqual(['Alex', 'Sam']);
    expect(getAliases()).toEqual({ al: 'Alex' });
  });

  it('brings a round saved later with the old spelling into line', () => {
    mergePeople('Al', 'Alex');
    saveRound(skins('c', ['al', 'Sam'], 0));
    expect(listRounds()[0].players[0].name).toBe('Alex');
  });
});

describe('likelySame', () => {
  const r = (names: string[]) => makeRound({ players: names.map((n, i) => player(`p${i}`, n)) });

  it('pairs names that look alike, keeping the one on more rounds', () => {
    expect(likelySame([r(['Alex', 'Sam']), r(['Alex', 'Sam']), r(['Al', 'Sam'])])).toEqual([
      { into: 'Alex', from: 'Al' },
    ]);
  });

  it('leaves alone two names that have shared a card, or been answered', () => {
    expect(likelySame([r(['Al', 'Alex'])])).toEqual([]);
    expect(likelySame([r(['Alex']), r(['Al'])], new Set([pairKey('Al', 'Alex')]))).toEqual([]);
  });
});
