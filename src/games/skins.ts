import type { Round, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { rankStandings } from './util';

export function computeSkins(round: Round): GameResult {
  const useNet = round.options.useNet;
  const skinsWon: Record<string, number> = {};
  round.players.forEach((p) => (skinsWon[p.id] = 0));

  let carry = 0; // skins carried in from tied holes
  let pot = 0; // skins currently on the line on the most recent decided/tied hole
  let lastResult: 'won' | 'tied' | null = null;
  let lastWinnerId: string | null = null;

  for (const h of round.holes) {
    // Only score a hole once every player has a score on it.
    const scores = round.players.map((p) => ({
      id: p.id,
      score: holeScore(round, p.id, h, useNet),
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
  }

  const standings: GameStanding[] = round.players.map((p) => ({
    playerId: p.id,
    label: p.name,
    detail: `${skinsWon[p.id]} ${skinsWon[p.id] === 1 ? 'skin' : 'skins'}`,
    value: skinsWon[p.id],
    rank: 0,
    isLeader: false,
  }));

  const sorted = rankStandings(standings, false);

  let status: string;
  if (lastResult === null) {
    status = 'No holes completed';
  } else if (lastResult === 'tied') {
    status = `${pot} ${pot === 1 ? 'skin' : 'skins'} carried over`;
  } else {
    const winner = round.players.find((p) => p.id === lastWinnerId);
    status = `${winner?.name} won the last skin`;
  }

  return {
    gameType: 'skins',
    title: useNet ? 'Skins (Net)' : 'Skins',
    status,
    standings: sorted,
    note: carry > 0 ? `${carry} on the line next hole` : undefined,
  };
}
