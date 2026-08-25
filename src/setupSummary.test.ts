import { describe, it, expect } from 'vitest';
import {
  courseSummary,
  holesSummary,
  gamesSummary,
  stakesSummary,
} from './setupSummary';
import { holes, holes18 } from './games/testFixtures';

describe('courseSummary', () => {
  it('names the course when set', () => {
    expect(courseSummary('Prairie Landing')).toBe('Prairie Landing');
  });

  it('trims before deciding whether it is set', () => {
    expect(courseSummary('   ')).toBe('Not set');
    expect(courseSummary('  Prairie Landing ')).toBe('Prairie Landing');
  });

  it('says Not set when empty', () => {
    expect(courseSummary('')).toBe('Not set');
  });
});

describe('holesSummary', () => {
  it('counts holes and totals par', () => {
    expect(holesSummary(holes18())).toBe('18 holes · par 72');
  });

  it('handles a nine', () => {
    expect(holesSummary(holes(9))).toBe('9 holes · par 36');
  });

  it('reports no holes rather than an empty string', () => {
    expect(holesSummary([])).toBe('No holes');
  });
});

describe('gamesSummary', () => {
  it('names a single game', () => {
    expect(gamesSummary(['skins'])).toBe('Skins');
  });

  it('joins several in selection order', () => {
    expect(gamesSummary(['skins', 'wolf'])).toBe('Skins, Wolf');
  });

  it('says No games when none are selected', () => {
    expect(gamesSummary([])).toBe('No games');
  });
});

describe('stakesSummary', () => {
  it('says No stakes when nothing is staked', () => {
    expect(stakesSummary(['skins'], {})).toBe('No stakes');
  });

  it('treats a zero stake as unstaked', () => {
    // StakesEditor writes 0 when a field is cleared, so 0 and absent must read
    // the same or a cleared field would keep claiming money is on the line.
    expect(stakesSummary(['skins'], { skins: 0 })).toBe('No stakes');
  });

  it('lists staked games with their amounts', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5, wolf: 2 })).toBe(
      '$5 Skins · $2 Wolf'
    );
  });

  it('lists only staked games, skipping the rest', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5 })).toBe('$5 Skins');
  });

  it('ignores stakes for games no longer selected', () => {
    // Deselecting a game leaves its stake behind in options.stakes.
    expect(stakesSummary(['skins'], { skins: 5, wolf: 99 })).toBe('$5 Skins');
  });

  it('keeps a decimal stake readable', () => {
    expect(stakesSummary(['skins'], { skins: 2.5 })).toBe('$2.50 Skins');
  });
});
