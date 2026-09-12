import { useEffect, useState } from 'react';
import type { Round, SavedCourse } from './types';
import { COURSE_KEY, SHARE_KEY, encodeRound, shareUrl, shareUrlQR } from './shareLink';
import { encodeCourse } from './shareCourse';
import { encodeQR, qrPath } from './qr';

/**
 * Building the link and the code for whatever is being handed over.
 *
 * Extracted because two sheets need exactly this and neither should own it:
 * the Share sheet on Results, and the one that hands a live round — or a saved
 * course — to another phone. Encoding is asynchronous and the QR can fail on
 * size alone, so the states are worth naming once rather than twice.
 */

export type ShareState =
  | { kind: 'working' }
  /** Encoded, and small enough to draw. */
  | { kind: 'ready'; url: string; path: string; side: number; tooBig: false }
  /** Encoded, but past what a QR code can hold. The link still carries it. */
  | { kind: 'ready'; url: string; tooBig: true }
  /** Holds something the format cannot carry at all. */
  | { kind: 'failed' };

export function useShareLink(round?: Round, course?: SavedCourse): ShareState {
  const [state, setState] = useState<ShareState>({ kind: 'working' });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const key = course ? COURSE_KEY : SHARE_KEY;
      const payload = course ? await encodeCourse(course) : round ? await encodeRound(round) : null;
      if (!alive) return;
      if (!payload) return setState({ kind: 'failed' });

      const url = shareUrl(window.location.href, payload, key);
      const code = encodeQR(shareUrlQR(window.location.href, payload, key));
      if (!code) return setState({ kind: 'ready', url, tooBig: true });
      const { path, side } = qrPath(code);
      setState({ kind: 'ready', url, path, side, tooBig: false });
    })();
    return () => {
      alive = false;
    };
  }, [round, course]);

  return state;
}

/**
 * Hands a URL to the system share sheet, falling back to the clipboard.
 *
 * Returns true when it went to the clipboard, so the caller can say so — a
 * share sheet announces itself, and a silent copy does not.
 */
export async function sendLink(url: string, title: string, text: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return false;
    }
  } catch (err) {
    // Dismissing the share sheet is a decision, not a failure to recover from.
    if ((err as Error)?.name === 'AbortError') return false;
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
