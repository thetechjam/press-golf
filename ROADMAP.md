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

---

## Monetization (research brief)

_Added 2026-07-01. Research pass on how Press could realistically make money **if
it gains traction**, and what each path actually costs to build. Press is 100%
client-side today (no backend, no accounts, no DB), so the load-bearing question
for every model below is: **does it force a backend?**_

**License angle first:** Press ships under [PolyForm Noncommercial 1.0.0](./LICENSE),
which reserves all commercial rights to the sole copyright holder. Nothing here
requires a license change — the owner is already clear to monetize. (Public copies
stay noncommercial; a paid build is the owner's private commercial fork.)

### The models, by lift

Legend — **Lift**: 🟢 client-side only (ship this weekend) · 🟡 one integration ·
🔴 forces a backend + accounts + sync.

| Model | What it is | Revenue potential | Lift | Forces a backend? |
|---|---|---|---|---|
| **One-time "Pro" unlock** | Pay once to unlock premium games/views; unlock stored locally (or via a license key / store IAP). | Low–moderate; no recurring revenue. | 🟢 | No — a client-side entitlement flag or store IAP is enough. |
| **Freemium hosted "Pro"** | Free core, paywall advanced games (Wolf/League), settlement export, extra course saves. | Moderate. | 🟢–🟡 | No, *if* the gate is client-side. A hosted checkout (Stripe/Gumroad/Lemon Squeezy) needs no backend of your own. |
| **Subscription (monthly / season)** | Recurring access, ideally seasonal ("$X for the golf season"). | Highest per-user, but hardest to justify on a client-only app. | 🔴 | Effectively yes — recurring billing wants server-side entitlement checks + accounts, or you lean entirely on a store's subscription plumbing. |
| **Cloud sync across a foursome** | Rounds follow you across devices; live multi-phone scoring via a join code. | Indirect (it's the feature that *justifies* a subscription). | 🔴 | **Yes.** This is the deferred "Accounts + cloud sync" work already scoped above (Supabase/Firebase). |
| **Cross-round stats / history** | Trends over time (skins won, Wolf record, net average). | Indirect; strong retention/upsell hook. | 🟡–🔴 | Local-only history is 🟡 (already all in `localStorage`). *Cross-device* history is 🔴. |
| **Affiliate — gear & tee times** | Contextual links: tee-time booking, golf gear. | Low–moderate; scales with traffic, not features. | 🟢 | No — plain outbound links. |
| **Sponsorship / local-course partnerships** | A course or local shop sponsors a branded round / league mode. | Lumpy but real for a niche league audience. | 🟢–🟡 | No — a config flag / themed build. |
| **Ads** | Banner/interstitial ad network. | Low at this scale; hurts the clean, offline feel. | 🟢 | No. |

### Which models force the backend

The single biggest cost cliff is **accounts + cloud sync**. Everything genuinely
recurring (subscriptions, foursome sync, cross-device history) sits on the far
side of it. That's not a reason to avoid them — it's a reason to sequence them
_after_ traction, since the migration path above (Supabase/Firebase) is exactly
the enabling work. Everything else (one-time unlock, affiliate, sponsorship,
local-only stats, a client-side paywall) ships without touching the current
architecture.

### Competitive / pricing benchmarks

Real price points, verified where noted. These are full GPS/handicap platforms —
Press is narrower (side games + settlement), so treat them as a **ceiling**, not
a comparable.

| App | Price | Confidence |
|---|---|---|
| **TheGrint** | Handicap ~$19.99/yr · Pro ~$39.99/yr (one source lists a ~$80 premium tier) | Medium — tiers vary by source |
| **Golf GameBook** | Gold ~$39.99/yr; 14-day trial; core scoring/side games free | High |
| **18Birdies** | ~$7.99/wk · ~$19.99/mo · ~$99.99/yr; 7-day trial | High |
| **Golfshot** | ~$30/yr | Medium |
| **Hole19** | ~$40/yr | Medium |
| **Arccos** | ~$12/mo / ~$100/yr (+ ~$200 sensors) | Medium |
| **Shot Scope** | one-time ~$200 hardware, no subscription | Medium |

**Read on pricing:** the crowded lane is **$30–$100/yr subscriptions**, and the
free tier (GameBook) still gives away core scoring and side games. A subscription
for Press's feature set alone would be a hard sell against that. A **one-time
unlock in the ~$5–$15 range** or **seasonal pricing** is the more honest fit for a
solo-maintained, single-purpose tool.

**Affiliate benchmarks** (verified via aggregators, Medium confidence):

- **Golf gear:** Callaway up to 9% · Vice 6% · FootJoy 5% · PXG 6% (or $25/fitting)
  · Club Champion $25/referral · The Indoor Golf Shop 5%+. 30-day windows typical.
- **Tee times (GolfNow):** commission reported inconsistently — "$1–$4 per round,"
  "$3.00 per round," and "up to 15% + $0.10/click" all appear across sources.
  **Unverified** — confirm directly with GolfNow's partnership program before
  banking on a number.

### Anti-patterns to avoid

- **Ads / bloat that kill the offline, no-login feel.** Press's whole pitch is
  "nothing to install, works with zero signal." Ads and forced accounts trade the
  differentiator for pennies. Skip ads unless traffic is genuinely large.
- **Charging a subscription for a client-only app.** Recurring price with no
  recurring server-side value invites chargebacks and churn. Don't gate behind a
  subscription until cloud sync makes the recurring value real.
- **Building the backend "to be safe" before anyone's paying.** The migration is a
  swap, not a rewrite (by design) — defer it until demand is proven.
- **A paywall shape that punishes the scorekeeper.** One person enters scores for
  the group; if Pro-locking a game breaks the shared round for four friends, it
  reads as hostile, not premium.

### Recommended sequencing

1. **Now (🟢, no architecture change):** add an **affiliate link or two** (tee-time
   booking near the course search; gear links) and a **"buy me a coffee" / tip**
   link. Zero lift, tests whether the audience will spend at all.
2. **On early traction (🟢–🟡):** ship a **one-time "Pro" unlock** (~$5–$15) via a
   hosted checkout (Gumroad / Lemon Squeezy / Stripe) or store IAP, gating
   nice-to-haves (advanced games, settlement export, unlimited saved courses) —
   **never the shared-round core.** Explore a **local-course / league sponsorship**
   for the Thursday-night League format, a natural fit.
3. **Only once retention/demand is proven (🔴, backend required):** do the scoped
   **accounts + cloud sync** work, and *then* — with real recurring value —
   introduce **seasonal or monthly pricing** for sync + cross-device history +
   live multi-phone scoring.

**Bottom line:** monetize the edges first (affiliate, tip jar, one-time unlock,
sponsorship) with zero backend. Save subscriptions for after cloud sync exists to
justify them.
