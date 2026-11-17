import { kv } from './kv';
import { PERSISTED_KEYS } from './native';

/**
 * The wipe button the privacy page used to say Press did not have.
 *
 * Everything Press remembers is one of six strings under `press.*` keys, and
 * `native.ts` already keeps the one list of them — composed from the modules
 * that own each key, and checked by `native.test.ts` against every literal
 * those modules actually write. That list is what a phone hydrates on launch,
 * and it is exactly what a wipe has to remove: the same list, read for the
 * opposite purpose. It lives here rather than in `storage.ts` because
 * `feedback.ts` imports from `storage.ts` already, and the one list has to sit
 * downstream of both owners to name both without a cycle.
 *
 * Removes through `kv`, not `localStorage`, so inside the native shell the
 * removals reach the store that actually survives there.
 *
 * What this deliberately leaves alone: the service worker and its precache.
 * Those hold the app's own files and nothing of the user's — Workbox owns
 * them, Press never writes to Cache Storage itself — and clearing them would
 * only stop an installed Press from opening with no signal.
 *
 * What happens on screen afterwards is the caller's job; see the Settings
 * sheet for why that is a reload. Returns the keys that could not be removed,
 * empty when everything went.
 */
export function eraseEverything(): string[] {
  // `forget`, not `removeItem`: on a phone where a key could not be read at
  // startup, `removeItem` refuses that key, and the loop used to stop there
  // with half the keys gone and nothing on screen. Deleting is what the user
  // asked for, and it cannot overwrite anything with less of it.
  //
  // Each key on its own, so one the store refuses does not keep the rest.
  // The ones that failed are handed back for the caller to report.
  const failed: string[] = [];
  for (const key of PERSISTED_KEYS) {
    try {
      kv.forget(key);
    } catch {
      failed.push(key);
    }
  }
  return failed;
}
