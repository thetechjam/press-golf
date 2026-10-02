import type { Round } from './types';

/**
 * Telling people apart across rounds.
 *
 * A `Player.id` belongs to one round, so everything that follows somebody
 * from round to round — Stats, league standings, trips, the recall chips —
 * goes by name. That made "Al" and "Alex" two people, and each of those
 * screens had its own copy of how to compare two names.
 *
 * This is the one copy. Names compare by `nameKey`. Two spellings the user has
 * said are the same person are an *alias*: "al" → "Alex". A merge rewrites the
 * saved rounds to the one spelling and records the alias, so a round typed or
 * received later with the old spelling is brought into line as it is saved.
 *
 * Nothing here ever merges two names on its own: `nearMatches` only suggests,
 * and the user says yes or no. Press moves money between people, and two Mikes
 * quietly becoming one is a bill sent to the wrong person.
 */

/** Trimmed, lower-cased, inner spaces collapsed: "  Alex  M " → "alex m". */
export const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Old spelling's key → the name to use instead, as it should be shown. */
export type Aliases = Record<string, string>;

/**
 * The name to use for `name`: the merged-into spelling if it has been merged,
 * otherwise itself, trimmed. Follows a chain (Al → Alex → Alexander) and
 * stops on a loop rather than spinning.
 */
export function resolveName(name: string, aliases: Aliases): string {
  let current = name.trim();
  const seen = new Set<string>();
  for (let k = nameKey(current); aliases[k] && !seen.has(k); k = nameKey(current)) {
    seen.add(k);
    current = aliases[k];
  }
  return current;
}

/** A round with every player's name brought to its merged spelling. */
export function applyAliases(round: Round, aliases: Aliases): Round {
  if (!Object.keys(aliases).length) return round;
  let changed = false;
  const players = round.players.map((p) => {
    const name = resolveName(p.name, aliases);
    if (name === p.name.trim() || !p.name.trim()) return p;
    changed = true;
    return { ...p, name };
  });
  return changed ? { ...round, players } : round;
}

/** The aliases with `from` merged into `into` — and anything that pointed at `from` too. */
export function withAlias(aliases: Aliases, from: string, into: string): Aliases {
  const f = nameKey(from);
  const target = into.trim();
  if (!f || f === nameKey(target)) return aliases;
  const next: Aliases = {};
  for (const [k, v] of Object.entries(aliases)) {
    // Repoint a chain at the new name, and drop the reverse merge, which
    // would otherwise make a loop.
    if (k === nameKey(target)) continue;
    next[k] = nameKey(v) === f ? target : v;
  }
  next[f] = target;
  return next;
}

/**
 * Every saved round with `from` renamed to `into`, for the merge. A round that
 * already has both names on its card is left alone: two players in one
 * foursome are two people, whatever their names look like.
 */
export function mergeInRounds(rounds: Round[], from: string, into: string): Round[] {
  const f = nameKey(from);
  const i = nameKey(into);
  return rounds.map((r) => {
    const hasFrom = r.players.some((p) => nameKey(p.name) === f);
    if (!hasFrom || r.players.some((p) => nameKey(p.name) === i)) return r;
    return {
      ...r,
      players: r.players.map((p) => (nameKey(p.name) === f ? { ...p, name: into.trim() } : p)),
    };
  });
}

/**
 * Names that are probably the same person, and nicknames that are.
 * Short on purpose: these only ever prompt a question.
 */
const NICKNAMES: string[][] = [
  ['mike', 'michael', 'mikey'],
  ['bob', 'bobby', 'rob', 'robbie', 'robert', 'bert'],
  ['bill', 'billy', 'will', 'willy', 'william', 'liam'],
  ['jim', 'jimmy', 'jamie', 'james'],
  ['tom', 'tommy', 'thomas'],
  ['dave', 'davey', 'david'],
  ['dan', 'danny', 'daniel'],
  ['joe', 'joey', 'joseph'],
  ['steve', 'stevie', 'stephen', 'steven'],
  ['chris', 'christopher', 'kris'],
  ['matt', 'matty', 'matthew'],
  ['nick', 'nicky', 'nicholas'],
  ['tony', 'anthony'],
  ['rick', 'ricky', 'rich', 'richie', 'dick', 'richard'],
  ['ed', 'eddie', 'ted', 'teddy', 'edward'],
  ['jon', 'jonny', 'johnny', 'john', 'jack'],
  ['ben', 'benny', 'benjamin'],
  ['sam', 'sammy', 'samuel', 'samantha'],
  ['alex', 'al', 'alexander', 'alexandra', 'xander'],
  ['greg', 'gregory'],
  ['pat', 'patrick', 'patty', 'patricia'],
  ['kate', 'katie', 'kathy', 'katherine', 'catherine'],
  ['liz', 'lizzie', 'beth', 'betty', 'elizabeth'],
  ['jen', 'jenny', 'jennifer'],
  ['andy', 'drew', 'andrew'],
];
const nicknameGroup = new Map<string, number>();
NICKNAMES.forEach((g, i) => g.forEach((n) => nicknameGroup.set(n, i)));

