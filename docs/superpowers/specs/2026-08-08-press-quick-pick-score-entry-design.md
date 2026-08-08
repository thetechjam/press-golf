# Quick-pick score entry on the Hole tab

_Design — 2026-08-08_

## Problem

Entering a score on the Hole tab costs one tap per stroke away from par.
`HoleStepper`'s `dec`/`inc` set par on the first tap from empty, then move by
±1. So a hole where four players make par, two bogeys and a double costs eight
taps; a rough hole (triple, double, bogey, par) costs ten.

Scores arrive unpredictably — sometimes all at once on the green, sometimes
trickled in as each player holes out. Any design that optimises for one burst
and punishes the trickle is wrong. Every player stays on screen; each row has
to be fast on its own.

There is also a live dead end: `dec()` floors at 1, so once a score is set on
the Hole tab there is no way to unset it. Clearing requires switching to the
Card tab and emptying the cell.

## Solution

Replace the `−` / `+` pair on each player row with a row of tappable score
chips centred on par. One tap sets any score in the common range.

```
┌─────────────────────────────────────────┐
│ (J) Jesse   HCP 12              4  PAR  │
│  ┌────┬────┬────┬────┬────┬────┐        │
│  │ 3  │ 4  │ 5  │ 6  │ 7  │ …  │        │
│  └────┴────┴────┴────┴────┴────┘        │
└─────────────────────────────────────────┘
```

The score readout stays on the name row as **display only** — it is not a
control and must not be styled as one.

### Chip range

`par−1 … par+3`, clamped at 1. Always five chips, plus an overflow chip.

| Par | Chips |
|---|---|
| 3 | 2 3 4 5 6 |
| 4 | 3 4 5 6 7 |
| 5 | 4 5 6 7 8 |
| 6 | 5 6 7 8 9 |

Six targets at 375px viewport width measure **50px each**, above the 44px touch
minimum.

**Why not include par−2 (eagle).** Seven targets measure 42.3px, below the
minimum. One of three things has to give: the eagle, four pixels, or the
explicit overflow affordance. A triple bogey is far more common than an eagle,
so the eagle goes to overflow. Accepted consequence: a hole-in-one on a par 3
also routes through overflow (~1 in 12,500 rounds for an amateur).

### Interaction

- **Tap an unselected chip** — sets that score. Routes through `HoleStepper`'s
  existing `commit()`, so the birdie haptic, the celebrate glow, and
  `scoreMarkClass` colouring are unchanged.
- **Tap the selected chip** — clears the score to `null`. Load-bearing:
  `null` vs entered drives `missing`, `incompleteHoles`, `firstIncompleteHole`,
  the warn banners, and the auto-jump to the first blank. Also closes the dead
  end described above.
- **Tap `…`** — expands the row in place into a compact 1–15 grid; tap a value
  to pick; auto-collapses.

**Why the overflow is not the Card tab's `<input>`.** Type-it-in was rejected
as the primary path partly because the OS keyboard covers half a sunlit
screen. Shipping that keyboard for the overflow would be incoherent. In-place
expansion keeps one tap vocabulary everywhere.

### Removed

The `−` / `+` buttons, **on the Hole tab only**. The Card tab keeps
`clampScore` and its input exactly as-is.

### Untouched

Everything on the name row: avatar, HCP badge, handicap-stroke dots, league
`A`/`B`/`T` match chips, and the `highlight` flash on auto-jump.

### Accessibility

The chip row is a `radiogroup` labelled per player ("Jesse's score, par 4");
each chip is a `radio` with `aria-checked`. Chip labels carry meaning, not just
digits — "5, bogey". The overflow is a plain button with `aria-expanded`.
Screen-reader users lose the `+`/`−` verbs, so the labels have to do that work.

## Architecture

Nothing in `src/games/` changes. No `types.ts`, no `storage.ts`, no change to
the `Round` shape. This is a pure presentation swap.

