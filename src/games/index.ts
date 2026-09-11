import type { GameType, Round, GameResult } from '../types';
import { computeStrokePlay } from './strokePlay';
import { computeMatchPlay } from './matchPlay';
import { computeSkins } from './skins';
import { computeStableford } from './stableford';
import { computeWolf } from './wolf';
import { computeNassau } from './nassau';
import { computeVegas } from './vegas';
import { computeQuota } from './quota';

export interface GameMeta {
  id: GameType;
  label: string;
  blurb: string;
  minPlayers: number;
  compute: (round: Round) => GameResult;
}

export const GAMES: GameMeta[] = [
  {
    id: 'strokePlay',
    label: 'Stroke Play',
    blurb: 'Lowest total strokes wins. Net optional.',
    minPlayers: 1,
    compute: computeStrokePlay,
  },
  {
    id: 'matchPlay',
    label: 'Match Play',
    blurb: 'Hole-by-hole duel. Win by "3&2".',
    minPlayers: 2,
    compute: computeMatchPlay,
  },
  {
    id: 'skins',
    label: 'Skins',
    blurb: 'Win a hole outright to take the skin. Ties carry over.',
    minPlayers: 2,
    compute: computeSkins,
  },
  {
    id: 'stableford',
    label: 'Stableford',
    blurb: 'Points per hole vs par. Highest wins.',
    minPlayers: 1,
    compute: computeStableford,
  },
  {
    id: 'wolf',
    label: 'Wolf',
    blurb: 'Rotating wolf picks a partner — or hunts alone.',
    minPlayers: 3,
    compute: computeWolf,
  },
  {
    id: 'vegas',
    label: 'Vegas',
    blurb: '2v2. Your scores make a number — 4 and 5 is 45.',
    minPlayers: 4,
    compute: computeVegas,
  },
  {
    id: 'quota',
    label: 'Quota',
    blurb: 'Beat your own points target. Handicap sets the bar.',
    minPlayers: 1,
    compute: computeQuota,
  },
  {
    id: 'nassau',
    label: 'Nassau',
    blurb: 'Three bets: front 9, back 9, and total.',
    minPlayers: 2,
    compute: computeNassau,
  },
];

export function gameMeta(id: GameType): GameMeta {
  return GAMES.find((g) => g.id === id) as GameMeta;
}

export function activeResults(round: Round): GameResult[] {
  return round.games.map((g) => gameMeta(g).compute(round));
}
