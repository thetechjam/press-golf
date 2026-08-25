import type { RosterEntry } from '../roster';

interface Props {
  /** The last round's players. Empty hides the crew chip. */
  crew: RosterEntry[];
  /** Remembered players not already in the form. Empty hides the row. */
  recent: RosterEntry[];
  onUseCrew: () => void;
  onAdd: (entry: RosterEntry) => void;
}

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

/**
 * Shortcuts that fill the player list from past rounds.
 *
 * Both groups render nothing when they have nothing to offer — on a
 * first-ever round this component is simply absent. An empty affordance
 * ("no saved players yet") is worse than an absent one.
 */
export function RosterChips({ crew, recent, onUseCrew, onAdd }: Props) {
  if (crew.length === 0 && recent.length === 0) return null;

  return (
    <>
      {crew.length > 0 && (
        <button className="crew-chip" onClick={onUseCrew}>
          <span className="crew-chip-title">Same crew</span>
          <span className="crew-chip-names">{crewLabel(crew)}</span>
        </button>
      )}
      {recent.length > 0 && (
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
      )}
    </>
  );
}
