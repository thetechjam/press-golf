// Core data model for Press — golf side-game tracker.

export type GameType =
  | 'strokePlay'
  | 'matchPlay'
  | 'skins'
  | 'stableford'
  | 'wolf'
  | 'nassau'
  | 'vegas'
  | 'quota'
  | 'junk';

/**
 * The side bets a scorecard cannot see.
 *
 * Every other game in this app is derived: hand it the scores and it tells you
 * who won. Junk is the opposite — a sandie is a par out of a bunker and a
 * barkie is a par after hitting a tree, and the card records neither, only the
 * par. So these are claimed by hand, on the hole, by the people who watched it
 * happen.
 *
 * Six, and the six are not configurable. A list somebody has to agree on
 * before the first tee is a list that gets argued about on the first tee;
 * these are the ones nearly every group already plays, and a group that plays
 * others can simply not tap them.
 */
export type JunkKind = 'greenie' | 'sandie' | 'barkie' | 'arnie' | 'chipIn' | 'polie';

/**
 * Claimed junk: hole number -> player id -> what they claimed there.
 *
 * Shaped like `scores` deliberately, which is the same lookup by the same two
 * keys. A player can hold more than one on a hole — hitting a tree and then
 * getting up and down from sand for the par is a barkie and a sandie, and
 * anyone who has done it will want both.
 */
export type JunkClaims = Record<number, Record<string, JunkKind[]>>;

export interface Player {
  id: string;
  /**
   * Course handicap in whole strokes — what stroke allocation spends.
   *
   * Still the number the round is scored on, and still what is stored, so
   * nothing saved before Handicap Index existed changed meaning. When the
   * course carries a slope and rating and the player carries an `index`, this
   * is derived from those; otherwise it is whatever was typed in.
   */
  handicap?: number;
  name: string;
  /**
   * The player's 18-hole Handicap Index, when they know it.
   *
   * Kept separately because it is the number that travels: a course handicap
   * is only worth anything at the course it was worked out for, while an Index
   * is the same figure wherever it is played. That is what lets the roster
   * recall a player and get their strokes right at a course they have never
   * been to.
   */
  index?: number;
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
  /** Slope of these holes, 55-155. Needed to turn an Index into strokes. */
  slope?: number;
  /** Course rating in strokes, covering the holes in this record. */
  rating?: number;
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

/** A league team: an A player and a B player. */
export interface LeagueTeam {
  name?: string;
  aId: string; // A player id ('' when that slot is absent)
  bId: string; // B player id ('' when that slot is absent)
  /**
   * League rule: a team playing one player short. The absent slot's id is ''
   * and they are not in `round.players`; their singles match is forfeited to
   * the opponent, and the partner plays their own match and the team point
   * alone.
   */
  absent?: 'a' | 'b';
  /** Who was missing, so the board can say so. Optional. */
  absentName?: string;
}

/** League night format: A-vs-A, B-vs-B, and a combined team match, scored on points. */
export interface LeagueSetup {
  teams: [LeagueTeam, LeagueTeam];
  pointsPerMatch: number;
  /**
   * League rule: play discontinued for darkness or lightning after 5 or more
   * holes counts as complete. While set, every match is final on the holes
   * the whole group finished, and nothing after them counts. Cleared again if
   * the match is resumed on a later day.
   */
  ended?: boolean;
  /**
   * Brand-new players whose handicap is set from this night's own score (70%
   * of it over par, per the new-player rule) once they have finished. Until
   * then they have no handicap and play off the low man, and every result on
   * the board is provisional.
   */
  firstNight?: string[];
}

export interface GameOptions {
  /**
   * The round's default for net scoring, still derived at setup: true when any
   * player entered a handicap (> 0), never set manually. `netByGame` overrides
   * it per game.
   */
  useNet: boolean;
  /**
   * Per-game gross/net, holding only the games the user explicitly chose for.
   * An absent entry follows `useNet`, which is what keeps rounds saved before
   * this existed scoring the way they were played — and what lets a handicap
   * added mid-round still switch the untouched games over. Resolve it through
   * `netFor()` in `games/scoring.ts`, never by reading this directly.
   */
  netByGame?: Partial<Record<GameType, boolean>>;
  stablefordMode: 'standard' | 'modified';
  loneWolfMultiplier: number;
  blindWolfMultiplier: number;
  stakes: Stakes;
  /** Nassau / Match Play teams (default to 1v1 between the first two players). */
  nassau?: TeamSetup;
  matchPlay?: TeamSetup;
  /** Vegas teams. Always 2v2 — the game has no 1v1 form. */
  vegas?: TeamSetup;
  /**
   * Whether a birdie turns the other side's Vegas number around. Widely played
   * but not universal, so it is a choice rather than a rule. Undefined counts
   * as on, which keeps rounds saved before this option existed scoring the way
   * they were scored when they were played.
   */
  vegasFlip?: boolean;
  /**
   * Nassau presses itself whenever a side goes two down, on top of any pressed
   * by hand. The automatic ones are derived from the card by
   * `autoPressStarts()` rather than stored, so correcting a score re-decides
   * them instead of leaving one stranded.
   */
  autoPress?: boolean;
  /**
   * Handicap allowance per game, as a percentage. An absent entry is 100%.
   *
   * Per game rather than per round because the handbook's percentages are a
   * property of the format — 90% for a singles match, 85% for a four-ball,
   * 95% for Stableford — and a round playing several at once needs several.
   * Resolved through `allowanceFor()`, never read directly.
   */
  allowanceByGame?: Partial<Record<GameType, number>>;
  /** Present when this is a league-night round. */
  league?: LeagueSetup;
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
  /** Claimed junk by hole and player (only used when Junk is active). */
  junk?: JunkClaims;
  /**
   * League only: hole number -> ids of players who picked up there (an "X").
   *
   * Kept beside the score rather than in it. The score cell for a pick-up
   * holds the league maximum, 9, so everything that only reads gross numbers
   * — totals, stats, "is this hole complete" — sees a sane card; the league
   * engine reads this and treats the player as having forfeited the hole.
   */
  pickups?: Record<number, string[]>;
  /**
   * Slope and rating of the course, copied at setup so a round stays scoreable
   * on its own terms — editing the saved course afterwards must not
   * re-handicap a round already in the book.
   */
  slope?: number;
  rating?: number;
  /**
   * How many holes `rating` covers, when that is not the number being played.
   *
   * A rating is a property of a set of holes, and the set it describes is not
   * always the set in front of you: a league night plays nine off a course
   * rated over eighteen, and so does any nine-hole round loaded from a saved
   * eighteen-hole card. Without this the eighteen-hole figure is judged
   * against nine holes, fails as implausible — correctly — and the Index route
   * silently stops working for every one of those rounds.
   *
   * Absent means "it covers the holes being played", which is what every round
   * saved before this recorded and what a hand-typed rating means.
   */
  ratingHoles?: number;
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
