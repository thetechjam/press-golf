import type {
  GameOptions,
  GameType,
  Hole,
  JunkClaims,
  JunkKind,
  LeagueSetup,
  LeagueTeam,
  Player,
  Round,
  Scores,
  TeamSetup,
  WolfChoice,
  WolfHole,
} from './types';
import { DEFAULT_OPTIONS } from './types';
import { GAMES } from './games';
import { isJunkKind } from './games/junk';

/**
 * A whole round packed small enough to travel in a URL fragment.
 *
 * Press has no backend, so the only way a round has ever moved between two
 * phones is the backup file — which means email, or AirDrop, or a cable, for
 * something the group wants to look at in the car park. A link is the version
 * of that you can send in a text message, and a QR code is the version you can
 * hold up across a table.
 *
 * Two properties make this work without a server. The payload rides in the
 * **fragment**, which browsers never put on the wire: the round is decoded by
 * the recipient's copy of Press and is never seen by Netlify or anyone else.
 * And it is packed hard, because the size of the link is not a nicety — it
 * decides whether the QR code is a square you can scan from a phone screen or
 * a wall of noise you cannot.
 *
 * The packing is worth roughly half: the same round is ~2,500 characters as
 * plain JSON and ~870 packed, before deflate takes it to ~470 bytes. Nearly
 * all of that comes from two changes — per-player score strings instead of a
 * hole-keyed map of objects, and player ids replaced by their position in the
 * list, which are the two places the same eight-character id was repeated
 * seventy times.
 *
 * Everything here is pure and synchronous except the two compression steps,
 * so the format can be tested without a browser.
 */

/**
 * Bumped only when the packed shape changes in a way an older reader would get
 * wrong. `decodeRound` refuses a payload from the future rather than guessing —
 * a link is opened by whatever build the recipient happens to have, which may
 * be months behind the one that wrote it.
 */
export const SHARE_FORMAT = 1;

/**
 * The fragment keys: `#r=` for a round, `#c=` for a course. Matched
 * case-insensitively, because the QR carries the whole URL in capitals — see
 * `shareUrlQR`.
 */
export const SHARE_KEY = 'r';
export const COURSE_KEY = 'c';

/**
 * Scores are packed one base-36 character each, so the format can carry 0..35.
 * Entry clamps to 1..15 (`scoreEntry.ts`), leaving room to spare; a score
 * outside the range makes `encodeRound` refuse rather than quietly round it,
 * because a link that lies about a score settles the round for the wrong money.
 */
const MAX_PACKED_SCORE = 35;
/** Stands in for a hole nobody has entered yet. Not a base-36 digit, so unambiguous. */
const NO_SCORE = '.';

const GAME_TYPES: readonly string[] = GAMES.map((g) => g.id);

/* ------------------------------------------------------------------ *
 * The packed shape
 * ------------------------------------------------------------------ */

/** `[name, handicap, index]` — the player's id is their position in the list. */
type PackedPlayer = [string, number | null, number | null];
/** `[par, strokeIndex]` — the hole's number is its position, always 1..N. */
type PackedHole = [number, number | null];

interface PackedRound {
  v: number;
  /** The round's id, carried so two people who open the same link save the same round. */
  i: string;
  c?: string;
  d: string;
  ca: number;
  ua: number;
  /** 1 = finished. A number rather than the word, which deflate cannot shorten below its length. */
  f: 0 | 1;
  p: PackedPlayer[];
  h: PackedHole[];
  g: GameType[];
  /**
   * Structurally the real `GameOptions`, with every player id already replaced
   * by its index. Left in its own shape rather than flattened: options are a
   * small part of the payload and a moving target, and a positional encoding
   * of them would need revising every time a game gains a setting.
   */
  o: GameOptions;
  /** One string per player, one character per hole, in hole order. */
  s: string[];
  w?: Record<number, WolfHole>;
  /** Claimed junk, hole -> player index -> kinds. */
  j?: JunkClaims;
  /** League pick-ups ("X"), hole -> player indexes. */
  x?: Record<number, string[]>;
  pr?: number[];
  sl?: number;
  ra?: number;
}

