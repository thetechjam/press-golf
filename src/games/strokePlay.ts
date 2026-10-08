import type { Round, Hole, GameResult, GameStanding } from '../types';
import { strokesReceivedOver } from './handicap';
import { netFor } from './scoring';
import { rankPlayed } from './util';

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

  // A player with no scores yet has no figure to rank — ranked on the 0
  // they would otherwise carry they led stroke play before anyone else had
  // teed off, and quota once the field was under pace. Last, and not a leader.
  const sorted = rankPlayed(round, standings, true);
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
