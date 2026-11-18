import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { listRounds, deleteRound, deleteRounds, ROUNDS_KEY } from '../storage';
import { notSavedReason } from '../notSaved';
import { RoundCard } from '../components/RoundCard';
import {
  searchRounds,
  filterByStatus,
  filterByKind,
  groupByMonth,
  describeEmpty,
  isLeagueRound,
  isScrambleRound,
} from '../history';
import type { KindFilter, StatusFilter } from '../history';
import { XIcon } from '../icons';
import { count } from '../plural';

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
 * "Both" rather than "All", so it is not the same word twice in two rows —
 * and rather than "All rounds", which wrapped to two lines on a 360px phone
 * and made this row taller than the one above it.
 */
const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Both' },
  { id: 'league', label: 'League' },
  { id: 'scramble', label: 'Scramble' },
  { id: 'regular', label: 'Regular' },
];

/** The rounds a search and the two filters leave on screen. */
const showing = (rounds: Round[], q: string, st: StatusFilter, k: KindFilter) =>
  filterByKind(filterByStatus(searchRounds(rounds, q), st), k);

const kindOf = (r: Round): KindFilter =>
  isLeagueRound(r) ? 'league' : isScrambleRound(r) ? 'scramble' : 'regular';

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
  const [kind, setKind] = useState<KindFilter>('all');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // A delete the phone refused. Rare — a delete only shrinks what is stored —
  // but it used to throw out of the button, and on native, for a key Press
  // could not read at startup, it always does.
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const deleted = (ok: boolean, howMany = 1) =>
    setSaveFailed(
      ok
        ? null
        : `${howMany > 1 ? 'Those rounds were' : 'That round was'} not deleted. ${notSavedReason(ROUNDS_KEY, true)}`
    );

  const shown = useMemo(() => showing(rounds, query, status, kind), [rounds, query, status, kind]);
  // Only offered when there is something to tell apart: somebody who has
  // never played a league night does not need a League filter, and somebody
  // who only plays them does not need a Regular one. Kept up while a filter
  // is set, so deleting the last of one kind cannot strand it.
  // The same goes for each kind: only the ones on this phone are offered, so
  // somebody who has never played a scramble is not handed a fourth segment.
  const present = useMemo(() => new Set(rounds.map(kindOf)), [rounds]);
  const mixed = present.size > 1;
  const kinds = KINDS.filter((k) => k.id === 'all' || k.id === kind || present.has(k.id)).map(
    // "Both" is only true of two; with three kinds it is every one of them.
    (k, _, shown) => (k.id === 'all' && shown.length > 3 ? { ...k, label: 'Any' } : k)
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);

  /**
   * The ticked rounds that are on screen — the only ones a delete may touch.
   *
   * A tick used to outlive the search or filter that showed it, so ticking
   * twelve, searching for one course and pressing Delete took eleven rounds
   * nobody could see. `narrow` drops ticks as rounds leave the list, so
   * widening it again does not bring them back armed; deleting only from
   * this intersection as well keeps the button's count and the delete the
   * same number whatever path the list took to get here.
   */
  const chosen = useMemo(() => shown.filter((r) => picked.has(r.id)), [shown, picked]);

  /** Applies a new search or filter, letting go of ticks it hides. */
  const narrow = (q: string, st: StatusFilter, k: KindFilter) => {
    setQuery(q);
    setStatus(st);
    setKind(k);
    const visible = new Set(showing(rounds, q, st, k).map((r) => r.id));
    if ([...picked].every((id) => visible.has(id))) return;
    setPicked(new Set([...picked].filter((id) => visible.has(id))));
    // The number on the second tap is the one that was read; if it changed
    // under the user, they read it again.
    setConfirming(false);
  };

  const open = (round: Round) =>
    round.status === 'finished' ? onViewResults(round) : onResume(round);

  const removeOne = (id: string) => {
    deleted(deleteRound(id));
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
    // One write for all of them, so a refusal leaves every picked round, not some.
    const ids = new Set(chosen.map((r) => r.id));
    deleted(deleteRounds(ids), ids.size);
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

      {saveFailed && (
        <div className="unsaved" role="alert">
          <strong>Not saved.</strong> {saveFailed}
        </div>
      )}

      {rounds.length > 0 && (
        <div className="history-tools">
          <div className="history-search">
            <input
              type="search"
              value={query}
              onChange={(e) => narrow(e.target.value, status, kind)}
              placeholder="Search course, player or game"
              aria-label="Search rounds"
            />
            {query && (
              <button
                className="history-clear"
                onClick={() => narrow('', status, kind)}
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
                onClick={() => narrow(query, f.id, kind)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {(mixed || kind !== 'all') && (
            <div className="seg history-filter" role="group" aria-label="Kind of round">
              {kinds.map((k) => (
                <button
                  key={k.id}
                  className={`seg-btn${kind === k.id ? ' active' : ''}`}
                  aria-pressed={kind === k.id}
                  onClick={() => narrow(query, status, k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="history-empty">{describeEmpty(query, status, kind)}</p>
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
                Delete {count(chosen.length, 'round')} for good
              </button>
            </>
          ) : (
            <button
              className="btn-danger"
              disabled={chosen.length === 0}
              onClick={() => setConfirming(true)}
            >
              {chosen.length > 0 ? `Delete ${count(chosen.length, 'round')}` : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
