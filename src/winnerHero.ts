import type { Round } from './types';
import { activeResults } from './games';
import { computeSettlement, formatMoney } from './games/settlement';
import { colorMap } from './player';
import { isScramble } from './games/scramble';
import { formatToPar } from './stats';

/*
 * Shared by the Results screen and the results image, so the picture that
 * goes to the group chat leads with the same winner the screen does.
 */

export interface Hero {
  players: { name: string; color: string }[];
  line: string;
  sub: string;
}

// The payoff headline: money leader when stakes are set, else the leader of the
// first decided game. League rounds skip the hero — the board tells the story.
export function winnerHero(round: Round): Hero | null {
  const colors = colorMap(round);

  // One scramble team has beaten nobody: "Jesse & Sam wins" would be a race
  // of one. What it has is the number it hands in, so that is the headline.
  if (isScramble(round) && round.players.length === 1) {
    const team = round.players[0];
    let gross = 0;
    let toPar = 0;
    let played = 0;
    for (const h of round.holes) {
      const s = round.scores[h.number]?.[team.id];
      if (s == null) continue;
      gross += s;
      toPar += s - h.par;
      played += 1;
    }
    if (played === 0) return null;
    return {
      players: [{ name: team.name, color: colors[team.id] }],
      line: `${gross} · ${formatToPar(toPar)}`,
      sub:
        played < round.holes.length
          ? `${team.name} · thru ${played}`
          : team.name,
    };
  }

  const settlement = computeSettlement(round);
  if (settlement.active) {
    const nets = round.players
      .map((p) => ({ name: p.name, color: colors[p.id], net: settlement.totals[p.id] ?? 0 }))
      .sort((x, y) => y.net - x.net);
    if (nets[0] && nets[0].net > 0 && nets[0].net !== nets[1]?.net) {
      return {
        players: [{ name: nets[0].name, color: nets[0].color }],
        line: `${nets[0].name} wins ${formatMoney(nets[0].net)}`,
        sub: 'biggest winner',
      };
    }
  }

  const first = activeResults(round).find((r) =>
    r.standings.some((s) => s.isLeader && s.playerId)
  );
  if (first) {
    const players = first.standings
      .filter((s) => s.isLeader && s.playerId)
      .map((s) => ({ name: s.label, color: colors[s.playerId!] }));
    return {
      players,
      line: players.length === 1 ? `${players[0].name} wins` : 'Tied at the top',
      sub: first.title,
    };
  }

  return null;
}
