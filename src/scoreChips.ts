/**
 * The Hole tab's quick-pick score chips: the common range around par, one tap
 * each. Pure so the range and clear-on-retap rules are testable without a DOM.
 */

/** Lowest and highest score the overflow grid offers. Matches `clampScore`. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 15;

/** How far below and above par the inline chips reach. */
const BELOW_PAR = 1;
const ABOVE_PAR = 3;

/**
 * Inline chip values for a hole: par−1 … par+3, floored at SCORE_MIN.
 *
 * Always the same length, so the row can't reflow when you move between a par
 * 3 and a par 5 — a chip that shifts under your thumb mid-round is worse than
 * one that's occasionally further from par than the label suggests.
 */
export function chipRange(par: number): number[] {
  const start = Math.max(SCORE_MIN, par - BELOW_PAR);
  return Array.from({ length: BELOW_PAR + ABOVE_PAR + 1 }, (_, i) => start + i);
}

/**
 * What a chip tap resolves to. Tapping the already-selected chip clears the
 * score back to null — load-bearing, because null vs entered is what drives
 * `missing`, `incompleteHoles`, `firstIncompleteHole`, the warn banners and
 * the auto-jump to the first blank score.
 */
export function nextValue(current: number | null, tapped: number): number | null {
  return current === tapped ? null : tapped;
}

/** Every legal score, for the overflow grid behind the "…" chip. */
export function overflowRange(): number[] {
  return Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);
}

/**
 * Whether a score lives outside the inline chip range and so is only
 * reachable through the "…" overflow grid. Drives the "…" chip's glyph, its
 * accessible name, and `.has-value` — kept here rather than inlined in
 * ScoreChips.tsx so it can't silently drift out of agreement with
 * `chipRange` if the range's shape ever changes.
 */
export const isOverflowValue = (par: number, value: number | null): boolean =>
  value != null && !chipRange(par).includes(value);
