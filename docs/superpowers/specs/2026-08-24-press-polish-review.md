# Press — Polish Review

_2026-08-24. A design-engineering pass over the UI layer (`src/index.css`,
`src/components/*`, `src/screens/*`) looking for the unseen details: motion,
state feedback, and transition moments. Scoring engines are out of scope._

## The through-line

Press already does the hard, unglamorous parts of polish better than most apps
this size. The contrast work is real and documented at the token level
(`--under-ink`, `--gold-ink`, `--over-strong` each carry the measured ratio in a
comment). `prefers-reduced-motion` is honored on **every** animation without
exception — that is rare. Tap targets hold 48px. Tabular numerals are applied
everywhere numbers align. Haptics already fire on score commit, softer for a tap
and firmer for birdie+. The split-flap, the sheen, the confetti, the celebrate
pulse — the app has real personality and knows what it is.

The gap is not taste. It is **coverage**. The polish is concentrated in a few
showpiece moments (Results, score entry) and thins out everywhere else, and the
motion that does exist isn't yet a system. Two numbers say it:

- **4 `transition` declarations** in 2,610 lines of CSS — all four identical
  (`transform 0.08s ease`), all on press feedback.
- **6 `:active` rules, 0 `:hover` rules, 0 `:focus-visible` rules.**

So most state changes in the app are hard cuts, most pressable things don't
acknowledge the press, and nothing acknowledges a keyboard or a mouse. The
recommendations below are ordered by ratio of felt improvement to work.

---

## Tier 1 — Make the motion a system

Right now every duration and curve is chosen locally. Four `transition`s use
`0.08s ease`; three keyframes use `cubic-bezier(0.16, 1, 0.3, 1)`; others use
plain `ease` or `ease-out`. Same app, three different opinions about how things
move.

