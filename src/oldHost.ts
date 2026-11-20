import { isNative } from './native';

/**
 * The address Trunk used to live at, and where it lives now.
 *
 * pressgolf.netlify.app still serves the app, on purpose, with no redirect:
 * a browser keeps local storage per address, so a redirect would carry people
 * to trunk.golf and leave every round they saved behind on an address they
 * could no longer open. Instead the old address says it has moved and shows
 * how to bring the rounds along — a backup here, restored there.
 */

export const OLD_HOST = 'pressgolf.netlify.app';
export const NEW_ORIGIN = 'https://trunk.golf';

/**
 * True only for the old address itself. An exact match, so a look-alike —
 * `notpressgolf.netlify.app`, `pressgolf.netlify.app.example.com` — is not
 * mistaken for it. Host names are case-insensitive, and a trailing dot is the
 * same host written fully qualified.
 */
export function isOldHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/\.$/, '') === OLD_HOST;
}

/**
 * Whether this copy of the app is the one running at the old address.
 *
 * The native shell is ruled out first: it serves the app from its own bundle,
 * so whatever its web view calls the host, nothing it saved lives on the old
 * site.
 */
export function onOldHost(): boolean {
  if (isNative()) return false;
  return isOldHost(globalThis.location?.hostname ?? '');
}

/**
 * The page a share link or QR code should point at, given the page it was
 * made on.
 *
 * A link made on the old address points at trunk.golf instead, since that is
 * where the person receiving it should be using the app; a shared round
 * carries itself in the link, so it opens there just the same. Every other
 * address is returned untouched.
 */
export function shareBase(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!isOldHost(url.hostname)) return href;
  return `${NEW_ORIGIN}${url.pathname}${url.search}`;
}

/**
 * "Not now" on the move notice hides it for the rest of this visit, not for
 * good.
 *
 * Kept in memory rather than in settings on purpose: nothing about the move
 * is finished until the rounds are restored on trunk.golf, which this address
 * cannot see, so the notice comes back the next time the app opens here. It
 * also means the notice writes nothing to this address's storage.
 */
let hiddenThisVisit = false;

export const movedNoticeHidden = (): boolean => hiddenThisVisit;

export function hideMovedNotice(): void {
  hiddenThisVisit = true;
}

/** For tests: forget a "Not now" from an earlier render. */
export function resetMovedNoticeForTests(): void {
  hiddenThisVisit = false;
}
