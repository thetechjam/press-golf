# Press — Roadmap

Press is a mobile PWA for tracking golf side games. **v1 is intentionally
local-only, no-login, and offline-first** — one scorekeeper runs a round for the
group on one phone, then shares the results text. This doc captures what's built,
what's deferred, and how to expand without a rewrite.

## Shipped

- **Games with correct scoring engines** (`src/games/*`): stroke play, match play,
  skins, Stableford (standard + modified), Wolf (partner / lone / blind), Nassau
  (front/back/total) with a **manual press** button.
- **Money / settlement** (`src/games/settlement.ts`): per-game stakes → zero-sum
  net per player → fewest payments ("Bo pays Al $45"), editable on the results
  screen, included in the shared summary.
- **Play flow**: hole-by-hole entry, live per-game leaderboards, scorecard grid
  view, swipe between holes.
- **Guardrails**: warns on unentered scores before advancing/finishing, with
  auto-jump to the first blank player.
- **Handicaps**: net scoring, per-hole stroke index, par presets.
- **Favorite courses** (`storage.ts`, `press.courses.v1`): save pars + stroke
  indexes once, one-tap load later.
- **Course search** (`courses/openGolfApi.ts`, `components/CourseSearch.tsx`):
  live lookup via OpenGolfAPI (keyless, CORS, ODbL open data) prefills pars +
  stroke indexes on the New Round and Golf League screens. Front-nine stroke
  indexes are re-ranked 1–9 for League. Needs signal at setup; Favorite Courses
  is the offline fallback.
- **PWA**: installable, offline, splash screen, install prompt.

## Where data lives today

Everything is in **localStorage**, per browser, per device:

- `press.rounds.v1` — saved/finished rounds
- `press.courses.v1` — favorite courses

Nothing is shared between people or synced across devices. This is by design
(no backend, no cost, works with zero signal on the course).

## Deferred features

| Feature | Notes |
|---|---|
| Accounts + cloud sync | History follows you across devices; enables everything below. |
| Live multi-phone sync | Each player scores on their own phone; join a round via a game code; leaderboards sync in real time. |
| Cross-round stats / history | Trends over time (skins won, Wolf record, net scoring average). |
| Automatic Nassau presses | Setup toggle to auto-press when a side goes 2 down (plumbing already exists via the press segments in `nassau.ts`). |
| ~~Course database~~ | **Shipped** via OpenGolfAPI course search (keyless + CORS, so no backend needed; returns per-hole par and `handicap_index`). Coverage is US-strong; Favorite Courses covers gaps and offline use. |

## How to expand without a rewrite

The architecture was kept deliberately layered so growth is a swap, not a teardown:

1. **Scoring engine is pure and isolated** (`src/games/*`). All game math and the
   settlement engine are pure functions of a `Round`. Cloud/multiplayer work does
   **not** touch them.
2. **Storage is behind one module** (`src/storage.ts`). It's the only place that
   reads/writes persistence. Going cloud mostly means reimplementing this file
   against a backend (and making its functions async).
3. **A `Round` is one serializable object** (`src/types.ts`) — already ready to
   send over a network.

### Suggested migration path (if traction warrants it)

1. **Backend**: Supabase or Firebase (both low-lift, generous free tiers, built-in
   auth + realtime).
2. **Auth**: add a light sign-in; keep local-only mode as an offline fallback.
3. **Sync**: back `storage.ts` with the DB; store rounds under a user id.
4. **Live multiplayer**: a round gets a short join code; players subscribe to
   realtime updates on that round; the scorekeeper (or anyone) writes scores.
   Conflict handling can stay simple (last-write-wins per hole/player cell).
5. **Deploy**: still static frontend on Netlify; backend is a managed service.

Keeping the local-first path intact means the app still works on a course with no
signal, syncing when a connection returns.
