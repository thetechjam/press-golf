import type { GameType } from '../types';

/** Fuller rules text per game, keyed by id — expands on GameMeta.blurb. */
export const GAME_RULES: Record<GameType, string> = {
  strokePlay: 'Total up every stroke on every hole. Lowest total wins. Turn on net scoring and each player\'s handicap strokes come off their total automatically.',
  matchPlay: 'Head-to-head (or 2v2 best-ball) by hole, not total strokes. Win a hole outright to go "1 up." A match closes early once the trailing side can\'t catch up — e.g. "3&2" means 3 up with 2 to play.',
  skins: 'Each hole is worth a skin. Lowest score on a hole wins it outright — a tie means no one wins, and the skin carries over to the next hole, stacking the pot.',
  stableford: 'Points per hole based on your score relative to par (bogey or worse = 0, par = 1, birdie = 2, and so on). Highest total points wins — a blow-up hole only costs you that hole\'s points, not the whole round.',
  wolf: 'The "wolf" rotates every hole in tee order. After watching tee shots, the wolf picks a partner for that hole — or goes it alone ("lone wolf") for a bigger points swing if they/their team wins.',
  vegas: 'Two teams of two. Each side\'s two scores are written side by side as one number, lowest first — a 4 and a 5 is 45, not 9. The lower number wins the hole and the gap between them is the points swing, so one blow-up hole costs a hundred rather than one. If the flip is on, a birdie turns the other side\'s number around: 45 becomes 54.',
  quota: 'Everyone gets a target: 2 points a hole, less their handicap — 36 minus your handicap over 18. Then play for points on the Stableford scale (bogey 1, par 2, birdie 3, eagle 4). Beat your number and you are plus; miss it and you are minus, and the best figure wins. Scores are gross here — your handicap is already spent on the target.',
  nassau: 'Three separate bets in one: front 9, back 9, and the full 18. Going down mid-nine? Call a "press" to start a fresh side bet from that hole to the end of the nine.',
};
