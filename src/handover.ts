import type { Round } from './types';
import { uid } from './storage';

/**
 * What to do with a round that has arrived when this device already has one.
 *
 * Sharing a round is a snapshot, not sync. Hand a card over on the ninth and
 * both phones now hold a round with the same id, and `mergeRounds` in
 * `backup.ts` resolves that collision the only way it can with no more
 * information: newest `updatedAt` wins, whole. That is right when one copy is
 * simply further along, and silently destructive when both have been scored —
 * the back nine somebody entered on the other phone disappears with no
 * message, which is the worst thing a scorekeeper app can do.
 *
 * So the comparison happens here, at the one moment where both copies are in
 * memory and the user is present to decide. Everything is a pure function of
 * two rounds; the screen only has to name the outcome.
 */

/** A scored cell: this hole, this player, by position rather than by id. */
type Cell = string;

/**
 * Which cells a round has a score in, keyed by hole number and the player's
 * position in the list.
 *
 * By position because the two copies do not agree on player ids and never
 * will: a round rebuilt from a link carries `p0`, `p1` …, while the phone that
 * first scored it carries whatever `uid()` produced. Packing preserves the
 * order of the players, so position is the one identifier both sides share.
 */
function cells(round: Round): Map<Cell, number> {
  const at = new Map(round.players.map((p, i) => [p.id, i]));
  const out = new Map<Cell, number>();
  for (const [hole, byPlayer] of Object.entries(round.scores ?? {})) {
    for (const [id, score] of Object.entries(byPlayer)) {
      const position = at.get(id);
      if (position === undefined || typeof score !== 'number') continue;
      out.set(`${hole}:${position}`, score);
    }
  }
  return out;
}

export interface Comparison {
  /** Holes scored on the arriving copy that this device has no score for. */
  theirsOnly: number;
  /** Holes scored here that the arriving copy has no score for. */
  mineOnly: number;
  /** Holes both have scored, differently — a correction on one side or the other. */
  differing: number;
}

export type Arrival =
  /** No round with this id here. */
  | { kind: 'new' }
  /** Same scores on both. Nothing to decide. */
  | { kind: 'same' }
  /** Everything this device has, and more — the ordinary handover coming back. */
  | { kind: 'ahead'; diff: Comparison }
  /** This device is the one further along. */
  | { kind: 'behind'; diff: Comparison }
  /** Both phones scored holes the other does not have, or scored one differently. */
  | { kind: 'diverged'; diff: Comparison };

/**
 * How an arriving round stands against the copy already here.
 *
 * `mine` is what `getRound(incoming.id)` returned, or undefined when there is
 * nothing to compare against.
 */
export function compareRounds(incoming: Round, mine: Round | undefined): Arrival {
  if (!mine) return { kind: 'new' };

  const theirs = cells(incoming);
  const ours = cells(mine);
  const diff: Comparison = { theirsOnly: 0, mineOnly: 0, differing: 0 };

  for (const [cell, score] of theirs) {
    if (!ours.has(cell)) diff.theirsOnly += 1;
    else if (ours.get(cell) !== score) diff.differing += 1;
  }
  for (const cell of ours.keys()) if (!theirs.has(cell)) diff.mineOnly += 1;

  if (diff.theirsOnly === 0 && diff.mineOnly === 0 && diff.differing === 0) {
    return { kind: 'same' };
  }
  // A differing score puts something on both sides at once: each copy holds a
  // number the other does not. So it is divergence on its own, and the two
  // clean cases below are exactly the ones with none.
  if (diff.differing === 0 && diff.mineOnly === 0) return { kind: 'ahead', diff };
  if (diff.differing === 0 && diff.theirsOnly === 0) return { kind: 'behind', diff };
  return { kind: 'diverged', diff };
}

/**
 * The arriving round as a separate round, with an id of its own.
 *
 * The way out of a divergence that loses nothing: both copies are kept, both
 * are visible on the Home screen, and the user decides at their leisure which
 * one is the real card — rather than the app deciding for them, instantly and
 * irreversibly, on the strength of a timestamp.
 *
 * `createdAt` is carried over so it still sorts with the round it came from,
 * and the course name says where it came from, because two rounds at the same
 * place on the same day are otherwise indistinguishable in a list.
 */
export function forkRound(incoming: Round, now: number = Date.now()): Round {
  return {
    ...incoming,
    id: uid(),
    updatedAt: now,
    course: incoming.course ? `${incoming.course} (from a link)` : 'From a link',
  };
}

/** One sentence describing what the two copies disagree about. */
export function describeArrival(arrival: Arrival): string {
  const holes = (n: number) => `${n} ${n === 1 ? 'score' : 'scores'}`;
  switch (arrival.kind) {
    case 'new':
      return '';
    case 'same':
      return 'You already have this round, exactly as it is here.';
    case 'ahead':
      return `The copy you were sent has ${holes(arrival.diff.theirsOnly)} yours doesn’t.`;
    case 'behind':
      return `Your copy has ${holes(arrival.diff.mineOnly)} the one you were sent doesn’t.`;
    case 'diverged': {
      const { mineOnly, theirsOnly, differing } = arrival.diff;
      const parts: string[] = [];
      if (theirsOnly) parts.push(`${holes(theirsOnly)} only on the copy you were sent`);
      if (mineOnly) parts.push(`${holes(mineOnly)} only on yours`);
      if (differing) parts.push(`${differing} entered differently on each`);
      return `Both phones have scored this round: ${parts.join(', ')}.`;
    }
  }
}
