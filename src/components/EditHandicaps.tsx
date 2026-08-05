import { useState } from 'react';
import type { Round } from '../types';
import { applyHandicaps, validateHandicaps, type HandicapEdits } from '../games/roundEdits';
import { Sheet } from './Sheet';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onClose: () => void;
}

export function EditHandicaps({ round, onChange, onClose }: Props) {
  const [edits, setEdits] = useState<HandicapEdits>({});
  const [error, setError] = useState<string | null>(null);

  const valueFor = (id: string) => {
    if (id in edits) return edits[id] ?? '';
    return round.players.find((p) => p.id === id)?.handicap ?? '';
  };

  const save = () => {
    const err = validateHandicaps(round, edits);
    if (err) return setError(err);
    onChange(applyHandicaps(round, edits));
    onClose();
  };

  return (
    <Sheet title="Edit handicaps" onClose={onClose}>
      {round.players.map((p) => (
        <label key={p.id} className="hcp-edit-row">
          <span className="hcp-edit-name">{p.name}</span>
          <input
            className="player-hcp"
            type="number"
            inputMode="numeric"
            min={0}
            max={54}
            value={valueFor(p.id)}
            placeholder="HCP"
            onChange={(e) => {
              setError(null);
              setEdits({
                ...edits,
                [p.id]: e.target.value === '' ? undefined : Number(e.target.value),
              });
            }}
          />
        </label>
      ))}
      {error && <p className="warn-banner" role="alert">{error}</p>}
      <button className="btn-primary big" onClick={save}>
        Save handicaps
      </button>
    </Sheet>
  );
}
