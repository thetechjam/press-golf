import type { Round } from './types';

/**
 * A round's name on Home and in the history. A round with no course name
 * still gets a glanceable identity.
 */
export const roundTitle = (r: Round): string => {
  if (r.course) return r.course;
  if (r.options.league) return 'League night';
  const names = r.players.map((p) => p.name.split(' ')[0]);
  return names.length <= 2 ? names.join(' v ') : `${names[0]} +${names.length - 1}`;
};

/**
 * How recently a round must have been touched to be offered as the one to
 * resume. A round runs four or five hours, and a buddies trip picks the card
 * back up the next morning; a card abandoned last month is history, not
 * something to put above Start New Round.
 */
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The round Home should put front and centre, if any. `rounds` is newest first. */
export function liveRound(rounds: Round[], now = Date.now()): Round | undefined {
  return rounds.find((r) => r.status !== 'finished' && now - r.updatedAt < LIVE_WINDOW_MS);
}
