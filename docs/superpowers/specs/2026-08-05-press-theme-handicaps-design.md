# Theme Control, Visible Handicaps, and Mid-Round Corrections

_Design spec — 2026-08-05_

## Problem

Three reports from the course, one of which turns out to be a naming defect
rather than a styling one.

**1. Handicaps are invisible where you look them up.** `Player.handicap` is
entered at setup and drives every net calculation, but it renders in exactly one
place: `components/HoleStepper.tsx:73`, gated on `round.options.league`. A
non-league net round shows only `.hcp-dots` — bullets marking which holes get a
stroke — with no number anywhere. The scorecard (`components/Scorecard.tsx`) and
every leaderboard (`components/Leaderboard.tsx`) omit it entirely. To answer
"what's Mike playing off?" mid-round you have to remember what you typed at
setup.

**2. There is no theme control, and the one toggle that exists is mislabeled.**
Dark mode is reachable only by changing the phone's system appearance —
`index.css` expresses it as seven separate `@media (prefers-color-scheme: dark)`
blocks (lines 43, 198, 256, 473, 530, 567, 946). The only in-app control is the
Sunlight button (`screens/Play.tsx:184`), which is a **contrast override**, not a
theme: it forces the light palette at maximum contrast and disables the
background texture. It carries a sun icon, which in every other app means "light
mode." So the one visible control looks like a theme switch, isn't one, and is
absent from the menu screens entirely.

**3. Light mode reads as plain white.** Two distinct causes, previously
conflated:

- **Sunlight mode** sets `--topo: none` and `--bg: #ffffff` (`index.css:64,70`).
  Genuinely plain white — by design, for glare.
- **System light mode** does have contours, but at `rgba(16,35,27,0.05)` — a
  near-black line at 5% on `#eef3ee`. Dark mode's equivalent is a *white* line at
  4.5% on `#0a1511`, which reads far stronger against its background. Light
  mode's texture is present and perceptually invisible.

**4. Nothing can be corrected mid-round without walking back to it.** A mistyped
handicap is unreachable after setup — `Setup.tsx:278` is the only input bound to
it, and Setup is never revisited. A mistyped score is reachable but slow: tap the
scorecard cell to jump to the hole, then tap `+`/`−` up to fourteen times.

## Design

### A. Two named controls replacing one overloaded boolean

The confusion is structural: one sun icon and one `sunlight` boolean serve two
unrelated purposes. Split them.

**Appearance** — `System / Light / Dark`, a segmented control. New `theme`
setting. This is the aesthetic choice.

**Glare mode** — renamed from Sunlight, with a contrast icon (half-filled
circle) rather than a sun. Labeled "Max contrast for direct sun." This is a
readability tool, and naming it as one is what makes plain white defensible
rather than boring.

Glare overrides Appearance while it is on. That override is stated in the UI, not
inferred: **the Appearance control dims and displays "Glare mode is overriding
this — tap to turn off."** This is the single most important element of the
change. Without it, a user who picks Dark while Glare is on sees nothing happen
and has no way to find out why.

**Placement.** One `SettingsSheet` holds Appearance, Glare, and Keep screen awake
(which is a setting living in a toolbar today). It opens from a gear on Home,
Setup, and League Setup — Setup and League Setup already carry an empty
`<span />` in the right slot of their header bar (`Setup.tsx:231`,
`LeagueSetup.tsx:166`), which the gear fills exactly. Play keeps its existing
fast-access eye and glare icons — those are one-tap for a reason on the course —
and gains the gear as a third button in the same row.

**Results is deliberately excluded.** Its bar is full (`‹ Scorecard` / Results /
Home) and it is a terminal screen, not a menu screen; Settings is one tap away
via Home. Results still gets the pencil, as a ghost button beside the existing
share actions — correcting a handicap after signing the card is a real need.

### B. Theme resolution moves from CSS to JS

Seven `@media (prefers-color-scheme: dark)` blocks cannot express "the user chose
Dark on a light phone." Rather than duplicate each block, resolve the theme once
in JS and express the result as a single class.

`src/theme.ts` (absorbing and replacing `src/sunlight.ts`):

```ts
export type Theme = 'system' | 'light' | 'dark';
export const applyTheme = (theme: Theme, glare: boolean): void => { ... };
export const watchSystemTheme = (): void => { ... };
```

Resolution rules, in order:

1. Glare on → add `.glare`, never add `.dark`, `color-scheme: light`.
2. Otherwise resolved = `theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme`.
3. Toggle `.dark` on `<html>` accordingly; set `color-scheme` to match so native
   controls and scrollbars follow.

