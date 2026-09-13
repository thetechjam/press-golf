import { describe, test, expect } from 'vitest';
import { computeAwards, holeName } from './awards';
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
      games: ['strokePlay'],
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

describe('The Wrecking Ball', () => {
  const TEAMS = { mode: '2v2' as const, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] };
  const four = [
    player('a1', 'Al'),
    player('a2', 'Ann'),
    player('b1', 'Bo'),
    player('b2', 'Bea'),
  ];

  /** A Vegas round where only the given holes are scored. */
  const vegasRound = (
    cards: Record<string, (number | null | undefined)[]>,
    over: Record<string, unknown> = {}
  ) => {
    const hs = holes18();
    return makeRound({
      players: four,
      holes: hs,
      games: ['vegas'],
      options: { vegas: TEAMS, ...over },
      scores: scoresFrom(hs, cards),
    });
  };

  /** Par golf from everybody, with one hole left for the test to ruin. */
  const pars = (bad?: { at: number; score: number }) =>
    Array.from({ length: 18 }, (_, i) => (bad && i === bad.at - 1 ? bad.score : 4));

  test('names the player whose score blew the number up, and what it cost', () => {
    // Hole 7: A is 4 and 4 = 44. Bea takes a 9, so B is 49 — a 5-point hole.
    // Bo taking the 9 instead would be the same number, so the culprit is
    // whoever actually holds the big score.
    const round = vegasRound({
      a1: pars(),
      a2: pars(),
      b1: pars(),
      b2: pars({ at: 7, score: 9 }),
    });
    // 44 against 49 is only 5 — under the threshold, deliberately.
    expect(find(round, 'wrecking-ball')).toBeUndefined();
  });

  test('fires when a side loses a hole by a phone number', () => {
    // Hole 7: A pars for 44. Bo takes an 8 and Bea a 9, so B is 89 — 45 points.
    const round = vegasRound({
      a1: pars(),
      a2: pars(),
      b1: pars({ at: 7, score: 8 }),
      b2: pars({ at: 7, score: 9 }),
    });

    const award = find(round, 'wrecking-ball');
    expect(award?.playerIds).toEqual(['b2']); // the 9, not the 8
    expect(award?.line).toContain('Bea');
    expect(award?.line).toContain('7');
    expect(award?.detail).toBe('9 on a par 4 · 45 points');
  });

  test('blames the bigger score on the losing side', () => {
    const round = vegasRound({
      a1: pars(),
      a2: pars(),
      b1: pars({ at: 3, score: 9 }),
      b2: pars({ at: 3, score: 8 }),
    });
    expect(find(round, 'wrecking-ball')?.playerIds).toEqual(['b1']);
  });

  test('does not fire on a round with no teams picked', () => {
    const hs = holes18();
    const round = makeRound({
      players: four,
      holes: hs,
      games: ['vegas'],
      scores: scoresFrom(hs, {
        a1: pars(),
        a2: pars(),
        b1: pars({ at: 7, score: 8 }),
        b2: pars({ at: 7, score: 9 }),
      }),
    });
    expect(find(round, 'wrecking-ball')).toBeUndefined();
  });

  test('does not fire when Vegas is not being played', () => {
    const round = vegasRound(
      { a1: pars(), a2: pars(), b1: pars({ at: 7, score: 8 }), b2: pars({ at: 7, score: 9 }) }
    );
    expect(find({ ...round, games: [] }, 'wrecking-ball')).toBeUndefined();
  });
});

