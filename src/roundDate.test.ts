import { describe, it, expect } from 'vitest';
import { daysSince, formatRoundDate, formatRoundDateAbsolute, todayIso } from './roundDate';

// Fixed reference point: Monday 24 August 2026, local time.
const now = new Date(2026, 7, 24, 12, 0, 0);

describe('formatRoundDate', () => {
  it('names today and yesterday', () => {
    expect(formatRoundDate('2026-08-24', now)).toBe('Today');
    expect(formatRoundDate('2026-08-23', now)).toBe('Yesterday');
  });

  it('uses the weekday inside the last week', () => {
    // 2026-08-20 is a Thursday.
    expect(formatRoundDate('2026-08-20', now)).toBe('Thursday');
  });

  it('falls back to a dated form once the weekday stops being unambiguous', () => {
    const out = formatRoundDate('2026-08-01', now);
    expect(out).not.toBe('Saturday');
    expect(out).toContain('Aug');
    expect(out).toContain('1');
  });

  it('adds the year only for a round from another year', () => {
    expect(formatRoundDate('2026-03-02', now)).not.toContain('2026');
    expect(formatRoundDate('2025-09-14', now)).toContain('2025');
  });

  it('does not slip a day for timezones west of UTC', () => {
    // `new Date('2026-08-24')` is UTC midnight, which is 2026-08-23 in the US —
    // parsing that way would label a round played today as "Yesterday".
    expect(formatRoundDate('2026-08-24', new Date(2026, 7, 24, 0, 30))).toBe('Today');
    expect(formatRoundDate('2026-08-24', new Date(2026, 7, 24, 23, 30))).toBe('Today');
  });

  it('passes through anything that is not an ISO date', () => {
    expect(formatRoundDate('', now)).toBe('');
    expect(formatRoundDate('not-a-date', now)).toBe('not-a-date');
    expect(formatRoundDate('2026-13-45', now)).toBe('2026-13-45');
  });
});

describe('todayIso', () => {
  // Written in local time to match how formatRoundDate reads it. 7pm on the
  // 8th in Los Angeles is already the 9th in UTC.
  it('uses the local calendar date', () => {
    const evening = new Date(2026, 9, 8, 19, 0);
    expect(todayIso(evening)).toBe('2026-10-08');
    expect(formatRoundDate(todayIso(evening), evening)).toBe('Today');
  });
});

describe('daysSince', () => {
  it('counts whole days back from today in the phone’s calendar', () => {
    expect(daysSince('2026-08-24', now)).toBe(0);
    expect(daysSince('2026-08-23', now)).toBe(1);
    expect(daysSince('2026-08-20', now)).toBe(4);
    expect(daysSince('2026-08-25', now)).toBe(-1);
  });

  it('is null for a string that is not a date', () => {
    expect(daysSince('2026-13-45', now)).toBeNull();
    expect(daysSince('yesterday', now)).toBeNull();
  });
});

describe('formatRoundDateAbsolute', () => {
  it('never says Today: the text is read later than it is written', () => {
    const out = formatRoundDateAbsolute(todayIso(now));
    expect(out).not.toBe('Today');
    expect(out).toContain('Aug');
    expect(out).toContain('24');
    expect(out).toContain('2026');
  });

  it('hands back what it cannot read', () => {
    expect(formatRoundDateAbsolute('2026-13-45')).toBe('2026-13-45');
  });
});
