import type { Round, Hole, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { rankStandings } from './util';

/** Whose turn it is to be the Wolf on a given hole (rotates by tee order). */
export function wolfForHole(round: Round, hole: Hole): string | undefined {
  if (round.players.length === 0) return undefined;
  const idx = (hole.number - 1) % round.players.length;
  return round.players[idx]?.id;
}

/** Best (lowest) score on a hole among a set of players; null if incomplete. */
function teamBest(
  round: Round,
  hole: Hole,
  playerIds: string[],
  useNet: boolean
): number | null {
  const scores = playerIds.map((id) => holeScore(round, id, hole, useNet));
  if (scores.some((s) => s == null)) return null;
  return Math.min(...(scores as number[]));
}

export function computeWolf(round: Round): GameResult {
  const useNet = round.options.useNet;
  const { loneWolfMultiplier, blindWolfMultiplier } = round.options;
  const points: Record<string, number> = {};
  round.players.forEach((p) => (points[p.id] = 0));

  let holesScored = 0;

  for (const h of round.holes) {
    const assignment = round.wolf[h.number];
    const wolfId = assignment?.wolfPlayerId ?? wolfForHole(round, h);
    const choice = assignment?.choice ?? null;
    if (!wolfId || !choice) continue;

    // Build the two sides.
    let wolfSide: string[];
    if (choice.type === 'partner') wolfSide = [wolfId, choice.partnerId];
    else wolfSide = [wolfId];
    const opponents = round.players.map((p) => p.id).filter((id) => !wolfSide.includes(id));

    const wolfScore = teamBest(round, h, wolfSide, useNet);
    const oppScore = teamBest(round, h, opponents, useNet);
    if (wolfScore == null || oppScore == null) continue;
    holesScored += 1;

    if (wolfScore === oppScore) continue; // push, no points

    const wolfWon = wolfScore < oppScore;
    const multiplier =
      choice.type === 'blind'
        ? blindWolfMultiplier
        : choice.type === 'lone'
          ? loneWolfMultiplier
          : 1;

    if (wolfWon) {
      // Wolf's side wins: lone/blind wolf scores the multiplier solo,
      // partners each take a point.
      wolfSide.forEach((id) => (points[id] += multiplier));
    } else {
      // Opponents win: each opponent banks a point.
      opponents.forEach((id) => (points[id] += 1));
    }
  }

  const standings: GameStanding[] = round.players.map((p) => ({
    playerId: p.id,
    label: p.name,
    detail: `${points[p.id]} pts`,
    value: points[p.id],
    rank: 0,
    isLeader: false,
  }));

  const sorted = rankStandings(standings, false);
  const leader = sorted.find((s) => s.isLeader);

  return {
    gameType: 'wolf',
    title: 'Wolf',
    status:
      holesScored === 0
        ? 'Pick a wolf to start'
        : leader
          ? `${leader.label} leads · ${leader.detail}`
          : 'All square',
    standings: sorted,
    note: round.players.length < 3 ? 'Wolf is best with 3–4 players' : undefined,
  };
}
