# Creator Attribution and In-App Feedback

_Design spec — 2026-08-06_

## Problem

**1. Press carries no attribution anywhere a user can see it.** `LICENSE` says
`Copyright (c) 2026 Jesse Morrison` and `README.md` refers to "the sole copyright
holder", but neither is reachable from the app. `package.json` has no `author`
field. Someone who installs Press from a shared link has no way to learn who made
it.

**2. There is no route from a user noticing a bug to Jesse hearing about it.**
Press is shared with a golf group, used on a course, and stores everything
locally. When someone's skins total looks wrong, the report arrives — if at all —
as a text message hours later, with no version, no screen, and no scores.

## Design

### A. About block in the Settings sheet

A block at the bottom of the existing `SettingsSheet`:

> **Press** v0.1.0
> Created by Jesse Morrison
> PolyForm Noncommercial License 1.0.0

Name matches `LICENSE` exactly. **No GitHub link** — the About block is for the
people who play with Press, not for developers, and a repo link would make the
app read as a side project rather than a product.

**The version must come from `package.json`, not a hand-typed string**, or it
drifts silently the first time it is bumped. `vite.config.ts` reads the file and
exposes it as a `define`:

```ts
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// ...
define: { __APP_VERSION__: JSON.stringify(pkg.version) },
```

`readFileSync` rather than a JSON import: `tsconfig.node.json` does not enable
`resolveJsonModule`, and import attributes would tie the config to a specific
Node parsing mode. A new `src/vite-env.d.ts` declares the global:

```ts
/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
```

Vitest reads the same Vite config, so `__APP_VERSION__` is defined in tests too.

### B. Feedback transport, and the redirect that would silently eat it

**Netlify Forms**, because Press already deploys to Netlify: no backend, no new
account, no third-party dependency, and submissions land in the Netlify dashboard
with email notification. Free tier is 100 submissions/month, which is far beyond
a golf group.

**The trap.** `netlify.toml` ends with the standard SPA catch-all:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

A `status = 200` rewrite is applied to POSTs as well as GETs. A form POST to `/`
is rewritten to the app shell and comes back **200 with HTML** — so the app sees
a success response, tells the user "Sent", and nothing ever reaches the inbox.
Silent data loss wearing a success message.

The fix is to POST to a real static file, because Netlify serves an existing file
before it applies redirects. `public/__forms.html` carries the form definition
that Netlify's build-time detector scans for, and is also the POST target:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Press form definitions</title></head>
  <body>
    <!-- Not a user-facing page. Netlify detects forms by scanning deployed
         HTML at build time; a React-rendered form is invisible to that scan.
         This file is also the POST target — posting to "/" would hit the SPA
         catch-all rewrite in netlify.toml and silently return the app shell. -->
    <form name="press-feedback" netlify netlify-honeypot="bot-field" hidden>
      <input type="hidden" name="form-name" value="press-feedback" />
      <input name="bot-field" />
      <input type="text" name="kind" />
      <input type="text" name="reporter" />
      <textarea name="message"></textarea>
      <textarea name="diagnostics"></textarea>
      <textarea name="round"></textarea>
    </form>
  </body>
</html>
```

Submission is a urlencoded POST:

```ts
await fetch('/__forms.html', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ 'form-name': 'press-feedback', ...fields }).toString(),
});
```

**Spam:** Netlify's `netlify-honeypot="bot-field"`. Invisible to humans, no
captcha, no friction for someone trying to report a scoring bug. The app must
**omit `bot-field` from its POST entirely** — Netlify discards any submission
where that field is non-empty, so sending it with a value (even a placeholder)
would silently bin every real report.

**Service worker:** verified not to interfere. `vite-plugin-pwa` runs in
generateSW mode; Workbox's navigation fallback only matches requests with
`mode === 'navigate'`, and precache routes match GET only, so a `fetch` POST
passes through to the network. `__forms.html` is added to `globIgnores` so it
stays out of the precache manifest — it is a build artifact for Netlify, not an
app asset.

### C. Offline queue

Press is used on golf courses. Feedback is written to `localStorage` first and
sent second, so a report composed with no signal is never lost.

`src/feedback.ts` owns this:

```ts
export type FeedbackKind = 'bug' | 'idea';

export interface QueuedFeedback {
  id: string;
  kind: FeedbackKind;
  /** Self-supplied reporter name, or '' if they left it blank. */
  reporter: string;
  message: string;
  /** JSON string of technical context. Never contains player data. */
  diagnostics: string;
  /** JSON string of the round, or '' when not attached. */
  round: string;
  queuedAt: number;
  attempts: number;
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  /** Who is reporting. Optional — an empty string is valid. */
  reporter: string;
  message: string;
  includeRound: boolean;
}

