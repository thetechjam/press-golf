# Live Money on Play + Play-Screen Defect Fixes

_Design spec — 2026-08-04_

## Problem

Press is named after doubling a bet. `BRAND.md` says "the bet is the point."
But `stakes` appears in exactly one UI file (`components/Settlement.tsx`), which
renders only on the Results screen. You cannot set a stake at setup, and you
cannot see money at any point during the round. For the three-plus hours the app
is actually in your hand, Press is an ordinary scorecard; the money — the one
thing no free scorecard app does — appears once, after everyone has walked off
18.

Four measured defects on the Play screen compound this (all figures at 375×812,
hole 12 of a 4-player round with Wolf and Nassau active):

1. **The primary CTA never pins.** `.btn-primary.sticky` (`index.css:157`) is
   `position: sticky; bottom: 12px`, but on Play the button is wrapped in
   `.play-foot` (`index.css:1258`), a plain block only as tall as the button. A
   sticky box cannot move outside its containing block, so it renders static.
   Measured: the button sits at document y=**1877** with an 812px viewport. On
   Setup the same class works, because there the button is a direct child of the
   tall `.screen`. Play-only regression.
2. **Scoring sits below the fold.** The first stepper starts at y=**608** of 812.
   Two of four players are fully visible. This is the most-repeated action in the
   app — 72 entries per foursome round — and it needs a scroll on every hole.
3. **Sunlight mode hides handicap strokes.** `--gold #e7b53c` is not remapped for
   the light theme. `.hcp-dots` measures **8.5:1 on dark, 1.9:1 on white**
   (WCAG 2.2 AA wants 4.5:1 at that size). Those dots are the only indicator of
   who receives a stroke on the hole, and this is the mode built specifically for
   direct sunlight.
4. **The per-game money breakdown is computed and discarded.**
   `settlement.ts:187` builds a complete per-game net per player. Nothing renders
   it.

Plus two smaller ones: no browser-history handling anywhere in `src`, so the
Android back gesture exits an installed PWA mid-round; and README + CHANGELOG
both claim handicap strokes are "capped at one stroke per hole" when
`handicap.ts:22` awards two above 18 and `handicap.test.ts:45` asserts it.

## Goals

- Money is visible and meaningful during the round, not just after it.
- Stakes are settable before the first tee.
- The Hole tab fits one screen with every game control active.
- The six defects above are fixed at the root, not patched.

## Non-goals

- No backend, accounts, or sync. Press stays local-only and offline-first.
- No changes to the existing scoring engines. Every game engine in `src/games/*`
  is left byte-for-byte alone; the one new module added there (`money.ts`) is a
  pure derivation layered on top of `computeSettlement`, not a new engine.
- No stakes for League rounds. `Results.tsx:117` already routes league rounds
  past `Settlement` entirely; that stays true.
- No new games, junk bets, or auto-press. Those are separately scoped.

## Architecture

Play grows from two tabs to three, extending the existing segmented control:

```
Hole  |  Board  |  Scorecard
```

- **Hole** — scoring only. Hole nav, progress strip, game controls, steppers,
  swing line, CTA. Fits one viewport.
- **Board** — money at the top, live standings below. This is where the four
  leaderboards move, and where the discarded `perGame` breakdown surfaces.
- **Scorecard** — unchanged.

The middle tab is labelled **"Board"**, not "Money". It holds the live standings
too, and those matter when nobody is playing for cash; a "Money" tab containing
your Stableford standings in a friendly round reads wrong. Money sits at the top
of the Board tab, where it is the first thing seen.

Data flow is unchanged in shape: `App` owns the `Round`, `Play` receives it and
calls `onChange`, and every derived value comes from a pure function of that
`Round`. Nothing new is persisted beyond `options.stakes`, which already exists
in the type and in `localStorage`.

## Components

### `StakesEditor` (new — `src/components/StakesEditor.tsx`)

**What it does.** Renders one `$` input per game in `round.games`, labelled with
that game's stake unit from `STAKE_UNIT`.

**How you use it.** `<StakesEditor round={round} onChange={onChange} />`.

**Depends on.** `games/index.ts` (`gameMeta`), `games/settlement.ts`
(`STAKE_UNIT`).

This is a pure extraction of the `stakes-editor` block currently inline in
`Settlement.tsx:47-69`. No logic change. It exists so Setup, the Board tab, and
Results share one implementation rather than three drifting copies.

### `MoneyTicker` (new — `src/components/MoneyTicker.tsx`)

**What it does.** One compact line of player-coloured chips showing each player's
current net: `AL +$18 · BO −$9 · CY −$15 · DEE +$6`.

**How you use it.** `<MoneyTicker round={round} />`. Renders `null` when
`computeSettlement(round).active` is false.

**Depends on.** `games/settlement.ts`, `player.ts` (`colorMap`).

Two decisions worth stating explicitly:

