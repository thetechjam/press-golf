interface Props {
  name: string;
  value: number | null;
  par: number;
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

export function HoleStepper({ name, value, par, onChange }: Props) {
  const toPar = value == null ? 0 : value - par;
  const tone =
    value == null ? 'empty' : toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even';

  const dec = () => onChange(value == null ? par : Math.max(1, value - 1));
  const inc = () => onChange(value == null ? par : Math.min(15, value + 1));

  return (
    <div className={`stepper tone-${tone}`}>
      <div className="stepper-name">{name}</div>
      <div className="stepper-controls">
        <button className="step-btn" onClick={dec} aria-label={`Lower ${name}'s score`}>
          −
        </button>
        <div className="stepper-value">
          <span className="score-num">{value ?? '–'}</span>
          <span className="score-tag">{value == null ? 'tap' : labelFor(toPar)}</span>
        </div>
        <button className="step-btn" onClick={inc} aria-label={`Raise ${name}'s score`}>
          +
        </button>
      </div>
    </div>
  );
}
