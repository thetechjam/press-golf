import { useRef, useState } from 'react';
import { scoreLabel, scoreMarkClass } from '../scoreMark';
import { PlayerAvatar } from './PlayerAvatar';
import { ScoreChips } from './ScoreChips';

interface Props {
  id?: string;
  highlight?: boolean;
  name: string;
  color: string;
  value: number | null;
  par: number;
  strokesReceived?: number;
  /** Course handicap, shown as a small badge so you can see what net scores off. */
  handicap?: number;
  /**
   * League only: which matches give this player a stroke on this hole, e.g.
   * ['A', 'T']. Kept as plain strings so this component stays league-agnostic.
   */
  matchStrokes?: string[];
  onChange: (value: number | null) => void;
}

// Vibration API is Android-only (no-op on iOS Safari/PWA); softer for taps, firmer for birdie+.
const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

export function PlayerScoreRow({
  id,
  highlight = false,
  name,
  color,
  value,
  par,
  strokesReceived = 0,
  handicap,
  matchStrokes,
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

  return (
    <div id={id} className={`stepper tone-${tone}${highlight ? ' highlight' : ''}`}>
      <div className="stepper-name">
        <PlayerAvatar name={name} color={color} />
        <span className="stepper-name-text">{name}</span>
        {handicap != null && (
          <span className="stepper-hcp" aria-label={`Handicap ${handicap}`}>
            HCP {handicap}
          </span>
        )}
        {matchStrokes && matchStrokes.length > 0 && (
          <span
            className="lg-chips"
            aria-label={`Gets a stroke in: ${matchStrokes.join(', ')}`}
          >
            {matchStrokes.map((m) => (
              <span key={m} className="lg-chip">
                {m}
              </span>
            ))}
          </span>
        )}
        {!matchStrokes && strokesReceived > 0 && (
          <span className="hcp-dots" aria-label={`${strokesReceived} handicap strokes`}>
            {'•'.repeat(strokesReceived)}
          </span>
        )}
        {/* Display only — the chips are the control. Must not be styled as one. */}
        <span className="stepper-value" aria-hidden="true">
          <span
            className={`score-num${value == null ? '' : ` ${scoreMarkClass(toPar)}`}${
              celebrating ? ' celebrate' : ''
            }`}
            key={value ?? 'empty'}
          >
            {value ?? '–'}
          </span>
          <span className="score-tag">{value == null ? 'tap' : scoreLabel(toPar)}</span>
        </span>
      </div>
      <ScoreChips
        name={name}
        par={par}
        value={value}
        // Clearing must not buzz or celebrate — commit() is for real scores only.
        onChange={(v) => (v == null ? onChange(null) : commit(v))}
      />
    </div>
  );
}
