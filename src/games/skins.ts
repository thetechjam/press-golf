import type { Round, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { netFor } from './scoring';
import { ordinal, rankStandings } from './util';

/**
 * Whether a carried pot still has a hole to land on.
 *
 * A tie pushes the pot to the next hole, which is true right up until there is
 * no next hole — and then the sentence saying so is describing golf that will
 * never be played. Two ways to run out: the round is finished, or every hole
 * already has a full set of scores. A hole somebody has not finished counts as
 * remaining, because that is the same test the loop below uses to decide
 * whether a hole can be scored at all.
 */
function holesRemain(round: Round, useNet: boolean): boolean {
  if (round.status === 'finished') return false;
  return round.holes.some((h) =>
    round.players.some((p) => holeScore(round, p.id, h, useNet, 'skins') == null)
  );
}

export function computeSkins(round: Round): GameResult {
  const useNet = netFor(round, 'skins');
  const skinsWon: Record<string, number> = {};
  round.players.forEach((p) => (skinsWon[p.id] = 0));

  let carry = 0; // skins carried in from tied holes
  let pot = 0; // skins currently on the line on the most recent decided/tied hole
  let lastResult: 'won' | 'tied' | null = null;
  let lastWinnerId: string | null = null;
  /** The hole the pot is sitting on — named in the note when it dies there. */
  let lastHole = 0;

  for (const h of round.holes) {
    // Only score a hole once every player has a score on it.
    const scores = round.players.map((p) => ({
      id: p.id,
      score: holeScore(round, p.id, h, useNet, 'skins'),
    }));
    if (scores.some((s) => s.score == null)) continue;

    const best = Math.min(...scores.map((s) => s.score as number));
    const winners = scores.filter((s) => s.score === best);
    const onLine = carry + 1;

    if (winners.length === 1) {
      skinsWon[winners[0].id] += onLine;
      carry = 0;
      lastResult = 'won';
      lastWinnerId = winners[0].id;
      pot = onLine;
    } else {
      carry = onLine; // tie → carry forward
      lastResult = 'tied';
      lastWinnerId = null;
      pot = onLine;
    }
    lastHole = h.number;
  }

  // Only asked once a carry exists: a pot with nowhere to go is the one case
  // that has to stop promising a hole that isn't coming.
  const live = carry > 0 && holesRemain(round, useNet);

  const standings: GameStanding[] = round.players.map((p) => ({
    playerId: p.id,
    label: p.name,
    detail: `${skinsWon[p.id]} ${skinsWon[p.id] === 1 ? 'skin' : 'skins'}`,
    value: skinsWon[p.id],
    rank: 0,
    isLeader: false,
  }));

  const sorted = rankStandings(standings, false);
  const died = `${carry} ${carry === 1 ? 'skin' : 'skins'}`;

  let status: string;
  if (lastResult === null) {
    status = 'No holes completed';
  } else if (lastResult === 'tied') {
    const unit = pot === 1 ? 'skin' : 'skins';
    status = live ? `${pot} ${unit} carried over` : `${died} died`;
  } else {
    const winner = round.players.find((p) => p.id === lastWinnerId);
    status = `${winner?.name} won the last skin`;
  }

  return {
    gameType: 'skins',
    title: useNet ? 'Skins (Net)' : 'Skins',
    status,
    standings: sorted,
    // A carry that runs out of holes is won by nobody and paid by nobody, so
    // nothing in the standings or the settlement records that it happened.
    // Saying so — with the count and the hole it died on — is the only trace
    // it leaves, and it is the one somebody adds up against the card.
    note:
      carry === 0
        ? undefined
        : live
          ? `${carry} on the line next hole`
          : `${died} died on the ${ordinal(lastHole)} — nobody won ${carry === 1 ? 'it' : 'them'}`,
  };
}

/**
 * How many skins the given hole is worth: one, plus whatever the holes before
 * it carried in. Walks the card exactly as computeSkins does — in hole order,
 * skipping any hole without a full set of scores — so the number shown on the
 * hole is the number the engine will pay out when it is won.
 */
export function skinsOnHole(round: Round, holeNumber: number): number {
  const useNet = netFor(round, 'skins');
  let carry = 0;
  for (const h of round.holes) {
    if (h.number === holeNumber) break;
    const scores = round.players.map((p) => holeScore(round, p.id, h, useNet, 'skins'));
    if (scores.some((s) => s == null)) continue;
    const best = Math.min(...(scores as number[]));
    carry = scores.filter((s) => s === best).length === 1 ? 0 : carry + 1;
  }
  return carry + 1;
}
