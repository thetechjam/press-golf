import { describe, it, expect } from 'vitest';
import { wolfMultiplier, isWolfMultiplier, stakeAmount, wholeStrokes, MAX_STAKE, MAX_WOLF_MULTIPLIER } from './numberInput';

describe('wolfMultiplier', () => {
  it('stores nothing for a blank box or a lone minus mid-typing', () => {
    expect(wolfMultiplier('')).toBeNull();
    expect(wolfMultiplier('-')).toBeNull();
  });

  it('keeps a whole number from 1 up, within reason', () => {
    expect(wolfMultiplier('4')).toBe(4);
    expect(wolfMultiplier('0')).toBe(1);
    expect(wolfMultiplier('-3')).toBe(1);
    expect(wolfMultiplier('2.6')).toBe(3);
    expect(wolfMultiplier('400')).toBe(MAX_WOLF_MULTIPLIER);
  });

  it('agrees with the check at Start', () => {
    for (const raw of ['0', '-3', '2.6', '400', '1']) expect(isWolfMultiplier(wolfMultiplier(raw))).toBe(true);
    for (const v of [0, -1, 1.5, NaN, MAX_WOLF_MULTIPLIER + 1, '2']) expect(isWolfMultiplier(v)).toBe(false);
  });
});

describe('stakeAmount', () => {
  it('is no stake for a blank box, as it always was', () => {
    expect(stakeAmount('')).toBe(0);
  });

  it('keeps cents, and nothing negative or absurd', () => {
    expect(stakeAmount('2.5')).toBe(2.5);
    expect(stakeAmount('0.125')).toBe(0.13);
    expect(stakeAmount('-5')).toBe(0);
    expect(stakeAmount('1e9')).toBe(MAX_STAKE);
  });

  it('stores nothing for text that is not a number', () => {
    expect(stakeAmount('-')).toBeNull();
    expect(stakeAmount('abc')).toBeNull();
  });
});

describe('wholeStrokes', () => {
  it('rounds both sides of scratch the way a course handicap is rounded', () => {
    expect(wholeStrokes(12.7)).toBe(13);
    expect(wholeStrokes(12.4)).toBe(12);
    expect(wholeStrokes(2.5)).toBe(3);
    expect(wholeStrokes(-2.5)).toBe(-2);
    expect(wholeStrokes(-2.7)).toBe(-3);
  });

  it('never gives back a minus zero, and leaves a blank blank', () => {
    expect(Object.is(wholeStrokes(-0.3), 0)).toBe(true);
    expect(wholeStrokes(undefined)).toBeUndefined();
    expect(wholeStrokes(NaN)).toBeUndefined();
  });
});
