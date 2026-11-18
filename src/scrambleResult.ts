import type { GameResult, Round } from './types';
import { isScramble } from './games/scramble';
import { standingLine } from './roundSummary';

/**
 * The stroke-play board as one scramble team should read it.
 *
 * Stroke play ranks players against each other, and with a single team it
 * says "All square" over a field of one with a bare "24" beside it — true,
 * and no use. A lone team's card is about its number against par, so the
 * status is where it stands ("−3 thru 7") and the row carries the total with
 * its to-par, the way the round's own card line does (`standingLine`).
 *
 * Every other result passes through unchanged.
 */
export function asScrambleResult(round: Round, result: GameResult): GameResult {
  if (!isScramble(round) || round.players.length !== 1 || result.gameType !== 'strokePlay') {
    return result;
  }
  const finished = round.status === 'finished';
  const live = standingLine(round, false);
  const total = standingLine(round, true);
  if (!live || !total) return result;
  return {
    ...result,
    status: finished ? 'Final' : live.text,
    standings: result.standings.map((s) => ({ ...s, detail: total.text })),
  };
}
