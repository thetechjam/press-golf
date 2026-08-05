import { useState } from 'react';
import type { Round } from '../types';
import { strokeIndexMap, strokesReceivedOnHole, usesHandicaps } from '../games/handicap';
import { scoreMarkClass } from '../scoreMark';

interface Props {
  round: Round;
  currentHole?: number;
  onJumpToHole?: (index: number) => void;
  onScore?: (holeNumber: number, playerId: string, value: number | null) => void;
}

/** Full-round grid: holes across, players down. Tap a cell to type a score directly. */
export function Scorecard({ round, currentHole, onJumpToHole, onScore }: Props) {
  const { holes, players } = round;
  const useNet = round.options.useNet;
  const showHcp = usesHandicaps(round);
  const siMap = strokeIndexMap(round);
  const parTotal = holes.reduce((s, h) => s + h.par, 0);
  const [editing, setEditing] = useState<{ playerId: string; holeNumber: number } | null>(null);

  const toParStr = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

  // Clamped to the same 1..15 range the stepper enforces; empty clears the score.
  const commit = (playerId: string, holeNumber: number, raw: string) => {
    if (!onScore) return;
    if (raw.trim() === '') return onScore(holeNumber, playerId, null);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onScore(holeNumber, playerId, Math.min(15, Math.max(1, Math.round(n))));
  };

  const jumpProps = (i: number) =>
    onJumpToHole
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: () => onJumpToHole(i),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onJumpToHole(i);
            }
          },
        }
      : {};

  return (
    <div className="card-scroll">
      <table className="scorecard">
        <thead>
          <tr>
            <th className="sc-corner">Hole</th>
            {holes.map((h, i) => (
              <th
                key={h.number}
                className={`sc-hole${h.number === currentHole ? ' current' : ''}`}
                {...jumpProps(i)}
              >
                {h.number}
              </th>
            ))}
            <th className="sc-total">Tot</th>
            <th className="sc-total">+/−</th>
          </tr>
          <tr className="sc-par-row">
            <th className="sc-corner">Par</th>
            {holes.map((h) => (
              <td key={h.number}>{h.par}</td>
            ))}
            <td className="sc-total">{parTotal}</td>
            <td className="sc-total" />
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            let gross = 0;
            let played = 0;
            let playedPar = 0;
            return (
              <tr key={p.id}>
                <th className="sc-name">
                  <span className="sc-name-text">{p.name}</span>
                  {showHcp && (
                    <span className="sc-hcp" aria-label={`Handicap ${p.handicap ?? 0}`}>
                      {p.handicap ?? 0}
                    </span>
                  )}
                </th>
                {holes.map((h) => {
                  const raw = round.scores[h.number]?.[p.id] ?? null;
                  if (raw != null) {
                    gross += raw;
                    played += 1;
                    playedPar += h.par;
                  }
                  const toPar = raw == null ? 0 : raw - h.par;
                  const tone =
                    raw == null ? '' : toPar < 0 ? ' under' : toPar > 0 ? ' over' : ' even';
                  const dots = useNet
                    ? strokesReceivedOnHole(p.handicap ?? 0, siMap[h.number], holes.length)
                    : 0;
                  const isEditing =
                    editing?.playerId === p.id && editing?.holeNumber === h.number;
                  return (
                    <td
                      key={h.number}
                      className={`sc-cell${tone}${h.number === currentHole ? ' current' : ''}`}
                    >
                      {isEditing ? (
                        <input
                          className="sc-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={15}
                          autoFocus
                          defaultValue={raw ?? ''}
                          onBlur={(e) => {
                            commit(p.id, h.number, e.target.value);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          className="sc-cell-btn"
                          onClick={() => onScore && setEditing({ playerId: p.id, holeNumber: h.number })}
                          aria-label={`${p.name}, hole ${h.number}${raw != null ? `, ${raw}` : ', no score'}`}
                        >
                          {raw != null && <span className={scoreMarkClass(toPar)}>{raw}</span>}
                          {dots > 0 && <span className="sc-dots">{'•'.repeat(dots)}</span>}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="sc-total">{played ? gross : ''}</td>
                <td className="sc-total">{played ? toParStr(gross - playedPar) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
