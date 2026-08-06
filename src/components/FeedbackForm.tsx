import { useState } from 'react';
import type { Round } from '../types';
import type { FeedbackKind } from '../feedback';
import { buildFeedback, enqueue, flushQueue, postFeedback } from '../feedback';
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
    const name = reporter.trim();
    if (name) saveSettings({ reporterName: name });
    enqueue(
      buildFeedback(
        { kind, reporter: name, message, includeRound },
        {
          screen,
          version: __APP_VERSION__,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          round,
        }
      )
    );
    const { remaining } = await flushQueue(postFeedback);
    setStatus(remaining === 0 ? 'sent' : 'queued');
    setMessage('');
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
            <span className="set-hint">Player names and scores — helps reproduce scoring bugs</span>
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

      {status && (
        <p className="fb-status" role="status">
          {status === 'sent'
            ? 'Sent — thanks!'
            : "Saved — it'll send when you're back online."}
        </p>
      )}
    </div>
  );
}
