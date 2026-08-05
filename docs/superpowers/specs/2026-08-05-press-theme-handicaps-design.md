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

Both are shown only when `round.options.useNet` — in a gross round the number is
inert and would be noise.

**Out of scope, by decision:** hole steppers keep their current league-only
badge, and Home round cards stay unchanged.

### E. Mid-round corrections

**Edit handicaps sheet.** A pencil in Play's toolbar and Results' header opens a
sheet listing every player with an editable handicap. Two rules carry the risk:

- Saving **recomputes `options.useNet`** using Setup's rule
  (`Setup.tsx:160` — any handicap > 0). Without this, adding a handicap to a
  round that started gross would write the value and change nothing visible,
  because every net code path is gated on `useNet`.
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

## Files

| File | Change |
|---|---|
| `src/theme.ts` | New. Replaces `src/sunlight.ts` (deleted). |
| `src/storage.ts` | `Settings` gains `theme`; `sunlight` → `glare` with read migration. |
| `src/games/roundEdits.ts` | New. Handicap application + `useNet` recompute. |
| `src/games/roundEdits.test.ts` | New. |
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
  round; on→off when the last handicap is cleared; league validation rejects a
  blank; existing scores untouched by a handicap edit.
- Settings migration: legacy `{ sunlight: true }` reads as `glare: true`.
- Score clamping: 0 and 16 reject, empty clears, 1 and 15 accept.
- The existing `src/games/*.test.ts` suite must stay green — no game logic
  changes, so any failure means a regression.

## Acceptance

1. All six Appearance × Glare combinations screenshotted at 375×812 and visually
   verified: System/Light/Dark each with Glare off, and Glare on overriding each.
2. With Glare on, the Appearance control is visibly dimmed and states the
   override.
3. Changing the phone's appearance while set to System repaints without a reload.
4. Light mode contours are visible at arm's length and read green.
5. A handicap edited mid-round changes the leaderboards and the money on the next
   render, with no reload.
6. Editing a handicap in a round that started gross switches it to net scoring.
7. A score typed into a scorecard cell persists across a tab switch and app
   reload.
8. `npm test`, `tsc --noEmit`, and `npm run build` all clean.
