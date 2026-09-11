import { describe, it, expect } from 'vitest';
import {
  courseHandicap,
  withAllowance,
  validSlope,
  validRating,
  validIndex,
} from './courseHandicap';

/** A full round off a standard 18-hole card. */
const full = (index: number, slope: number, rating: number, par = 72) =>
  courseHandicap({ index, slope, rating, ratingHoles: 18, playingHoles: 18, playingPar: par });

describe('courseHandicap', () => {
  it('leaves an Index alone on a course of average difficulty rated at par', () => {
    // Slope 113 is the divisor, so the ratio is 1; rating equals par, so the
    // second term is nothing. The Index is the course handicap.
    expect(full(14, 113, 72)).toBe(14);
  });

  it('raises the handicap on a harder course', () => {
    // 14 × (131/113) = 16.2, plus (74.2 − 72) = 2.2 → 18.
    expect(full(14, 131, 74.2)).toBe(18);
  });

  it('lowers it on an easier one', () => {
    // 14 × (105/113) = 13.01, plus (69.5 − 72) = −2.5 → 10.51 → 11.
    expect(full(14, 105, 69.5)).toBe(11);
  });

  it('handles a plus handicap, where the player gives strokes back', () => {
    // −2 × (131/113) = −2.32, plus 2.2 → −0.12, which is scratch. Notably not
    // "-0": Math.round gives that, and it reads on screen as a mistake.
    expect(full(-2, 131, 74.2)).toBe(0);
    expect(Object.is(full(-2, 131, 74.2), -0)).toBe(false);
    // On an easier card the same player owes strokes.
    expect(full(-2, 105, 69.5)).toBe(-4);
  });

  it('rounds to whole strokes, which is what allocation spends', () => {
    expect(Number.isInteger(full(12.4, 128, 71.3))).toBe(true);
  });

  describe('nine holes', () => {
    it('is worth half an Index off an eighteen-hole rating', () => {
      // Both the Index and the rating count for half: 7 × 1 + (36 − 36) = 7.
      expect(
        courseHandicap({
          index: 14,
          slope: 113,
          rating: 72,
          ratingHoles: 18,
          playingHoles: 9,
          playingPar: 36,
        })
      ).toBe(7);
    });

    it('uses a nine-hole rating whole, not halved', () => {
      // A course record that already carries nine-hole figures: the rating is
      // for these nine holes, so only the Index is halved.
      expect(
        courseHandicap({
          index: 14,
          slope: 113,
          rating: 36,
          ratingHoles: 9,
          playingHoles: 9,
          playingPar: 36,
        })
      ).toBe(7);
    });

    it('agrees with itself whichever way the rating was recorded', () => {
      const fromEighteen = courseHandicap({
        index: 18.6,
        slope: 124,
        rating: 71.4,
        ratingHoles: 18,
        playingHoles: 9,
        playingPar: 36,
      });
      const fromNine = courseHandicap({
        index: 18.6,
        slope: 124,
        rating: 71.4 / 2,
        ratingHoles: 9,
        playingHoles: 9,
        playingPar: 36,
      });
      expect(fromEighteen).toBe(fromNine);
    });
  });

  it('is zero rather than nonsense when the hole counts are missing', () => {
    expect(
      courseHandicap({
        index: 14,
        slope: 113,
        rating: 72,
        ratingHoles: 0,
        playingHoles: 18,
        playingPar: 72,
      })
    ).toBe(0);
  });
});

describe('withAllowance', () => {
  it('leaves a handicap alone at full allowance', () => {
    expect(withAllowance(18, 100)).toBe(18);
  });

  it('cuts a four-ball to 85%', () => {
    expect(withAllowance(18, 85)).toBe(15); // 15.3
  });

  it('cuts a match to 90%', () => {
    expect(withAllowance(18, 90)).toBe(16); // 16.2
  });

  it('rounds to whole strokes', () => {
    expect(withAllowance(13, 85)).toBe(11); // 11.05
    expect(withAllowance(7, 95)).toBe(7); // 6.65
  });

  it('reduces a plus handicap toward zero, not away from it', () => {
    expect(withAllowance(-4, 50)).toBe(-2);
  });
});

describe('the validators', () => {
  it('accept slopes that exist and reject ones that do not', () => {
    expect(validSlope(113)).toBe(true);
    expect(validSlope(55)).toBe(true);
    expect(validSlope(155)).toBe(true);
    expect(validSlope(54)).toBe(false);
    expect(validSlope(156)).toBe(false);
    expect(validSlope('113')).toBe(false);
    expect(validSlope(NaN)).toBe(false);
  });

  it('judge a rating against the holes it covers', () => {
    expect(validRating(72.4, 18)).toBe(true);
    expect(validRating(35.6, 9)).toBe(true);
    // An eighteen-hole rating typed into a nine-hole record: near enough to
    // look fine, and twice what it should be.
    expect(validRating(72, 9)).toBe(false);
    expect(validRating(36, 18)).toBe(false);
    expect(validRating(undefined, 18)).toBe(false);
  });

  it('accept an Index across the range a player can hold', () => {
    expect(validIndex(0)).toBe(true);
    expect(validIndex(-10)).toBe(true);
    expect(validIndex(54)).toBe(true);
    expect(validIndex(54.1)).toBe(false);
    expect(validIndex(-10.1)).toBe(false);
  });
});
