import { useMemo, useReducer, useRef, useState, Suspense } from 'react';
import { todayIso } from '../roundDate';
import type { Round, Player, GameType, SavedCourse, TeamSetup, RoundTrip } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { GAMES } from '../games';
import { usesHandicap } from '../games/scoring';
import { wolfForHole } from '../games/wolf';
import { effectiveSide, assignmentOf, type Assign } from '../components/TeamPicker';
import {
  uid,
  listCourses,
  saveCourse,
  deleteCourse,
  listRounds,
  getAliases,
  mergePeople,
} from '../storage';
import { SetupRow } from '../components/SetupRow';
import { TripPicker } from '../components/TripPicker';
import { activeTrip, listTrips } from '../trips';
import { courseSummary, holesSummary, gamesSummary, stakesSummary } from '../setupSummary';
import { buildRoster, lastCrew, isFirstEverRound, type RosterEntry, placePlayer } from '../roster';
import { SendRound } from '../lazyScreens';
import type { FetchedCourse } from '../courses/openGolfApi';
import { GearIcon } from '../icons';
import { StakesEditor } from '../components/StakesEditor';
import { SettingsSheet } from '../components/SettingsSheet';
import { nameKey, nearMatches, resolveName } from '../people';
import { lastSetup } from '../lastSetup';
import { courseReducer, deriveCourse, initialCourseState } from './setup/courseState';
import { PlayersSection } from './setup/PlayersSection';
import { CourseSection, HolesSection } from './setup/CourseSection';
import { GamesSection, type SidePick } from './setup/GamesSection';

interface Props {
  onCancel: () => void;
  onStart: (round: Round) => void;
}

/**
 * New Round.
 *
 * The screen is a Players card and five collapsible rows. The course and the
 * holes live in one reducer (`setup/courseState.ts`), because they move
 * together; the players, the games and their options are plain state here,
 * because they do not. Each row's body is its own component under `setup/`,
 * so this file is the state, the rules for starting a round, and the layout.
 */
