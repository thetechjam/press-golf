# Scramble — design

A scramble is the one format Press cannot score today: a team plays one ball
and posts one score, and the argument afterwards is not about the number but
about whose shots made it — and whether everybody's drive got used often
enough. This adds it as a format with its own setup, the way Golf League is.

The reference is the single-team "Delcastle Scramble Scorecard" page built
earlier: a team score per hole, a tap per shot to say whose ball was played,
a tee-shot minimum with a running "still owed" note, and a shotgun start.
Press keeps those four ideas and drops what was specific to that page (the
green leaderboard styling, Archivo, yardages and tee sets, cloud backup).
Everything here uses Press's existing tokens, Oswald, components and voice.

## The one decision everything follows from

**A scramble team is a `Player`.** `round.players` holds one entry per team,
named after the team, and `round.scores` holds the team's score. Every part
of the app that reads a card — score entry, the scorecard, stroke play, the
money, results, share links, backups, hand-over — then works unchanged.

The people on the team, and whose shot was played, are carried beside that:

```ts
// types.ts — additive only (CONTRIBUTING.md, "The one rule about data")

/** A scramble team: one ball, one score. */
export interface ScrambleTeam {
  /** The id of the `Player` in `round.players` that stands for this team. */
  id: string;
  /** The people on the team, in the order they were entered. Two to four. */
  members: string[];
}

export interface ScrambleSetup {
  teams: ScrambleTeam[];
  /** Each member's tee shot must be used at least this often. Absent = no minimum. */
  minDrives?: number;
}

/** hole number -> team id -> whose ball was played, shot by shot.
 *  Each entry is a position in that team's `members`, or -1 for "not said".
 *  Index 0 is the tee shot. */
export type ScrambleShots = Record<number, Record<string, number[]>>;

// GameOptions
scramble?: ScrambleSetup;   // present when this is a scramble round
// Round
shots?: ScrambleShots;      // only used in a scramble
```

A scramble round has `games: ['strokePlay']` (gross), so the board, money and
results come from the existing engine. A stake, when there are two or more
teams, is `options.stakes.strokePlay` — low team takes it from each other team.

What an older build sees when it opens one (link or backup): a stroke-play
round between players named after the teams. Nothing breaks; the shot credits
are simply not shown.

Because team "players" are not people, the modules that follow people from
round to round must not treat them as such — see *Data gates*.

## Engine — `src/games/scramble.ts` (pure, tested)

```ts
export const MAX_TEAMS = 4;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 4;

export const isScramble: (round: Round) => boolean;
export function teamOf(round: Round, teamId: string): ScrambleTeam | undefined;

/** "Jesse & Sam" for two, "Jesse, Sam +2"-style for more; "Team 2" when nobody is named. */
export function defaultTeamName(members: string[], position: number): string;
/** First word of the name, or "P3" for a blank. For buttons. */
export function memberShort(team: ScrambleTeam, i: number): string;

/** Credits for one team on one hole ([] when none). */
export function shotsOnHole(round: Round, holeNumber: number, teamId: string): number[];
/** How many shot rows to offer: the score when posted, else par. */
export function shotRows(score: number | null, par: number): number;
/** "Tee shot", "Shot 2", … and "Holed" for the last one once a score is posted. */
export function shotLabel(i: number, score: number | null): string;

/** Toggle: crediting the member already credited clears it. Returns a new
 *  round; pads with -1, trims trailing -1s, removes empty keys, and leaves
 *  `shots` undefined rather than {} when nothing is left. */
export function creditShot(
  round: Round, holeNumber: number, teamId: string, shot: number, member: number
): Round;

export interface MemberStats { name: string; drives: number; shots: number; holed: number; }
export interface TeamShotStats {
  teamId: string;
  members: MemberStats[];
  /** Holes with no score and no tee shot credited: drives still to be decided. */
  open: number;
}
/** Credits past a posted score are ignored (a 5 corrected to a 4 loses the fifth). */
export function teamShotStats(round: Round, teamId: string): TeamShotStats;

export type DriveState = 'none' | 'met' | 'owed' | 'tight' | 'short';
export interface DriveStatus {
  state: DriveState;          // 'none' when there is no minimum
  min: number;
  owed: { member: number; name: string; count: number }[];
  owedTotal: number;
  open: number;
  /** One sentence for the board; '' when state is 'none'. */
  note: string;
}
export function driveStatus(round: Round, teamId: string): DriveStatus;

/** Holes this team has scored without saying whose tee shot it was. */
export function uncreditedDrives(round: Round, teamId: string): number[];

/** Lines for the plain-text share: per team, "Tee shots: Jesse 5, Sam 4, …". [] if no credits. */
export function scrambleSummaryLines(round: Round): string[];
```