/* ------------------------------------------------------------------ *
 * Player ids
 * ------------------------------------------------------------------ */

/**
 * Rewrites every player id in a round through `to`.
 *
 * Player ids appear in five places besides the player list, and a share link
 * that misses one produces a round that looks right and scores wrong — a
 * Nassau whose teams are empty, or a Wolf hole with no wolf. So they are
 * listed here explicitly rather than found by a deep walk, and
 * `shareLink.test.ts` asserts that no original id survives a pack, which is
 * what would catch a sixth place being added later.
 */
function mapPlayerIds<
  T extends Pick<Round, 'options' | 'wolf' | 'scores' | 'junk' | 'pickups'>,
>(
  round: T,
  to: (id: string) => string
): Required<Pick<Round, 'options' | 'wolf' | 'scores'>> & Pick<Round, 'junk' | 'pickups'> {
  const team = (t: TeamSetup | undefined): TeamSetup | undefined =>
    t && { mode: t.mode, teamA: t.teamA.map(to), teamB: t.teamB.map(to) };

  // An absent slot's id is '' and must stay '': run through `to` on the way
  // in, Number('') is 0 and it would come back as the first player.
  const slot = (id: string) => (id ? to(id) : '');
  const league = (l: LeagueSetup | undefined): LeagueSetup | undefined => {
    if (!l) return undefined;
    const out: LeagueSetup = {
      pointsPerMatch: l.pointsPerMatch,
      teams: l.teams.map((t) => {
        const team: LeagueTeam = { name: t.name, aId: slot(t.aId), bId: slot(t.bId) };
        if (t.absent) team.absent = t.absent;
        if (t.absentName) team.absentName = t.absentName;
        return team;
      }) as LeagueSetup['teams'],
    };
    if (l.ended) out.ended = true;
    if (l.firstNight?.length) out.firstNight = l.firstNight.map(to);
    return out;
  };

  const choice = (c: WolfChoice): WolfChoice =>
    c && c.type === 'partner' ? { type: 'partner', partnerId: to(c.partnerId) } : c;

  const options: GameOptions = { ...round.options };
  // Assigned conditionally so an absent option stays absent: writing
  // `nassau: undefined` would put the key in the JSON as `null`.
  if (round.options.nassau) options.nassau = team(round.options.nassau);
  if (round.options.matchPlay) options.matchPlay = team(round.options.matchPlay);
  if (round.options.vegas) options.vegas = team(round.options.vegas);
  if (round.options.league) options.league = league(round.options.league);

  const wolf: Record<number, WolfHole> = {};
  for (const [hole, w] of Object.entries(round.wolf ?? {})) {
    wolf[Number(hole)] = { wolfPlayerId: to(w.wolfPlayerId), choice: choice(w.choice) };
  }

  const scores: Scores = {};
  for (const [hole, byPlayer] of Object.entries(round.scores ?? {})) {
    const mapped: Record<string, number | null> = {};
    for (const [id, score] of Object.entries(byPlayer)) mapped[to(id)] = score;
    scores[Number(hole)] = mapped;
  }

  // Same two keys as `scores`, and the same reason for being here: junk is
  // keyed by player id, so a round that arrives with the sender's ids and
  // keeps them pays the wrong people — or nobody.
  let junk: JunkClaims | undefined;
  if (round.junk) {
    junk = {};
    for (const [hole, byPlayer] of Object.entries(round.junk)) {
      const mapped: Record<string, JunkKind[]> = {};
      for (const [id, kinds] of Object.entries(byPlayer)) mapped[to(id)] = kinds;
      junk[Number(hole)] = mapped;
    }
  }

  // Pick-ups decide league holes, and are keyed by player id like the rest.
  let pickups: Record<number, string[]> | undefined;
  if (round.pickups) {
    pickups = {};
    for (const [hole, ids] of Object.entries(round.pickups)) {
      if (ids.length) pickups[Number(hole)] = ids.map(to);
    }
  }

  return { options, wolf, scores, junk, pickups };
}