`watchSystemTheme` registers a `matchMedia` change listener and re-applies from
module-level current settings, so a system appearance change repaints live while
Appearance is on System. It stays registered even when Glare is on, so turning
Glare off lands on the correct theme.

**Because JS guarantees `.dark` and `.glare` are never both set, the seven CSS
blocks reduce to a mechanical rewrite** — `@media (prefers-color-scheme: dark) {
:root:not(.sunlight) X }` becomes `:root.dark X`, and `:root.sunlight` becomes
`:root.glare`. No `prefers-color-scheme` remains in `index.css`.

`main.tsx` applies the theme before first render, as it already does for
sunlight, so there is no flash.

### C. Light-mode texture

The contour stroke changes from `rgba(16,35,27,0.05)` (near-black) to
`rgba(20,105,78,0.11)` — `--green-700` at 11%. This makes the texture legible
*and* actually green, matching the brand rather than reading as grey noise.

**`--bg` is deliberately left at `#eef3ee`.** Darkening the background to make
contours read would reduce contrast for `--muted` text (`.hint`, `.tagline`,
`.round-sub`) that sits directly on it. Changing only the stroke color carries
zero contrast risk, since the topo is decorative and no text sits on it.

Glare mode keeps `--topo: none` and `#ffffff`. Once it is labeled as a sun tool
rather than "light mode," texture-free white is the correct answer for it, and
everyday light mode becomes the branded one.

### D. Handicaps on the scorecard and leaderboards

**Scorecard.** Rendered as a badge inside the existing player-name cell
(`SMITH  HCP 8`), not as a separate column. `.sc-name` is
`position: sticky; left: 0` with `min-width: 62px` but no fixed width — a second
sticky column would need an exact `left` offset that long names break. Putting
the badge inside the sticky cell keeps the handicap visible while the grid
scrolls horizontally, with no offset math. It reuses the `.stepper-hcp` visual
treatment and its `aria-label={\`Handicap ${n}\`}` pattern.

**Leaderboards.** `Leaderboard.tsx` gains an optional
`hcpOf?: (playerId: string) => number | undefined` prop, mirroring the existing
`colorOf`, rendering a badge after `.board-name-text`. Play and Results share
this component, so one change covers the Board tab and the final results.

**Hole steppers.** The existing badge (`HoleStepper.tsx:73`) is extended from
league-only to every round that uses handicaps, so the number appears on the
screen you score from, not just the ones you look things up on.

**Visibility gate.** All three read from one helper rather than testing
`useNet` directly:

```ts
export const usesHandicaps = (round: Round): boolean =>
  round.options.useNet || round.options.league != null;
```

This is not a stylistic preference. **League rounds have `useNet === false`** —
`LeagueSetup.tsx:141` spreads `DEFAULT_OPTIONS` and never sets it, because
`computeLeague` reads `player.handicap` directly rather than consulting the flag.
Gating on `useNet` alone would therefore *remove* the badge from league rounds,
which are the only rounds that show it today and the only ones where a handicap
is mandatory. The helper lives in `src/games/handicap.ts` next to the other
handicap predicates.

In a gross round with no handicaps anywhere, all three stay hidden — the number
would be inert.

**Out of scope, by decision:** Home round cards stay unchanged. Separately, league
rounds also render no stroke dots (`HoleView.tsx:104`, `Scorecard.tsx:80` both
gate on `useNet`); that is pre-existing behavior, is not a regression introduced
here, and is left alone.

### E. Mid-round corrections

**Edit handicaps sheet.** A pencil in Play's toolbar and Results' header opens a
sheet listing every player with an editable handicap. Two rules carry the risk:

- Saving **recomputes `options.useNet`** using Setup's rule
  (`Setup.tsx:160` — any handicap > 0). Without this, adding a handicap to a
  round that started gross would write the value and change nothing visible,
  because every net code path is gated on `useNet`.
- **League rounds are exempt from that recompute.** They ship `useNet: false` by
  construction and score net regardless; flipping it true would switch on stroke
  dots that league rounds have never shown, which is a behavior change this work
  has no mandate to make. League rounds keep `useNet` exactly as found.
- League rounds require a handicap for all four players
  (`LeagueSetup.tsx:116`). Blanking one is blocked at save with an inline error
  rather than silently breaking league scoring.

Recomputation is free: every game in `src/games/` is a pure function of `Round`,
so edited handicaps propagate to all leaderboards and money on the next render.
No migration, no stored derived state.

This logic lives in `src/games/roundEdits.ts` — not in the component — so it is
unit-testable independently of the sheet.

