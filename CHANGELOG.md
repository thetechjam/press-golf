# Changelog

All notable changes to Press are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Awards for Vegas and Quota.** *The Wrecking Ball* names the hole where a
  side's number blew up and the player who blew it up — the higher score on the
  losing side, since a partner who played their part should not wear it — and
  cites what it cost: "9 on a par 4 · 45 points". Twenty points is the bar,
  because ordinary holes swing single figures and reaching twenty takes a real
  wreck. *Short of the Mark* goes to whoever finished furthest below the target
  Quota set them, deliberately the miss rather than the beat: Sandbagger
  already rewards playing under your handicap, and a Quota round uses
  handicaps, so an award for clearing the number would land on the same player
  twice for the same reason.
- **An award never reports the same hole twice.** A blow-up that also wrecked a
  Vegas number is one hole, and naming it in two awards read as a bug rather
  than as two jokes. Awards that report a score now say which hole it was, and
  only the better-ranked telling survives — which frees the slot for somebody
  else on the card, the whole point of the per-player cap.
- **Vegas on the Hole tab.** Wolf and Nassau have always had a presence where
  the scoring actually happens; Vegas did not, which left its whole point — the
  two scores written side by side — on the Board, one tab away from the person
  entering them. A strip above the steppers now shows this hole's two numbers
  with the lower one marked as the winner, and who is up overall. It reads out
  rather than asks: Vegas needs no decision from the scorekeeper the way Wolf's
  partner pick or Nassau's press do. A number turned round by the other side's
  birdie is underlined and the line says "birdie flip" on that hole — without
  it, writing down a 4 and a 5 and seeing 54 looks exactly like a bug. A hole
  with a ball still out shows the standing and no numbers, since a side's
  number does not exist until both its players are in.

### Fixed
- **The Nassau stake says how many bets are actually running.** The Money board
  read "per bet (×3)", a fixed number that assumed front, back and total — so
  it was already wrong on a nine, which has exactly one bet, and wronger with
  every press on the card. It now counts the round's real bets, which on an
  auto-pressed nine where one side never wins a hole reaches five. The setup
  screen has no round to count yet and so says "per bet" without claiming a
  number, rather than claiming the wrong one.

### Added
- **Nassau auto-press.** A setup toggle: when a side goes 2 down, a press
  starts by itself from the next hole, on top of anything pressed by hand. A
  press is a bet like any other, so a press that goes 2 down presses again —
  the cascade the rule is notorious for, and the reason a quiet round turns
  into three bets at once. Each nine keeps its own presses, and nothing presses
  onto the last hole of a nine, where there would be nothing left to play for.
  The automatic presses are **derived from the card rather than stored**: a
  press is a fact about the state of a bet at a moment, so writing one down
  would leave it stranded the instant somebody corrected a score, with the
  money still following the stale bet. Correct the score and the press it
  earned simply isn't there any more. Evaluation stops at the first hole that
  isn't fully scored, because "2 down after the 4th" means nothing while the
  4th is blank. Automatic presses show on the Hole tab beside the called ones,
  marked `auto` and with no remove button, and a hole that was pressed both by
  hand and by the rule stays one bet rather than being paid twice.
- **Each game can be gross or net on its own.** Until now a single player
  entering a handicap flipped the whole round to net, so there was no way to
  play gross skins alongside a net match — a combination groups play all the
  time. A Scoring block on the New Round screen now lists every net-capable
  game with a Gross/Net choice, appearing only once somebody actually has a
  handicap, since until then the two are the same card. The round default is
  still derived exactly as before and `netByGame` records only what you
  changed, so a round saved before this scores the way it was played, and a
  handicap added mid-round still switches the games you never touched. Quota is
  deliberately absent from the list: it spends the handicap on your target and
  reads the card gross, so "net Quota" would hand every stroke out twice.
  Match Play and Nassau can now disagree, so the shared match evaluator takes
  the game it is scoring for rather than reading the round default — otherwise
  a net Nassau would have been scored off a gross Match Play's setting and the
  two boards would have contradicted each other. The whole-round displays
  follow suit: stroke dots and net figures appear when *any* game is net, while
  the handicap badges appear whenever handicaps matter at all — which is why
  those are two separate rules and not one, as a Quota round has handicaps
  everywhere and no net card anywhere.
