import type { Round } from './types';

/**
 * Finding one round among many.
 *
 * The Home screen listed every round ever played, in full, under the two
 * buttons you actually came to press. That is fine for three rounds and
 * useless for forty: the thing you want is either the round you are part-way
 * through or one specific round from months ago, and scrolling is the only
 * tool offered for both.
 *
 * Everything here is a pure function of the rounds, so the searching and
 * grouping can be tested without a screen.
 */

export type StatusFilter = 'all' | 'in_progress' | 'finished';

/** Lower-cased, trimmed, and with runs of space collapsed. */
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Every word worth matching a round on: the course, the players, and the
 * games. Built once per round per search rather than per query word.
 *
 * The date is deliberately absent. People remember a round as "Torrey with
 * Sam", not as "the twelfth" — and a numeric query like `18` would otherwise
 * match every round played on the 18th as well as every eighteen-hole round,
 * which is worse than matching nothing.
 */
function haystack(round: Round): string {
  return norm(
    [round.course ?? '', ...round.players.map((p) => p.name), ...round.games].join(' ')
  );
}

/**
 * Rounds matching every word of the query, in any order and any field.
 *
 * Every word rather than any: "sam torrey" should mean the round with both,
 * which is how somebody narrows a list, and matching *any* word would widen it
 * with each character typed — the opposite of what the typing is for.
 *
 * Substring rather than whole-word, so "torr" finds Torrey while you are still
 * typing it.
 */
export function searchRounds(rounds: Round[], query: string): Round[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (words.length === 0) return rounds;
  return rounds.filter((round) => {
    const hay = haystack(round);
    return words.every((word) => hay.includes(word));
  });
}

/** Rounds in the given state; 'all' passes everything through. */
export function filterByStatus(rounds: Round[], status: StatusFilter): Round[] {
  return status === 'all' ? rounds : rounds.filter((r) => r.status === status);
}

export interface RoundGroup {
  /** `yyyy-mm`, so groups sort without parsing them again. */
  key: string;
  /** "September 2026", or "September" for the current year. */
  label: string;
  rounds: Round[];
}

/**
 * The rounds grouped by the month they were played, newest first.
 *
 * A date on every card tells you when one round was; a heading every few cards
 * tells you where you are in the list, which is the question you have while
 * scrolling through two years of golf. The year is dropped inside the current
 * one for the same reason `formatRoundDate` drops it — it is noise until it
 * isn't.
 *
 * Input order is preserved within a group: `listRounds` already sorts by
 * `updatedAt`, and re-sorting here by date would put a round edited today
 * below one played the same week and never touched since.
 */
export function groupByMonth(rounds: Round[], now: Date = new Date()): RoundGroup[] {
  const groups = new Map<string, Round[]>();
  for (const round of rounds) {
    const key = /^\d{4}-\d{2}/.exec(round.date)?.[0] ?? 'unknown';
    const list = groups.get(key);
    if (list) list.push(round);
    else groups.set(key, [round]);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, list]) => ({ key, label: monthLabel(key, now), rounds: list }));
}

function monthLabel(key: string, now: Date): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return 'Undated';
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Built field by field rather than from the ISO string: `new Date('2026-09')`
  // is parsed as UTC and lands in the previous month west of Greenwich.
  const date = new Date(year, month - 1, 1);
  if (date.getMonth() !== month - 1) return 'Undated';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * A sentence for an empty result, saying which of the two filters emptied it.
 *
 * "No rounds" in front of somebody who has played forty is a bug report
 * waiting to happen; naming the filter that hid them is what turns it back
 * into a list they can recover.
 */
export function describeEmpty(query: string, status: StatusFilter): string {
  const searched = query.trim().length > 0;
  if (searched && status !== 'all') {
    return `No ${status === 'finished' ? 'finished' : 'unfinished'} rounds match “${query.trim()}”.`;
  }
  if (searched) return `No rounds match “${query.trim()}”.`;
  if (status === 'finished') return 'No finished rounds yet.';
  if (status === 'in_progress') return 'No rounds in progress.';
  return 'No rounds yet.';
}
