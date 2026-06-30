import type { GameType, Round, GameResult } from '../types';
import { computeStrokePlay } from './strokePlay';
import { computeMatchPlay } from './matchPlay';
import { computeSkins } from './skins';
import { computeStableford } from './stableford';
import { computeWolf } from './wolf';
import { computeNassau } from './nassau';

export interface GameMeta {
  id: GameType;
  label: string;
  blurb: string;
  minPlayers: number;
  /** Whether the game can use handicaps / net scoring. */
  usesNet: boolean;
  compute: (round: Round) => GameResult;
}

export const GAMES: GameMeta[] = [
  {
    id: 'strokePlay',
    label: 'Stroke Play',
    blurb: 'Lowest total strokes wins. Net optional.',
    minPlayers: 1,
    usesNet: true,
    compute: computeStrokePlay,
  },
  {
    id: 'matchPlay',
    label: 'Match Play',
    blurb: 'Hole-by-hole duel. Win by "3&2".',
    minPlayers: 2,
    usesNet: true,
    compute: computeMatchPlay,
  },
  {
    id: 'skins',
    label: 'Skins',
    blurb: 'Win a hole outright to take the skin. Ties carry over.',
    minPlayers: 2,
    usesNet: true,
    compute: computeSkins,
  },
  {
    id: 'stableford',
    label: 'Stableford',
    blurb: 'Points per hole vs par. Highest wins.',
    minPlayers: 1,
    usesNet: true,
    compute: computeStableford,
  },
  {
    id: 'wolf',
    label: 'Wolf',
    blurb: 'Rotating wolf picks a partner — or hunts alone.',
    minPlayers: 3,
    usesNet: true,
    compute: computeWolf,
  },
  {
    id: 'nassau',
    label: 'Nassau',
    blurb: 'Three bets: front 9, back 9, and total.',
    minPlayers: 2,
    usesNet: true,
    compute: computeNassau,
  },
];

export function gameMeta(id: GameType): GameMeta {
  return GAMES.find((g) => g.id === id) as GameMeta;
}

export function activeResults(round: Round): GameResult[] {
  return round.games.map((g) => gameMeta(g).compute(round));
}
