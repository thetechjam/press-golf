import { useState } from 'react';
import type { Round } from '../types';
import { listRounds, deleteRound } from '../storage';
import { completedHoleCount } from '../games/util';
import { GAMES, activeResults } from '../games';
import { computeLeague } from '../games/league';
import { InstallPrompt } from '../components/InstallPrompt';
import { DeleteButton } from '../components/DeleteButton';
import { FlagIcon, PressMark, TrophyIcon, XIcon, GearIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';

interface Props {
  onNew: () => void;
  onNewLeague: () => void;
  onResume: (round: Round) => void;
  onViewResults: (round: Round) => void;
}

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** A round with no course name still gets a glanceable identity. */
const roundTitle = (r: Round): string => {
  if (r.course) return r.course;
  if (r.options.league) return 'League night';
  const names = r.players.map((p) => p.name.split(' ')[0]);
  return names.length <= 2 ? names.join(' v ') : `${names[0]} +${names.length - 1}`;
};

/** One-line outcome for a finished round, or null while in progress. */
const resultLine = (r: Round): string | null => {
  if (r.status !== 'finished') return null;
  if (r.options.league) {
    const [a, b] = computeLeague(r).teams;
    if (a.points === b.points) return `All square · ${fmtPts(a.points)}–${fmtPts(b.points)}`;
    const [win, lose] = a.points > b.points ? [a, b] : [b, a];
    return `${win.name} won ${fmtPts(win.points)}–${fmtPts(lose.points)}`;
  }
  const first = activeResults(r)[0];
  return first ? `${first.title}: ${first.status}` : null;
};

export function Home({ onNew, onNewLeague, onResume, onViewResults }: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds());
  const [showSettings, setShowSettings] = useState(false);

  const remove = (id: string) => {
    deleteRound(id);
    setRounds(listRounds());
  };

  return (
    <div className="screen home">
      <header className="hero">
        <button className="hero-settings" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
        <div className="logo" role="img" aria-label="Press">
          <PressMark size={34} />
          <span aria-hidden="true">ress</span>
        </div>
        <p className="tagline">Track golf side games — the fun way.</p>
      </header>

      <button className="btn-primary big" onClick={onNew}>
        Start New Round
      </button>

      <button className="btn-secondary big" onClick={onNewLeague}>
        <TrophyIcon size={19} /> Golf League
      </button>

      <InstallPrompt />

      {rounds.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <FlagIcon size={40} />
          </div>
          <p className="empty-title">No rounds yet</p>
          <p className="empty-sub">Start your first round and Press keeps score for you.</p>
        </div>
      )}

      {rounds.length > 0 && (
        <section className="saved">
          <h2>Your rounds</h2>
          {rounds.map((r) => {
            const thru = completedHoleCount(r);
            const result = resultLine(r);
            return (
              <div key={r.id} className="round-card">
                <button
                  className="round-main"
                  onClick={() => (r.status === 'finished' ? onViewResults(r) : onResume(r))}
                >
                  <div className="round-title">{roundTitle(r)}</div>
                  <div className="round-sub">
                    {r.date} · {r.players.length} players · {r.holes.length} holes
                    {r.status === 'finished'
                      ? ''
                      : thru === 0
                        ? ' · not started'
                        : ` · thru ${thru}`}
                  </div>
                  {result && <div className="round-result">{result}</div>}
                  <div className="round-games">
                    {r.options.league && <span className="tag">League</span>}
                    {r.games.map((g) => (
                      <span key={g} className="tag">
                        {GAMES.find((m) => m.id === g)?.label ?? g}
                      </span>
                    ))}
                  </div>
                </button>
                <DeleteButton
                  className="round-del"
                  label={`round ${r.course || r.date}`}
                  onDelete={() => remove(r.id)}
                >
                  <XIcon />
                </DeleteButton>
              </div>
            );
          })}
        </section>
      )}

      <p className="hint">Tip: add Press to your home screen for one-tap access on the course.</p>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}
