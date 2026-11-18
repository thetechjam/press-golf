/**
 * What a number typed into a setup field may be stored as.
 *
 * These fields used to store `Number(e.target.value)` as typed, so a cleared
 * box became 0, a minus sign or a decimal went straight through, and New
 * Round's memory of last time carried the result into every round after. The
 * rules live here, once, so each field and the check at Start agree on them.
 *
 * Each parser takes the field's raw text and answers `null` for "nothing to
 * store yet" — a blank box or a lone "-" mid-typing — so a field can keep
 * showing what is being typed and store only a value that means something.
 */

/** Generous: lone and blind wolf are usually ×2–×4. A slip, not a game. */
export const MAX_WOLF_MULTIPLIER = 10;

/** A stake per point, skin or match. Beyond this is a typo, not a bet. */
export const MAX_STAKE = 10_000;

const parse = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** A Wolf multiplier: a whole number from 1 to MAX_WOLF_MULTIPLIER. */
export function wolfMultiplier(raw: string): number | null {
  const n = parse(raw);
  if (n == null) return null;
  return Math.min(Math.max(1, Math.round(n)), MAX_WOLF_MULTIPLIER);
}

/** Whether a stored multiplier is one `wolfMultiplier` could have produced. */
export function isWolfMultiplier(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_WOLF_MULTIPLIER;
}

/**
 * A stake: never negative, at most MAX_STAKE, kept to the cent. A blank box is
 * no stake, which is 0, as it always has been.
 */
export function stakeAmount(raw: string): number | null {
  if (raw.trim() === '') return 0;
  const n = parse(raw);
  if (n == null) return null;
  return Math.min(Math.max(0, Math.round(n * 100) / 100), MAX_STAKE);
}

/**
 * A stroke handicap, as whole strokes, rounded the way a course handicap is
 * (`Math.round`: 2.5 → 3, and a plus 2.5, typed −2.5, → −2).
 *
 * A decimal typed here used to reach the engine as-is, where the fraction is
 * dropped one way for a positive handicap (12.7 played as 12) and the other
 * way for a plus one, so the same typing meant different things either side
 * of scratch. Not for a Handicap Index, which is legitimately a decimal.
 */
export function wholeStrokes(v: number | undefined): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const r = Math.round(v);
  // Math.round(-0.4) is -0, which prints as "-0".
  return r === 0 ? 0 : r;
}
