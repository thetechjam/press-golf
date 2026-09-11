import { useEffect, useState } from 'react';
import type { Round, SavedCourse } from '../types';
import { Sheet } from './Sheet';
import { COURSE_KEY, SHARE_KEY, encodeRound, shareUrl, shareUrlQR } from '../shareLink';
import { encodeCourse } from '../shareCourse';
import { encodeQR, qrPath } from '../qr';

interface Props {
  /** Exactly one of these. A round is handed over; a course is handed out. */
  round?: Round;
  course?: SavedCourse;
  onClose: () => void;
}

type State =
  | { kind: 'working' }
  | { kind: 'ready'; url: string; path: string; side: number; tooBig: false }
  | { kind: 'ready'; url: string; tooBig: true }
  | { kind: 'failed' };

/**
 * The sheet that hands a round — or a course — to somebody else's phone.
 *
 * The round travels inside the link, so this works with no signal and nothing
 * is uploaded anywhere — which is worth saying on the sheet, because "share a
 * link" normally means the opposite and a group betting real money is entitled
 * to know which one this is.
 *
 * A round too large for a QR code still gets a link: the code is the
 * convenience, the link is the feature.
 */
export function SendRound({ round, course, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'working' });
  const [copied, setCopied] = useState(false);
  // A live round is being handed over to be carried on; a finished one is
  // being shown. Same link either way — but saying "they can carry on scoring"
  // about a card that is already settled would be nonsense.
  const live = !!round && round.status !== 'finished';
  const name = course?.name ?? round?.course ?? 'Golf round';

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

  const send = async (url: string) => {
    // The share sheet first — on a phone this is the whole point, since the
    // link is going into a message thread and not a clipboard.
    try {
      if (navigator.share) {
        await navigator.share({
          title: course ? 'Golf course' : 'Golf round',
          text: `${name} — open in Press`,
          url,
        });
        return;
      }
    } catch (err) {
      // Dismissing the share sheet is not a failure to fall back from.
      if ((err as Error)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Sheet
      title={course ? 'Send this course' : live ? 'Hand over scoring' : 'Send this round'}
      onClose={onClose}
    >
      {state.kind === 'working' && <p className="send-note">Building the link…</p>}

      {state.kind === 'failed' && (
        <p className="send-note">
          This {course ? 'course' : 'round'} can’t be sent as a link. Use Backup in Settings to
          move it instead.
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          {!state.tooBig && (
            <div className="send-qr">
              <svg
                viewBox={`0 0 ${state.side} ${state.side}`}
                role="img"
                aria-label="QR code for this round"
                shapeRendering="crispEdges"
              >
                {/* The light ground is drawn rather than inherited: a QR code
                    on a dark background is one no camera will read, and this
                    app has a dark theme. */}
                <rect width={state.side} height={state.side} fill="#fff" />
                <path d={state.path} fill="#000" />
              </svg>
            </div>
          )}

          <p className="send-note">
            {state.tooBig
              ? `This ${course ? 'course' : 'round'} is too big for a QR code, but the link still carries it.`
              : course
                ? 'Point their camera at this. They get the pars and stroke indexes you checked.'
                : live
                  ? 'Point their camera at this. They can take over scoring from here.'
                  : 'Point another phone’s camera at this to open the round in Press.'}
          </p>

          <button className="btn-primary big" onClick={() => void send(state.url)}>
            {copied ? 'Copied to clipboard' : 'Send the link'}
          </button>

          <p className="send-note quiet">
            The whole {course ? 'scorecard' : 'round'} is inside the link — nothing is uploaded,
            and it opens with no signal.
            {live &&
              ' Your copy stays as it is, so if you both keep scoring, Press will ask which card is the real one.'}
            {course && ' They see the card before saving anything.'}
          </p>
        </>
      )}
    </Sheet>
  );
}