Drive notes (one voice with the rest of the app — plain, no exclamation):

| state | when | note |
|---|---|---|
| `met` | nobody owes | `Everyone has their 3.` |
| `owed` | owed < open | `Still owed: Sam 2, Al 1. 7 holes left.` |
| `tight` | owed = open | `Every tee shot left is spoken for: Sam 2, Al 1.` |
| `short` | owed > open | `3 tee shots still owed (Sam 2, Al 1) with 2 holes left. The minimum can’t be met.` |

`activeResults` titles the stroke-play result **“Scramble”** for a scramble
round. `computeAwards` returns `[]` for one (the awards are personal feats).

## Data gates (team entries are not people)

| Module | Change |
|---|---|
| `stats.ts` `countsForStats` | false for a scramble — a team score is nobody's own. |
| `roster.ts` `buildRoster`, `lastCrew` | read a scramble round's **members** (names only), never its team names. |
| `people.ts` `likelySame` and any other cross-round name walk | skip a scramble round's team names. |
| `trips.ts` | scramble rounds are left out of trips, as league nights are. |
| `lastSetup.ts` | skip scramble rounds. |
| `history.ts` | `isScrambleRound`; `KindFilter` gains `'scramble'` (`'regular'` excludes it); the haystack gains the word `scramble` and the members' names. |
| `roundSummary.ts` | `roundTitle` falls back to `Scramble`; `standingLine` for a single team reads e.g. `−3 thru 9` / `68 (−4)`. |
| `shareLink.ts` | `o.scramble` (team ids through `mapPlayerIds`; `readScramble` validates field by field: ids known and unique, 2–4 string members, integer `minDrives` 1–18, else the setup is dropped) and packed credits `sh` (hole → team index → string, one char per shot, `.` for -1). Follows `hn` renumbering exactly as junk does. `SHARE_FORMAT` is **not** bumped. |
| `handover.ts` | credits are part of the round's fingerprint, as pick-ups are. |
| `backup.ts` | confirm `options.scramble` and `shots` survive export → restore; test it. |

## Setup — `src/screens/ScrambleSetup.tsx` (lazy, view `scrambleSetup`)

Reached from Home, where **Scramble** joins **League** as a secondary action
under *Start New Round*. Same bar, cards, rows and course controls as New
Round (reuse `courseState`, `CourseSection`, `HolesSection`, `SetupRow`,
`RosterChips`; do not change what New Round does).

- **Teams.** One team to start (your team in an event); *Add a team* up to
  four. Each team: an optional name (placeholder shows the default it will
  get) and four name fields in a 2×2 grid; blanks are dropped, two named
  members are required. Roster chips fill the first blank slot.
- **Course / Holes & pars.** As New Round: 9 or 18, search, saved courses.
- **Format.** *Starting hole* (shotgun start — the holes are rotated into
  playing order, as League does) and *Tee shot minimum* (None, 1–6) with the
  hint: “If every player’s drive has to be used a set number of times. Par 3s count.”
- **Stake.** Shown with two or more teams: “$ per team — low team takes it
  from each of the others.”
- **Tee Off** builds the round described above.

## Play

- **Hole tab.** Each team has the usual score row. Directly under it:
  *Tee shot* with one button per member (`aria-pressed`; tap again to clear),
  and an *All shots* disclosure that opens a row per remaining shot
  (“Shot 2” … “Holed”), `shotRows` of them. With a minimum set, each member's
  button carries their running count (e.g. `Sam 2/3`).
- **Warnings** (the existing banner): *Next* — “No tee shot picked for
  {team}.” when a minimum is set and the hole is scored without one.
  *Finish* — “{team}: tee-shot minimum not met (Sam 1).”
- **Board tab.** Money (when staked), the “Scramble” leaderboard, then a
  **Tee shots** card per team: each member's name, drives used (`3 of 4`,
  pips when there is a minimum), “12 shots played · 2 holed out”, and the
  drive note. `tight` and `short` use the existing warning treatment.
- **Card tab.** Unchanged (teams are the rows).

## Results, lists, sharing

- Results: the usual hero for two or more teams; for one team the hero is
  the team's total and to-par. The **Tee shots** cards follow. No awards.
- Round cards and the resume card say **Scramble** (with its icon) and count
  **teams**, not players. History gains a *Scramble* kind filter.
- The plain-text share gains the `scrambleSummaryLines`. Images unchanged.
- How to Play gains a short Scramble entry.

## Not in this pass

Team handicaps as a setup field (the Board's *Edit handicaps* still works on
a team entry), a tee-initials row on the scorecard, scramble in trips and
stats, yardages, and renaming members through the same-person merge.
