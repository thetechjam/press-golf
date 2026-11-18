import type { Round, ScrambleShots, ScrambleTeam } from '../types';

/**
 * Scramble — one ball per team, and the argument about whose shots made it.
 *
 * The score itself needs no engine of its own: a team is a `Player`, its score
 * is on the card, and stroke play ranks the teams. What this module adds is the
 * part a card cannot hold — which member's ball was played on each shot — and
 * the one rule most scrambles have about it: everybody's drive has to be used
 * a set number of times.
 *
 * Everything is a pure function of the round, so the screens only render.
 */

export const MAX_TEAMS = 4;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 4;

export const isScramble = (round: Round): boolean => !!round.options.scramble;

/**
 * What one entry on the card is, for "2 teams · 9 holes": a scramble's
 * players are teams, and counting them as players reads as a field of two
 * when eight people played.
 */
export const entrantWord = (round: Round): 'team' | 'player' =>
  isScramble(round) ? 'team' : 'player';

/** The team behind a team `Player`, or undefined when the round has no such team. */
export function teamOf(round: Round, teamId: string): ScrambleTeam | undefined {
  const teams = round.options.scramble?.teams;
  // A backup is only checked at the top level, so a setup of the wrong shape
  // can reach here; it reads as no team rather than a crash on the board.
  return Array.isArray(teams) ? teams.find((t) => t?.id === teamId) : undefined;
}

/** First word of a name, trimmed: what fits on a button and in a list. */
const firstWord = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

/**
 * The name a team gets when nobody gives it one: "Jesse & Sam" for two,
 * "Jesse, Sam +2" for four, "Team 2" when nobody is named.
 *
 * Built from first names because it is shown on the card's row and in the
 * leaderboard, where "Jesse Smith & Sam Ortega" does not fit and the surnames
 * add nothing the group needs. `position` is the team's place in the list,
 * counting from 0, so the second team is "Team 2".
 */
export function defaultTeamName(members: string[], position: number): string {
  const named = members.map(firstWord).filter(Boolean);
  if (named.length === 0) return `Team ${position + 1}`;
  if (named.length <= 2) return named.join(' & ');
  return `${named[0]}, ${named[1]} +${named.length - 2}`;
}

/** First word of the member's name, or "P3" for a blank. For buttons. */
export function memberShort(team: ScrambleTeam, i: number): string {
  return firstWord(team.members[i] ?? '') || `P${i + 1}`;
}

/** The member's whole name for a sentence, falling back the way `memberShort` does. */
const memberName = (team: ScrambleTeam, i: number): string =>
  (team.members[i] ?? '').trim() || `P${i + 1}`;

/**
 * Credits for one team on one hole ([] when none).
 *
 * Read defensively: these arrive from backups and other phones, and an entry
 * that does not name a member this team has is read as "not said" rather than
 * credited to somebody who is not there.
 */
export function shotsOnHole(round: Round, holeNumber: number, teamId: string): number[] {
  const raw = round.shots?.[holeNumber]?.[teamId];
  if (!Array.isArray(raw)) return [];
  const size = teamOf(round, teamId)?.members.length ?? MAX_MEMBERS;
  return raw.map((m) => (Number.isInteger(m) && m >= 0 && m < size ? m : -1));
}

/**
 * How many shot rows to offer: the score when posted, else par — or more,
 * when shots past par have already been credited.
 *
 * Par before the score is in, because that is the likeliest number of shots
 * and the rows are what you tap while the hole is still being played. But
 * until a score says otherwise every credit counts on the board, so a row
 * holding one is never hidden: a par lowered from 5 to 3, or a 6 cleared
 * from the card, would otherwise leave "shots played" counting shots nobody
 * can see or take back. `credited` is the length of the hole's credit list.
 */
export function shotRows(score: number | null, par: number, credited = 0): number {
  return score != null && score > 0 ? score : Math.max(par, credited);
}

/**
 * "Tee shot", "Shot 2", … and "Holed" for the last one once a score is posted.
 *
 * The first shot stays "Tee shot" even on an ace: it is the drive the minimum
 * counts, and that is the question the row is there to answer.
 */
export function shotLabel(i: number, score: number | null): string {
  if (i === 0) return 'Tee shot';
  if (score != null && i === score - 1) return 'Holed';
  return `Shot ${i + 1}`;
}

/**
 * Toggle: crediting the member already credited clears it. Returns a new
 * round; pads with -1, trims trailing -1s, removes empty keys, and leaves
 * `shots` undefined rather than {} when nothing is left.
 *
 * The pruning is not tidiness. These rounds travel as share links, where an
 * empty object is bytes in a QR code, and a hand-over compares two copies
 * entry by entry — a tapped-and-untapped hole must read the same as one
 * nobody touched.
 */
export function creditShot(
  round: Round,
  holeNumber: number,
  teamId: string,
  shot: number,
  member: number
): Round {
  if (!Number.isInteger(shot) || shot < 0) return round;
  const list = shotsOnHole(round, holeNumber, teamId);
  while (list.length <= shot) list.push(-1);
  const valid = Number.isInteger(member) && member >= 0;
  list[shot] = valid && list[shot] !== member ? member : -1;
  while (list.length && list[list.length - 1] === -1) list.pop();

  const next: ScrambleShots = { ...(round.shots ?? {}) };
  const onHole = { ...(next[holeNumber] ?? {}) };
  if (list.length) onHole[teamId] = list;
  else delete onHole[teamId];
  if (Object.keys(onHole).length) next[holeNumber] = onHole;
  else delete next[holeNumber];

  const { shots: _old, ...rest } = round;
  return Object.keys(next).length ? { ...rest, shots: next } : rest;
}