/* ------------------------------------------------------------------ *
 * Pack / unpack
 * ------------------------------------------------------------------ */

/** The id a decoded round gives its Nth player. Derived so both ends agree. */
const playerId = (n: number) => `p${n}`;

/**
 * The round as a packed object, or null when it holds something the format
 * cannot carry. Pure — `encodeRound` adds the compression.
 */
export function packRound(round: Round): PackedRound | null {
  const index = new Map(round.players.map((p, i) => [p.id, String(i)]));
  // An id in `scores` or a team that no player carries means the round is
  // already inconsistent; passing it through would silently drop a score.
  const to = (id: string): string => index.get(id) ?? id;

  const { options, wolf, scores, junk, pickups } = mapPlayerIds(round, to);

  const strings: string[] = [];
  for (let i = 0; i < round.players.length; i += 1) {
    let packed = '';
    for (const h of round.holes) {
      const score = scores[h.number]?.[String(i)];
      if (typeof score !== 'number') {
        packed += NO_SCORE;
        continue;
      }
      if (!Number.isInteger(score) || score < 0 || score > MAX_PACKED_SCORE) return null;
      packed += score.toString(36);
    }
    strings.push(packed);
  }

  const packed: PackedRound = {
    v: SHARE_FORMAT,
    i: round.id,
    d: round.date,
    ca: round.createdAt,
    ua: round.updatedAt,
    f: round.status === 'finished' ? 1 : 0,
    p: round.players.map((p) => [p.name, p.handicap ?? null, p.index ?? null]),
    h: round.holes.map((h) => [h.par, h.strokeIndex ?? null]),
    g: round.games,
    o: options,
    s: strings,
  };
  if (round.course) packed.c = round.course;
  if (Object.keys(wolf).length) packed.w = wolf;
  if (junk && Object.keys(junk).length) packed.j = junk;
  if (pickups && Object.keys(pickups).length) packed.x = pickups;
  if (round.presses?.length) packed.pr = round.presses;
  if (typeof round.slope === 'number') packed.sl = round.slope;
  if (typeof round.rating === 'number') packed.ra = round.rating;
  return packed;
}

export type UnpackResult = { ok: true; round: Round } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * True for a player reference that names a real player.
 *
 * Inside a payload a player is referred to by their position in the list, as a
 * string. A reference to a position nobody occupies is how a truncated or
 * hand-edited link produces a team with a phantom member — which scores as a
 * side that never holes out, quietly handing every hole to the opposition.
 */
function indexChecker(playerCount: number): (id: unknown) => id is string {
  return (id): id is string =>
    typeof id === 'string' &&
    Number.isInteger(Number(id)) &&
    Number(id) >= 0 &&
    Number(id) < playerCount;
}

/**
 * Reads the options out of a payload, field by field, on top of the defaults.
 *
 * Not a cast, and not a spread: this object arrives as text from somebody
 * else's phone, and every field below is dereferenced by a scoring engine
 * without checking first. A `stablefordMode` of `"banana"` or a stake of
 * `"lots"` would reach the money. Anything unrecognised falls back to the
 * default for that field rather than rejecting the round — an option Press
 * cannot read is a preference lost, not a scorecard lost.
 */
