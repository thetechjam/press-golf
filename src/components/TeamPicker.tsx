import type { Player } from '../types';

export type Assign = Record<string, 'A' | 'B' | '-'>;

/** The chosen 1v1 side id, defaulting to the player at `idx`. */
export const effectiveSide = (players: Player[], sideId: string, idx: number): string =>
  players.find((p) => p.id === sideId)?.id ?? players[idx]?.id ?? '';

/** A player's 2v2 assignment, defaulting to first two = A, next two = B. */
export const assignmentOf = (assign: Assign, id: string, i: number): 'A' | 'B' | '-' =>
  assign[id] ?? (i < 2 ? 'A' : i < 4 ? 'B' : '-');

const nameOrPlaceholder = (p: Player, i: number) => p.name.trim() || `Player ${i + 1}`;

interface Props {
  label: string;
  players: Player[];
  canTeams: boolean;
  mode: '1v1' | '2v2';
  onMode: (m: '1v1' | '2v2') => void;
  sideA: string;
  sideB: string;
  onSideA: (id: string) => void;
  onSideB: (id: string) => void;
  assign: Assign;
  onAssign: (id: string, v: 'A' | 'B' | '-') => void;
}

export function TeamPicker({
  label,
  players,
  canTeams,
  mode,
  onMode,
  sideA,
  sideB,
  onSideA,
  onSideB,
  assign,
  onAssign,
}: Props) {
  const effA = effectiveSide(players, sideA, 0);
  const effB = effectiveSide(players, sideB, 1);

  return (
    <section className="card">
      <h2>{label}</h2>
      <div className="seg">
        <button
          className={`seg-btn${mode === '1v1' ? ' active' : ''}`}
          onClick={() => onMode('1v1')}
        >
          1 v 1
        </button>
        <button
          className={`seg-btn${mode === '2v2' ? ' active' : ''}`}
          onClick={() => canTeams && onMode('2v2')}
          disabled={!canTeams}
        >
          2 v 2
        </button>
      </div>

      {mode === '1v1' ? (
        <div className="nassau-1v1">
          <label className="field">
            <span>Side A</span>
            <select value={effA} onChange={(e) => onSideA(e.target.value)}>
              {players.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {nameOrPlaceholder(p, i)}
                </option>
              ))}
            </select>
          </label>
          <span className="vs">vs</span>
          <label className="field">
            <span>Side B</span>
            <select value={effB} onChange={(e) => onSideB(e.target.value)}>
              {players.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {nameOrPlaceholder(p, i)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="team-assign">
          <p className="hint-inline">Assign exactly 2 players to each team.</p>
          {players.map((p, i) => (
            <div key={p.id} className="assign-row">
              <span className="assign-name">{nameOrPlaceholder(p, i)}</span>
              <div className="seg small">
                {(['A', 'B', '-'] as const).map((v) => (
                  <button
                    key={v}
                    className={`seg-btn${assignmentOf(assign, p.id, i) === v ? ' active' : ''}`}
                    onClick={() => onAssign(p.id, v)}
                  >
                    {v === '-' ? 'Out' : `Team ${v}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!canTeams && <p className="hint-inline">Add 4 players to enable 2 v 2.</p>}
    </section>
  );
}
