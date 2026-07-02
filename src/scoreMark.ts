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