- **Fixed player order, never sorted by net.** Sorting would reshuffle the line
  on every stepper tap — precisely when the user is trying to read a number and
  press a button under it. Fixed order maps 1:1 to the steppers directly below.
  Sorted standings are the Board tab's job.
- **Hidden entirely when no stakes are set.** A friendly round must not show a
  dead `$0 $0 $0 $0` bar.

Overflows to `overflow-x: auto` past four players.

### `MoneyBoard` (new — `src/components/MoneyBoard.tsx`)

**What it does.** The money half of the Board tab: net per player sorted
descending, then a per-game breakdown driven by `Settlement.perGame` — the data
currently computed and thrown away. One row per game showing its stake, unit, and
each player's net from that game alone.

**How you use it.** `<MoneyBoard round={round} onChange={onChange} />`.

**Depends on.** `games/settlement.ts`, `StakesEditor`, `player.ts`.

When no stakes are set it renders the `StakesEditor` plus a short empty state, so
money can still be added mid-round when someone forgets at the first tee. The
leaderboards below it render regardless.

### `HoleView` (new — `src/screens/HoleView.tsx`)

**What it does.** The hole-scoring body extracted out of `Play.tsx`: hole nav,
progress strip, game controls, steppers, swing line.

**Why.** `Play.tsx` is 330 lines today. Adding a third tab, the ticker, and the
swing line lands it near 500 and makes it the next file that is hard to change.
The tab shell (mode state, wake lock, sunlight, warn banner, CTA) stays in
`Play.tsx`; the hole body moves out behind a props interface.

### `games/money.ts` (new — pure)

Two functions, no React, unit-tested alongside the existing engines:

- `lastCompletedHole(round): number | null` — the highest hole number where every
  player has a score, or `null` when no hole is complete.
- `holeSwing(round, holeNumber): Record<string, number>` — per-player money delta
  attributable to that hole, computed as `computeSettlement(round)` minus
  `computeSettlement(round without that hole's scores)`.

## Feature design

### Stakes at Setup

A **Money** card on `Setup.tsx`, rendered after the Side Games card so it lists
only the games actually selected. Body is `<StakesEditor />`. All blank means no
money and the app behaves exactly as it does today — this is additive, never a
required step.

`LeagueSetup.tsx` is untouched.

### The swing line

Under the steppers on the Hole tab, when the current hole is complete:

```
Hole 12 · Dee +$14 · Al +$4 · Bo −$9 · Cy −$9
```

**It renders only on the most recently completed hole**, i.e. only when
`lastCompletedHole(round) === hole.number`. This is a correctness constraint, not
a stylistic one: removing an earlier hole's scores changes skins carry-over on
every hole after it, so the delta for an old hole is a counterfactual rather than
that hole's real value. On the most recent hole the delta is exact.

Hidden when no stakes are set, and when every swing is zero.

Cost is two `computeSettlement` passes per render. At 18 holes × 4 players that
is negligible, and both passes are pure.

### Fitting the Hole tab in one screen

Moving the boards to the Board tab is not sufficient on its own. Current stack
measures ~892px against 812:

| Element | Height |
|---|---|
| header bar | ~56 |
| tab control | ~60 |
| hole nav | ~90 |
| hole dots (wrapped, 2 rows) | 50 |
| Wolf card | ~145 |
| Nassau card | ~135 |
| steppers (4 × 73) | 292 |
| CTA | 64 |

Two changes close the ~80px gap with room to spare:

1. **Game controls collapse once answered.** The Wolf card is full height while
   it is asking for a call and collapses to a one-line summary afterwards
   (`🐾 Dee + Al`, tap to reopen). Nassau likewise
   (`⛳ Back: Cy & Dee 1 UP · Press`). Roughly 200px recovered. This is also just
   better behaviour — a card that has served its purpose should stop occupying a
   third of the screen.
2. **Hole dots become a single-row progress strip.** The current 18 dots wrap
   into a ragged 13+5 block at 24px targets. A single row lifts the touch targets
   and recovers ~26px.

**Acceptance criterion, measured the same way the problem was measured:** at
375×812 on a 4-player round with Wolf and Nassau active and a call already made,
all four steppers and the CTA are visible without scrolling **when you arrive at
a hole**. Entering scores adds score-mark rings that grow each stepper ~26px, so
the fourth can drop below the fold once the hole is filled in. The original
defect was 2 of 4 steppers with the CTA at y=1877.

## Defect fixes

| # | Fix | Approach |
|---|---|---|
| 1 | Sticky CTA | Make `.play-foot` itself `position: sticky; bottom: 0` with an opaque background and safe-area padding, rather than the button inside it. Verify the warn banner still stacks above it. |
| 2 | Scoring below fold | Solved structurally by the Board tab plus the two changes above. |
| 3 | Sunlight contrast | See below. |
| 4 | `perGame` unused | Rendered by `MoneyBoard`. |
| 5 | Back button | `pushState` on each view transition in `App.tsx`; a `popstate` listener maps results→play, play→home, setup→home, leagueSetup→home. Guard against double-push on repeated transitions to the same view. |
| 6 | Docs | Correct the "capped at one stroke per hole" claim in `README.md` and `CHANGELOG.md`. The engine is right; the prose is wrong. |
| 7 | Scorecard a11y | The tap-to-jump `<th>`/`<td>` in `Scorecard.tsx:31,69` have `onClick` and no keyboard path. Add `role="button"`, `tabIndex={0}`, and an Enter/Space handler. |

