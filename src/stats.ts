import type { Round } from './types';
import { computeSettlement } from './games/settlement';
import { computeSkins } from './games/skins';
import { holeScore } from './games/handicap';

/**
 * Cross-round history, derived from the rounds already on the device.
 *
 * Nothing new is stored. Every number here is computed from `press.rounds.v1`
 * on demand, which is what keeps this feature on the free side of the backend
 * question the roadmap describes: local history needs no account and no sync,
 * because the rounds are already local.
 *
 * Players are keyed by name, not id — a `Player.id` is minted per round by
 * `uid()`, so the same person is a different id in every round they have ever
 * played. Matching on the lower-cased, trimmed name is exactly what
 * `roster.ts` already does to recall players at setup, so the two agree about
 * who is who.
 */

export interface ScoreTally {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  /** Double bogey or worse — one bucket, because the tail is long and rare. */
  others: number;
}

export interface BestRound {
  toPar: number;
  course: string;
  date: string;
  holes: number;
}

export interface PlayerStats {
  /** Display spelling from the most recent round, as `roster.ts` resolves it. */
  name: string;
  key: string;
  rounds: number;
  /** Holes with a score — the denominator for every average below. */
  holes: number;
  /** Gross strokes over par across those holes. */
  toPar: number;
  /** The same, net of the handicap strokes the player received. */
  netToPar: number;
  /** `toPar` scaled to 18 holes so a nine and a full round compare. */
  avgToPar: number | null;
  netAvgToPar: number | null;
  best: BestRound | null;
  tally: ScoreTally;
  /** Net dollars across every counted round that had stakes. */
  money: number;
  /** How many of those rounds had money on them — the money line's denominator. */
  moneyRounds: number;
  skins: number;
}

export interface Stats {
  rounds: number;
  /**
   * Holes of golf across the counted rounds — 36 for two eighteens, however
   * many players were on the card. Deliberately not the sum of every player's
   * scored holes, which is the right denominator for one player's average but
   * would read on screen as a group of four having played 72 holes in a round.
   */
  holes: number;
  /** Total dollars that changed hands: the sum of every winner's net. */
  moneyMoved: number;
  players: PlayerStats[];
}

/**
 * Whether a round is finished enough to be a fact about how someone plays.
 *
 * Finished is the obvious half. The other half is the round that was scored to
 * the last hole and then simply never had Finish tapped — a common enough end
 * to a round that excluding it would leave a regular user staring at an empty
 * Stats screen and no way to work out why.
 *
 * An abandoned round scored through four holes is excluded by both tests, which
 * is the point: it would drag a scoring average toward whatever those four
 * holes happened to be.
 */
export function countsForStats(round: Round): boolean {
  if (round.players.length === 0 || round.holes.length === 0) return false;
  if (round.status === 'finished') return true;
  return round.holes.every((h) => round.players.every((p) => round.scores[h.number]?.[p.id] != null));
}

const bucket = (strokes: number, par: number): keyof ScoreTally => {
  const d = strokes - par;
  if (d <= -2) return 'eagles';
  if (d === -1) return 'birdies';
  if (d === 0) return 'pars';
  if (d === 1) return 'bogeys';
  return 'others';
};

const emptyTally = (): ScoreTally => ({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, others: 0 });

/** Round to cents, so summed floats don't surface as $12.000000000000002. */
const money2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds the history.
 *
 * `rounds` is whatever `listRounds()` returned — newest first. That ordering is
 * load-bearing in one place only: the display spelling of a name is taken from
 * the first round it is seen in, i.e. the most recent, matching how
 * `buildRoster` resolves the same question.
 */
