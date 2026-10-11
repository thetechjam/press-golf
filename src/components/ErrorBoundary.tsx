import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BackupRows } from './BackupRows';
import { dismissSplash } from '../splash';

interface Props {
  children: ReactNode;
  /** Reloads the page. Injectable so a test can see it called. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * The screen under everything else.
 *
 * Without a boundary, a render throw anywhere in the tree unmounts the whole
 * app and leaves the page blank — under a splash that never fades, since the
 * code that fades it is the app's own first effect. On an installed PWA with
 * no address bar that is a green rectangle with no way out, and the rounds on
 * the phone are behind it.
 *
 * So this shows what went wrong, in words a bug report can carry, offers a
 * reload, and — the part that matters — renders the backup rows directly.
 * They read storage and write a file, nothing more, so they work when the
 * rest of the app does not, and the one thing a broken app must never cost
 * is the rounds already saved on it.
 *
 * React logs the caught error itself (the default `onCaughtError`), so there
 * is nothing to log here.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The app never mounted far enough to do this itself.
    dismissSplash();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    const message = error.message || String(error);

    return (
      <div className="app">
        <div className="screen arriving">
          <h1 tabIndex={-1}>Press hit a snag</h1>
          <p className="arriving-note">
            Something went wrong drawing this screen. Your saved rounds are not affected — they
            are still on this phone, and you can back them up right here before reloading.
          </p>
          <p className="arriving-note">
            <code className="error-text">{message}</code>
          </p>
          <button type="button" className="btn-primary big" onClick={reload}>
            Reload Press
          </button>
          <section className="set-group" aria-label="Backup">
            <BackupRows />
          </section>
          <p className="arriving-note">
            If this keeps happening, send the text above from Settings → Send feedback, or paste
            it into a bug report.
          </p>
        </div>
      </div>
    );
  }
}
