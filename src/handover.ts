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

/** One entry on the card: this hole, this player, by position rather than id. */
type Cell = string;

/**
 * Everything a round holds that the other copy might not, keyed by hole number
 * and the player's position in the list.
 *
 * By position because the two copies do not agree on player ids and never
 * will: a round rebuilt from a link carries `p0`, `p1` …, while the phone that
 * first scored it carries whatever `uid()` produced. Packing preserves the
 * order of the players, so position is the one identifier both sides share.
 *
 * Junk counts here alongside scores, and has to. It is the one thing on the
 * card that cannot be derived from anything else — nobody can work a sandie
 * out from a 4 — so a copy that has one and a copy that does not are not the
 * same round. Compared on scores alone they read as identical, and accepting
 * the arriving copy, or declining it, throws the claim away without a word.
 * Values are strings so both kinds of entry compare the same way.
 */
function cells(round: Round): Map<Cell, string> {
  const at = new Map(round.players.map((p, i) => [p.id, i]));
  const out = new Map<Cell, string>();
  for (const [hole, byPlayer] of Object.entries(round.scores ?? {})) {
    for (const [id, score] of Object.entries(byPlayer)) {
      const position = at.get(id);
      if (position === undefined || typeof score !== 'number') continue;
      out.set(`s:${hole}:${position}`, String(score));
    }
  }
  for (const [hole, byPlayer] of Object.entries(round.junk ?? {})) {
    for (const [id, kinds] of Object.entries(byPlayer)) {
      const position = at.get(id);
      if (position === undefined || !Array.isArray(kinds) || kinds.length === 0) continue;
      // Sorted, so the same claims tapped in a different order on each phone
      // are the same entry rather than a disagreement.
      out.set(`j:${hole}:${position}`, [...kinds].sort().join(','));
    }
  }
  // A pick-up changes who won a league hole without changing the score (it
  // is recorded as a 9 either way), so two copies that differ only here are
  // not the same round.
  for (const [hole, ids] of Object.entries(round.pickups ?? {})) {
    for (const id of ids) {
      const position = at.get(id);
      if (position !== undefined) out.set(`x:${hole}:${position}`, 'X');
    }
  }
  return out;
}

export interface Comparison {
  /** Entries on the arriving copy that this device does not have. */
  theirsOnly: number;
  /** Entries here that the arriving copy does not have. */
  mineOnly: number;
  /** Entries both copies hold, differently — a correction on one side or the other. */
  differing: number;
  /**
   * Things that are not entries on the card but change what it is worth —
   * stakes, handicaps, a press, a Wolf call, a game set to gross — that the
   * two copies disagree on. Counted separately because the wording differs:
   * these are "settings", and a stake changed on one phone is not an entry
   * the other phone lacks.
   */
  settings: number;
}

/**
 * Everything about a round that is not a cell of the card and that changes
 * the result: players' handicaps and Indexes, the stakes and per-game options,
 * the teams, the presses and the Wolf calls. Two copies with identical scores
 * and a corrected handicap used to read as "exactly the same round", with no
 * way to take the correction.
 *
 * Player ids are mapped to positions, as in `cells`, for the same reason.
 */
