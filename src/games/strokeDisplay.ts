import type { GameType, Round } from '../types';
import { playingHandicap } from './handicap';
import { netFor } from './scoring';
import { matchStrokesFor, resolveSides } from './matchPlay';
import { nassauTeams } from './nassau';

/**
 * Which handicap the stroke markers on the Hole tab and the Card are drawn
 * from.
 *
 * The markers can draw one allocation per player per hole, and a round can be
 * playing two: a card game (stroke play, skins, Stableford, Wolf, Vegas) spends
 * a player's own playing handicap — their course handicap cut by that game's
 * allowance — on their own stroke-index holes, while a match (Match Play,
 * Nassau) is played off the difference from the low man — see
 * `matchHandicaps`. When a card game is being scored net its allocation wins,
 * because that is what the Card's net total adds up and what most of the
 * board is reading; the match's own strokes are then named on its board.
 *
 * The card game's number is its *playing* handicap, not the course handicap:
 * a 20 in Stableford at 85% is scored off 17, and twenty dots would put three
 * shots on holes the engine does not give them. Card games can carry different
 * allowances (stroke play at 100%, Stableford at 85%), and the markers can
 * still draw only one, so they follow the first net card game in
 * `CARD_GAMES` order — stroke play when it is net, since the Card's net
 * column is a stroke-play total. When every net card game shares an
 * allowance, which is the usual case, that choice changes nothing.
 *
 * When the only net games are matches, the markers show the match's strokes,
 * so a 10 against a 6 sees "+1 shot" on indexes 1–4 and the 6 sees none —
 * what the match is actually decided on, rather than ten dots that are not.
 *
 * League rounds do not come here: they draw match chips instead.
 */

/**
 * Games that spend a player's handicap on the card, in the order the markers
 * prefer them. Stroke play leads: the Card's net total is its total.
 */
const CARD_GAMES: readonly GameType[] = ['strokePlay', 'skins', 'stableford', 'wolf', 'vegas'];

export function dotHandicapFor(round: Round, playerId: string): number {
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const cardGame = CARD_GAMES.find((g) => round.games.includes(g) && netFor(round, g));
  if (cardGame) return playingHandicap(round, playerId, cardGame);

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
