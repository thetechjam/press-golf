import { useState } from 'react';
import type { Round, Hole } from '../types';
import { matchSegmentSides } from '../games/matchPlay';
import { nineHolesFor, endOfNine, nassauTeams, autoPressStarts } from '../games/nassau';
import { FlagIcon } from '../icons';

interface Props {
  round: Round;
  hole: Hole;
  onChange: (presses: number[]) => void;
}

export function NassauControls({ round, hole, onChange }: Props) {
  const [open, setOpen] = useState(false);
  if (round.players.length < 2) return null;

  const { a, b } = nassauTeams(round);
  const nine = nineHolesFor(round, hole.number);
  const hasBackNine = round.holes.some((h) => h.number > 9);
  const nineLabel = !hasBackNine ? 'Match' : hole.number <= 9 ? 'Front' : 'Back';
  const seg = matchSegmentSides(round, nine, a, b, 'nassau');
  const end = endOfNine(round, hole.number);
  // A press starts even on the remaining holes of this nine, i.e. the next hole.
  const start = hole.number + 1;

  const presses = round.presses ?? [];
  // Derived from the card, so they appear and disappear as scores are entered
  // and corrected — which is also why they carry no remove button.
  const auto = autoPressStarts(round);
  const allPresses = [...new Set([...presses, ...auto])].sort((x, y) => x - y);
  const alreadyHere = allPresses.includes(start);
  const canPress = start <= end;

  const addPress = () => {
    if (!alreadyHere && canPress) onChange([...presses, start]);
  };
  const removePress = (s: number) => onChange(presses.filter((x) => x !== s));

  if (!open) {
    return (
      <button className="nassau collapsed" onClick={() => setOpen(true)} aria-expanded={false}>
        <FlagIcon size={14} />
        <span className="collapsed-text">
          {nineLabel}: {seg.status}
        </span>
        <span className="collapsed-hint">
          {allPresses.length ? `${allPresses.length} press` : 'Press'}
        </span>
      </button>
    );
  }

  return (
    <div className="nassau">
      <div className="nassau-head">
        <FlagIcon size={14} /> Nassau · {nineLabel}: <strong>{seg.status}</strong>
      </div>
      <button className="press-btn" onClick={addPress} disabled={alreadyHere || !canPress}>
        {alreadyHere
          ? auto.includes(start) && !presses.includes(start)
            ? '✓ Pressed automatically'
            : '✓ Press added'
          : canPress
            ? `Press — new bet on holes ${start}–${end}`
            : 'No holes left to press'}
      </button>
      {allPresses.length > 0 && (
        <div className="press-list">
          {allPresses.map((s) => {
            const isAuto = !presses.includes(s);
            return (
              <span key={s} className={`press-chip${isAuto ? ' auto' : ''}`}>
                Press {s}–{endOfNine(round, s)}
                {isAuto ? (
                  <span className="press-auto" title="Started by the 2-down rule">
                    auto
                  </span>
                ) : (
                  <button
                    onClick={() => removePress(s)}
                    aria-label={`Remove press starting hole ${s}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
