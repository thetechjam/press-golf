# Scorecard stroke index, scorecard sharing, and landscape layout

**Date:** 2026-08-07
**Status:** Approved, ready for planning

Three independent user-facing changes to Press, plus one correctness fix that
falls out of the first two. All four apply to regular rounds and league rounds
alike — league parity was an explicit requirement, not an afterthought.

## Motivation

1. **Stroke index isn't visible anywhere on the scorecard.** The data is already
   there — entered in Setup/LeagueSetup, or fetched from the course API — and it
   drives every net calculation in the app. But a player looking at the Card tab
   can't see which hole is the #1 handicap hole. It's a reference point they want
   while scoring.

2. **You can share results but not the scorecard.** `renderShareCard()` produces
   a scoreboard PNG of standings and settlement. The hole-by-hole grid — often
   the thing the group actually wants in the chat — has no share path.

3. **Landscape wastes the screen.** `.app` is capped at `max-width: 540px` with
   no orientation branch, so rotating the phone leaves the layout in a narrow
   column with dead space either side. The scorecard is the view that suffers:
   18 holes force horizontal scroll even when the display has room.

4. **(Discovered) The Card tab shows no stroke allocation for league rounds.**
   See "League stroke markers" below.

## 1. Stroke index row

`Scorecard.tsx` gains a third header row beneath Hole and Par:

| Hole | 1 | 2 | 3 | … | Tot | +/− |
|---|---|---|---|---|---|---|
| Par | 4 | 5 | 3 | … | 36 | |
| SI | 7 | 1 | 15 | … | | |

**Source:** the existing `strokeIndexMap(round)` call already present at
`Scorecard.tsx:19`. No new computation. That helper returns real course stroke
indexes when every hole has one, and a sequential fallback by ascending hole
number otherwise — the row displays whichever it returns, with no gating on
provenance.

**Always visible.** Not gated on `usesHandicaps(round)`. Stroke index is a fact
about the course, not about whether this particular round scores net, and it's
useful as a reference in gross play too.

**Styling:** a `.sc-si-row` mirroring `.sc-par-row` (muted, 0.75rem). The
`border-bottom: 1px solid var(--line)` currently on `.sc-par-row td/th` moves to
`.sc-si-row` so the header block still closes with a single rule under the last
header row rather than a line floating mid-header. Cells under Tot and +/− stay
blank — a total stroke index is meaningless.

**League:** works unchanged. `LeagueSetup` seeds every hole with an explicit
`strokeIndex` (`LeagueSetup.tsx:25`), so `strokeIndexMap` takes the
all-provided branch. League rounds rotate holes into play order within the
`holes` array; the row renders in `holes.map` order, matching the Hole and Par
rows above it, so a round starting on hole 5 shows its SI values in the same
rotated order as everything else.

