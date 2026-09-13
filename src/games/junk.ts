import type { Round, GameResult, GameStanding, JunkKind, JunkClaims } from '../types';
import { rankStandings } from './util';

/**
 * Junk — the side bets a scorecard cannot see.
 *
 * Every other engine here is a pure function of the scores. This one is a pure
 * function of what the group *claimed*, because the card records a par and has
 * no idea whether it came out of a bunker, off a tree, or from the fringe with
 * a wedge. So `computeJunk` does no detective work at all: it counts, and
 * everything interesting happens at the point of entry, where somebody who
 * watched the shot taps a name.
 *
 * One consequence worth stating: junk cannot be wrong the way a score can be
 * wrong. There is nothing to validate a claim against, so the only guard here
 * is against claims that no longer refer to anything — a player removed from
 * the round mid-way, a hole that isn't being played, a kind from a future
 * version arriving over a share link.
 */

export interface JunkMeta {
  id: JunkKind;
  label: string;
  /** What it takes to claim one, in the words a group would use. */
  blurb: string;
}

/**
 * The six, in the order they appear on the hole.
 *
 * Greenie first because it is decided before anyone putts, then the two
 * recovery bets, then the two ways of holing out from somewhere unlikely.
 * Arnie sits with the recoveries: it is the same kind of story.
 */
export const JUNK: JunkMeta[] = [
  { id: 'greenie', label: 'Greenie', blurb: 'Closest to the pin on a par 3, and made par or better' },
  { id: 'sandie', label: 'Sandie', blurb: 'Out of a bunker and still made par' },
  { id: 'barkie', label: 'Barkie', blurb: 'Hit a tree and still made par' },
  { id: 'arnie', label: 'Arnie', blurb: 'Made par without ever being on the fairway' },
  { id: 'chipIn', label: 'Chip-in', blurb: 'Holed out from off the green' },
  { id: 'polie', label: 'Polie', blurb: 'Sank a putt longer than the flagstick' },
];

const KINDS = new Set<string>(JUNK.map((j) => j.id));

export const junkMeta = (id: JunkKind): JunkMeta => JUNK.find((j) => j.id === id) as JunkMeta;

/** Whether `kind` is one this version knows how to count. */
export const isJunkKind = (kind: string): kind is JunkKind => KINDS.has(kind);

/**
 * Everything claimed on one hole by one player, deduplicated and in list order.
 *
 * Order matters only so a row does not reshuffle itself as claims are added:
 * tapping Sandie after Polie should not move Polie.
 */
export function claimsOn(round: Round, holeNumber: number, playerId: string): JunkKind[] {
  const raw = round.junk?.[holeNumber]?.[playerId] ?? [];
  const held = new Set(raw.filter(isJunkKind));
  return JUNK.filter((j) => held.has(j.id)).map((j) => j.id);
}

export const hasClaim = (round: Round, holeNumber: number, playerId: string, kind: JunkKind) =>
  claimsOn(round, holeNumber, playerId).includes(kind);

/**
 * The claims with one (hole, player, kind) turned on or off.
 *
 * Returns a new `JunkClaims` and prunes as it goes: a player with nothing left
 * on a hole loses their entry, and a hole with nobody on it loses its own, so
 * an over-tapped and untapped round serialises identically to one nobody
 * touched. That matters more than tidiness — these rounds travel as share
 * links, where every empty object is bytes in a QR code.
 */
export function toggleJunk(
  round: Round,
  holeNumber: number,
  playerId: string,
  kind: JunkKind
): JunkClaims {
  const next: JunkClaims = { ...(round.junk ?? {}) };
  const onHole = { ...(next[holeNumber] ?? {}) };
  const held = claimsOn(round, holeNumber, playerId);
  const after = held.includes(kind) ? held.filter((k) => k !== kind) : [...held, kind];

  if (after.length === 0) delete onHole[playerId];
  else onHole[playerId] = JUNK.filter((j) => after.includes(j.id)).map((j) => j.id);

  if (Object.keys(onHole).length === 0) delete next[holeNumber];
  else next[holeNumber] = onHole;
  return next;
}

/**
 * How many each player is holding.
 *
 * Counted only over the holes and players this round actually has. A claim on
 * a player who was removed, or a hole that is not being played, is left where
 * it is rather than deleted — the round may be edited back — but it pays
 * nobody in the meantime.
 */
export function junkCounts(round: Round): Record<string, number> {
  const counts: Record<string, number> = {};
  round.players.forEach((p) => (counts[p.id] = 0));
  for (const h of round.holes) {
    const onHole = round.junk?.[h.number];
    if (!onHole) continue;
    for (const p of round.players) {
      counts[p.id] += claimsOn(round, h.number, p.id).length;
    }
  }
  return counts;
}

/** Every claim on one hole, for the strip that summarises it. */
export function junkOnHole(
  round: Round,
  holeNumber: number
): { playerId: string; name: string; kinds: JunkKind[] }[] {
  return round.players
    .map((p) => ({ playerId: p.id, name: p.name, kinds: claimsOn(round, holeNumber, p.id) }))
    .filter((row) => row.kinds.length > 0);
}

export function computeJunk(round: Round): GameResult {
  const counts = junkCounts(round);
  const standings: GameStanding[] = round.players.map((p) => ({
    playerId: p.id,
    label: p.name,
    // "junk" is uncountable: one junk, four junk.
    detail: `${counts[p.id]} junk`,
    value: counts[p.id],
    rank: 0,
    isLeader: false,
  }));
  const sorted = rankStandings(standings, false);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let status: string;
  if (total === 0) {
    status = 'Nothing claimed yet';
  } else {
    const top = Math.max(...Object.values(counts));
    const leaders = round.players.filter((p) => counts[p.id] === top);
    status =
      leaders.length === 1
        ? `${leaders[0].name} leads on ${top}`
        : `${leaders.length} tied on ${top}`;
  }

  return {
    gameType: 'junk',
    title: 'Junk',
    status,
    standings: sorted,
  };
}