export interface FeedbackContext {
  /** Which screen the sheet was opened from, e.g. 'play' | 'home' | 'setup'. */
  screen: string;
  version: string;
  userAgent: string;
  viewport: string; // "375x812"
  /** The active round, when there is one. Attached only if the draft opts in. */
  round?: Round;
}

/** Posts one entry. Resolves on acceptance, rejects on any failure. */
export type Poster = (entry: QueuedFeedback) => Promise<void>;

export function buildFeedback(draft: FeedbackDraft, ctx: FeedbackContext): QueuedFeedback;
export function enqueue(entry: QueuedFeedback): void;
export function listQueue(): QueuedFeedback[];
export function flushQueue(post: Poster): Promise<{ sent: number; remaining: number }>;
export function watchConnectivity(post: Poster): void;
```

`flushQueue` and `watchConnectivity` both take the poster as a parameter rather
than calling `fetch` directly, so the queue logic is testable in Vitest's `node`
environment without stubbing the network. The production poster, `postFeedback`,
is exported from the same module and injected at the call sites.

**`screen` is passed in, not inferred.** `SettingsSheet` cannot know which screen
mounted it, so each mounting screen supplies a literal: `Play` passes `'play'`,
`Home` passes `'home'`, `Setup` `'setup'`, `LeagueSetup` `'leagueSetup'`.

Flush runs on three triggers: app start (`main.tsx`, alongside
`watchSystemTheme()`), the `online` event, and immediately on submit.

**Delivery failures keep the entry queued and say so.** A failed send shows
"Saved — sends when you're back online", never "Sent". Retries are unbounded and
`attempts` is tracked for display only; nothing is dropped for failing too often,
including when the monthly Netlify cap is the cause. The queue is capped at
**20 entries**, dropping oldest-first, purely so a permanently offline install
cannot grow `localStorage` without bound.

### D. What a report carries, and the privacy line

**Always attached**, no privacy cost: app version, the screen the user was on,
`navigator.userAgent`, and viewport size.

**The round is opt-in**, behind a checkbox whose label states exactly what it
sends: *"Include this round (player names and scores) — helps me reproduce
scoring bugs."* The checkbox renders **only when a round is in context** —
`SettingsSheet` takes an optional `round` prop that `Play` passes and the other
screens do not — so it never appears on Home.

**`buildFeedback` lives in `src/feedback.ts`, not in the component.** A bug in
the opt-in branch would ship other people's names and scores off a device from an
app that is otherwise strictly local-only, and `vite.config.ts` collects only
`src/**/*.test.ts` — logic inside a `.tsx` component cannot be tested at all.
This is the same split already used for `roundEdits.ts` and `scoreEntry.ts`.

### E. UI structure

`SettingsSheet` gains a local `view: 'settings' | 'feedback'` and renders one
`<Sheet>` whose title and body switch. **Not a nested sheet** — stacking two
overlay dialogs is bad on a phone, and `Sheet` is a full-screen backdrop. The
feedback view carries its own "‹ Settings" back control; the sheet's X still
closes everything.

Settings view gains, above the About block:
- a **Send feedback** row that switches to the feedback view;
- when the queue is non-empty, a line reading "1 report waiting to send" so a
  queued item is never invisible.

Feedback view: Bug / Idea segmented control (reusing `.seg`/`.seg-btn`), a
**"Your name" text input**, a message `<textarea>`, the round checkbox when
applicable, a Send button, and a status line.

### F. Remembering the reporter

An anonymous report is a dead end — there is no way to ask "which hole?". The
name is **optional** (a blank submission still sends) and **remembered**, so the
cost is paid once.

`Settings` gains `reporterName: string`, defaulting to `''`, persisted in the
existing `press.settings.v1` blob and prefilled into the form. A non-empty name
is written back on submit.

⚠️ **`storage.ts` builds both `getSettings` and `saveSettings` field-by-field**
— deliberately, so the legacy `sunlight` key cannot survive a write. That means a
new setting must be added in **three** places or it silently vanishes on the next
save: `DEFAULT_SETTINGS`, the object literal in `getSettings`, and the `next`
literal in `saveSettings`. A spread would have picked it up automatically; this
shape will not.

The field is sent to Netlify as `reporter`, **not** `name` — `form-name` is
already meaningful to Netlify, and a bare `name` field invites confusion when
reading submissions in the dashboard.

## Files

| File | Change |
|---|---|
| `vite.config.ts` | `define` for `__APP_VERSION__`; `globIgnores` for `__forms.html`. |
| `src/vite-env.d.ts` | New. Declares `__APP_VERSION__`. |
| `public/__forms.html` | New. Netlify form definition and POST target. |
| `src/feedback.ts` | New. Payload building, queue, flush, connectivity watch. |
| `src/feedback.test.ts` | New. |
| `src/components/FeedbackForm.tsx` | New. Feedback view body. |
| `src/components/SettingsSheet.tsx` | View switch, Send feedback row, About block, `round` + `screen` props. |
| `src/storage.ts` | Add `reporterName` to `Settings` (three places — see §F). |
| `src/storage.test.ts` | Cover `reporterName` default and round-trip. |
| `src/screens/Play.tsx` | Pass `round` and `screen="play"` to `SettingsSheet`. |
| `src/screens/Home.tsx`, `Setup.tsx`, `LeagueSetup.tsx` | Pass their `screen` literal. |
| `src/main.tsx` | `flushQueue` at boot + `watchConnectivity()`. |
| `src/index.css` | About block, feedback form, status line. |
| `README.md` | The Netlify setup steps below. |

## Netlify setup — required, and only Jesse can do it

Neither step can be done from the repo, and **without the first, submissions
return 404 and every report is lost**:

1. Netlify → Site configuration → **Forms** → enable **Form detection**.
2. Netlify → Forms → **Form notifications** → add an email notification for
   `press-feedback`.
3. Redeploy after enabling detection, so `__forms.html` is scanned. Detection
   runs at deploy time — enabling it does not retroactively scan the last build.

These go in `README.md` so they survive this conversation.

## Testing

`feedback.test.ts`, with `localStorage` stubbed via `vi.stubGlobal` following the
existing pattern at `src/storage.test.ts:5-11`:

- **The privacy matrix** — `includeRound: false` yields `round === ''`;
  `includeRound: true` with a round yields JSON containing the players;
  `includeRound: true` with no round in context yields `round === ''`.
- **Diagnostics never carry player data** — build an entry from a round whose
  players have distinctive names and assert those names do not appear anywhere in
  `entry.diagnostics`. This is the regression guard on the privacy line.
- **Queue cap** — enqueueing 21 entries keeps 20, dropping the oldest.
- **Reporter is optional** — a blank name builds a valid entry with `reporter: ''`.
- **`reporterName` survives a save** — set it, save an unrelated setting, read it
  back. Guards the three-places trap in §F.
- **Flush** — all-success empties the queue; a rejecting poster leaves entries
  queued with `attempts` incremented; a partial failure sends what it can and
  keeps the rest.
- Existing 165 tests stay green.

No component tests: `.tsx` files are never collected by Vitest, so they would
silently never run.

## Acceptance

1. The About block shows the version from `package.json`; bumping the version in
   `package.json` changes it with no other edit.
2. A submission with the round unchecked contains no player names anywhere in the
   payload — verified by inspecting the actual network request body.
3. A submission made offline reports "Saved", persists across a reload, and sends
   on reconnect.
4. A real submission on the deployed site arrives in the Netlify Forms dashboard.
   **This must be verified against the deployed site, not locally** — the
   catch-all-rewrite failure mode returns HTTP 200 with the app shell, so a
   local or naive check cannot distinguish success from silent loss.
5. The round checkbox does not appear when Settings is opened from Home.
6. A name entered once is prefilled on the next report, and survives changing an
   unrelated setting.
7. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` all clean.

