import type { Round, Hole, GameResult, GameStanding } from '../types';
import { matchSegmentSides, resolveSides, type Side } from './matchPlay';

/** Resolves the two Nassau sides from options (defaults to 1v1, first two players). */
export function nassauTeams(round: Round): { a: Side; b: Side } {
  return resolveSides(round, round.options.nassau);
}

/**
 * "Jesse & Marcus leads 4–0" is wrong — a 2v2 side is a plural subject. The
 * singular-only phrasing shipped because the copy was written against 1v1.
 */
function leadVerb(side: Side): string {
  return side.ids.length > 1 ? 'lead' : 'leads';
}

/** Holes belonging to the same nine as the given hole. */
export function nineHolesFor(round: Round, holeNumber: number): Hole[] {
  const isFront = holeNumber <= 9;
  return round.holes.filter((h) => h.number <= 9 === isFront);
}

/** Last hole number of the nine that contains the given hole. */
export function endOfNine(round: Round, holeNumber: number): number {
  const nine = nineHolesFor(round, holeNumber);
  return nine.length ? nine[nine.length - 1].number : holeNumber;
}

/** A press covers from its start hole through the end of that nine. */
export function pressHoles(round: Round, startHole: number): Hole[] {
  return nineHolesFor(round, startHole).filter((h) => h.number >= startHole);
}

export interface NassauSegment {
  label: string;
  holes: Hole[];
  isPress: boolean;
  /** Fired by the two-down rule rather than tapped. Not removable by hand. */
  isAuto: boolean;
}

/** True when every player has a score on this hole. */
const holeComplete = (round: Round, holeNumber: number): boolean =>
  round.players.every((p) => round.scores[holeNumber]?.[p.id] != null);

/**
 * Hole numbers where the two-down rule starts a press, derived from the card.
 *
 * **Derived, never stored.** A press is a fact about the state of a bet at a
 * moment, so writing these into `round.presses` would leave a press stranded
 * on a hole that is no longer two down the instant somebody corrects a score —
 * and the money would follow the stale one. Recomputing costs nothing and
 * cannot drift.
 *
 * Presses belong to a nine, like every other Nassau bet, so each nine is
 * walked on its own. A press is itself a bet that can go two down and press
 * again, which is the cascade the rule is notorious for, so each new press
 * joins the set being watched. A given bet presses only once: the second press
 * comes from the press, not from the bet that spawned it.
 *
 * Evaluation stops at the first hole that isn't fully scored. "Two down after
 * the 4th" has no meaning if the 4th is blank, and guessing past the gap would
 * invent a bet nobody agreed to.
 */
export function autoPressStarts(round: Round): number[] {
  if (!round.options.autoPress || round.players.length < 2) return [];
  const { a, b } = nassauTeams(round);
  const starts: number[] = [];

  const front = round.holes.filter((h) => h.number <= 9);
  const back = round.holes.filter((h) => h.number > 9);

  for (const nine of [front, back]) {
    if (nine.length === 0) continue;
    // Every bet running on this nine, by the hole it starts from.
    const open = [nine[0].number];
    const spawned = new Set<number>();

    for (let i = 0; i < nine.length; i++) {
      const hole = nine[i];
      if (!holeComplete(round, hole.number)) break;
      const next = nine[i + 1]?.number;
      // A press has to run somewhere; the last hole of a nine has nothing left.
      if (next == null) break;

      for (const segStart of [...open]) {
        if (spawned.has(segStart)) continue;
        const played = nine.filter((h) => h.number >= segStart && h.number <= hole.number);
        const { margin } = matchSegmentSides(round, played, a, b, 'nassau');
        if (Math.abs(margin) < 2) continue;

        spawned.add(segStart);
        if (!starts.includes(next)) starts.push(next);
        if (!open.includes(next)) open.push(next);
      }
    }
  }

  return starts.sort((x, y) => x - y);
}

/** The full set of Nassau bets: base bets plus any presses, called or automatic. */
export function nassauSegments(round: Round): NassauSegment[] {
  const front = round.holes.filter((h) => h.number <= 9);
  const back = round.holes.filter((h) => h.number > 9);
  const segments: NassauSegment[] = back.length
    ? [
        { label: 'Front', holes: front, isPress: false, isAuto: false },
        { label: 'Back', holes: back, isPress: false, isAuto: false },
        { label: 'Total', holes: round.holes, isPress: false, isAuto: false },
      ]
    : [{ label: 'Total', holes: round.holes, isPress: false, isAuto: false }];

  const manual = round.presses ?? [];
  // A hole can be both: the two-down rule fires where somebody had already
  // tapped Press. One bet, not two — deduped so the money isn't doubled.
  const all = [...new Set([...manual, ...autoPressStarts(round)])].sort((x, y) => x - y);

  for (const start of all) {
    segments.push({
      // Dropped the `h` prefix: the board renders labels uppercase, where
      // "PRESS H13–18" read as a typo.
      label: `Press ${start}–${endOfNine(round, start)}`,
      holes: pressHoles(round, start),
      isPress: true,
      isAuto: !manual.includes(start),
    });
  }
  return segments;
}

/** Three match-play bets in one (front / back / total), plus any presses. */
export function computeNassau(round: Round): GameResult {
  if (round.players.length < 2) {
    return {
      gameType: 'nassau',
      title: 'Nassau',
      status: 'Needs 2 players',
      standings: [],
      note: 'Add a second player to start this match.',
    };
  }

  const { a, b } = nassauTeams(round);
  const segments = nassauSegments(round);
  let aWins = 0;
  let bWins = 0;

  const standings: GameStanding[] = segments.map((seg, i) => {
    const res = matchSegmentSides(round, seg.holes, a, b, 'nassau');
    if (res.winner === 'A') aWins += 1;
    else if (res.winner === 'B') bWins += 1;
    return { label: seg.label, detail: res.status, value: i, rank: i + 1, isLeader: false };
  });

  let status: string;
  if (aWins === 0 && bWins === 0) status = 'All bets open';
  else if (aWins > bWins) status = `${a.label} ${leadVerb(a)} ${aWins}–${bWins}`;
  else if (bWins > aWins) status = `${b.label} ${leadVerb(b)} ${bWins}–${aWins}`;
  else status = `Tied ${aWins}–${bWins}`;

  return {
    gameType: 'nassau',
    title: round.options.nassau?.mode === '2v2' ? 'Nassau (2v2)' : 'Nassau',
    status,
    standings,
    note: `${a.label} vs ${b.label}`,
  };
}
