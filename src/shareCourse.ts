import type { Hole, SavedCourse } from './types';
import { uid } from './storage';
import { toPayload, fromPayload } from './shareLink';
import { validSlope, validRating } from './games/courseHandicap';

/**
 * A saved course packed into a link, the same way a round is.
 *
 * This is the other half of the course-accuracy work. Search returns open
 * community data that is sometimes wrong, so Press asks you to check an
 * imported scorecard against the real one and keeps your copy once you have
 * vouched for it. But that checking is done once, by one person, and then the
 * other three in the group each do it again on their own phone — or worse,
 * don't, and play the round on numbers nobody read.
 *
 * A course is tiny next to a round: a name, a par and a rank per hole, and the
 * slope and rating if they are known. That makes for a QR code far smaller
 * than a round's, which is the point — this is the one you hold up on the
 * first tee.
 *
 * The course's id is deliberately *not* carried. An id here means "this record
 * on this phone", and two people who saved the same course from search have
 * different ones; matching an arriving course to a local one by id would
 * therefore never fire, and carrying the sender's id would let their record
 * silently overwrite a differently-edited one of yours. Matching is by name,
 * where it belongs — see `courseClash`.
 */

/** Bumped only when the packed shape changes in a way an older reader would get wrong. */
export const COURSE_FORMAT = 1;

/** `[par, strokeIndex]` — the hole's number is its position, always 1..N. */
type PackedHole = [number, number | null];

interface PackedCourse {
  v: number;
  n: string;
  h: PackedHole[];
  sl?: number;
  ra?: number;
}

/** A course name longer than this is not a name, it is a paste accident. */
const MAX_NAME = 80;
/** Nobody shares a 400-hole course; this is the bound on a hostile payload. */
const MAX_HOLES = 72;

export function packCourse(course: SavedCourse): PackedCourse {
  const packed: PackedCourse = {
    v: COURSE_FORMAT,
    n: course.name,
    h: course.holes.map((h) => [h.par, h.strokeIndex ?? null]),
  };
  if (validSlope(course.slope)) packed.sl = course.slope;
  if (validRating(course.rating, course.holes.length)) packed.ra = course.rating;
  return packed;
}

export type CourseResult = { ok: true; course: SavedCourse } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Rebuilds a course from a packed object. Never throws.
 *
 * What comes out is assembled field by field from values that have been
 * checked, rather than cast — this arrives as text from someone else's phone,
 * and a par of `"four"` would reach every net score in the round. Note that
 * nothing here judges whether the numbers are *plausible*: that is
 * `scorecardIssues`' job, and it is advisory on purpose, because plenty of odd
 * scorecards are simply unusual and the person holding the card gets to decide.
 * This only refuses what is not a scorecard at all.
 */
export function unpackCourse(raw: unknown): CourseResult {
  const damaged: CourseResult = { ok: false, error: 'That link is damaged.' };
  if (!isObject(raw)) return damaged;
  if (typeof raw.v !== 'number' || raw.v > COURSE_FORMAT) {
    return { ok: false, error: 'That link was made by a newer version of Press. Update the app and try again.' };
  }
  if (typeof raw.n !== 'string' || !raw.n.trim() || raw.n.length > MAX_NAME) return damaged;
  if (!Array.isArray(raw.h) || raw.h.length === 0 || raw.h.length > MAX_HOLES) return damaged;

  const holes: Hole[] = [];
  for (let i = 0; i < raw.h.length; i += 1) {
    const entry = raw.h[i];
    if (!Array.isArray(entry) || !Number.isInteger(entry[0])) return damaged;
    const hole: Hole = { number: i + 1, par: entry[0] as number };
    if (Number.isInteger(entry[1])) hole.strokeIndex = entry[1] as number;
    holes.push(hole);
  }

  const course: SavedCourse = { id: uid(), name: raw.n.trim(), holes };
  // Slope and rating are load-bearing — they turn a Handicap Index into
  // strokes — so an implausible one is dropped rather than carried. The course
  // is still worth having; it just falls back to typed-in handicaps.
  if (validSlope(raw.sl)) course.slope = raw.sl;
  if (validRating(raw.ra, holes.length)) course.rating = raw.ra;
  return { ok: true, course };
}

