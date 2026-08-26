import { describe, expect, it } from 'vitest';
import { scoreLabel, scoreMarkClass, scoreNumClass } from './scoreMark';

describe('scoreLabel', () => {
  it('names the good ones', () => {
    expect(scoreLabel(-3)).toBe('Albatross');
    expect(scoreLabel(-2)).toBe('Eagle');
    expect(scoreLabel(-1)).toBe('Birdie');
  });

  it('names par and the bad ones', () => {
    expect(scoreLabel(0)).toBe('Par');
    expect(scoreLabel(1)).toBe('Bogey');
    expect(scoreLabel(2)).toBe('Double');
  });

  it('falls back to a signed number past double bogey', () => {
    expect(scoreLabel(3)).toBe('+3');
    expect(scoreLabel(7)).toBe('+7');
  });

  it('treats anything better than an albatross as an albatross', () => {
    expect(scoreLabel(-4)).toBe('Albatross');
  });
});

describe('scoreMarkClass', () => {
  it('leaves par unmarked', () => {
    expect(scoreMarkClass(0)).toBe('');
  });

  it('circles under par and squares over', () => {
    expect(scoreMarkClass(-1)).toBe('mark mark-circle');
    expect(scoreMarkClass(1)).toBe('mark mark-square');
  });

  it('doubles the ring at two or more either way', () => {
    expect(scoreMarkClass(-2)).toBe('mark mark-circle mark-double');
    expect(scoreMarkClass(2)).toBe('mark mark-square mark-double');
  });
});

describe('scoreNumClass', () => {
  it('is bare when nothing just happened', () => {
    expect(scoreNumClass({ celebrating: false, flapping: false })).toBe('score-num');
  });

  it('flaps when a score just landed', () => {
    expect(scoreNumClass({ celebrating: false, flapping: true })).toBe(
      'score-num flap'
    );
  });

  it('celebrates instead of flapping when both are true', () => {
    expect(scoreNumClass({ celebrating: true, flapping: true })).toBe(
      'score-num celebrate'
    );
  });

  it('celebrates on its own', () => {
    expect(scoreNumClass({ celebrating: true, flapping: false })).toBe(
      'score-num celebrate'
    );
  });
});