function readOptions(raw: Record<string, unknown>, playerCount: number): GameOptions {
  const known = indexChecker(playerCount);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  /** A `{ game: value }` map, keeping only known games and well-typed values. */
  const byGame = <T,>(v: unknown, ok: (x: unknown) => x is T): Partial<Record<GameType, T>> => {
    const out: Partial<Record<GameType, T>> = {};
    if (!isObject(v)) return out;
    for (const [game, value] of Object.entries(v)) {
      if (GAME_TYPES.includes(game) && ok(value)) out[game as GameType] = value;
    }
    return out;
  };
  const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
  const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

  const options: GameOptions = {
    useNet: bool(raw.useNet, DEFAULT_OPTIONS.useNet),
    stablefordMode: raw.stablefordMode === 'modified' ? 'modified' : 'standard',
    loneWolfMultiplier: num(raw.loneWolfMultiplier, DEFAULT_OPTIONS.loneWolfMultiplier),
    blindWolfMultiplier: num(raw.blindWolfMultiplier, DEFAULT_OPTIONS.blindWolfMultiplier),
    stakes: byGame(raw.stakes, isNum),
  };

  const netByGame = byGame(raw.netByGame, isBool);
  if (Object.keys(netByGame).length) options.netByGame = netByGame;
  const allowanceByGame = byGame(raw.allowanceByGame, isNum);
  if (Object.keys(allowanceByGame).length) options.allowanceByGame = allowanceByGame;

  if (typeof raw.vegasFlip === 'boolean') options.vegasFlip = raw.vegasFlip;
  if (typeof raw.autoPress === 'boolean') options.autoPress = raw.autoPress;

  const nassau = readTeam(raw.nassau, known);
  const matchPlay = readTeam(raw.matchPlay, known);
  const vegas = readTeam(raw.vegas, known);
  const league = readLeague(raw.league, known);
  if (nassau) options.nassau = nassau;
  if (matchPlay) options.matchPlay = matchPlay;
  if (vegas) options.vegas = vegas;
  if (league) options.league = league;

  return options;
}

/**
 * A team setup, or null when it doesn't hold two sides of player references.
 *
 * Ids at this point are still positions in the player list, written as strings.
 * A reference that isn't one drops the whole setup rather than half of it: a
 * Nassau with one empty side is a game that cannot be scored, and the screen
 * already knows how to say "pick teams" — it has no way to say "your teams
 * arrived damaged".
 */
function readTeam(v: unknown, known: (id: unknown) => id is string): TeamSetup | null {
  if (!isObject(v)) return null;
  if (v.mode !== '1v1' && v.mode !== '2v2') return null;
  const side = (x: unknown): string[] | null =>
    Array.isArray(x) && x.length > 0 && x.every(known) ? (x as string[]) : null;
  const teamA = side(v.teamA);
  const teamB = side(v.teamB);
  return teamA && teamB ? { mode: v.mode, teamA, teamB } : null;
}

/**
 * A league setup, or null unless both teams name both their players — or
 * say which one of them is absent, whose slot is then ''.
 */
function readLeague(v: unknown, known: (id: unknown) => id is string): LeagueSetup | null {
  if (!isObject(v) || !Array.isArray(v.teams) || v.teams.length !== 2) return null;
  const teams = v.teams.map((t): LeagueTeam | null => {
    if (!isObject(t)) return null;
    const absent = t.absent === 'a' || t.absent === 'b' ? t.absent : undefined;
    const ok = (slot: 'a' | 'b', id: unknown) =>
      absent === slot ? id === '' : known(id);
    if (!ok('a', t.aId) || !ok('b', t.bId)) return null;
    const team: LeagueTeam = {
      name: typeof t.name === 'string' ? t.name : undefined,
      aId: t.aId as string,
      bId: t.bId as string,
    };
    if (absent) team.absent = absent;
    if (absent && typeof t.absentName === 'string') team.absentName = t.absentName;
    return team;
  });
  if (teams.some((t) => t === null)) return null;
  const out: LeagueSetup = {
    teams: teams as LeagueSetup['teams'],
    pointsPerMatch:
      typeof v.pointsPerMatch === 'number' && Number.isFinite(v.pointsPerMatch)
        ? v.pointsPerMatch
        : 1,
  };
  if (v.ended === true) out.ended = true;
  if (Array.isArray(v.firstNight)) {
    const ids = v.firstNight.filter(known);
    if (ids.length) out.firstNight = ids;
  }
  return out;
}