export async function encodeCourse(course: SavedCourse): Promise<string> {
  return toPayload(packCourse(course));
}

export async function decodeCourse(payload: string): Promise<CourseResult> {
  const raw = await fromPayload(payload);
  if (raw === null) return { ok: false, error: 'That link is damaged or incomplete.' };
  return unpackCourse(raw);
}

/* ------------------------------------------------------------------ *
 * Meeting a course you already have
 * ------------------------------------------------------------------ */

export type CourseClash =
  /** Nothing here by that name. */
  | { kind: 'new' }
  /** Same name, same card. Nothing to decide. */
  | { kind: 'same'; mine: SavedCourse }
  /** Same name, different numbers — the one case worth asking about. */
  | { kind: 'differs'; mine: SavedCourse; changes: string[] };

/** True when two cards are the same scorecard, field for field. */
function sameCard(a: SavedCourse, b: SavedCourse): boolean {
  if (a.holes.length !== b.holes.length) return false;
  if (a.slope !== b.slope || a.rating !== b.rating) return false;
  return a.holes.every(
    (h, i) => h.par === b.holes[i].par && (h.strokeIndex ?? null) === (b.holes[i].strokeIndex ?? null)
  );
}

/**
 * What an arriving course means for the ones already saved here.
 *
 * Matched by name, case-insensitively and ignoring surrounding space, because
 * that is how a person identifies a course and how `Setup` already decides
 * whether saving a favourite is an edit or a new entry.
 */
export function courseClash(incoming: SavedCourse, mine: SavedCourse[]): CourseClash {
  const key = incoming.name.trim().toLowerCase();
  const existing = mine.find((c) => c.name.trim().toLowerCase() === key);
  if (!existing) return { kind: 'new' };
  if (sameCard(existing, incoming)) return { kind: 'same', mine: existing };
  return { kind: 'differs', mine: existing, changes: describeChanges(existing, incoming) };
}

/**
 * What is actually different between two cards of the same name, in the terms
 * somebody would check against the real scorecard.
 *
 * Named rather than counted: "3 differences" tells you nothing you can act on,
 * while "par differs on holes 4 and 12" is something you can settle by looking
 * at the card in your pocket.
 */
export function describeChanges(mine: SavedCourse, theirs: SavedCourse): string[] {
  const out: string[] = [];
  if (mine.holes.length !== theirs.holes.length) {
    out.push(`Yours has ${mine.holes.length} holes, theirs has ${theirs.holes.length}.`);
    return out;
  }

  const list = (ns: number[]) =>
    ns.length === 1 ? `hole ${ns[0]}` : `holes ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;

  const pars = mine.holes.filter((h, i) => h.par !== theirs.holes[i].par).map((h) => h.number);
  const ranks = mine.holes
    .filter((h, i) => (h.strokeIndex ?? null) !== (theirs.holes[i].strokeIndex ?? null))
    .map((h) => h.number);

  if (pars.length) out.push(`Par differs on ${list(pars)}.`);
  if (ranks.length) out.push(`Stroke index differs on ${list(ranks)}.`);
  if (mine.slope !== theirs.slope) {
    out.push(`Slope: yours ${mine.slope ?? 'not set'}, theirs ${theirs.slope ?? 'not set'}.`);
  }
  if (mine.rating !== theirs.rating) {
    out.push(`Rating: yours ${mine.rating ?? 'not set'}, theirs ${theirs.rating ?? 'not set'}.`);
  }
  return out;
}

/** The arriving course under a name that will not be mistaken for yours. */
export function asSeparateCourse(incoming: SavedCourse, mine: SavedCourse[]): SavedCourse {
  const taken = new Set(mine.map((c) => c.name.trim().toLowerCase()));
  let name = `${incoming.name} (sent)`;
  let n = 2;
  while (taken.has(name.trim().toLowerCase())) {
    name = `${incoming.name} (sent ${n})`;
    n += 1;
  }
  return { ...incoming, id: uid(), name };
}
