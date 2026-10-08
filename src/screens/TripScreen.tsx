import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { getDistinct, listRounds, markDistinct, mergePeople, saveRound } from '../storage';
import { SamePersonNudge } from '../components/SamePerson';
import { likelySame } from '../people';
import { findTrip, tripCandidates, tripLedger, tripSettleText, withTrip } from '../trips';
import { formatMoney } from '../games/settlement';
import { seatColor } from '../player';
import { formatRoundDate } from '../roundDate';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RoundCard } from '../components/RoundCard';
import { CoinIcon, ShareIcon } from '../icons';

interface Props {
  tripId: string;
  onBack: () => void;
  onOpenRound: (round: Round) => void;
}

/** "Apr 1–3", "Apr 30 – May 2", or one day; the year only when it is not this one. */
export function tripDates(first: string, last: string, now: Date = new Date()): string {
  const d = (s: string) => {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y, m - 1, day);
  };
  const a = d(first);
  const b = d(last);
  const year = b.getFullYear() !== now.getFullYear() ? `, ${b.getFullYear()}` : '';
  const md = (x: Date) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (first === last) return md(a) + year;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${md(a)}–${b.getDate()}${year}`;
  return `${md(a)} – ${md(b)}${year}`;
}

async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return false;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * One trip: its money added up across every round and settled once, and the
 * rounds it is made of.
 *
 * The settle-up sits at the top because it is what the screen is for — the
 * last night of the trip, everyone at one table, one set of payments. The
 * rounds are underneath, each still opening its own card.
 */
export function TripScreen({ tripId, onBack, onOpenRound }: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds);
  const trip = useMemo(() => findTrip(rounds, tripId), [rounds, tripId]);
  const ledger = useMemo(() => (trip ? tripLedger(trip.rounds) : null), [trip]);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [distinct, setDistinct] = useState(getDistinct);
  // The one place a split name costs real money: "Al" owing "Alex" what
  // "Alex" owes himself. Asked here, above the payments it would change.
  const suggestion = useMemo(
    () => (trip ? (likelySame(trip.rounds, distinct)[0] ?? null) : null),
    [trip, distinct]
  );

  /** Writes every changed round and re-reads, so the screen shows what was saved. */
  const save = (changed: Round[]) => {
    for (const r of changed) saveRound(r);
    setRounds(listRounds());
  };

  if (!trip || !ledger) {
    // Every round taken off the trip: there is no trip left to show.
    return (
      <div className="screen trip">
        <header className="bar">
          <button className="btn-ghost icon back" onClick={onBack} aria-label="Back">
            ‹
          </button>
          <h1 tabIndex={-1}>Trip</h1>
          <span className="bar-spacer" aria-hidden="true" />
        </header>
        <p className="history-empty">This trip has no rounds left on this phone.</p>
      </div>
    );
  }

  const rename = () => {
    const name = draft.trim();
    if (name && name !== trip.name) save(trip.rounds.map((r) => withTrip(r, { id: trip.id, name })));
    setRenaming(false);
  };

  const toggleRound = (r: Round) => {
    // Taking the last round off would leave a trip with nothing in it and
    // nowhere to come back to; the screen says so rather than allowing it.
    if (r.trip?.id === trip.id && trip.rounds.length === 1) return;
    save([withTrip(r, r.trip?.id === trip.id ? null : { id: trip.id, name: trip.name })]);
  };

  const candidates = choosing ? tripCandidates(rounds, trip) : [];

  // Each player's badge colour from the latest round they are in, so Casey is
  // the same colour here as on the card the group has been looking at all day.
  const colorOf = (name: string, i: number) => seatColor(trip.rounds, name, i);
  const n = trip.rounds.length;

  return (
    <div className="screen trip">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>{trip.name}</h1>
        <button
          className="btn-ghost"
          onClick={() => {
            setDraft(trip.name);
            setRenaming((v) => !v);
          }}
        >
          {renaming ? 'Cancel' : 'Rename'}
        </button>
      </header>

      {renaming && (
        <form
          className="card trip-rename"
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <label className="field">
            <span>Trip name</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} />
          </label>
          <button className="btn-secondary" type="submit" disabled={!draft.trim()}>
            Save name
          </button>
        </form>
      )}

      <p className="trip-meta">
        {n} {n === 1 ? 'round' : 'rounds'} · {tripDates(trip.first, trip.last)}
        {ledger.unfinished > 0 && ` · ${ledger.unfinished} still in play`}
      </p>

      {suggestion && (
        <SamePersonNudge
          pair={suggestion}
          onMerge={() => {
            mergePeople(suggestion.from, suggestion.into);
            setRounds(listRounds());
          }}
          onDistinct={() => {
            markDistinct(suggestion.from, suggestion.into);
            setDistinct(getDistinct());
          }}
        />
      )}

      <section className="board settlement trip-settle">
        <div className="board-head">
          <h2 className="board-title">
            <CoinIcon size={16} /> Settle up
          </h2>
          {/* Only when it explains something: a round with no stakes adds
              nothing here, and the totals should not look like they missed it. */}
          {ledger.moneyRounds < n && ledger.moneyRounds > 0 && (
            <span className="board-status">
              {ledger.moneyRounds} of {n} had stakes
            </span>
          )}
        </div>

        {ledger.players.length === 0 ? (
          <div className="board-note">
            No money on these rounds yet. Set stakes on a round and it counts here.
          </div>
        ) : (
          <>
            <ol className="board-list net-list">
              {ledger.players.map((p, i) => (
                <li key={p.name} className="net-row">
                  <PlayerAvatar name={p.name} color={colorOf(p.name, i)} size={22} />
                  <span className="net-name">{p.name}</span>
                  <span className={`net-amount${p.total > 0 ? ' up' : p.total < 0 ? ' down' : ''}`}>
                    {p.total === 0 ? '—' : formatMoney(p.total)}
                  </span>
                </li>
              ))}
            </ol>
            <div className="payments">
              {ledger.transactions.length === 0 ? (
                <div className="all-even">Everyone's even</div>
              ) : (
                ledger.transactions.map((t, i) => (
                  <div key={i} className="payment">
                    <strong>{t.from}</strong> pays <strong>{t.to}</strong>
                    <span className="pay-amount">{formatMoney(t.amount)}</span>
                  </div>
                ))
              )}
            </div>
            <button
              className="btn-ghost trip-share"
              onClick={async () => setCopied(await shareText(trip.name, tripSettleText(trip, ledger)))}
            >
              <ShareIcon size={16} /> {copied ? 'Copied — paste it in the chat' : 'Send to the group'}
            </button>
          </>
        )}
      </section>

      <section className="trip-rounds">
        <div className="trip-rounds-head">
          <h2>Rounds</h2>
          <button className="link-btn" onClick={() => setChoosing((v) => !v)}>
            {choosing ? 'Done' : 'Add or remove'}
          </button>
        </div>

        {choosing ? (
          <>
            <p className="trip-meta">
              Rounds played within a week of the trip. Tap one to put it on the trip or take it
              off.
            </p>
            <ul className="trip-choose">
              {candidates.map((r) => {
                const on = r.trip?.id === trip.id;
                const last = on && trip.rounds.length === 1;
                return (
                  <li key={r.id}>
                    <button
                      className={`trip-choice${on ? ' on' : ''}`}
                      aria-pressed={on}
                      disabled={last}
                      onClick={() => toggleRound(r)}
                    >
                      <span className={`round-tick${on ? ' on' : ''}`} aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      <span className="trip-choice-text">
                        <span className="trip-choice-name">{r.course || 'Round'}</span>
                        <span className="trip-choice-sub">
                          {formatRoundDate(r.date)} · {r.players.map((p) => p.name).join(', ')}
                          {last ? ' · a trip needs one round' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          trip.rounds.map((r) => <RoundCard key={r.id} round={r} onOpen={() => onOpenRound(r)} hideTrip />)
        )}
      </section>
    </div>
  );
}