**Cost:** one more row of vertical height on the Card tab. The real reported
Safari viewport is 554px (see the 2026-08-06 spec's viewport note), and the Card
tab scrolls, so this degrades gracefully rather than pushing a control off-screen.

## 2. League stroke markers on the scorecard

This is a pre-existing bug surfaced by the work above, fixed here because both
the SI row and the share PNG build on this grid.

**Current behavior:** `Scorecard.tsx:100` computes stroke dots as
`useNet ? strokesReceivedOnHole(...) : 0`. League rounds ship `useNet: false`
(`LeagueSetup` spreads `DEFAULT_OPTIONS`) yet score net through `computeLeague`,
which reads `player.handicap` directly. Result: a league round shows the
handicap badge beside each player's name — that badge is gated on
`usesHandicaps(round)`, which is true for league — while showing zero stroke
markers in the grid. The Card tab misrepresents the round.

`HoleView` does not have this problem. It branches on `round.options.league` and
renders per-match chips from `leagueStrokesOnHole()` (`HoleView.tsx:65`), because
league strokes are allocated off three different baselines (two singles matches
and the team match) and a single dot count would be ambiguous about which match
a stroke applies to.

**Fix:** `Scorecard` adopts the same branch as `HoleView`.

- Non-league rounds: unchanged — `useNet`-gated dots.
- League rounds: per-hole match keys from `leagueStrokesOnHole(round, hole)`,
  rendered as small gold letter chips in the cell corner (`A`, `B`, `T`),
  reusing the `.lg-chip` styling `HoleStepper` already uses so the two views
  are visually consistent.

**Performance note:** `leagueStrokesOnHole` recomputes `leagueBaselines(round)`
on every call. Calling it once per hole inside the render loop means 9–18
redundant baseline computations per render. Compute the full map once per render
before the loop — `round.holes.map(h => leagueStrokesOnHole(round, h))` keyed by
hole number — rather than calling inside the cell.

**Chip density:** a chip is smaller than a dot but there can be up to three per
cell. Verify at the real 402px-wide viewport that chips don't collide with the
score digit; if they do, prefer shrinking the chip over dropping keys, since
which match the stroke belongs to is the whole point.

## 3. Scorecard sharing

### Shared canvas module

`shareCard.ts` currently holds both its brand chrome and its layout logic. The
chrome is about to have a second consumer. Extract into `src/shareCanvas.ts`:

- Color constants: `BG`, `CREAM`, `MUTED`, `GOLD`, `BRIGHT`, `RED`
- Font helpers: `disp(weight, size)`, `mono(size)`, `setLS(ctx, px)`
- Text helpers: `fit(ctx, text, maxWidth)`, `up(s)`
- Drawing helpers: `dashedRule(ctx, y)`
- The header block (wordmark, course title with shrink-to-fit, meta line, gold rule)
- The crop-and-frame tail (crop the oversized work canvas to `y`, draw the
  double gold frame, `toBlob`)

`shareCard.ts` keeps its own standings/settlement/league layout and imports the
rest. `PAD` and width become parameters rather than module constants, since the
scorecard canvas is wider than 1080.

This is a refactor of existing working code with no behavior change. Capture a
rendered results-card PNG before the extraction and compare the post-extraction
render against it; any visible difference means the refactor changed something
it shouldn't have.

### `src/scorecardCard.ts`

Exports `renderScorecardCard(round): Promise<Blob>`.

**Canvas:** landscape rather than the results card's portrait. Width scales with
hole count — roughly 1400px for 18 holes, 1000px for 9 — computed from a
per-hole column width plus the name column and the two total columns, so a
9-hole league round doesn't get a half-empty board. Height derived from player
count.

**Layout:** the same grid as the screen.

- Name column on the left, with the handicap value when `usesHandicaps(round)`
- Header rows: Hole, Par, SI
- One row per player: per-hole scores, then Tot and +/−
- Circle/square score marks following `scoreMark.ts` semantics — circle under
  par, square over, doubled ring at ±2
- Stroke markers matching the screen: dots for net non-league rounds, `A`/`B`/`T`
  letter pips for league rounds

**Chrome:** identical to the results card — dark green board, gold trim, Oswald
condensed caps, `PRESS` wordmark, course title, date/players/holes meta line,
`SCORED WITH PRESS` footer, double gold frame. Both cards should read as the
same object from the same app.

**League:** no branch needed beyond the stroke markers. Unlike the results card,
which renders entirely different content for league rounds (team points and
match statuses vs. standings and settlement), the scorecard grid is structurally
identical — players down, holes across — for both modes.

### Results screen

The share block becomes:

```
[ Share results ]  [ Share scorecard ]     ← paired primary row
        Share as text instead              ← existing ghost link, unchanged
        Edit handicaps                     ← unchanged
```

Both primaries appear for league and non-league rounds; `Results.tsx` already
renders this block outside its `options.league` branch.

**Extract the share pipeline.** `Results.tsx:147-176` currently inlines the full
chain: render → build `File` and blob URL → `navigator.canShare({files})` →
`navigator.share` → anchor-download fallback → swallow `AbortError` (user closed
the sheet, not a failure) → fall through to `shareText()` on real errors →
`URL.revokeObjectURL` in `finally`. Two buttons must not each carry a copy of
that. Extract to a helper taking a render function and a filename:

```ts
shareImage(render: () => Promise<Blob>, filename: string, onFallback: () => Promise<void>)
```

Independent `rendering` state per button so one card's spinner doesn't disable
the other button.

**Text fallback:** the existing `shareText()` / `buildSummary()` path stays as
the results text summary and remains the fallback for both buttons. A separate
text rendering of the scorecard grid is out of scope — it wraps badly in group
chats at 18 holes, which is the reason the PNG exists.

## 4. Landscape layout

```css
@media (orientation: landscape) {
  .app { max-width: 900px; }
  .sheet { max-width: 900px; }
}
```

`.app`'s 540px cap (`index.css:95`) is the only thing pinning the layout narrow.
Everything inside is flex- or percentage-based, and `.scorecard` is already
`width: 100%`, so it spreads to fill the wider container — which is the point:
18 holes fit without horizontal scroll. `.sheet` (`index.css:2060`) carries its
own matching 540px cap and must move with it or sheets will look pinched against
a wider page.

Applies to every screen in both modes; no per-screen or per-round-type branching.

**900px, not unbounded.** A phone in landscape is roughly 874px wide, so 900px
is effectively full width on the target device while still capping line length
on a tablet or desktop browser, where an uncapped Setup or Results screen would
stretch text to an unreadable measure.

**Known limitation, accepted:** the real constraint in landscape is height, not
width. A phone in landscape is ~390px tall, well under the 554px that already
overflows the Hole tab per the 2026-08-06 spec. Widening does not address that,
and the Card tab is the view that actually benefits from this change. Compressing
the scoring UI to fit a 390px landscape viewport would cost touch-target size in
the mode actually used on a course — same reasoning that spec applied to the
554px portrait case. Landscape remains vertically cramped on the Hole tab and
that is a deliberate non-goal here.

## Testing

**Unit (Vitest):**

- SI row values for a round with real course stroke indexes
- SI row values for a round with no stroke indexes — sequential fallback
- SI row order for a league round with a rotated start hole, confirming SI
  follows play order alongside Hole and Par
- League stroke markers on the scorecard resolve to the same match keys
  `leagueStrokesOnHole` returns for the same hole, for a round with `useNet:
  false` — the regression guard for the bug in section 2
- Non-league net rounds still produce dot counts, not chips

**Manual, in the browser preview:**

Canvas rendering isn't meaningfully testable in jsdom; verify by rendering and
looking at the PNG.

- Results card renders identically before and after the `shareCanvas.ts`
  extraction
- Scorecard PNG for an 18-hole non-league net round — dots present, marks correct
- Scorecard PNG for a 9-hole league round — chips present, canvas not
  half-empty at the narrower width
- Both share buttons: render, share sheet, download fallback, and closing the
  sheet without sharing does not trigger the text fallback

**Viewports:** verify at 874×390 (phone landscape) and 402×554 (the viewport
real Safari reports, per the 2026-08-06 feedback data) — not the 375×812
emulator default, which is 258px taller than the device actually reports.

## Out of scope

- Text rendering of the scorecard grid
- Any height compression for landscape
- Editing stroke index from the Card tab — Setup and LeagueSetup own that
- Sharing from the Play screen's Card tab; both share buttons live on Results
