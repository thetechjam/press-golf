import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import {
  SHARE_FORMAT,
  packRound,
  unpackRound,
  encodeRound,
  decodeRound,
  toBase32,
  fromBase32,
  shareUrl,
  shareUrlQR,
  sharedFromHash,
} from './shareLink';
import { makeRound, player, holes18, scoresFrom } from './games/testFixtures';
import { computeSettlement } from './games/settlement';
import { computeLeague } from './games/league';
import { activeResults } from './games';

/**
 * Player ids that look like the real ones `uid()` makes, rather than the
 * fixtures' 'p1'/'p2' — the packed form uses `p0`, `p1` … for the rebuilt
 * players, so ids that collide with those would let a missed remapping pass.
 */
const ID = ['k3f9ab21', 'm7q2xz04', 'b8t5cc19', 'z1n6dd77'];

/** Four players, eighteen holes, three games, money on all of them. */
function fullRound(): Round {
  const hs = holes18();
  return makeRound({
    players: [
      { id: ID[0], name: 'Alex', handicap: 8, index: 7.4 },
      { id: ID[1], name: 'Sam', handicap: 14, index: 12.9 },
      { id: ID[2], name: 'Jordan', handicap: 4 },
      { id: ID[3], name: 'Casey', handicap: 21, index: 19.8 },
    ],
    holes: hs,
    games: ['skins', 'nassau', 'stableford'],
    options: {
      useNet: true,
      netByGame: { skins: false },
      stakes: { skins: 5, nassau: 20, stableford: 1 },
      allowanceByGame: { nassau: 90 },
      autoPress: true,
      nassau: { mode: '2v2', teamA: [ID[0], ID[1]], teamB: [ID[2], ID[3]] },
    },
    scores: scoresFrom(hs, {
      [ID[0]]: [4, 5, 3, 4, 6, 4, 4, 5, 4, 3, 4, 4, 5, 4, 4, 3, 5, 4],
      [ID[1]]: [5, 4, 4, 6, 5, 4, 5, 4, 5, 4, 5, 3, 4, 5, 4, 4, 4, 5],
      [ID[2]]: [4, 4, 3, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 4, 5, 4, 4, 4],
      [ID[3]]: [6, 5, 5, 7, 6, 5, 6, 5, 4, 6, 5, 5, 6, 5, 5, 6, 5, 6],
    }),
  });
}

/**
 * The round as the engines see it, with every player id — in a value or as a
 * key — replaced by that player's position. Two rounds that compare equal this
 * way are the same round scored by the same people, whatever ids they carry.
 */
function shape(round: Round): unknown {
  const at = new Map(round.players.map((p, i) => [p.id, `#${i}`]));
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return at.get(v) ?? v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, value]) => [at.get(k) ?? k, swap(value)])
      );
    }
    return v;
  };
  return swap({ ...round, players: round.players.map(({ id: _id, ...rest }) => rest) });
}

