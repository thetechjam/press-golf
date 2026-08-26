/**
 * Golf circle/square scoring convention, as CSS class names.
 * Circle under par, square over par, doubled ring at ±2 (eagle / double-bogey+).
 * Returns '' for par (no mark). The Hole tab dropped this mark (the tone-
 * coloured chips already say the same thing); `scorecardModel.ts` is now its
 * only caller, feeding the Card tab's scorecard grid.
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

/**
 * Class list for the big score readout. Two motions can want the same element:
 * the split-flap (a score just landed) and the celebrate pulse (it landed
 * under par). Under par is the rarer, better event, so celebrate wins — a
 * birdie should celebrate, not flip. Encoded here rather than left to CSS
 * source order, which is invisible from the component and easy to reorder.
 */
export function scoreNumClass({
  celebrating,
  flapping,
}: {
  celebrating: boolean;
  flapping: boolean;
}): string {
  if (celebrating) return 'score-num celebrate';
  if (flapping) return 'score-num flap';
  return 'score-num';
}
