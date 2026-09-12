import { useState } from 'react';
import type { Round } from '../types';
import { listRounds, deleteRound } from '../storage';
import { InstallPrompt } from '../components/InstallPrompt';
import { RoundCard } from '../components/RoundCard';
import { FlagIcon, PressMark, TrophyIcon, GearIcon, ChartIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { countsForStats } from '../stats';

/**
 * How many rounds Home shows before handing over to the history.
 *
 * Home is a launcher: the two buttons at the top are what somebody opened the
 * app to press, and an unbounded archive underneath them pushes those further
 * from the thumb with every round played. Five covers the round you are
 * part-way through and the last few you might want to look at again; anything
 * older is a search, which is what the history screen is for.
 */
const ON_HOME = 5;

interface Props {
  onNew: () => void;
  onNewLeague: () => void;
  onResume: (round: Round) => void;
  onViewResults: (round: Round) => void;
  onStats: () => void;
  onHistory: () => void;
}

export function Home({ onNew, onNewLeague, onResume, onViewResults, onStats, onHistory }: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<'settings' | 'help'>('settings');

  const openHelp = () => {
    setSettingsView('help');
    setShowSettings(true);
  };

  const remove = (id: string) => {
    deleteRound(id);
    setRounds(listRounds());
  };

  return (
    <div className="screen home">
      <header className="hero">
        <button
          className="hero-settings"
          onClick={() => {
            setSettingsView('settings');
            setShowSettings(true);
          }}
          aria-label="Settings"
        >
          <GearIcon size={20} />
        </button>
        {/* The wordmark is Home's page title, so it is the <h1> — every other
            screen has one, and without this Home's outline opened at <h2>.
            aria-label carries the name because the visible text is a mark
            standing in for the P plus the letters "ress"; role="img" would
            have said the same thing but at the cost of the heading semantics
            a screen reader navigates by. tabIndex so App can move focus here
            on navigation. */}
        <h1 className="logo" aria-label="Press" tabIndex={-1}>
          <PressMark size={34} />
          <span aria-hidden="true">ress</span>
        </h1>
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
          <button className="btn-ghost empty-help" onClick={openHelp}>
            New here? See how it works ›
          </button>
        </div>
      )}

      {rounds.length > 0 && (
        <section className="saved">
          <div className="saved-head">
            <h2>Your rounds</h2>
            {/* Offered only once there is a round finished enough to count —
                a Stats screen that can only say "nothing yet" is a dead end
                dressed up as a destination. */}
            {rounds.some(countsForStats) && (
              <button className="btn-ghost saved-stats" onClick={onStats}>
                <ChartIcon size={15} /> Stats
              </button>
            )}
          </div>
          {rounds.slice(0, ON_HOME).map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              onOpen={() => (r.status === 'finished' ? onViewResults(r) : onResume(r))}
              onDelete={() => remove(r.id)}
            />
          ))}

          {rounds.length > ON_HOME && (
            <button className="btn-ghost saved-all" onClick={onHistory}>
              All {rounds.length} rounds ›
            </button>
          )}
        </section>
      )}

      <p className="hint">Tip: add Press to your home screen for one-tap access on the course.</p>

      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          screen="home"
          initialView={settingsView}
        />
      )}
    </div>
  );
}
