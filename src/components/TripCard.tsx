import { useMemo } from 'react';
import type { Trip } from '../trips';
import { tripLedger } from '../trips';
import { formatMoney } from '../games/settlement';
import { CoinIcon } from '../icons';

/**
 * Home's way to the trip being played: its name, where the money stands
 * across every round so far, and the way to settle up.
 *
 * Only for a trip touched in the last few days (`activeTrip`). A finished
 * trip is reached from its rounds, not from the top of Home a month later.
 */
export function TripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const ledger = useMemo(() => tripLedger(trip.rounds), [trip]);
  const top = ledger.players[0];
  const bottom = ledger.players[ledger.players.length - 1];
  const n = trip.rounds.length;

  return (
    <button className="trip-card" onClick={onOpen}>
      <span className="trip-card-eyebrow">
        <CoinIcon size={14} /> Trip · {n} {n === 1 ? 'round' : 'rounds'}
      </span>
      <span className="trip-card-name">{trip.name}</span>
      <span className="trip-card-standing">
        {top && top.total > 0 ? (
          <>
            <span className="up">
              {top.name} up {formatMoney(top.total)}
            </span>{' '}
            ·{' '}
            <span className="down">
              {bottom.name} down {formatMoney(-bottom.total)}
            </span>
          </>
        ) : ledger.moneyRounds > 0 ? (
          'All square across the trip'
        ) : (
          'No money on it yet'
        )}
      </span>
      <span className="trip-card-cta">
        Trip settle-up <span aria-hidden="true">›</span>
      </span>
    </button>
  );
}
