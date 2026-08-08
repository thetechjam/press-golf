import { chipRange, nextValue } from '../scoreChips';
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
  const chips = chipRange(par);

  return (
    <div className="score-chips" role="radiogroup" aria-label={`${name}'s score, par ${par}`}>
      {chips.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}, ${scoreLabel(n - par)}`}
          className={`score-chip${n === par ? ' par' : ''}`}
          onClick={() => onChange(nextValue(value, n))}
        >
          {n}
        </button>
      ))}
      {/* Laid out now so the row's widths settle in one pass, but disabled
          until Task 3 wires it — a tappable control that does nothing is
          worse than one that's visibly not ready. */}
      <button
        type="button"
        className="score-chip score-more"
        aria-label={`More scores for ${name}`}
        disabled
      >
        …
      </button>
    </div>
  );
}
