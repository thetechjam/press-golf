import type { Hole } from '../types';
import {
  strokeIndexProblem,
  describeStrokeIndexProblem,
  duplicateStrokeIndexes,
} from '../games/strokeIndex';

/**
 * What looks wrong with an imported scorecard.
 *
 * Course search returns open community data, and it arrives as eighteen
 * numbers that every net score, Stableford point and Quota target is then
 * computed from. The importer used to take whatever came back; this is the
 * reading of it that lets the screen say "this bit looks off" instead of
 * quietly playing the round on it.
 *
 * Deliberately advisory. Nothing here rejects a course or edits a number —
 * plenty of odd-looking scorecards are simply unusual, and the user is holding
 * the real one. The job is to point at the holes worth a second look.
 */

/** Pars outside this are possible but vanishingly rare, and usually bad data. */
const MIN_PAR = 3;
const MAX_PAR = 6;

const list = (ns: number[]): string => {
  if (ns.length === 1) return `${ns[0]}`;
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  if (ns.length > 4) return `${ns.slice(0, 4).join(', ')} and ${ns.length - 4} more`;
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
};

/**
 * Human-readable problems with a scorecard, most load-bearing first. Empty
 * when nothing stands out.
 *
 * `used` is the scorecard the round will actually play — already sliced to the
 * right number of holes — so a par is only ever flagged on a hole somebody is
 * going to stand on.
 *
 * `raw` is what the database returned, before slicing, and it is checked for
 * one thing only: a rank used twice. Slicing re-ranks a complete set of
 * indexes into 1..N, which is right and necessary when a front nine is pulled
 * out of an eighteen-hole card — but it also turns a genuinely broken set into
 * a tidy ranking that looks authoritative and is invented, and `used` can no
 * longer show that. Only duplicates are judged on `raw`, because the rest of
 * the check cannot survive being shown a subset: a front nine legitimately
 * carries 1, 3, 5 … 17, out of range for nine holes and exactly correct for
 * the card it came from.
 */
export function scorecardIssues(used: Hole[], expected?: number, raw?: Hole[]): string[] {
  const issues: string[] = [];
  const holes = used;

  if (holes.length === 0) return ['No holes came back for that course.'];

  if (expected != null && holes.length < expected) {
    issues.push(
      `Only ${holes.length} of ${expected} holes came back — the rest have been left at par 4.`
    );
  }

  const oddPars = holes.filter((h) => h.par < MIN_PAR || h.par > MAX_PAR);
  if (oddPars.length > 0) {
    issues.push(
      `${oddPars.length === 1 ? 'Hole' : 'Holes'} ${list(oddPars.map((h) => h.number))} came back as par ${list(
        [...new Set(oddPars.map((h) => h.par))]
      )}.`
    );
  }

  const si = strokeIndexProblem(holes);
  if (si) {
    issues.push(describeStrokeIndexProblem(si, holes.length));
  } else if (raw) {
    const dupes = duplicateStrokeIndexes(raw);
    if (dupes.length > 0) {
      issues.push(
        describeStrokeIndexProblem({ kind: 'duplicate', values: dupes }, raw.length) +
          ' They have been re-ranked to fit, so the order shown is a guess.'
      );
    }
  }

  return issues;
}
