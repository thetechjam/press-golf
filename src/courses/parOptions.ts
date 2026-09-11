/** The pars a hole editor offers, always including the one already set. */
const COMMON = [3, 4, 5, 6];

/**
 * Par choices for one hole's dropdown.
 *
 * Golf is 3 to 6 in practice, but an imported scorecard can carry anything —
 * a 7, a 0, a stray 72 where the course total leaked into a hole. A `<select>`
 * whose options don't include its own value renders as though something else
 * were chosen, so the screen would show a par the round is not using and give
 * the user no way to correct the one it is. Folding the current value in keeps
 * the editor honest about what is stored and lets it be changed away.
 */
export function parOptions(current: number): number[] {
  if (COMMON.includes(current)) return COMMON;
  return [...COMMON, current].sort((a, b) => a - b);
}