/** Edit distance, stopping early once it passes `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** Whether two different names look like one person. */
export function looksAlike(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y || x === y) return false;
  const [fx, fy] = [x.split(' ')[0], y.split(' ')[0]];
  const [lx, ly] = [x.split(' ').slice(1).join(' '), y.split(' ').slice(1).join(' ')];
  // Different surnames given for both is two people, however alike the rest.
  if (lx && ly && lx[0] !== ly[0]) return false;
  // "Alex" and "Alex M"; "Al" and "Alex".
  if (fx === fy) return true;
  if (fx.length >= 2 && fy.length >= 2 && (fx.startsWith(fy) || fy.startsWith(fx))) return true;
  // Mike and Michael.
  const gx = nicknameGroup.get(fx);
  if (gx != null && gx === nicknameGroup.get(fy)) return true;
  // One slip of the thumb, on names long enough that one letter is a typo
  // and not the whole difference between Tim and Tom.
  return fx.length >= 4 && fy.length >= 4 && within(fx, fy, 1);
}

/** Known names that `name` probably means, best guess first. Never `name` itself. */
export function nearMatches(name: string, known: string[]): string[] {
  const k = nameKey(name);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of known) {
    const ck = nameKey(candidate);
    if (!ck || ck === k || seen.has(ck)) continue;
    seen.add(ck);
    if (looksAlike(name, candidate)) out.push(candidate.trim());
  }
  // Same first name before a prefix or nickname match.
  const first = k.split(' ')[0];
  return out.sort(
    (a, b) =>
      Number(nameKey(b).split(' ')[0] === first) - Number(nameKey(a).split(' ')[0] === first)
  );
}

/** Two names, in a stable order, as one string — for "these are two people". */
export const pairKey = (a: string, b: string): string => [nameKey(a), nameKey(b)].sort().join('|');

export interface LikelySame {
  /** The spelling to keep: the one on more rounds, then the longer. */
  into: string;
  from: string;
}

/**
 * Pairs of names in these rounds that are probably one person: alike, never
 * on the same card together, and not already answered "two people".
 */
export function likelySame(rounds: Round[], distinct: Set<string> = new Set()): LikelySame[] {
  const count = new Map<string, { name: string; n: number }>();
  const together = new Set<string>();
  for (const r of rounds) {
    const names = r.players.map((p) => p.name.trim()).filter(Boolean);
    for (const n of names) {
      const k = nameKey(n);
      const c = count.get(k);
      if (c) c.n += 1;
      else count.set(k, { name: n, n: 1 });
    }
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) together.add(pairKey(names[i], names[j]));
  }
  const people = [...count.values()];
  const out: LikelySame[] = [];
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const [a, b] = [people[i], people[j]];
      const key = pairKey(a.name, b.name);
      if (together.has(key) || distinct.has(key) || !looksAlike(a.name, b.name)) continue;
      const keepA = a.n > b.n || (a.n === b.n && a.name.length >= b.name.length);
      out.push(keepA ? { into: a.name, from: b.name } : { into: b.name, from: a.name });
    }
  return out;
}

/**
 * What the phone knows about who is who, beyond the names on the rounds: the
 * spellings merged into one person, and the pairs answered "two people".
 */
export interface PeopleData {
  aliases: Aliases;
  /** `pairKey`s. */
  distinct: string[];
}

/**
 * Two phones' people data as one, for a restore. The phone's own answers win:
 * an alias this phone already has keeps its target, and an incoming one that
 * would undo or loop against it is dropped. "Two people" answers are unioned —
 * except a pair one side has since merged, which is no longer two people.
 */
export function mergePeopleData(
  local: PeopleData,
  incoming: PeopleData
): { people: PeopleData; added: number } {
  let aliases = { ...local.aliases };
  let added = 0;
  for (const [from, into] of Object.entries(incoming.aliases)) {
    if (aliases[from]) continue;
    // Following the local chain from `into` back to `from` would make a loop.
    if (nameKey(resolveName(into, aliases)) === from) continue;
    aliases = withAlias(aliases, from, into);
    added += 1;
  }
  const merged = (k: string) => {
    const [a, b] = k.split('|');
    return nameKey(resolveName(a, aliases)) === nameKey(resolveName(b, aliases));
  };
  const distinct = [...new Set([...local.distinct, ...incoming.distinct])].filter((k) => !merged(k));
  return { people: { aliases, distinct }, added };
}
