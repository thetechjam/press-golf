import type { GameType, Round } from '../types';
import { courseHandicapFor } from './handicap';
import { netFor } from './scoring';
import { matchStrokesFor, resolveSides } from './matchPlay';
import { nassauTeams } from './nassau';

/**
 * Which handicap the stroke markers on the Hole tab and the Card are drawn
 * from.
 *
 * The markers can draw one allocation per player per hole, and a round can be
 * playing two: a card game (stroke play, skins, Stableford, Wolf, Vegas) spends
 * a player's whole course handicap on their own stroke-index holes, while a
 * match (Match Play, Nassau) is played off the difference from the low man —
 * see `matchHandicaps`. When a card game is being scored net its allocation
 * wins, because that is what the Card's net total adds up and what most of
 * the board is reading; the match's own strokes are then named on its board.
 * When the only net games are matches, the markers show the match's strokes,
 * so a 10 against a 6 sees "+1 shot" on indexes 1–4 and the 6 sees none —
 * what the match is actually decided on, rather than ten dots that are not.
 *
 * League rounds do not come here: they draw match chips instead.
 */

/** Games that spend a player's whole handicap on the card. */
const CARD_GAMES: readonly GameType[] = ['strokePlay', 'skins', 'stableford', 'wolf', 'vegas'];

export function dotHandicapFor(round: Round, playerId: string): number {
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return 0;

  if (round.games.some((g) => CARD_GAMES.includes(g) && netFor(round, g))) {
    return courseHandicapFor(round, player);
  }

  // A match between fewer than two players has no sides to resolve.
  if (round.players.length < 2) return 0;

  if (round.games.includes('matchPlay') && netFor(round, 'matchPlay')) {
    const { a, b } = resolveSides(round, round.options.matchPlay);
    const strokes = matchStrokesFor(round, a, b, 'matchPlay');
    if (playerId in strokes) return strokes[playerId];
  }
  if (round.games.includes('nassau') && netFor(round, 'nassau')) {
    const { a, b } = nassauTeams(round);
    const strokes = matchStrokesFor(round, a, b, 'nassau');
    if (playerId in strokes) return strokes[playerId];
  }
  return 0;
}