**Add the tokens next to `--radius` and `--tap` in `:root`:**

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* enter / exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* on-screen movement */
--press: 140ms;  /* button press feedback */
--swap: 180ms;   /* state / color swaps */
--sheet: 280ms;  /* sheet enter */
```

Then:

| Before | After | Why |
| --- | --- | --- |
| `transition: transform 0.08s ease` (×4: `.btn-primary`, `.btn-secondary`, `.saved-course-load`, `.hole-dot::before`) | `transition: transform var(--press) var(--ease-out)` | 80ms is below the floor where a press reads as a press — it lands closer to "nothing happened" than to feedback. 140ms with a strong ease-out is the range that registers. `ease` also starts slow, which is the wrong half of the curve for a press. |
| `.score-chip:active { transform: scale(0.96) }` with **no** `transition` on `.score-chip` | Add `transition: transform var(--press) var(--ease-out)` to `.score-chip` | The single most-tapped control in the app snaps instantly in *and* instantly back. The scale is there; it just has nothing to animate along. This is a one-line change to the interaction users perform ~72 times a round. |
| `.hole-dot::before` scale on `.current` at `0.08s ease` | `var(--press) var(--ease-out)` | The dot strip is glanceable state — the current-dot growth should be readable as movement, not a jump. |
| `.slide-next` / `.slide-prev` at `cubic-bezier(0.16, 1, 0.3, 1)` | Keep the curve; alias it as `--ease-out` | The curve is good. It just deserves a name so the next animation inherits it rather than re-deriving it. |

**Also in Tier 1:** `.score-num` carries `animation: flap 0.26s` unconditionally.
Because `.hole-body` is keyed `key={hole.number}` (`HoleView.tsx`), **every hole
change remounts every score row and replays the split-flap on all of them** —
on a blank hole that means four dashes flipping down on top of the 0.2s slide
transition. The flap is a lovely idea being spent on the wrong event.

| Before | After | Why |
| --- | --- | --- |
| `.score-num { animation: flap 0.26s … }` — fires on mount, so on every swipe | Gate it: `.score-num.flap { animation: … }`, and set that class from `PlayerScoreRow` only on a real commit (the same place `buzz()` already fires) | The flap should mean "a score just landed." Firing it on navigation dilutes the signal and stacks competing motion on top of the hole slide. |

---

## Tier 2 — The sheet

`Sheet.tsx` is used by Settings, Help, Edit Handicaps, and Feedback — it is the
app's only modal surface, and it has **no animation at all**. Backdrop and panel
both appear instantly at full opacity. For a bottom sheet, which the whole
platform vocabulary says should rise, that's the most noticeable gap in the app.

| Before | After | Why |
| --- | --- | --- |
| `.sheet-backdrop`, `.sheet` — no transition, no animation | Backdrop: `opacity 0 → 1` over `var(--sheet)`. Panel: `transform: translateY(100%) → translateY(0)` over `var(--sheet)` with `cubic-bezier(0.32, 0.72, 0, 1)` | `translateY(100%)` is height-agnostic, so it works for the tall Settings sheet and the short Help sheet without per-sheet math. That curve is the iOS drawer feel and matches the "rises from the bottom edge" affordance the layout already implies. |
| No exit animation (unmount is instant) | Exit at ~200ms — faster than the 280ms enter | Enter is the system presenting; exit is the system responding to the user. Responses should be quicker than presentations. Needs a small unmount delay in `Sheet.tsx` or `@starting-style` + `transition-behavior: allow-discrete`. |
| `panel.current?.focus()` on open; nothing on close | Store `document.activeElement` on open, restore it on unmount | Right now closing Settings drops keyboard focus to `<body>`, so the next Tab starts from the top of the page instead of the gear the user just came from. |
| No focus trap | Trap Tab within the panel while open | `aria-modal="true"` promises containment to assistive tech; without a trap, Tab walks out into the screen behind and the promise is false. |
| No body scroll lock | `overflow: hidden` on `body` while any sheet is open | On a long Setup screen, scrolling inside a short sheet chains through to the page behind it — the sheet stays put while the world moves under it. |

**Worth considering, not required:** drag-to-dismiss on the sheet. The app
already has touch-gesture code in `HoleView.tsx` (swipe-to-change-hole) so the
pattern isn't foreign, and a bottom sheet that rises but can't be pushed back
down feels half-built once the enter animation is in. Dismiss on velocity
(`|dy| / elapsed > 0.11`), not just distance, so a flick works.

---

## Tier 3 — The three states that don't exist

### Press feedback is inconsistent

Six elements have `:active`. These do not, and all are primary interactions:

`.seg-btn` (every tab in the app) · `.awake-toggle` (Eye / Glare / Gear in
Play) · `.nav-arrow` (hole prev/next) · `.game-card` (game selection, the
main event on Setup) · `.round-main` (resuming a round from Home) ·
`.hole-dot` (jump to hole) · `.round-del` / `.saved-course-del` /
`.game-info-btn` / `.sheet-close`.

Because `* { -webkit-tap-highlight-color: transparent }` removes the browser's
default flash, an element without `:active` gives **zero** acknowledgment on
touch — the state changes a beat later and the tap itself is silent.

| Before | After | Why |
| --- | --- | --- |
| No `:active` on the above | One shared rule: `.seg-btn:active, .awake-toggle:active, .nav-arrow:active, .game-card:active, .round-main:active, .hole-dot:active { transform: scale(0.97) }` + the shared transition | The tap-highlight suppression is right for the look; it just has to be paid back with a real press state. One rule covers all of them. |
| `.seg-btn.active`, `.game-card.active` — instant color/border swap | `transition: background-color var(--swap) ease, border-color var(--swap) ease, color var(--swap) ease` | Tab switching is the most frequent non-scoring action in Play. A hard cut is the difference between "the app changed" and "I changed the app." |

### No focus-visible anywhere

`input:focus, select:focus { outline: 2px solid var(--fairway) }` is the only
focus style in the file, and **no button has one**. The app is a real web app on
a real URL — it gets opened on laptops, and it's used with external keyboards on
tablets. Today a keyboard user has no idea where they are.

| Before | After | Why |
| --- | --- | --- |
| No button focus styles | `button:focus-visible { outline: 2px solid var(--fairway); outline-offset: 2px }` | `:focus-visible` (not `:focus`) means touch users never see a lingering ring — which is exactly why this was safe to leave out and is now safe to add. One rule, whole app covered. WCAG 2.4.7. |
| `input:focus` | `input:focus-visible` + `outline-offset: 2px` | Same reasoning; the offset keeps the ring off the 1px border so it reads as a ring rather than a thicker border. |

### No disabled state on the primary button

`.cs-hit`, `.seg-btn`, `.nav-arrow` and `.press-btn` all have `:disabled` rules.
`.btn-primary` does not — so on Results, the Share button sets `disabled` and
swaps its label to "Building…" while looking **exactly as tappable as before**.

| Before | After | Why |
| --- | --- | --- |
| No `.btn-primary:disabled` / `.btn-secondary:disabled` | `opacity: 0.5; box-shadow: none; cursor: default` | The one place the app asks the user to wait is the one place it doesn't look like waiting. |
| `{rendering ? 'Building…' : <><ShareIcon/> Results</>}` — hard content swap | Cross-fade the label, or `filter: blur(2px); opacity: 0.7` on the outgoing content over ~200ms | Icon+text → text is two visibly different objects swapping. A short blur bridges them into one transforming thing. Keep blur under 20px (Safari cost). |

---

## Tier 4 — Four specific moments

**1. The splash handoff (first impression, every cold start).**
`#splash` lives inside `#root`, so `createRoot().render()` deletes it the
instant React mounts. Deep green felt → light `--bg`, one frame, no transition —
and then `.screen`'s own `screen-in` slide-up starts independently. The two
animations don't know about each other. Move `#splash` to a sibling of `#root`
and fade it out over ~250ms after mount; the app's own entrance then reads as
continuing the splash rather than interrupting it. This is the first thing every
user sees and currently the least-polished second in the app.

