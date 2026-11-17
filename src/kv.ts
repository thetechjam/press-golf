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
  /**
   * Removes a key even if it could not be read at startup. Only "Erase
   * everything" wants this: deleting cannot replace data the app never saw
   * with less of it, which is what the write block is there to stop. Absent
   * on backends with no such block, where `removeItem` already does it.
   */
  forget?(key: string): void;
  /** True when writes to this key are refused because it could not be read at startup. */
  isUnreadable?(key: string): boolean;
}

/**
 * The write block's refusal. Its own class so a screen can say the real
 * reason — Press could not read this at startup — instead of blaming a full
 * phone.
 */
export class UnreadableKeyError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Press could not read “${key}” at startup, so it will not overwrite it.`);
    this.name = 'UnreadableKeyError';
    this.key = key;
  }
}

/** Why a write did not land, in the terms a screen can explain. */
export type WriteFailure = 'unreadable' | 'full';

export function writeFailureReason(err: unknown): WriteFailure {
  return err instanceof UnreadableKeyError ? 'unreadable' : 'full';
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

/** `localStorage`'s three methods, plus the two the write block needs, against whatever backend is current. */
export const kv: Required<KvBackend> = {
  getItem: (key) => backend.getItem(key),
  setItem: (key, value) => backend.setItem(key, value),
  removeItem: (key) => backend.removeItem(key),
  forget: (key) => (backend.forget ? backend.forget(key) : backend.removeItem(key)),
  isUnreadable: (key) => backend.isUnreadable?.(key) ?? false,
};

/**
 * A native write that did not land. The caller has already moved on — `persist`
 * returns before the store answers — so this is the record of it.
 *
 * Logged here, not only handed to `onError`, because a fire-and-forget promise
 * that nobody catches is otherwise a round that looks saved and is not.
 */
export function logStorageFailure(key: string, err: unknown): void {
  console.error(`Press could not store “${key}”.`, err);
}

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
 * returned by the time the store rejects. It is logged, and handed to
 * `onError` when one was given; that is what `main.tsx` passes. `writeAll`'s
 * rollback, which exists to leave storage untouched when a restore hits
 * `QuotaExceededError`, is a guarantee of the web path only. It is not
 * weakened here so much as inapplicable: `UserDefaults` has no quota of that
 * kind.
 *
 * The snapshot is the source of truth for the life of the process. Nothing
 * else writes these keys, so it cannot go stale — but it would the moment
 * something did, and that is the assumption to check before adding one.
 */
export function snapshotBackend(
  loaded: Record<string, string>,
  persist: (key: string, value: string | null) => void | Promise<void>,
  onError?: (key: string, err: unknown) => void,
  unreadable: Iterable<string> = []
): KvBackend {
  const snapshot = new Map(Object.entries(loaded));
  // Keys the store would not give up at startup. They read as absent, but
  // they are not: whatever is on disk is still there. Every writer in
  // `storage.ts` is read-modify-write — `saveRound` lists the rounds, adds
  // one, and writes the list back — so a write to one of these keys would
  // replace a whole list the app never saw with a one-item list. Refusing it
  // is a throw, which is how every caller already hears "not stored".
  const locked = new Set(unreadable);
  const guard = (key: string) => {
    if (locked.has(key)) throw new UnreadableKeyError(key);
  };

  // The snapshot is updated first and unconditionally. A reader that saw the
  // old value because the write is still in flight would be a bug nobody could
  // reproduce; a value that is in memory but not yet on disk is just a write
  // in flight, which is what it is.
  const report = (key: string, err: unknown) => {
    // Always, even when a caller also handles it: the promise has already
    // left the function that wrote, and a handler that forgets to log would
    // put the failure back where it was.
    if (onError !== logStorageFailure) logStorageFailure(key, err);
    onError?.(key, err);
  };
  const push = (key: string, value: string | null) => {
    try {
      const pending = persist(key, value);
      // A rejected promise is not a thrown error. Capacitor's Preferences
      // calls return one, and leaving it uncaught is a write that failed
      // with nothing on screen and nothing in the log.
      // Any thenable, not only this realm's Promise: a bridge can hand back
      // one from another realm, and `instanceof` would miss it.
      if (pending && typeof (pending as PromiseLike<void>).then === 'function') {
        void Promise.resolve(pending).catch((err: unknown) => report(key, err));
      }
    } catch (err) {
      report(key, err);
    }
  };

  return {
    getItem: (key) => snapshot.get(key) ?? null,
    setItem: (key, value) => {
      guard(key);
      snapshot.set(key, value);
      push(key, value);
    },
    removeItem: (key) => {
      guard(key);
      snapshot.delete(key);
      push(key, null);
    },
    forget: (key) => {
      // Once it is gone there is nothing left to overwrite, so the key is
      // writable again.
      locked.delete(key);
      snapshot.delete(key);
      push(key, null);
    },
    isUnreadable: (key) => locked.has(key),
  };
}
