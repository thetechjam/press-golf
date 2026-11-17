import { useEffect } from 'react';
import { dismissSplash } from '../splash';

/**
 * The screen for a launch that failed before the app could render.
 *
 * No backup rows, unlike `ErrorBoundary`: the likeliest cause is that the
 * phone's storage could not be opened, and a backup made now would be a
 * backup of nothing — which is worse than none, because it looks like one.
 */
export function StartupError({
  error,
  onReload = () => window.location.reload(),
}: {
  error: unknown;
  onReload?: () => void;
}) {
  useEffect(dismissSplash, []);
  const message = error instanceof Error ? error.message || String(error) : String(error);
  return (
    <div className="app">
      <div className="screen arriving">
        <h1 tabIndex={-1}>Press couldn’t start</h1>
        <p className="arriving-note">
          Press couldn’t open the storage that holds your rounds. Nothing has been changed or
          deleted. Reloading usually fixes it.
        </p>
        <p className="arriving-note">
          <code className="error-text">{message}</code>
        </p>
        <button type="button" className="btn-primary big" onClick={onReload}>
          Reload Press
        </button>
      </div>
    </div>
  );
}
