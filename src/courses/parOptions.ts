/** The pars a hole editor steps through: golf is 3 to 6 in practice. */
const COMMON = [3, 4, 5, 6];

/**
 * The par a tap on a hole's tile moves to: up through 3–6 and round again.
 *
 * An imported scorecard can carry anything — a 7, a 0, a stray 72 where the
 * course total leaked into a hole. The tile shows whatever is stored, so the
 * screen never claims a par the round is not using, and anything outside the
 * range goes to 3: one tap from being a real par.
 */
export function nextPar(current: number): number {
  const i = COMMON.indexOf(current);
  return i === -1 ? COMMON[0] : COMMON[(i + 1) % COMMON.length];
}
