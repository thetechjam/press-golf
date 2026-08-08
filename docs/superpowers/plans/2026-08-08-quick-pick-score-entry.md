# Quick-Pick Score Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `−`/`+` stepper on Press's Hole tab with a row of score chips centred on par, so any common score is one tap.

**Architecture:** All logic goes into a new pure module `src/scoreChips.ts`, tested with vitest. A new presentational `ScoreChips` component renders the row. `HoleStepper` loses its `−`/`+` controls, keeps its `commit()` (haptics + celebrate), and is renamed `PlayerScoreRow`. Nothing in `src/games/`, `types.ts`, or `storage.ts` changes — the `Round` shape and the whole scoring engine are untouched.

**Tech Stack:** Vite 8, React 19, TypeScript 6, vitest 4, oxlint. Plain CSS in a single `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-08-08-press-quick-pick-score-entry-design.md`

## Global Constraints

- **No new dependencies.** Not for testing, not for UI. `package.json` deps must be unchanged.
- **No component tests.** This project has none, no `jsdom`, no `@testing-library`. Logic goes in pure modules and is tested there; components are verified in the browser. Do not introduce a component-testing stack.
- **Nothing under `src/games/` may change.** Same for `src/types.ts` and `src/storage.ts`.
- **Chip range is `par−1 … par+3`**, always five chips, floored at 1.
- **Touch targets: 44px minimum.** Inline chips target 46px height.
- **Commit messages:** sentence-case imperative, matching the existing log ("Extract the scorecard grid into a testable model"). Not conventional-commits. End every commit body with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branch:** `quick-pick-score-entry`, already created and holding the spec.
- Run `npm run test`, `npm run typecheck`, and `npm run lint` before the final commit of each task.

## File Structure

| File | Responsibility |
|---|---|
| `src/scoreChips.ts` | **New.** Pure: which chips a par produces, what a tap resolves to, the overflow range. No React. |
| `src/scoreChips.test.ts` | **New.** Unit tests for the above. |
| `src/scoreMark.ts` | **Modify.** Gains `scoreLabel(toPar)`, moved out of `HoleStepper` so both components can use it for accessible labels. |
| `src/scoreMark.test.ts` | **New.** Tests for `scoreLabel`. This module has no test file today. |
| `src/components/ScoreChips.tsx` | **New.** Renders the chip row and the overflow grid. Owns only expand/collapse state. |
| `src/components/HoleStepper.tsx` → `PlayerScoreRow.tsx` | **Modify + rename.** Drops `−`/`+`, renders `ScoreChips`, keeps `commit()`. |
| `src/screens/HoleView.tsx` | **Modify.** Import and element rename; `id` prop value. |
| `src/screens/Play.tsx` | **Modify.** `getElementById` prefix `stepper-` → `player-row-`. |
| `src/index.css` | **Modify.** `.stepper` becomes a column; `.stepper-value` moves inline; adds `.score-chips`, `.score-chip`, `.score-overflow`; retires `.stepper-controls` and `.step-btn`. |
| `CHANGELOG.md` | **Modify.** Entry under `## [Unreleased] → ### Changed`. |

---

### Task 1: Pure chip logic

