import type { Round } from '../types';
import { completedHoleCount, firstIncompleteHole } from '../games/util';
import { roundTitle, standingLine } from '../roundSummary';

/**
 * Home's way back into the round being played.
 *
 * In the list below, a round part-way through looked like every finished one
 * — "thru 18" and "18 holes" are a squint apart — and the phone gets locked
 * between every hole. This is the one thing a scorekeeper opening Press
 * mid-round is looking for, so it sits above Start New Round and says where
 * the card will open.
 */
export function ResumeCard({ round, onResume }: { round: Round; onResume: () => void }) {
  const thru = completedHoleCount(round);
  const next = round.holes[firstIncompleteHole(round)]?.number;
  const standing = standingLine(round);

  return (
    <button className="resume-card" onClick={onResume}>
      <span className="resume-eyebrow">
        <span className="resume-dot" aria-hidden="true" />
        In progress · {thru === 0 ? 'not started' : `thru ${thru} of ${round.holes.length}`}
      </span>
      <span className="resume-title">{roundTitle(round)}</span>
      {standing && <span className="resume-standing">{standing.text}</span>}
      <span className="resume-cta">
        {thru === round.holes.length ? 'Back to the card' : `Resume on hole ${next}`}{' '}
        <span aria-hidden="true">›</span>
      </span>
    </button>
  );
}
