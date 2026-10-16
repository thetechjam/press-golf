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
 * sheet for why that is a reload.
 */
export function eraseEverything(): void {
  for (const key of PERSISTED_KEYS) kv.removeItem(key);
}