**Files:**
- Create: `src/scoreChips.ts`
- Create: `src/scoreChips.test.ts`
- Modify: `src/scoreMark.ts`
- Create: `src/scoreMark.test.ts`
- Modify: `src/components/HoleStepper.tsx` (remove the local `labelFor`, import `scoreLabel`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `chipRange(par: number): number[]` — always 5 entries
  - `nextValue(current: number | null, tapped: number): number | null`
  - `overflowRange(): number[]` — 15 entries, 1..15
  - `SCORE_MIN: 1`, `SCORE_MAX: 15`
  - `scoreLabel(toPar: number): string` from `src/scoreMark.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scoreChips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chipRange, nextValue, overflowRange, SCORE_MAX, SCORE_MIN } from './scoreChips';

describe('chipRange', () => {
  it('centres on par for a par 4', () => {
    expect(chipRange(4)).toEqual([3, 4, 5, 6, 7]);
  });

  it('centres on par for a par 3', () => {
    expect(chipRange(3)).toEqual([2, 3, 4, 5, 6]);
  });

  it('centres on par for a par 5', () => {
    expect(chipRange(5)).toEqual([4, 5, 6, 7, 8]);
  });

  it('centres on par for a par 6', () => {
    expect(chipRange(6)).toEqual([5, 6, 7, 8, 9]);
  });

  it('always returns five chips, so the row never reflows between holes', () => {
    for (const par of [2, 3, 4, 5, 6]) {
      expect(chipRange(par)).toHaveLength(5);
    }
  });

  it('never offers a score below 1', () => {
    expect(chipRange(2)[0]).toBe(SCORE_MIN);
    expect(Math.min(...chipRange(2))).toBeGreaterThanOrEqual(SCORE_MIN);
  });
});

describe('nextValue', () => {
  it('sets the tapped score when nothing is entered', () => {
    expect(nextValue(null, 5)).toBe(5);
  });

  it('replaces a different score', () => {
    expect(nextValue(4, 6)).toBe(6);
  });

  it('clears when the selected chip is tapped again', () => {
    // null is load-bearing: it drives every unentered-score guardrail.
    expect(nextValue(5, 5)).toBeNull();
  });
});

describe('overflowRange', () => {
  it('offers every legal score', () => {
    expect(overflowRange()).toHaveLength(SCORE_MAX - SCORE_MIN + 1);
    expect(overflowRange()[0]).toBe(1);
    expect(overflowRange().at(-1)).toBe(15);
  });
});
```

Create `src/scoreMark.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreLabel, scoreMarkClass } from './scoreMark';

describe('scoreLabel', () => {
  it('names the good ones', () => {
    expect(scoreLabel(-3)).toBe('Albatross');
    expect(scoreLabel(-2)).toBe('Eagle');
    expect(scoreLabel(-1)).toBe('Birdie');
  });

  it('names par and the bad ones', () => {
    expect(scoreLabel(0)).toBe('Par');
    expect(scoreLabel(1)).toBe('Bogey');
    expect(scoreLabel(2)).toBe('Double');
  });

  it('falls back to a signed number past double bogey', () => {
    expect(scoreLabel(3)).toBe('+3');
    expect(scoreLabel(7)).toBe('+7');
  });

  it('treats anything better than an albatross as an albatross', () => {
    expect(scoreLabel(-4)).toBe('Albatross');
  });
});

describe('scoreMarkClass', () => {
  it('leaves par unmarked', () => {
    expect(scoreMarkClass(0)).toBe('');
  });

  it('circles under par and squares over', () => {
    expect(scoreMarkClass(-1)).toBe('mark mark-circle');
    expect(scoreMarkClass(1)).toBe('mark mark-square');
  });

  it('doubles the ring at two or more either way', () => {
    expect(scoreMarkClass(-2)).toBe('mark mark-circle mark-double');
    expect(scoreMarkClass(2)).toBe('mark mark-square mark-double');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/scoreChips.test.ts src/scoreMark.test.ts
```

Expected: FAIL — `Failed to resolve import "./scoreChips"`, and `scoreLabel is not exported`.

- [ ] **Step 3: Write `src/scoreChips.ts`**

```ts
/**
 * The Hole tab's quick-pick score chips: the common range around par, one tap
 * each. Pure so the range and clear-on-retap rules are testable without a DOM.
 */

/** Lowest and highest score the overflow grid offers. Matches `clampScore`. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 15;

/** How far below and above par the inline chips reach. */
const BELOW_PAR = 1;
const ABOVE_PAR = 3;

/**
 * Inline chip values for a hole: par−1 … par+3, floored at SCORE_MIN.
 *
 * Always the same length, so the row can't reflow when you move between a par
 * 3 and a par 5 — a chip that shifts under your thumb mid-round is worse than
 * one that's occasionally further from par than the label suggests.
 */
export function chipRange(par: number): number[] {
  const start = Math.max(SCORE_MIN, par - BELOW_PAR);
  return Array.from({ length: BELOW_PAR + ABOVE_PAR + 1 }, (_, i) => start + i);
}

/**
 * What a chip tap resolves to. Tapping the already-selected chip clears the
 * score back to null — load-bearing, because null vs entered is what drives
 * `missing`, `incompleteHoles`, `firstIncompleteHole`, the warn banners and
 * the auto-jump to the first blank score.
 */
export function nextValue(current: number | null, tapped: number): number | null {
  return current === tapped ? null : tapped;
}

/** Every legal score, for the overflow grid behind the "…" chip. */
export function overflowRange(): number[] {
  return Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);
}
```

- [ ] **Step 4: Move `labelFor` into `src/scoreMark.ts` as `scoreLabel`**

Append to `src/scoreMark.ts`:

```ts
/**
 * A score's name relative to par, e.g. "Birdie". Shared by the score readout
 * and the chips' accessible labels — a chip that announces only "5" tells a
 * screen-reader user nothing about whether that's good.
 */
export function scoreLabel(toPar: number): string {
  if (toPar <= -3) return 'Albatross';
  if (toPar === -2) return 'Eagle';
  if (toPar === -1) return 'Birdie';
  if (toPar === 0) return 'Par';
  if (toPar === 1) return 'Bogey';
  if (toPar === 2) return 'Double';
  return `+${toPar}`;
}
```

Then in `src/components/HoleStepper.tsx`, delete the local `labelFor` function (lines 23–31) and change the import line to:

```ts
import { scoreLabel, scoreMarkClass } from '../scoreMark';
```

and the one usage at the bottom of the component from `labelFor(toPar)` to `scoreLabel(toPar)`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/scoreChips.test.ts src/scoreMark.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 6: Full check and commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/scoreChips.ts src/scoreChips.test.ts src/scoreMark.ts src/scoreMark.test.ts src/components/HoleStepper.tsx
git commit -m "$(cat <<'EOF'
Extract the score-chip range into a testable model

chipRange, nextValue and overflowRange are pure, so the clear-on-retap rule
and the par-relative range are covered without a DOM. scoreLabel moves out of
HoleStepper into scoreMark, where the chips can reach it for aria labels.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The chip row, wired up

The first runnable state. After this task, one-tap score entry works on a phone.

**Files:**
- Create: `src/components/ScoreChips.tsx`
- Modify: `src/components/HoleStepper.tsx`
- Modify: `src/index.css` (the `.stepper` block around line 969, and a new chip block after `.score-tag` around line 1084)

**Interfaces:**
- Consumes: `chipRange`, `nextValue` from `src/scoreChips.ts`; `scoreLabel` from `src/scoreMark.ts`.
- Produces: `<ScoreChips name={string} par={number} value={number | null} onChange={(v: number | null) => void} />`

- [ ] **Step 1: Create `src/components/ScoreChips.tsx`**

The overflow button is rendered here but does nothing until Task 3 — it's laid out now so the row's widths are settled in one pass rather than shifting under a later change.

```tsx
import { chipRange, nextValue } from '../scoreChips';
import { scoreLabel } from '../scoreMark';

interface Props {
  /** Player name, for the group's accessible label. */
  name: string;
  par: number;
  value: number | null;
  /** null means "clear this score" — see nextValue. */
  onChange: (value: number | null) => void;
}

export function ScoreChips({ name, par, value, onChange }: Props) {
  const chips = chipRange(par);

  return (
    <div className="score-chips" role="radiogroup" aria-label={`${name}'s score, par ${par}`}>
      {chips.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}, ${scoreLabel(n - par)}`}
          className={`score-chip${n === par ? ' par' : ''}`}
          onClick={() => onChange(nextValue(value, n))}
        >
          {n}
        </button>
      ))}
      {/* Laid out now so the row's widths settle in one pass, but disabled
          until Task 3 wires it — a tappable control that does nothing is
          worse than one that's visibly not ready. */}
      <button
        type="button"
        className="score-chip score-more"
        aria-label={`More scores for ${name}`}
        disabled
      >
        …
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Swap it into `HoleStepper.tsx`**

Remove `dec`, `inc`, and the whole `<div className="stepper-controls">` block. Move the `.stepper-value` readout into the name row. `commit()` stays exactly as it is.

Replace the component's returned JSX with:

```tsx
  return (
    <div id={id} className={`stepper tone-${tone}${highlight ? ' highlight' : ''}`}>
      <div className="stepper-name">
        <PlayerAvatar name={name} color={color} />
        <span className="stepper-name-text">{name}</span>
        {handicap != null && (
          <span className="stepper-hcp" aria-label={`Handicap ${handicap}`}>
            HCP {handicap}
          </span>
        )}
        {matchStrokes && matchStrokes.length > 0 && (
          <span
            className="lg-chips"
            aria-label={`Gets a stroke in: ${matchStrokes.join(', ')}`}
          >
            {matchStrokes.map((m) => (
              <span key={m} className="lg-chip">
                {m}
              </span>
            ))}
          </span>
        )}
        {!matchStrokes && strokesReceived > 0 && (
          <span className="hcp-dots" aria-label={`${strokesReceived} handicap strokes`}>
            {'•'.repeat(strokesReceived)}
          </span>
        )}
        {/* Display only — the chips are the control. Must not be styled as one. */}
        <span className="stepper-value" aria-hidden="true">
          <span
            className={`score-num${value == null ? '' : ` ${scoreMarkClass(toPar)}`}${
              celebrating ? ' celebrate' : ''
            }`}
            key={value ?? 'empty'}
          >
            {value ?? '–'}
          </span>
          <span className="score-tag">{value == null ? 'tap' : scoreLabel(toPar)}</span>
        </span>
      </div>
      <ScoreChips
        name={name}
        par={par}
        value={value}
        // Clearing must not buzz or celebrate — commit() is for real scores only.
        onChange={(v) => (v == null ? onChange(null) : commit(v))}
      />
    </div>
  );
```

Add the import at the top:

```tsx
import { ScoreChips } from './ScoreChips';
```

`aria-hidden="true"` on the readout is deliberate: the radiogroup already announces the selected score, so exposing the same number twice makes the row noisier, not clearer.

- [ ] **Step 3: Update the CSS**

In `src/index.css`, replace the `.stepper` rule (around line 969) with:

```css
.stepper {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  border-left: 5px solid var(--line);
  padding: 12px 14px 12px 11px;
}
```

Replace the `.stepper-value` rule (around line 1051) with:

```css
.stepper-value {
  /* Pushed to the end of the name row; the chips sit on the row below. */
  margin-left: auto;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  text-align: right;
}
```

Delete the `.stepper-controls`, `.step-btn`, and `.step-btn:active` rules (around lines 1032–1050).

Reduce `.score-num` (the rule at ~line 1058, the one with `font-family: var(--font-display)`) from `2.3rem` to `1.9rem` so it sits on the name row without forcing a wrap.

There is a **second `.score-num` rule at ~line 1699**. It sets only `animation: flap …`, `transform-origin`, and `backface-visibility` — the card-flip on score change. It does not set `font-size` and does not conflict. **Leave it exactly as it is.**

Add after `.score-tag` (around line 1084):

```css
/* ---------- Quick-pick score chips ---------- */
.score-chips {
  display: flex;
  gap: 4px;
}
.score-chip {
  flex: 1;
  min-width: 0;
  height: 46px;
  border-radius: 10px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* Par gets a quiet anchor so the row is readable without counting. */
.score-chip.par {
  border-color: color-mix(in srgb, var(--muted) 40%, var(--line));
  background: var(--card);
}
.score-chip[aria-checked='true'] {
  background: var(--green-600);
  border-color: var(--green-600);
  color: #fff;
}
.tone-under .score-chip[aria-checked='true'] {
  background: var(--under);
  border-color: var(--under);
}
.tone-over .score-chip[aria-checked='true'] {
  background: var(--over-strong);
  border-color: var(--over-strong);
}
.score-chip:active {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .score-chip:active {
    transform: none;
  }
}
.score-more {
  color: var(--muted);
  letter-spacing: 0.08em;
}
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run dev -- --host
```

Open the LAN URL on a phone (or use responsive mode at 375×812). Start a 4-player round and confirm:
- tapping a chip sets that score, and the readout and tone stripe update
- tapping the selected chip clears it back to `–` / "tap"
- a birdie still buzzes and still plays the celebrate glow
- four players, the money ticker, hole nav, dot strip and Next Hole all fit without scrolling

- [ ] **Step 5: Full check and commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/components/ScoreChips.tsx src/components/HoleStepper.tsx src/index.css
git commit -m "$(cat <<'EOF'
Enter hole scores with one tap instead of stepping

The Hole tab's -/+ pair becomes a row of score chips centred on par, so any
score from birdie to triple is a single tap and a typical hole costs four taps
instead of eight. Tapping the selected chip clears the score, which also
closes the dead end where a set score couldn't be unset outside the Card tab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The overflow grid

**Files:**
- Modify: `src/components/ScoreChips.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `overflowRange` from `src/scoreChips.ts`.
- Produces: no new exports; `ScoreChips`'s props are unchanged.

- [ ] **Step 1: Add the expand state and grid to `ScoreChips.tsx`**

This removes the `disabled` attribute Task 2 put on the overflow button.

Rewrite the file as:

```tsx
import { useState } from 'react';
import { chipRange, nextValue, overflowRange } from '../scoreChips';
import { scoreLabel } from '../scoreMark';

interface Props {
  /** Player name, for the group's accessible label. */
  name: string;
  par: number;
  value: number | null;
  /** null means "clear this score" — see nextValue. */
  onChange: (value: number | null) => void;
}

export function ScoreChips({ name, par, value, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  const chips = chipRange(par);
  // A score outside the inline range lives behind "…" — mark the chip so the
  // row doesn't read as empty when a 9 is entered on a par 4.
  const hidden = value != null && !chips.includes(value);

  const pick = (n: number) => {
    onChange(nextValue(value, n));
    setShowAll(false);
  };

  return (
    <div className="score-chips-wrap">
      <div className="score-chips" role="radiogroup" aria-label={`${name}'s score, par ${par}`}>
        {chips.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}, ${scoreLabel(n - par)}`}
            className={`score-chip${n === par ? ' par' : ''}`}
            onClick={() => pick(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`score-chip score-more${hidden ? ' has-value' : ''}`}
          aria-expanded={showAll}
          aria-label={`More scores for ${name}`}
          onClick={() => setShowAll((s) => !s)}
        >
          {hidden ? value : '…'}
        </button>
      </div>

      {showAll && (
        <div className="score-overflow" role="group" aria-label={`All scores for ${name}`}>
          {overflowRange().map((n) => (
            <button
              key={n}
              type="button"
              className={`score-chip${value === n ? ' sel' : ''}`}
              aria-label={`${n}, ${scoreLabel(n - par)}`}
              onClick={() => pick(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

The overflow items are plain buttons in a `group`, not a second `radiogroup` — two radio groups controlling one value would misrepresent the structure to a screen reader.

- [ ] **Step 2: Add the overflow CSS**

Append after the `.score-more` rule added in Task 2:

```css
.score-more.has-value {
  border-color: var(--green-600);
  color: var(--green-700);
  background: var(--card);
}
.score-overflow {
  display: grid;
  /* Five columns × three rows fits 1–15 exactly, at ~64px wide each on a
     375px phone — comfortably above the 44px touch minimum. */
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-top: 6px;
}
.score-overflow .score-chip {
  height: 44px;
}
.score-overflow .score-chip.sel {
  background: var(--green-600);
  border-color: var(--green-600);
  color: #fff;
}
```

- [ ] **Step 3: Verify in the browser**

```bash
npm run dev -- --host
```

Confirm:
- `…` opens a 5×3 grid of 1–15 and closes again on a second tap
- picking 9 on a par 4 collapses the grid, sets the score, and the `…` chip now reads `9` and is outlined
- tapping an inline chip afterwards clears that state and selects normally
- picking the same overflow value twice clears the score

- [ ] **Step 4: Full check and commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/components/ScoreChips.tsx src/index.css
git commit -m "$(cat <<'EOF'
Reach any score through the chip row's overflow

The "..." chip expands in place into a 1-15 grid, so a snowman or an eagle is
still two taps and never summons the OS keyboard - which is the reason
type-it-in was rejected for the main path. A score outside the inline range
shows on the overflow chip so the row never reads as empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rename `HoleStepper` to `PlayerScoreRow`

Separate from Task 2 so the behaviour change and the rename can be reviewed — or rejected — independently. A component named `HoleStepper` that contains no stepper is a lie this work introduces.

**Files:**
- Rename: `src/components/HoleStepper.tsx` → `src/components/PlayerScoreRow.tsx`
- Modify: `src/screens/HoleView.tsx`
- Modify: `src/screens/Play.tsx:73`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<PlayerScoreRow>` replaces `<HoleStepper>`; props are unchanged. DOM id prefix becomes `player-row-`.

**Scope note:** the `.stepper*` **CSS class names stay as they are.** Renaming them is a wide, high-noise diff for low signal and `.stepper` still reads acceptably as "the per-player score row". This is a deliberate half-measure recorded in the spec — don't extend it.

- [ ] **Step 1: Rename the file and the component**

```bash
git mv src/components/HoleStepper.tsx src/components/PlayerScoreRow.tsx
```

In `src/components/PlayerScoreRow.tsx`, change `export function HoleStepper(` to `export function PlayerScoreRow(`.

- [ ] **Step 2: Update `HoleView.tsx`**

Change the import from:

```tsx
import { HoleStepper } from '../components/HoleStepper';
```

to:

```tsx
import { PlayerScoreRow } from '../components/PlayerScoreRow';
```

Change the element `<HoleStepper` to `<PlayerScoreRow`, and its `id` prop from:

```tsx
id={`stepper-${p.id}`}
```

to:

```tsx
id={`player-row-${p.id}`}
```

- [ ] **Step 3: Update the auto-jump lookup in `Play.tsx`**

At `src/screens/Play.tsx:73`, change:

```tsx
      .getElementById(`stepper-${highlightId}`)
```

to:

```tsx
      .getElementById(`player-row-${highlightId}`)
```

This is the only consumer of that id. Missing it would silently break the "jump to the first blank score" behaviour without any type error — confirm with:

```bash
grep -rn "stepper-" src/
```

Expected: no matches outside `src/index.css` comments.

- [ ] **Step 4: Verify the auto-jump still works**

```bash
npm run dev -- --host
```

Start a 4-player round, leave one player blank, tap **Next Hole**, then tap **Keep scoring** in the warn banner. The blank player's row must scroll into view and flash green.

- [ ] **Step 5: Full check and commit**

```bash
npm run test && npm run typecheck && npm run lint
git add -A src/
git commit -m "$(cat <<'EOF'
Rename HoleStepper to PlayerScoreRow

Nothing steps any more. The DOM id prefix moves with it, since Play's
auto-jump looks the row up by id and a stale prefix would break the
jump-to-first-blank behaviour without a type error. CSS class names are left
alone deliberately.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cross-surface verification and changelog

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Verify across themes and orientations**

```bash
npm run dev -- --host
```

Walk each of these and fix anything that fails before continuing:

| Check | What to look for |
|---|---|
| Dark mode | Settings → Appearance → Dark. Chip borders and the selected fill must stay legible against `--card: #15241e`. |
| Glare mode | The contrast toggle in the Play toolbar. `:root.glare` is texture-free max-contrast — the `color-mix` on `.score-chip.par` must not wash out against a pure-white `--bg`. |
| Landscape | Rotate the phone. Chips get wider; confirm they don't stretch absurdly and the overflow grid still reads as 5 columns. |
| Reduced motion | Enable Reduce Motion at the OS level. `.score-chip:active` must not scale; the celebrate glow follows its existing rule. |
| 5 players | Expected to scroll — confirm it scrolls *gracefully* with Next Hole staying pinned by `.play-foot`'s `position: sticky`. |
| League round | Start a Golf League round. The `A`/`B`/`T` match chips share the name row with the score readout — confirm nothing crushes the player's name. |
| Handicap round | A round with handicaps: the `HCP` badge and the stroke dots also share that row. Same check. |

- [ ] **Step 2: Verify the guardrail regression path**

This path has no test coverage and is exactly what the clear-on-retap semantic touches:

1. Enter scores for every player on a hole, then re-tap one selected chip to clear it.
2. Tap **Next Hole** — the warn banner must appear naming that player.
3. Tap **Keep scoring** — it must jump to that player's row and flash.
4. Tap **Finish** with holes still blank — the banner must report the right count of incomplete holes.

- [ ] **Step 3: Add the changelog entry**

In `CHANGELOG.md`, under `## [Unreleased]`, add a `### Changed` section if one isn't there yet, and add:

```markdown
- **One-tap score entry**: the Hole tab's `−`/`+` stepper is now a row of
  score chips centred on par — `3 4 5 6 7` on a par 4 — so any score from
  birdie to triple bogey is a single tap. A typical hole costs four taps
  instead of eight. Tapping the selected chip clears that score, which also
  fixes a dead end: a score set on the Hole tab previously couldn't be unset
  without switching to the Card tab. Anything outside the range (an eagle, a
  snowman) opens a 1–15 grid from the `…` chip, in place, with no keyboard.
  The rows are taller than the old single-line stepper, so a fivesome now
  scrolls — the Next Hole button stays pinned.
```

- [ ] **Step 4: Full check and commit**

```bash
npm run test && npm run typecheck && npm run lint && npm run build
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
Document one-tap score entry

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin quick-pick-score-entry
gh pr create --title "One-tap score entry on the Hole tab" --body "$(cat <<'EOF'
Replaces the Hole tab's `−`/`+` stepper with a row of score chips centred on
par, so any common score is one tap.

Spec: `docs/superpowers/specs/2026-08-08-press-quick-pick-score-entry-design.md`
Plan: `docs/superpowers/plans/2026-08-08-quick-pick-score-entry.md`

- A typical hole drops from eight taps to four
- Tapping the selected chip clears it, closing the dead end where a score set
  on the Hole tab couldn't be unset outside the Card tab
- `…` opens a 1–15 grid in place — no OS keyboard, which is why type-it-in was
  rejected for the main path
- Nothing under `src/games/` changed; `Round` is untouched

Rows are ~32px taller than the old single-line stepper. Four players still fit
without scrolling; five scroll with Next Hole pinned. Accepted trade, recorded
in the spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the next spec

`handicap.ts` allocates strokes off each player's **full** handicap. Match play
and Nassau conventionally play off the **low** handicap, and four-ball applies
an 85–90% allowance. This changes hole-by-hole outcomes and therefore
settlement. Confirmed as a bug on 2026-08-08 and queued as the next spec — do
not fold it into this work.
