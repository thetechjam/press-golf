import { vi } from 'vitest';

/**
 * Makes `localStorage.setItem` throw `QuotaExceededError` for one key.
 *
 * happy-dom's Storage is a Proxy that binds each method onto the instance the
 * first time it is used, and its set trap ignores a later assignment. Spying
 * is what actually replaces the function the app calls. The returned function
 * puts the original back; a leaked spy would fail every later save in the file.
 */
export function refuseStorageKey(key: string): () => void {
  const original = Object.getPrototypeOf(localStorage).setItem as Storage['setItem'];
  const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k, value) => {
    if (k === key) throw new DOMException('full', 'QuotaExceededError');
    return original.call(localStorage, k, value);
  });
  return () => spy.mockRestore();
}
