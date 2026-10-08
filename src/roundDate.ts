/**
 * Human-readable form of a `Round.date` (ISO `yyyy-mm-dd`).
 *
 * The round card and the Results header both rendered the raw ISO string, so
 * the first line a scorekeeper read was "2026-08-24". Yesterday's round and
 * last month's round looked equally distant.
 *
 * Parsed field-by-field rather than via `new Date(iso)`: that constructor
 * reads a bare `yyyy-mm-dd` as UTC midnight, which lands on the previous
 * calendar day for anyone west of Greenwich — so a round played today would
 * label itself "Yesterday" in the US.
 */
export function formatRoundDate(iso: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // The Date constructor rolls out-of-range fields over rather than rejecting
  // them — `2026-13-45` becomes Feb 2027 — and never produces NaN here. Reading
  // the fields back is the only way to catch it, and showing the raw string
  // beats confidently printing a date that was never played.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return iso;
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000
  );

  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';

  // Inside the last week the weekday alone is the most useful handle; beyond
  // that it stops being unambiguous, so fall back to a dated form. The year
  // only earns its place once the round is no longer from this year.
  const sameYear = date.getFullYear() === now.getFullYear();
  if (days < 0 && days > -7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The `Round.date` fields as a local Date, or null when they are not a date. */
export function parseRoundDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Whole days from the round's date to today, in the phone's calendar: 0 for
 * a round dated today, 1 for yesterday. Null when the date cannot be read.
 */
export function daysSince(iso: string, now: Date = new Date()): number | null {
  const date = parseRoundDate(iso);
  if (!date) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
}

/**
 * The date in full, for text that leaves the phone — "Thu, Oct 8, 2026".
 * "Today" is true when it is written and wrong by the time the group chat
 * is read back, and the raw ISO form was what went out before.
 */
export function formatRoundDateAbsolute(iso: string): string {
  const date = parseRoundDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Today as a `Round.date`, in the phone's own calendar.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC date, and a round started
 * after 5pm on the US west coast was filed under tomorrow — "Thu, Oct 9" on
 * the card instead of "Today", and a New Year's Eve league night in next
 * season's standings. `formatRoundDate` above reads these fields as local
 * time, so they have to be written that way too.
 */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
