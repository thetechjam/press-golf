# Approachable round setup

_Design — 2026-08-25_

## Problem

Measured on a fresh install at 375×812, the New Round screen is **1912px of
content — 2.4 screens of scrolling — carrying 30 controls**, 18 of them par
dropdowns. It presents nine sections: course search, saved courses, players,
holes, side games, Match Play teams, Nassau teams, options, money.

The screen's most useful property is invisible: **Start Round is enabled the
moment you arrive.** Skins is preselected, players default to two, holes
default to 18 par-4s. A first-time user could tap Start immediately and get a
working round. Nothing communicates this, so all 30 controls read as decisions
that must be made.

Most of them are not decisions that must be made *now*. Press already lets you
fix pars and stroke indexes from the Card tab, handicaps from "Edit handicaps"
on Play and Results, and stakes from "Edit stakes" on the Board. The Money
section even says so in its own hint. Setup asks up front for things the app
already lets you defer.

Separately, **Press has no memory of people.** `press.rounds.v1` stores every
past round with its players' names and handicaps, but `Setup` opens with two
blank name fields every time. The expensive part of setup on a first tee is not
the dropdowns you can scroll past — it is typing four names on a phone while
the group waits, names the app is already holding.

### Target case

A stranger holding the phone on the first tee, scoring someone else's regular
group, with about sixty seconds. Optimise for time-to-first-hole. Anything
wrong gets fixed later, in-round, where the affordances already exist.

This explicitly does **not** optimise for teaching golf side games to a curious
newcomer. A multi-step wizard is the better teacher and was considered and
rejected: it costs taps rather than saving them, it imposes a linear order on
decisions that are not ordered, and — most damaging — a sequence of Next
buttons converts "everything here is optional" into "there are three things you
must complete before you may play." That is the one property worth protecting.

## Solution

One screen. Players open on arrival; everything else becomes a row showing its
current value, collapsed by default (with one first-run exception — see Default
expansion). Nothing navigates, expansion happens in place, and Start stays live
throughout.

```
‹              NEW ROUND              ⚙

  PLAYERS
  ┌───────────────────────────────────┐
  │ Same crew · Jesse, Marcus, Big …  │
  └───────────────────────────────────┘
   1 (JE) Jesse              HCP 12  ✕
   2 (MA) Marcus             HCP  4  ✕
   + Add player
   Recent:  Dave   Leo   Meesh

  ┌───────────────────────────────────┐
  │ Course           Not set        › │
  │ Games            Skins          › │
  │ Holes & pars     18 holes · 72  › │
  │ Money            No stakes      › │
  └───────────────────────────────────┘

  ┌───────────────────────────────────┐
  │          START ROUND →            │
  └───────────────────────────────────┘
```

_Shown above: a returning user. On a first-ever round the crew and recent chips
are absent and the Games row is expanded._

For a returning group: tap the crew chip, tap Start. Two taps.

### Why each row carries a summary

The summary is the feature, not decoration. "Holes & pars — 18 holes · par 72"
tells a first-timer the question is already answered, which is what makes
skipping it feel safe rather than negligent. A row reading only "Holes & pars ›"
would restore the anxiety the collapse is meant to remove.

## Section consolidation

Match Play teams, Nassau teams and Options exist **only** as consequences of a
game selection. They become part of the Games row's expanded content rather
than top-level sections. Nine sections become four rows plus Players.

| Row | Contains | Summary when collapsed |
|---|---|---|
| Course | `CourseSearch`, saved-course list | course name, or `Not set` |
| Games | game cards, `TeamPicker` ×2, Stableford/Wolf options | selected game titles, or `No games` |
| Holes & pars | 9/18 toggle, par quick-set, par grid, stroke-index advanced | `18 holes · par 72` |
| Money | `StakesEditor` | stake summary, or `No stakes` |

Rows toggle independently — not an accordion. Opening Games must not silently
close Course; a user comparing two rows should not have to fight the screen.

### Default expansion

Every row starts collapsed, with one exception: **Games starts expanded when
there is no round history** (`listRounds().length === 0`).

Collapsing Games is the one part of this design that costs something real — a
genuine first-timer may never learn that Wolf or Nassau exist. Opening it on a
first-ever round buys that discovery back for the only person who needs it,
and costs nothing on every round after, since the condition is false forever
once a round is saved.

The signal is deliberately round history rather than an empty roster: it asks
"has this person ever run a round?", which is the question that matters. A user
who deletes all their rounds gets the introduction again, which is harmless and
arguably right.

## Player recall

