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

// CI GATE PROOF — deliberate type error. Reverted in the next commit.
export const ciGateProof: number = 'this is not a number';
// retrigger