export interface MemberStats {
  name: string;
  drives: number;
  shots: number;
  holed: number;
}

export interface TeamShotStats {
  teamId: string;
  members: MemberStats[];
  /** Holes with no score and no tee shot credited: drives still to be decided. */
  open: number;
}

/**
 * The credits on one hole that still count: all of them while the hole is
 * being played, and only as many as the score once it is posted.
 */
function countedOnHole(round: Round, holeNumber: number, teamId: string): number[] {
  const list = shotsOnHole(round, holeNumber, teamId);
  const score = round.scores[holeNumber]?.[teamId];
  return typeof score === 'number' ? list.slice(0, Math.max(score, 0)) : list;
}

/**
 * Per-member counts for one team.
 *
 * Credits past a posted score are ignored (a 5 corrected to a 4 loses the
 * fifth). They are left in the round rather than deleted — the 4 may be
 * corrected back — but a shot the card says was never played is nobody's.
 * Only the holes being played count, so a shotgun start's order does not
 * matter and a hole edited out of the round takes its credits with it.
 */
export function teamShotStats(round: Round, teamId: string): TeamShotStats {
  const team = teamOf(round, teamId);
  const members: MemberStats[] = (team?.members ?? []).map((_, i) => ({
    name: memberName(team!, i),
    drives: 0,
    shots: 0,
    holed: 0,
  }));
  let open = 0;
  for (const h of round.holes) {
    const score = round.scores[h.number]?.[teamId];
    const counted = countedOnHole(round, h.number, teamId);
    if (score == null && !(counted[0] >= 0)) open += 1;
    counted.forEach((m, i) => {
      if (m < 0 || !members[m]) return;
      members[m].shots += 1;
      if (i === 0) members[m].drives += 1;
      if (typeof score === 'number' && i === score - 1) members[m].holed += 1;
    });
  }
  return { teamId, members, open };
}

export type DriveState = 'none' | 'met' | 'owed' | 'tight' | 'short';

export interface DriveStatus {
  /** 'none' when there is no minimum. */
  state: DriveState;
  min: number;
  owed: { member: number; name: string; count: number }[];
  owedTotal: number;
  open: number;
  /** One sentence for the board; '' when state is 'none'. */
  note: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where a team stands against the tee-shot minimum.
 *
 * Compares what is still owed with the holes still open, because that is the
 * question the group is actually asking on the tee: not "who is short" but
 * "can we still afford to take the best drive here". `tight` is the moment
 * the answer becomes no — every remaining drive is already somebody's.
 */
export function driveStatus(round: Round, teamId: string): DriveStatus {
  const stats = teamShotStats(round, teamId);
  const rawMin = round.options.scramble?.minDrives;
  const min = Number.isInteger(rawMin) && (rawMin as number) > 0 ? (rawMin as number) : 0;
  const { open } = stats;
  if (!min) return { state: 'none', min: 0, owed: [], owedTotal: 0, open, note: '' };

  const owed = stats.members
    .map((m, member) => ({ member, name: m.name, count: Math.max(0, min - m.drives) }))
    .filter((o) => o.count > 0)
    // Most owed first: that is who the next good drive should come from.
    .sort((a, b) => b.count - a.count || a.member - b.member);
  const owedTotal = owed.reduce((n, o) => n + o.count, 0);
  const list = owed.map((o) => `${o.name} ${o.count}`).join(', ');

  let state: DriveState;
  let note: string;
  if (owedTotal === 0) {
    state = 'met';
    note = `Everyone has their ${min}.`;
  } else if (owedTotal < open) {
    state = 'owed';
    note = `Still owed: ${list}. ${plural(open, 'hole', 'holes')} left.`;
  } else if (owedTotal === open) {
    state = 'tight';
    note = `Every tee shot left is spoken for: ${list}.`;
  } else {
    state = 'short';
    const left = open === 0 ? 'no holes' : plural(open, 'hole', 'holes');
    note =
      `${plural(owedTotal, 'tee shot', 'tee shots')} still owed (${list}) with ${left} left. ` +
      'The minimum can’t be met.';
  }
  return { state, min, owed, owedTotal, open, note };
}

/**
 * Holes this team has scored without saying whose tee shot it was.
 *
 * In playing order, which on a shotgun start is not number order — the first
 * one listed is the first one the group walked off without deciding.
 */
export function uncreditedDrives(round: Round, teamId: string): number[] {
  return round.holes
    .filter((h) => typeof round.scores[h.number]?.[teamId] === 'number')
    .filter((h) => !(countedOnHole(round, h.number, teamId)[0] >= 0))
    .map((h) => h.number);
}

/**
 * Lines for the plain-text share: per team, "Tee shots: Jesse 5, Sam 4, …".
 * [] if no credits.
 *
 * One team gets the bare line; with several, each is led by the team's name,
 * since the members alone do not say which line is whose.
 */
export function scrambleSummaryLines(round: Round): string[] {
  const teams = round.options.scramble?.teams;
  if (!Array.isArray(teams)) return [];
  const lines: string[] = [];
  for (const team of teams) {
    const stats = teamShotStats(round, team.id);
    if (!stats.members.some((m) => m.shots > 0)) continue;
    const drives = stats.members.map((m) => `${m.name} ${m.drives}`).join(', ');
    if (teams.length === 1) {
      lines.push(`Tee shots: ${drives}`);
    } else {
      const name = round.players.find((p) => p.id === team.id)?.name.trim() || 'Team';
      lines.push(`${name} — tee shots: ${drives}`);
    }
  }
  return lines;
}