describe('packing a round', () => {
  it('survives a round trip with every field intact', async () => {
    const round = fullRound();
    const payload = await encodeRound(round);
    expect(payload).not.toBeNull();
    const result = await decodeRound(payload!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.round.id).toBe(round.id);
    expect(result.round.date).toBe(round.date);
    expect(result.round.players.map((p) => p.name)).toEqual(['Alex', 'Sam', 'Jordan', 'Casey']);
    expect(shape(result.round)).toEqual(shape(round));
  });

  it('settles for exactly the same money on the other phone', async () => {
    // The test that matters. Everything above could pass while a stroke index
    // or a team landed a field out, and the group would settle up wrong.
    const round = { ...fullRound(), status: 'finished' as const };
    const result = await decodeRound((await encodeRound(round))!);
    if (!result.ok) throw new Error(result.error);

    const mine = computeSettlement(round);
    const theirs = computeSettlement(result.round);
    expect(theirs.active).toBe(mine.active);
    expect(theirs.transactions.map((t) => `${t.from}->${t.to} ${t.amount}`)).toEqual(
      mine.transactions.map((t) => `${t.from}->${t.to} ${t.amount}`)
    );
    expect(activeResults(result.round).map((r) => r.status)).toEqual(
      activeResults(round).map((r) => r.status)
    );
  });

  it('leaves no original player id anywhere in the payload', () => {
    // The guard for the one failure this format has: a player id lives in five
    // places besides the player list, and a sixth added later that nobody
    // remaps would ship a link whose Nassau has no teams.
    for (const round of [withEverything(), leagueRound()]) {
      const json = JSON.stringify(packRound(round));
      for (const id of ID) expect(json).not.toContain(id);
    }
  });

  it('carries the teams, the wolf and the presses to the right players', async () => {
    const result = await decodeRound((await encodeRound(withEverything()))!);
    if (!result.ok) throw new Error(result.error);
    const name = (id: string) => result.round.players.find((p) => p.id === id)?.name;

    expect(result.round.options.nassau?.teamA.map(name)).toEqual(['Alex', 'Sam']);
    expect(result.round.options.nassau?.teamB.map(name)).toEqual(['Jordan', 'Casey']);
    expect(result.round.options.vegas?.teamA.map(name)).toEqual(['Alex', 'Jordan']);
    expect(name(result.round.wolf[1].wolfPlayerId)).toBe('Casey');
    expect(result.round.wolf[1].choice).toEqual({
      type: 'partner',
      partnerId: result.round.players[0].id,
    });
    expect(result.round.wolf[2].choice).toEqual({ type: 'lone' });
    expect(result.round.presses).toEqual([7, 12]);
  });

  it('keeps a league night\u2019s pairings pointing at the right players', async () => {
    const result = await decodeRound((await encodeRound(leagueRound()))!);
    if (!result.ok) throw new Error(result.error);
    const name = (id: string) => result.round.players.find((p) => p.id === id)?.name;
    const league = result.round.options.league!;

    expect(league.pointsPerMatch).toBe(3);
    expect(league.teams.map((t) => t.name)).toEqual(['The Hackers', 'Fore Play']);
    expect(league.teams.map((t) => [name(t.aId), name(t.bId)])).toEqual([
      ['Alex', 'Sam'],
      ['Jordan', 'Casey'],
    ]);
    expect(computeLeague(result.round).teams.map((t) => t.points)).toEqual(
      computeLeague(leagueRound()).teams.map((t) => t.points)
    );
  });

  it('keeps a hole nobody has finished blank rather than guessing', async () => {
    const hs = holes18();
    const round = makeRound({
      players: [player(ID[0], 'Alex'), player(ID[1], 'Sam')],
      holes: hs,
      scores: scoresFrom(hs, {
        [ID[0]]: [4, 5, null, 4],
        [ID[1]]: [5, 4, 4, null],
      }),
    });
    const result = await decodeRound((await encodeRound(round))!);
    if (!result.ok) throw new Error(result.error);

    expect(result.round.scores[1]).toEqual({ p0: 4, p1: 5 });
    expect(result.round.scores[3].p0).toBeNull();
    expect(result.round.scores[3].p1).toBe(4);
    expect(result.round.scores[4].p1).toBeNull();
    expect(result.round.scores[18].p0).toBeNull();
  });

  it('refuses a score the format cannot carry rather than rounding it', async () => {
    const hs = holes18();
    const round = makeRound({
      players: [player(ID[0], 'Alex')],
      holes: hs,
      scores: scoresFrom(hs, { [ID[0]]: [99] }),
    });
    expect(packRound(round)).toBeNull();
    expect(await encodeRound(round)).toBeNull();
  });
});

/** Every id-carrying option at once, which is what the remap has to cover. */
function withEverything(): Round {
  const round = fullRound();
  return {
    ...round,
    games: ['skins', 'nassau', 'vegas', 'wolf'],
    presses: [7, 12],
    slope: 129,
    rating: 74.6,
    options: {
      ...round.options,
      matchPlay: { mode: '1v1', teamA: [ID[0]], teamB: [ID[2]] },
      vegas: { mode: '2v2', teamA: [ID[0], ID[2]], teamB: [ID[1], ID[3]] },
      vegasFlip: false,
    },
    wolf: {
      1: { wolfPlayerId: ID[3], choice: { type: 'partner', partnerId: ID[0] } },
      2: { wolfPlayerId: ID[0], choice: { type: 'lone' } },
      3: { wolfPlayerId: ID[1], choice: null },
    },
  };
}

/** A league night — the one format that names players outside `options.*` teams. */
function leagueRound(): Round {
  const round = fullRound();
  return {
    ...round,
    games: [],
    options: {
      ...round.options,
      nassau: undefined,
      league: {
        pointsPerMatch: 3,
        teams: [
          { name: 'The Hackers', aId: ID[0], bId: ID[1] },
          { name: 'Fore Play', aId: ID[2], bId: ID[3] },
        ],
      },
    },
  };
}

