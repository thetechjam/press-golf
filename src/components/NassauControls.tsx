import type { Round, Hole } from '../types';
import { matchSegmentSides } from '../games/matchPlay';
import { nineHolesFor, endOfNine, nassauTeams } from '../games/nassau';

interface Props {
  round: Round;
  hole: Hole;
  onChange: (presses: number[]) => void;
}

export function NassauControls({ round, hole, onChange }: Props) {
  if (round.players.length < 2) return null;

  const { a, b } = nassauTeams(round);
  const nine = nineHolesFor(round, hole.number);
  const hasBackNine = round.holes.some((h) => h.number > 9);
  const nineLabel = !hasBackNine ? 'Match' : hole.number <= 9 ? 'Front' : 'Back';
  const seg = matchSegmentSides(round, nine, a, b);
  const end = endOfNine(round, hole.number);
  // A press starts even on the remaining holes of this nine, i.e. the next hole.
  const start = hole.number + 1;

  const presses = round.presses ?? [];
  const alreadyHere = presses.includes(start);
  const canPress = start <= end;

  const addPress = () => {
    if (!alreadyHere && canPress) onChange([...presses, start]);
  };
  const removePress = (s: number) => onChange(presses.filter((x) => x !== s));

  return (
    <div className="nassau">
      <div className="nassau-head">
        ⛳ Nassau · {nineLabel}: <strong>{seg.status}</strong>
      </div>
      <button className="press-btn" onClick={addPress} disabled={alreadyHere || !canPress}>
        {alreadyHere
          ? '✓ Press added'
          : canPress
            ? `Press — new bet on holes ${start}–${end}`
            : 'No holes left to press'}
      </button>
      {presses.length > 0 && (
        <div className="press-list">
          {[...presses]
            .sort((a, b) => a - b)
            .map((start) => (
              <span key={start} className="press-chip">
                Press h{start}–{endOfNine(round, start)}
                <button
                  onClick={() => removePress(start)}
                  aria-label={`Remove press starting hole ${start}`}
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