/** The Wolf assignments, keeping only holes whose entry is intact. */
function readWolf(v: unknown, playerCount: number): Record<number, WolfHole> {
  const out: Record<number, WolfHole> = {};
  if (!isObject(v)) return out;
  const known = indexChecker(playerCount);

  for (const [hole, entry] of Object.entries(v)) {
    const n = Number(hole);
    if (!Number.isInteger(n) || !isObject(entry) || !known(entry.wolfPlayerId)) continue;
    const c = entry.choice;
    let choice: WolfChoice = null;
    if (isObject(c)) {
      if (c.type === 'lone' || c.type === 'blind') choice = { type: c.type };
      else if (c.type === 'partner' && known(c.partnerId))
        choice = { type: 'partner', partnerId: c.partnerId };
    }
    out[n] = { wolfPlayerId: entry.wolfPlayerId, choice };
  }
  return out;
}

/**
 * Junk out of a payload, keeping only what still refers to something.
 *
 * Same posture as `readOptions` and `readWolf`: this arrives as text from
 * somebody else's phone and goes straight into a money calculation. A claim on
 * a player position nobody occupies would count for a phantom, and an unknown
 * kind from a later version would count as junk without anyone being able to
 * say what it was. Both are dropped rather than rejecting the round — a claim
 * Press cannot read is a side bet lost, not a scorecard lost.
 */
