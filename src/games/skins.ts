import type { Round, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { netFor } from './scoring';
import { rankStandings } from './util';

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
/**
 * "Fred", "Fred and Jesse", "Fred, Jesse and Matt".
 *
 * Named rather than counted because the split is money changing hands, and
 * "split 3 ways" makes somebody go back to the card to work out which three.
 */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
  /** Who shared the best score on the last tied hole — the split, if it comes to one. */
  let lastTiedIds: string[] = [];

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
      lastTiedIds = [];
      pot = onLine;
    } else {
      carry = onLine; // tie → carry forward
      lastResult = 'tied';
      lastWinnerId = null;
      lastTiedIds = winners.map((w) => w.id);
      pot = onLine;
    }
  }

  // Only asked once a carry exists: a pot with nowhere to go is the one case
  // that has to stop promising a hole that isn't coming.
  const live = carry > 0 && holesRemain(round, useNet);

  /**
   * A pot the round ran out of holes for goes back to the players who tied for
   * it — what a group does standing on the last green, rather than let the
   * money evaporate.
   *
   * It is split as money and not as skins, and the difference is the whole
   * point. A skin is a hole won outright; a share of a dead pot is not one,
   * and counting it as one would put half a skin on the card and in the season
   * stats for a hole nobody won. Eighteen halved holes would come out as nine
   * skins each on a day when neither player won anything — which is the case
   * that settled it.
   *
   * So the count stays whole and `settleValue` carries the share. The share is
   * kept exact rather than rounded, because `fieldNet` multiplies it by the
   * stake and rounding three thirds first would not add back up to the pot.
   */
  const splitIds = !live && carry > 0 ? lastTiedIds : [];
  const share = splitIds.length > 0 ? carry / splitIds.length : 0;
  const shared = new Set(splitIds);

  const standings: GameStanding[] = round.players.map((p) => ({
    playerId: p.id,
    label: p.name,
    detail: `${skinsWon[p.id]} ${skinsWon[p.id] === 1 ? 'skin' : 'skins'}`,
    value: skinsWon[p.id],
    ...(shared.has(p.id) ? { settleValue: skinsWon[p.id] + share } : {}),
    rank: 0,
    isLeader: false,
  }));

  const sorted = rankStandings(standings, false);
  const potted = carry === 1 ? 'the last skin' : `the last ${carry} skins`;

  let status: string;
  if (lastResult === null) {
    status = 'No holes completed';
  } else if (lastResult === 'tied') {
    const unit = pot === 1 ? 'skin' : 'skins';
    status = live ? `${pot} ${unit} carried over` : `Split ${potted}`;
  } else {
    const winner = round.players.find((p) => p.id === lastWinnerId);
    status = `${winner?.name} won the last skin`;
  }

  return {
    gameType: 'skins',
    title: useNet ? 'Skins (Net)' : 'Skins',
    status,
    standings: sorted,
    // Names rather than a count, because this line is the only place the split
    // is explained and it is the one people check their own total against.
    note:
      carry === 0
        ? undefined
        : live
          ? `${carry} on the line next hole`
          : `${nameList(
              splitIds.map((id) => round.players.find((p) => p.id === id)?.name ?? '')
            )} split ${potted}`,
  };
}
