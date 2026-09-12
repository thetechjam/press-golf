import { useState } from 'react';
import type { Round } from '../types';
import { Sheet } from './Sheet';
import { ShareQr } from './ShareQr';
import { useShareLink, sendLink } from '../shareTarget';
import { ShareIcon } from '../icons';
import { renderShareCard } from '../shareCard';
import { renderScorecardCard } from '../scorecardCard';

interface Props {
  round: Round;
  /** Plain-text summary, used when a picture cannot be shared. */
  summary: string;
  onClose: () => void;
}

/**
 * Everything you can do with a finished round, in one place.
 *
 * This replaces five controls stacked at the foot of the Results screen — two
 * image buttons, a text fallback, a link button and an unrelated edit. They
 * had accreted one at a time, and three of them were identical ghost rows that
 * read as equals despite being a fallback, a capability, and an edit.
 *
 * The grouping is the point, and it is the distinction the old stack lost: the
 * two buttons at the top send a *picture of the result*, and the code below
 * the rule sends *the round itself*, which the person on the other end can
 * open, keep and settle from. A rule between them says that better than three
 * rows in a column ever did.
 */
export function ShareSheet({ round, summary, onClose }: Props) {
  const state = useShareLink(round);
  const [busy, setBusy] = useState<'results' | 'scorecard' | null>(null);
  const [copied, setCopied] = useState(false);

  /** Falls back to the text summary, which is why `summary` is passed in. */
  const shareText = async () => {
    try {
      if (navigator.share) return void (await navigator.share({ title: 'Golf round results', text: summary }));
    } catch {
      /* fall through to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      /* nothing else to try */
    }
  };

  /**
   * Renders a PNG and hands it to the share sheet.
   *
   * The busy state covers only the canvas render — the share sheet can stay
   * open, or hang on some desktop browsers, without freezing the button.
   */
  const shareImage = async (
    render: () => Promise<Blob>,
    filename: string,
    which: 'results' | 'scorecard'
  ) => {
    setBusy(which);
    let file: File;
    let blobUrl: string;
    try {
      const blob = await render();
      file = new File([blob], filename, { type: 'image/png' });
      blobUrl = URL.createObjectURL(blob);
    } catch {
      setBusy(null);
      await shareText();
      return;
    }
    setBusy(null);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Golf round results' });
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.click();
      }
    } catch (err) {
      // Closing the share sheet is a decision, not a failure to fall back from.
      if ((err as Error)?.name !== 'AbortError') await shareText();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const send = async (url: string) => {
    const wasCopied = await sendLink(
      url,
      'Golf round',
      `${round.course || 'Golf round'} — open in Press`
    );
    setCopied(wasCopied);
    if (wasCopied) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet title="Share" onClose={onClose}>
      <PictureButton
        label="Results"
        hint="The scoreboard, as an image"
        busy={busy === 'results'}
        primary
        onShare={() => void shareImage(() => renderShareCard(round), 'press-results.png', 'results')}
      />
      <PictureButton
        label="Scorecard"
        hint="Every hole, as an image"
        busy={busy === 'scorecard'}
        onShare={() =>
          void shareImage(() => renderScorecardCard(round), 'press-scorecard.png', 'scorecard')
        }
      />

      <div className="share-split">
        <span>or send the round itself</span>
      </div>

      {state.kind === 'working' && <p className="send-note">Building the link…</p>}
      {state.kind === 'failed' && (
        <p className="send-note">
          This round can’t be sent as a link. Use Backup in Settings to move it instead.
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          {!state.tooBig && <ShareQr path={state.path} side={state.side} />}
          <p className="send-note">
            {state.tooBig
              ? 'This round is too big for a QR code, but the link still carries it.'
              : 'Point another phone’s camera at this to open the round in Press.'}
          </p>
          <button className="btn-secondary big" onClick={() => void send(state.url)}>
            {copied ? 'Copied to clipboard' : 'Send the link'}
          </button>
          <p className="send-note quiet">
            The whole round is inside the link — nothing is uploaded, and it opens with no signal.
            They can keep it and settle from it.
          </p>
        </>
      )}
    </Sheet>
  );
}

/**
 * One of the two picture CTAs, and the app's only wait state.
 *
 * aria-disabled, not disabled: `disabled` drops the button out of the tab
 * order mid-interaction, so a keyboard user's focus falls to <body> the moment
 * they activate it. The onClick guard is what actually prevents a second
 * canvas render. aria-label tracks the visible label (WCAG 2.5.3 Label in
 * Name) and aria-busy announces the wait (4.1.3 Status Messages).
 *
 * Both labels are always rendered, stacked, so "Building…" can cross-fade with
 * the idle icon-and-word rather than replacing it in one frame. Only the busy
 * label leaves the flow — the idle one goes on setting the button's height, so
 * nothing moves when the render starts.
 */
function PictureButton({
  label,
  hint,
  busy,
  primary,
  onShare,
}: {
  label: string;
  hint: string;
  busy: boolean;
  primary?: boolean;
  onShare: () => void;
}) {
  const id = `share-${label.toLowerCase()}-hint`;
  return (
    <div className="share-picture">
      <button
        className={`${primary ? 'btn-primary' : 'btn-secondary'} big`}
        onClick={() => {
          if (!busy) onShare();
        }}
        aria-disabled={busy}
        aria-busy={busy}
        aria-label={busy ? `Building ${label.toLowerCase()}…` : `Share ${label.toLowerCase()}`}
        aria-describedby={id}
      >
        <span className={`share-face${busy ? ' out' : ''}`}>
          <ShareIcon size={18} /> {label}
        </span>
        <span className={`share-face share-busy${busy ? '' : ' out'}`}>Building…</span>
      </button>
      {/* Outside the button rather than inside it: the big CTAs are set in the
          display face, uppercase and letter-spaced, and a sentence in that
          voice is neither readable nor what the button is for. */}
      <p className="share-picture-hint" id={id}>
        {hint}
      </p>
    </div>
  );
}
