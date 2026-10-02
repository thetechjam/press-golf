import { useState } from 'react';
import type { LikelySame } from '../people';

/**
 * "Al and Alex might be the same person." Shown where a split name costs
 * something — a trip's settle-up, the Stats cards — and only for a pair that
 * looks alike, has never been on one card together, and has not been
 * answered. Either answer is remembered.
 */
export function SamePersonNudge({
  pair,
  onMerge,
  onDistinct,
}: {
  pair: LikelySame;
  onMerge: () => void;
  onDistinct: () => void;
}) {
  return (
    <div className="same-person nudge">
      <p>
        <strong>{pair.from}</strong> and <strong>{pair.into}</strong> might be the same person.
        Counted as one, their rounds and money add up together.
      </p>
      <div className="same-person-actions">
        <button className="btn-secondary" onClick={onMerge}>
          Same person — use {pair.into}
        </button>
        <button className="btn-ghost" onClick={onDistinct}>
          Two people
        </button>
      </div>
    </div>
  );
}

/**
 * Merging one player into another by hand, for the names nothing could have
 * guessed belong together ("Big Mike" and "Mike T"). Two taps and a
 * confirmation that says what will change, because it changes every round.
 */
export function MergeInto({
  name,
  others,
  onMerge,
}: {
  name: string;
  others: string[];
  onMerge: (into: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [into, setInto] = useState<string | null>(null);

  if (!others.length) return null;
  if (!open)
    return (
      <button className="link-btn merge-open" onClick={() => setOpen(true)}>
        Same person as someone else?
      </button>
    );

  return (
    <div className="merge-into">
      {into ? (
        <>
          <p>
            Count <strong>{name}</strong> as <strong>{into}</strong>? Every round with {name} on it
            will show {into}.
          </p>
          <div className="same-person-actions">
            <button className="btn-secondary" onClick={() => onMerge(into)}>
              Merge into {into}
            </button>
            <button className="btn-ghost" onClick={() => setInto(null)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{name} is the same person as…</p>
          <div className="trip-chips">
            {others.map((o) => (
              <button key={o} className="recent-chip" onClick={() => setInto(o)}>
                {o}
              </button>
            ))}
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