describe('reading a payload that cannot be trusted', () => {
  const payload = (over: Record<string, unknown>) => ({
    ...packRound(fullRound()),
    ...over,
  });

  it('refuses one written by a newer Press', () => {
    const result = unpackRound(payload({ v: SHARE_FORMAT + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version');
  });

  it('refuses a game this build has no engine for', () => {
    // Dropping the game instead would settle the round for less money than it
    // was played for, with nothing on screen to say a game went missing.
    const result = unpackRound(payload({ g: ['skins', 'bingoBangoBongo'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version');
  });

  it('refuses a score string that is the wrong length for the card', () => {
    const packed = packRound(fullRound())!;
    const result = unpackRound({ ...packed, s: [...packed.s.slice(1), '444'] });
    expect(result.ok).toBe(false);
  });

  it('refuses a payload that is not a Press round at all', () => {
    expect(unpackRound(null).ok).toBe(false);
    expect(unpackRound('hello').ok).toBe(false);
    expect(unpackRound({}).ok).toBe(false);
    expect(unpackRound(payload({ p: [] })).ok).toBe(false);
    expect(unpackRound(payload({ h: [] })).ok).toBe(false);
  });

  it('falls back to the default for an option it cannot read', () => {
    const result = unpackRound(
      payload({
        o: {
          stablefordMode: 'banana',
          loneWolfMultiplier: 'lots',
          stakes: { skins: 'five', nassau: 20, bingoBangoBongo: 10 },
          useNet: 'yes',
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.round.options.stablefordMode).toBe('standard');
    expect(result.round.options.loneWolfMultiplier).toBe(2);
    expect(result.round.options.useNet).toBe(false);
    // The one readable stake survives; the string and the unknown game do not.
    expect(result.round.options.stakes).toEqual({ nassau: 20 });
  });

  it('drops a team that names a player who is not in the round', () => {
    // A phantom team member scores as a side that never holes out, handing
    // every hole to the opposition. Better to have no teams and say so.
    const result = unpackRound(
      payload({ o: { ...packRound(fullRound())!.o, nassau: { mode: '2v2', teamA: ['0', '9'], teamB: ['2', '3'] } } })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.round.options.nassau).toBeUndefined();
  });

  it('drops a wolf hole whose wolf is not in the round', () => {
    const result = unpackRound(
      payload({ w: { 1: { wolfPlayerId: '9', choice: null }, 2: { wolfPlayerId: '0', choice: null } } })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.round.wolf[1]).toBeUndefined();
      expect(result.round.wolf[2].wolfPlayerId).toBe('p0');
    }
  });

  it('reports a damaged link instead of throwing', async () => {
    expect((await decodeRound('')).ok).toBe(false);
    expect((await decodeRound('!!!!')).ok).toBe(false);
    expect((await decodeRound('AAAAAAAAAAAA')).ok).toBe(false);

    // The realistic break: a messaging app wraps the link and only the first
    // line is copied.
    const whole = (await encodeRound(fullRound()))!;
    const result = await decodeRound(whole.slice(0, Math.floor(whole.length / 2)));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('damaged');
  });
});

describe('base32', () => {
  it('round-trips at every bit alignment', () => {
    for (let n = 0; n <= 16; n += 1) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
      expect([...fromBase32(toBase32(bytes))!]).toEqual([...bytes]);
    }
  });

  it('round-trips the whole byte range', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    expect([...fromBase32(toBase32(bytes))!]).toEqual([...bytes]);
  });

  it('uses only characters a QR code can spend eleven bits on two of', () => {
    const bytes = new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 7) & 255));
    expect(toBase32(bytes)).toMatch(/^[A-Z2-7]*$/);
  });

  it('reads back a payload that was upper-cased on the way through a QR', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const text = toBase32(bytes);
    expect([...fromBase32(text.toLowerCase())!]).toEqual([...bytes]);
  });

  it('refuses characters that are not in the alphabet', () => {
    expect(fromBase32('ABC!')).toBeNull();
    expect(fromBase32('ABC1')).toBeNull(); // 0/1/8/9 are excluded by design
  });
});

describe('the link itself', () => {
  it('puts the round in the fragment, which never reaches a server', () => {
    const url = shareUrl('https://pressgolf.netlify.app/', 'ABC234');
    expect(url).toBe('https://pressgolf.netlify.app/#r=ABC234');
    expect(url.split('#')[0]).not.toContain('ABC234');
  });

  it('replaces a fragment already on the page rather than appending one', () => {
    expect(shareUrl('https://pressgolf.netlify.app/#r=OLD', 'NEW')).toBe(
      'https://pressgolf.netlify.app/#r=NEW'
    );
  });

  it('capitalises the whole URL for the QR, which still addresses the same page', () => {
    expect(shareUrlQR('https://pressgolf.netlify.app/', 'ABC234')).toBe(
      'HTTPS://PRESSGOLF.NETLIFY.APP/#R=ABC234'
    );
  });

  it('reads the payload back out of a fragment, in either case', () => {
    expect(sharedFromHash('#r=ABC234')).toEqual({ kind: 'round', payload: 'ABC234' });
    expect(sharedFromHash('#R=ABC234')).toEqual({ kind: 'round', payload: 'ABC234' });
    expect(sharedFromHash('r=ABC234')).toEqual({ kind: 'round', payload: 'ABC234' });
    expect(sharedFromHash('')).toBeNull();
    expect(sharedFromHash('#play')).toBeNull();
    expect(sharedFromHash('#r=')).toBeNull();
  });

  it('tells a course apart from a round by the key', () => {
    expect(sharedFromHash('#c=ABC234')).toEqual({ kind: 'course', payload: 'ABC234' });
    expect(sharedFromHash('#C=ABC234')).toEqual({ kind: 'course', payload: 'ABC234' });
    // An unfamiliar key is not ours. Guessing at one would open a stranger's
    // link as a round.
    expect(sharedFromHash('#x=ABC234')).toBeNull();
  });

  it('writes a course link under its own key', () => {
    expect(shareUrl('https://pressgolf.netlify.app/', 'ABC234', 'c')).toBe(
      'https://pressgolf.netlify.app/#c=ABC234'
    );
    expect(shareUrlQR('https://pressgolf.netlify.app/', 'ABC234', 'c')).toBe(
      'HTTPS://PRESSGOLF.NETLIFY.APP/#C=ABC234'
    );
  });
});

describe('how big the link gets', () => {
  it('keeps a four-ball on eighteen holes inside a scannable QR code', async () => {
    // Not a style preference: a QR code's size is set by how much it carries,
    // and past roughly a thousand alphanumeric characters it stops being
    // something a phone can read off another phone's screen. This is the
    // budget that keeps the format honest when a field is added to it.
    const url = shareUrlQR('https://pressgolf.netlify.app/', (await encodeRound(fullRound()))!);
    expect(url.length).toBeLessThan(900);
    expect(url).toMatch(/^[A-Z0-9:/.#=]+$/);
  });

  it('is far smaller than the round it carries', async () => {
    const round = fullRound();
    const payload = (await encodeRound(round))!;
    expect(payload.length).toBeLessThan(JSON.stringify(round).length / 2);
  });
});

describe('junk over a link', () => {
  const four = ['Al', 'Bo', 'Cy', 'Di'];

  /** A round with junk on it, players carrying ids a receiver will not reuse. */
  const withJunk = (): Round => ({
    ...makeRound({
      players: four.map((name, i) => player(`mine-${i}`, name)),
      holes: holes18(),
      games: ['junk'],
      options: { stakes: { junk: 2 } },
    }),
    junk: {
      3: { 'mine-0': ['greenie', 'sandie'], 'mine-2': ['polie'] },
      11: { 'mine-1': ['barkie'] },
    },
  });

  it('arrives claimed against the same people it left', () => {
    // Junk is keyed by player id, and the receiver mints their own — so a
    // round that keeps the sender's ids pays the wrong people, or nobody.
    const result = unpackRound(packRound(withJunk())!);
    if (!result.ok) throw new Error(result.error);
    const { round } = result;

    const by = (name: string) => round.players.find((p) => p.name === name)!.id;
    expect(round.junk?.[3]?.[by('Al')]).toEqual(['greenie', 'sandie']);
    expect(round.junk?.[3]?.[by('Cy')]).toEqual(['polie']);
    expect(round.junk?.[11]?.[by('Bo')]).toEqual(['barkie']);
    expect(computeSettlement(round).totals[by('Al')]).toBe(
      computeSettlement(withJunk()).totals['mine-0']
    );
  });

  it('costs nothing in a round with no junk on it', () => {
    const packed = packRound(makeRound({ players: [player('a', 'Al'), player('b', 'Bo')] }));
    expect(packed).not.toBeNull();
    expect('j' in packed!).toBe(false);
  });

  it('drops a claim on a player position nobody occupies', () => {
    // A truncated or hand-edited link: counted, it would pay a phantom.
    const packed = packRound(withJunk())!;
    packed.j = { 3: { '9': ['greenie'], '0': ['sandie'] } } as typeof packed.j;
    const result = unpackRound(packed);
    if (!result.ok) throw new Error(result.error);
    const ids = Object.keys(result.round.junk?.[3] ?? {});
    expect(ids).toEqual([result.round.players[0].id]);
  });

  it('drops a kind this version cannot name', () => {
    const packed = packRound(withJunk())!;
    packed.j = { 3: { '0': ['sandie', 'moonshot'] } } as typeof packed.j;
    const result = unpackRound(packed);
    if (!result.ok) throw new Error(result.error);
    expect(result.round.junk?.[3]?.[result.round.players[0].id]).toEqual(['sandie']);
  });

  it('leaves the round with no junk at all rather than an empty shell', () => {
    const packed = packRound(withJunk())!;
    packed.j = { 3: { '9': ['greenie'] } } as typeof packed.j;
    const result = unpackRound(packed);
    if (!result.ok) throw new Error(result.error);
    expect(result.round.junk).toBeUndefined();
  });
});
