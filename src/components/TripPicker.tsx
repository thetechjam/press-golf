import { useState } from 'react';
import type { RoundTrip } from '../types';
import type { Trip } from '../trips';
import { uid } from '../storage';

interface Props {
  /** Recent trips to offer, newest first. */
  trips: Trip[];
  value: RoundTrip | null;
  onChange: (trip: RoundTrip | null) => void;
}

/** How many past trips to offer. Past that, it is not the trip you are on. */
const OFFERED = 3;

/**
 * Which trip a new round is part of: none, one already going, or a new one.
 *
 * Chips rather than a select, because the choice is almost always between
 * "no trip" and the one trip being played this week, and a select hides both
 * behind a tap. A new trip only needs a name; it exists once a round names it.
 */
export function TripPicker({ trips, value, onChange }: Props) {
  const offered = trips.slice(0, OFFERED);
  const known = !value || offered.some((t) => t.id === value.id);
  // Typing a new trip's name: open when the current value is a trip not in
  // the list, which only a new one can be.
  const [naming, setNaming] = useState(!known);
  const [draft, setDraft] = useState(known ? '' : (value?.name ?? ''));
  // One id per new trip, kept while the name is edited so the round does not
  // get a fresh trip for every keystroke.
  const [newId] = useState(uid);

  const pick = (t: RoundTrip | null) => {
    setNaming(false);
    onChange(t);
  };
  const type = (name: string) => {
    setDraft(name);
    onChange(name.trim() ? { id: newId, name: name.trim() } : null);
  };

  return (
    <div className="trip-picker">
      <div className="trip-chips" role="group" aria-label="Trip">
        <button
          className={`recent-chip trip-chip${!value && !naming ? ' on' : ''}`}
          aria-pressed={!value && !naming}
          onClick={() => pick(null)}
        >
          No trip
        </button>
        {offered.map((t) => {
          const on = !naming && value?.id === t.id;
          return (
            <button
              key={t.id}
              className={`recent-chip trip-chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => pick({ id: t.id, name: t.name })}
            >
              {t.name}
            </button>
          );
        })}
        <button
          className={`recent-chip trip-chip${naming ? ' on' : ''}`}
          aria-pressed={naming}
          onClick={() => {
            setNaming(true);
            onChange(draft.trim() ? { id: newId, name: draft.trim() } : null);
          }}
        >
          + New trip
        </button>
      </div>

      {naming && (
        <label className="field trip-name">
          <span>Trip name</span>
          <input
            value={draft}
            onChange={(e) => type(e.target.value)}
            placeholder="e.g. Myrtle ’27"
            autoCapitalize="words"
            maxLength={40}
            // Opened by a tap on "+ New trip", so the keyboard is the next thing
            // wanted.
            autoFocus
          />
        </label>
      )}

      <p className="hint">
        Rounds on a trip settle up once at the end, across every round, instead of after each
        one.
      </p>
    </div>
  );
}
