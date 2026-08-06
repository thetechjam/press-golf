import { useEffect, useState } from 'react';
import type { Theme } from '../storage';
import type { Round } from '../types';
import { getSettings, saveSettings } from '../storage';
import { applyTheme } from '../theme';
import { Sheet } from './Sheet';
import { FeedbackForm } from './FeedbackForm';
import { clearQueue, listQueue } from '../feedback';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

interface Props {
  onClose: () => void;
  screen: string;
  round?: Round;
}

export function SettingsSheet({ onClose, screen, round }: Props) {
  const [view, setView] = useState<'settings' | 'feedback'>('settings');
  const [queued, setQueued] = useState(() => listQueue().length);
  const [s, setS] = useState(getSettings);

  // Refresh the count whenever we land back on the settings list — e.g. after
  // sending (or failing to send) a report in the feedback view.
  useEffect(() => {
    if (view === 'settings') setQueued(listQueue().length);
  }, [view]);

  const set = (patch: Partial<typeof s>) => {
    const next = saveSettings(patch);
    setS(next);
    applyTheme(next.theme, next.glare);
  };

  const clearReports = () => {
    clearQueue();
    setQueued(0);
  };

  return (
    <Sheet title={view === 'feedback' ? 'Send feedback' : 'Settings'} onClose={onClose}>
      {view === 'feedback' ? (
        <FeedbackForm screen={screen} round={round} onBack={() => setView('settings')} />
      ) : (
        <>
          <div className="set-group">
            <div className="set-label">Appearance</div>
            <div className="seg">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`seg-btn${s.theme === t.id ? ' active' : ''}`}
                  onClick={() => set({ theme: t.id })}
                  disabled={s.glare}
                  aria-pressed={s.theme === t.id}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Without this, picking Dark under Glare appears to do nothing. */}
            {s.glare && (
              <button className="set-override" onClick={() => set({ glare: false })}>
                Glare mode is overriding this — tap to turn off
              </button>
            )}
          </div>

          <label className="set-row">
            <span>
              <span className="set-label">Glare mode</span>
              <span className="set-hint">Max contrast for direct sun</span>
            </span>
            <input
              type="checkbox"
              checked={s.glare}
              onChange={(e) => set({ glare: e.target.checked })}
            />
          </label>

          <label className="set-row">
            <span>
              <span className="set-label">Keep screen awake</span>
              <span className="set-hint">While scoring a round</span>
            </span>
            <input
              type="checkbox"
              checked={s.keepAwake}
              onChange={(e) => set({ keepAwake: e.target.checked })}
            />
          </label>

          <button className="set-row set-action" onClick={() => setView('feedback')}>
            <span>
              <span className="set-label">Send feedback</span>
              <span className="set-hint">
                {queued > 0
                  ? `${queued} report${queued === 1 ? '' : 's'} waiting to send`
                  : 'Report a bug or suggest an idea'}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          {queued > 0 && (
            <button type="button" className="set-clear-queue" onClick={clearReports}>
              Clear waiting reports
            </button>
          )}

          <div className="about">
            <div className="about-title">
              Press <span className="about-ver">v{__APP_VERSION__}</span>
            </div>
            <div className="about-line">Created by Jesse Morrison</div>
            <div className="about-line">PolyForm Noncommercial License 1.0.0</div>
          </div>
        </>
      )}
    </Sheet>
  );
}
