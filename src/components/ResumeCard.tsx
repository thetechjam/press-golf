import type { Round } from '../types';
import { activeResults } from '../games';
import { computeLeague } from '../games/league';
import { computeSettlement, formatMoney } from '../games/settlement';
import { completedHoleCount, firstIncompleteHole } from '../games/util';
import { roundTitle } from '../roundTitle';

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Who is ahead right now, in the terms the round is being played for. */
function standingLine(r: Round): string | null {
  if (completedHoleCount(r) === 0) return null;
  if (r.options.league) {
    const [a, b] = computeLeague(r).teams;
    if (a.points === b.points) return `All square · ${fmtPts(a.points)}–${fmtPts(b.points)}`;
    const [lead, trail] = a.points > b.points ? [a, b] : [b, a];
    return `${lead.name} lead ${fmtPts(lead.points)}–${fmtPts(trail.points)}`;
  }
  const settlement = computeSettlement(r);
  if (settlement.active) {
    const top = Math.max(...r.players.map((p) => settlement.totals[p.id] ?? 0));
    if (top <= 0) return 'All square on the money';
    const leaders = r.players.filter((p) => (settlement.totals[p.id] ?? 0) === top);
    const who = leaders.length === 1 ? leaders[0].name : `${leaders.length} players`;
    return `${who} up ${formatMoney(top)}`;
  }
  const first = activeResults(r)[0];
  return first ? `${first.title}: ${first.status}` : null;
}

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
      {standing && <span className="resume-standing">{standing}</span>}
      <span className="resume-cta">
        {thru === round.holes.length ? 'Back to the card' : `Resume on hole ${next}`}{' '}
        <span aria-hidden="true">›</span>
      </span>
    </button>
  );
}
