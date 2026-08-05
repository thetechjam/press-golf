import { useState } from 'react';
import type { Theme } from '../storage';
import { getSettings, saveSettings } from '../storage';
import { applyTheme } from '../theme';
import { Sheet } from './Sheet';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState(getSettings);

  const set = (patch: Partial<typeof s>) => {
    const next = saveSettings(patch);
    setS(next);
    applyTheme(next.theme, next.glare);
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="set-group">
        <div className="set-label">Appearance</div>
        <div className={`seg${s.glare ? ' seg-disabled' : ''}`}>
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
        <input type="checkbox" checked={s.glare} onChange={(e) => set({ glare: e.target.checked })} />
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
    </Sheet>
  );
}