### Roster derivation

A new pure module, `src/roster.ts`, derives a roster from saved rounds. No new
storage key; it reads what `listRounds()` already returns (already sorted
most-recent-first by `updatedAt`).

```ts
export interface RosterEntry {
  name: string;
  /** Most recent non-null handicap seen for this name. */
  handicap?: number;
}

export function buildRoster(rounds: Round[]): RosterEntry[];
export function lastCrew(rounds: Round[]): RosterEntry[];
```

`buildRoster` rules:

- Walk rounds most-recent-first, then players in round order.
- Trim names; skip empty ones. Blank placeholder players are common in
  abandoned rounds and must never reach the roster.
- Dedupe case-insensitively, keeping the **first spelling encountered** (most
  recent) — so renaming "big tony" to "Big Tony" takes effect going forward.
- Carry the most recent handicap seen for a name. A name whose recent rounds
  were gross keeps the handicap from the last net round it appeared in, rather
  than losing it.
- Cap at 12 entries. The chip row is a shortcut, not a directory.

`lastCrew` returns the full player set of the most recent round, in that
round's order, with each player's handicap from that round. Returns `[]` when
there are no rounds, or when that round has fewer than two named players.

### Presentation

- **Crew chip** — one chip above the player list, labelled with the names it
  will add (truncated). Tapping replaces the current player list wholesale.
  It is a shortcut, not a merge; replacing is predictable, merging is not.
  Hidden when `lastCrew` is empty, or when the current list already matches it.
- **Recent chips** — a wrapping row under "+ Add player", excluding names
  already present in the form (case-insensitive). Tapping appends that player
  with their remembered handicap. Hidden when nothing remains to offer.

Handicaps arriving via recall are subject to the existing `showNet` behaviour
(`Setup.tsx:140`): the handicap field renders, and the value survives into the
round, only when a selected game sets `usesNet`. All six games currently do, so
in practice any non-empty game selection shows the field. Recall does not change
how net play is decided — it only prefills what the user would otherwise type.
The one case where a recalled handicap is dropped is a round with every game
deselected, which is existing behaviour (`Setup.tsx:160`) and out of scope.

### First-ever round

With no saved rounds, both chip groups are absent — no empty states, no "you
have no saved players yet" messaging, since an empty affordance is worse than
an absent one. The screen is Players open, Games open (see Default expansion),
Course / Holes / Money collapsed, Start live.

So a first-timer's screen answers the two questions worth asking — who is
playing, and what are you playing — and quietly says everything else is
handled.

## Out of scope

- **"Play again" on Home's round card.** Discussed and deliberately deferred;
  it belongs to Home, not Setup, and the crew chip already covers the repeat
  group from inside Setup.
- **An editable saved roster** (add/rename/remove people, default handicaps,
  its own storage key and screen). Considered and rejected as materially more
  work than everything else here combined. Derivation covers the target case.
- **Any change to scoring.** `src/games/*`, the `Round` shape, and Start
  Round's validation are untouched.

## Testing

The roster is the part with real logic and it is pure, so it carries the tests:

- Skips blank and whitespace-only names.
- Dedupes case-insensitively, keeping the most recent spelling.
- Carries the most recent handicap for a name across rounds.
- Orders most-recent-first.
- Caps at 12.
- `lastCrew` returns the newest round's players in order with handicaps.
- `lastCrew` returns `[]` for no rounds and for a round with fewer than two
  named players.
- Summary formatters ("18 holes · par 72", stake summary) render each state.
- Games defaults to expanded with no saved rounds, and collapsed with one or
  more. This is the rule most likely to rot silently, since it is invisible
  after a user's first round.

Layout and disclosure behaviour are verified in the browser across dark, light
and glare, portrait and landscape, and — per the standing rule for this app —
on a real device via the deploy preview before the work is called done.

## Risks

- **Games hidden behind a row** would mean a first-timer never discovers Wolf
  or Nassau. Addressed by the first-ever-round expansion above rather than
  accepted. Residual risk: someone who plays one round and never opens Games
  again stays on Skins forever. Acceptable — Skins is a real game and the row
  names the current pick on every subsequent round.
- **The crew chip replacing rather than merging** could surprise someone who
  has already typed a name. Mitigated by hiding the chip once the list matches
  the crew, and by the replacement being immediately undoable by hand.
- **`Setup.tsx` is 529 lines with 21 `useState` calls** before this work.
  Extracting the disclosure row and the roster chips should reduce it; if the
  file grows instead, that is a signal the row content wants extracting into
  per-row components too.
