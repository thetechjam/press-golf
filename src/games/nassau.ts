import type { Round, Hole, GameResult, GameStanding } from '../types';
import { matchSegment } from './matchPlay';

/** Holes belonging to the same nine as the given hole. */
export function nineHolesFor(round: Round, holeNumber: number): Hole[] {
  const isFront = holeNumber <= 9;
  return round.holes.filter((h) => h.number <= 9 === isFront);
}

/** Last hole number of the nine that contains the given hole. */
export function endOfNine(round: Round, holeNumber: number): number {
  const nine = nineHolesFor(round, holeNumber);
  return nine.length ? nine[nine.length - 1].number : holeNumber;
}

/** A press covers from its start hole through the end of that nine. */
export function pressHoles(round: Round, startHole: number): Hole[] {
  return nineHolesFor(round, startHole).filter((h) => h.number >= startHole);
}

export interface NassauSegment {
  label: string;
  holes: Hole[];
  isPress: boolean;
}

/** The full set of Nassau bets: base bets plus any presses. */
export function nassauSegments(round: Round): NassauSegment[] {
  const front = round.holes.filter((h) => h.number <= 9);
  const back = round.holes.filter((h) => h.number > 9);
  const segments: NassauSegment[] = back.length
    ? [
        { label: 'Front', holes: front, isPress: false },
        { label: 'Back', holes: back, isPress: false },
        { label: 'Total', holes: round.holes, isPress: false },
      ]
    : [{ label: 'Total', holes: round.holes, isPress: false }];

  for (const start of [...(round.presses ?? [])].sort((a, b) => a - b)) {
    segments.push({
      label: `Press h${start}–${endOfNine(round, start)}`,
      holes: pressHoles(round, start),
      isPress: true,
    });
  }
  return segments;
}

/** Three match-play bets in one (front / back / total), plus any presses. */
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
  const segments = nassauSegments(round);
  let p1Wins = 0;
  let p2Wins = 0;

  const standings: GameStanding[] = segments.map((seg, i) => {
    const res = matchSegment(round, seg.holes, p1, p2);
    if (res.winnerId === p1.id) p1Wins += 1;
    else if (res.winnerId === p2.id) p2Wins += 1;
    return { label: seg.label, detail: res.status, value: i, rank: i + 1, isLeader: false };
  });

  let status: string;
  if (p1Wins === 0 && p2Wins === 0) status = 'All bets open';
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
