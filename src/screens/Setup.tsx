import { useState } from 'react';
import type { Round, Player, GameType, Hole, SavedCourse, TeamSetup } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { GAMES } from '../games';
import { wolfForHole } from '../games/wolf';
import { TeamPicker, effectiveSide, assignmentOf, type Assign } from '../components/TeamPicker';
import { uid, listCourses, saveCourse, deleteCourse } from '../storage';
import { CourseSearch } from '../components/CourseSearch';
import { DeleteButton } from '../components/DeleteButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { playerColor } from '../player';
import { sliceCourseHoles, type FetchedCourse } from '../courses/openGolfApi';

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
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  const [savedNote, setSavedNote] = useState('');
  const [nassauMode, setNassauMode] = useState<'1v1' | '2v2'>('1v1');
  const [nassauSideA, setNassauSideA] = useState('');
  const [nassauSideB, setNassauSideB] = useState('');
  const [nassauAssign, setNassauAssign] = useState<Assign>({});
  const [matchMode, setMatchMode] = useState<'1v1' | '2v2'>('1v1');
  const [matchSideA, setMatchSideA] = useState('');
  const [matchSideB, setMatchSideB] = useState('');
  const [matchAssign, setMatchAssign] = useState<Assign>({});

  const loadCourse = (c: SavedCourse) => {
    setCourse(c.name);
    setHoleCount(c.holes.length);
    setHoles(c.holes.map((h) => ({ ...h })));
    setAdvancedHoles(c.holes.some((h) => h.strokeIndex));
    setSavedNote(`Loaded "${c.name}"`);
  };

  const loadFromApi = (c: FetchedCourse) => {
    const count = holeCount <= 9 ? Math.min(9, c.holes.length) : Math.min(18, c.holes.length);
    const applied = sliceCourseHoles(c.holes, count);
    setCourse(c.name);
    setHoleCount(count);
    setHoles(applied);
    setAdvancedHoles(applied.some((h) => h.strokeIndex));
    setError('');
    setSavedNote(
      applied.some((h) => h.strokeIndex)
        ? `Loaded "${c.name}" — par + stroke index`
        : `Loaded "${c.name}" — par only (no stroke index in database)`
    );
  };

  const saveFavorite = () => {
    const name = course.trim();
    if (!name) {
      setError('Add a course name (top field) before saving.');
      return;
    }
    const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
    saveCourse({
      id: existing?.id ?? uid(),
      name,
      holes: holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
    });
    setCourses(listCourses());
    setError('');
    setSavedNote(`Saved "${name}" ★`);
  };

  const removeCourse = (id: string) => {
    deleteCourse(id);
    setCourses(listCourses());
  };

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
  const showNassau = games.includes('nassau');
  const showMatchPlay = games.includes('matchPlay');
  const canTeams = namedPlayers.length >= 4;

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

    // Net scoring is automatic: on when any player entered a handicap (> 0).
    const useNet = cleanPlayers.some((p) => (p.handicap ?? 0) > 0);

    // Builds a TeamSetup from picker state, or returns an error message.
    const buildTeams = (
      mode: '1v1' | '2v2',
      sideA: string,
      sideB: string,
      assign: Assign
    ): TeamSetup | string => {
      if (mode === '2v2') {
        const teamA = cleanPlayers.filter((p, i) => assignmentOf(assign, p.id, i) === 'A').map((p) => p.id);
        const teamB = cleanPlayers.filter((p, i) => assignmentOf(assign, p.id, i) === 'B').map((p) => p.id);
        if (teamA.length !== 2 || teamB.length !== 2)
          return 'Assign exactly 2 players to each team.';
        return { mode: '2v2', teamA, teamB };
      }
      const a = effectiveSide(cleanPlayers, sideA, 0);
      const b = effectiveSide(cleanPlayers, sideB, 1);
      if (!a || !b || a === b) return 'Pick two different players.';
      return { mode: '1v1', teamA: [a], teamB: [b] };
    };

    let nassau: TeamSetup | undefined;
    if (games.includes('nassau')) {
      const r = buildTeams(nassauMode, nassauSideA, nassauSideB, nassauAssign);
      if (typeof r === 'string') return setError(`Nassau: ${r}`);
      nassau = r;
    }

    let matchPlay: TeamSetup | undefined;
    if (games.includes('matchPlay')) {
      const r = buildTeams(matchMode, matchSideA, matchSideB, matchAssign);
      if (typeof r === 'string') return setError(`Match Play: ${r}`);
      matchPlay = r;
    }

    const round: Round = {
      id: uid(),
      course: course.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: cleanPlayers,
      holes,
      games,
      options: { ...options, useNet, nassau, matchPlay },
      scores: {},
      wolf: {},
      presses: [],
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

      <CourseSearch value={course} onChange={setCourse} onPick={loadFromApi} />

      {courses.length > 0 && (
        <section className="card course-picker">
          <h2>Load a saved course</h2>
          <div className="saved-course-list">
            {courses.map((c) => (
              <div key={c.id} className="saved-course-row">
                <button className="saved-course-load" onClick={() => loadCourse(c)}>
                  <span className="saved-course-name">{c.name}</span>
                  <span className="saved-course-meta">
                    {c.holes.length} holes · par {c.holes.reduce((s, h) => s + h.par, 0)}
                    {c.holes.some((h) => h.strokeIndex) ? ' · SI set' : ''}
                  </span>
                </button>
                <DeleteButton
                  className="saved-course-del"
                  label={`saved course ${c.name}`}
                  onDelete={() => removeCourse(c.id)}
                >
                  ×
                </DeleteButton>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Players</h2>
        {players.map((p, i) => (
          <div key={p.id} className="player-row">
            <PlayerAvatar name={p.name || `${i + 1}`} color={playerColor(i)} />
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
        {showNet && (
          <p className="hint">
            Enter handicaps to score net — leave them all blank to score gross. A blank handicap
            plays off 0.
          </p>
        )}
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
        <button className="btn-ghost add" onClick={saveFavorite}>
          ★ Save this course for next time
        </button>
        {savedNote && <p className="hint-inline">{savedNote}</p>}
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

      {showMatchPlay && (
        <TeamPicker
          label="Match Play teams"
          players={namedPlayers}
          canTeams={canTeams}
          mode={matchMode}
          onMode={setMatchMode}
          sideA={matchSideA}
          sideB={matchSideB}
          onSideA={setMatchSideA}
          onSideB={setMatchSideB}
          assign={matchAssign}
          onAssign={(id, v) => setMatchAssign((a) => ({ ...a, [id]: v }))}
        />
      )}

      {showNassau && (
        <TeamPicker
          label="Nassau teams"
          players={namedPlayers}
          canTeams={canTeams}
          mode={nassauMode}
          onMode={setNassauMode}
          sideA={nassauSideA}
          sideB={nassauSideB}
          onSideA={setNassauSideA}
          onSideB={setNassauSideB}
          assign={nassauAssign}
          onAssign={(id, v) => setNassauAssign((a) => ({ ...a, [id]: v }))}
        />
      )}

      {(showStableford || showWolf) && (
        <section className="card">
          <h2>Options</h2>
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
