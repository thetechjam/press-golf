import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { listRounds, deleteRound } from '../storage';
import { RoundCard } from '../components/RoundCard';
import { searchRounds, filterByStatus, groupByMonth, describeEmpty } from '../history';
import type { StatusFilter } from '../history';
import { XIcon } from '../icons';

interface Props {
  onBack: () => void;
  onResume: (round: Round) => void;
  onViewResults: (round: Round) => void;
}

/**
 * "Unfinished" rather than "In progress": two words wrapped the segment onto a
 * second line at phone width, and it is the exact complement of the label
 * beside it, which is what a pair of filters should read as.
 */
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'Unfinished' },
  { id: 'finished', label: 'Finished' },
];

/**
 * Every round on the device, with a way to find one and a way to clear some
 * out.
 *
 * Home used to carry this list in full, under the two buttons somebody came to
 * press. That works until it doesn't: past a season's golf the launcher is
 * mostly archive, and the only tool for reaching a round from March is
 * scrolling past everything since.
 *
 * Deleting in bulk is the other half. One-at-a-time delete is right for the
 * round you just finished by mistake and hopeless for clearing out a year, so
 * this screen has a select mode — and while it is on, the per-card delete
 * stands down, because arming one row's delete with eleven others ticked is
 * two destructive gestures competing for the same tap.
 */
export function History({ onBack, onResume, onViewResults }: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const shown = useMemo(
    () => filterByStatus(searchRounds(rounds, query), status),
    [rounds, query, status]
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);

  const open = (round: Round) =>
    round.status === 'finished' ? onViewResults(round) : onResume(round);

  const removeOne = (id: string) => {
    deleteRound(id);
    setRounds(listRounds());
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Leaves select mode and forgets the selection — one exit, used by all of them. */
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
    setConfirming(false);
  };

  const deletePicked = () => {
    for (const id of picked) deleteRound(id);
    setRounds(listRounds());
    stopSelecting();
  };

  /** Everything currently on screen — not everything on the device. */
  const selectAllShown = () => setPicked(new Set(shown.map((r) => r.id)));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  return (
    <div className={`screen history${selecting ? ' selecting' : ''}`}>
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>Rounds</h1>
        {rounds.length > 0 ? (
          <button className="btn-ghost" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Done' : 'Select'}
          </button>
        ) : (
          <span />
        )}
      </header>

      {rounds.length > 0 && (
        <div className="history-tools">
          <div className="history-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search course, player or game"
              aria-label="Search rounds"
            />
            {query && (
              <button
                className="history-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          <div className="seg history-filter" role="group" aria-label="Filter rounds">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`seg-btn${status === f.id ? ' active' : ''}`}
                aria-pressed={status === f.id}
                onClick={() => setStatus(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="history-empty">{describeEmpty(query, status)}</p>
      ) : (
        <>
          {/* Said once, above the list: a count is the answer to "did the
              filter work", and the list itself only answers it by being
              counted. */}
          <p className="history-count" role="status">
            {shown.length === rounds.length
              ? `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}`
              : `${shown.length} of ${rounds.length} rounds`}
          </p>

          {groups.map((group) => (
            <section key={group.key} className="history-group">
              <h2>{group.label}</h2>
              {group.rounds.map((r) => (
                <RoundCard
                  key={r.id}
                  round={r}
                  onOpen={() => open(r)}
                  onDelete={() => removeOne(r.id)}
                  selected={picked.has(r.id)}
                  onToggleSelect={selecting ? () => toggle(r.id) : undefined}
                />
              ))}
            </section>
          ))}
        </>
      )}

      {selecting && (
        <div className="history-bulk">
          <button className="btn-ghost" onClick={allShownPicked ? () => setPicked(new Set()) : selectAllShown}>
            {allShownPicked ? 'Clear' : 'Select all'}
          </button>
          {confirming ? (
            <>
              {/* A second tap, because this one cannot be undone and the
                  number is the part worth reading twice. */}
              <button className="btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={deletePicked}>
                Delete {picked.size} for good
              </button>
            </>
          ) : (
            <button
              className="btn-danger"
              disabled={picked.size === 0}
              onClick={() => setConfirming(true)}
            >
              Delete {picked.size > 0 ? picked.size : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
