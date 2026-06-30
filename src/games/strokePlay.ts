import type { Round, GameResult, GameStanding } from '../types';
import { totalStrokesReceived } from './handicap';
import { rankStandings } from './util';

export function computeStrokePlay(round: Round): GameResult {
  const useNet = round.options.useNet;

  const standings: GameStanding[] = round.players.map((p) => {
    let gross = 0;
    let played = 0;
    for (const h of round.holes) {
      const s = round.scores[h.number]?.[p.id];
      if (s != null) {
        gross += s;
        played += 1;
      }
    }
    const received = useNet ? totalStrokesReceived(round, p.id) : 0;
    const net = gross - received;
    return {
      playerId: p.id,
      label: p.name,
      detail: played === 0 ? '—' : useNet ? `${net} net (${gross})` : `${gross}`,
      value: useNet ? net : gross,
      rank: 0,
      isLeader: false,
    };
  });

  const sorted = rankStandings(standings, true);
  const leader = sorted.find((s) => s.isLeader);
  const anyScores = round.players.some((p) =>
    round.holes.some((h) => round.scores[h.number]?.[p.id] != null)
  );

  return {
    gameType: 'strokePlay',
    title: useNet ? 'Stroke Play (Net)' : 'Stroke Play',
    status: !anyScores
      ? 'No scores yet'
      : leader
        ? `${leader.label} leads · ${leader.detail}`
        : 'All square',
    standings: sorted,
  };
}
