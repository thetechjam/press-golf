import type { Round, Hole, GameResult, GameStanding } from '../types';
import { matchSegmentSides, type Side } from './matchPlay';

/** Resolves the two Nassau sides from options (defaults to 1v1, first two players). */
export function nassauTeams(round: Round): { a: Side; b: Side } {
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  const cfg = round.options.nassau;
  if (cfg?.mode === '2v2' && cfg.teamA.length === 2 && cfg.teamB.length === 2) {
    return {
      a: { ids: cfg.teamA, label: cfg.teamA.map(nameOf).join(' & ') },
      b: { ids: cfg.teamB, label: cfg.teamB.map(nameOf).join(' & ') },
    };
  }
  const ids = round.players.map((p) => p.id);
  const aId = cfg?.teamA?.[0] ?? ids[0];
  const bId = cfg?.teamB?.[0] ?? ids[1];
  return { a: { ids: [aId], label: nameOf(aId) }, b: { ids: [bId], label: nameOf(bId) } };
}

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

  const { a, b } = nassauTeams(round);
  const segments = nassauSegments(round);
  let aWins = 0;
  let bWins = 0;

  const standings: GameStanding[] = segments.map((seg, i) => {
    const res = matchSegmentSides(round, seg.holes, a, b);
    if (res.winner === 'A') aWins += 1;
    else if (res.winner === 'B') bWins += 1;
    return { label: seg.label, detail: res.status, value: i, rank: i + 1, isLeader: false };
  });

  let status: string;
  if (aWins === 0 && bWins === 0) status = 'All bets open';
  else if (aWins > bWins) status = `${a.label} leads ${aWins}–${bWins}`;
  else if (bWins > aWins) status = `${b.label} leads ${bWins}–${aWins}`;
  else status = `Tied ${aWins}–${bWins}`;

  return {
    gameType: 'nassau',
    title: round.options.nassau?.mode === '2v2' ? 'Nassau (2v2)' : 'Nassau',
    status,
    standings,
    note: `${a.label} vs ${b.label}`,
  };
}
