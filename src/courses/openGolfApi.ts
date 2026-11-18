// Live course lookup via OpenGolfAPI (https://opengolfapi.org).
// Keyless, CORS-enabled open data (ODbL), so the client can call it directly —
// no backend, no API key. Used at setup time to pre-fill pars + stroke indexes.
// Favorite Courses remains the offline fallback and covers anything not here.

import type { Hole } from '../types';
import { validSlope, validRating } from '../games/courseHandicap';

const BASE = 'https://api.opengolfapi.org';

/** How long a search or a scorecard fetch is allowed to sit with no answer. */
export const COURSE_REQUEST_TIMEOUT_MS = 8000;

/**
 * A lookup that failed. The message carries the HTTP status for logs and bug
 * reports; it is not written for the screen, which has its own words for a
 * service that is down.
 */
export class CourseRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseRequestError';
  }
}

/**
 * A lookup that got no answer in time. The one failure whose message is meant
 * to be shown as is, because it tells the user something they can act on.
 */
export class CourseTimeoutError extends CourseRequestError {
  constructor(message: string) {
    super(message);
    this.name = 'CourseTimeoutError';
  }
}

const SEARCH_TIMEOUT_MESSAGE =
  'Course search is taking too long. Check your connection and try again.';
const COURSE_TIMEOUT_MESSAGE =
  'Loading that course is taking too long. Check your connection and try again.';

/**
 * Abort the request after {@link COURSE_REQUEST_TIMEOUT_MS}, and also when
 * the caller does. The caller's abort is theirs — typing on past a search —
 * and must not be reported as a timeout.
 */
function withTimeout(parent?: AbortSignal): {
  signal: AbortSignal;
  done: () => void;
  timedOut: () => boolean;
} {
  const ctrl = new AbortController();
  let timed = false;
  const timer = setTimeout(() => {
    timed = true;
    ctrl.abort();
  }, COURSE_REQUEST_TIMEOUT_MS);
  const onParent = () => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener('abort', onParent);
  }
  return {
    signal: ctrl.signal,
    timedOut: () => timed && !parent?.aborted,
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParent);
    },
  };
}

async function fetchJson(
  url: string,
  signal: AbortSignal | undefined,
  failure: string,
  timeoutMessage: string
): Promise<unknown> {
  const timed = withTimeout(signal);
  try {
    const res = await fetch(url, { signal: timed.signal });
    if (!res.ok) throw new CourseRequestError(`${failure} (${res.status})`);
    return await res.json();
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timed.timedOut()) throw new CourseTimeoutError(timeoutMessage);
    throw err;
  } finally {
    timed.done();
  }
}

// The two calls below sit on different prefixes — search on `/v1`, the course
// lookup on `/api/v1`. That reads like a typo and is not: both paths are what
// the service answers on, and the pair is confirmed working against the live
// API. Left alone deliberately; "tidying" them onto one prefix breaks
// whichever one gets moved.

export interface CourseHit {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  par: number | null;
}

export interface FetchedCourse {
  id: string;
  name: string;
  /** Full scorecard: par always, strokeIndex (from handicap_index) when the DB has it. */
  holes: Hole[];
  /** True only when every hole has a stroke index — required for net handicap allocation. */
  hasStrokeIndex: boolean;
  /**
   * The par the course record states for itself, separate from the holes.
   * Kept because it is a second opinion on the card: when the holes do not add
   * up to it, one of the two is wrong — see `scorecardIssues`.
   */
  par?: number;
  /** The tees the record lists, each with its own slope and rating. Empty when none are usable. */
  tees: CourseTee[];
}

/** One set of tees off a course record: what a player picks to get slope and rating. */
export interface CourseTee {
  /** Stable within one course — the record's own key when it has one. */
  key: string;
  name: string;
  gender?: string;
  /** Course rating for the whole card the record describes. */
  rating: number;
  slope: number;
  yardage?: number;
}

/**
 * More tees than this is a record listing every combination of every colour,
 * and a picker that long stops being a picker. A real card rated for both men
 * and women runs to nine or ten (Pebble Beach's record lists nine), so the
 * cap sits above that rather than cutting one off.
 */
export const MAX_TEES = 12;

const PLAUSIBLE_TOTAL_PAR = { min: 27, max: 90 };