function settings(round: Round): Map<string, string> {
  const at = new Map(round.players.map((p, i) => [p.id, i]));
  const pos = (id: string) => String(at.get(id) ?? '?');
  const out = new Map<string, string>();
  const o = round.options;
  round.players.forEach((p, i) => out.set(`hcp:${i}`, `${p.handicap ?? ''}/${p.index ?? ''}`));
  out.set('games', [...round.games].sort().join(','));
  out.set('useNet', String(o.useNet));
  out.set('stableford', o.stablefordMode);
  out.set('wolfx', `${o.loneWolfMultiplier}/${o.blindWolfMultiplier}`);
  out.set('autoPress', String(o.autoPress ?? false));
  out.set('vegasFlip', String(o.vegasFlip ?? true));
  for (const [g, v] of Object.entries(o.stakes ?? {})) if (v) out.set(`stake:${g}`, String(v));
  for (const [g, v] of Object.entries(o.netByGame ?? {})) out.set(`net:${g}`, String(v));
  for (const [g, v] of Object.entries(o.allowanceByGame ?? {})) out.set(`allow:${g}`, String(v));
  for (const key of ['nassau', 'matchPlay', 'vegas'] as const) {
    const t = o[key];
    if (t) out.set(`teams:${key}`, `${t.mode}:${t.teamA.map(pos).join('+')}v${t.teamB.map(pos).join('+')}`);
  }
  out.set('presses', [...(round.presses ?? [])].sort((a, b) => a - b).join(','));
  for (const [hole, w] of Object.entries(round.wolf ?? {})) {
    if (!w?.choice) continue;
    const c = w.choice;
    out.set(`wolf:${hole}`, `${pos(w.wolfPlayerId)}:${c.type}${c.type === 'partner' ? `:${pos(c.partnerId)}` : ''}`);
  }
  // `ratingHoles` is normalised to what it means: absent is "the holes
  // played", and a link drops it when it says that, so the two copies have
  // to compare equal either way.
  out.set('rating', `${round.slope ?? ''}/${round.rating ?? ''}/${round.ratingHoles ?? round.holes.length}`);
  return out;
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
  const diff: Comparison = { theirsOnly: 0, mineOnly: 0, differing: 0, settings: 0 };

  for (const [cell, score] of theirs) {
    if (!ours.has(cell)) diff.theirsOnly += 1;
    else if (ours.get(cell) !== score) diff.differing += 1;
  }
  for (const cell of ours.keys()) if (!theirs.has(cell)) diff.mineOnly += 1;

  const theirSettings = settings(incoming);
  const ourSettings = settings(mine);
  for (const [key, value] of theirSettings) if (ourSettings.get(key) !== value) diff.settings += 1;
  for (const key of ourSettings.keys()) if (!theirSettings.has(key)) diff.settings += 1;

  if (diff.theirsOnly === 0 && diff.mineOnly === 0 && diff.differing === 0) {
    if (diff.settings === 0) return { kind: 'same' };
    // Same card, different settings. Nothing on the card says which copy is
    // the corrected one, so the one written more recently is taken to be —
    // and either way the user is shown both choices.
    return incoming.updatedAt >= mine.updatedAt ? { kind: 'ahead', diff } : { kind: 'behind', diff };
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
  // "Entry", not "score": a claimed greenie is one of these too, and calling
  // it a score would be wrong in exactly the round that needed the warning.
  const holes = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
  // Named so the user knows what kind of thing changed: a stake, a handicap,
  // a press or a Wolf call is not a score, and would be looked for in the
  // wrong place.
  const settingsNote = (n: number) =>
    n ? `${n} ${n === 1 ? 'setting' : 'settings'} — stakes, handicaps, presses or Wolf calls —` : '';
  switch (arrival.kind) {
    case 'new':
      return '';
    case 'same':
      return 'You already have this round, exactly as it is here.';
    case 'ahead': {
      const { theirsOnly, settings } = arrival.diff;
      if (!theirsOnly) return `The copy you were sent has ${settingsNote(settings)} set differently from yours.`;
      const and = settings ? `, and ${settingsNote(settings)} set differently` : '';
      return `The copy you were sent has ${holes(theirsOnly)} yours doesn’t${and}.`;
    }
    case 'behind': {
      const { mineOnly, settings } = arrival.diff;
      if (!mineOnly) return `Your copy has ${settingsNote(settings)} set differently from the one you were sent.`;
      const and = settings ? `, and ${settingsNote(settings)} set differently` : '';
      return `Your copy has ${holes(mineOnly)} the one you were sent doesn’t${and}.`;
    }
    case 'diverged': {
      const { mineOnly, theirsOnly, differing, settings } = arrival.diff;
      const parts: string[] = [];
      if (theirsOnly) parts.push(`${holes(theirsOnly)} only on the copy you were sent`);
      if (mineOnly) parts.push(`${holes(mineOnly)} only on yours`);
      if (differing) parts.push(`${differing} entered differently on each`);
      if (settings) parts.push(`${settingsNote(settings)} set differently`);
      return `Both phones have been used on this round: ${parts.join(', ')}.`;
    }
  }
}
