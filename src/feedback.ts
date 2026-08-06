import type { Round } from './types';
import { uid } from './storage';

/**
 * Feedback capture. Writes to localStorage first and sends second, so a report
 * composed on a course with no signal is never lost.
 */

const QUEUE_KEY = 'press.feedback.queue.v1';
/** Bounded so a permanently offline install cannot grow localStorage forever. */
const MAX_QUEUE = 20;

export type FeedbackKind = 'bug' | 'idea';

export interface QueuedFeedback {
  id: string;
  kind: FeedbackKind;
  /** Self-supplied reporter name, or '' if they left it blank. */
  reporter: string;
  message: string;
  /** JSON string of technical context. Never contains player data. */
  diagnostics: string;
  /** JSON string of the round, or '' when not attached. */
  round: string;
  queuedAt: number;
  attempts: number;
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  /** Who is reporting. Optional — an empty string is valid. */
  reporter: string;
  message: string;
  includeRound: boolean;
}

export interface FeedbackContext {
  /** Which screen the sheet was opened from. Passed in — a sheet cannot know. */
  screen: string;
  version: string;
  userAgent: string;
  viewport: string;
  /** The active round, when there is one. Attached only if the draft opts in. */
  round?: Round;
}

/** Posts one entry. Resolves on acceptance, rejects on any failure. */
export type Poster = (entry: QueuedFeedback) => Promise<void>;

export function buildFeedback(draft: FeedbackDraft, ctx: FeedbackContext): QueuedFeedback {
  // The round is the only third-party data here — other people's names and
  // scores. It travels only on an explicit opt-in, and never via diagnostics.
  const attach = draft.includeRound && ctx.round != null;
  const queuedAt = Date.now();
  return {
    id: uid(),
    kind: draft.kind,
    reporter: draft.reporter.trim(),
    message: draft.message.trim(),
    diagnostics: JSON.stringify({
      screen: ctx.screen,
      version: ctx.version,
      userAgent: ctx.userAgent,
      viewport: ctx.viewport,
      // ISO string so a report composed offline shows when it happened, not
      // just when Netlify received it (which can be days later on retry).
      queuedAt: new Date(queuedAt).toISOString(),
    }),
    round: attach ? JSON.stringify(ctx.round) : '',
    queuedAt,
    attempts: 0,
  };
}

export function listQueue(): QueuedFeedback[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as QueuedFeedback[];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedFeedback[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueue(entry: QueuedFeedback): void {
  writeQueue([...listQueue(), entry].slice(-MAX_QUEUE));
}

/** Discards every queued report. Used when a user wants stale round data gone. */
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Guards against concurrent flushes double-sending, and against a slow earlier
// flush resurrecting an entry a later, faster flush already delivered.
let flushInFlight = false;

/**
 * Attempts every queued entry. Failures stay queued with `attempts` bumped —
 * nothing is ever dropped for failing, including when the monthly Netlify cap
 * is the cause.
 */
export async function flushQueue(post: Poster): Promise<{ sent: number; remaining: number }> {
  if (flushInFlight) {
    return { sent: 0, remaining: listQueue().length };
  }
  flushInFlight = true;
  try {
    const snapshot = listQueue();
    const keep: QueuedFeedback[] = [];
    let sent = 0;
    for (const entry of snapshot) {
      try {
        await post(entry);
        sent += 1;
      } catch {
        keep.push({ ...entry, attempts: entry.attempts + 1 });
      }
    }
    // Re-read: entries enqueued while we were awaiting must not be clobbered
    // by the snapshot we started with.
    const attempted = new Set(snapshot.map((e) => e.id));
    const arrived = listQueue().filter((e) => !attempted.has(e.id));
    writeQueue([...keep, ...arrived].slice(-MAX_QUEUE));
    return { sent, remaining: keep.length };
  } finally {
    flushInFlight = false;
  }
}

/** Retry whatever is queued as soon as the device comes back online. */
export function watchConnectivity(post: Poster): void {
  window.addEventListener('online', () => {
    void flushQueue(post);
  });
}

const FORM_ENDPOINT = '/__forms.html';
const FORM_NAME = 'press-feedback';

/**
 * Production poster. Deliberately omits `bot-field`: Netlify discards any
 * submission whose honeypot field is non-empty, so sending it at all — even
 * with a placeholder — risks binning every real report.
 */
export const postFeedback: Poster = async (entry) => {
  // Merge the retry count into diagnostics before posting so the retry
  // history travels with the report — `attempts` is otherwise written and
  // never read outside a test.
  const diagnostics = JSON.stringify({
    ...(JSON.parse(entry.diagnostics) as Record<string, unknown>),
    attempts: entry.attempts,
  });
  const body = new URLSearchParams({
    'form-name': FORM_NAME,
    kind: entry.kind,
    reporter: entry.reporter,
    message: entry.message,
    diagnostics,
    round: entry.round,
  });
  const res = await fetch(FORM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Feedback POST failed: ${res.status}`);
  // __forms.html is a real static file, so a host with no form handler attached
  // answers POST with 200 and the stub itself. Treating that as delivery deletes
  // the report. Staying queued is the safe direction: worst case the user is
  // told it will send later, instead of being told it sent when it did not.
  //
  // Unconfirmed: nobody has checked what Netlify's own form handler returns on
  // a successful AJAX POST to this same URL. If it also echoes the stub body,
  // this guard produces false negatives — reports stay queued forever instead
  // of being marked sent, which is still the safe direction (nothing is lost)
  // but needs confirming against one real deployed submission.
  if ((await res.text()).includes('Press form definitions')) {
    throw new Error('Netlify form handler not attached — keeping report queued');
  }
};
