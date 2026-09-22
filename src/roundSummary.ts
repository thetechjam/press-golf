import type { Round } from './types';
import { activeResults } from './games';
import { computeLeague } from './games/league';
import { computeSettlement, formatMoney } from './games/settlement';
import { completedHoleCount } from './games/util';

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

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/**
 * One line on how a round stands. `up` and `down` are set when it is about
 * money, so a card can colour the winner and the loser; `text` is always the
 * whole line, for anywhere that shows it plain.
 */
export interface Standing {
  text: string;
  up?: string;
  down?: string;
}

/** "Casey" or "Casey & Sam" — more than two is a count, not a list of names. */
const names = (ns: string[]) => (ns.length <= 2 ? ns.join(' & ') : `${ns.length} players`);

/**
 * Who is ahead, in the terms the round is played for: league points on a
 * league night, the money when there is a stake, otherwise the first game's
 * own status line. `final` switches the verbs from "up" to "won".
 */
export function standingLine(r: Round, final = r.status === 'finished'): Standing | null {
  if (!final && completedHoleCount(r) === 0) return null;
  if (r.options.league) {
    const [a, b] = computeLeague(r).teams;
    if (a.points === b.points) return { text: `All square · ${fmtPts(a.points)}–${fmtPts(b.points)}` };
    const [lead, trail] = a.points > b.points ? [a, b] : [b, a];
    return {
      text: `${lead.name} ${final ? 'won' : 'lead'} ${fmtPts(lead.points)}–${fmtPts(trail.points)}`,
    };
  }
  const settlement = computeSettlement(r);
  if (settlement.active) {
    const net = (id: string) => settlement.totals[id] ?? 0;
    const top = Math.max(...r.players.map((p) => net(p.id)));
    if (top <= 0) return { text: final ? 'All square — no money changed hands' : 'All square on the money' };
    const bottom = Math.min(...r.players.map((p) => net(p.id)));
    const winners = names(r.players.filter((p) => net(p.id) === top).map((p) => p.name));
    const losers = names(r.players.filter((p) => net(p.id) === bottom).map((p) => p.name));
    const up = `${winners} ${final ? 'won' : 'up'} ${formatMoney(top)}`;
    const down = `${losers} ${final ? 'paid' : 'down'} ${formatMoney(-bottom)}`;
    return { text: `${up} · ${down}`, up, down };
  }
  const first = activeResults(r)[0];
  return first ? { text: `${first.title}: ${first.status}` } : null;
}
