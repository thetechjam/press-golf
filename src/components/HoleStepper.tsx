import { useRef, useState } from 'react';
import { scoreMarkClass } from '../scoreMark';

interface Props {
  id?: string;
  highlight?: boolean;
  name: string;
  value: number | null;
  par: number;
  strokesReceived?: number;
  onChange: (value: number | null) => void;
}

const labelFor = (toPar: number): string => {
  if (toPar <= -3) return 'Albatross';
  if (toPar === -2) return 'Eagle';
  if (toPar === -1) return 'Birdie';
  if (toPar === 0) return 'Par';
  if (toPar === 1) return 'Bogey';
  if (toPar === 2) return 'Double';
  return `+${toPar}`;
};

// Vibration API is Android-only (no-op on iOS Safari/PWA); softer for taps, firmer for birdie+.
const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

export function HoleStepper({
  id,
  highlight = false,
  name,
  value,
  par,
  strokesReceived = 0,
  onChange,
}: Props) {
  const toPar = value == null ? 0 : value - par;
  const tone =
    value == null ? 'empty' : toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even';

  // Celebrate is scoped to the exact score it fired on, so it never carries onto
  // another hole: navigation swaps `value`, the match breaks, and the glow stops.
  const [celebrateFor, setCelebrateFor] = useState<number | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const celebrating = celebrateFor != null && celebrateFor === value && toPar < 0;

  const commit = (next: number) => {
    if (next - par < 0) {
      buzz([12, 30, 18]);
      setCelebrateFor(next);
      clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrateFor(null), 900);
    } else {
      buzz(10);
      setCelebrateFor(null);
    }
    onChange(next);
  };

  const dec = () => commit(value == null ? par : Math.max(1, value - 1));
  const inc = () => commit(value == null ? par : Math.min(15, value + 1));

  return (
    <div id={id} className={`stepper tone-${tone}${highlight ? ' highlight' : ''}`}>
      <div className="stepper-name">
        {name}
        {strokesReceived > 0 && (
          <span className="hcp-dots" aria-label={`${strokesReceived} handicap strokes`}>
            {'•'.repeat(strokesReceived)}
          </span>
        )}
      </div>
      <div className="stepper-controls">
        <button className="step-btn" onClick={dec} aria-label={`Lower ${name}'s score`}>
          −
        </button>
        <div className="stepper-value">
          {/* key forces a remount so the pop animation replays on each change */}
          <span
            className={`score-num${value == null ? '' : ` ${scoreMarkClass(toPar)}`}${
              celebrating ? ' celebrate' : ''
            }`}
            key={value ?? 'empty'}
          >
            {value ?? '–'}
          </span>
          <span className="score-tag">{value == null ? 'tap' : labelFor(toPar)}</span>
        </div>
        <button className="step-btn" onClick={inc} aria-label={`Raise ${name}'s score`}>
          +
        </button>
      </div>
    </div>
  );
}
