import type { Round, Hole, GameResult, GameStanding } from '../types';
import { strokesReceivedOver } from './handicap';
import { netFor } from './scoring';
import { rankStandings } from './util';

export function computeStrokePlay(round: Round): GameResult {
  const useNet = netFor(round, 'strokePlay');

  const standings: GameStanding[] = round.players.map((p) => {
    let gross = 0;
    const played: Hole[] = [];
    for (const h of round.holes) {
      const s = round.scores[h.number]?.[p.id];
      if (s != null) {
        gross += s;
        played.push(h);
      }
    }
    // Only the strokes that fall on holes already scored. Taking the whole
    // round's strokes off half a card made an 18-handicap through nine look
    // nine shots better than the scratch player level with them.
    const received = useNet ? strokesReceivedOver(round, p.id, played, 'strokePlay') : 0;
    const net = gross - received;
    return {
      playerId: p.id,
      label: p.name,
      detail: played.length === 0 ? '—' : useNet ? `${net} net (${gross})` : `${gross}`,
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
