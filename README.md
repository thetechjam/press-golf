[![CI](https://github.com/thetechjam/press-golf/actions/workflows/ci.yml/badge.svg)](https://github.com/thetechjam/press-golf/actions/workflows/ci.yml)

# Press ⛳️

**Press** is a mobile-first web app for tracking golf side-games. One scorekeeper
enters scores for the whole group on a single phone, and Press does the math —
live leaderboards and running money totals while you play, then a settle-up
summary at the end.

No accounts, no sign-up, nothing to install from a store. It runs entirely in
your browser, works offline, and keeps everything on your device.

**▶️ Live app: [pressgolf.netlify.app](https://pressgolf.netlify.app)**

## Games

- **Stroke play** — gross or net
- **Match play** — 1v1 and 2v2 best-ball
- **Skins**
- **Stableford**
- **Wolf**
- **Nassau** — 1v1 and 2v2, with manual presses
- **Golf League** — Thursday-night format (A/B singles + combined team match, league points)

Net scoring with per-hole handicap strokes is supported throughout — one stroke
per hole down the stroke index, and a second on the hardest holes when a
handicap exceeds the hole count. Save a course's pars and stroke indexes once and reload them
with a tap, or pull them live from course search.

## Settling up

Set a stake per game and Press tracks everyone's net result live during the
round — a money ticker and per-game breakdown on the Hole and Board tabs —
then resolves the final total into the fewest payments needed to settle the
whole group.

## Awards

A finished round hands out a few superlatives — Shot of the Day, The Snowman,
The ATM, Sandbagger, Wolf's Gamble — ranked by how notable they are and capped
so no one player takes the whole card. They show on the Results screen and on
the shared scoreboard image, and each one cites the number behind it.

## Getting started

Requires [Node](https://nodejs.org) 24+ (see `.nvmrc`).

```bash
npm install
npm run dev            # local dev server
npm run dev -- --host  # expose on your LAN to test on a phone
```

Other scripts:

```bash
npm run test       # run the scoring-engine test suite
npm run typecheck  # tsc -b --noEmit
npm run lint       # oxlint
npm run build      # production build
```

## How it's built

Vite + React + TypeScript, shipped as an installable PWA. Each game is a
pure-function scoring engine in [`src/games/`](./src/games), kept separate from
the UI so the math is unit-tested independently. Deployed to Netlify on every
push to `main`.

## Feedback setup (Netlify)

In-app feedback posts to Netlify Forms. **Form detection is OFF by default on
every new Netlify site.** Three settings live in the Netlify UI, not in this
repo, and **without the first every submission is lost**:

1. **Site configuration → Forms → enable Form detection.** Off is the
   default — this is the step that's easy to skip.
2. **Forms → Form notifications → add an email notification** for the
   `press-feedback` form.
3. **Redeploy.** Detection runs at deploy time; enabling it does not
   retroactively scan the previous build.

The form definition lives in `public/__forms.html`. It is the POST target as
well as the definition — posting to `/` would hit the catch-all rewrite in
`netlify.toml`, which returns the app shell with HTTP 200 and would make a lost
report look like a successful one. Because `__forms.html` is itself a real
static file, a site with detection off (or not yet redeployed) also answers
POST with 200 and the stub's own HTML instead of a 404 — `postFeedback` in
`src/feedback.ts` checks the response body for the stub's title and treats
that as a failure rather than delivery, so a report is only counted as sent
once Netlify's actual form handler accepts it.

Free tier allows 100 submissions/month. Reports that fail to send stay queued in
the browser and retry — a report is only counted as sent once Netlify's form
handler actually accepts it. The queue holds up to 20 unsent reports; beyond
that, the oldest is discarded to make room for the newest.

## License

Press is released under the [PolyForm Noncommercial License 1.0.0](./LICENSE) —
free to use, modify, and share for any **noncommercial** purpose (play all the
golf games you want). Commercial rights are reserved.

**Why this license?** It matches how Press is meant to be used today — shared
freely with friends for their rounds — while keeping the door open to a paid
product later. As the sole copyright holder I can always loosen this to a fully
open license (e.g. MIT), but a permissive release can't be taken back, so
starting protective costs nothing and preserves every option.
