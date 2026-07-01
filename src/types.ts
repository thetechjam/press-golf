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

export interface SavedCourse {
  id: string;
  name: string;
  holes: Hole[];
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

/** Dollar stake per game. Unit varies by game (per skin, per point, etc.). */
export type Stakes = Partial<Record<GameType, number>>;

/** A matchup: 1v1 (one player per side) or 2v2 (best-ball teams). Used by Nassau and Match Play. */
export interface TeamSetup {
  mode: '1v1' | '2v2';
  teamA: string[]; // player ids
  teamB: string[]; // player ids
}

export interface GameOptions {
  /** Apply handicaps where a game supports net scoring. */
  useNet: boolean;
  stablefordMode: 'standard' | 'modified';
  loneWolfMultiplier: number;
  blindWolfMultiplier: number;
  stakes: Stakes;
  /** Nassau / Match Play teams (default to 1v1 between the first two players). */
  nassau?: TeamSetup;
  matchPlay?: TeamSetup;
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
  /** Hole numbers where a Nassau press was called (each starts a new bet). */
  presses?: number[];
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
  stakes: {},
};
