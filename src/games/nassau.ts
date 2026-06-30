import type { Round, GameResult, GameStanding } from '../types';
import { matchSegment } from './matchPlay';

/** Three match-play bets in one: front 9, back 9, and the full 18. */
export function computeNassau(round: Round): GameResult {
  if (round.players.length < 2) {
    return {
      gameType: 'nassau',
      title: 'Nassau',
      status: 'Needs 2 players',
      standings: [],
      note: 'Add a second player to start this match.',
    };
  }

  const [p1, p2] = round.players;
  const front = round.holes.filter((h) => h.number <= 9);
  const back = round.holes.filter((h) => h.number > 9);

  const segments: { label: string; holes: typeof round.holes }[] = [];
  if (front.length) segments.push({ label: 'Front', holes: front });
  if (back.length) segments.push({ label: 'Back', holes: back });
  segments.push({ label: 'Total', holes: round.holes });

  let p1Wins = 0;
  let p2Wins = 0;

  const standings: GameStanding[] = segments.map((seg, i) => {
    const res = matchSegment(round, seg.holes, p1, p2);
    if (res.winnerId === p1.id) p1Wins += 1;
    else if (res.winnerId === p2.id) p2Wins += 1;
    return {
      label: seg.label,
      detail: res.status,
      value: i,
      rank: i + 1,
      isLeader: false,
    };
  });

  let status: string;
  if (p1Wins === 0 && p2Wins === 0) status = 'All matches open';
  else if (p1Wins > p2Wins) status = `${p1.name} leads ${p1Wins}–${p2Wins}`;
  else if (p2Wins > p1Wins) status = `${p2.name} leads ${p2Wins}–${p1Wins}`;
  else status = `Tied ${p1Wins}–${p2Wins}`;

  return {
    gameType: 'nassau',
    title: 'Nassau',
    status,
    standings,
    note:
      round.players.length > 2 ? 'Match is between the first two players' : undefined,
  };
}