| File | Change |
|---|---|
| `src/scoreChips.ts` | **New.** Pure: `chipRange(par)`, `nextValue(current, tapped)`, overflow bounds. Sits alongside `scoreEntry.ts` and `scoreMark.ts` — the existing precedent for small pure modules at the `src` root. |
| `src/components/ScoreChips.tsx` | **New.** Presentational. Props: `par`, `value`, `onChange`, aria label. Owns only overflow expand/collapse state. ~80 lines. |
| `src/components/HoleStepper.tsx` | **Modified + renamed** to `PlayerScoreRow.tsx`. Drops `dec`/`inc` and the `.stepper-controls` block; renders `<ScoreChips>`. Keeps `commit()` and passes it down. |
| `src/screens/Play.tsx` | DOM id prefix `stepper-` → `player-row-`, which the auto-jump `getElementById` at ~L73 reads. |
| `src/screens/HoleView.tsx` | Import and element rename. |
| `src/index.css` | Adds `.score-chips` / `.score-chip`; retires `.step-btn` and `.stepper-controls`. |

**On the rename.** Once `+`/`−` are gone, a component named `HoleStepper`
containing no stepper is a lie this change introduces, so the component, file,
and DOM id prefix are renamed. The `.stepper*` **CSS class names are left
alone** — renaming them is a wide, high-noise diff for low signal, and
`.stepper` reads acceptably as "the per-player score row." This is a deliberate
half-measure.

### Data flow

Unchanged:

```
ScoreChips.onChange → commit() → HoleView.onScore → Play.setScore
  → setScoreAt → App.update → saveRound
```

Same path as today, different trigger widget.

### Error handling

No new path. Chips emit only values from a pre-validated range; the overflow
grid emits only 1–15. Unlike the Card tab — which needs `clampScore` because it
accepts free text — there is no invalid input to defend against.

## Testing

The project has no component tests: every existing test file is a pure module
(`games/*`, `storage`, `feedback`, `scoreEntry`, `scorecardModel`, `theme`).
There is no `jsdom` and no `@testing-library`. The established idiom is visible
in the git log — *"Extract the scorecard grid into a testable model."*

This design follows that idiom and does **not** introduce a component-testing
stack. That is a separate decision, not a rider on a UI change.

### `src/scoreChips.test.ts`

- `chipRange(par)` — par 3/4/5/6 produce the table above; always length 5;
  clamps at 1 so no chip is ever 0 or negative.
- `nextValue(current, tapped)` — returns `null` when equal (clear-on-retap),
  otherwise `tapped`. Tested directly because it carries the `null` semantic
  every guardrail depends on.

`ScoreChips.tsx` is then wiring with nothing to assert that `tsc` doesn't
already catch.

### Verified by hand in the browser

- 375px fit with 4 and 5 players
- 50px targets on a real phone, not a desktop viewport
- Dark mode and glare mode — chips must survive `:root.glare`'s texture-free
  max-contrast palette
- Landscape (shipped 2026-08-07); chips get wider there
- Reduced motion, since `commit()` fires the celebrate animation
- **Guardrail regression**: set a score, re-tap to clear, confirm the warn
  banner and auto-jump-to-first-blank still fire. That path has no test
  coverage and is exactly what the clear semantic touches.

`npm run test`, `npm run typecheck`, and `npm run lint` green before done.

## Out of scope

Recorded here because they surfaced during the analysis and are worth their own
specs, not because they belong in this change:

- Setup friction — no player roster, no "repeat last round" from Home
- Cross-round history and season stats (computable from `localStorage` today,
  no backend)
- **Handicap allowance — confirmed as a bug, spec'd next (decided 2026-08-08).**
  `handicap.ts` allocates off each player's full handicap; match play and
  Nassau conventionally play off the **low** handicap (differences only), and
  four-ball applies an 85–90% allowance. This changes hole-by-hole outcomes
  and therefore settlement: a 20 vs a 4 gets different results on the
  stroke-index 3 hole depending on the convention. It gets its own spec
  immediately after this change ships, before further games are built on top
  of the current behaviour.
- Play toolbar density — six targets in one strip
- Auto-press Nassau; additional games (Junk/Dots, Bingo Bango Bongo, Vegas,
  Snake, Quota)
