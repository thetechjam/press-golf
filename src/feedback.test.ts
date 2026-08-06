import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildFeedback, enqueue, listQueue, flushQueue } from './feedback';
import type { QueuedFeedback, FeedbackContext } from './feedback';
import { makeRound, player } from './games/testFixtures';

// Vitest runs in node — back localStorage with a Map, per storage.test.ts.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const round = makeRound({
  players: [player('p1', 'Zebediah', 10), player('p2', 'Quintus', 4)],
});

const ctx = (over: Partial<FeedbackContext> = {}): FeedbackContext => ({
  screen: 'play',
  version: '9.9.9',
  userAgent: 'TestAgent/1.0',
  viewport: '375x812',
  ...over,
});

const draft = (over = {}) => ({
  kind: 'bug' as const,
  reporter: 'Bo',
  message: 'Skins look wrong',
  includeRound: false,
  ...over,
});

describe('buildFeedback — the privacy line', () => {
  it('omits the round when not opted in', () => {
    expect(buildFeedback(draft(), ctx({ round })).round).toBe('');
  });

  it('includes the round when opted in', () => {
    const e = buildFeedback(draft({ includeRound: true }), ctx({ round }));
    expect(e.round).toContain('Zebediah');
  });

  it('omits the round when opted in but no round is in context', () => {
    expect(buildFeedback(draft({ includeRound: true }), ctx()).round).toBe('');
  });

  // The regression guard: diagnostics must never carry third-party data,
  // whatever the opt-in says.
  it('never puts player names in diagnostics', () => {
    for (const include of [false, true]) {
      const e = buildFeedback(draft({ includeRound: include }), ctx({ round }));
      expect(e.diagnostics).not.toContain('Zebediah');
      expect(e.diagnostics).not.toContain('Quintus');
    }
  });

  it('carries the technical context', () => {
    const d = JSON.parse(buildFeedback(draft(), ctx()).diagnostics);
    expect(d).toEqual({
      screen: 'play',
      version: '9.9.9',
      userAgent: 'TestAgent/1.0',
      viewport: '375x812',
    });
  });
});

describe('buildFeedback — fields', () => {
  it('accepts a blank reporter', () => {
    expect(buildFeedback(draft({ reporter: '' }), ctx()).reporter).toBe('');
  });

  it('trims reporter and message', () => {
    const e = buildFeedback(draft({ reporter: '  Bo  ', message: '  hi  ' }), ctx());
    expect(e.reporter).toBe('Bo');
    expect(e.message).toBe('hi');
  });
});

describe('queue', () => {
  beforeEach(() => store.clear());

  it('starts empty and round-trips an entry', () => {
    expect(listQueue()).toEqual([]);
    enqueue(buildFeedback(draft(), ctx()));
    expect(listQueue()).toHaveLength(1);
  });

  it('caps at 20, dropping the oldest', () => {
    for (let i = 0; i < 21; i++) {
      enqueue(buildFeedback(draft({ message: `m${i}` }), ctx()));
    }
    const q = listQueue();
    expect(q).toHaveLength(20);
    expect(q[0].message).toBe('m1');
    expect(q[19].message).toBe('m20');
  });
});

describe('flushQueue', () => {
  beforeEach(() => store.clear());

  const seed = (n: number) => {
    for (let i = 0; i < n; i++) enqueue(buildFeedback(draft({ message: `m${i}` }), ctx()));
  };

  it('empties the queue when every post succeeds', async () => {
    seed(3);
    const res = await flushQueue(async () => {});
    expect(res).toEqual({ sent: 3, remaining: 0 });
    expect(listQueue()).toEqual([]);
  });

  it('keeps entries and counts attempts when posting fails', async () => {
    seed(2);
    const res = await flushQueue(async () => {
      throw new Error('offline');
    });
    expect(res).toEqual({ sent: 0, remaining: 2 });
    expect(listQueue().map((e) => e.attempts)).toEqual([1, 1]);
  });

  it('sends what it can and keeps the rest', async () => {
    seed(3);
    const res = await flushQueue(async (e: QueuedFeedback) => {
      if (e.message === 'm1') throw new Error('nope');
    });
    expect(res).toEqual({ sent: 2, remaining: 1 });
    expect(listQueue()[0].message).toBe('m1');
  });

  // Regression guard for the lost-write race: an entry enqueued mid-flush
  // (while the snapshot's post is in flight) must survive the final write,
  // not be clobbered by a queue-empty snapshot taken before it existed.
  it('preserves an entry enqueued while a post is in flight', async () => {
    seed(1);
    const late = buildFeedback(draft({ message: 'arrived-mid-flush' }), ctx());

    const res = await flushQueue(async () => {
      // Simulate a concurrent caller (e.g. the user hitting Send) writing to
      // the queue while this flush's single post is still awaiting.
      enqueue(late);
    });

    expect(res).toEqual({ sent: 1, remaining: 0 });
    const q = listQueue();
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe(late.id);
    expect(q[0].message).toBe('arrived-mid-flush');
  });
});
