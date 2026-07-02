# Changelog

All notable changes to Press are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Vitest unit-test suite covering every scoring engine in `src/games/`, with
  the money-settlement math (`settlement.ts`) exhaustively tested.
- Continuous integration (GitHub Actions): lint, typecheck, test, and build run
  on every push and pull request.
- `PolyForm Noncommercial 1.0.0` license.
- `.nvmrc` and a `node` engines constraint pinning the Node major version.

### Changed
- Net scoring is now automatic: it turns on when any player has a handicap
  entered and stays off when none are. The "Use handicaps (net scoring)"
  checkbox is gone; a hint under the player list discloses the behavior.
- Course search and the course-name field are merged into a single input on
  Setup and League Setup: typing searches the course database (pick a match to
  auto-fill the scorecard), and the typed text doubles as a manually entered
  course name, with disclosure text under the field.

### Fixed
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
- Net/handicap scoring with per-hole stroke allocation, capped at one stroke
  per hole.
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