describe('Short of the Mark', () => {
  /** A Quota round: Al plays off 0, Bo off `boHcp`. */
  const quotaRound = (
    cards: Record<string, number[]>,
    boHcp?: number
  ) => {
    const hs = holes18();
    return makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo', boHcp)],
      holes: hs,
      games: ['quota'],
      scores: scoresFrom(hs, cards),
    });
  };

  test('names whoever finished furthest below their target', () => {
    // Al pars out: 36 points against a quota of 36, exactly level.
    // Bo doubles every hole: 0 points against a quota of 36 — 36 short.
    const round = quotaRound({
      p1: Array(18).fill(4),
      p2: Array(18).fill(6),
    });

    const award = find(round, 'short-of-the-mark');
    expect(award?.playerIds).toEqual(['p2']);
    expect(award?.line).toContain('Bo');
    expect(award?.detail).toContain('quota 36');
    expect(award?.detail).toContain('36 short');
  });

  test('does not fire when everybody got close', () => {
    // Al is level; Bo drops two bogeys, so he is 2 short — not a story.
    const round = quotaRound({
      p1: Array(18).fill(4),
      p2: [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    expect(find(round, 'short-of-the-mark')).toBeUndefined();
  });

  test('does not fire when two players share the low mark', () => {
    const card = Array(18).fill(6);
    const round = quotaRound({ p1: card, p2: card });
    expect(find(round, 'short-of-the-mark')).toBeUndefined();
  });

  test('does not fire when Quota is not being played', () => {
    const round = quotaRound({ p1: Array(18).fill(4), p2: Array(18).fill(6) });
    expect(find({ ...round, games: [] }, 'short-of-the-mark')).toBeUndefined();
  });

  test('measures against the target, so a handicap moves who it lands on', () => {
    // Identical cards of straight bogeys: 18 points each. Al is off scratch,
    // so his quota is 36 and he is 18 short. Bo is off 18, quota 18, and is
    // exactly on it — the same round, a different verdict.
    const card = Array(18).fill(5);
    const round = quotaRound({ p1: card, p2: card }, 18);
    expect(find(round, 'short-of-the-mark')?.playerIds).toEqual(['p1']);
  });
});

describe('awards that report the same hole', () => {
  const TEAMS = { mode: '2v2' as const, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] };
  const pars = (bad?: { at: number; score: number }) =>
    Array.from({ length: 18 }, (_, i) => (bad && i === bad.at - 1 ? bad.score : 4));

  test('name it once, keeping the telling that says more', () => {
    // Dana's 9 on hole 7 is both the round's worst hole and the hole that
    // wrecked her side's Vegas number. Two awards for one number written on
    // one card reads as a bug, not as two jokes.
    const hs = holes18();
    const round = makeRound({
      players: [
        player('a1', 'Al'),
        player('a2', 'Ann'),
        player('b1', 'Bo'),
        player('b2', 'Dana'),
      ],
      holes: hs,
      games: ['vegas'],
      options: { vegas: TEAMS },
      scores: scoresFrom(hs, {
        a1: pars(),
        a2: pars(),
        b1: pars({ at: 7, score: 8 }),
        b2: pars({ at: 7, score: 9 }),
      }),
    });

    const awards = computeAwards(round);
    const aboutDanasHole = awards.filter((a) => a.playerIds.includes('b2') && a.hole === 7);
    expect(aboutDanasHole).toHaveLength(1);
    // The Wrecking Ball survives: it carries the score and what it cost.
    expect(aboutDanasHole[0].id).toBe('wrecking-ball');
    expect(awards.find((a) => a.id === 'snowman')).toBeUndefined();
  });

  test('leaves two awards about different holes alone', () => {
    const hs = holes18();
    const round = makeRound({
      players: [
        player('a1', 'Al'),
        player('a2', 'Ann'),
        player('b1', 'Bo'),
        player('b2', 'Dana'),
      ],
      holes: hs,
      games: ['vegas'],
      options: { vegas: TEAMS },
      scores: scoresFrom(hs, {
        // Hole 2 is the round's worst hole — but both sides take a 10 there,
        // so each side's number is 410 and the hole swings nothing. (A double
        // figure makes a huge Vegas number, which is why it takes a matching
        // disaster on the other side to keep this hole off the wreck list.)
        // The actual wreck is B's 89 against 44 on hole 7.
        a1: [4, 10, ...Array(16).fill(4)],
        a2: pars(),
        b1: [4, 10, ...pars({ at: 7, score: 8 }).slice(2)],
        b2: pars({ at: 7, score: 9 }),
      }),
    });

    const awards = computeAwards(round);
    expect(awards.find((a) => a.id === 'snowman')?.playerIds).toEqual(['a1']);
    expect(awards.find((a) => a.id === 'wrecking-ball')?.playerIds).toEqual(['b2']);
  });
});

