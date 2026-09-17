import type { Hole } from '../types';

/**
 * Whether a set of stroke indexes can actually allocate handicap strokes.
 *
 * A stroke index is a *ranking*: on N holes it has to be each of 1..N exactly
 * once. Handicap allocation reads it that way — a player off 6 gets a shot
 * wherever the index is 6 or lower — so a set that isn't a ranking doesn't
 * merely mislead, it hands out the wrong number of shots and settles the round
 * for the wrong amount, with nothing on screen to say so.
 *
 * Two ways in: a course imported from search (open data, sometimes wrong), and
 * somebody typing the numbers in by hand. Both end up here, which is why this
 * check sits below the UI rather than beside the importer.
 */

export type StrokeIndexProblem =
  /** Some holes have an index and others don't — it says nothing about the set. */
  | { kind: 'partial'; holes: number[] }
  /** An index outside 1..N, which no hole can rank at. */
  | { kind: 'range'; holes: number[] }
  /** The same rank on more than one hole, which leaves another rank unused. */
  | { kind: 'duplicate'; values: number[] };

/**
 * The problem with these stroke indexes, or null when they form a proper
 * 1..N ranking. Holes with no index at all are fine — that is "not set",
 * handled by the caller — but a partial set is reported, because it looks set.
 */
export function strokeIndexProblem(holes: Hole[]): StrokeIndexProblem | null {
  if (holes.length === 0) return null;

  const missing = holes.filter((h) => typeof h.strokeIndex !== 'number');
  if (missing.length === holes.length) return null; // none set at all
  if (missing.length > 0) return { kind: 'partial', holes: missing.map((h) => h.number) };

  const n = holes.length;
  const outOfRange = holes.filter((h) => {
    const si = h.strokeIndex as number;
    return !Number.isInteger(si) || si < 1 || si > n;
  });
  if (outOfRange.length > 0) return { kind: 'range', holes: outOfRange.map((h) => h.number) };

  const seen = new Map<number, number>();
  for (const h of holes) {
    const si = h.strokeIndex as number;
    seen.set(si, (seen.get(si) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([, count]) => count > 1).map(([si]) => si);
  if (repeated.length > 0) return { kind: 'duplicate', values: repeated.sort((a, b) => a - b) };

  return null;
}

/**
 * Ranks used on more than one hole.
 *
 * Split out from `strokeIndexProblem` because it is the only part of the check
 * that survives being handed a *subset* of a course. A front nine lifted out
 * of an eighteen-hole card legitimately carries 1, 3, 5 … 17: those are out of
 * range for nine holes and perfectly correct for where they came from. A rank
 * appearing twice is wrong in any card, whole or partial.
 */
export function duplicateStrokeIndexes(holes: Hole[]): number[] {
  const seen = new Map<number, number>();
  for (const h of holes) {
    if (typeof h.strokeIndex !== 'number') continue;
    seen.set(h.strokeIndex, (seen.get(h.strokeIndex) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([si]) => si)
    .sort((a, b) => a - b);
}

/**
 * How cleanly an eighteen's stroke indexes split odd/even across the nines.
 *
 * The Rules of Handicapping (Appendix E) allocate the odd indexes to one nine
 * and the even to the other, so a player receiving nine shots gets them spread
 * across the round rather than bunched into one half. Which nine takes the odds
 * is not fixed — the allocation is switched when the back nine rates harder —
 * so both directions are correct and only the *mixing* is a signal.
 *
 * It is a signal about provenance rather than about golf. A card ranked
 * 1,2,3…18 straight down the holes satisfies every other check here: it is a
 * complete 1..18 ranking with no duplicates and nothing out of range. It is
 * also not how any course allocates, which makes it far more likely to be a
 * sequence somebody generated than a card somebody measured — and the round
 * would be played on it with every net score and Stableford point computed as
 * if it were real.
 *
 * Returns the size of the dominant parity on the front nine (9 is textbook,
 * 5 is the straight sequence above) or null when the question does not apply:
 * anything that is not a complete, valid eighteen has no nines to split.
 */
export function nineSplit(holes: Hole[]): { matched: number; frontParity: 'odd' | 'even' } | null {
  if (holes.length !== 18 || !strokeIndexesUsable(holes)) return null;
  const front = holes.slice(0, 9).map((h) => h.strokeIndex as number);
  const odd = front.filter((si) => si % 2 === 1).length;
  return odd >= 5
    ? { matched: odd, frontParity: 'odd' }
    : { matched: 9 - odd, frontParity: 'even' };
}

/** True when these stroke indexes are a usable 1..N ranking. */
export function strokeIndexesUsable(holes: Hole[]): boolean {
  return holes.every((h) => typeof h.strokeIndex === 'number') && strokeIndexProblem(holes) === null;
}

const list = (ns: number[]): string => {
  if (ns.length === 1) return `${ns[0]}`;
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
};

/** One sentence naming the problem, for the setup screens to show. */
export function describeStrokeIndexProblem(p: StrokeIndexProblem, holeCount: number): string {
  switch (p.kind) {
    case 'partial':
      return `${p.holes.length === 1 ? 'Hole' : 'Holes'} ${list(p.holes)} ${
        p.holes.length === 1 ? 'has' : 'have'
      } no stroke index.`;
    case 'range':
      return `${p.holes.length === 1 ? 'Hole' : 'Holes'} ${list(p.holes)} ${
        p.holes.length === 1 ? 'has' : 'have'
      } a stroke index outside 1–${holeCount}.`;
    case 'duplicate':
      return `Stroke ${p.values.length === 1 ? 'index' : 'indexes'} ${list(
        p.values
      )} ${p.values.length === 1 ? 'is' : 'are'} used more than once — each hole needs its own rank from 1 to ${holeCount}.`;
  }
}
