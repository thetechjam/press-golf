import { useState } from 'react';
import { chipRange, nextValue, overflowRange } from '../scoreChips';
import { scoreLabel } from '../scoreMark';

interface Props {
  /** Player name, for the group's accessible label. */
  name: string;
  par: number;
  value: number | null;
  /** null means "clear this score" — see nextValue. */
  onChange: (value: number | null) => void;
}

export function ScoreChips({ name, par, value, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  const chips = chipRange(par);
  // A score outside the inline range lives behind "…" — mark the chip so the
  // row doesn't read as empty when a 9 is entered on a par 4.
  const hidden = value != null && !chips.includes(value);

  const pick = (n: number) => {
    onChange(nextValue(value, n));
    setShowAll(false);
  };

  return (
    <div className="score-chips-wrap">
      <div className="score-chips">
        {/* .score-chip-group is display:contents — its five buttons lay out
            as direct flex items of .score-chips (same row as before) while
            still being real DOM descendants of the radiogroup. The "…"
            button is a disclosure, not a score choice, so it stays a plain
            button outside the group instead of a non-radio child of it. */}
        <div
          className="score-chip-group"
          role="radiogroup"
          aria-label={`${name}'s score, par ${par}`}
        >
          {chips.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n}, ${scoreLabel(n - par)}`}
              className={`score-chip${n === par ? ' par' : ''}`}
              onClick={() => pick(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`score-chip score-more${hidden ? ' has-value' : ''}`}
          aria-expanded={showAll}
          aria-label={`More scores for ${name}`}
          onClick={() => setShowAll((s) => !s)}
        >
          {hidden ? value : '…'}
        </button>
      </div>

      {showAll && (
        <div className="score-overflow" role="group" aria-label={`All scores for ${name}`}>
          {overflowRange().map((n) => (
            <button
              key={n}
              type="button"
              className={`score-chip${value === n ? ' sel' : ''}`}
              aria-label={`${n}, ${scoreLabel(n - par)}`}
              onClick={() => pick(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