## Verified in production — 2026-08-06

A real report from the deployed app arrived in the Netlify Forms dashboard,
closing every open item on this spec.

**The sentinel guard produces no false negatives.** `postFeedback` rejects when
the response body contains the stub's `Press form definitions` title, because a
static host with no form handler attached answers POST with 200 and the stub
itself — which would otherwise be counted as delivery and the report deleted.
It was unknown whether Netlify's *success* response also echoes the stub. It
does not: the submission was accepted and delivered with `attempts: 0`. The
guard can stay as written.

**The privacy boundary held in production.** The report was sent from Home, and
the `Round` field arrived empty — the checkbox is only offered when a round is
in context.

`queuedAt` arrived in diagnostics as intended, so compose time is distinguishable
from Netlify's receipt time.

## Note for future layout work — verify at the real viewport

The first real report carried `"viewport":"402x554"`. All layout verification
during implementation was done at **375×812**, which is 258px taller than the
device actually reports in Safari.

Measured afterwards on a 4-player league round:

| Context | Height | Result |
|---|---|---|
| Safari, browser chrome visible | 554px | overflows 153px, one player below the fold |
| Installed to home screen (standalone) | ~781px | no overflow, all four visible |

**This is pre-existing, not caused by that work**: the same round scored gross,
with no handicap badges and no stroke chips, still overflows by 134px with a
player below the fold. The badges and chips cost 19px of the 153.

Decision: the installed PWA is the target. `manifest.display` is `standalone`,
Home already prompts installation, and the Hole tab fits there with the CTA at
667 of 781. Compressing the scoring UI by 153px to serve a browser tab would
cost touch-target size in the mode actually used on a course.

The transferable lesson is the diagnostics one: this was invisible until a real
device reported its own viewport. Verify layout against the viewport your users
report, not the one the emulator defaults to.