describe('naming a hole', () => {
  it('speaks golf rather than reading out a coordinate', () => {
    // "Jo birdied 1" reads as one birdie as easily as the first hole, and the
    // detail line under it ("3 on a par 4") settles nothing.
    expect(holeName(1)).toBe('the 1st');
    expect(holeName(2)).toBe('the 2nd');
    expect(holeName(3)).toBe('the 3rd');
    expect(holeName(4)).toBe('the 4th');
    expect(holeName(9)).toBe('the 9th');
    expect(holeName(18)).toBe('the 18th');
  });

  it('gets the teens right, which is where the naive rule breaks', () => {
    // 11, 12 and 13 take "th" despite ending in 1, 2 and 3 — and every one of
    // them is a hole somebody plays.
    expect(holeName(11)).toBe('the 11th');
    expect(holeName(12)).toBe('the 12th');
    expect(holeName(13)).toBe('the 13th');
    expect(holeName(21)).toBe('the 21st');
  });
});

describe('The Magpie', () => {
  const four = [
    player('p1', 'Al'),
    player('p2', 'Bo'),
    player('p3', 'Cy'),
    player('p4', 'Di'),
  ];

  const withJunk = (junk: NonNullable<Parameters<typeof makeRound>[0]>['junk']) =>
    makeRound({ players: four, holes: holes18(), games: ['junk'], junk });

  test('names the sole leader once they are holding two or more', () => {
    const round = withJunk({
      2: { p1: ['greenie'] },
      7: { p1: ['sandie'], p2: ['polie'] },
    });
    const award = find(round, 'magpie');
    expect(award?.line).toBe('Al picked up everything loose');
  });

  test('names the haul rather than totalling it', () => {
    // "two greenies and a sandie" is a round somebody can picture; "4 junk" is
    // a number they already saw on the card above.
    const round = withJunk({
      2: { p1: ['greenie'] },
      5: { p1: ['greenie', 'sandie'] },
      9: { p1: ['polie'] },
    });
    expect(find(round, 'magpie')?.detail).toBe('2 greenies · a sandie · a polie');
  });

  test('keeps the haul in list order however it was collected', () => {
    const round = withJunk({ 2: { p1: ['polie'] }, 3: { p1: ['greenie'] } });
    expect(find(round, 'magpie')?.detail).toBe('a greenie · a polie');
  });

  test('says nothing about one', () => {
    // Collecting one greenie is not a story.
    expect(find(withJunk({ 2: { p1: ['greenie'] } }), 'magpie')).toBeUndefined();
  });

  test('says nothing when two are level', () => {
    // Everyone picking up a couple is a nice round, not a winner.
    const round = withJunk({
      2: { p1: ['greenie', 'sandie'] },
      7: { p2: ['polie', 'barkie'] },
    });
    expect(find(round, 'magpie')).toBeUndefined();
  });

  test('stays away from a round that is not playing junk', () => {
    const round = makeRound({
      players: four,
      holes: holes18(),
      games: ['skins'],
      junk: { 2: { p1: ['greenie'] }, 5: { p1: ['sandie'] } },
    });
    expect(find(round, 'magpie')).toBeUndefined();
  });

  test('ranks a big haul above a small one, and both below a skins heist', () => {
    const small = find(withJunk({ 2: { p1: ['greenie', 'sandie'] } }), 'magpie');
    const big = find(
      withJunk({
        2: { p1: ['greenie', 'sandie', 'barkie'] },
        3: { p1: ['arnie', 'polie'] },
      }),
      'magpie'
    );
    expect(big!.score).toBeGreaterThan(small!.score);
    // A skin is a hole won outright; junk is a side bet on the way past.
    expect(big!.score).toBeLessThan(60);
  });

  test('counts only the players and holes this round still has', () => {
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: holes18().slice(0, 9),
      games: ['junk'],
      junk: {
        2: { p1: ['greenie', 'sandie'] },
        12: { p1: ['polie'] },
        3: { gone: ['barkie', 'arnie', 'greenie'] },
      },
    });
    // The 12th is not being played and `gone` is not in the round.
    expect(find(round, 'magpie')?.detail).toBe('a greenie · a sandie');
  });
});
