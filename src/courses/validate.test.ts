import { describe, it, expect } from 'vitest';
import { scorecardIssues } from './validate';
import { nextPar } from './parOptions';
import type { Hole } from '../types';

/**
 * A real par-72 eighteen: four par 3s, four par 5s, and the stroke indexes
 * allocated the way a course allocates them — odd across the front, even
 * across the back.
 *
 * It used to be eighteen par 4s ranked 1,2,3…18, which is a placeholder
 * wearing a scorecard's clothes: a complete 1..18 ranking with no duplicates
 * and every par in range, and nothing any course has ever printed. Two of the
 * checks below exist to catch exactly that shape, so the fixture standing in
 * for "clean" could not keep being it.
 */
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const SI = [5, 1, 15, 7, 11, 3, 17, 9, 13, 6, 2, 16, 8, 12, 4, 18, 10, 14];

const good = (n = 18): Hole[] =>
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    par: PARS[i % 18],
    // A nine taken off the front carries the odd indexes it was ranked with;
    // the app re-ranks those to 1..9 downstream, which is what `used` holds.
    strokeIndex: n === 18 ? SI[i] : i + 1,
  }));

/** The shape bad imports arrive in: every par the same, indexes counted off. */
const placeholder = (n = 18, par = 4): Hole[] =>
  Array.from({ length: n }, (_, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));

describe('scorecardIssues', () => {
  it('has nothing to say about a clean scorecard', () => {
    expect(scorecardIssues(good(18), 18)).toEqual([]);
  });

  it('says so when nothing came back at all', () => {
    expect(scorecardIssues([], 18)).toEqual(['No holes came back for that course.']);
  });

  it('names a short scorecard rather than letting it pass as complete', () => {
    const [issue] = scorecardIssues(good(12), 18);
    expect(issue).toBe('Only 12 of 18 holes came back — the rest have been left at par 4.');
  });

  it('does not complain when the round wanted fewer holes than the course has', () => {
    expect(scorecardIssues(good(9), 9)).toEqual([]);
  });

  it('names a hole whose par is not golf', () => {
    const holes = good(9);
    holes[3].par = 12;
    expect(scorecardIssues(holes, 9)).toEqual(['Hole 4 came back as par 12.']);
  });

  it('gathers several odd pars into one line', () => {
    const holes = good(9);
    holes[0].par = 0;
    holes[8].par = 0;
    expect(scorecardIssues(holes, 9)).toEqual(['Holes 1 and 9 came back as par 0.']);
  });

  it('passes on the stroke index problem in the same words the editor uses', () => {
    const holes = good(9);
    holes[1].strokeIndex = 1;
    expect(scorecardIssues(holes, 9)).toEqual([
      'Stroke index 1 is used more than once — each hole needs its own rank from 1 to 9.',
    ]);
  });

  it('reports everything wrong at once, not just the first thing', () => {
    const holes = good(9);
    holes[0].par = 9;
    holes[1].strokeIndex = 1;
    expect(scorecardIssues(holes, 9)).toHaveLength(2);
  });

  it('says nothing about a course with no stroke indexes at all', () => {
    // Par-only data is common and perfectly usable — net games just fall back.
    const holes = good(18).map((h) => ({ number: h.number, par: h.par }));
    expect(scorecardIssues(holes, 18)).toEqual([]);
  });

  it('does not ask a card without indexes to split them across the nines', () => {
    // The split is a question about a ranking. There isn't one here.
    const holes = placeholder(18, 4).map((h) => ({ number: h.number, par: h.par }));
    expect(scorecardIssues(holes, 18).join(' ')).not.toContain('front nine have');
  });

  it('abbreviates a long list rather than naming eighteen holes', () => {
    const holes = good(18).map((h) => ({ ...h, par: 9 }));
    expect(scorecardIssues(holes, 18)[0]).toContain('and 14 more');
  });
});

