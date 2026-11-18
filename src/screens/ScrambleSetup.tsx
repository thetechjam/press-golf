import { useMemo, useState, Suspense } from 'react';
import { todayIso } from '../roundDate';
import type { Round, Player, Stakes } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { uid, listRounds } from '../storage';
import { MAX_TEAMS, MIN_MEMBERS, MAX_MEMBERS, defaultTeamName } from '../games/scramble';
import { SetupRow } from '../components/SetupRow';
import { RecentChips } from '../components/RosterChips';
import { SettingsSheet } from '../components/SettingsSheet';
import { SendRound } from '../lazyScreens';
import { GearIcon, XIcon } from '../icons';
import { buildRoster, type RosterEntry } from '../roster';
import { nameKey, peopleOn } from '../people';
import { courseSummary, holesSummary } from '../setupSummary';
import { useCourse } from './setup/useCourse';
import { CourseSection, HolesSection } from './setup/CourseSection';

interface Props {
  onCancel: () => void;
  onStart: (round: Round) => void;
}

interface TeamDraft {
  /** Becomes the team `Player`'s id, and so the key for its scores. */
  id: string;
  /** Blank means "use the default", which the field shows as its placeholder. */
  name: string;
  /** Always MAX_MEMBERS slots; blanks are dropped when the round is built. */
  members: string[];
}

const newTeam = (): TeamDraft => ({ id: uid(), name: '', members: Array(MAX_MEMBERS).fill('') });

const named = (t: TeamDraft) => t.members.map((m) => m.trim()).filter(Boolean);

const WORDS = ['no', 'one', 'two', 'three', 'four'];
const inWords = (n: number) => WORDS[n] ?? String(n);
const capitalise = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "Jesse & Sam" twice becomes "Jesse & Sam" and "Jesse & Sam (2)". */
function distinct(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((n) => {
    let out = n;
    for (let k = 2; taken.has(nameKey(out)); k++) out = `${n} (${k})`;
    taken.add(nameKey(out));
    return out;
  });
}

const MINIMUMS = [undefined, 1, 2, 3, 4, 5, 6] as const;

/**
 * Scramble setup: teams of two to four, one ball each.
 *
 * Built from New Round's own parts — the course hook, the Course and Holes &
 * pars rows, the recall chips and the pinned foot — so the two screens cannot
 * drift apart on the parts they share. What is its own is the teams and the
 * two rules a scramble adds: where the shotgun starts and how often each
 * player's drive has to be used.
 *
 * Each team becomes one `Player`, named after the team, and its people ride
 * beside it in `options.scramble` — see the design note in docs/dev/specs.
 */