function readJunk(v: unknown, playerCount: number): JunkClaims | undefined {
  if (!isObject(v)) return undefined;
  const known = indexChecker(playerCount);
  const out: JunkClaims = {};

  for (const [hole, entry] of Object.entries(v)) {
    const n = Number(hole);
    if (!Number.isInteger(n) || !isObject(entry)) continue;
    const onHole: Record<string, JunkKind[]> = {};
    for (const [id, kinds] of Object.entries(entry)) {
      if (!known(id) || !Array.isArray(kinds)) continue;
      const clean = [...new Set(kinds.filter((k): k is JunkKind => typeof k === 'string' && isJunkKind(k)))];
      if (clean.length) onHole[id] = clean;
    }
    if (Object.keys(onHole).length) out[n] = onHole;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * League pick-ups out of a payload: hole -> player positions, keeping only
 * positions somebody occupies. Same posture as `readJunk` — a pick-up Press
 * cannot place is dropped rather than rejecting the round.
 */
function readPickups(v: unknown, playerCount: number): Record<number, string[]> | undefined {
  if (!isObject(v)) return undefined;
  const known = indexChecker(playerCount);
  const out: Record<number, string[]> = {};
  for (const [hole, ids] of Object.entries(v)) {
    const n = Number(hole);
    if (!Number.isInteger(n) || !Array.isArray(ids)) continue;
    const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && known(id)))];
    if (clean.length) out[n] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Rebuilds a round from a packed object. Never throws — every failure comes
 * back as a sentence the arrival screen can show as written.
 *
 * Validation is of the *packed* shape only. What comes out the other side is
 * assembled field by field from values that have been checked, so the `Round`
 * handed to the scoring engines is well-formed by construction rather than by
 * inspection — which is the difference that matters when the input is a string
 * from a stranger's phone rather than a file this app wrote.
 */
export function unpackRound(raw: unknown): UnpackResult {
  const stale = 'That link was made by a newer version of Press. Update the app and try again.';
  if (!isObject(raw)) return { ok: false, error: "That link doesn't hold a Press round." };
  if (typeof raw.v !== 'number' || raw.v > SHARE_FORMAT) return { ok: false, error: stale };

  if (typeof raw.i !== 'string' || !raw.i) return { ok: false, error: 'That link is damaged.' };
  if (typeof raw.d !== 'string') return { ok: false, error: 'That link is damaged.' };
  if (!Array.isArray(raw.p) || raw.p.length === 0) return { ok: false, error: 'That link is damaged.' };
  if (!Array.isArray(raw.h) || raw.h.length === 0) return { ok: false, error: 'That link is damaged.' };
  if (!Array.isArray(raw.s) || raw.s.length !== raw.p.length)
    return { ok: false, error: 'That link is damaged.' };
  if (!Array.isArray(raw.g)) return { ok: false, error: 'That link is damaged.' };
  if (!isObject(raw.o)) return { ok: false, error: 'That link is damaged.' };

  // A game this build has no engine for would reach `gameMeta(...).compute` and
  // throw. Dropping it instead would quietly settle the round for less money
  // than it was played for, so the link is refused whole.
  if (!raw.g.every((g) => GAME_TYPES.includes(g as string))) return { ok: false, error: stale };

  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const players: Player[] = [];
  for (let i = 0; i < raw.p.length; i += 1) {
    const entry = raw.p[i];
    if (!Array.isArray(entry) || typeof entry[0] !== 'string')
      return { ok: false, error: 'That link is damaged.' };
    const player: Player = { id: playerId(i), name: entry[0] };
    const handicap = num(entry[1]);
    const idx = num(entry[2]);
    if (handicap !== undefined) player.handicap = handicap;
    if (idx !== undefined) player.index = idx;
    players.push(player);
  }

  const holes: Hole[] = [];
  for (let i = 0; i < raw.h.length; i += 1) {
    const entry = raw.h[i];
    if (!Array.isArray(entry) || typeof entry[0] !== 'number')
      return { ok: false, error: 'That link is damaged.' };
    const hole: Hole = { number: i + 1, par: entry[0] };
    const si = num(entry[1]);
    if (si !== undefined) hole.strokeIndex = si;
    holes.push(hole);
  }

  const scores: Scores = {};
  for (const h of holes) scores[h.number] = {};
  for (let i = 0; i < raw.s.length; i += 1) {
    const packed = raw.s[i];
    // Length is checked rather than tolerated: a string short by one would
    // otherwise shift every score after it onto the wrong hole.
    if (typeof packed !== 'string' || packed.length !== holes.length)
      return { ok: false, error: 'That link is damaged.' };
    for (let h = 0; h < holes.length; h += 1) {
      const ch = packed[h];
      if (ch === NO_SCORE) {
        scores[holes[h].number][playerId(i)] = null;
        continue;
      }
      const score = parseInt(ch, 36);
      if (Number.isNaN(score)) return { ok: false, error: 'That link is damaged.' };
      scores[holes[h].number][playerId(i)] = score;
    }
  }

  // The ids in the payload are indexes; turn them back into the ids the
  // rebuilt players carry.
  const fromIndex = (id: string): string => {
    const n = Number(id);
    return Number.isInteger(n) && n >= 0 && n < players.length ? playerId(n) : id;
  };
  const mapped = mapPlayerIds(
    {
      options: readOptions(raw.o, players.length),
      wolf: readWolf(raw.w, players.length),
      scores: {},
      junk: readJunk(raw.j, players.length),
      pickups: readPickups(raw.x, players.length),
    },
    fromIndex
  );

  const round: Round = {
    id: raw.i,
    date: raw.d,
    createdAt: num(raw.ca) ?? Date.now(),
    updatedAt: num(raw.ua) ?? Date.now(),
    players,
    holes,
    games: raw.g as GameType[],
    options: mapped.options,
    scores,
    wolf: mapped.wolf,
    status: raw.f === 1 ? 'finished' : 'in_progress',
  };
  if (mapped.junk) round.junk = mapped.junk;
  if (mapped.pickups) round.pickups = mapped.pickups;
  if (typeof raw.c === 'string' && raw.c) round.course = raw.c;
  if (Array.isArray(raw.pr)) round.presses = raw.pr.filter((n): n is number => typeof n === 'number');
  const slope = num(raw.sl);
  const rating = num(raw.ra);
  if (slope !== undefined) round.slope = slope;
  if (rating !== undefined) round.rating = rating;
  return { ok: true, round };
}

/* ------------------------------------------------------------------ *
 * Base32
 * ------------------------------------------------------------------ */

/**
 * RFC 4648 base32, unpadded.
 *
 * Chosen over base64 for one reason: every character of it, and of the URL
 * around it, is in QR's *alphanumeric* character set, which packs two
 * characters into eleven bits instead of spending eight on each. Base32 makes
 * the link about a fifth longer to look at and the QR code about a fifth
 * smaller to scan, and the QR code is the half anybody is actually pointing a
 * camera at. It is also case-insensitive, which is what lets the QR carry the
 * whole URL in capitals.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // The trailing partial group is padded with zero bits on the right, which is
  // what `fromBase32` discards when the byte it would complete is incomplete.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32, or null on any character that is not in the alphabet. */
export function fromBase32(text: string): Uint8Array | null {
  const clean = text.toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ *
 * Compression
 * ------------------------------------------------------------------ */

async function through(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Both sides of the stream reject when the input is not valid deflate, and
  // the read side below is the one worth reporting. Swallowing the write
  // side's copy of the same failure is what keeps a truncated link from
  // surfacing as an unhandled rejection alongside the message the caller
  // already has in hand.
  const quiet = () => {};
  void writer.write(bytes).catch(quiet);
  void writer.close().catch(quiet);
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Anything packed, deflated and written in base32 — what actually rides in a
 * link, for a round or for a course.
 *
 * Deflate roughly halves a round. `deflate-raw` rather than gzip because the
 * eighteen-byte header and checksum are pure cost here — the payload is
 * already inside a URL whose integrity the base32 decode and the shape check
 * establish more usefully than a CRC would.
 */
export async function toPayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const deflated = await through(json, new CompressionStream('deflate-raw'));
  return toBase32(deflated);
}

/**
 * A payload read back into whatever was packed, or null when it cannot be.
 *
 * Never throws. The usual way a link breaks is truncation — a messaging app
 * wraps it across two lines and only the first gets copied — and that arrives
 * here as a deflate error, which is a message for the user rather than a crash.
 */
export async function fromPayload(payload: string): Promise<unknown | null> {
  const bytes = fromBase32(payload.trim());
  if (!bytes || bytes.length === 0) return null;
  try {
    const inflated = await through(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(inflated));
  } catch {
    return null;
  }
}

/**
 * The payload for a round's link, or null when the round holds something the
 * format cannot carry.
 */
export async function encodeRound(round: Round): Promise<string | null> {
  const packed = packRound(round);
  return packed ? toPayload(packed) : null;
}

/** Reads a round's payload back. Never throws. */
export async function decodeRound(payload: string): Promise<UnpackResult> {
  const raw = await fromPayload(payload);
  if (raw === null) return { ok: false, error: 'That link is damaged or incomplete.' };
  return unpackRound(raw);
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

/** The link to send: `https://host/#r=PAYLOAD`, or `#c=` for a course. */
export function shareUrl(base: string, payload: string, key: string = SHARE_KEY): string {
  return `${base.split('#')[0]}#${key}=${payload}`;
}

/**
 * The same link in capitals, for the QR code.
 *
 * A URL's scheme and host are case-insensitive and the payload is base32, so
 * this addresses exactly the same page — but every character of it is now in
 * QR's alphanumeric set, which is what keeps the code a square you can scan
 * off a phone screen rather than one you have to email to yourself.
 */
export function shareUrlQR(base: string, payload: string, key: string = SHARE_KEY): string {
  return shareUrl(base, payload, key).toUpperCase();
}

/** What a fragment turned out to be carrying. */
export interface SharedThing {
  kind: 'round' | 'course';
  payload: string;
}

/**
 * What a URL's fragment is carrying, or null when it is carrying nothing of
 * ours. An unknown key is not ours: the app has other uses for a fragment,
 * and guessing at one would open a stranger's link as a round.
 */
export function sharedFromHash(hash: string): SharedThing | null {
  const match = /^#?([rc])=([^&]+)$/i.exec(hash.trim());
  if (!match) return null;
  return { kind: match[1].toLowerCase() === 'c' ? 'course' : 'round', payload: match[2] };
}
