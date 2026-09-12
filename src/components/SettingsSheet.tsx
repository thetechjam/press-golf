import { useEffect, useState } from 'react';
import type { Theme } from '../storage';
import type { Round } from '../types';
import { getSettings, saveSettings } from '../storage';
import { applyTheme } from '../theme';
import { Sheet } from './Sheet';
import { FeedbackForm } from './FeedbackForm';
import { HelpSheet } from './HelpSheet';
import { BackupRows } from './BackupRows';
import { clearQueue, listQueue } from '../feedback';

/**
 * The two things a bug report from a phone needs and a screenshot cannot show.
 *
 * Which build is running, because on an installed app the version in
 * package.json only moves when someone bumps it, and "did my phone take the
 * update?" is the first question worth asking about any report.
 *
 * And whether anything on the screen behind this sheet is wider than the screen
 * itself, because that is invisible in a screenshot unless you know the
 * device's width and are willing to count pixels. A clipped toolbar was
 * reported, fixed, and reported again from a screenshot byte-identical to the
 * first — with no way to tell whether the fix had arrived or had not worked.
 * One number settles it: 0 means the layout is sound and the clipping is
 * something else; anything above 0 is the overflow, in CSS pixels.
 */
function readLayout(): string {
  const app = document.querySelector('.app');
  const screen = document.querySelector('.screen');
  const vw = Math.round(window.innerWidth);
  const appW = app ? Math.round(app.getBoundingClientRect().width) : 0;
  if (!screen) return `${vw} · ${appW}`;

  const box = screen.getBoundingClientRect();
  // Against the content edge, not the border edge: a row that overflows into
  // the screen's own padding is already wrong, and is the shape of the bug
  // this is here to catch.
  const contentRight = box.right - parseFloat(getComputedStyle(screen).paddingRight || '0');
  let over = 0;
  for (const child of screen.children) {
    // In-flow rows only. This sheet is itself a child of the screen it is
    // measuring, and it is a fixed, full-bleed dialog — counting it would
    // report 16px of overflow on every healthy screen in the app, which is
    // exactly the kind of number that gets ignored when it matters.
    const position = getComputedStyle(child).position;
    if (position === 'fixed' || position === 'absolute') continue;
    over = Math.max(over, child.getBoundingClientRect().right - contentRight);
  }
  const rounded = Math.round(over);
  return `${vw} · ${appW} · ${Math.round(box.width)}${rounded > 0 ? ` · +${rounded}` : ''}`;
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

interface Props {
  onClose: () => void;
  screen: string;
  round?: Round;
  initialView?: 'settings' | 'help';
  /** Offered only mid-round, and only when there is a round to hand over. */
  onHandOver?: () => void;
}

export function SettingsSheet({
  onClose,
  screen,
  round,
  initialView = 'settings',
  onHandOver,
}: Props) {
  const [view, setView] = useState<'settings' | 'feedback' | 'help'>(initialView);
  const [queued, setQueued] = useState(() => listQueue().length);
  const [s, setS] = useState(getSettings);
  // Read once the sheet is up, so the screen behind it is the one measured.
  const [layout, setLayout] = useState('');
  useEffect(() => setLayout(readLayout()), []);

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
    <Sheet
      title={view === 'feedback' ? 'Send feedback' : view === 'help' ? 'How to Play' : 'Settings'}
      onClose={onClose}
    >
      {view === 'feedback' ? (
        <FeedbackForm screen={screen} round={round} onBack={() => setView('settings')} />
      ) : view === 'help' ? (
        <HelpSheet onBack={() => setView('settings')} />
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
              className="switch"
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
              className="switch"
              type="checkbox"
              checked={s.keepAwake}
              onChange={(e) => set({ keepAwake: e.target.checked })}
            />
          </label>

          {onHandOver && (
            <button className="set-row set-action" onClick={onHandOver}>
              <span>
                <span className="set-label">Hand over scoring</span>
                <span className="set-hint">
                  Send the card to another phone so they can carry on
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )}

          <BackupRows />

          <button className="set-row set-action" onClick={() => setView('help')}>
            <span>
              <span className="set-label">How to Play</span>
              <span className="set-hint">Scoring, games, and league rules</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>

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
            <div className="about-line">Build {__BUILD_STAMP__}</div>
            <div className="about-line">Layout {layout}</div>
            <div className="about-line">Created by Jesse Morrison</div>
            <div className="about-line">PolyForm Noncommercial License 1.0.0</div>
          </div>
        </>
      )}
    </Sheet>
  );
}
