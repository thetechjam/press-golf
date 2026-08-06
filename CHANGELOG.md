# Changelog

All notable changes to Press are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Settings sheet**: an Appearance picker (System / Light / Dark), the Glare
  mode toggle, and Keep screen awake now live in one place, reachable from a
  gear on Home, Setup, and League Setup, and as a third toolbar button in Play.
  Dark mode is an explicit choice now, not just a mirror of the phone's system
  setting — pick it directly, or leave Appearance on System to keep following
  the OS. A system-appearance change repaints live, with no reload.
- **Handicaps are visible everywhere they're used**: the hole steppers (every
  handicap round now, not just league), the scorecard (beside each player's
  name), and every leaderboard (Board tab and Results).
- **Per-match stroke chips** (`A` / `B` / `T`) on the Hole tab for league
  rounds. League strokes are computed per match off three different
  baselines, so a single dot count would be ambiguous about which match a
  player is actually getting a shot in — the chips name the match instead.
- **Edit handicaps**: a pencil in Play's Board tab and in Results opens a
  sheet that corrects a handicap mid-round. Saving recomputes net scoring for
  rounds that started gross (league rounds are exempt — they already score
  net regardless) and blocks leaving a league round's handicap blank.
  Corrections propagate to every leaderboard and money total on the next
  render.
- **Direct scorecard entry**: tap a scorecard cell and type the score (1–15,
  clamped; empty clears) instead of stepping through `+`/`−`.
- Live money during the round: stakes are set at setup, a ticker shows each
  player's running net while scoring, a new **Board** tab carries the live
  standings plus a per-game money breakdown, and each completed hole shows what
  it was worth.
- Brand identity: the "P Flag" mark (pin flag forms the P of Press, with a
  poker-chip golf ball in the flag). New `app-icon.svg`, simplified
  `favicon.svg`, PNG manifest icons (192/512, maskable), a real 180px
  `apple-touch-icon.png` (iOS ignores SVG touch icons), the mark on the splash
  screen and Home header (`PressMark` in `src/icons.tsx`), and `BRAND.md`
  documenting the system. The old favicon was an unrelated placeholder
  graphic.
- Vitest unit-test suite covering every scoring engine in `src/games/`, with
  the money-settlement math (`settlement.ts`) exhaustively tested.
- Continuous integration (GitHub Actions): lint, typecheck, test, and build run
  on every push and pull request.
- `PolyForm Noncommercial 1.0.0` license.
- `.nvmrc` and a `node` engines constraint pinning the Node major version.

### Changed
- **Sunlight mode is renamed Glare mode** and re-iconed — a contrast glyph
  replaces the sun icon it carried before. It was always a max-contrast
  override for direct sun, not a theme, and the sun icon implied otherwise.
  It still overrides Appearance while it's on, and the Settings sheet now
  says so explicitly instead of leaving the effect unexplained.
- **Scorecard cell tap now edits the score directly instead of jumping to
  that hole.** Tap a hole's number in the header row to jump — that's the
  new home for the jump gesture. This changes muscle memory established
  since 0.1.0; it was made because correcting a mistyped score is the more
  common need, and the old stepper-only path could cost up to fourteen taps.
- Light mode's topographic contours are now visibly green (were a
  near-invisible near-black at 5% opacity).
- Net scoring is now automatic: it turns on when any player has a handicap
  entered and stays off when none are. The "Use handicaps (net scoring)"
  checkbox is gone; a hint under the player list discloses the behavior.
- Course search and the course-name field are merged into a single input on
  Setup and League Setup: typing searches the course database (pick a match to
  auto-fill the scorecard), and the typed text doubles as a manually entered
  course name, with disclosure text under the field.

### Fixed
- The Play screen's primary button never pinned — its `position: sticky` had no
  room to move inside a containing block only as tall as itself, leaving the
  CTA below four leaderboards.
- Scoring sat below the fold with multiple games active; the Hole tab now fits
  one screen when you arrive at a hole. Entering scores grows the steppers via
  score-mark rings, so the fourth can drop below the fold once filled in.
- Handicap stroke dots were unreadable on the light theme (1.9:1 on white) —
  including the default light appearance, not only the opt-in glare mode.
- The 18-hole progress strip on the Play screen was shrinking below the 24px
  minimum touch-target size; it now keeps dots at 24px and scrolls the current
  hole into view.
- The back gesture exited the installed PWA mid-round instead of stepping back
  a screen.
- The scorecard's hole-jump control was unreachable by keyboard.
- README and CHANGELOG described a one-stroke-per-hole handicap cap the engine
  has never had.
- Match-play standings showed a trailing side as `-2 DN` instead of `2 DN`
  (double-negative in the UP/DN detail formatting).

## [0.1.0] - 2026-07-01

First tagged release. A local-only, offline-first PWA for tracking golf
side-games — one scorekeeper enters scores for the whole group on one phone.

### Added
- **Games**: stroke play, match play, skins, Stableford, Wolf, and Nassau,
  each a pure-function engine in `src/games/`.
- **2v2 team play**: 2v2 Nassau and 2v2 Match Play (side-vs-side best-ball),
  with a shared team picker for 1v1/2v2 setup and team assignment.
- **Golf League** mode (Thursday-night format): A-vs-A and B-vs-B singles net
  off the low player, plus a combined team match, with league points and
  back-nine support.
- **Money / settlement view**: per-game stakes resolved to a zero-sum net and
  the fewest payments needed to settle up.
- **Manual Nassau press** button (presses add extra scored segments).
- **Live course search** via OpenGolfAPI — prefills pars and stroke indexes
  (keyless, CORS-open, offline-first design preserved).
- **Saved favorite courses**: store a course's pars and stroke indexes once and
  load them with one tap, surfaced as a prominent picker at the top of Setup and
  League Setup.
- Net/handicap scoring with per-hole stroke allocation down the stroke index,
  including a second stroke on the hardest holes when a handicap exceeds the
  hole count.
- Unentered-score guardrail that auto-jumps to the first blank score before
  advancing.
- PWA install prompt, animated scorecard grid, and a Web Share results summary.
- Netlify build configuration for auto-deploy.

### Fixed
- Content hidden under the iOS status bar / notch in standalone PWA mode
  (top and horizontal safe-area insets).
- Hole-navigation and progress overlap on the play screen.

[Unreleased]: https://github.com/thetechjam/press-golf/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thetechjam/press-golf/releases/tag/v0.1.0
