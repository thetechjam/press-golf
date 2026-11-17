import { useState } from 'react';
import { getSettings, listRounds, saveSettings } from '../storage';
import { offerBackup } from '../backup';
import { InstallPrompt, isInstalled } from './InstallPrompt';

/** Shown once, after the first finished round, until the user dismisses it. */
export function keepRoundsPromptDue(): boolean {
  if (getSettings().firstFinishPromptDismissed) return false;
  return listRounds().some((r) => r.status === 'finished');
}

/**
 * Safari deletes a site's data after seven days without a visit unless the
 * app is on the home screen. This is the one ask, after a round is actually
 * worth keeping: save a backup, and add Press to the home screen.
 *
 * The install button is the browser's own when it offers one; the sentence
 * is the same hint Home already carries, which is what iOS gets instead.
 */
export function KeepRoundsPrompt({ offerInstall = true }: { offerInstall?: boolean } = {}) {
  const [visible, setVisible] = useState(keepRoundsPromptDue);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!visible) return null;

  const installed = isInstalled();

  const dismiss = () => {
    saveSettings({ firstFinishPromptDismissed: true });
    setVisible(false);
  };

  const save = async () => {
    const result = await offerBackup();
    if (!result.ok) {
      if (result.aborted) return;
      setFailed(true);
      setStatus("That backup couldn't be saved.");
      return;
    }
    setFailed(false);
    setStatus('Backup saved.');
  };

  return (
    <div className="keep-rounds">
      <strong>Keep these rounds.</strong>
      <p>
        {installed
          ? 'Press is on your home screen, so Safari will keep these rounds. Save a backup too — it is the copy that survives a new phone.'
          : 'Safari deletes a site’s data after seven days without a visit. Add Press to your home screen and it keeps your rounds — and save a backup, so a copy lives outside this browser.'}
      </p>
      {offerInstall && !installed && <InstallPrompt />}
      <div className="keep-rounds-actions">
        <button type="button" className="btn-secondary" onClick={save}>
          Save a backup
        </button>
        <button type="button" className="btn-ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
      {status && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
