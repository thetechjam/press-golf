import { describe, expect, it } from 'vitest';
import { chipRange, nextValue, overflowRange, SCORE_MAX, SCORE_MIN } from './scoreChips';

describe('chipRange', () => {
  it('centres on par for a par 4', () => {
    expect(chipRange(4)).toEqual([3, 4, 5, 6, 7]);
  });

  it('centres on par for a par 3', () => {
    expect(chipRange(3)).toEqual([2, 3, 4, 5, 6]);
  });

  it('centres on par for a par 5', () => {
    expect(chipRange(5)).toEqual([4, 5, 6, 7, 8]);
  });

  it('centres on par for a par 6', () => {
    expect(chipRange(6)).toEqual([5, 6, 7, 8, 9]);
  });

  it('always returns five chips, so the row never reflows between holes', () => {
    for (const par of [2, 3, 4, 5, 6]) {
      expect(chipRange(par)).toHaveLength(5);
    }
  });

  it('never offers a score below 1', () => {
    expect(chipRange(2)[0]).toBe(SCORE_MIN);
    expect(Math.min(...chipRange(2))).toBeGreaterThanOrEqual(SCORE_MIN);
  });
});

describe('nextValue', () => {
  it('sets the tapped score when nothing is entered', () => {
    expect(nextValue(null, 5)).toBe(5);
  });

  it('replaces a different score', () => {
    expect(nextValue(4, 6)).toBe(6);
  });

  it('clears when the selected chip is tapped again', () => {
    // null is load-bearing: it drives every unentered-score guardrail.
    expect(nextValue(5, 5)).toBeNull();
  });
});

describe('overflowRange', () => {
  it('offers every legal score', () => {
    expect(overflowRange()).toHaveLength(SCORE_MAX - SCORE_MIN + 1);
    expect(overflowRange()[0]).toBe(1);
    expect(overflowRange().at(-1)).toBe(15);
  });
});
