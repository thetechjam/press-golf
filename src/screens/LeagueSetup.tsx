import { useState } from 'react';
import type { Round, Player, Hole, SavedCourse } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { uid, listCourses, saveCourse, deleteCourse } from '../storage';

interface Props {
  onCancel: () => void;
  onStart: (round: Round) => void;
}

interface TeamState {
  name: string;
  a: Player;
  b: Player;
}

const makeHoles = (): Hole[] =>
  Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

const newPlayer = (): Player => ({ id: uid(), name: '', handicap: undefined });

export function LeagueSetup({ onCancel, onStart }: Props) {
  const [course, setCourse] = useState('');
  const [holes, setHoles] = useState<Hole[]>(makeHoles());
  const [pointsPerMatch, setPointsPerMatch] = useState(1);
  const [teams, setTeams] = useState<TeamState[]>([
    { name: '', a: newPlayer(), b: newPlayer() },
    { name: '', a: newPlayer(), b: newPlayer() },
  ]);
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  const [savedNote, setSavedNote] = useState('');
  const [error, setError] = useState('');

  const updatePlayer = (ti: number, role: 'a' | 'b', patch: Partial<Player>) =>
    setTeams((ts) =>
      ts.map((t, i) => (i === ti ? { ...t, [role]: { ...t[role], ...patch } } : t))
    );
  const updateTeamName = (ti: number, name: string) =>
    setTeams((ts) => ts.map((t, i) => (i === ti ? { ...t, name } : t)));

  const setPar = (n: number, par: number) =>
    setHoles((hs) => hs.map((h) => (h.number === n ? { ...h, par } : h)));
  const setSI = (n: number, si: number | undefined) =>
    setHoles((hs) => hs.map((h) => (h.number === n ? { ...h, strokeIndex: si } : h)));

  const loadCourse = (c: SavedCourse) => {
    setCourse(c.name);
    // League is 9 holes; take the first nine of the saved course.
    const nine = c.holes.slice(0, 9).map((h, i) => ({ ...h, number: i + 1 }));
    setHoles(nine.length === 9 ? nine : makeHoles());
    setSavedNote(`Loaded "${c.name}"`);
  };
  const saveFavorite = () => {
    const name = course.trim();
    if (!name) return setError('Add a course name before saving.');
    const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
    saveCourse({ id: existing?.id ?? uid(), name, holes: holes.map((h) => ({ ...h })) });
    setCourses(listCourses());
    setError('');
    setSavedNote(`Saved "${name}" ★`);
  };
  const removeCourse = (id: string) => {
    deleteCourse(id);
    setCourses(listCourses());
  };

  const start = () => {
    const allPlayers = teams.flatMap((t) => [t.a, t.b]);
    if (allPlayers.some((p) => !p.name.trim()))
      return setError('Name all four players (A and B on each team).');

    const players: Player[] = allPlayers.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      handicap: p.handicap ?? 0,
    }));

    const round: Round = {
      id: uid(),
      course: course.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players,
      holes,
      games: [],
      options: {
        ...DEFAULT_OPTIONS,
        league: {
          pointsPerMatch,
          teams: [
            { name: teams[0].name.trim() || undefined, aId: teams[0].a.id, bId: teams[0].b.id },
            { name: teams[1].name.trim() || undefined, aId: teams[1].a.id, bId: teams[1].b.id },
          ],
        },
      },
      scores: {},
      wolf: {},
      presses: [],
      status: 'in_progress',
    };
    onStart(round);
  };

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost" onClick={onCancel}>
          ‹ Back
        </button>
        <h1>Golf League</h1>
        <span />
      </header>

      <label className="field">
        <span>Course (optional)</span>
        <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Thursday Night League" />
      </label>

      {courses.length > 0 && (
        <div className="course-faves">
          <span className="faves-label">Saved courses</span>
          <div className="fave-chips">
            {courses.map((c) => (
              <span key={c.id} className="fave-chip">
                <button className="fave-load" onClick={() => loadCourse(c)}>
                  {c.name}
                </button>
                <button
                  className="fave-del"
                  onClick={() => removeCourse(c.id)}
                  aria-label={`Delete saved course ${c.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {teams.map((t, ti) => (
        <section key={ti} className="card">
          <h2>Team {ti + 1}</h2>
          <label className="field">
            <span>Team name (optional)</span>
            <input value={t.name} onChange={(e) => updateTeamName(ti, e.target.value)} placeholder={`Team ${ti + 1}`} />
          </label>
          {(['a', 'b'] as const).map((role) => (
            <div key={role} className="player-row">
              <span className="ab-badge">{role.toUpperCase()}</span>
              <input
                className="player-name"
                value={t[role].name}
                onChange={(e) => updatePlayer(ti, role, { name: e.target.value })}
                placeholder={`${role.toUpperCase()} player`}
              />
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
              />
            </div>
          ))}
        </section>
      ))}

      <section className="card">
        <h2>Course · 9 holes</h2>
        <div className="par-grid">
          {holes.map((h) => (
            <div key={h.number} className="par-cell">
              <span>{h.number}</span>
              <select value={h.par} onChange={(e) => setPar(h.number, Number(e.target.value))}>
                {[3, 4, 5, 6].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
        <p className="hint-inline">Top box = par, bottom = stroke index (1 = hardest).</p>
        <button className="btn-ghost add" onClick={saveFavorite}>
          ★ Save this course for next time
        </button>
        {savedNote && <p className="hint-inline">{savedNote}</p>}
      </section>

      <section className="card">
        <h2>Points</h2>
        <label className="field small">
          <span>Points per match won</span>
          <input
            type="number"
            min={0}
            step={1}
            value={pointsPerMatch}
            onChange={(e) => setPointsPerMatch(Number(e.target.value))}
          />
        </label>
        <p className="hint-inline">
          A, B, and Team matches each award this many points. A halved match splits them.
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <button className="btn-primary big sticky" onClick={start}>
        Start League Round →
      </button>
    </div>
  );
}
