import { kv } from './kv';
import { LEGACY_KEYS } from './legacyKeys';
import { PERSISTED_KEYS } from './native';

/**
 * The wipe button the privacy page used to say Trunk did not have.
 *
 * Everything Trunk remembers is one of six strings under `trunk.*` keys.
 * `native.ts` keeps that list — composed from the modules that own each key,
 * and checked by `native.test.ts` against every literal those modules
 * actually write. The `press.*` names are the same data from before the
 * rename; a wipe removes them too, in case a launch copied one and had not
 * yet deleted the old spelling. It lives here rather than in `storage.ts`
 * because `feedback.ts` imports from `storage.ts` already, and the one list
 * has to sit downstream of both owners to name both without a cycle.
 *
 * Removes through `kv`, not `localStorage`, so inside the native shell the
 * removals reach the store that actually survives there.
 *
 * What this deliberately leaves alone: the service worker and its precache.
 * Those hold the app's own files and nothing of the user's — Workbox owns
 * them, Trunk never writes to Cache Storage itself — and clearing them would
 * only stop an installed Trunk from opening with no signal.
 *
 * What happens on screen afterwards is the caller's job; see the Settings
 * sheet for why that is a reload.
 */
export function eraseEverything(): void {
  for (const key of PERSISTED_KEYS) kv.removeItem(key);
  for (const key of LEGACY_KEYS) kv.removeItem(key);
}