export function ScrambleSetup({ onCancel, onStart }: Props) {
  // One team to start: the common case is your own team in an event, where
  // the other teams are on other phones.
  const [teams, setTeams] = useState<TeamDraft[]>(() => [newTeam()]);
  // The team whose field was last touched — where a recall chip puts a name.
  const [lastTeam, setLastTeam] = useState(0);
  const [startHole, setStartHole] = useState(1);
  const [minDrives, setMinDrives] = useState<number | undefined>(undefined);
  const [stake, setStake] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  // Set by a refused Tee Off. Until then a team with one name is a team
  // being typed, not a mistake, and saying so would be nagging.
  const [tried, setTried] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = (key: string) => setOpenRows((rows) => ({ ...rows, [key]: !rows[key] }));
  const openRow = (key: string) => setOpenRows((rows) => ({ ...rows, [key]: true }));

  const {
    cs,
    dispatch,
    derived,
    courses,
    reloadCourses,
    sendingCourse,
    setSendingCourse,
    loadCourse,
    loadFromApi,
    saveFavorite,
    removeCourse,
  } = useCourse({ openRow, setError });

  // Read once, as New Round does, so the chips cannot shift mid-typing.
  const [savedRounds, setSavedRounds] = useState(() => listRounds());
  const roster = useMemo(() => buildRoster(savedRounds), [savedRounds]);
  // Everyone this phone has scored, for the name fields' suggestions. Through
  // peopleOn, so an earlier scramble offers its players and not its team names.
  const knownNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of savedRounds)
      for (const p of peopleOn(r)) {
        const k = nameKey(p.name);
        if (k && !seen.has(k)) seen.set(k, p.name.trim());
      }
    return [...seen.values()];
  }, [savedRounds]);

  const inForm = new Set(teams.flatMap((t) => t.members.map(nameKey)).filter(Boolean));
  // The chip fills the team last worked on; once that one is full, the first
  // team with room, so a tap is never silently thrown away.
  const target = [lastTeam, ...teams.keys()].find((i) => teams[i]?.members.some((m) => !m.trim()));
  const recent = target === undefined ? [] : roster.filter((e) => !inForm.has(nameKey(e.name)));

  const setMember = (ti: number, mi: number, value: string) =>
    setTeams((ts) =>
      ts.map((t, i) => (i === ti ? { ...t, members: t.members.map((m, j) => (j === mi ? value : m)) } : t))
    );

  const addFromRoster = (e: RosterEntry) => {
    if (target === undefined) return;
    const slot = teams[target].members.findIndex((m) => !m.trim());
    setMember(target, slot, e.name);
  };

  const addTeam = () => {
    if (teams.length >= MAX_TEAMS) return;
    setTeams((ts) => [...ts, newTeam()]);
    setLastTeam(teams.length);
  };

  const removeTeam = (ti: number) => {
    if (teams.length <= 1) return;
    setTeams((ts) => ts.filter((_, i) => i !== ti));
    setLastTeam((l) => (l === ti ? 0 : l > ti ? l - 1 : l));
  };

  // The hole list can change under the choice (18 to 9, a back nine loaded),
  // and a start on a hole the round no longer has is a start on its first.
  const start = cs.holes.some((h) => h.number === startHole) ? startHole : cs.holes[0]?.number;
  const short = teams.map((t) => named(t).length < MIN_MEMBERS);
  const staked = teams.length >= 2 && (stake ?? 0) > 0;

  // Worked out on every render rather than stored, so it goes the moment the
  // second name is typed instead of lingering until the next Tee Off.
  const shortTeams = teams.flatMap((t, i) => (short[i] ? [t.name.trim() || `Team ${i + 1}`] : []));
  const shortError = !tried
    ? ''
    : shortTeams.length === 1
      ? `${shortTeams[0]} needs at least ${inWords(MIN_MEMBERS)} players.`
      : shortTeams.length > 1
        ? `Every team needs at least ${inWords(MIN_MEMBERS)} players.`
        : '';
  const footError = shortError || error;

  // A minimum the round cannot hold: each hole has one tee shot to give, so
  // the biggest team needs minimum × members holes. Said, not refused — the
  // group may be about to add holes, or may mean "as near as we can".
  const biggest = Math.max(0, ...teams.map((t) => named(t).length));
  const needed = (minDrives ?? 0) * biggest;
  const minNote =
    biggest > 0 && needed > cs.holes.length
      ? `${capitalise(inWords(biggest))} ${biggest === 1 ? 'player' : 'players'} at ${minDrives} each ` +
        `needs ${needed} holes — this round has ${cs.holes.length}.`
      : '';

  const teeOff = () => {
    if (shortTeams.length) return setTried(true);

    const names = distinct(teams.map((t, i) => t.name.trim() || defaultTeamName(named(t), i)));
    const players: Player[] = teams.map((t, i) => ({ id: t.id, name: names[i] }));

    // Rotated into playing order, as League does: navigation, resume and the
    // Finish button all follow the array, so this is the whole shotgun start.
    const si = cs.holes.findIndex((h) => h.number === start);
    const holes = si <= 0 ? cs.holes : [...cs.holes.slice(si), ...cs.holes.slice(0, si)];

    const stakes: Stakes = staked ? { strokePlay: stake } : {};
    const round: Round = {
      id: uid(),
      course: cs.course.trim() || undefined,
      date: todayIso(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players,
      holes,
      // Gross stroke play between the teams: the board, the money and the
      // results all come from the engine every other round uses. No slope or
      // rating is carried: a scramble has no handicaps for them to convert.
      games: ['strokePlay'],
      options: {
        ...DEFAULT_OPTIONS,
        stakes,
        scramble: {
          teams: teams.map((t) => ({ id: t.id, members: named(t) })),
          ...(minDrives ? { minDrives } : {}),
        },
      },
      scores: {},
      wolf: {},
      presses: [],
      status: 'in_progress',
    };
    dispatch({ type: 'clearNote' });
    onStart(round);
  };

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>Scramble</h1>
        <button className="btn-ghost icon" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
      </header>

      {teams.map((t, ti) => {
        const label = `team ${ti + 1}`;
        return (
          // onFocus bubbles in React, so any field in the card marks it as
          // the one the chips fill.
          <section key={t.id} className="card scramble-team" onFocus={() => setLastTeam(ti)}>
            <div className="scramble-team-head">
              <h2>Team {ti + 1}</h2>
              {teams.length > 1 && (
                <button
                  className="player-del"
                  onClick={() => removeTeam(ti)}
                  aria-label={`Remove ${t.name.trim() || label}`}
                >
                  <XIcon />
                </button>
              )}
            </div>
            <div className="scramble-members">
              {t.members.map((m, mi) => (
                <input
                  key={mi}
                  className="player-name"
                  value={m}
                  onChange={(e) => setMember(ti, mi, e.target.value)}
                  list="press-known-names"
                  autoComplete="off"
                  placeholder={`Player ${mi + 1}`}
                  aria-label={`${label[0].toUpperCase()}${label.slice(1)}, player ${mi + 1}`}
                  aria-invalid={tried && short[ti] ? true : undefined}
                />
              ))}
            </div>
            {tried && short[ti] && (
              <p className="error scramble-team-error">
                Name at least {inWords(MIN_MEMBERS)} players on this team.
              </p>
            )}
            {/* After the people, because the name follows from them: the
                placeholder is the name the team gets if this stays blank,
                worked out as they are typed — so leaving it is a choice the
                screen has already shown the result of. */}
            <label className="field scramble-team-name">
              <span>Team name (optional)</span>
              <input
                value={t.name}
                onChange={(e) =>
                  setTeams((ts) => ts.map((x, i) => (i === ti ? { ...x, name: e.target.value } : x)))
                }
                autoComplete="off"
                placeholder={defaultTeamName(named(t), ti)}
                aria-label={`Name of ${label} (optional)`}
              />
            </label>
          </section>
        );
      })}

      {/* "Add a team" and the recall chips on one row, as New Round's
          "+ Add player" and its chips are: both put somebody on the card. */}
      {(teams.length < MAX_TEAMS || recent.length > 0) && (
        <div className="add-row scramble-add-row">
          {teams.length < MAX_TEAMS && (
            <button className="btn-ghost add" onClick={addTeam}>
              + Add a team
            </button>
          )}
          <RecentChips recent={recent} onAdd={addFromRoster} />
        </div>
      )}

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
          label="Holes & pars"
          summary={holesSummary(cs.holes)}
          open={!!openRows.holes}
          onToggle={() => toggleRow('holes')}
        >
          <HolesSection
            state={cs}
            derived={derived}
            dispatch={dispatch}
            onSave={saveFavorite}
            indexWaiting={false}
            withRating={false}
          />
        </SetupRow>

        <SetupRow
          label="Format"
          summary={`Start on ${start} · ${minDrives ? `${minDrives} drive${minDrives > 1 ? 's' : ''} each` : 'No minimum'}`}
          open={!!openRows.format}
          onToggle={() => toggleRow('format')}
        >
          <section className="card">
            <h2>Starting hole</h2>
            <div className="start-hole-grid">
              {cs.holes.map((h) => (
                <button
                  key={h.number}
                  className={`seg-btn${start === h.number ? ' active' : ''}`}
                  onClick={() => setStartHole(h.number)}
                  aria-pressed={start === h.number}
                  aria-label={`Start on hole ${h.number}`}
                >
                  {h.number}
                </button>
              ))}
            </div>
            <p className="hint-inline">
              For a shotgun start. The round wraps around — start on 5, finish on 4.
            </p>
          </section>
          <section className="card">
            <h2>Tee shot minimum</h2>
            <div className="start-hole-grid scramble-min" role="group" aria-label="Tee shot minimum">
              {MINIMUMS.map((n) => (
                <button
                  key={n ?? 'none'}
                  className={`seg-btn${minDrives === n ? ' active' : ''}`}
                  onClick={() => setMinDrives(n)}
                  aria-pressed={minDrives === n}
                  aria-label={n ? `At least ${n} tee shot${n > 1 ? 's' : ''} each` : 'No minimum'}
                >
                  {n ?? 'None'}
                </button>
              ))}
            </div>
            <p className="hint-inline">
              If every player’s drive has to be used a set number of times. Par 3s count.
            </p>
            {minNote && (
              <p className="check-note scramble-min-note" role="status">
                {minNote}
              </p>
            )}
          </section>
        </SetupRow>

        {/* Only with somebody to play against. One team's stake would be a
            bet with itself, so the row is not there to be filled in. */}
        {teams.length >= 2 && (
          <SetupRow
            label="Stake"
            summary={staked ? `$${stake} per team` : 'No stake'}
            open={!!openRows.stake}
            onToggle={() => toggleRow('stake')}
          >
            <section className="card">
              <div className="stakes-editor">
                <label className="stake-row">
                  <span className="stake-label">Team stake</span>
                  <span className="stake-input">
                    <span className="dollar">$</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={stake ?? ''}
                      placeholder="0"
                      onChange={(e) => setStake(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                    <span className="per">per team</span>
                  </span>
                </label>
              </div>
              <p className="hint">$ per team — low team takes it from each of the others.</p>
            </section>
          </SetupRow>
        )}
      </div>

      <div className="screen-foot">
        {/* In the pinned bar, and an alert, for the reasons New Round gives. */}
        {footError && (
          <p className="error" role="alert">
            {footError}
          </p>
        )}
        <button className="btn-primary big" onClick={teeOff}>
          Tee Off →
        </button>
      </div>

      <datalist id="press-known-names">
        {knownNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          screen="scrambleSetup"
          onDataChanged={() => {
            reloadCourses();
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
