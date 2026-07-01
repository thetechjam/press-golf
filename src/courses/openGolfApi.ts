// Live course lookup via OpenGolfAPI (https://opengolfapi.org).
// Keyless, CORS-enabled open data (ODbL), so the client can call it directly —
// no backend, no API key. Used at setup time to pre-fill pars + stroke indexes.
// Favorite Courses remains the offline fallback and covers anything not here.

import type { Hole } from '../types';

const BASE = 'https://api.opengolfapi.org';

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
}

/** Search courses by name. Returns lightweight hits (no scorecard yet). */
export async function searchCourses(q: string, signal?: AbortSignal): Promise<CourseHit[]> {
  const res = await fetch(`${BASE}/v1/courses/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
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

/** Fetch one course's full scorecard (par + stroke index per hole). */
export async function fetchCourse(id: string, signal?: AbortSignal): Promise<FetchedCourse> {
  const res = await fetch(`${BASE}/api/v1/courses/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(`Course lookup failed (${res.status})`);
  const data = await res.json();

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
  return { id, name: String(data.course_name ?? data.name ?? ''), holes, hasStrokeIndex };
}

/**
 * Slice a fetched scorecard to `count` holes and renumber 1..count.
 * When every selected hole has a stroke index, re-rank those indexes into
 * 1..count (hardest = 1) so handicap allocation is correct on a partial course
 * (e.g. front 9 of an 18-hole card). If any is missing, stroke indexes are
 * dropped entirely — handicap.ts requires a full set or it ignores them.
 */
export function sliceCourseHoles(holes: Hole[], count: number): Hole[] {
  const sliced = holes.slice(0, count).map((h, i) => ({
    number: i + 1,
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
