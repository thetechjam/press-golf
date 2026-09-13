import { describe, it, expect } from 'vitest';
import { wrapLines } from './scorecardCard';

/**
 * Wrapping the junk footer on the shared image.
 *
 * Everything else on that canvas is laid out in columns whose width is known
 * in advance; the junk line is the one piece of free text, and truncating it
 * would drop a bet somebody is owed into an image nobody can correct. So the
 * wrapping is a pure function of a measurer, tested without a canvas.
 */

/** Every character 10px wide, so a line's budget is countable by hand. */
const ten = { measureText: (t: string) => ({ width: t.length * 10 }) };

describe('wrapLines', () => {
  it('leaves text that fits on one line', () => {
    expect(wrapLines(ten, 'Greenie (3rd)', 200)).toEqual(['Greenie (3rd)']);
  });

  it('breaks at the last word that fits', () => {
    // 'one two three' is 130px; 'one two' is 70px.
    expect(wrapLines(ten, 'one two three four', 100)).toEqual(['one two', 'three four']);
  });

  it('fills each line rather than breaking early', () => {
    expect(wrapLines(ten, 'aa bb cc dd', 80)).toEqual(['aa bb cc', 'dd']);
  });

  it('keeps a word wider than the line rather than breaking it mid-word', () => {
    expect(wrapLines(ten, 'a supercalifragilistic b', 60)).toEqual([
      'a',
      'supercalifragilistic',
      'b',
    ]);
  });

  it('returns nothing for nothing, so an absent line draws no blank row', () => {
    expect(wrapLines(ten, '', 100)).toEqual([]);
  });

  it('measures the line it would actually draw, not the words separately', () => {
    // Two 30px words plus the space between them is 70px, over the budget —
    // measuring 'aa' and 'bbbb' apart would have said they fit.
    expect(wrapLines(ten, 'aa bbbb', 60)).toEqual(['aa', 'bbbb']);
  });
});
