import { useState } from 'react';
import type { Round, Player, GameType, Hole } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { GAMES } from '../games';
import { wolfForHole } from '../games/wolf';
import { uid } from '../storage';

interface Props {
  onCancel: () => void;
  onStart: (round: Round) => void;
}

function makeHoles(count: number): Hole[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 4 }));
}

export function Setup({ onCancel, onStart }: Props) {
  const [course, setCourse] = useState('');
  const [players, setPlayers] = useState<Player[]>([
    { id: uid(), name: '' },
    { id: uid(), name: '' },
  ]);
  const [holeCount, setHoleCount] = useState(18);
  const [holes, setHoles] = useState<Hole[]>(makeHoles(18));
  const [games, setGames] = useState<GameType[]>(['skins']);
  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS });
  const [advancedHoles, setAdvancedHoles] = useState(false);
  const [error, setError] = useState('');

  // A common par-72 layout, repeated for 9 or 18 holes.
  const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

  const applyPreset = (kind: 'par4' | 'standard') =>
    setHoles((hs) =>
      hs.map((h, i) => ({ ...h, par: kind === 'par4' ? 4 : STANDARD_PARS[i % 18] }))
    );

  const setStrokeIndex = (number: number, si: number | undefined) =>
    setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, strokeIndex: si } : h)));

  const toggleAdvanced = () =>
    setAdvancedHoles((a) => {
      const next = !a;
      if (next)
        // Seed stroke indexes in hole order so nothing is blank.
        setHoles((hs) => hs.map((h, i) => (h.strokeIndex ? h : { ...h, strokeIndex: i + 1 })));
      return next;
    });

  const setHoleCountAndPars = (n: number) => {
    setHoleCount(n);
    setHoles((prev) => {
      const next = makeHoles(n);
      // keep any pars the user already edited
      return next.map((h) => prev.find((p) => p.number === h.number) ?? h);
    });
  };

  const updatePlayer = (id: string, patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPlayer = () => setPlayers((ps) => [...ps, { id: uid(), name: '' }]);
  const removePlayer = (id: string) =>
    setPlayers((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));

  const setPar = (number: number, par: number) =>
    setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, par } : h)));

  const toggleGame = (g: GameType) =>
    setGames((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));

  const namedPlayers = players.filter((p) => p.name.trim());
  const showNet = games.some((g) => GAMES.find((m) => m.id === g)?.usesNet);
  const showStableford = games.includes('stableford');
  const showWolf = games.includes('wolf');

  const start = () => {
    if (namedPlayers.length < 1) return setError('Add at least one player.');
    if (games.length === 0) return setError('Pick at least one game.');
    for (const g of games) {
      const meta = GAMES.find((m) => m.id === g)!;
      if (namedPlayers.length < meta.minPlayers) {
        return setError(`${meta.label} needs at least ${meta.minPlayers} players.`);
      }
    }

    const cleanPlayers = namedPlayers.map((p) => ({
      ...p,
      name: p.name.trim(),
      handicap: showNet ? p.handicap : undefined,
    }));

    const round: Round = {
      id: uid(),
      course: course.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: cleanPlayers,
      holes,
      games,
      options,
      scores: {},
      wolf: {},
      status: 'in_progress',
    };

    if (games.includes('wolf')) {
      holes.forEach((h) => {
        round.wolf[h.number] = {
          wolfPlayerId: wolfForHole({ ...round, players: cleanPlayers }, h)!,
          choice: null,
        };
      });
    }

    onStart(round);
  };

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost" onClick={onCancel}>
          ‹ Back
        </button>
        <h1>New Round</h1>
        <span />
      </header>

      <label className="field">
        <span>Course (optional)</span>
        <input
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="Pebble Beach"
        />
      </label>

      <section className="card">
        <h2>Players</h2>
        {players.map((p, i) => (
          <div key={p.id} className="player-row">
            <input
              className="player-name"
              value={p.name}
              onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              placeholder={`Player ${i + 1}`}
            />
            {showNet && (
              <input
                className="player-hcp"
                type="number"
                inputMode="numeric"
                value={p.handicap ?? ''}
                onChange={(e) =>
                  updatePlayer(p.id, {
                    handicap: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                placeholder="HCP"
              />
            )}
            <button
              className="player-del"
              onClick={() => removePlayer(p.id)}
              aria-label="Remove player"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-ghost add" onClick={addPlayer}>
          + Add player
        </button>
      </section>

      <section className="card">
        <h2>Holes</h2>
        <div className="seg">
          {[9, 18].map((n) => (
            <button
              key={n}
              className={`seg-btn${holeCount === n ? ' active' : ''}`}
              onClick={() => setHoleCountAndPars(n)}
            >
              {n} holes
            </button>
          ))}
        </div>
        <div className="preset-row">
          <span>Quick set:</span>
          <button className="chip" onClick={() => applyPreset('standard')}>
            Standard par {holeCount === 9 ? 36 : 72}
          </button>
          <button className="chip" onClick={() => applyPreset('par4')}>
            All par 4
          </button>
        </div>
        <div className="par-grid">
          {holes.map((h) => (
            <label key={h.number} className="par-cell">
              <span>{h.number}</span>
              <select value={h.par} onChange={(e) => setPar(h.number, Number(e.target.value))}>
                {[3, 4, 5, 6].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {advancedHoles && (
                <input
                  className="si-input"
                  type="number"
                  min={1}
                  max={holes.length}
                  value={h.strokeIndex ?? ''}
                  onChange={(e) =>
                    setStrokeIndex(
                      h.number,
                      e.target.value === '' ? undefined : Number(e.target.value)
                    )
                  }
                  aria-label={`Stroke index for hole ${h.number}`}
                />
              )}
            </label>
          ))}
        </div>
        <button className="btn-ghost add" onClick={toggleAdvanced}>
          {advancedHoles ? '− Hide hole difficulty' : '+ Set hole difficulty (stroke index)'}
        </button>
        {advancedHoles && (
          <p className="hint-inline">
            Stroke index ranks hole difficulty (1 = hardest). Used to allocate handicap
            strokes in net games.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Side games</h2>
        <div className="game-list">
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`game-card${games.includes(g.id) ? ' active' : ''}`}
              onClick={() => toggleGame(g.id)}
            >
              <span className="game-check">{games.includes(g.id) ? '✓' : ''}</span>
              <span className="game-text">
                <strong>{g.label}</strong>
                <small>{g.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {(showNet || showStableford || showWolf) && (
        <section className="card">
          <h2>Options</h2>
          {showNet && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.useNet}
                onChange={(e) => setOptions({ ...options, useNet: e.target.checked })}
              />
              <span>Use handicaps (net scoring)</span>
            </label>
          )}
          {showStableford && (
            <label className="field">
              <span>Stableford scoring</span>
              <select
                value={options.stablefordMode}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    stablefordMode: e.target.value as 'standard' | 'modified',
                  })
                }
              >
                <option value="standard">Standard (par = 2 pts)</option>
                <option value="modified">Modified (eagle = 5 pts)</option>
              </select>
            </label>
          )}
          {showWolf && (
            <div className="wolf-opts">
              <label className="field small">
                <span>Lone Wolf ×</span>
                <input
                  type="number"
                  min={1}
                  value={options.loneWolfMultiplier}
                  onChange={(e) =>
                    setOptions({ ...options, loneWolfMultiplier: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field small">
                <span>Blind Wolf ×</span>
                <input
                  type="number"
                  min={1}
                  value={options.blindWolfMultiplier}
                  onChange={(e) =>
                    setOptions({ ...options, blindWolfMultiplier: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <button className="btn-primary big sticky" onClick={start}>
        Start Round →
      </button>
    </div>
  );
}
