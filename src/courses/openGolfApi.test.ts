import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchCourses, fetchCourse, COURSE_REQUEST_TIMEOUT_MS } from './openGolfApi';

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
    await expect(searchCourses('pebble')).rejects.toThrow('Search failed (503)');
  });

  it('stops waiting after 8 seconds and says so', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang);
    const pending = searchCourses('pebble');
    const asserted = expect(pending).rejects.toThrow(/taking too long/);
    await vi.advanceTimersByTimeAsync(COURSE_REQUEST_TIMEOUT_MS);
    await asserted;
  });

  it('times out a scorecard fetch the same way', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang);
    const pending = fetchCourse('course-1');
    const asserted = expect(pending).rejects.toThrow(/taking too long/);
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
