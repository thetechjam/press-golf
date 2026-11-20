import { useState } from 'react';
import { listCourses, listRounds } from '../storage';
import { offerBackup } from '../backup';
import { NEW_ORIGIN, hideMovedNotice, movedNoticeHidden, onOldHost } from '../oldHost';

/**
 * Shown only on the old address, pressgolf.netlify.app, to say Trunk now
 * lives at trunk.golf and how to bring the rounds saved here along.
 *
 * The rounds cannot move by themselves — a browser keeps storage per address
 * — so the way across is the backup Trunk already has: save one here, open
 * trunk.golf, restore it from Settings. Nothing is moved or deleted here.
 */
export function MovedNotice({ show = onOldHost() }: { show?: boolean } = {}) {
  const [visible, setVisible] = useState(() => show && !movedNoticeHidden());
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!visible) return null;

  const hasData = listRounds().length > 0 || listCourses().length > 0;

  const hide = () => {
    hideMovedNotice();
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
    setStatus('Backup saved. Now open trunk.golf and restore it from Settings.');
  };

  return (
    <section className="keep-rounds moved-notice" aria-labelledby="moved-notice-title">
      <strong id="moved-notice-title">Trunk has moved to trunk.golf.</strong>
      {hasData ? (
        <>
          <p>
            Your rounds are saved in this browser, at this address, and they don’t follow Trunk
            to the new one by themselves. To bring them with you:
          </p>
          <ol className="moved-steps">
            <li>Save a backup here.</li>
            <li>Open trunk.golf.</li>
            <li>In Settings, tap Restore from a backup and pick the file.</li>
          </ol>
          <p>This address keeps working in the meantime, and nothing here is deleted.</p>
        </>
      ) : (
        <p>Nothing is saved at this address yet, so you can simply carry on at trunk.golf.</p>
      )}
      <div className="keep-rounds-actions">
        {hasData && (
          <button type="button" className="btn-secondary" onClick={save}>
            Save a backup
          </button>
        )}
        <a className="btn-secondary moved-open" href={`${NEW_ORIGIN}/`} target="_blank" rel="noopener noreferrer">
          Open trunk.golf
        </a>
        <button type="button" className="btn-ghost" onClick={hide}>
          Not now
        </button>
      </div>
      {status && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {status}
        </p>
      )}
    </section>
  );
}
