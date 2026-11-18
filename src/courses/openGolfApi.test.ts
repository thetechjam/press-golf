import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  searchCourses,
  fetchCourse,
  COURSE_REQUEST_TIMEOUT_MS,
  CourseTimeoutError,
  MAX_TEES,
} from './openGolfApi';

/** A fetch that never answers, and rejects once its signal aborts. */
function hang(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener('abort', abort);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OpenGolfAPI requests', () => {
  it('returns what a quick search answered', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        courses: [{ id: '1', name: 'Pebble Beach', city: 'Pebble Beach', state: 'CA', par: 72 }],
      }),
    }));
    const hits = await searchCourses('pebble');
    expect(hits).toEqual([
      { id: '1', name: 'Pebble Beach', city: 'Pebble Beach', state: 'CA', par: 72 },
    ]);
  });

  it('says when the search itself failed', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const failed = searchCourses('pebble');
    await expect(failed).rejects.toThrow('Search failed (503)');
    // Not a timeout, so the screen does not show this message as is.
    await expect(failed).rejects.not.toBeInstanceOf(CourseTimeoutError);
  });

  it('stops waiting after 8 seconds and says so', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang);
    const pending = searchCourses('pebble');
    const asserted = expect(pending).rejects.toThrow(/^Course search is taking too long/);
    await vi.advanceTimersByTimeAsync(COURSE_REQUEST_TIMEOUT_MS);
    await expect(pending).rejects.toBeInstanceOf(CourseTimeoutError);
    await asserted;
  });

  it('times out a scorecard fetch the same way', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang);
    const pending = fetchCourse('course-1');
    // Its own words: this is a scorecard, not a search.
    const asserted = expect(pending).rejects.toThrow(/^Loading that course is taking too long/);
    await vi.advanceTimersByTimeAsync(COURSE_REQUEST_TIMEOUT_MS);
    await asserted;
  });

  it('does not call a search the caller cancelled a timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang);
    const ctrl = new AbortController();
    const pending = searchCourses('pebble', ctrl.signal);
    const asserted = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    ctrl.abort();
    await asserted;
  });
});

/**
 * Trimmed from a real record (Delcastle Golf Course): the fields Press reads,
 * in the shape the service sends them. The holes are cut to three because the
 * tees and the stated par are what these tests are about.
 */
const DELCASTLE = {
  id: '106788fd-cce2-4cd5-b6e1-501f18836de9',
  course_name: 'Delcastle Golf Course',
  par: 72,
  tees: [
    { tee_key: 'blue-male', tee_name: 'Blue', tee_color: 'blue', gender: 'Male', course_rating: 70.8, slope: 121, par: 72, yardage: 6625 },
    { tee_key: 'white-male', tee_name: 'White', tee_color: 'white', gender: 'Male', course_rating: 69.4, slope: 118, par: 72, yardage: 6326 },
    { tee_key: 'gold-male', tee_name: 'Gold', tee_color: 'gold', gender: 'Male', course_rating: 65.3, slope: 108, par: 72, yardage: 5475 },
    { tee_key: 'red-male', tee_name: 'Red', tee_color: 'red', gender: 'Male', course_rating: 70.2, slope: 116, par: 72, yardage: 5369 },
  ],
  holes_data: [
    { number: 1, par: 5, handicap_index: 15 },
    { number: 2, par: 5, handicap_index: 9 },
    { number: 3, par: 5, handicap_index: 1 },
  ],
};

const answering = (body: unknown) =>
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => body }));

describe('what a course record says beyond its holes', () => {
  it('returns the par the record states', async () => {
    answering(DELCASTLE);
    expect((await fetchCourse('d')).par).toBe(72);
  });

  it('leaves out a stated par that is not a whole-course number', async () => {
    for (const par of [null, '72', 72.5, 0, 4, 400]) {
      answering({ ...DELCASTLE, par });
      expect((await fetchCourse('d')).par).toBeUndefined();
    }
  });

  it('reads every usable tee, in the order the record lists them', async () => {
    answering(DELCASTLE);
    const { tees } = await fetchCourse('d');
    expect(tees).toEqual([
      { key: 'blue-male', name: 'Blue', gender: 'Male', rating: 70.8, slope: 121, yardage: 6625 },
      { key: 'white-male', name: 'White', gender: 'Male', rating: 69.4, slope: 118, yardage: 6326 },
      { key: 'gold-male', name: 'Gold', gender: 'Male', rating: 65.3, slope: 108, yardage: 5475 },
      { key: 'red-male', name: 'Red', gender: 'Male', rating: 70.2, slope: 116, yardage: 5369 },
    ]);
  });

  it('has no tees, rather than failing, when the record has none', async () => {
    for (const tees of [undefined, null, {}, 'Blue', []]) {
      answering({ ...DELCASTLE, tees });
      const course = await fetchCourse('d');
      expect(course.tees).toEqual([]);
      expect(course.holes).toHaveLength(3);
    }
  });

  it('drops a tee whose slope or rating could not be real, and keeps the rest', async () => {
    const [blue, white] = DELCASTLE.tees;
    answering({
      ...DELCASTLE,
      tees: [
        { ...blue, slope: 0 },
        { ...blue, tee_key: 'b2', slope: 160 },
        { ...blue, tee_key: 'b3', course_rating: '70.8' },
        { ...blue, tee_key: 'b4', course_rating: 7.08 },
        { ...blue, tee_key: 'b5', course_rating: null },
        null,
        'White',
        42,
        white,
      ],
    });
    expect((await fetchCourse('d')).tees.map((t) => t.key)).toEqual(['white-male']);
  });

  it('keeps a nine-hole rating as well as an eighteen-hole one', async () => {
    answering({ ...DELCASTLE, tees: [{ tee_name: 'Blue', course_rating: 34.6, slope: 117 }] });
    expect((await fetchCourse('d')).tees[0]).toMatchObject({ name: 'Blue', rating: 34.6 });
  });

  it('patches a tee with no name or key rather than dropping it', async () => {
    answering({
      ...DELCASTLE,
      tees: [
        { tee_color: 'green', course_rating: 66, slope: 110 },
        { course_rating: 64, slope: 105, yardage: -1, gender: 7 },
      ],
    });
    const tees = (await fetchCourse('d')).tees;
    expect(tees.map((t) => t.name)).toEqual(['green', 'Tee 2']);
    expect(new Set(tees.map((t) => t.key)).size).toBe(2);
    expect(tees[1].yardage).toBeUndefined();
    expect(tees[1].gender).toBeUndefined();
  });

  it('gives two tees under one key keys of their own', async () => {
    const [blue] = DELCASTLE.tees;
    answering({ ...DELCASTLE, tees: [blue, { ...blue, gender: 'Female', course_rating: 75.1, slope: 130 }] });
    const keys = (await fetchCourse('d')).tees.map((t) => t.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('stops at a picker’s worth of tees', async () => {
    const [blue] = DELCASTLE.tees;
    answering({
      ...DELCASTLE,
      tees: Array.from({ length: 20 }, (_, i) => ({ ...blue, tee_key: `t${i}` })),
    });
    expect((await fetchCourse('d')).tees).toHaveLength(MAX_TEES);
  });
});
