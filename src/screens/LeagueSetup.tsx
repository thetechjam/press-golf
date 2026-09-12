import { useState } from 'react';
import type { Round, Player, Hole, SavedCourse } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { uid, listCourses, saveCourse, deleteCourse } from '../storage';
import { CourseSearch } from '../components/CourseSearch';
import { DeleteButton } from '../components/DeleteButton';
import { sliceCourseHoles, type FetchedCourse } from '../courses/openGolfApi';
import { strokeIndexProblem, describeStrokeIndexProblem } from '../games/strokeIndex';
import { parOptions } from '../courses/parOptions';
import { validSlope, validRating, courseHandicap } from '../games/courseHandicap';
import { StarIcon, XIcon, GearIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { SetupRow } from '../components/SetupRow';
import { leagueCourseSummary } from '../setupSummary';

interface Props {
  onCancel: () => void;
  onStart: (round: Round) => void;
}

interface TeamState {
  a: Player;
  b: Player;
}

type Nine = 'front' | 'back';

const makeHoles = (nine: Nine): Hole[] => {
  const start = nine === 'back' ? 10 : 1;
  return Array.from({ length: 9 }, (_, i) => ({ number: start + i, par: 4, strokeIndex: i + 1 }));
};

const newPlayer = (): Player => ({ id: uid(), name: '', handicap: undefined });

export function LeagueSetup({ onCancel, onStart }: Props) {
  const [course, setCourse] = useState('');
  /**
   * The course's slope and rating, and how many holes that rating covers.
   *
   * `ratingHoles` earns its place here more than anywhere: a league night is
   * nine holes off a course almost always rated over eighteen, so without it
   * the figure loaded from a saved card is judged against nine holes, fails as
   * implausible, and every player falls back to a typed stroke count.
   */
  const [slope, setSlope] = useState<number | undefined>();
  const [rating, setRating] = useState<number | undefined>();
  const [ratingHoles, setRatingHoles] = useState<number | undefined>();
  const [nine, setNine] = useState<Nine>('front');
  const [holes, setHoles] = useState<Hole[]>(makeHoles('front'));
  // Full scorecard behind the current nine (18 holes when loaded from a course),
  // so switching Front/Back re-slices the correct pars/indexes instead of just
  // relabeling. Null when holes were entered by hand.
  const [source, setSource] = useState<Hole[] | null>(null);
  const [startHole, setStartHole] = useState(1);
  const [teams, setTeams] = useState<TeamState[]>([
    { a: newPlayer(), b: newPlayer() },
    { a: newPlayer(), b: newPlayer() },
  ]);
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  const [savedNote, setSavedNote] = useState('');
  const [error, setError] = useState('');
  // The pars/stroke-index grid is the biggest block on this screen and is
  // almost always left at its defaults, but the Front/Back toggle above it is
  // the one control a league night genuinely changes. Collapsing the grid
  // keeps that toggle reachable without scrolling past 200px of selects.
  const [courseDetailOpen, setCourseDetailOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const switchNine = (n: Nine) => {
    setNine(n);
    // Keep the same position within the nine (e.g. start hole 5 → 14).
    setStartHole((s) => (n === 'back' ? (s <= 9 ? s + 9 : s) : s > 9 ? s - 9 : s));
    if (source && source.length >= 18) {
      setHoles(sliceCourseHoles(source, 9, { nine: n }));
    } else {
      // Manual entry or a 9-hole source: keep pars/indexes, just renumber.
      const start = n === 'back' ? 10 : 1;
      setHoles((hs) => hs.map((h, i) => ({ ...h, number: start + i })));
    }
  };

  const updatePlayer = (ti: number, role: 'a' | 'b', patch: Partial<Player>) =>
    setTeams((ts) =>
      ts.map((t, i) => (i === ti ? { ...t, [role]: { ...t[role], ...patch } } : t))
    );

  const setPar = (n: number, par: number) =>
    setHoles((hs) => hs.map((h) => (h.number === n ? { ...h, par } : h)));
  const setSI = (n: number, si: number | undefined) =>
    setHoles((hs) => hs.map((h) => (h.number === n ? { ...h, strokeIndex: si } : h)));

  const loadCourse = (c: SavedCourse) => {
    setCourse(c.name);
    setSource(c.holes);
    setHoles(sliceCourseHoles(c.holes, 9, { nine }));
    setSlope(c.slope);
    setRating(c.rating);
    setRatingHoles(c.holes.length);
    setSavedNote(`Loaded "${c.name}" — ${nine === 'back' ? 'back 9' : 'front 9'}`);
  };
  const saveFavorite = () => {
    const name = course.trim();
    if (!name) return setError('Add a course name before saving.');
    const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
    saveCourse({
      id: existing?.id ?? uid(),
      name,
      holes: holes.map((h) => ({ ...h })),
      // The nine on screen is what is being saved, so its rating covers nine.
      slope,
      rating: ratingHoles === holes.length ? rating : undefined,
    });
    setCourses(listCourses());
    setError('');
    setSavedNote(`Saved "${name}"`);
  };
  const removeCourse = (id: string) => {
    deleteCourse(id);
    setCourses(listCourses());
  };

  const loadFromApi = (c: FetchedCourse) => {
    const need = nine === 'back' ? 18 : 9;
    if (c.holes.length < need) {
      setError(
        `"${c.name}" has no ${nine === 'back' ? 'back' : 'full'} 9-hole scorecard in the database.`
      );
      return;
    }
    setCourse(c.name);
    setSource(c.holes);
    const applied = sliceCourseHoles(c.holes, 9, { nine });
    setHoles(applied);
    setError('');
    const label = nine === 'back' ? 'back 9' : 'front 9';
    setSavedNote(
      applied.some((h) => typeof h.strokeIndex === 'number')
        ? `Loaded ${label} of "${c.name}" — par + stroke index`
        : `Loaded ${label} of "${c.name}" — par only`
    );
  };

  const start = () => {
    const allPlayers = teams.flatMap((t) => [t.a, t.b]);
    if (allPlayers.some((p) => !p.name.trim()))
      return setError('Name all four players (A and B on each team).');
    // A number to score off is mandatory for a league: every match (A, B,
    // Team) is net, so a blank must not silently become scratch. Which number
    // depends on the field actually on screen — on a rated nine that is the
    // Index, and demanding a stroke count there made the round unstartable.
    const figure = (p: TeamState['a']) => (rated ? p.index : p.handicap);
    if (allPlayers.some((p) => figure(p) == null || Number.isNaN(figure(p) as number))) {
      return setError(
        rated
          ? 'Enter a Handicap Index for all four players — league scoring needs it.'
          : 'Enter a handicap for all four players — league scoring needs it.'
      );
    }

    const players: Player[] = allPlayers.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      // Both are carried when present: `courseHandicapFor` prefers the Index
      // where the course can convert it and falls back to the stroke count,
      // so a round stays scoreable if its rating is later found to be wrong.
      handicap: p.handicap,
      index: p.index,
    }));

    // Rotate holes into play order so the round starts on the chosen hole
    // (e.g. start on 5 → 5,6,7,8,9,1,2,3,4). Navigation, resume, and the
    // Finish button all follow the array order, so this is the whole feature.
    const si = holes.findIndex((h) => h.number === startHole);
    const playOrder = si <= 0 ? holes : [...holes.slice(si), ...holes.slice(0, si)];

    const round: Round = {
      id: uid(),
      course: course.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players,
      holes: playOrder,
      games: [],
      options: {
        ...DEFAULT_OPTIONS,
        league: {
          // League standard: each match (A, B, Team) is worth 1 point.
          pointsPerMatch: 1,
          teams: [
            { aId: teams[0].a.id, bId: teams[0].b.id },
            { aId: teams[1].a.id, bId: teams[1].b.id },
          ],
        },
      },
      scores: {},
      wolf: {},
      presses: [],
      slope: rated ? slope : undefined,
      rating: rated ? rating : undefined,
      ratingHoles: rated ? ratingHoles : undefined,
      status: 'in_progress',
    };
    onStart(round);
  };

  // Judged against the holes the rating covers, not the nine being played.
  const ratedHoles = ratingHoles ?? holes.length;
  const rated = validSlope(slope) && validRating(rating, ratedHoles);
  /** What a player's Index is worth over this nine, for showing beside the field. */
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

  const siProblem = strokeIndexProblem(holes);

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>Golf League</h1>
        <button className="btn-ghost icon" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
      </header>

      <CourseSearch
        value={course}
        onChange={setCourse}
        onPick={loadFromApi}
        placeholder="Thursday Night League"
      />

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
                    {c.holes.some((h) => h.strokeIndex) ? ' · stroke index set' : ''}
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

      {teams.map((t, ti) => (
        <section key={ti} className="card">
          <h2>Team {ti + 1}</h2>
          {(['a', 'b'] as const).map((role) => (
            <div key={role} className="player-row">
              <span className="ab-badge">{role.toUpperCase()}</span>
              {/* Named, because a placeholder is not an accessible name and
                  goes the moment somebody types. There are four of each of
                  these on the screen, so the name has to say which team and
                  which slot, not just "player". */}
              <input
                className="player-name"
                value={t[role].name}
                onChange={(e) => updatePlayer(ti, role, { name: e.target.value })}
                placeholder={`${role.toUpperCase()} player`}
                aria-label={`Name of team ${ti + 1}'s ${role.toUpperCase()} player`}
              />
              {/* A rated nine can work the strokes out, so the field asks for
                  the number the player carries between courses and shows what
                  it is worth here — the same trade as New Round. League's own
                  rules then run on the result: the low man of the match is
                  subtracted from it, and the cap still allows one a hole. */}
              {rated ? (
                <span className="player-index">
                  <input
                    className="player-hcp"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={t[role].index ?? ''}
                    onChange={(e) =>
                      updatePlayer(ti, role, {
                        index: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Index"
                    aria-label={`Handicap Index for team ${ti + 1}'s ${role.toUpperCase()} player`}
                  />
                  {derivedHandicap(t[role].index) != null && (
                    <span
                      className="player-derived"
                      aria-label={`Plays off ${derivedHandicap(t[role].index)} on this nine`}
                    >
                      <span aria-hidden="true" className="player-derived-arrow">
                        →
                      </span>
                      {derivedHandicap(t[role].index)}
                    </span>
                  )}
                </span>
              ) : (
                <input
                  className="player-hcp"
                  type="number"
                  inputMode="numeric"
                  value={t[role].handicap ?? ''}
                  onChange={(e) =>
                    updatePlayer(ti, role, {
                      handicap: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="HCP"
                  aria-label={`Handicap for team ${ti + 1}'s ${role.toUpperCase()} player`}
                />
              )}
            </div>
          ))}
        </section>
      ))}

      <section className="card">
        <h2>Course · {nine === 'back' ? 'Back 9 (holes 10–18)' : 'Front 9 (holes 1–9)'}</h2>

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
                // Typed here, it is the rating for the nine on screen.
                setRatingHoles(holes.length);
              }}
              placeholder={`${holes.length * 4}.0`}
            />
          </label>
        </div>
        <p className="hint-inline">
          {rated
            ? ratedHoles === holes.length
              ? 'Handicap Index converts to strokes for this nine.'
              : `Rated over ${ratedHoles} holes — an Index converts to strokes for this nine.`
            : 'Optional — off the card. With both, players can enter a Handicap Index instead of working out their own strokes.'}
        </p>
        <div className="seg">
          {(['front', 'back'] as const).map((n) => (
            <button
              key={n}
              className={`seg-btn${nine === n ? ' active' : ''}`}
              onClick={() => switchNine(n)}
            >
              {n === 'front' ? 'Front 9' : 'Back 9'}
            </button>
          ))}
        </div>
        <SetupRow
          label="Pars & Stroke Index"
          summary={leagueCourseSummary(holes)}
          open={courseDetailOpen}
          onToggle={() => setCourseDetailOpen((o) => !o)}
        >
          {/* Always both boxes here, so always both captions. They replace a
              "top box = par, bottom = stroke index" hint, which only held while
              the two sat in that order — cells wrap, and the hint did not. */}
          <div className="par-grid with-si">
            {holes.map((h) => (
              <div key={h.number} className="par-cell">
                <span className="par-hole">{h.number}</span>
                <span className="par-cap">Par</span>
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
                <span className="par-cap">SI</span>
                <input
                  className="si-input"
                  type="number"
                  min={1}
                  max={9}
                  value={h.strokeIndex ?? ''}
                  onChange={(e) => setSI(h.number, e.target.value === '' ? undefined : Number(e.target.value))}
                  aria-label={`Stroke index for hole ${h.number}`}
                />
              </div>
            ))}
          </div>
          <p className="hint-inline">Stroke index ranks hole difficulty (1 = hardest).</p>
          {siProblem && (
            <p className="check-note bad" role="status">
              <strong>These stroke indexes can't be used.</strong>{' '}
              {describeStrokeIndexProblem(siProblem, holes.length)} Until it's fixed, handicap
              strokes fall in hole order instead — everyone still gets the right number of shots,
              just not on the holes the course would pick.
            </p>
          )}
          <button className="btn-ghost add" onClick={saveFavorite}>
            <StarIcon size={16} /> Save this course for next time
          </button>
        </SetupRow>
        {/* Outside the row on purpose: loading a course from the search at the
            top of the screen writes this note, so hiding it inside a collapsed
            row would swallow the confirmation for an action taken elsewhere. */}
        {savedNote && <p className="hint-inline">{savedNote}</p>}
      </section>

      <section className="card">
        <h2>Starting hole</h2>
        <div className="start-hole-grid">
          {/* The number alone is enough on screen, under a heading that says
              what the grid is for. A screen reader gets the buttons without
              the heading, so nine of them announced as "1" through "9" with
              nothing to say what pressing one does. */}
          {holes.map((h) => (
            <button
              key={h.number}
              className={`seg-btn${startHole === h.number ? ' active' : ''}`}
              onClick={() => setStartHole(h.number)}
              aria-pressed={startHole === h.number}
              aria-label={`Start on hole ${h.number}`}
            >
              {h.number}
            </button>
          ))}
        </div>
        <p className="hint-inline">
          The round begins here and wraps around — e.g. start on 5, finish on 4.
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <button className="btn-primary big sticky" onClick={start}>
        Start League Round →
      </button>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} screen="leagueSetup" />}
    </div>
  );
}