### Sunlight gold (defect 3) in detail

`--gold` is used as a foreground `color` in five places, all of which are
contrast risks on the light theme:

- `.board-row.leader .board-rank` (`index.css:1226`) — leader's rank number
- `.lmatch-strokes` (`:1335`) — league match strokes
- `.winner-emoji` (`:1589`) — results-hero trophy
- `.hcp-dots` (`:1663`) — stepper handicap dots (**measured 1.9:1**)
- `.sc-dots` (`:1850`) — scorecard handicap dots

Its other uses are `color-mix` tints for backgrounds and borders, which are fine.

**Introduce a separate `--gold-ink` token used only for foreground `color`
declarations**, defaulting to `--gold` and remapped inside the `:root.sunlight`
scope (`index.css:52`). Overriding `--gold` wholesale would also darken every
tint and border and muddy the gold surfaces the brand depends on.

Starting value: **`#8a6410`**, which computes to **5.37:1** on white — clearing
4.5:1 with headroom. (`#9a7214` was evaluated and rejected at 4.38:1.) The
implementation must re-measure all five sites against their actual rendered
backgrounds rather than trusting this figure, since `.winner-emoji` sits on a
gold-tinted hero rather than white.

## Decisions considered and rejected

Confirmed with the owner on 2026-08-04. Recorded so the reasoning survives the
conversation that produced it.

**Tab label — "Board" over "Money".** "Money" is more on-brand for an app named
Press and is the more tempting word to tap, but the tab also holds the four game
leaderboards; in a friendly round with no stakes it would be a Money tab with no
money in it. A dynamic label ("Money" when stakes exist, "Board" otherwise) was
considered and rejected because it flips while you are editing stakes from that
same tab.

**Swing scope — most recent completed hole only.** Showing a swing on every
completed hole gives you something to read when swiping back, but for any hole
except the last, the delta answers "what if this hole had never been played"
rather than "what was this hole worth" — and with skins carry-over those differ.
Press would be displaying a quietly wrong number. Dropping the swing line
entirely was also considered; it is the most emotionally direct part of the
feature and worth the constraint.

**Ticker order — fixed, not sorted.** Sorting always reads as standings, but
stroke play and Stableford move on partial holes, so every stepper tap can
re-sort the line while you are pressing the button underneath it. Re-sorting only
at hole boundaries was a genuine near-miss — it holds still during the taps that
matter — but fixed order maps 1:1 to the steppers below and needs no extra state.
Sorted standings remain the Board tab's job.

**Game cards — auto-collapse, not manual.** Leaving them expanded keeps the Wolf
pairing and live Nassau status permanently visible, which some scorekeepers will
prefer, but it leaves the Hole tab ~80px over budget and the one-screen criterion
fails. A manual toggle defaulting to expanded has the same problem: the default
experience stays the over-budget one until the user opts in.

## Testing

- **`src/games/money.test.ts`** (new) covers `lastCompletedHole` and `holeSwing`:
  the most-recent-hole guard, a hole with no money movement, a skins carry-over
  hole, and a zero-sum assertion on every swing (the deltas must sum to 0 within
  a cent, same invariant the settlement suite already enforces).
- **`StakesEditor`** is a pure extraction with no logic change; the existing
  `settlement.test.ts` suite covers the math it feeds.
- **Layout and contrast claims are re-measured, not eyeballed** — the same
  viewport and contrast probes used to find the defects, re-run against the
  acceptance criterion above.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass;
  CI runs them on the PR.

## File manifest

**New**

- `src/games/money.ts`, `src/games/money.test.ts`
- `src/components/StakesEditor.tsx`
- `src/components/MoneyTicker.tsx`
- `src/components/MoneyBoard.tsx`
- `src/screens/HoleView.tsx`

**Modified**

- `src/screens/Play.tsx` — three-tab shell, ticker, hole body extracted out
- `src/screens/Setup.tsx` — Money card
- `src/components/Settlement.tsx` — consume `StakesEditor`
- `src/components/WolfControls.tsx`, `src/components/NassauControls.tsx` —
  collapsed state once answered
- `src/components/Scorecard.tsx` — keyboard path on jump cells
- `src/App.tsx` — history handling
- `src/index.css` — sticky `.play-foot`, `--gold-ink`, single-row progress strip,
  ticker and money-board styles
- `README.md`, `CHANGELOG.md` — handicap correction, plus a CHANGELOG entry for
  this work
