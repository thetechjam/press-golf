import { kv } from './kv';

/**
 * Why a change was not kept, in a sentence a screen can show.
 *
 * Two causes are real. On the web, and on any full phone, it is storage
 * being full. In the native shell it can also be the write block: a key the
 * store would not give up at startup is never written over, because it would
 * replace data the app never saw. Telling someone with a blocked key to
 * delete old rounds is advice that cannot help — closing and reopening Trunk
 * is what reads the key again.
 *
 * `keys` are the ones the change writes; any one of them blocked is the reason.
 * `freeing` is for changes that would have made room (a delete), where
 * "delete old rounds to make room" would be asking for the thing that just
 * failed.
 */
export function notSavedReason(keys: string | string[], freeing = false): string {
  if ((Array.isArray(keys) ? keys : [keys]).some((key) => kv.isUnreadable(key))) {
    return 'Trunk couldn’t read this part of your saved data when it opened, so it won’t write over it. Close Trunk completely and open it again.';
  }
  if (freeing) return 'This phone wouldn’t store the change. Close Trunk and open it again, then try again.';
  return 'This phone’s storage is full. Back up from Settings, then delete old rounds from Rounds to make room.';
}
