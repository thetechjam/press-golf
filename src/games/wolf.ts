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

/** How one Wolf hole resolved. `null` for holes that were never played out. */
export interface WolfOutcome {
  hole: number;
  wolfId: string;
  choice: 'partner' | 'lone' | 'blind';
  /** The Wolf's side: the Wolf alone, or the Wolf and their partner. */
  side: string[];
  opponents: string[];
  result: 'won' | 'lost' | 'push';
  /** Points at stake for the Wolf's side — 1 for a partner hole. */
  multiplier: number;
}

/**
 * Resolves every scored Wolf hole. The single copy of the "who was on which
 * side and who won" rules — `computeWolf` tallies points from this, and the
 * awards engine reads it for the lone/blind gambles worth talking about.
 */
export function wolfOutcomes(round: Round): WolfOutcome[] {
  const useNet = round.options.useNet;
  const { loneWolfMultiplier, blindWolfMultiplier } = round.options;
  const out: WolfOutcome[] = [];

  for (const h of round.holes) {
    const assignment = round.wolf[h.number];
    const wolfId = assignment?.wolfPlayerId ?? wolfForHole(round, h);
    const choice = assignment?.choice ?? null;
    if (!wolfId || !choice) continue;

    const side = choice.type === 'partner' ? [wolfId, choice.partnerId] : [wolfId];
    const opponents = round.players.map((p) => p.id).filter((id) => !side.includes(id));

    const wolfScore = teamBest(round, h, side, useNet);
    const oppScore = teamBest(round, h, opponents, useNet);
    if (wolfScore == null || oppScore == null) continue;

    out.push({
      hole: h.number,
      wolfId,
      choice: choice.type,
      side,
      opponents,
      result: wolfScore === oppScore ? 'push' : wolfScore < oppScore ? 'won' : 'lost',
      multiplier:
        choice.type === 'blind'
          ? blindWolfMultiplier
          : choice.type === 'lone'
            ? loneWolfMultiplier
            : 1,
    });
  }

  return out;
}

export function computeWolf(round: Round): GameResult {
  const points: Record<string, number> = {};
  round.players.forEach((p) => (points[p.id] = 0));

  const outcomes = wolfOutcomes(round);
  const holesScored = outcomes.length;

  for (const o of outcomes) {
    if (o.result === 'push') continue; // push, no points
    if (o.result === 'won') {
      // Wolf's side wins: lone/blind wolf scores the multiplier solo,
      // partners each take a point.
      o.side.forEach((id) => (points[id] += o.multiplier));
    } else {
      // Opponents win: each opponent banks a point.
      o.opponents.forEach((id) => (points[id] += 1));
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
