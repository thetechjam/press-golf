import type { RosterEntry } from '../roster';

/** At most this many names before the crew chip elides the rest. */
const CREW_NAMES_SHOWN = 3;

function crewLabel(crew: RosterEntry[]): string {
  const shown = crew
    .slice(0, CREW_NAMES_SHOWN)
    .map((e) => e.name)
    .join(', ');
  const rest = crew.length - CREW_NAMES_SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/*
 * Shortcuts that fill the player list from past rounds.
 *
 * Two components rather than one, because the two groups belong in different
 * places: the crew chip acts on the whole list, so it sits above the player
 * rows; the recent chips append a single player, so they sit beside the other
 * control that adds one. Rendering both together pushed the name inputs — the
 * primary controls — down behind a cloud of chips.
 *
 * Each renders nothing when it has nothing to offer, independently of the
 * other. On a first-ever round both are simply absent. An empty affordance
 * ("no saved players yet") is worse than an absent one.
 */

interface CrewChipProps {
  /** The last round's players. Empty renders nothing. */
  crew: RosterEntry[];
  onUseCrew: () => void;
}

export function CrewChip({ crew, onUseCrew }: CrewChipProps) {
  if (crew.length === 0) return null;

  return (
    <button className="crew-chip" onClick={onUseCrew}>
      <span className="crew-chip-title">Same crew</span>
      <span className="crew-chip-names">{crewLabel(crew)}</span>
    </button>
  );
}

interface RecentChipsProps {
  /** Remembered players not already in the form. Empty renders nothing. */
  recent: RosterEntry[];
  onAdd: (entry: RosterEntry) => void;
}

export function RecentChips({ recent, onAdd }: RecentChipsProps) {
  if (recent.length === 0) return null;

  return (
    <div className="recent-chips">
      <span className="recent-chips-label">Recent</span>
      {recent.map((e) => (
        <button
          key={e.name}
          className="recent-chip"
          onClick={() => onAdd(e)}
          aria-label={`Add ${e.name}`}
        >
          {e.name}
        </button>
      ))}
    </div>
  );
}
