import { describe, it, expect } from 'vitest';
import { scorecardIssues } from './validate';
import { parOptions } from './parOptions';
import type { Hole } from '../types';

/** `n` holes, par 4, ranked 1..n — a clean scorecard. */
const good = (n = 18): Hole[] =>
  Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

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
    const used = good(18); // what the re-rank produced: a tidy 1..18
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

describe('parOptions', () => {
  it('offers the usual pars', () => {
    expect(parOptions(4)).toEqual([3, 4, 5, 6]);
  });

  it('includes a value from outside that range, in order', () => {
    // Without this the select shows a par the round is not using, and offers
    // no way to change the one it is.
    expect(parOptions(7)).toEqual([3, 4, 5, 6, 7]);
    expect(parOptions(0)).toEqual([0, 3, 4, 5, 6]);
  });
});