export function computeStats(rounds: Round[]): Stats {
  const counted = rounds.filter(countsForStats);
  const byKey = new Map<string, PlayerStats>();
  let moneyMoved = 0;

  for (const round of counted) {
    const settlement = computeSettlement(round);
    const skinsByPlayer: Record<string, number> = {};
    if (round.games.includes('skins')) {
      for (const s of computeSkins(round).standings) {
        if (s.playerId) skinsByPlayer[s.playerId] = s.value;
      }
    }
    if (settlement.active) {
      moneyMoved += money2(
        Object.values(settlement.totals).reduce((sum, v) => sum + (v > 0 ? v : 0), 0)
      );
    }

    for (const p of round.players) {
      const name = p.name.trim();
      // Setup seeds a new round with blank players; an abandoned one is full
      // of them. They are nobody, and must never become a row here.
      if (!name) continue;

      // Walked before the player is entered into the map, so that someone
      // listed in a round they never actually scored in — a no-show still on
      // the card — does not become an all-zero row on the Stats screen.
      const tallyHere = emptyTally();
      let holesHere = 0;
      let toParHere = 0;
      let netToParHere = 0;
      for (const h of round.holes) {
        const gross = round.scores[h.number]?.[p.id];
        if (gross == null) continue;
        holesHere += 1;
        toParHere += gross - h.par;
        tallyHere[bucket(gross, h.par)] += 1;
        // Net is read through the engine rather than recomputed, so a stroke
        // lands on the same hole here as it does on the scorecard. `true`
        // rather than `round.options.useNet`: a player with no handicap gets
        // no strokes anyway, and a league round scores net with useNet false.
        netToParHere += (holeScore(round, p.id, h, true) ?? gross) - h.par;
      }
      if (holesHere === 0) continue;

      const key = name.toLowerCase();
      let ps = byKey.get(key);
      if (!ps) {
        ps = {
          name,
          key,
          rounds: 0,
          holes: 0,
          toPar: 0,
          netToPar: 0,
          avgToPar: null,
          netAvgToPar: null,
          best: null,
          tally: emptyTally(),
          money: 0,
          moneyRounds: 0,
          skins: 0,
        };
        byKey.set(key, ps);
      }

      for (const k of Object.keys(tallyHere) as (keyof ScoreTally)[]) {
        ps.tally[k] += tallyHere[k];
      }
      ps.netToPar += netToParHere;
      ps.rounds += 1;
      ps.holes += holesHere;
      ps.toPar += toParHere;
      ps.skins += skinsByPlayer[p.id] ?? 0;

      if (settlement.active) {
        ps.money = money2(ps.money + (settlement.totals[p.id] ?? 0));
        ps.moneyRounds += 1;
      }

      // Only a fully scored round can be somebody's best — a card with three
      // holes missing would win on to-par for the wrong reason. The hole count
      // travels with it so a nine is never silently compared to a full round.
      if (holesHere === round.holes.length && (!ps.best || toParHere < ps.best.toPar)) {
        ps.best = {
          toPar: toParHere,
          course: round.course || '',
          date: round.date,
          holes: holesHere,
        };
      }
    }
  }

  const players = [...byKey.values()];
  for (const ps of players) {
    ps.avgToPar = ps.holes ? (ps.toPar / ps.holes) * 18 : null;
    ps.netAvgToPar = ps.holes ? (ps.netToPar / ps.holes) * 18 : null;
  }

  // Most rounds first — the people you actually play with lead the list — and
  // the better scoring average breaks the tie.
  players.sort((a, b) => b.rounds - a.rounds || (a.avgToPar ?? 0) - (b.avgToPar ?? 0));

  const holes = counted.reduce((n, r) => n + r.holes.length, 0);
  return { rounds: counted.length, holes, moneyMoved: money2(moneyMoved), players };
}

/** "+2.4" / "−1.0" / "E" — a to-par figure as golfers write it. */
export function formatToPar(n: number, digits = 0): string {
  const v = Number(n.toFixed(digits));
  if (v === 0) return 'E';
  return v > 0 ? `+${v.toFixed(digits)}` : `−${Math.abs(v).toFixed(digits)}`;
}
