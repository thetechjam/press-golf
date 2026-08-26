import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

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
