import type { GameType, Round, GameResult } from '../types';
import { computeStrokePlay, strokePlayMoney } from './strokePlay';
import { computeMatchPlay, matchPlayMoney } from './matchPlay';
import { computeSkins, skinsMoney } from './skins';
import { computeStableford, stablefordMoney } from './stableford';
import { computeWolf, wolfMoney } from './wolf';
import { computeNassau, nassauMoney } from './nassau';
import { computeVegas, vegasMoney } from './vegas';
import { computeQuota, quotaMoney } from './quota';
import { computeJunk, junkMoney } from './junk';
import type { MoneyFn } from './moneyModels';
import { isScramble } from './scramble';

/**
 * Everything the app needs to know about a game, in one place: how it is
 * scored, how it settles, and what it is called. A new game is one entry
 * here plus its module; the settlement engine, the setup screen and the
 * boards read from this list rather than keeping lists of their own.
 */
export interface GameMeta {
  id: GameType;
  label: string;
  blurb: string;
  minPlayers: number;
  compute: (round: Round) => GameResult;
  /**
   * What one stake buys, for "$5 per skin". Nassau's reads "bet" here and
   * "bet (×3)" once there is a round to count the bets of — see
   * `unitFor` in settlement.ts.
   */
  unit: string;
  /** Who owes whom for a stake, zero-sum. See moneyModels.ts for the shapes. */
  money: MoneyFn;
}

export const GAMES: GameMeta[] = [
  {
    id: 'strokePlay',
    label: 'Stroke Play',
    blurb: 'Lowest total strokes wins. Net optional.',
    minPlayers: 1,
    compute: computeStrokePlay,
    unit: 'low round',
    money: strokePlayMoney,
  },
  {
    id: 'matchPlay',
    label: 'Match Play',
    blurb: 'Hole-by-hole duel. Win by "3&2".',
    minPlayers: 2,
    compute: computeMatchPlay,
    unit: 'the match',
    money: matchPlayMoney,
  },
  {
    id: 'skins',
    label: 'Skins',
    blurb: 'Win a hole outright to take the skin. Ties carry over.',
    minPlayers: 2,
    compute: computeSkins,
    unit: 'skin',
    money: skinsMoney,
  },
  {
    id: 'stableford',
    label: 'Stableford',
    blurb: 'Points per hole vs par. Highest wins.',
    minPlayers: 1,
    compute: computeStableford,
    unit: 'point',
    money: stablefordMoney,
  },
  {
    id: 'wolf',
    label: 'Wolf',
    blurb: 'Rotating wolf picks a partner — or hunts alone.',
    minPlayers: 3,
    compute: computeWolf,
    unit: 'point',
    money: wolfMoney,
  },
  {
    id: 'vegas',
    label: 'Vegas',
    blurb: '2v2. Your scores make a number — 4 and 5 is 45.',
    minPlayers: 4,
    compute: computeVegas,
    unit: 'point',
    money: vegasMoney,
  },
  {
    id: 'quota',
    label: 'Quota',
    blurb: 'Beat your own points target. Handicap sets the bar.',
    minPlayers: 1,
    compute: computeQuota,
    unit: 'point',
    money: quotaMoney,
  },
  {
    id: 'nassau',
    label: 'Nassau',
    blurb: 'Three bets: front 9, back 9, and total.',
    minPlayers: 2,
    compute: computeNassau,
    unit: 'bet',
    money: nassauMoney,
  },
  {
    id: 'junk',
    label: 'Junk',
    blurb: 'Side bets the card can’t see. Tap them on the hole.',
    minPlayers: 2,
    compute: computeJunk,
    unit: 'junk',
    money: junkMoney,
  },
];

export function gameMeta(id: GameType): GameMeta {
  return GAMES.find((g) => g.id === id) as GameMeta;
}

/**
 * A game's name as it reads for this round.
 *
 * A scramble is stroke play between teams, scored by that engine unchanged —
 * but "Stroke Play" is not what the group is playing, so everywhere a round
 * is in hand (board, money, share text, images) it is called "Scramble".
 * Read through here rather than `gameMeta(g).label` so they cannot disagree.
 */
export function gameLabel(round: Round, id: GameType): string {
  return id === 'strokePlay' && isScramble(round) ? 'Scramble' : gameMeta(id).label;
}

export function activeResults(round: Round): GameResult[] {
  // Only a scramble's title is replaced: every other game's result carries a
  // title of its own ("Stroke Play (Net)", "Nassau (2v2)") that the bare
  // label would lose.
  const scramble = isScramble(round);
  return round.games.map((g) => {
    const result = gameMeta(g).compute(round);
    return scramble && g === 'strokePlay' ? { ...result, title: gameLabel(round, g) } : result;
  });
}