**Direct score entry.** A scorecard cell becomes a `<button>` that swaps to
`<input type="number" inputMode="numeric">` on tap, committing on Enter or blur
and cancelling on Escape. Values clamp to 1–15, matching `HoleStepper.tsx:65-66`;
an empty input commits `null`, clearing the score.

Play currently exposes `setScore(playerId, value)` bound to the *current* hole
(`Play.tsx:75`). The scorecard needs a hole-explicit variant, `setScoreAt(holeNumber,
playerId, value)`, with `setScore` reduced to a call through it.

**Tradeoff, accepted:** cell-tap currently jumps to that hole
(`Scorecard.tsx:87`) and direct entry takes that gesture. The hole-number header
row already jumps and is keyboard-accessible (`Scorecard.tsx:20-33`), so it
becomes the sole jump control. This is a deliberate change to established muscle
memory, made because correcting a typo is the more common need and currently
costs up to fifteen taps.

### F. Per-match stroke chips for league rounds

League rounds show no stroke indicator on the Hole tab, so mid-hole you cannot
see who is stroking. The obvious fix — routing the existing dots through
`usesHandicaps` — is **wrong**, and this section exists to record why.

League strokes are relative and computed per match, off three baselines
(`league.ts:63,88`): the A match plays off the low of the two A players, the B
match off the low of the two B players, and the Team match off the low of all
four. A player therefore receives different strokes in different matches at the
same time. For Team 1 (10, 14) v Team 2 (6, 8):

| Player | B match | Team match | Full-handicap dots |
|---|---|---|---|
| 14 hcp | 6 | 8 | 14 |
| 8 hcp | 0 | 2 | 8 |

`.hcp-dots` renders `strokesReceivedOnHole(p.handicap, …)` — the third column.
For the 14-handicap that is strokes on 14 holes where six are actually received.
So the omission is correct, not a defect, and `LeagueBoard` already reports the
truth per match (`LeagueBoard.tsx:43`).

**The fix is per-match chips.** Under each player's name, one chip per match in
which they receive a stroke *on this hole*: `A`, `B`, or `T`. In a four-player
league every player is in exactly two matches (their singles and the team), so a
player shows at most two chips. `capHcp` bounds league allocation to one stroke
per hole (`league.ts:29`), so chips are binary — no counts needed.

**Shared baselines, enforced by an invariant test.** A new
`leagueStrokesOnHole(round, hole)` export must not recompute the baselines
independently of `computeLeague` — two copies of `min(hcp…)` logic would drift
the display away from the scoring. Both consume one internal
`leagueBaselines(round)` helper returning the capped effective handicaps.

The drift guard is a test, not a convention: **for every player and match,
`leagueStrokesOnHole` summed across all holes must equal that player's total in
`computeLeague().matches[].strokes`.** If the two ever disagree, that test fails.

**Chip contrast.** `.hcp-dots` uses `--gold`, which was invisible in the light
theme until `bbaca25` remapped it. Chips follow the same rule — `--gold-ink` in
light and Glare, `--gold` in dark — rather than reintroducing the bug in a new
element.

**Component boundary.** `HoleStepper` stays league-agnostic: it takes
`matchStrokes?: string[]` (e.g. `['A', 'T']`) and renders chips. `HoleView`
computes them. `HoleStepper` does not import `league.ts`.

**The scorecard is unchanged.** Per-match chips do not fit a grid cell, and a
single merged dot would reintroduce exactly the ambiguity this section rejects.
League stroke detail stays on the Hole tab and the Board.

## Files

| File | Change |
|---|---|
| `src/theme.ts` | New. Replaces `src/sunlight.ts` (deleted). |
| `src/storage.ts` | `Settings` gains `theme`; `sunlight` → `glare` with read migration. |
| `src/games/roundEdits.ts` | New. Handicap application + `useNet` recompute. |
| `src/games/roundEdits.test.ts` | New. |
| `src/games/handicap.ts` | Add `usesHandicaps(round)` predicate. |
| `src/components/HoleStepper.tsx` | Badge shown for every handicap round; `matchStrokes` chips. |
| `src/screens/HoleView.tsx` | Pass `handicap` via `usesHandicaps`; compute league chips. |
| `src/games/league.ts` | Extract `leagueBaselines`; add `leagueStrokesOnHole`. |
| `src/games/league.test.ts` | Add the chips/`computeLeague` drift invariant. |
| `src/components/SettingsSheet.tsx` | New. Appearance + Glare + Keep awake. |
| `src/components/EditHandicaps.tsx` | New. |
| `src/components/Scorecard.tsx` | HCP badge; editable cells; jump moves to header row. |
| `src/components/Leaderboard.tsx` | `hcpOf` prop. |
| `src/screens/Play.tsx` | Gear + pencil; `setScoreAt`; pass `hcpOf`. |
| `src/screens/Home.tsx` | Gear in hero. |
| `src/screens/Setup.tsx` | Gear in bar. |
| `src/screens/LeagueSetup.tsx` | Gear in bar. |
| `src/screens/Results.tsx` | Pencil beside share actions; pass `hcpOf`. |
| `src/icons.tsx` | `ContrastIcon`, `GearIcon`, `PencilIcon`. `SunIcon` retired. |
| `src/index.css` | Theme class rewrite; topo stroke; sheet, badge, cell-input styles. |
| `src/main.tsx` | `applyTheme` + `watchSystemTheme` at boot. |

