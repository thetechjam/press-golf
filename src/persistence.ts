/**
 * Asking the browser not to throw the rounds away.
 *
 * Everything Trunk saves lives in this origin's storage, and a browser is
 * allowed to evict that under pressure — Safari goes further and clears a
 * site's data after seven days without a visit unless the app is installed
 * to the home screen. `navigator.storage.persist()` asks for the storage to
 * be treated as persistent; Chrome grants it to installed or engaged sites,
 * Firefox asks the user, Safari ignores it (installation is the protection
 * there). The answer is advisory, so nothing waits on it: it is recorded for
 * the diagnostics lines in Settings, where a bug report can read it off a
 * screenshot the way it reads the build stamp.
 */

export type PersistState =
  /** The API is not there, or the request has not come back yet. */
  | 'unknown'
  /** The browser said yes: storage is exempt from eviction. */
  | 'persisted'
  /** The browser said no: storage is best-effort and may be cleared. */
  | 'best-effort';

let state: PersistState = 'unknown';

/** What the browser said, as of now. */
export const persistenceStatus = (): PersistState => state;

/** For the Settings sheet: short, one line, readable in a screenshot. */
export function describePersistence(s: PersistState = state): string {
  switch (s) {
    case 'persisted':
      return 'Storage protected';
    case 'best-effort':
      return 'Storage not protected — back up or install';
    default:
      return 'Storage status unknown';
  }
}

/**
 * Asks once. Already-persisted storage is reported without asking again, so
 * a browser that prompts does not prompt on every launch.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage
): Promise<PersistState> {
  if (!storage || typeof storage.persist !== 'function') {
    state = 'unknown';
    return state;
  }
  try {
    const already = typeof storage.persisted === 'function' ? await storage.persisted() : false;
    const granted = already || (await storage.persist());
    state = granted ? 'persisted' : 'best-effort';
  } catch {
    state = 'unknown';
  }
  return state;
}

/** Test seam. */
export function resetPersistenceForTests(): void {
  state = 'unknown';
}
