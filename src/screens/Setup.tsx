import { useState } from 'react';
import type { Round, Player, GameType, Hole, SavedCourse, TeamSetup } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { GAMES } from '../games';
import { GAME_RULES } from '../games/rules';
import { wolfForHole } from '../games/wolf';
import { TeamPicker, effectiveSide, assignmentOf, type Assign } from '../components/TeamPicker';
import { uid, listCourses, saveCourse, deleteCourse, listRounds } from '../storage';
import { SetupRow } from '../components/SetupRow';
import { courseSummary, holesSummary, gamesSummary, stakesSummary } from '../setupSummary';
import { buildRoster, lastCrew, isFirstEverRound, type RosterEntry, placePlayer } from '../roster';
import { CrewChip, RecentChips } from '../components/RosterChips';
import { CourseSearch } from '../components/CourseSearch';
import { DeleteButton } from '../components/DeleteButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { playerColor } from '../player';
import { sliceCourseHoles, type FetchedCourse } from '../courses/openGolfApi';
import { StarIcon, XIcon, GearIcon } from '../icons';
import { StakesEditor } from '../components/StakesEditor';
import { SettingsSheet } from '../components/SettingsSheet';

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
  const [showSettings, setShowSettings] = useState(false);
  const [expandedGame, setExpandedGame] = useState<GameType | null>(null);

  // One snapshot of saved history, read once on mount. Everything derived from
  // past rounds — which rows open, the crew chip, the recent chips — reads this
  // and not localStorage, so the screen cannot shift while the user is typing.
  const [savedRounds] = useState(() => listRounds());

  // Which rows are expanded. Independent flags, not an accordion.
  // Games opens on a first-ever round: collapsing it is the one part of this
  // design that costs something real — a newcomer never learning Wolf or Nassau
  // exist — and this buys that back for the only person who needs it, at no
  // cost to every round after. Off the mount snapshot; a round saved later in
  // this session must not reshuffle the screen underneath the user.
  const [openRows, setOpenRows] = useState<Record<string, boolean>>(() => ({
    games: isFirstEverRound(savedRounds),
  }));

  const toggleRow = (key: string) =>
    setOpenRows((rows) => ({ ...rows, [key]: !rows[key] }));

  // Sets true rather than toggling, so an already-open row stays open, and
  // spreads rather than replaces, so opening one row never closes another.
  const openRow = (key: string) =>
    setOpenRows((rows) => ({ ...rows, [key]: true }));

  // An error the user cannot act on is worse than no error. Collapsing the
  // sections took these controls out of the DOM entirely, so an error that
  // names one has to reveal it in the same breath.
  const gamesError = (message: string) => {
    openRow('games');
    setError(message);
  };

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
      openRow('course');
      setError('Add a course name (in the Course row) before saving.');
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
    setSavedNote(`Saved "${name}"`);
  };

  const removeCourse = (id: string) => {
    deleteCourse(id);
    setCourses(listCourses());
  };

  // A common par-72 layout, repeated for 9 or 18 holes.
  const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

  const applyPreset = (kind: 'par4' | 'standard') => {
    setHoles((hs) =>
      hs.map((h, i) => ({ ...h, par: kind === 'par4' ? 4 : STANDARD_PARS[i % 18] }))
    );
    // Same reasoning as setHoleCountAndPars: a bulk par overwrite makes any
    // loaded/saved note describe a course that no longer matches the holes.
    setSavedNote('');
  };

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
    // A loaded/saved note describes a specific hole count and par set; changing
    // the count invalidates it before the user can act on stale information.
    setSavedNote('');
  };

  const updatePlayer = (id: string, patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPlayer = () => setPlayers((ps) => [...ps, { id: uid(), name: '' }]);
  const removePlayer = (id: string) =>
    setPlayers((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));

  const crew = lastCrew(savedRounds);
  const roster = buildRoster(savedRounds);

  const inForm = new Set(players.map((p) => p.name.trim().toLowerCase()).filter(Boolean));
  const recent = roster.filter((e) => !inForm.has(e.name.toLowerCase()));

  // The crew chip is a shortcut, not a merge: replacing is predictable, merging
  // is not. Hidden once the list already matches, so it never offers a no-op.
  const crewMatches =
    crew.length === players.length &&
    crew.every((e, i) => e.name === players[i].name.trim());

  const useCrew = () =>
    setPlayers(crew.map((e) => ({ id: uid(), name: e.name, handicap: e.handicap })));

  const addFromRoster = (e: RosterEntry) =>
    setPlayers((ps) => placePlayer(ps, { id: uid(), name: e.name, handicap: e.handicap }));

  const setPar = (number: number, par: number) => {
    setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, par } : h)));
    // A single hand-edited par is still enough to make the loaded/saved note
    // describe a course the holes no longer match.
    setSavedNote('');
  };

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
    if (games.length === 0) return gamesError('Pick at least one game.');
    for (const g of games) {
      const meta = GAMES.find((m) => m.id === g)!;
      if (namedPlayers.length < meta.minPlayers) {
        return gamesError(`${meta.label} needs at least ${meta.minPlayers} players.`);
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
      if (typeof r === 'string') return gamesError(`Nassau: ${r}`);
      nassau = r;
    }

    let matchPlay: TeamSetup | undefined;
    if (games.includes('matchPlay')) {
      const r = buildTeams(matchMode, matchSideA, matchSideB, matchAssign);
      if (typeof r === 'string') return gamesError(`Match Play: ${r}`);
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

    // Clear so a later visit to this screen (e.g. after Undo) doesn't open on
    // a note describing a course loaded during the round that just ended.
    setSavedNote('');
    onStart(round);
  };

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1>New Round</h1>
        <button className="btn-ghost icon" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
      </header>

      <section className="card">
        <h2>Players</h2>
        <CrewChip crew={crewMatches ? [] : crew} onUseCrew={useCrew} />
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
              <XIcon />
            </button>
          </div>
        ))}
        <button className="btn-ghost add" onClick={addPlayer}>
          + Add player
        </button>
        <RecentChips recent={recent} onAdd={addFromRoster} />
        {showNet && (
          <p className="hint">
            Enter handicaps to score net — leave them all blank to score gross. A blank handicap
            plays off 0.
          </p>
        )}
      </section>

      <div className="setup-rows">
        <SetupRow
          label="Course"
          summary={courseSummary(course)}
          open={!!openRows.course}
          onToggle={() => toggleRow('course')}
        >
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
                      <XIcon />
                    </DeleteButton>
                  </div>
                ))}
              </div>
            </section>
          )}
        </SetupRow>

        <SetupRow
          label="Games"
          summary={gamesSummary(games)}
          open={!!openRows.games}
          onToggle={() => toggleRow('games')}
        >
          <section className="card">
            <div className="game-list">
              {GAMES.map((g) => (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  className={`game-card${games.includes(g.id) ? ' active' : ''}`}
                  onClick={() => toggleGame(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGame(g.id);
                    }
                  }}
                >
                  <div className="game-card-row">
                    <span className="game-check">{games.includes(g.id) ? '✓' : ''}</span>
                    <span className="game-text">
                      <strong>{g.label}</strong>
                      <small>{g.blurb}</small>
                    </span>
                    <button
                      type="button"
                      className="game-info-btn"
                      aria-label={`${g.label} rules`}
                      aria-expanded={expandedGame === g.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedGame((cur) => (cur === g.id ? null : g.id));
                      }}
                    >
                      ⓘ
                    </button>
                  </div>
                  {expandedGame === g.id && (
                    <p className="game-info-text">{GAME_RULES[g.id]}</p>
                  )}
                </div>
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
        </SetupRow>

        <SetupRow
          label="Holes & pars"
          summary={holesSummary(holes)}
          open={!!openRows.holes}
          onToggle={() => toggleRow('holes')}
        >
          <section className="card">
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
              <StarIcon size={16} /> Save this course for next time
            </button>
          </section>
        </SetupRow>

        <SetupRow
          label="Money"
          summary={stakesSummary(games, options.stakes)}
          open={!!openRows.money}
          onToggle={() => toggleRow('money')}
        >
          <section className="card">
            <StakesEditor
              games={games}
              stakes={options.stakes}
              onChange={(stakes) => setOptions({ ...options, stakes })}
            />
            <p className="hint">
              Optional — leave blank to play for nothing. You can add or change stakes later from the
              Board.
            </p>
          </section>
        </SetupRow>
      </div>

      {/* Outside every row: it confirms an action, and that action can originate
          in either the Course row (loading a course) or the Holes row (saving
          one), so it cannot live inside either. */}
      {savedNote && <p className="hint-inline">{savedNote}</p>}

      {error && <p className="error">{error}</p>}

      <button className="btn-primary big sticky" onClick={start}>
        Start Round →
      </button>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} screen="setup" />}
    </div>
  );
}
