import { useState } from 'react';
import type { Round, Player, GameType, Hole, SavedCourse, TeamSetup } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { GAMES, gameMeta } from '../games';
import { GAME_RULES } from '../games/rules';
import { usesHandicap, canScoreNet } from '../games/scoring';
import { strokeIndexProblem, describeStrokeIndexProblem } from '../games/strokeIndex';
import { parOptions } from '../courses/parOptions';
import { scorecardIssues } from '../courses/validate';
import { validSlope, validRating, courseHandicap } from '../games/courseHandicap';
import { wolfForHole } from '../games/wolf';
import { TeamPicker, effectiveSide, assignmentOf, type Assign } from '../components/TeamPicker';
import { uid, listCourses, saveCourse, deleteCourse, listRounds } from '../storage';
import { SetupRow } from '../components/SetupRow';
import { courseSummary, holesSummary, gamesSummary, stakesSummary } from '../setupSummary';
import { buildRoster, lastCrew, isFirstEverRound, type RosterEntry, placePlayer } from '../roster';
import { CrewChip, RecentChips } from '../components/RosterChips';
import { CourseSearch } from '../components/CourseSearch';
import { DeleteButton } from '../components/DeleteButton';
import { SendRound } from '../components/SendRound';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { playerColor } from '../player';
import { sliceCourseHoles, type FetchedCourse } from '../courses/openGolfApi';
import { StarIcon, XIcon, GearIcon, QrIcon } from '../icons';
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
  /** Slope and rating of the course, when the user knows them. */
  const [slope, setSlope] = useState<number | undefined>();
  const [rating, setRating] = useState<number | undefined>();
  /**
   * How many holes the rating above covers.
   *
   * Loading an eighteen-hole course to play nine is the case this exists for:
   * the rating is for eighteen, and saying so is what lets it be halved rather
   * than judged against nine holes and thrown out. A rating typed by hand is
   * for the holes on screen, so it tracks the hole count.
   */
  const [ratingHoles, setRatingHoles] = useState<number | undefined>();
  /** Handicap allowance per game, as a percentage. Absent entries are 100%. */
  const [allowanceByGame, setAllowanceByGame] = useState<Partial<Record<GameType, number>>>({});
  const [games, setGames] = useState<GameType[]>(['skins']);
  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS });
  const [advancedHoles, setAdvancedHoles] = useState(false);
  /**
   * Where the pars and stroke indexes currently on screen came from.
   *
   * Only 'search' earns a warning. Course search is open community data and is
   * sometimes wrong — a par off by one quietly changes every net score and
   * every Stableford point for the whole round. A course the user saved
   * themselves, or a preset they chose, needs no such caveat.
   */
  const [holesSource, setHolesSource] = useState<'manual' | 'search' | 'saved'>('manual');
  /**
   * What course search handed over, kept so the problems with it can be
   * re-read from the holes as they stand rather than reported once and left
   * stale. Fixing a par should make the line about that par go away.
   *
   * `raw` is the unsliced response — see `scorecardIssues` for why the stroke
   * index check needs it. `expected` is the hole count that was asked for,
   * which the hole count itself no longer tells us: a short import sets the
   * round to the number of holes that arrived.
   */
  const [imported, setImported] = useState<{ raw: Hole[]; expected: number } | null>(null);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  // The saved course being handed out, if any — see the QR button on each row.
  const [sendingCourse, setSendingCourse] = useState<SavedCourse | null>(null);
  /**
   * A confirmation of something the user just did, and the row it happened in.
   *
   * The row matters: rendered once at the foot of the screen, as it was, the
   * note appeared over a thousand pixels below the fold on a phone — a
   * confirmation nobody could see is not a confirmation. It is shown beside
   * the control that produced it instead.
   */
  const [savedNote, setSavedNote] = useState<{
    text: string;
    row: 'course' | 'holes' | 'check';
  } | null>(null);
  const [nassauMode, setNassauMode] = useState<'1v1' | '2v2'>('1v1');
  const [nassauSideA, setNassauSideA] = useState('');
  const [nassauSideB, setNassauSideB] = useState('');
  const [nassauAssign, setNassauAssign] = useState<Assign>({});
  const [matchMode, setMatchMode] = useState<'1v1' | '2v2'>('1v1');
  const [matchSideA, setMatchSideA] = useState('');
  const [matchSideB, setMatchSideB] = useState('');
  const [matchAssign, setMatchAssign] = useState<Assign>({});
  // Vegas is 2v2 only — there is no side to choose, just who is with whom.
  const [vegasAssign, setVegasAssign] = useState<Assign>({});
  // Only the games the user actually changed. An absent entry follows the
  // round default, so leaving this alone reproduces the old behaviour exactly
  // — including a handicap added later switching the untouched games over.
  const [netByGame, setNetByGame] = useState<Partial<Record<GameType, boolean>>>({});
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

  /**
   * Both course loaders open the Holes & pars row. Either one rewrites up to
   * eighteen pars and stroke indexes at a stroke, and doing that behind a
   * collapsed section is how a wrong number reaches the first tee unseen. What
   * differs between them is the warning, not whether the numbers are shown:
   * only search data is second-guessed.
   */
  const loadCourse = (c: SavedCourse) => {
    setCourse(c.name);
    setHoleCount(c.holes.length);
    setHoles(c.holes.map((h) => ({ ...h })));
    setAdvancedHoles(c.holes.some((h) => h.strokeIndex));
    setHolesSource('saved');
    setImported(null);
    setSlope(c.slope);
    setRating(c.rating);
    setRatingHoles(c.holes.length);
    openRow('holes');
    setSavedNote({ text: `Loaded "${c.name}"`, row: 'course' });
  };

  const loadFromApi = (c: FetchedCourse) => {
    const count = holeCount <= 9 ? Math.min(9, c.holes.length) : Math.min(18, c.holes.length);
    const applied = sliceCourseHoles(c.holes, count);
    setCourse(c.name);
    setHoleCount(count);
    setHoles(applied);
    setAdvancedHoles(applied.some((h) => h.strokeIndex));
    setHolesSource('search');
    setImported({ raw: c.holes, expected: count });
    openRow('holes');
    setError('');
    setSavedNote({
      text: applied.some((h) => h.strokeIndex)
        ? `Loaded "${c.name}" — par + stroke index`
        : `Loaded "${c.name}" — par only (no stroke index in database)`,
      row: 'course',
    });
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
      slope,
      rating,
    });
    setCourses(listCourses());
    setError('');
    setSavedNote({ text: `Saved "${name}"`, row: from === 'check' ? 'check' : 'holes' });
    // Keeping a course is the user vouching for it, so the "check this against
    // the card" caveat has served its purpose and goes. From here their copy
    // is the one that loads, and search is only ever saving them the typing.
    setHolesSource('saved');
    setImported(null);
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
    // loaded/saved note describe a course that no longer matches the holes —
    // and these are the user's own pars now, not the database's.
    setSavedNote(null);
    setHolesSource('manual');
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
    setSavedNote(null);
    setHolesSource('manual');
    setImported(null);
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

  const setPar = (number: number, par: number) => {
    setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, par } : h)));
    // A single hand-edited par is still enough to make the loaded/saved note
    // describe a course the holes no longer match.
    setSavedNote(null);
  };

  const toggleGame = (g: GameType) =>
    setGames((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));

  const namedPlayers = players.filter((p) => p.name.trim());
  const showNet = games.some(usesHandicap);
  const showStableford = games.includes('stableford');
  const showWolf = games.includes('wolf');
  const showNassau = games.includes('nassau');
  const showMatchPlay = games.includes('matchPlay');
  const showVegas = games.includes('vegas');
  // Gross and net are the same card until somebody has a handicap, so the
  // per-game picker stays out of the way until the choice means something.
  // An Index counts: on a rated course it is what their strokes come from.
  const anyHandicap = namedPlayers.some((p) => (p.handicap ?? 0) > 0 || p.index != null);
  const allowanceGames = games.filter(usesHandicap);
  const showScoring = anyHandicap && allowanceGames.length > 0;
  // Only surfaced while the stroke index editor is open: a user who never
  // opened it did not enter these and cannot act on the message.
  const siProblem = strokeIndexProblem(holes);
  /**
   * Whether these holes carry figures good enough to work a course handicap
   * out from an Index. Both have to be plausible: a slope alone, or a rating
   * left over from a different number of holes, would produce a confident
   * wrong answer rather than no answer.
   */
  // Judged against the holes the rating covers, not the holes being played —
  // otherwise an eighteen-hole rating loaded to play nine reads as implausible
  // and the Index column never appears.
  const ratedHoles = ratingHoles ?? holes.length;
  const rated = validSlope(slope) && validRating(rating, ratedHoles);
  /** The course handicap an Index is worth here, for showing beside the field. */
  const derivedHandicap = (index: number | undefined): number | null => {
    if (!rated || index == null || Number.isNaN(index)) return null;
    return courseHandicap({
      index,
      slope: slope as number,
      rating: rating as number,
      ratingHoles: ratedHoles,
      playingHoles: holes.length,
      playingPar: holes.reduce((sum, h) => sum + h.par, 0),
    });
  };
  // Re-read every render, so correcting a hole clears the line about it.
  const importIssues =
    holesSource === 'search' && imported
      ? scorecardIssues(holes, imported.expected, imported.raw)
      : [];
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
      index: showNet ? p.index : undefined,
    }));

    // Net scoring is automatic: on when anybody brought a handicap, by either
    // route — a stroke count typed in, or an Index the course can convert.
    const useNet = cleanPlayers.some(
      (p) => (p.handicap ?? 0) > 0 || (rated && p.index != null)
    );

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

    let vegas: TeamSetup | undefined;
    if (games.includes('vegas')) {
      const r = buildTeams('2v2', '', '', vegasAssign);
      if (typeof r === 'string') return gamesError(`Vegas: ${r}`);
      vegas = r;
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
      options: { ...options, useNet, netByGame, allowanceByGame, nassau, matchPlay, vegas },
      // Copied onto the round so it stays scoreable on its own terms: editing
      // the saved course later must not re-handicap a round already played.
      slope: rated ? slope : undefined,
      rating: rated ? rating : undefined,
      ratingHoles: rated ? ratingHoles : undefined,
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
    setSavedNote(null);
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
              aria-label={`Name of player ${i + 1}`}
            />
            {showNet &&
              (rated ? (
                /* A rated course can work the strokes out, so the field asks
                   for the number the player actually carries between courses
                   and shows what it is worth here. Asking for both would be
                   asking the same question twice. */
                <span className="player-index">
                  <input
                    className="player-hcp"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={p.index ?? ''}
                    onChange={(e) =>
                      updatePlayer(p.id, {
                        index: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Index"
                    aria-label={`Handicap Index for ${p.name || `player ${i + 1}`}`}
                  />
                  {derivedHandicap(p.index) != null && (
                    <span
                      className="player-derived"
                      aria-label={`Plays off ${derivedHandicap(p.index)} on these holes`}
                    >
                      {/* The arrow is doing real work: without it this is a
                          second number beside the first with nothing to say
                          it is the answer rather than another question. */}
                      <span aria-hidden="true" className="player-derived-arrow">
                        →
                      </span>
                      {derivedHandicap(p.index)}
                    </span>
                  )}
                </span>
              ) : (
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
                  aria-label={`Handicap for ${p.name || `player ${i + 1}`}`}
                />
              ))}
            <button
              className="player-del"
              onClick={() => removePlayer(p.id)}
              aria-label="Remove player"
            >
              <XIcon />
            </button>
          </div>
        ))}
        {/* One row. Both of these add a single player — which is why the
            chips sit beside the button rather than under it — and stacked
            they spent 50px of a screen that was already scrolling with every
            row collapsed. */}
        <div className="add-row">
          <button className="btn-ghost add" onClick={addPlayer}>
            + Add player
          </button>
          <RecentChips recent={recent} onAdd={addFromRoster} />
        </div>
        {showNet && (
          <p className="hint">
            {rated
              ? 'Enter each player’s Handicap Index — the number after the arrow is what they play off here. All blank scores gross.'
              : 'Enter handicaps to score net — all blank scores gross, and a blank plays off 0.'}
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
                    {/* The name gets a line to itself. Sharing one with the
                        two buttons truncated it on a narrow phone — and the
                        name is the part you are reading to decide. */}
                    <button className="saved-course-load" onClick={() => loadCourse(c)}>
                      <span className="saved-course-name">{c.name}</span>
                    </button>
                    <div className="saved-course-foot">
                      <span className="saved-course-meta">
                        {c.holes.length} holes · par {c.holes.reduce((s, h) => s + h.par, 0)}
                        {c.holes.some((h) => h.strokeIndex) ? ' · stroke index set' : ''}
                      </span>
                      {/* Checking a scorecard is done once, by one person.
                          This is how the other three get the checked one
                          instead of each re-typing it, or not bothering. */}
                      <button
                        className="saved-course-send"
                        onClick={() => setSendingCourse(c)}
                        aria-label={`Send ${c.name} to another phone`}
                      >
                        <QrIcon size={16} />
                      </button>
                      <DeleteButton
                        className="saved-course-del"
                        label={`saved course ${c.name}`}
                        onDelete={() => removeCourse(c.id)}
                      >
                        <XIcon />
                      </DeleteButton>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {savedNote?.row === 'course' && (
            <p className="hint-inline" role="status">
              {savedNote.text}
            </p>
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

          {showScoring && (
            <section className="card">
              <h2>Scoring</h2>
              <p className="hint-inline">
                Handicaps apply everywhere at full allowance by default. Set a game to gross to
                play it off the card, or cut the allowance the way the format asks — 90% for a
                singles match, 85% for a four-ball.
              </p>
              {allowanceGames.map((g) => {
                const canNet = canScoreNet(g);
                const net = canNet ? (netByGame[g] ?? true) : false;
                // An allowance cuts handicap strokes, so it only means
                // anything where handicap strokes are being used: a game set
                // to gross has none to cut. Quota has no gross/net choice at
                // all and always spends the handicap, so it always asks.
                const showAllowance = canNet ? net : true;
                return (
                  <div key={g} className="score-mode-row">
                    <span className="score-mode-name">{gameMeta(g).label}</span>
                    {canNet && (
                      <div className="seg small">
                        {([false, true] as const).map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            className={`seg-btn${net === v ? ' active' : ''}`}
                            aria-pressed={net === v}
                            onClick={() => setNetByGame((m) => ({ ...m, [g]: v }))}
                          >
                            {v ? 'Net' : 'Gross'}
                          </button>
                        ))}
                      </div>
                    )}
                    {showAllowance && (
                      <select
                        className="allowance-select"
                        value={allowanceByGame[g] ?? 100}
                        onChange={(e) =>
                          setAllowanceByGame((m) => ({ ...m, [g]: Number(e.target.value) }))
                        }
                        aria-label={`Handicap allowance for ${gameMeta(g).label}`}
                      >
                        {[100, 95, 90, 85, 75, 50].map((pct) => (
                          <option key={pct} value={pct}>
                            {pct}%
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </section>
          )}

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

          {showVegas && (
            <TeamPicker
              label="Vegas teams"
              players={namedPlayers}
              canTeams={canTeams}
              teamsOnly
              mode="2v2"
              onMode={() => {}}
              sideA=""
              sideB=""
              onSideA={() => {}}
              onSideB={() => {}}
              assign={vegasAssign}
              onAssign={(id, v) => setVegasAssign((a) => ({ ...a, [id]: v }))}
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

          {(showStableford || showWolf || showVegas || showNassau) && (
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
              {showNassau && (
                <label className="set-row">
                  <span>
                    <span className="set-label">Nassau auto-press</span>
                    <span className="set-hint">Press automatically when a side goes 2 down</span>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    checked={options.autoPress === true}
                    onChange={(e) => setOptions({ ...options, autoPress: e.target.checked })}
                  />
                </label>
              )}
              {showVegas && (
                <label className="set-row">
                  <span>
                    <span className="set-label">Vegas birdie flip</span>
                    <span className="set-hint">A birdie turns the other side's number around</span>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    checked={options.vegasFlip !== false}
                    onChange={(e) => setOptions({ ...options, vegasFlip: e.target.checked })}
                  />
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
            {/* One slot, two states, written as a choice so they cannot both
                appear: the caveat while the numbers are still the database's,
                and — once the user has vouched for them — the confirmation, in
                the same place. Saving from here retires the caveat, so putting
                the answer at the foot of the row instead (below the whole par
                grid, a screenful away) would read as the press having
                dismissed a warning and done nothing else. */}
            {holesSource === 'search' ? (
              <p className={`check-note${importIssues.length ? ' bad' : ''}`} role="status">
                <strong>Check these against the card.</strong> Pars and stroke indexes from
                course search are open community data and are sometimes wrong — a par out by one
                shifts every net score and Stableford point for the whole round.
                {importIssues.length > 0 && (
                  <>
                    {' '}
                    Some of it already looks off:
                    <span className="issue-list">
                      {importIssues.map((issue) => (
                        <span key={issue}>{issue}</span>
                      ))}
                    </span>
                  </>
                )}
                {/* The point of checking a course is not having to check it
                    again. Offered here rather than only at the foot of the
                    card, because this is where the checking happens — and
                    saving is what turns a database guess into the copy that
                    loads next time. */}
                <button
                  type="button"
                  className="check-save"
                  onClick={() => saveFavorite('check')}
                >
                  <StarIcon size={15} />
                  {importIssues.length > 0
                    ? 'Save this course anyway'
                    : 'Looks right — save this course'}
                </button>
              </p>
            ) : savedNote?.row === 'check' ? (
              <p className="check-note saved" role="status">
                <StarIcon size={15} /> {savedNote.text} — it loads from here next time.
              </p>
            ) : null}
            <div className="rating-row">
              <label className="field small">
                <span>Slope</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={55}
                  max={155}
                  value={slope ?? ''}
                  onChange={(e) => setSlope(e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="113"
                />
              </label>
              <label className="field small">
                <span>Rating</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={rating ?? ''}
                  onChange={(e) => {
                    setRating(e.target.value === '' ? undefined : Number(e.target.value));
                    setRatingHoles(holes.length);
                  }}
                  placeholder={`${holes.length * 4}.0`}
                />
              </label>
            </div>
            <p className="hint-inline">
              {rated
                ? `Handicap Index converts to strokes for these ${holes.length} holes.`
                : `Optional — off the card, for these ${holes.length} holes. With both, players can enter a Handicap Index instead of working out their own strokes.`}
            </p>
            <div className="preset-row">
              <span>Quick set:</span>
              <button className="chip" onClick={() => applyPreset('standard')}>
                Standard par {holeCount === 9 ? 36 : 72}
              </button>
              <button className="chip" onClick={() => applyPreset('par4')}>
                All par 4
              </button>
            </div>
            {/* A div, not a label: with stroke index showing, a cell holds two
                controls, and a <label> may only name one of them. Each field
                carries its own accessible name instead, and — once there are
                two boxes to tell apart — its own visible caption. Without them
                the cell is a hole number over two bare boxes, and the default
                stroke indexes make it worse by repeating the hole number
                underneath itself. */}
            <div className={`par-grid${advancedHoles ? ' with-si' : ''}`}>
              {holes.map((h) => (
                <div key={h.number} className="par-cell">
                  <span className="par-hole">{h.number}</span>
                  {advancedHoles && <span className="par-cap">Par</span>}
                  <select
                    value={h.par}
                    onChange={(e) => setPar(h.number, Number(e.target.value))}
                    aria-label={`Par for hole ${h.number}`}
                  >
                    {parOptions(h.par).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {advancedHoles && (
                    <>
                      <span className="par-cap">SI</span>
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
                    </>
                  )}
                </div>
              ))}
            </div>
            {advancedHoles && siProblem && (
              <p className="check-note bad" role="status">
                <strong>These stroke indexes can't be used.</strong>{' '}
                {describeStrokeIndexProblem(siProblem, holes.length)} Until it's fixed, handicap
                strokes fall in hole order instead — everyone still gets the right number of
                shots, just not on the holes the course would pick.
              </p>
            )}
            <button className="btn-ghost add" onClick={toggleAdvanced}>
              {advancedHoles ? '− Hide hole difficulty' : '+ Set hole difficulty (stroke index)'}
            </button>
            {advancedHoles && (
              <p className="hint-inline">
                Stroke index ranks hole difficulty (1 = hardest). Used to allocate handicap
                strokes in net games.
              </p>
            )}
            {/* Stands down while the call-out above is offering the same
                action: two identical buttons on one card is a question about
                which one is the real one. This is the general path — a course
                typed or preset by hand — and the call-out's is the prompt at
                the moment it matters. */}
            {holesSource !== 'search' && (
              <button className="btn-ghost add" onClick={() => saveFavorite('foot')}>
                <StarIcon size={16} /> Save this course for next time
              </button>
            )}
            {savedNote?.row === 'holes' && (
              <p className="hint-inline" role="status">
                {savedNote.text}
              </p>
            )}
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
        <button className="btn-primary big" onClick={start}>
          Start Round →
        </button>
      </div>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} screen="setup" />}

      {sendingCourse && (
        <SendRound course={sendingCourse} onClose={() => setSendingCourse(null)} />
      )}
    </div>
  );
}