export function Setup({ onCancel, onStart }: Props) {
  // What the group played last time: the games, the stakes and the options
  // start where they were left, the way the players already did. Read once,
  // on mount, like the saved rounds below.
  const [remembered] = useState(() => lastSetup(listRounds()));
  const [cs, dispatch] = useReducer(courseReducer, initialCourseState);
  const derived = deriveCourse(cs);
  const { rated } = derived;
  const [players, setPlayers] = useState<Player[]>([
    { id: uid(), name: '' },
    { id: uid(), name: '' },
  ]);
  /** Handicap allowance per game, as a percentage. Absent entries are 100%. */
  const [allowanceByGame, setAllowanceByGame] = useState<Partial<Record<GameType, number>>>(
    () => remembered?.allowanceByGame ?? {}
  );
  const [games, setGames] = useState<GameType[]>(() => remembered?.games ?? ['skins']);
  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS, ...(remembered?.options ?? {}) });
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  // The saved course being handed out, if any — see the QR button on each row.
  const [sendingCourse, setSendingCourse] = useState<SavedCourse | null>(null);
  const [nassau, setNassau] = useState<SidePick>(() => ({
    mode: remembered?.nassauMode ?? '1v1',
    sideA: '',
    sideB: '',
    assign: {},
  }));
  const [match, setMatch] = useState<SidePick>(() => ({
    mode: remembered?.matchMode ?? '1v1',
    sideA: '',
    sideB: '',
    assign: {},
  }));
  // Vegas is 2v2 only — there is no side to choose, just who is with whom.
  const [vegasAssign, setVegasAssign] = useState<Assign>({});
  // Only the games the user actually changed. An absent entry follows the
  // round default, so leaving this alone reproduces the old behaviour exactly
  // — including a handicap added later switching the untouched games over.
  const [netByGame, setNetByGame] = useState<Partial<Record<GameType, boolean>>>(
    () => remembered?.netByGame ?? {}
  );
  const [showSettings, setShowSettings] = useState(false);

  // One snapshot of saved history, read once on mount. Everything derived from
  // past rounds — which rows open, the crew chip, the recent chips — reads this
  // and not localStorage, so the screen cannot shift while the user is typing.
  const [savedRounds, setSavedRounds] = useState(() => listRounds());

  // The trip this round is part of. Starts on the trip being played this week,
  // if there is one: the second round of a trip is the common case, and
  // forgetting to pick it would settle that round on its own.
  const trips = useMemo(() => listTrips(savedRounds), [savedRounds]);
  const [trip, setTrip] = useState<RoundTrip | null>(() => {
    const t = activeTrip(savedRounds);
    return t ? { id: t.id, name: t.name } : null;
  });

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

  /**
   * Both course loaders open the Holes & pars row. Either one rewrites up to
   * eighteen pars and stroke indexes at a stroke, and doing that behind a
   * collapsed section is how a wrong number reaches the first tee unseen. What
   * differs between them is the warning, not whether the numbers are shown:
   * only search data is second-guessed — see the reducer.
   */
  const loadCourse = (c: SavedCourse) => {
    dispatch({ type: 'loadSaved', course: c });
    openRow('holes');
  };

  const loadFromApi = (c: FetchedCourse) => {
    dispatch({ type: 'loadSearch', course: c });
    openRow('holes');
    setError('');
  };

  /**
   * `from` is which button asked, because that is where the answer has to
   * appear. The two are a screen apart: the check note sits at the top of
   * Holes & pars and the ghost button below the whole par grid, so a single
   * note slot at the foot means saving from the top makes the caveat vanish
   * and puts the confirmation a thousand pixels down, out of sight. Same
   * failure the note was moved out of the page footer to avoid.
   */
  const saveFavorite = (from: 'check' | 'foot' = 'foot') => {
    const name = cs.course.trim();
    if (!name) {
      openRow('course');
      setError('Add a course name (in the Course row) before saving.');
      return;
    }
    const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
    saveCourse({
      id: existing?.id ?? uid(),
      name,
      holes: cs.holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
      slope: cs.slope,
      rating: cs.rating,
    });
    setCourses(listCourses());
    setError('');
    dispatch({ type: 'saved', name, from });
  };

  const removeCourse = (id: string) => {
    deleteCourse(id);
    setCourses(listCourses());
  };

  const updatePlayer = (id: string, patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPlayer = () => setPlayers((ps) => [...ps, { id: uid(), name: '' }]);
  const removePlayer = (id: string) =>
    setPlayers((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));

  const crew = lastCrew(savedRounds);
  const roster = buildRoster(savedRounds);

  // Every name this phone has seen, most recent spelling — for the name
  // field's suggestions and the "is this the same person?" check. Not the
  // roster, which stops at a chip row's worth.
  const knownNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of savedRounds)
      for (const p of r.players) {
        const k = nameKey(p.name);
        if (k && !seen.has(k)) seen.set(k, p.name.trim());
      }
    return [...seen.values()];
  }, [savedRounds]);
  const knownKeys = useMemo(() => new Set(knownNames.map(nameKey)), [knownNames]);

  /**
   * A typed name that is probably somebody already on the phone: "Al" when
   * there is an Alex. Asked once at Start rather than while typing, which
   * would interrupt every name on its way to being finished.
   */
  const [askSame, setAskSame] = useState<{ id: string; typed: string; known: string } | null>(null);
  // Answered "no, someone new" this visit: not asked again for that name.
  const declined = useRef(new Set<string>());

  const inForm = new Set(players.map((p) => nameKey(p.name)).filter(Boolean));
  const recent = roster.filter((e) => !inForm.has(nameKey(e.name)));

  // The crew chip is a shortcut, not a merge: replacing is predictable, merging
  // is not. Hidden once the list already matches, so it never offers a no-op.
  const crewMatches =
    crew.length === players.length &&
    crew.every((e, i) => e.name === players[i].name.trim());

  /**
   * Both figures come back with a recalled player, and the screen shows
   * whichever this course can use: the Index where there is a rating to
   * convert it, the remembered strokes otherwise. Dropping either on recall
   * would mean retyping it the next time the other one stopped applying.
   */
  const recalled = (e: RosterEntry): Player => ({
    id: uid(),
    name: e.name,
    handicap: e.handicap,
    index: e.index,
  });

  const useCrew = () => setPlayers(crew.map(recalled));

  const addFromRoster = (e: RosterEntry) => setPlayers((ps) => placePlayer(ps, recalled(e)));

  const toggleGame = (g: GameType) =>
    setGames((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));

  const namedPlayers = players.filter((p) => p.name.trim());
  const showNet = games.some(usesHandicap);
  // Gross and net are the same card until somebody has a handicap, so the
  // per-game picker stays out of the way until the choice means something.
  // An Index counts: on a rated course it is what their strokes come from.
  const anyHandicap = namedPlayers.some((p) => (p.handicap ?? 0) !== 0 || p.index != null);
  const allowanceGames = games.filter(usesHandicap);
  const showScoring = anyHandicap && allowanceGames.length > 0;
  const canTeams = namedPlayers.length >= 4;

  const start = (answer?: { id: string; name: string }) => {
    if (namedPlayers.length < 1) return setError('Give at least one player a name.');

    // Names merged before come through as the spelling they were merged
    // into, and a "yes, that's Alex" just given applies here — state set a
    // moment ago is not in `players` yet.
    const aliases = getAliases();
    const nameFor = (p: Player) =>
      answer?.id === p.id ? answer.name : resolveName(p.name, aliases);
    for (const p of namedPlayers) {
      const typed = nameFor(p);
      const k = nameKey(typed);
      if (knownKeys.has(k) || declined.current.has(k)) continue;
      const others = new Set(namedPlayers.filter((q) => q.id !== p.id).map((q) => nameKey(nameFor(q))));
      const known = nearMatches(typed, knownNames).find((n) => !others.has(nameKey(n)));
      if (known) {
        setAskSame({ id: p.id, typed, known });
        return;
      }
    }
    setAskSame(null);

    // Two players under one name are one person to everything downstream:
    // the settlement reads "Mike pays Mike", Stats adds both cards up as
    // one, and a trip nets their money against each other.
    const seen = new Map<string, string>();
    for (const p of namedPlayers) {
      const typed = nameFor(p).trim();
      const k = nameKey(typed);
      const other = seen.get(k);
      if (other !== undefined) {
        openRow('players');
        return setError(`Two players are called ${other} — add an initial to one of them.`);
      }
      seen.set(k, typed);
    }

    if (games.length === 0) return gamesError('Pick at least one game.');
    for (const g of games) {
      const meta = GAMES.find((m) => m.id === g)!;
      if (namedPlayers.length < meta.minPlayers) {
        return gamesError(`${meta.label} needs at least ${meta.minPlayers} players.`);
      }
    }

    const cleanPlayers = namedPlayers.map((p) => ({
      ...p,
      name: nameFor(p).trim(),
      handicap: showNet ? p.handicap : undefined,
      index: showNet ? p.index : undefined,
    }));

    // Net scoring is automatic: on when anybody brought a handicap, by either
    // route — a stroke count typed in, or an Index the course can convert.
    const useNet = cleanPlayers.some(
      (p) => (p.handicap ?? 0) !== 0 || (rated && p.index != null)
    );

    // Builds a TeamSetup from picker state, or returns an error message.
    const buildTeams = (pick: SidePick): TeamSetup | string => {
      if (pick.mode === '2v2') {
        const teamA = cleanPlayers.filter((p, i) => assignmentOf(pick.assign, p.id, i) === 'A').map((p) => p.id);
        const teamB = cleanPlayers.filter((p, i) => assignmentOf(pick.assign, p.id, i) === 'B').map((p) => p.id);
        if (teamA.length !== 2 || teamB.length !== 2)
          return 'Assign exactly 2 players to each team.';
        return { mode: '2v2', teamA, teamB };
      }
      const a = effectiveSide(cleanPlayers, pick.sideA, 0);
      const b = effectiveSide(cleanPlayers, pick.sideB, 1);
      if (!a || !b || a === b) return 'Pick two different players.';
      return { mode: '1v1', teamA: [a], teamB: [b] };
    };

    let nassauTeams: TeamSetup | undefined;
    if (games.includes('nassau')) {
      const r = buildTeams(nassau);
      if (typeof r === 'string') return gamesError(`Nassau: ${r}`);
      nassauTeams = r;
    }

    let matchPlay: TeamSetup | undefined;
    if (games.includes('matchPlay')) {
      const r = buildTeams(match);
      if (typeof r === 'string') return gamesError(`Match Play: ${r}`);
      matchPlay = r;
    }

    let vegas: TeamSetup | undefined;
    if (games.includes('vegas')) {
      const r = buildTeams({ mode: '2v2', sideA: '', sideB: '', assign: vegasAssign });
      if (typeof r === 'string') return gamesError(`Vegas: ${r}`);
      vegas = r;
    }

    const round: Round = {
      id: uid(),
      course: cs.course.trim() || undefined,
      date: todayIso(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: cleanPlayers,
      holes: cs.holes,
      games,
      options: { ...options, useNet, netByGame, allowanceByGame, nassau: nassauTeams, matchPlay, vegas },
      // Copied onto the round so it stays scoreable on its own terms: editing
      // the saved course later must not re-handicap a round already played.
      slope: rated ? cs.slope : undefined,
      rating: rated ? cs.rating : undefined,
      ratingHoles: rated ? cs.ratingHoles : undefined,
      scores: {},
      wolf: {},
      presses: [],
      ...(trip ? { trip } : {}),
      status: 'in_progress',
    };

    if (games.includes('wolf')) {
      cs.holes.forEach((h) => {
        round.wolf[h.number] = {
          wolfPlayerId: wolfForHole({ ...round, players: cleanPlayers }, h)!,
          choice: null,
        };
      });
    }

    // Clear so a later visit to this screen (e.g. after Undo) doesn't open on
    // a note describing a course loaded during the round that just ended.
    dispatch({ type: 'clearNote' });
    onStart(round);
  };

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>New Round</h1>
        <button className="btn-ghost icon" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
      </header>

      <PlayersSection
        players={players}
        showNet={showNet}
        rated={rated}
        derivedHandicap={derived.derivedHandicap}
        crew={crewMatches ? [] : crew}
        onUseCrew={useCrew}
        recent={recent}
        onAddFromRoster={addFromRoster}
        onUpdate={updatePlayer}
        onAdd={addPlayer}
        onRemove={removePlayer}
      />

      <div className="setup-rows">
        <SetupRow
          label="Course"
          summary={courseSummary(cs.course)}
          open={!!openRows.course}
          onToggle={() => toggleRow('course')}
        >
          <CourseSection
            course={cs.course}
            onCourse={(name) => dispatch({ type: 'course', name })}
            onPick={loadFromApi}
            courses={courses}
            onLoad={loadCourse}
            onSend={setSendingCourse}
            onRemove={removeCourse}
            note={cs.savedNote?.row === 'course' ? cs.savedNote.text : null}
          />
        </SetupRow>

        <SetupRow
          label="Games"
          summary={gamesSummary(games)}
          open={!!openRows.games}
          onToggle={() => toggleRow('games')}
        >
          <GamesSection
            games={games}
            onToggleGame={toggleGame}
            namedPlayers={namedPlayers}
            canTeams={canTeams}
            showScoring={showScoring}
            allowanceGames={allowanceGames}
            netByGame={netByGame}
            onNetByGame={(g, v) => setNetByGame((m) => ({ ...m, [g]: v }))}
            allowanceByGame={allowanceByGame}
            onAllowance={(g, pct) => setAllowanceByGame((m) => ({ ...m, [g]: pct }))}
            match={match}
            onMatch={(patch) => setMatch((m) => ({ ...m, ...patch }))}
            nassau={nassau}
            onNassau={(patch) => setNassau((n) => ({ ...n, ...patch }))}
            vegasAssign={vegasAssign}
            onVegasAssign={(id, v) => setVegasAssign((a) => ({ ...a, [id]: v }))}
            options={options}
            onOptions={setOptions}
          />
        </SetupRow>

        <SetupRow
          label="Holes & pars"
          summary={holesSummary(cs.holes)}
          open={!!openRows.holes}
          onToggle={() => toggleRow('holes')}
        >
          <HolesSection state={cs} derived={derived} dispatch={dispatch} onSave={saveFavorite} />
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

        <SetupRow
          label="Trip"
          summary={trip?.name ?? 'None'}
          open={!!openRows.trip}
          onToggle={() => toggleRow('trip')}
        >
          <TripPicker trips={trips} value={trip} onChange={setTrip} />
        </SetupRow>
      </div>

      <div className="screen-foot">
        {/* Inside the pinned bar rather than above it, and an alert: this is
            the answer to a press on the button. Left in the flow above the bar
            it can be scrolled off screen while the button that wrote it stays
            in reach, and without the role a screen-reader user gets silence
            and a button that appeared to do nothing. Play's warning banner
            lives in its own sticky foot for the same reasons. */}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {askSame && (
          <div className="same-person" role="alert">
            <p>
              Is “{askSame.typed}” <strong>{askSame.known}</strong> from your earlier rounds?
            </p>
            <div className="same-person-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  // Yes: one person from now on, in past rounds too.
                  mergePeople(askSame.typed, askSame.known);
                  updatePlayer(askSame.id, { name: askSame.known });
                  start({ id: askSame.id, name: askSame.known });
                }}
              >
                Yes, {askSame.known}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  declined.current.add(nameKey(askSame.typed));
                  setAskSame(null);
                  start();
                }}
              >
                No, someone new
              </button>
            </div>
          </div>
        )}
        <button className="btn-primary big" onClick={() => start()}>
          Start Round →
        </button>
      </div>

      {/* The name field's suggestions: everyone this phone has scored. */}
      <datalist id="press-known-names">
        {knownNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          screen="setup"
          // A restore from here brings courses and past players; the saved
          // course list and the recall chips read them again.
          onDataChanged={() => {
            setCourses(listCourses());
            setSavedRounds(listRounds());
          }}
        />
      )}

      {sendingCourse && (
        <Suspense fallback={null}>
          <SendRound course={sendingCourse} onClose={() => setSendingCourse(null)} />
        </Suspense>
      )}
    </div>
  );
}
