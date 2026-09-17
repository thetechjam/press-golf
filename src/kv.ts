/**
 * The one place a string reaches persistent storage.
 *
 * Every round, every saved course, every setting and the unsent feedback queue
 * are strings under four keys, and until now each was written straight to
 * `localStorage`. That is correct on the web and unsafe anywhere else: inside a
 * WKWebView — which is what an App Store build of Press would be — iOS treats
 * local storage as *transient* and reclaims it when the device runs short of
 * space. For an app whose entire data model lives there, that is every round
 * somebody has played, gone, with nothing on screen to say so.
 *
 * So this is a seam rather than a rewrite. The interface is deliberately
 * `localStorage`'s own shape, which means the call sites in `storage.ts` and
 * `feedback.ts` read exactly as they did and the web path is the same object
 * they were already using — no cache, no copy, no behaviour to go wrong. What
 * it buys is `setBackend`, and with it the ability to put a store underneath
 * that actually promises to keep things.
 *
 * `snapshotBackend` below is that store's shape, built and tested here rather
 * than on a Mac nobody has yet.
 */

export interface KvBackend {
  getItem(key: string): string | null;
  /** Throws if the value could not be stored — `writeAll` relies on this. */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's own store, reached lazily.
 *
 * Lazily because `storage.ts` is imported in test environments that have no
 * DOM, where touching `localStorage` throws — which its readers already catch
 * and answer with defaults. Capturing the object at module load would turn
 * that caught throw into an import-time crash.
 */
const webBackend: KvBackend = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

let backend: KvBackend = webBackend;

/**
 * Point persistence somewhere else. Called once, before anything reads.
 *
 * Returns the backend it replaced, so a caller that swapped one in for a test
 * can put the original back without having to know what it was.
 */
export function setBackend(next: KvBackend): KvBackend {
  const previous = backend;
  backend = next;
  return previous;
}

/** Same three methods as `localStorage`, against whatever backend is current. */
export const kv: KvBackend = {
  getItem: (key) => backend.getItem(key),
  setItem: (key, value) => backend.setItem(key, value),
  removeItem: (key) => backend.removeItem(key),
};

/**
 * A synchronous face over a store that can only be reached asynchronously.
 *
 * Capacitor's Preferences API — the thing that survives on iOS — is async, and
 * every reader in `storage.ts` is synchronous: `listRounds()` returns rounds,
 * it does not return a promise, and making it do so would ripple through every
 * screen in the app. The way out is to stop asking the store anything after
 * startup: load every key once while the splash screen is up, answer reads
 * from that snapshot, and let writes go out behind the app.
 *
 * Two consequences worth being explicit about, because both are real:
 *
 * A write that fails cannot be reported to the caller — `persist` has already
 * returned by the time the store rejects. `writeAll`'s rollback, which exists
 * to leave storage untouched when a restore hits `QuotaExceededError`, is a
 * guarantee of the web path only. It is not weakened here so much as
 * inapplicable: `UserDefaults` has no quota of that kind. `onError` is where a
 * native build finds out anyway.
 *
 * The snapshot is the source of truth for the life of the process. Nothing
 * else writes these keys, so it cannot go stale — but it would the moment
 * something did, and that is the assumption to check before adding one.
 */
export function snapshotBackend(
  loaded: Record<string, string>,
  persist: (key: string, value: string | null) => void,
  onError?: (key: string, err: unknown) => void
): KvBackend {
  const snapshot = new Map(Object.entries(loaded));

  // The snapshot is updated first and unconditionally. A reader that saw the
  // old value because the write is still in flight would be a bug nobody could
  // reproduce; a value that is in memory but not yet on disk is just a write
  // in flight, which is what it is.
  const push = (key: string, value: string | null) => {
    try {
      persist(key, value);
    } catch (err) {
      onError?.(key, err);
    }
  };

  return {
    getItem: (key) => snapshot.get(key) ?? null,
    setItem: (key, value) => {
      snapshot.set(key, value);
      push(key, value);
    },
    removeItem: (key) => {
      snapshot.delete(key);
      push(key, null);
    },
  };
}
