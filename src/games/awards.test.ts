import { describe, test, expect } from 'vitest';
import { computeAwards } from './awards';
import { makeRound, player, holes18, scoresFrom } from './testFixtures';

const find = (round: Parameters<typeof computeAwards>[0], id: string) =>
  computeAwards(round).find((a) => a.id === id);

describe('Shot of the Day', () => {
  test('names the best score under par and the hole it happened on', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        // Al eagles hole 7; Bo only manages a birdie on hole 3.
        p1: [4, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: [4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      }),
    });

    const award = find(round, 'shot-of-the-day');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.line).toContain('Al');
    expect(award?.line).toContain('7');
    expect(award?.detail).toBe('2 on a par 4');
  });

  test('does not fire when nobody beat par', () => {
    const hs = holes18();
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: Array(18).fill(4),
        p2: Array(18).fill(5),
      }),
    });

    expect(find(round, 'shot-of-the-day')).toBeUndefined();
  });
});

describe('The Snowman', () => {
  test('names the worst hole of the round', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 7],
        // Bo puts an 8 on the card at hole 5 — four over.
        p2: [4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      }),
    });

    const award = find(round, 'snowman');

    expect(award?.playerIds).toEqual(['p2']);
    expect(award?.line).toContain('Bo');
    expect(award?.line).toContain('5');
    expect(award?.detail).toBe('8 on a par 4 · +4');
  });

  test('does not fire for a mere double bogey', () => {
    const hs = holes18();
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: Array(18).fill(4),
        p2: [6, ...Array(17).fill(4)],
      }),
    });

    expect(find(round, 'snowman')).toBeUndefined();
  });
});

describe('Bounce Back', () => {
  test('fires when a birdie immediately answers a double bogey', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        // Al doubles hole 9, then birdies hole 10.
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 6, 3, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: Array(18).fill(4),
      }),
    });

    const award = find(round, 'bounce-back');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.line).toContain('Al');
    expect(award?.detail).toBe('6 on 9 · 3 on 10');
  });

  test('does not fire when the birdie is not the very next hole', () => {
    const hs = holes18();
    const round = makeRound({
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 6, 4, 3, 4, 4, 4, 4, 4, 4, 4],
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'bounce-back')).toBeUndefined();
  });

  test('reads "an eagle", not "a eagle"', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 6, 2, 4, 4, 4, 4, 4, 4, 4, 4],
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'bounce-back')?.line).toContain('an eagle');
  });
});

describe('The ATM', () => {
  const hs = holes18();
  // Al wins the first three holes outright; Bo is never better than a tie, so
  // Al takes three skins and Bo bankrolls them.
  const scores = scoresFrom(hs, {
    p1: [3, 3, 3, ...Array(15).fill(4)],
    p2: Array(18).fill(4),
  });

  test('names whoever paid the most out', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      scores,
    });

    const award = find(round, 'atm');

    expect(award?.playerIds).toEqual(['p2']);
    expect(award?.line).toContain('Bo');
    expect(award?.detail).toBe('−$15');
  });

  test('does not fire when no stake was set', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores,
    });

    expect(find(round, 'atm')).toBeUndefined();
  });
});

describe('Highway Robbery', () => {
  test('credits the hole where the carried skins actually landed', () => {
    const hs = holes18();
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      // Holes 1 and 2 tie and carry; Al collects all three skins on hole 3.
      scores: scoresFrom(hs, {
        p1: [4, 4, 3, ...Array(15).fill(4)],
        p2: Array(18).fill(4),
      }),
    });

    const award = find(round, 'highway-robbery');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.line).toContain('Al');
    expect(award?.line).toContain('3');
    expect(award?.detail).toBe('$15');
  });

  test('does not fire when no stake was set', () => {
    const hs = holes18();
    const round = makeRound({
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, {
        p1: [4, 4, 3, ...Array(15).fill(4)],
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'highway-robbery')).toBeUndefined();
  });
});

describe('Sandbagger', () => {
  const hs = holes18(); // 18 par 4s — par 72

  test('names whoever beat their handicap by the widest margin', () => {
    const round = makeRound({
      players: [player('p1', 'Al', 10), player('p2', 'Bo', 0)],
      holes: hs,
      options: { useNet: true },
      scores: scoresFrom(hs, {
        // Al shoots 76 gross off a 10 — a 66 net, six under par.
        p1: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 7],
        p2: Array(18).fill(4),
      }),
    });

    const award = find(round, 'sandbagger');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.line).toContain('Al');
    expect(award?.detail).toBe('66 net · 6 under par');
  });

  test('does not fire when nobody plays to their handicap', () => {
    const round = makeRound({
      players: [player('p1', 'Al', 10), player('p2', 'Bo', 0)],
      holes: hs,
      options: { useNet: true },
      scores: scoresFrom(hs, {
        p1: Array(18).fill(5), // 90 gross, 80 net — eight over par
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'sandbagger')).toBeUndefined();
  });

  test('does not fire in a round played without handicaps', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        p1: Array(18).fill(3),
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'sandbagger')).toBeUndefined();
  });
});

