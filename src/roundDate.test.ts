import { describe, it, expect } from 'vitest';
import { formatRoundDate } from './roundDate';

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
