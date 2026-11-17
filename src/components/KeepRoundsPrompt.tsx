import { useState } from 'react';
import { getSettings, listRounds, saveSettings } from '../storage';
import { offerBackup } from '../backup';
import { isNative } from '../native';
import { InstallPrompt, isInstalled } from './InstallPrompt';

/** Shown once, after the first finished round, until the user dismisses it. */
export function keepRoundsPromptDue(): boolean {
  if (getSettings().firstFinishPromptDismissed) return false;
  return listRounds().some((r) => r.status === 'finished');
}

/**
 * Remembers that the prompt has been answered. A refused write (a full phone)
 * is not a reason for the button to do nothing: the prompt still goes away
 * for this session, and asks again next launch, which is the honest outcome
 * of a dismissal that could not be stored.
 */
function rememberDismissed(): void {
  // Null when not stored; see above. `saveSettings` no longer throws.
  saveSettings({ firstFinishPromptDismissed: true });
}

/** The body copy, which depends on where Press is running. */
function promptCopy(): string {
  if (isNative()) {
    return 'Your rounds are kept on this phone. Save a backup too — it is the copy that survives a new phone.';
  }
  if (isInstalled()) {
    return 'Press is on your home screen, so your browser keeps these rounds. Save a backup too — it is the copy that survives a new phone.';
  }
  return 'Some browsers, Safari among them, delete a site’s data after seven days without a visit. Add Press to your home screen and it keeps your rounds — and save a backup, so a copy lives outside this browser.';
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
  const [backedUp, setBackedUp] = useState(false);
  if (!visible) return null;

  const installed = isInstalled();

  const dismiss = () => {
    rememberDismissed();
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
    // A backup is the answer the prompt was asking for, so it is not asked
    // again. It stays on screen to say so, with a button that closes it.
    rememberDismissed();
    setBackedUp(true);
    setFailed(false);
    setStatus('Backup saved.');
  };

  return (
    <div className="keep-rounds">
      <strong>Keep these rounds.</strong>
      <p>{promptCopy()}</p>
      {offerInstall && !installed && <InstallPrompt />}
      <div className="keep-rounds-actions">
        {!backedUp && (
          <button type="button" className="btn-secondary" onClick={save}>
            Save a backup
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={dismiss}>
          {backedUp ? 'Done' : 'Don’t ask again'}
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
