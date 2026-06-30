// Core data model for Press — golf side-game tracker.

export type GameType =
  | 'strokePlay'
  | 'matchPlay'
  | 'skins'
  | 'stableford'
  | 'wolf'
  | 'nassau';

export interface Player {
  id: string;
  name: string;
  /** Course handicap in whole strokes. Optional. */
  handicap?: number;
}

export interface Hole {
  number: number;
  par: number;
  /** Difficulty rank 1..N for handicap-stroke allocation. Optional. */
  strokeIndex?: number;
}

/** playerId -> strokes taken (null = not yet entered). */
export type HoleScores = Record<string, number | null>;
/** holeNumber -> per-player scores. */
export type Scores = Record<number, HoleScores>;

export type WolfChoice =
  | { type: 'partner'; partnerId: string }
  | { type: 'lone' }
  | { type: 'blind' }
  | null;

export interface WolfHole {
  wolfPlayerId: string;
  choice: WolfChoice;
}

export interface GameOptions {
  /** Apply handicaps where a game supports net scoring. */
  useNet: boolean;
  stablefordMode: 'standard' | 'modified';
  loneWolfMultiplier: number;
  blindWolfMultiplier: number;
}

export interface Round {
  id: string;
  course?: string;
  date: string; // ISO yyyy-mm-dd
  createdAt: number;
  updatedAt: number;
  players: Player[];
  holes: Hole[];
  games: GameType[];
  options: GameOptions;
  scores: Scores;
  /** holeNumber -> wolf assignment (only used when Wolf is active). */
  wolf: Record<number, WolfHole>;
  status: 'in_progress' | 'finished';
}

export interface GameStanding {
  playerId?: string;
  label: string;
  detail: string;
  value: number;
  rank: number;
  isLeader: boolean;
}

export interface GameResult {
  gameType: GameType;
  title: string;
  /** Headline shown on the live card, e.g. "Alex 2 UP". */
  status: string;
  standings: GameStanding[];
  note?: string;
}

export const DEFAULT_OPTIONS: GameOptions = {
  useNet: false,
  stablefordMode: 'standard',
  loneWolfMultiplier: 2,
  blindWolfMultiplier: 3,
};
