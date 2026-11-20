import { useEffect } from 'react';
import { dismissSplash } from '../splash';

/**
 * The screen for a launch that failed before the app could render.
 *
 * The wording is general on purpose. Opening the phone's storage is the
 * likeliest step to fail, but not the only one — painting the theme runs
 * first too — and blaming storage for a theme error would be a wrong reason.
 *
 * No backup rows, unlike `ErrorBoundary`: if storage is what failed, a backup
 * made now would be a backup of nothing — which is worse than none, because
 * it looks like one.
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
        <h1 tabIndex={-1}>Trunk couldn’t start</h1>
        <p className="arriving-note">
          Trunk hit a problem while starting. Nothing has been changed or deleted. Reloading
          usually fixes it.
        </p>
        <p className="arriving-note">
          <code className="error-text">{message}</code>
        </p>
        <button type="button" className="btn-primary big" onClick={onReload}>
          Reload Trunk
        </button>
      </div>
    </div>
  );
}
