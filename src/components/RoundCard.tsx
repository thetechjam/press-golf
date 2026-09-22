import type { Round } from '../types';
import { completedHoleCount } from '../games/util';
import { GAMES, activeResults } from '../games';
import { computeLeague } from '../games/league';
import { DeleteButton } from './DeleteButton';
import { XIcon } from '../icons';
import { formatRoundDate } from '../roundDate';
import { roundTitle } from '../roundTitle';

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));


/** One-line outcome for a finished round, or null while in progress. */
const resultLine = (r: Round): string | null => {
  if (r.status !== 'finished') return null;
  if (r.options.league) {
    const [a, b] = computeLeague(r).teams;
    if (a.points === b.points) return `All square · ${fmtPts(a.points)}–${fmtPts(b.points)}`;
    const [win, lose] = a.points > b.points ? [a, b] : [b, a];
    return `${win.name} won ${fmtPts(win.points)}–${fmtPts(lose.points)}`;
  }
  const first = activeResults(r)[0];
  return first ? `${first.title}: ${first.status}` : null;
};

interface Props {
  round: Round;
  onOpen: () => void;
  /** Omitted where deleting one at a time is not on offer — see `selected`. */
  onDelete?: () => void;
  /**
   * Present only in the History screen's select mode. When it is, the card
   * becomes a checkbox: tapping it picks the round rather than opening it, and
   * the per-card delete stands down, because arming one row's delete while
   * eleven others are ticked is two destructive gestures competing.
   */
  selected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * One round, as it appears on Home and in the history.
 *
 * Extracted so the two lists cannot drift: a round that reads one way on Home
 * and another in the history is the same round described twice, and the second
 * description is the one that will go stale.
 */
export function RoundCard({ round, onOpen, onDelete, selected, onToggleSelect }: Props) {
  const selecting = onToggleSelect !== undefined;
  const thru = completedHoleCount(round);
  const result = resultLine(round);

  return (
    <div className={`round-card${selecting ? ' selecting' : ''}${selected ? ' selected' : ''}`}>
      <button
        className="round-main"
        onClick={selecting ? onToggleSelect : onOpen}
        aria-pressed={selecting ? !!selected : undefined}
      >
        {selecting && (
          <span className={`round-tick${selected ? ' on' : ''}`} aria-hidden="true">
            {selected ? '✓' : ''}
          </span>
        )}
        <span className="round-body">
          <span className="round-title">{roundTitle(round)}</span>
          <span className="round-sub">
            {formatRoundDate(round.date)} · {round.players.length} players ·{' '}
            {round.holes.length} holes
            {round.status === 'finished'
              ? ''
              : thru === 0
                ? ' · not started'
                : ` · thru ${thru}`}
          </span>
          {result && <span className="round-result">{result}</span>}
          <span className="round-games">
            {/* "thru 18" reads like a finished card at a glance; this is the
                tell that it is not. */}
            {round.status !== 'finished' && <span className="tag live">In progress</span>}
            {round.options.league && <span className="tag">League</span>}
            {round.games.map((g) => (
              <span key={g} className="tag">
                {GAMES.find((m) => m.id === g)?.label ?? g}
              </span>
            ))}
          </span>
        </span>
      </button>

      {!selecting && onDelete && (
        <DeleteButton
          className="round-del"
          label={`round ${round.course || round.date}`}
          onDelete={onDelete}
        >
          <XIcon />
        </DeleteButton>
      )}
    </div>
  );
}
