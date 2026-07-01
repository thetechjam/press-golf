interface Props {
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

const buzz = () => navigator.vibrate?.(10);

export function HoleStepper({ name, value, par, strokesReceived = 0, onChange }: Props) {
  const toPar = value == null ? 0 : value - par;
  const tone =
    value == null ? 'empty' : toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even';

  const dec = () => {
    buzz();
    onChange(value == null ? par : Math.max(1, value - 1));
  };
  const inc = () => {
    buzz();
    onChange(value == null ? par : Math.min(15, value + 1));
  };

  return (
    <div className={`stepper tone-${tone}`}>
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
          <span className="score-num" key={value ?? 'empty'}>
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
