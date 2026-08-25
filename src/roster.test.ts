import { describe, it, expect } from 'vitest';
import { buildRoster, lastCrew, isFirstEverRound, placePlayer, ROSTER_LIMIT } from './roster';
import { makeRound, player, holes18 } from './games/testFixtures';
import type { Round } from './types';

/** Rounds newest-first, matching what listRounds() returns. */
function rounds(...players: ReturnType<typeof player>[][]): Round[] {
  return players.map((ps) => makeRound({ players: ps, holes: holes18() }));
}

describe('buildRoster', () => {
  it('lists distinct players most-recent-first', () => {
    const rs = rounds(
      [player('a', 'Marcus'), player('b', 'Dave')],
      [player('c', 'Jesse'), player('d', 'Big Tony')]
    );
    expect(buildRoster(rs).map((e) => e.name)).toEqual([
      'Marcus',
      'Dave',
      'Jesse',
      'Big Tony',
    ]);
  });

  it('skips blank and whitespace-only names', () => {
    // Abandoned rounds routinely carry the two default blank players.
    const rs = rounds([player('a', ''), player('b', '   '), player('c', 'Jesse')]);
    expect(buildRoster(rs).map((e) => e.name)).toEqual(['Jesse']);
  });

  it('trims surrounding whitespace off names it keeps', () => {
    const rs = rounds([player('a', '  Jesse  ')]);
    expect(buildRoster(rs)[0].name).toBe('Jesse');
  });

  it('dedupes case-insensitively, keeping the most recent spelling', () => {
    const rs = rounds([player('a', 'Big Tony')], [player('b', 'big tony')]);
    expect(buildRoster(rs).map((e) => e.name)).toEqual(['Big Tony']);
  });

  it('carries the handicap from the most recent round that had one', () => {
    const rs = rounds([player('a', 'Jesse')], [player('b', 'Jesse', 12)]);
    expect(buildRoster(rs)[0]).toEqual({ name: 'Jesse', handicap: 12 });
  });

  it('prefers a newer handicap over an older one', () => {
    const rs = rounds([player('a', 'Jesse', 10)], [player('b', 'Jesse', 12)]);
    expect(buildRoster(rs)[0].handicap).toBe(10);
  });

  it('omits handicap entirely for a player who has never had one', () => {
    const rs = rounds([player('a', 'Jesse')]);
    expect(buildRoster(rs)[0]).toEqual({ name: 'Jesse' });
  });

  it(`caps the roster at ${ROSTER_LIMIT} entries`, () => {
    const many = Array.from({ length: 30 }, (_, i) => [player(`p${i}`, `Player ${i}`)]);
    expect(buildRoster(rounds(...many))).toHaveLength(ROSTER_LIMIT);
  });

  it('returns an empty roster with no rounds', () => {
    expect(buildRoster([])).toEqual([]);
  });
});

describe('lastCrew', () => {
  it('returns the newest round players in order, with handicaps', () => {
    const rs = rounds(
      [player('a', 'Jesse', 12), player('b', 'Marcus', 4)],
      [player('c', 'Someone Else')]
    );
    expect(lastCrew(rs)).toEqual([
      { name: 'Jesse', handicap: 12 },
      { name: 'Marcus', handicap: 4 },
    ]);
  });

  it('returns [] with no rounds', () => {
    expect(lastCrew([])).toEqual([]);
  });

  it('returns [] when the newest round has fewer than two named players', () => {
    // A round abandoned at setup is not a crew worth offering.
    const rs = rounds([player('a', 'Jesse'), player('b', '')]);
    expect(lastCrew(rs)).toEqual([]);
  });
});

describe('isFirstEverRound', () => {
  it('is true only with no saved rounds', () => {
    expect(isFirstEverRound([])).toBe(true);
    expect(isFirstEverRound(rounds([player('a', 'Jesse')]))).toBe(false);
  });
});

describe('placePlayer', () => {
  const blankTwo = [player('x', ''), player('y', '')];
  const leo = player('new', 'Leo', 18);

  it('fills the first blank slot rather than appending past it', () => {
    // Setup seeds two blank players; appending left them stranded above the
    // people just picked, so two taps showed four rows and two empty ones.
    const out = placePlayer(blankTwo, leo);
    expect(out.map((p) => p.name)).toEqual(['Leo', '']);
    expect(out).toHaveLength(2);
  });

  it('keeps the recalled handicap', () => {
    expect(placePlayer(blankTwo, leo)[0].handicap).toBe(18);
  });

  it('fills a blank in the middle, not only a trailing one', () => {
    const mixed = [player('a', 'Jesse', 12), player('b', '   '), player('c', 'Dave', 9)];
    expect(placePlayer(mixed, leo).map((p) => p.name)).toEqual(['Jesse', 'Leo', 'Dave']);
  });

  it('appends once every slot is named', () => {
    const full = [player('a', 'Jesse', 12), player('b', 'Marcus', 4)];
    const out = placePlayer(full, leo);
    expect(out.map((p) => p.name)).toEqual(['Jesse', 'Marcus', 'Leo']);
    expect(out).toHaveLength(3);
  });

  it('treats a whitespace-only name as blank', () => {
    expect(placePlayer([player('a', '  ')], leo).map((p) => p.name)).toEqual(['Leo']);
  });

  it('does not mutate the array it was given', () => {
    const input = [player('x', '')];
    placePlayer(input, leo);
    expect(input[0].name).toBe('');
  });
});