- **Two more games: Vegas and Quota.** *Vegas* is the two-on-two game where a
  team's scores are not added but written side by side, lowest first — a 4 and
  a 5 is 45, not 9 — and the gap between the two sides' numbers is the points
  swing. One blow-up hole costs a hundred rather than one, which is the whole
  appeal. The number is built by running the digits together rather than by
  arithmetic, so a 5 and a 10 is 510, the number a group would actually write
  down, and not 105. The birdie flip — a birdie turning the other side's
  number around, 45 becoming 54 — is a setup toggle, because plenty of groups
  don't play it; left unset it is on, so a round saved before the option
  existed still scores the way it was played. Vegas needs 2 v 2 teams, picked
  at setup like Match Play's and Nassau's, with no 1 v 1 tab to wonder about.
  *Quota* gives every player a target — 2 points a hole, less their handicap,
  so 36 minus your handicap over 18 — and then plays for Stableford points
  against it. Beat your number and you are plus. Its one trap is that the
  handicap is spent entirely on the target, so the card is read **gross**;
  taking strokes off as well would hand every stroke out twice. The target is
  prorated to the holes actually scored, so mid-round the board asks whether
  you're keeping pace instead of showing the whole field deep in the red — and,
  more to the point, so money can't move between two different handicaps
  before a ball is struck. Both games settle through the existing engine:
  Vegas per point per player on each side, Quota on the difference in result.
- **Stats.** A new screen, reachable from the "Your rounds" header on Home,
  showing what the rounds already on the device add up to: scoring average
  against par, best round, the scoring mix (eagles through doubles-and-worse),
  skins won, and where each player stands on the money across every round with
  stakes. Nothing new is stored — every figure is derived from
  `press.rounds.v1` on demand, which is what keeps cross-round history on the
  free side of the accounts-and-sync question rather than behind it. Averages
  are quoted per 18 holes so a league nine and a full round compare honestly,
  and each card says how many holes it counted. Only a fully scored round can
  be somebody's best, so a card with three holes missing can't win on to-par
  for the wrong reason. Net is shown as a second figure only when handicaps
  actually moved the number. Players are matched across rounds by name — a
  `Player.id` is minted per round, so name is the only thing that follows
  somebody — using the same rule the setup screen already uses to recall
  players. A round counts once it's finished, or once every hole is scored:
  the round somebody forgot to tap Finish on is still a round they played, and
  one abandoned after four holes is excluded from every average rather than
  dragging it around.
- **Back up and restore your rounds.** Settings now writes every saved round
  and favorite course to a single `press-backup-YYYY-MM-DD.json` file, and
  reads one back. Press keeps everything in `localStorage` and nowhere else —
  that is what lets it work with no account and no signal, and it also meant
  clearing site data, switching phones, or reinstalling took every round with
  it, permanently and without warning. This is the way out, and incidentally
  the only way to move a round between two devices without a backend. On a
  phone the file goes through the share sheet (Files, iCloud, a message —
  somewhere that outlives the browser) and falls back to a download
  everywhere else. A restore **merges and never deletes**: rounds the device
  has never seen are added, a round in the file replaces the local copy only
  when it is genuinely newer, and a tie keeps what is already here. So
  restoring last week's backup onto a phone that has since played three more
  holes leaves those holes alone, and restoring the same file twice does
  nothing the second time. A saved course is never overwritten, since it
  carries no timestamp to judge by and the local copy may be the corrected
  one. A damaged entry is dropped and counted rather than costing the user
  the rest of the file, and a round naming a game this build has no engine
  for is dropped too — a backup from a newer Press would otherwise crash the
  Home screen. Both stores are written together and rolled back if either
  write fails, so a restore that runs out of room leaves the device exactly
  as it was.
- **The app answers a mouse.** Every pressable surface now has a hover state —
  a faint fairway tint at roughly half the strength of its press, so hover
  reads as "you can hit this" and the press still reads as more. The primary
  CTA darkens rather than tints, because its label is white and lightening it
  would have cost contrast. All of it sits behind `@media (hover: hover)`: a
  phone reports hover support for the emulated mouse behind a tap, so without
  that guard the last control you touched stays lit until you touch something
  else. Press had answered the finger and the keyboard for a while; this is the
  third input it gets used with, and the one it had been ignoring.
- **Sheets can be pushed back down.** Settings, How to Play, Send feedback and
  Edit handicaps now follow a downward drag and dismiss on release — either
  from distance (a quarter of the sheet's own height, so a short sheet and a
  tall one ask for the same proportion of a pull) or from a flick, measured
  over the last 100ms of the gesture so a drag you stopped and thought better
  of springs back instead. A drag that starts while a long sheet is scrolled
  still scrolls it. A grab handle appears wherever a finger is available to use
  it, and not on mouse-only machines, where the gesture does not exist.
