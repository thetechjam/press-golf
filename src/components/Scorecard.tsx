import { useState } from 'react';
import type { Round } from '../types';
import { buildScorecard, formatToPar } from '../scorecardModel';
import { clampScore } from '../scoreEntry';

interface Props {
  round: Round;
  currentHole?: number;
  onJumpToHole?: (index: number) => void;
  onScore?: (holeNumber: number, playerId: string, value: number | null) => void;
}

/** Full-round grid: holes across, players down. Tap a cell to type a score directly. */
export function Scorecard({ round, currentHole, onJumpToHole, onScore }: Props) {
  const model = buildScorecard(round);
  const [editing, setEditing] = useState<{ playerId: string; holeNumber: number } | null>(null);

  // Clamped to the same 1..15 range the stepper enforces; empty clears the score.
  const commit = (playerId: string, holeNumber: number, raw: string) => {
    if (!onScore) return;
    const value = clampScore(raw);
    if (value === undefined) return;
    onScore(holeNumber, playerId, value);
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
            {model.holes.map((h, i) => (
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
            {model.holes.map((h) => (
              <td key={h.number}>{h.par}</td>
            ))}
            <td className="sc-total">{model.parTotal}</td>
            <td className="sc-total" />
          </tr>
          {/* Stroke index is a fact about the course, so it shows in gross play too. */}
          <tr className="sc-si-row">
            <th className="sc-corner" title="Stroke index — hole difficulty rank">
              SI
            </th>
            {model.holes.map((h) => (
              <td key={h.number}>{h.strokeIndex}</td>
            ))}
            <td className="sc-total" />
            <td className="sc-total" />
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.playerId}>
              <th className="sc-name">
                <span className="sc-name-text">{row.name}</span>
                {model.showHandicap && (
                  <span className="sc-hcp" aria-label={`Handicap ${row.handicap}`}>
                    {row.handicap}
                  </span>
                )}
              </th>
              {row.cells.map((cell) => {
                const tone =
                  cell.score == null
                    ? ''
                    : cell.toPar < 0
                      ? ' under'
                      : cell.toPar > 0
                        ? ' over'
                        : ' even';
                const isEditing =
                  editing?.playerId === row.playerId && editing?.holeNumber === cell.holeNumber;
                return (
                  <td
                    key={cell.holeNumber}
                    className={`sc-cell${tone}${cell.holeNumber === currentHole ? ' current' : ''}`}
                  >
                    {isEditing ? (
                      <input
                        className="sc-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={15}
                        autoFocus
                        defaultValue={cell.score ?? ''}
                        onBlur={(e) => {
                          commit(row.playerId, cell.holeNumber, e.target.value);
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
                        onClick={() =>
                          onScore &&
                          setEditing({ playerId: row.playerId, holeNumber: cell.holeNumber })
                        }
                        aria-label={`${row.name}, hole ${cell.holeNumber}${
                          cell.score != null ? `, ${cell.score}` : ', no score'
                        }${
                          cell.dots > 0
                            ? `, ${cell.dots} handicap stroke${cell.dots === 1 ? '' : 's'}`
                            : ''
                        }${
                          cell.chips.length > 0
                            ? `, gets a stroke in ${cell.chips.join(', ')}`
                            : ''
                        }`}
                      >
                        {cell.score != null && (
                          <span className={cell.markClass}>{cell.score}</span>
                        )}
                        {cell.dots > 0 && (
                          <span className="sc-dots" aria-hidden="true">
                            {'•'.repeat(cell.dots)}
                          </span>
                        )}
                        {cell.chips.length > 0 && (
                          <span className="sc-chips" aria-hidden="true">
                            {cell.chips.map((k) => (
                              <span key={k} className="sc-chip">
                                {k}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="sc-total">{row.gross ?? ''}</td>
              <td className="sc-total">{row.toPar == null ? '' : formatToPar(row.toPar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
