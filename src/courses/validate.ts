import type { Hole } from '../types';
import {
  strokeIndexProblem,
  describeStrokeIndexProblem,
  duplicateStrokeIndexes,
  nineSplit,
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

/**
 * How many of a nine may sit on the wrong parity before the allocation stops
 * looking like an allocation.
 *
 * Real cards deviate: a hole swaps nines after a redesign and nobody re-ranks
 * the whole card. Two such holes is still recognisably the convention; four is
 * a coin toss, which is what an invented sequence produces.
 */
const MIN_NINE_SPLIT = 7;

/**
 * How long a run of one par has to be before it reads as filler.
 *
 * Par 5s come one or two at a time: back-to-back fives are a feature some
 * courses advertise, three in a row is not something a routed course does.
 * Par 4s are the default hole, so six or seven in a row happens — a whole
 * nine of them does not. Par 3 has no entry: pitch-and-putt and executive
 * layouts run them on purpose, and the all-par-3 allowance below already
 * says so. Par 6 is treated like par 5; a run of anything outside 3–6 is the
 * odd-par line's business, not this one's.
 */
const RUN_LIMIT: Record<number, number> = { 4: 9, 5: 3, 6: 3 };

/**
 * Stretches of consecutive holes on one par long enough to look generated.
 *
 * A run that is the whole of a card shorter than eighteen is left out: nine
 * holes of one par is a par-3 nine, a short course or half a card, and the
 * all-identical check below already declines to judge a nine on that.
 */
function placeholderRuns(card: Hole[]): { from: number; to: number; par: number }[] {
  const runs: { from: number; to: number; par: number }[] = [];
  let start = 0;
  for (let i = 1; i <= card.length; i++) {
    if (i < card.length && card[i].par === card[start].par) continue;
    const limit = RUN_LIMIT[card[start].par];
    const wholeShortCard = start === 0 && i === card.length && card.length < 18;
    if (limit != null && i - start >= limit && !wholeShortCard) {
      runs.push({ from: card[start].number, to: card[i - 1].number, par: card[start].par });
    }
    start = i;
  }
  return runs;
}

export interface ScorecardContext {
  /**
   * The par the course record states for itself, which arrives separately
   * from the holes and so can disagree with them.
   */
  statedPar?: number;
  /**
   * The whole card as it stands, for the two checks that judge the course
   * rather than the holes being played: a nine adds up to half the stated par,
   * and a placeholder run can sit in the nine nobody is playing today. Pass
   * the card with the user's corrections in it, not the untouched response —
   * fixing the pars has to be able to clear these lines. Defaults to `raw`,
   * then to `used`.
   */
  card?: Hole[];
}

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
 *
 * `context` carries what the record says about itself beyond the holes — see
 * {@link ScorecardContext}. Without it the two whole-card checks look at
 * `raw`, then `used`, and the total check does not run.
 */
export function scorecardIssues(
  used: Hole[],
  expected?: number,
  raw?: Hole[],
  context: ScorecardContext = {}
): string[] {
  const issues: string[] = [];
  const holes = used;
  const wholeCard = context.card ?? raw ?? used;

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

  // The record's own total against its own holes. Only on a card shaped like a
  // whole course — a nine or an eighteen — and only against a par that card
  // could add up to, so a short import (already named above) or a nine-hole
  // course stated as its eighteen-hole loop is not reported a second time as
  // a sum that does not match.
  const { statedPar } = context;
  const total = wholeCard.reduce((sum, h) => sum + h.par, 0);
  if (
    statedPar != null &&
    (wholeCard.length === 9 || wholeCard.length === 18) &&
    statedPar >= wholeCard.length * MIN_PAR &&
    statedPar <= wholeCard.length * MAX_PAR &&
    total !== statedPar
  ) {
    issues.push(
      `The hole pars add up to ${total}, but the course lists par ${statedPar} — check them against the card.`
    );
  }

  // Identical pars all the way down, on a full eighteen. Par 3 is left alone
  // because an eighteen-hole par-3 course is a real thing somebody plays; par
  // 4 and 5 are not, and par 4 in particular is this app's own fill value —
  // the line above says so when holes are missing, which is exactly the state
  // that reaches here looking like a complete card.
  const pars = new Set(holes.map((h) => h.par));
  const allSame = holes.length === 18 && pars.size === 1 && holes[0].par !== 3;
  if (allSame) {
    issues.push(
      `Every hole came back as par ${holes[0].par}, which is a placeholder rather than a scorecard.`
    );
  }

  // The same fault when it covers only part of the card: an importer that had
  // some holes and padded the rest. Stands down when the line above has
  // already said it about every hole — one fault, one line.
  if (!allSame) {
    for (const run of placeholderRuns(wholeCard)) {
      issues.push(
        `Holes ${run.from} to ${run.to} all came back as par ${run.par} — that looks like a placeholder, not a scorecard.`
      );
    }
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

  // Judged on the raw card when there is one: a nine sliced out of an eighteen
  // is re-ranked to 1..9, and the split it came from is the thing being asked
  // about. `used` is checked only when it is itself a whole eighteen.
  const card = raw?.length === 18 ? raw : holes;
  const split = nineSplit(card);
  if (split && split.matched < MIN_NINE_SPLIT) {
    issues.push(
      `Only ${split.matched} of the front nine have ${split.frontParity} stroke indexes — a course ranks ` +
        `one nine odd and the other even, so this ranking looks generated rather than measured.`
    );
  }

  return issues;
}
