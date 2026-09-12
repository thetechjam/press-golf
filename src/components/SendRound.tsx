import { useState } from 'react';
import type { Round, SavedCourse } from '../types';
import { Sheet } from './Sheet';
import { ShareQr } from './ShareQr';
import { useShareLink, sendLink } from '../shareTarget';

interface Props {
  /** Exactly one of these. A round is handed over; a course is handed out. */
  round?: Round;
  course?: SavedCourse;
  onClose: () => void;
}

/**
 * The sheet that hands a live round — or a saved course — to another phone.
 *
 * The round or card travels inside the link, so this works with no signal and
 * nothing is uploaded anywhere, which is worth saying on the sheet: "share a
 * link" normally means the opposite, and a group betting real money is
 * entitled to know which one this is.
 *
 * A finished round is shared from the Share sheet on Results instead, which
 * offers the scoreboard images alongside this same code.
 */
export function SendRound({ round, course, onClose }: Props) {
  const state = useShareLink(round, course);
  const [copied, setCopied] = useState(false);
  const live = !!round && round.status !== 'finished';
  const name = course?.name ?? round?.course ?? 'Golf round';

  const send = async (url: string) => {
    const wasCopied = await sendLink(
      url,
      course ? 'Golf course' : 'Golf round',
      `${name} — open in Press`
    );
    setCopied(wasCopied);
    if (wasCopied) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet title={course ? 'Send this course' : 'Hand over scoring'} onClose={onClose}>
      {state.kind === 'working' && <p className="send-note">Building the link…</p>}

      {state.kind === 'failed' && (
        <p className="send-note">
          This {course ? 'course' : 'round'} can’t be sent as a link. Use Backup in Settings to
          move it instead.
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          {!state.tooBig && <ShareQr path={state.path} side={state.side} />}

          <p className="send-note">
            {state.tooBig
              ? `This ${course ? 'course' : 'round'} is too big for a QR code, but the link still carries it.`
              : course
                ? 'Point their camera at this. They get the pars and stroke indexes you checked.'
                : 'Point their camera at this. They can take over scoring from here.'}
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
