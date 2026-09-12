import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * How often to ask whether there is a new build, on top of asking every time
 * the app comes back to the foreground.
 *
 * An hour, because a round is about four: long enough that a scorekeeper never
 * notices the check, short enough that somebody who leaves the app open all
 * afternoon is not a day behind by the evening.
 */
const CHECK_EVERY = 60 * 60 * 1000;

interface Props {
  /**
   * Hold the prompt back while a round is being scored.
   *
   * This is about the *reload*, not about layout — the banner reserves its own
   * space and cannot overlap a control, so it never needs suppressing to avoid
   * covering something. Applying an update mid-round costs the scorekeeper
   * their place: App.tsx mounts at view 'home' with no round, so a reload
   * always lands on Home and the round has to be resumed by hand.
   *
   * Nothing is dropped by waiting — the worker stays in `waiting` and
   * `needRefresh` stays true, so the prompt reappears the moment scoring ends.
   */
  suppressed?: boolean;
}

/**
 * Offers the new build, and only ever applies it on an explicit tap.
 *
 * Registration lives here (see `injectRegister: null` in vite.config.ts): this
 * component is mounted unconditionally by App, so the worker is registered on
 * every load even while the banner itself is hidden.
 */
export function UpdatePrompt({ suppressed = false }: Props) {
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swUrl, r) => {
      registration.current = r ?? null;
    },
  });

  /**
   * Ask the browser whether there is a newer build — on a timer, and whenever
   * the app comes back to the foreground.
   *
   * Without this the only moment a new version can be discovered is a page
   * load, and an installed app is resumed far more often than it is loaded:
   * iOS keeps it suspended rather than killing it, so tapping the icon returns
   * to exactly the screen that was open, with no navigation and no check. A
   * phone could sit on a build for days and be told nothing — which is exactly
   * what happened: two screenshots an hour apart, byte-identical but for the
   * clock in the status bar, on a device that had a fix waiting it never went
   * looking for.
   *
   * Visibility is the important half; the interval is for the app left open on
   * a cart all afternoon. Both are skipped offline, because a golf course is
   * where this app is used and a failed fetch there is noise, not news.
   */
  useEffect(() => {
    const check = () => {
      const r = registration.current;
      if (!r || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      // A rejection here means no network or no worker yet. Neither is worth
      // saying anything about: the next check is a foreground away.
      void r.update().catch(() => {});
    };
    const timer = window.setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  // The live region is mounted from the first render and only its *contents*
  // are toggled. A region inserted into the DOM in the same mutation as its
  // text is frequently missed by screen readers. role="status" already implies
  // aria-live="polite", so that attribute is not repeated here.
  return (
    <div className="update-live" role="status">
      {needRefresh && !suppressed && (
        <div className="update-banner">
          <span className="update-msg">A new version of Press is ready.</span>
          <button
            type="button"
            className="update-btn"
            // `true` reloads the page once the waiting worker has taken over.
            onClick={() => void updateServiceWorker(true)}
          >
            Update
          </button>
          <button
            type="button"
            className="update-later"
            // Dismisses this prompt only. The worker stays waiting, so the next
            // load offers it again — declining can't strand anyone on an old build.
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}