/** The record's own par, when it is a whole number a nine or an eighteen could add up to. */
function statedPar(v: unknown): number | undefined {
  return typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= PLAUSIBLE_TOTAL_PAR.min &&
    v <= PLAUSIBLE_TOTAL_PAR.max
    ? v
    : undefined;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * The record's tees, read defensively. This is open community data: a tee
 * with a slope of 0, a rating typed as a string, or no name at all is dropped
 * or patched here rather than allowed to fill in a slope and rating that turn
 * every Index into the wrong number of strokes.
 */
export function parseTees(v: unknown): CourseTee[] {
  if (!Array.isArray(v)) return [];
  const tees: CourseTee[] = [];
  const keys = new Set<string>();
  for (const [i, t] of v.entries()) {
    if (tees.length >= MAX_TEES) break;
    if (!t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    const slope = r.slope;
    const rating = r.course_rating;
    // Whole-card ratings: an eighteen's sits near 72, a nine-hole record's
    // near 36. Anything that is neither is not a rating of this course.
    if (!validSlope(slope) || !(validRating(rating, 18) || validRating(rating, 9))) continue;
    const name = text(r.tee_name) ?? text(r.tee_color) ?? `Tee ${i + 1}`;
    const gender = text(r.gender);
    let key = text(r.tee_key) ?? `${name}-${gender ?? ''}`.toLowerCase();
    // Two entries under one key would make picking either highlight both.
    while (keys.has(key)) key = `${key}-${i}`;
    keys.add(key);
    const yardage =
      typeof r.yardage === 'number' && Number.isFinite(r.yardage) && r.yardage > 0 && r.yardage < 10000
        ? Math.round(r.yardage)
        : undefined;
    tees.push({ key, name, ...(gender ? { gender } : {}), rating, slope, ...(yardage ? { yardage } : {}) });
  }
  return tees;
}

/** Search courses by name. Returns lightweight hits (no scorecard yet). */
export async function searchCourses(q: string, signal?: AbortSignal): Promise<CourseHit[]> {
  const data = (await fetchJson(
    `${BASE}/v1/courses/search?q=${encodeURIComponent(q)}`,
    signal,
    'Search failed',
    SEARCH_TIMEOUT_MESSAGE
  )) as { courses?: Record<string, unknown>[] };
  return (data.courses ?? []).map(
    (c: Record<string, unknown>): CourseHit => ({
      id: String(c.id),
      name: String(c.name ?? c.course_name ?? 'Unknown course'),
      city: (c.city as string) ?? null,
      state: (c.state as string) ?? null,
      par: typeof c.par === 'number' ? c.par : null,
    })
  );
}

interface HoleRow {
  number: number;
  par: number;
  handicap_index?: number | null;
}

/** Fetch one course's full scorecard (par + stroke index per hole), its stated par and its tees. */
export async function fetchCourse(id: string, signal?: AbortSignal): Promise<FetchedCourse> {
  const data = (await fetchJson(
    `${BASE}/api/v1/courses/${encodeURIComponent(id)}`,
    signal,
    'Course lookup failed',
    COURSE_TIMEOUT_MESSAGE
  )) as {
    holes_data?: HoleRow[];
    scorecard?: { hole: number; par: number }[];
    course_name?: string;
    name?: string;
    par?: unknown;
    tees?: unknown;
  };

  // Prefer holes_data (has handicap_index); fall back to the par-only scorecard.
  const rows: HoleRow[] = Array.isArray(data.holes_data) && data.holes_data.length
    ? data.holes_data
    : (data.scorecard ?? []).map((h: { hole: number; par: number }) => ({
        number: h.hole,
        par: h.par,
      }));

  const holes: Hole[] = rows
    .filter((h) => typeof h.par === 'number' && typeof h.number === 'number')
    .map((h) => ({
      number: h.number,
      par: h.par,
      strokeIndex:
        typeof h.handicap_index === 'number' && h.handicap_index > 0
          ? h.handicap_index
          : undefined,
    }))
    .sort((a, b) => a.number - b.number);

  const hasStrokeIndex = holes.length > 0 && holes.every((h) => typeof h.strokeIndex === 'number');
  const par = statedPar(data.par);
  return {
    id,
    name: String(data.course_name ?? data.name ?? ''),
    holes,
    hasStrokeIndex,
    ...(par != null ? { par } : {}),
    tees: parseTees(data.tees),
  };
}

/**
 * Slice a fetched scorecard to `count` holes and renumber them.
 * - `nine: 'front'` (default) takes the first `count`, numbered 1..count.
 * - `nine: 'back'` takes the last `count`, numbered 10..(9+count) — so a
 *   back-nine round reads as holes 10–18.
 * When every selected hole has a stroke index, re-rank those indexes into
 * 1..count (hardest = 1) so handicap allocation is correct on a partial course
 * (the back nine's raw indexes are e.g. even-only, and handicap.ts needs a
 * contiguous 1..N set). If any is missing, stroke indexes are dropped entirely —
 * handicap.ts requires a full set or it ignores them.
 */
export function sliceCourseHoles(
  holes: Hole[],
  count: number,
  opts: { nine?: 'front' | 'back' } = {}
): Hole[] {
  const back = opts.nine === 'back';
  const source = back ? holes.slice(-count) : holes.slice(0, count);
  const startNumber = back ? 10 : 1;
  const sliced = source.map((h, i) => ({
    number: startNumber + i,
    par: h.par,
    strokeIndex: h.strokeIndex,
  }));

  const complete =
    sliced.length === count && sliced.every((h) => typeof h.strokeIndex === 'number');
  if (!complete) {
    return sliced.map((h) => ({ number: h.number, par: h.par }));
  }

  const rankByHole = new Map<number, number>();
  [...sliced]
    .sort((a, b) => (a.strokeIndex as number) - (b.strokeIndex as number))
    .forEach((h, i) => rankByHole.set(h.number, i + 1));
  return sliced.map((h) => ({ number: h.number, par: h.par, strokeIndex: rankByHole.get(h.number) }));
}