**2. MoneyTicker → SwingTicker.**
The two components occupy the same `.money-ticker` box by design (well
documented, and the fixed height is the right call) — but the swap between
running totals and a hole's swing is a hard cut between two entirely different
sets of text in the same rectangle. This is the textbook case for a blur-masked
crossfade: ~180ms, `filter: blur(2px)` + `opacity` on the way out. Without it
the eye sees two lists; with it, it sees one line updating.

**3. The armed delete.**
`DeleteButton` is a genuinely good pattern — two-tap, 3s auto-disarm, blur to
disarm, correct `aria-label` on both states. But arming changes the button from
`width: 44px` with a glyph to `width: auto` with the word "Delete?", **with no
transition** — an instant layout jump that shoves the row. Transition `width` is
the wrong fix (layout cost); instead give the armed state a fixed width and
cross-fade the glyph and the label. Optional but on-theme: the 3s countdown is
invisible, and a `clip-path: inset(0 100% 0 0) → inset(0)` sweep over 3s linear
across the armed button would show the disarm coming.

**4. `winner-pop` starts at `scale(0.4)`.**
Standing guidance is never to animate from below ~0.9 — things that appear from
near-nothing read as popping out of the void. I'd normally flag this, but here
it's a once-per-round celebration on a hero with confetti and a light sweep, and
the overshoot to 1.15 sells the whole thing. **Leave it.** Noted so it doesn't
get "fixed" later by someone applying the rule without the context.

---

## Two smaller notes

- **`maximum-scale=1.0`** in the viewport meta blocks pinch-zoom on Android
  (iOS has ignored it since iOS 10). It's a WCAG 1.4.4 failure and the app
  doesn't need it — the layout has no zoom-breaking fixed positioning beyond
  the sheet. Dropping it costs nothing and it's a one-word change.
- **`<meta name="theme-color" content="#14694e">`** is a single fixed value, so
  the browser chrome stays brand green while the app sits at near-black in dark
  mode. `theme.ts` already writes the `.dark` class explicitly; it could update
  the meta tag in the same place, which also covers the explicit Dark setting
  that a `media="(prefers-color-scheme: dark)"` variant could not.

---

## What not to change

Listed so a future pass doesn't "correct" deliberate, correct decisions:

- **`confetti-fall` uses `ease-in`.** Normally wrong for UI. Correct here —
  falling objects accelerate under gravity. Leave it.
- **`.score-num.celebrate` overriding the `flap` animation.** Both set
  `animation`, so the more specific rule wins and a birdie celebrates instead of
  flipping. That's the right precedence.
- **The `prefers-reduced-motion` blocks.** Every one of them is correct, and
  `.stepper.highlight` even preserves the box-shadow while dropping the flash —
  keeping the *information* and removing only the *motion*. That's the standard
  done properly.
- **The `.score-chips-wrap` / `subgrid` comments and the `chipRange` coupling
  tripwire.** Don't touch without reading them.

---

## Suggested order

| # | Change | Effort | Payoff |
| --- | --- | --- | --- |
| 1 | Motion tokens + retune the 4 existing transitions; add the missing one to `.score-chip` | ~15 min | Every press in the app feels intentional |
| 2 | Shared `:active` rule for the 10 unstyled pressables | ~10 min | Removes all remaining dead taps |
| 3 | `button:focus-visible` | ~5 min | Closes a real a11y gap; zero touch impact |
| 4 | `.btn-primary:disabled` | ~5 min | The one wait state in the app looks like one |
| 5 | Sheet enter/exit animation | ~30 min | Biggest single perceived-quality jump |
| 6 | Gate `flap` to real commits | ~15 min | Removes motion noise from every swipe |
| 7 | Splash fade-out | ~20 min | Fixes the first second of every cold start |
| 8 | Sheet focus restore + trap + scroll lock | ~45 min | Makes `aria-modal` honest |
| 9 | Ticker crossfade, armed-delete crossfade | ~30 min | Two hard cuts become transitions |
| 10 | Drop `maximum-scale`, dynamic `theme-color` | ~10 min | Small, correct, cheap |

Items 1–4 are roughly 35 minutes of CSS and would move the app's tactile
quality more than anything else on the list.
