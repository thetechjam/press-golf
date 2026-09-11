import type { Round } from '../types';
import type { Arrival as ArrivalState } from '../handover';
import { describeArrival } from '../handover';
import { formatRoundDate } from '../roundDate';

/** What the user decided to do about a round that arrived by link. */
export type Resolution =
  /** Open the copy already on this device and leave it alone. */
  | { action: 'open-mine' }
  /** Overwrite the copy here with the one that arrived. */
  | { action: 'replace' }
  /** Save the arriving copy alongside, under an id of its own. */
  | { action: 'fork' };

interface Props {
  incoming: Round;
  arrival: ArrivalState;
  onResolve: (resolution: Resolution) => void;
}

/**
 * The screen shown when a round arrives that this device already has.
 *
 * Presentational on purpose: it names the situation and offers the choices,
 * and `App.tsx` does the writing. The comparison behind it is in
 * `handover.ts`, where it can be tested without a DOM.
 *
 * There is a real temptation to decide this automatically — take whichever
 * copy has more scores and say nothing. That is what `mergeRounds` does, and
 * it is fine right up until both phones have scored, at which point it throws
 * away somebody's back nine on the strength of a timestamp. So the one case
 * that cannot be decided safely is the one case that gets asked about, and the
 * first answer offered keeps both.
 */
export function Arrival({ incoming, arrival, onResolve }: Props) {
  const heading =
    arrival.kind === 'diverged' ? 'Two versions of this round' : 'You already have this round';

  return (
    <div className="screen arriving">
      <h1 tabIndex={-1}>{heading}</h1>

      <div className="arriving-round">
        <div className="arriving-course">{incoming.course || 'Golf round'}</div>
        <div className="arriving-sub">
          {formatRoundDate(incoming.date)} · {incoming.players.length} players ·{' '}
          {incoming.holes.length} holes
        </div>
      </div>

      <p className="arriving-note">{describeArrival(arrival)}</p>

      {arrival.kind === 'same' && (
        <button className="btn-primary big" onClick={() => onResolve({ action: 'open-mine' })}>
          Open it
        </button>
      )}

      {arrival.kind === 'ahead' && (
        <>
          <button className="btn-primary big" onClick={() => onResolve({ action: 'replace' })}>
            Bring mine up to date
          </button>
          <button className="btn-ghost" onClick={() => onResolve({ action: 'open-mine' })}>
            Leave mine as it is
          </button>
        </>
      )}

      {arrival.kind === 'behind' && (
        <>
          <button className="btn-primary big" onClick={() => onResolve({ action: 'open-mine' })}>
            Open my copy
          </button>
          <button className="btn-ghost" onClick={() => onResolve({ action: 'fork' })}>
            Keep theirs as well
          </button>
        </>
      )}

      {arrival.kind === 'diverged' && (
        <>
          {/* First, and the only one that loses nothing. */}
          <button className="btn-primary big" onClick={() => onResolve({ action: 'fork' })}>
            Keep both
          </button>
          <button className="btn-secondary" onClick={() => onResolve({ action: 'replace' })}>
            Use theirs, discard mine
          </button>
          <button className="btn-ghost" onClick={() => onResolve({ action: 'open-mine' })}>
            Keep mine, discard theirs
          </button>
        </>
      )}
    </div>
  );
}