describe('stroke index integrity is judged on the raw data', () => {
  it('sees a duplicate that slicing would have tidied away', () => {
    // Slicing re-ranks a complete set into 1..N, so by the time the round has
    // its scorecard the duplicate is gone and the ranking looks authoritative.
    // It is still invented, and the raw data is the only place that shows it.
    const raw = good(18);
    raw[5].strokeIndex = 1;
    const used = good(18); // what the re-rank produced: a valid ranking
    expect(scorecardIssues(used, 18)).toEqual([]);
    expect(scorecardIssues(used, 18, raw)[0]).toMatch(/used more than once/);
  });

  it('stays quiet when the raw indexes are merely a slice of a bigger card', () => {
    // A front nine out of an eighteen: raw indexes are odd-numbered, which is
    // not a fault — it is why the re-rank exists.
    const raw = Array.from({ length: 9 }, (_, i) => ({
      number: i + 1,
      par: 4,
      strokeIndex: i * 2 + 1,
    }));
    expect(scorecardIssues(good(9), 9, raw)).toEqual([]);
  });
});

/**
 * The two checks that judge a card by its shape rather than its numbers.
 *
 * Everything above catches a scorecard that is *invalid* — a par of 12, a rank
 * used twice, holes that never arrived. These catch one that is perfectly
 * valid and still isn't a golf course: the placeholder an importer leaves
 * behind when it has a course's name and none of its card. That shape passes
 * every other check in this file, and a round played on it computes every net
 * score, Stableford point and Quota target off numbers nobody measured.
 */
describe('a card that is valid and still not a scorecard', () => {
  it('names an eighteen where every hole is the same par', () => {
    expect(scorecardIssues(placeholder(18, 4), 18)).toContain(
      'Every hole came back as par 4, which is a placeholder rather than a scorecard.'
    );
  });

  it('leaves an eighteen-hole par-3 course alone', () => {
    // Pitch-and-putt eighteens exist and people play them. Par 4 and par 5 all
    // the way down do not, which is the difference being drawn.
    const issues = scorecardIssues(placeholder(18, 3), 18);
    expect(issues.join(' ')).not.toContain('placeholder');
  });

  it('does not judge a nine on its par spread', () => {
    // Nine identical pars is a par-3 nine, a short course, or half a card.
    expect(scorecardIssues(placeholder(9, 4), 9).join(' ')).not.toContain('placeholder');
  });

  it('catches stroke indexes counted straight down the card', () => {
    const [, split] = scorecardIssues(placeholder(18, 4), 18);
    expect(split).toBe(
      'Only 5 of the front nine have odd stroke indexes — a course ranks one nine odd and the ' +
        'other even, so this ranking looks generated rather than measured.'
    );
  });

  it('accepts either nine carrying the odd indexes', () => {
    // Appendix E switches the allocation when the back nine rates harder, so
    // evens-on-the-front is equally correct and must not be flagged.
    const flipped = good(18).map((h) => ({
      ...h,
      strokeIndex: (h.strokeIndex as number) % 2 === 1
        ? (h.strokeIndex as number) + 1
        : (h.strokeIndex as number) - 1,
    }));
    expect(scorecardIssues(flipped, 18)).toEqual([]);
  });

  it('tolerates a card that deviates by a hole or two', () => {
    // Real cards drift — a hole changes nines in a redesign and nobody
    // re-ranks the whole thing. Two out of place is still the convention.
    const drifted = good(18).map((h) => ({ ...h }));
    const a = drifted[0].strokeIndex as number;
    drifted[0].strokeIndex = drifted[9].strokeIndex as number;
    drifted[9].strokeIndex = a;
    expect(scorecardIssues(drifted, 18)).toEqual([]);
  });

  it('judges the split on the raw card, not the re-ranked nine', () => {
    // A front nine sliced out is re-ranked to 1..9, which erases the evidence.
    // The raw eighteen is where the question can still be answered.
    const raw = placeholder(18, 4);
    const used = good(9);
    expect(scorecardIssues(used, 9).join(' ')).not.toContain('front nine have');
    expect(scorecardIssues(used, 9, raw).join(' ')).toContain('front nine have');
  });
});

describe('nextPar', () => {
  it('steps up through the usual pars and round again', () => {
    expect([3, 4, 5, 6].map(nextPar)).toEqual([4, 5, 6, 3]);
  });

  it('sends a value from outside that range to 3', () => {
    expect(nextPar(7)).toBe(3);
    expect(nextPar(0)).toBe(3);
    expect(nextPar(72)).toBe(3);
  });
});