describe('Skin Thief', () => {
  const hs = holes18();

  test('names the sole leader once they have two or more skins', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, {
        p1: [3, 3, 3, ...Array(15).fill(4)],
        p2: Array(18).fill(4),
      }),
    });

    const award = find(round, 'skin-thief');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.detail).toBe('3 skins');
  });

  test('does not fire when skins was not one of the games', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['strokePlay'],
      scores: scoresFrom(hs, {
        p1: [3, 3, 3, ...Array(15).fill(4)],
        p2: Array(18).fill(4),
      }),
    });

    expect(find(round, 'skin-thief')).toBeUndefined();
  });

  test('does not fire when the skin count is tied at the top', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, {
        p1: [3, 3, 4, 4, ...Array(14).fill(4)],
        p2: [4, 4, 3, 3, ...Array(14).fill(4)],
      }),
    });

    expect(find(round, 'skin-thief')).toBeUndefined();
  });
});

describe("Wolf's Gamble", () => {
  const hs = holes18();
  const players = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];

  test('celebrates a lone wolf that paid off', () => {
    const round = makeRound({
      players,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'lone' } } },
      scores: scoresFrom(hs, { p1: [3], p2: [4], p3: [4] }),
    });

    const award = find(round, 'wolfs-gamble');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.line).toContain('Al');
    expect(award?.line).toContain('1');
    expect(award?.detail).toBe('lone wolf · +2 pts');
  });

  test('roasts a lone wolf that got eaten', () => {
    const round = makeRound({
      players,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'lone' } } },
      scores: scoresFrom(hs, { p1: [5], p2: [4], p3: [4] }),
    });

    const award = find(round, 'wolfs-gamble');

    expect(award?.playerIds).toEqual(['p1']);
    expect(award?.detail).toBe('lone wolf · fed the pack');
  });

  test('ignores an ordinary partner hole', () => {
    const round = makeRound({
      players,
      holes: hs,
      games: ['wolf'],
      wolf: { 1: { wolfPlayerId: 'p1', choice: { type: 'partner', partnerId: 'p2' } } },
      scores: scoresFrom(hs, { p1: [3], p2: [4], p3: [4] }),
    });

    expect(find(round, 'wolfs-gamble')).toBeUndefined();
  });
});

describe('Shut Out', () => {
  const hs = holes18();
  const players = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];

  test('names someone who never won a hole, and never doubles up on the ATM', () => {
    const round = makeRound({
      players,
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      // Al takes three skins; Bo and Cy both go home empty.
      scores: scoresFrom(hs, {
        p1: [3, 3, 3, ...Array(15).fill(4)],
        p2: Array(18).fill(4),
        p3: Array(18).fill(4),
      }),
    });

    const awards = computeAwards(round);
    const atm = awards.find((a) => a.id === 'atm');
    const shutOut = awards.find((a) => a.id === 'shut-out');

    expect(shutOut).toBeDefined();
    expect(shutOut?.playerIds).not.toEqual(atm?.playerIds);
    expect(shutOut?.detail).toBe('0 holes won');
  });

  test('does not fire when everyone won a hole somewhere', () => {
    const round = makeRound({
      players,
      holes: hs,
      games: ['skins'],
      options: { stakes: { skins: 5 } },
      scores: scoresFrom(hs, {
        p1: [3, 4, 4, ...Array(15).fill(4)],
        p2: [4, 3, 4, ...Array(15).fill(4)],
        p3: [4, 4, 3, ...Array(15).fill(4)],
      }),
    });

    expect(find(round, 'shut-out')).toBeUndefined();
  });
});

describe('ranking', () => {
  const hs = holes18();
  // A round loaded with candidates, nearly all of them Al's: he doubles 1,
  // eagles 2 (bouncing back), birdies 3, and plays 11 under his handicap,
  // taking the skins with him. Bo and Cy just make pars.
  const busy = makeRound({
    players: [player('p1', 'Al', 10), player('p2', 'Bo', 0), player('p3', 'Cy', 0)],
    holes: hs,
    games: ['skins'],
    options: { useNet: true, stakes: { skins: 5 } },
    scores: scoresFrom(hs, {
      p1: [6, 2, 3, ...Array(15).fill(4)],
      p2: Array(18).fill(4),
      p3: Array(18).fill(4),
    }),
  });

  test('returns at most four awards, most notable first', () => {
    const awards = computeAwards(busy);

    expect(awards.length).toBeLessThanOrEqual(4);
    const scores = awards.map((a) => a.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('caps any one player at two awards so the ribbing spreads', () => {
    const awards = computeAwards(busy);
    const alsAwards = awards.filter((a) => a.playerIds.includes('p1'));

    expect(alsAwards.length).toBeLessThanOrEqual(2);
    expect(awards.some((a) => !a.playerIds.includes('p1'))).toBe(true);
  });

  test('a quiet round earns nothing at all', () => {
    const quiet = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, {
        p1: Array(18).fill(4),
        p2: Array(18).fill(5),
      }),
    });

    expect(computeAwards(quiet)).toEqual([]);
  });
});

describe('notability balance', () => {
  const hs = holes18();
  const players = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];
  // Al eagles hole 2; the skins money piles up around it.
  const scores = scoresFrom(hs, {
    p1: [4, 2, 4, 4, 3, ...Array(13).fill(4)],
    p2: Array(18).fill(4),
    p3: Array(18).fill(4),
  });

  const withStake = (skins: number) =>
    makeRound({ players, holes: hs, games: ['skins'], options: { stakes: { skins } }, scores });

  test('an eagle always makes the card, however big the money got', () => {
    const awards = computeAwards(withStake(50));

    expect(awards.map((a) => a.id)).toContain('shot-of-the-day');
  });

  test('ranking is the same whether the group played for $2 or $50', () => {
    const cheap = computeAwards(withStake(2)).map((a) => a.id);
    const rich = computeAwards(withStake(50)).map((a) => a.id);

    expect(cheap).toEqual(rich);
  });
});
