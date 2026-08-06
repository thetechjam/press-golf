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
    }),
    round: attach ? JSON.stringify(ctx.round) : '',
    queuedAt: Date.now(),
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

/**
 * Attempts every queued entry. Failures stay queued with `attempts` bumped —
 * nothing is ever dropped for failing, including when the monthly Netlify cap
 * is the cause.
 */
export async function flushQueue(post: Poster): Promise<{ sent: number; remaining: number }> {
  const keep: QueuedFeedback[] = [];
  let sent = 0;
  for (const entry of listQueue()) {
    try {
      await post(entry);
      sent += 1;
    } catch {
      keep.push({ ...entry, attempts: entry.attempts + 1 });
    }
  }
  writeQueue(keep);
  return { sent, remaining: keep.length };
}

/** Retry whatever is queued as soon as the device comes back online. */
export function watchConnectivity(post: Poster): void {
  window.addEventListener('online', () => {
    void flushQueue(post);
  });
}
