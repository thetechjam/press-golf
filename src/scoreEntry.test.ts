import { describe, expect, it } from 'vitest';
import { clampScore } from './scoreEntry';

describe('clampScore', () => {
  it('clears on empty input', () => {
    expect(clampScore('')).toBeNull();
  });

  it('clears on whitespace-only input', () => {
    expect(clampScore('   ')).toBeNull();
  });

  it('rejects 0, clamping up to the minimum of 1', () => {
    expect(clampScore('0')).toBe(1);
  });

  it('rejects 16, clamping down to the maximum of 15', () => {
    expect(clampScore('16')).toBe(15);
  });

  it('accepts the minimum boundary of 1', () => {
    expect(clampScore('1')).toBe(1);
  });

  it('accepts the maximum boundary of 15', () => {
    expect(clampScore('15')).toBe(15);
  });

  it('accepts a mid-range value unchanged', () => {
    expect(clampScore('6')).toBe(6);
  });

  it('rounds a fractional value', () => {
    expect(clampScore('6.7')).toBe(7);
  });

  it('ignores non-numeric input', () => {
    expect(clampScore('abc')).toBeUndefined();
  });

  it('ignores a bare dash', () => {
    expect(clampScore('-')).toBeUndefined();
  });
});