- **Round awards**: a finished round now hands out superlatives — Shot of the
  Day, Bounce Back, The Snowman, Sandbagger, The ATM, Highway Robbery, Skin
  Thief, Wolf's Gamble, and Shut Out. They appear as a card under the winner
  hero on Results and as an `AWARDS` block on the shared results PNG. Each is
  a pure function of the finished `Round` in `src/games/awards.ts`, unit-tested
  alongside the scoring engines, and every award cites the number behind it —
  "Cy found trouble on 4 · 7 on a par 4 · +3" — so the ribbing is backed by the
  card. A round only earns the awards it actually deserves: candidates that
  don't clear their threshold simply don't fire, so a quiet gross round shows
  nothing rather than filler. The top four are shown, ranked by notability,
  with no player taking more than two so the whole group gets ribbed. Money
  awards rank on their share of the round's biggest swing rather than on raw
  dollars, so a $2 game and a $50 game produce the same card. There is
  deliberately no "biggest winner" award — the hero above already says that.
  Highway Robbery reads money per hole from a running settlement (the round
  truncated hole by hole) rather than `money.holeSwing`, whose counterfactual
  is only exact for the most recent hole; that's what lets a carried skin be
  credited to the hole that actually won it.
- **Stroke index on the scorecard**: the Card tab now carries an SI row under
  Hole and Par, showing each hole's difficulty rank — the number that decides
  where handicap strokes fall. It shows in gross rounds too, since it's a fact
  about the course rather than about how you're scoring.
- **Share the scorecard**: Results now has two share buttons. "Results" is the
  existing standings-and-settlement scoreboard; "Scorecard" is new — the full
  hole-by-hole grid as a landscape PNG in the same clubhouse livery,
  with pars, stroke indexes, every player's card, and circle/square marks. The
  board widens with the hole count, so a 9-hole league night doesn't come out
  half empty.
- **Landscape**: turning the phone sideways now expands the app across the
  screen instead of leaving it in a narrow column — the scorecard fits all 18
  holes without scrolling sideways. The installed app was previously locked to
  portrait by its manifest and wouldn't rotate at all.
- **Settings sheet**: an Appearance picker (System / Light / Dark), the Glare
  mode toggle, and Keep screen awake now live in one place, reachable from a
  gear on Home, Setup, and League Setup, and as a third toolbar button in Play.
  Dark mode is an explicit choice now, not just a mirror of the phone's system
  setting — pick it directly, or leave Appearance on System to keep following
  the OS. A system-appearance change repaints live, with no reload.
- **About block and in-app feedback**: the Settings sheet now ends with an About
  block — `Press v<version>`, "Created by Jesse Morrison", and the PolyForm
  Noncommercial License 1.0.0 — the first attribution reachable from inside the
  app itself. The version is read from `package.json` at build time, so it
  can't drift out of sync with a release. A new "Send feedback" row opens a
  Bug/Idea form in the same sheet (not a stacked dialog): a message, an
  optional name that's remembered after the first submission, and a Send
  button. App version, screen, browser/OS, and viewport are attached
  automatically; the round in progress (player names and scores) is attached
  only behind an explicit opt-in checkbox that states exactly what it sends,
  and the checkbox only appears while a round is open — it's absent from Home.
  Reports are written to `localStorage` before they're sent, so one composed
  on a course with no signal isn't lost; delivery retries on reconnect and at
  app start. Transport is Netlify Forms — no backend was added.
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
- **The splash now hands over to the app instead of cutting to it.** The
  loading splash used to live inside `#root`, so React deleted it the instant
  it mounted: deep green felt became the app background in a single frame,
  and the app's own entrance animation then started independently of it. It
  now sits outside `#root` and fades over 260ms while that entrance plays, so
  the two read as one arrival. Reduced motion removes it outright.
