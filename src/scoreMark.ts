/**
 * Golf circle/square scoring convention, as CSS class names.
 * Circle under par, square over par, doubled ring at ±2 (eagle / double-bogey+).
 * Returns '' for par (no mark). Shared by HoleStepper and Scorecard.
 */
export function scoreMarkClass(toPar: number): string {
  if (toPar === 0) return '';
  if (toPar <= -2) return 'mark mark-circle mark-double';
  if (toPar === -1) return 'mark mark-circle';
  if (toPar === 1) return 'mark mark-square';
  return 'mark mark-square mark-double';
}

/**
 * A score's name relative to par, e.g. "Birdie". Shared by the score readout
 * and the chips' accessible labels — a chip that announces only "5" tells a
 * screen-reader user nothing about whether that's good.
 */
export function scoreLabel(toPar: number): string {
  if (toPar <= -3) return 'Albatross';
  if (toPar === -2) return 'Eagle';
  if (toPar === -1) return 'Birdie';
  if (toPar === 0) return 'Par';
  if (toPar === 1) return 'Bogey';
  if (toPar === 2) return 'Double';
  return `+${toPar}`;
}