## Settings migration

`getSettings()` merges over `DEFAULT_SETTINGS`, so a stored `{ sunlight: true }`
would silently become `glare: false` — losing the user's setting. Migration is
explicit: when the parsed blob has `sunlight` and no `glare`, carry the value
across. `saveSettings` writes only known keys so the legacy field is dropped on
the next write rather than persisting forever.

## Testing

- `roundEdits.test.ts`: `useNet` off→on when a handicap is added to a gross
  round; on→off when the last handicap is cleared; **a league round keeps
  `useNet: false` through a handicap edit**; league validation rejects a blank;
  existing scores untouched by a handicap edit.
- `handicap.test.ts`: `usesHandicaps` is true for a league round despite
  `useNet: false`, true for a net round, false for a gross round. This is the
  guard against silently dropping the badge from league rounds.
- Settings migration: legacy `{ sunlight: true }` reads as `glare: true`.
- Score clamping: 0 and 16 reject, empty clears, 1 and 15 accept.
- `league.test.ts`: the drift invariant above — `leagueStrokesOnHole` summed over
  every hole equals each player's per-match total from `computeLeague`. Plus the
  worked example (10/14 v 6/8): the 14-handicap gets 6 chips in the B match and
  8 in the Team match across nine holes, never 14.
- The existing `src/games/*.test.ts` suite must stay green. `league.ts` is the
  one file here with real logic changes (the `leagueBaselines` extraction), so
  its existing tests are the regression gate for that refactor — they must pass
  untouched.

## Acceptance

1. All six Appearance × Glare combinations screenshotted at 375×812 and visually
   verified: System/Light/Dark each with Glare off, and Glare on overriding each.
2. With Glare on, the Appearance control is visibly dimmed and states the
   override.
3. Changing the phone's appearance while set to System repaints without a reload.
4. Light mode contours are visible at arm's length and read green.
5. A league round still shows every handicap badge — steppers and scorecard —
   after the change, despite carrying `useNet: false`. `LeagueBoard` is exempt:
   it deliberately never received `hcpOf` (see "Per-match stroke chips for
   league rounds" above) because it already shows per-match stroke
   allocations, which is better information there, and a course-handicap
   badge would duplicate the Hole tab.
6. A handicap edited mid-round changes the leaderboards and the money on the next
   render, with no reload.
7. Editing a handicap in a round that started gross switches it to net scoring.
8. A score typed into a scorecard cell persists across a tab switch and app
   reload. **Also verified on a real device 2026-08-06:** typing a score and
   then tapping away *without* pressing Enter commits it. This path could not be
   confirmed during implementation — the automation browser runs with
   `document.hasFocus() === false`, so Chrome suppresses the `blur`/`focusout`
   event the commit handler depends on. The handler was proven correct when
   handed the event; hardware confirmed the event actually fires on tap-away.
9. In a league round, a player stroking in the Team match but not their singles
   shows exactly one chip (`T`), and the chip set on each hole matches what the
   Board reports for that match.
10. Chips are legible in all three themes and in Glare mode — the `--gold`
    regression from `bbaca25` does not return in a new element.
11. `npm test`, `npm run typecheck`, and `npm run build` all clean. (`typecheck`
    is `tsc -b --noEmit`; plain `tsc --noEmit` against this repo's
    solution-style root config compiles zero files and always passes.)

### Still unverified on hardware

Criteria 3 and the safe-area fix below need a device this work had no access to:

- **#3, live system-appearance repaint.** Covered by five `theme.test.ts` unit
  tests whose falsification was checked, but the automation browser updates
  `matchMedia().matches` without firing `change` to registered listeners.
- **The Home gear's safe-area position.** `.hero-settings` double-counted
  `env(safe-area-inset-top)` and was corrected; the bug only manifests on a
  notched screen, where the inset is non-zero. At 375×812 the inset is 0, so
  neither the defect nor its fix is observable.
