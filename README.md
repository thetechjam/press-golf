[![CI](https://github.com/thetechjam/press-golf/actions/workflows/ci.yml/badge.svg)](https://github.com/thetechjam/press-golf/actions/workflows/ci.yml)

# Press ⛳️

**Press** is a mobile-first web app for tracking golf side-games. One scorekeeper
enters scores for the whole group on a single phone, and Press does the math —
live leaderboards while you play and a settle-up summary at the end.

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

Net scoring with per-hole handicap strokes is supported throughout (capped at one
stroke per hole). Save a course's pars and stroke indexes once and reload them
with a tap, or pull them live from course search.

## Settling up

Set a stake per game and Press resolves everyone's net result to a zero-sum total,
then works out the fewest payments needed to settle the whole group.

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
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run build      # production build
```

## How it's built

Vite + React + TypeScript, shipped as an installable PWA. Each game is a
pure-function scoring engine in [`src/games/`](./src/games), kept separate from
the UI so the math is unit-tested independently. Deployed to Netlify on every
push to `main`.

## License

Press is released under the [PolyForm Noncommercial License 1.0.0](./LICENSE) —
free to use, modify, and share for any **noncommercial** purpose (play all the
golf games you want). Commercial rights are reserved.

**Why this license?** It matches how Press is meant to be used today — shared
freely with friends for their rounds — while keeping the door open to a paid
product later. As the sole copyright holder I can always loosen this to a fully
open license (e.g. MIT), but a permissive release can't be taken back, so
starting protective costs nothing and preserves every option.