- **Sheets are real modal dialogs.** Settings, How to Play, Send feedback and
  Edit handicaps are now `<dialog>` elements opened with `showModal()`. What
  changes for a keyboard or screen-reader user: Tab is genuinely trapped in
  the sheet (it previously walked out into the screen behind, which the
  sheet's own `aria-modal="true"` had been promising it would not), closing a
  sheet returns focus to the control that opened it rather than dropping it at
  the top of the page, and the page behind no longer scrolls under an open
  sheet. Escape, the scrim tap and the X are unchanged, exit animation and all.
- **The money line cross-fades between the running total and a hole's swing**
  rather than cutting between two different sets of text in the same box, the
  armed Delete button now grows into "Delete?" instead of shoving the row
  sideways in a single frame, and a share button fades into "Building…" rather
  than swapping its icon and label out in one. That last one only shows on a
  card big enough to take a moment to draw — a small round renders in under a
  frame, and the button rightly does nothing visible at all.
- **The browser's own chrome now follows the theme.** `theme-color` was one
  fixed brand green, so on Android the address bar stayed green while the app
  sat at near-black in dark mode. It is now repainted from the palette
  whenever the theme resolves — including an explicit Dark choice on a light
  phone, which a media-query variant could not have covered.
- `computeWolf` now tallies its points from a new exported `wolfOutcomes`,
  which resolves each Wolf hole's sides, result, and multiplier. Same scoring,
  one copy of the rules — the awards engine reads the same outcomes to find
  the lone and blind gambles worth talking about.
- **One-tap score entry**: the Hole tab's `−`/`+` stepper is now a row of
  score chips centred on par — `3 4 5 6 7` on a par 4 — so any score from
  birdie to triple bogey is a single tap. A typical hole costs four taps
  instead of eight. Tapping the selected chip clears that score, which also
  fixes a dead end: a score set on the Hole tab previously couldn't be unset
  without switching to the Card tab. Anything outside the range (an eagle, a
  snowman) opens a 1–15 grid from the `…` chip, in place, with no keyboard.
  Chips are 44px tall, capped at 72px wide in landscape so they don't stretch
  edge to edge on a rotated phone. The score readout no longer draws the
  circle/square scoring mark on this tab — that's a scorecard convention and
  stays on the Card tab, where it's the only over/under-par signal on the
  cell; on the Hole tab the tone-coloured left border and the selected chip's
  fill already say the same thing, so the ring was redundant weight that also
  grew every non-par row by 20px. The rows are still taller than the old
  single-line stepper. An earlier version of this note claimed "four players
  fit on screen without scrolling" — that was measured on a synthetic 812px
  viewport with no browser chrome and no safe-area inset, and it was wrong on
  every real device: a 390×750 installed PWA (iPhone 15) overflowed by ~60px
  and needed a scroll to see the fourth row. A follow-up padding/gap trim
  (tighter `.screen`/`.hole-view` gaps, slimmer `.hole-nav`/`.hole-dots`
  padding, a smaller `.hole-num`, and a 44px `.nav-arrow`) plus the safe-area
  double-count fix below closes that gap — four players now clear
  `.play-foot` with room to spare on a real 390×750 device, and a fivesome
  still scrolls to see everyone, with Next Hole staying pinned via
  `.play-foot`'s existing `position: sticky`.
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
- **Changing screens no longer drops keyboard focus on the floor.** A view swap
  unmounts the control that was just activated, so focus fell to the page
  body: a keyboard user started every screen over from the top of the
  document, and a screen reader was told nothing at all about the screen that
  had just arrived. Focus now moves to the new screen's heading, which also
  puts the screen at its top rather than inheriting the last one's scroll
  position. Home gained a real `<h1>` in the process — its outline used to
  open at `<h2>`, alone among the screens.
- **Course search now says "Searching…" out loud.** Its searching, error and
  no-matches lines were plain text, so a screen-reader user got silence while
  a lookup ran and silence when it failed. They are one live region now,
  mounted before it has anything to say — announcing from an element that is
  inserted with its text already in place is missed by many screen readers.
- **Pinch-zoom works again on Android.** The viewport meta carried
  `maximum-scale=1.0`, which blocks zoom on Android (iOS has ignored it since
  iOS 10) and is a WCAG 1.4.4 failure. Nothing in the layout needed it.
- **The Play screen double-counted the bottom safe-area inset**: `.screen`'s
  base padding already adds `env(safe-area-inset-bottom)`, and `.play-foot` —
  the last child on the Play screen — separately adds its own
  `env(safe-area-inset-bottom)` on top of that, so the home-indicator inset
  was applied twice: worth roughly 34px of extra page height, and extra
  scrolling, on any notched iPhone. `.screen.play` now uses a flat 12px
  bottom padding with no inset term, since `.play-foot`'s own padding already
  clears the home indicator. Home, Setup, League Setup, and Results have no
  `.play-foot` and keep the original inset-aware `.screen` padding.
- **League rounds showed no handicap strokes on the scorecard**: the Card tab
  decided whether to draw stroke markers from the `useNet` flag, which league
  rounds don't set even though they score net. The result was a card showing
  each player's handicap beside their name and not a single stroke marker in
  the grid. It now names the matches a stroke applies to — `A`, `B`, `T` — the
  same way the Hole view already did.
- The Play screen's primary button never pinned — its `position: sticky` had no
  room to move inside a containing block only as tall as itself, leaving the
  CTA below four leaderboards.
- Scoring sat below the fold with multiple games active; the Hole tab now fits
  one screen when you arrive at a hole. Rows hold at a flat ~99px no matter
  what's entered, so four players leave a constant ~22px of overflow instead
  of the up-to-95px the old score-mark rings used to add as scores went in.
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
