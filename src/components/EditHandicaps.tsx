import { useState } from 'react';
import type { Round } from '../types';
import { applyHandicaps, editsIndex, validateHandicaps, type HandicapEdits } from '../games/roundEdits';
import { courseHandicapFor, formatHandicap } from '../games/handicap';
import { Sheet } from './Sheet';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onClose: () => void;
}

export function EditHandicaps({ round, onChange, onClose }: Props) {
  const [edits, setEdits] = useState<HandicapEdits>({});
  const [error, setError] = useState<string | null>(null);

  // On a course with a slope and rating the strokes come from each player's
  // Index, so that is the number on offer — the sheet used to show a blank
  // stroke count for every Index player and ignore whatever was typed in it.
  const index = editsIndex(round);
  const valueFor = (id: string) => {
    if (id in edits) return edits[id] ?? '';
    const p = round.players.find((q) => q.id === id);
    return (index ? p?.index : p?.handicap) ?? '';
  };
  /** What the number on screen is worth here, for an Index edit in progress. */
  const playsOff = (id: string): number | null => {
    const p = round.players.find((q) => q.id === id);
    if (!index || !p) return null;
    const v = valueFor(id);
    if (v === '') return null;
    const next = applyHandicaps(round, { [id]: Number(v) });
    return courseHandicapFor(next, next.players.find((q) => q.id === id) ?? p);
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
          <span className="player-index">
          <input
            className="player-hcp"
            type="number"
            min={-10}
            max={54}
            step={index ? 0.1 : 1}
            value={valueFor(p.id)}
            placeholder={index ? 'Index' : 'HCP'}
            aria-label={`${index ? 'Handicap Index' : 'Handicap'} for ${p.name}`}
            onChange={(e) => {
              setError(null);
              setEdits({
                ...edits,
                [p.id]: e.target.value === '' ? undefined : Number(e.target.value),
              });
            }}
          />
          {playsOff(p.id) != null && (
            <span className="player-derived" aria-label={`Plays off ${formatHandicap(playsOff(p.id)!)} here`}>
              <span aria-hidden="true" className="player-derived-arrow">→</span>
              {formatHandicap(playsOff(p.id)!)}
            </span>
          )}
          </span>
        </label>
      ))}
      {index && (
        <p className="hint">
          This course has a slope and rating, so each player’s Handicap Index sets what they play
          off here.
        </p>
      )}
      {error && <p className="warn-banner" role="alert">{error}</p>}
      <button className="btn-primary big" onClick={save}>
        Save handicaps
      </button>
    </Sheet>
  );
}
