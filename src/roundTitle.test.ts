import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { liveRound } from './roundTitle';
import { makeRound, holes18 } from './games/testFixtures';

const NOW = Date.UTC(2026, 8, 22, 18);
const HOUR = 60 * 60 * 1000;

const round = (over: Partial<Round>): Round => ({
  ...makeRound({ holes: holes18() }),
  ...over,
});

describe('liveRound', () => {
  it('offers the newest unfinished round touched in the last day', () => {
    const live = round({ id: 'live', status: 'in_progress', updatedAt: NOW - 2 * HOUR });
    const older = round({ id: 'older', status: 'in_progress', updatedAt: NOW - 3 * HOUR });
    expect(liveRound([live, older], NOW)?.id).toBe('live');
  });

  it('skips finished rounds, however recent', () => {
    const done = round({ id: 'done', status: 'finished', updatedAt: NOW - HOUR });
    const live = round({ id: 'live', status: 'in_progress', updatedAt: NOW - 5 * HOUR });
    expect(liveRound([done, live], NOW)?.id).toBe('live');
  });

  it('leaves a round abandoned days ago in the list', () => {
    const stale = round({ id: 'stale', status: 'in_progress', updatedAt: NOW - 25 * HOUR });
    expect(liveRound([stale], NOW)).toBeUndefined();
  });

  it('is undefined with no rounds', () => {
    expect(liveRound([], NOW)).toBeUndefined();
  });
});
