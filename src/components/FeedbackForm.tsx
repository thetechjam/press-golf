import { useState } from 'react';
import type { Round } from '../types';
import type { FeedbackKind } from '../feedback';
import { buildFeedback, enqueue, flushQueue, listQueue, postFeedback } from '../feedback';
import { getSettings, saveSettings } from '../storage';

interface Props {
  screen: string;
  round?: Round;
  onBack: () => void;
}

type Status = null | 'sent' | 'queued';

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
];

export function FeedbackForm({ screen, round, onBack }: Props) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [reporter, setReporter] = useState(() => getSettings().reporterName);
  const [message, setMessage] = useState('');
  const [includeRound, setIncludeRound] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    // Clear a stale confirmation from a prior send in this same session so it
    // can't be mistaken for this attempt's outcome while it's in flight.
    setStatus(null);
    const name = reporter.trim();
    if (name) saveSettings({ reporterName: name });
    const entry = buildFeedback(
      { kind, reporter: name, message, includeRound },
      {
        screen,
        version: __APP_VERSION__,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        round,
      }
    );
    enqueue(entry);
    await flushQueue(postFeedback);
    // `remaining` from flushQueue is queue-wide — a stale, still-failing
    // entry from an earlier report would make this one report "Saved" even
    // though it delivered. Check this entry specifically.
    const stillQueued = listQueue().some((e) => e.id === entry.id);
    setStatus(stillQueued ? 'queued' : 'sent');
    setMessage('');
    // Reset so a second, unrelated report doesn't silently carry the last
    // round along — this is the one control where stickiness has a privacy
    // cost.
    setIncludeRound(false);
    setSending(false);
  };

  return (
    <div className="feedback">
      <button className="btn-ghost fb-back" onClick={onBack}>
        ‹ Settings
      </button>

      <div className="seg">
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`seg-btn${kind === k.id ? ' active' : ''}`}
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
          >
            {k.label}
          </button>
        ))}
      </div>

      <label className="fb-field">
        <span className="set-label">Your name</span>
        <input
          className="fb-input"
          value={reporter}
          placeholder="Optional"
          autoComplete="name"
          onChange={(e) => setReporter(e.target.value)}
        />
      </label>

      <label className="fb-field">
        <span className="set-label">What happened?</span>
        <textarea
          className="fb-text"
          rows={5}
          value={message}
          placeholder={kind === 'bug' ? 'What went wrong, and on which hole?' : 'What would you add?'}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {round && (
        <label className="set-row">
          <span>
            <span className="set-label">Include this round</span>
            <span className="set-hint">
              Player names, scores and round settings — helps reproduce scoring bugs
            </span>
          </span>
          <input
            type="checkbox"
            checked={includeRound}
            onChange={(e) => setIncludeRound(e.target.checked)}
          />
        </label>
      )}

      <button className="btn-primary big" onClick={send} disabled={!message.trim() || sending}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {/* Always mounted so screen readers announce the text change on this
          live region — inserting the element with text already present is
          missed by many screen readers. */}
      <p className="fb-status" role="status">
        {status === 'sent'
          ? 'Sent — thanks!'
          : status === 'queued'
            ? "Saved — it'll send when you're back online."
            : ''}
      </p>
    </div>
  );
}
