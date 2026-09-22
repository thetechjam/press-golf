import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { liveRound, standingLine } from './roundSummary';
import { makeRound, holes18, player, scoresFrom } from './games/testFixtures';

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

describe('standingLine', () => {
  const hs = holes18();
  const trio = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')];
  // Al 72, Bo 75, Cy 78 at $5 stroke play: Al +10, Bo −5, Cy −5.
  const scores = scoresFrom(hs, {
    p1: Array(18).fill(4),
    p2: Array(18).fill(4).map((v, i) => (i === 0 ? 7 : v)),
    p3: Array(18).fill(4).map((v, i) => (i === 0 ? 10 : v)),
  });
  const staked = (status: Round['status']) =>
    makeRound({
      players: trio,
      holes: hs,
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      scores,
      status,
    });

  it('names the winner and the loser of a finished staked round', () => {
    expect(standingLine(staked('finished'))).toEqual({
      text: 'Al won $10 · Bo & Cy paid $5',
      up: 'Al won $10',
      down: 'Bo & Cy paid $5',
    });
  });

  it('says up and down while the round is still going', () => {
    expect(standingLine(staked('in_progress'))?.text).toBe('Al up $10 · Bo & Cy down $5');
  });

  it('has nothing to say before a hole is complete', () => {
    expect(standingLine(makeRound({ games: ['skins'] }))).toBeNull();
  });

  it("falls back to the first game's own status with no stake", () => {
    const r = makeRound({ players: trio, holes: hs, games: ['strokePlay'], scores, status: 'finished' });
    const line = standingLine(r);
    expect(line?.text.startsWith('Stroke Play')).toBe(true);
    expect(line?.up).toBeUndefined();
  });
});
