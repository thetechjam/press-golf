# Creator Attribution and In-App Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit Jesse Morrison in an About block, and give users a way to send bug reports and ideas that reach him with enough context to act on.

**Architecture:** Attribution is a static block in the existing Settings sheet, with the version read from `package.json` through a Vite `define` so it cannot drift. Feedback rides Netlify Forms — no backend — posting to a static `public/__forms.html` to dodge the SPA catch-all rewrite, with a `localStorage` queue so reports written without signal survive. Payload building and queue logic live in `src/feedback.ts` because Vitest collects only `.ts`, and the opt-in round attachment carries other people's data.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 (`environment: 'node'`), Netlify Forms, plain CSS custom properties.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-08-06-press-attribution-feedback-design.md`.
- **Tests are pure-logic only.** `vite.config.ts` sets `environment: 'node'` and `include: ['src/**/*.test.ts']` — `.tsx` is never collected and there is no jsdom or Testing Library. Do not write component tests; they would silently never run. Verify UI manually.
- **Stub browser globals with `vi.stubGlobal`**, following `src/storage.test.ts:5-11`.
- `npm run typecheck` is `tsc -b --noEmit`. **Do not change it to `tsc --noEmit`** — the root tsconfig is solution-style (`"files": []` with `references`), so without `-b` it compiles zero files and exits 0 regardless of what is broken.
- `tsconfig.app.json` sets `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (type-only imports need `import type`).
- `npm test` is `vitest run`; the suite starts at **165 passing** and must never drop. `npm run build` must succeed. `npm run lint` has exactly 2 pre-existing `TeamPicker.tsx` warnings; add none.
- Commit after every task. Never commit with a failing gate.
- The reporter's name is self-supplied; the **round is the only third-party data**, and it must never leave the device unless `includeRound` is explicitly true.

---

### Task 1: Version constant and the About block

**Files:**
- Modify: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/version.test.ts`
- Modify: `src/components/SettingsSheet.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: global `__APP_VERSION__: string`.

- [ ] **Step 1: Write the failing test**

Create `src/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the Vite `define`. If the define is removed or misspelled, the app
// would silently show a stale hand-typed version instead of the real one.
describe('__APP_VERSION__', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- version`
Expected: FAIL — `__APP_VERSION__ is not defined`.

- [ ] **Step 3: Add the define**

In `vite.config.ts`, add at the top after the existing imports:

```ts
import { readFileSync } from 'node:fs'

// Read rather than `import pkg from './package.json'`: tsconfig.node.json does
// not enable resolveJsonModule, and import attributes would tie this config to
// a specific Node JSON-parsing mode.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }
```

and add this key to the `defineConfig({ ... })` object, as a sibling of `test` and `plugins`:

```ts
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
```

- [ ] **Step 4: Declare the global**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

/** Injected by Vite from package.json — see `define` in vite.config.ts. */
declare const __APP_VERSION__: string;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- version`
Expected: PASS.

- [ ] **Step 6: Add the About block**

In `src/components/SettingsSheet.tsx`, insert immediately before the closing `</Sheet>` tag:

```tsx
      <div className="about">
        <div className="about-title">
          Press <span className="about-ver">v{__APP_VERSION__}</span>
        </div>
        <div className="about-line">Created by Jesse Morrison</div>
        <div className="about-line">PolyForm Noncommercial License 1.0.0</div>
      </div>
```

The name matches `LICENSE` exactly. No GitHub link — deliberate.

- [ ] **Step 7: Style it**

Append to `src/index.css`:

```css
/* ---------- About ---------- */
.about {
  border-top: 1px solid var(--line);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--muted);
  font-size: 0.85rem;
}
.about-title {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--ink);
  font-size: 0.95rem;
}
.about-ver {
  color: var(--muted);
  font-weight: 500;
}
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all clean, 166 tests.

- [ ] **Step 9: Manual check**

Run `npm run dev`, open the gear on Home, scroll to the bottom of the sheet. Confirm it reads `Press v0.1.0` / `Created by Jesse Morrison` / `PolyForm Noncommercial License 1.0.0`, and that it is legible in Light, Dark, and Glare.

- [ ] **Step 10: Commit**

```bash
git add vite.config.ts src/vite-env.d.ts src/version.test.ts src/components/SettingsSheet.tsx src/index.css
git commit -m "Credit the creator in an About block"
```

---

### Task 2: Remember the reporter's name

**Files:**
- Modify: `src/storage.ts:9-55`
- Modify: `src/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Settings.reporterName: string` (default `''`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('settings', ...)` in `src/storage.test.ts`:

```ts
  it('defaults reporterName to an empty string', () => {
    expect(getSettings().reporterName).toBe('');
  });

  it('round-trips reporterName', () => {
    saveSettings({ reporterName: 'Bo' });
    expect(getSettings().reporterName).toBe('Bo');
  });

  // getSettings and saveSettings both build their result field-by-field (so the
  // legacy `sunlight` key cannot survive a write). A field added to only one of
  // them vanishes on the next unrelated save — this is the guard for that.
  it('keeps reporterName across an unrelated save', () => {
    saveSettings({ reporterName: 'Bo' });
    saveSettings({ keepAwake: false });
    expect(getSettings().reporterName).toBe('Bo');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- storage`
Expected: FAIL — `reporterName` is `undefined`.

- [ ] **Step 3: Add the field in all three places**

In `src/storage.ts`, add to the `Settings` interface:

```ts
  /** Remembered so a reporter types their name once. '' means not set. */
  reporterName: string;
```

add to `DEFAULT_SETTINGS`:

```ts
  reporterName: '',
```

add to the object literal returned by `getSettings`:

```ts
      reporterName:
        typeof p.reporterName === 'string' ? p.reporterName : DEFAULT_SETTINGS.reporterName,
```

and add to the `next` literal in `saveSettings`:

```ts
    reporterName: patch.reporterName ?? cur.reporterName,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- storage`
Expected: PASS, including all pre-existing settings tests.

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck`
Expected: clean, 169 tests.

- [ ] **Step 6: Commit**

```bash
git add src/storage.ts src/storage.test.ts
git commit -m "Remember the feedback reporter's name"
```

---

### Task 3: Feedback payload and offline queue

**Files:**
- Create: `src/feedback.ts`
- Create: `src/feedback.test.ts`

**Interfaces:**
- Consumes: `uid()` from `src/storage.ts`; `Round` from `src/types.ts`.
- Produces: `FeedbackKind`, `QueuedFeedback`, `FeedbackDraft`, `FeedbackContext`, `Poster`, `buildFeedback`, `enqueue`, `listQueue`, `flushQueue`, `watchConnectivity`.

- [ ] **Step 1: Write the failing tests**

Create `src/feedback.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildFeedback, enqueue, listQueue, flushQueue } from './feedback';
import type { QueuedFeedback, FeedbackContext } from './feedback';
import { makeRound, player } from './games/testFixtures';

// Vitest runs in node — back localStorage with a Map, per storage.test.ts.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const round = makeRound({
  players: [player('p1', 'Zebediah', 10), player('p2', 'Quintus', 4)],
});

const ctx = (over: Partial<FeedbackContext> = {}): FeedbackContext => ({
  screen: 'play',
  version: '9.9.9',
  userAgent: 'TestAgent/1.0',
  viewport: '375x812',
  ...over,
});

const draft = (over = {}) => ({
  kind: 'bug' as const,
  reporter: 'Bo',
  message: 'Skins look wrong',
  includeRound: false,
  ...over,
});

describe('buildFeedback — the privacy line', () => {
  it('omits the round when not opted in', () => {
    expect(buildFeedback(draft(), ctx({ round })).round).toBe('');
  });

  it('includes the round when opted in', () => {
    const e = buildFeedback(draft({ includeRound: true }), ctx({ round }));
    expect(e.round).toContain('Zebediah');
  });

  it('omits the round when opted in but no round is in context', () => {
    expect(buildFeedback(draft({ includeRound: true }), ctx()).round).toBe('');
  });

  // The regression guard: diagnostics must never carry third-party data,
  // whatever the opt-in says.
  it('never puts player names in diagnostics', () => {
    for (const include of [false, true]) {
      const e = buildFeedback(draft({ includeRound: include }), ctx({ round }));
      expect(e.diagnostics).not.toContain('Zebediah');
      expect(e.diagnostics).not.toContain('Quintus');
    }
  });

  it('carries the technical context', () => {
    const d = JSON.parse(buildFeedback(draft(), ctx()).diagnostics);
    expect(d).toEqual({
      screen: 'play',
      version: '9.9.9',
      userAgent: 'TestAgent/1.0',
      viewport: '375x812',
    });
  });
});

describe('buildFeedback — fields', () => {
  it('accepts a blank reporter', () => {
    expect(buildFeedback(draft({ reporter: '' }), ctx()).reporter).toBe('');
  });

  it('trims reporter and message', () => {
    const e = buildFeedback(draft({ reporter: '  Bo  ', message: '  hi  ' }), ctx());
    expect(e.reporter).toBe('Bo');
    expect(e.message).toBe('hi');
  });
});

describe('queue', () => {
  beforeEach(() => store.clear());

  it('starts empty and round-trips an entry', () => {
    expect(listQueue()).toEqual([]);
    enqueue(buildFeedback(draft(), ctx()));
    expect(listQueue()).toHaveLength(1);
  });

  it('caps at 20, dropping the oldest', () => {
    for (let i = 0; i < 21; i++) {
      enqueue(buildFeedback(draft({ message: `m${i}` }), ctx()));
    }
    const q = listQueue();
    expect(q).toHaveLength(20);
    expect(q[0].message).toBe('m1');
    expect(q[19].message).toBe('m20');
  });
});

describe('flushQueue', () => {
  beforeEach(() => store.clear());

  const seed = (n: number) => {
    for (let i = 0; i < n; i++) enqueue(buildFeedback(draft({ message: `m${i}` }), ctx()));
  };

  it('empties the queue when every post succeeds', async () => {
    seed(3);
    const res = await flushQueue(async () => {});
    expect(res).toEqual({ sent: 3, remaining: 0 });
    expect(listQueue()).toEqual([]);
  });

  it('keeps entries and counts attempts when posting fails', async () => {
    seed(2);
    const res = await flushQueue(async () => {
      throw new Error('offline');
    });
    expect(res).toEqual({ sent: 0, remaining: 2 });
    expect(listQueue().map((e) => e.attempts)).toEqual([1, 1]);
  });

  it('sends what it can and keeps the rest', async () => {
    seed(3);
    const res = await flushQueue(async (e: QueuedFeedback) => {
      if (e.message === 'm1') throw new Error('nope');
    });
    expect(res).toEqual({ sent: 2, remaining: 1 });
    expect(listQueue()[0].message).toBe('m1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- feedback`
Expected: FAIL — `Cannot find module './feedback'`.

- [ ] **Step 3: Create `src/feedback.ts`**

```ts
import type { Round } from './types';
import { uid } from './storage';

/**
 * Feedback capture. Writes to localStorage first and sends second, so a report
 * composed on a course with no signal is never lost.
 */

const QUEUE_KEY = 'press.feedback.queue.v1';
/** Bounded so a permanently offline install cannot grow localStorage forever. */
const MAX_QUEUE = 20;

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
  /** Which screen the sheet was opened from. Passed in — a sheet cannot know. */
  screen: string;
  version: string;
  userAgent: string;
  viewport: string;
  /** The active round, when there is one. Attached only if the draft opts in. */
  round?: Round;
}

/** Posts one entry. Resolves on acceptance, rejects on any failure. */
export type Poster = (entry: QueuedFeedback) => Promise<void>;

export function buildFeedback(draft: FeedbackDraft, ctx: FeedbackContext): QueuedFeedback {
  // The round is the only third-party data here — other people's names and
  // scores. It travels only on an explicit opt-in, and never via diagnostics.
  const attach = draft.includeRound && ctx.round != null;
  return {
    id: uid(),
    kind: draft.kind,
    reporter: draft.reporter.trim(),
    message: draft.message.trim(),
    diagnostics: JSON.stringify({
      screen: ctx.screen,
      version: ctx.version,
      userAgent: ctx.userAgent,
      viewport: ctx.viewport,
    }),
    round: attach ? JSON.stringify(ctx.round) : '',
    queuedAt: Date.now(),
    attempts: 0,
  };
}

export function listQueue(): QueuedFeedback[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as QueuedFeedback[];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedFeedback[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueue(entry: QueuedFeedback): void {
  writeQueue([...listQueue(), entry].slice(-MAX_QUEUE));
}

/**
 * Attempts every queued entry. Failures stay queued with `attempts` bumped —
 * nothing is ever dropped for failing, including when the monthly Netlify cap
 * is the cause.
 */
export async function flushQueue(post: Poster): Promise<{ sent: number; remaining: number }> {
  const keep: QueuedFeedback[] = [];
  let sent = 0;
  for (const entry of listQueue()) {
    try {
      await post(entry);
      sent += 1;
    } catch {
      keep.push({ ...entry, attempts: entry.attempts + 1 });
    }
  }
  writeQueue(keep);
  return { sent, remaining: keep.length };
}

/** Retry whatever is queued as soon as the device comes back online. */
export function watchConnectivity(post: Poster): void {
  window.addEventListener('online', () => {
    void flushQueue(post);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- feedback`
Expected: PASS (12 tests).

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck`
Expected: clean, 181 tests.

- [ ] **Step 6: Commit**

```bash
git add src/feedback.ts src/feedback.test.ts
git commit -m "Add feedback payload building and offline queue"
```

---

### Task 4: Netlify transport

**Files:**
- Create: `public/__forms.html`
- Modify: `vite.config.ts` (workbox `globIgnores`)
- Modify: `src/feedback.ts` (add `postFeedback`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `Poster`, `QueuedFeedback` (Task 3).
- Produces: `postFeedback: Poster`.

- [ ] **Step 1: Create the form definition file**

Create `public/__forms.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Press form definitions</title>
  </head>
  <body>
    <!--
      Not a user-facing page. Two jobs:

      1. Netlify detects forms by scanning deployed HTML at build time. A form
         rendered by React is invisible to that scan, so the definition has to
         exist as static markup.
      2. This file is also the POST target. Posting to "/" would hit the
         catch-all `status = 200` rewrite in netlify.toml, which applies to
         POSTs too — the request would be rewritten to the app shell and return
         200 with HTML, so the app would report success while nothing reached
         the inbox. Netlify serves a real file before applying redirects.
    -->
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

- [ ] **Step 2: Keep it out of the precache manifest**

In `vite.config.ts`, inside `VitePWA({ workbox: { ... } })`, add alongside the existing `globPatterns`:

```ts
        // A build artifact for Netlify's form scanner, not an app asset.
        globIgnores: ['**/__forms.html'],
```

- [ ] **Step 3: Add the production poster**

Append to `src/feedback.ts`:

```ts
const FORM_ENDPOINT = '/__forms.html';
const FORM_NAME = 'press-feedback';

/**
 * Production poster. Deliberately omits `bot-field`: Netlify discards any
 * submission whose honeypot field is non-empty, so sending it at all — even
 * with a placeholder — risks binning every real report.
 */
export const postFeedback: Poster = async (entry) => {
  const body = new URLSearchParams({
    'form-name': FORM_NAME,
    kind: entry.kind,
    reporter: entry.reporter,
    message: entry.message,
    diagnostics: entry.diagnostics,
    round: entry.round,
  });
  const res = await fetch(FORM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Feedback POST failed: ${res.status}`);
};
```

- [ ] **Step 4: Document the manual Netlify setup**

Add a section to `README.md`, matching the file's existing heading style and voice:

```markdown
## Feedback setup (Netlify)

In-app feedback posts to Netlify Forms. Two settings live in the Netlify UI, not
in this repo, and **without the first every submission is lost**:

1. **Site configuration → Forms → enable Form detection.**
2. **Forms → Form notifications → add an email notification** for the
   `press-feedback` form.
3. **Redeploy.** Detection runs at deploy time; enabling it does not
   retroactively scan the previous build.

The form definition lives in `public/__forms.html`. It is the POST target as
well as the definition — posting to `/` would hit the catch-all rewrite in
`netlify.toml`, which returns the app shell with HTTP 200 and would make a lost
report look like a successful one.

Free tier allows 100 submissions/month. Reports that fail to send stay queued in
the browser and retry; nothing is dropped.
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all clean, 181 tests.

Then confirm the file survives the build and is excluded from the precache:

```bash
test -f dist/__forms.html && echo "forms file present"
grep -c "__forms" dist/sw.js
```

Expected: `forms file present`, and `0` from the grep (it must not be in the precache manifest).

- [ ] **Step 6: Commit**

```bash
git add public/__forms.html vite.config.ts src/feedback.ts README.md
git commit -m "Add Netlify Forms transport for feedback"
```

---

### Task 5: Feedback UI

**Files:**
- Create: `src/components/FeedbackForm.tsx`
- Modify: `src/components/SettingsSheet.tsx`
- Modify: `src/screens/Play.tsx`, `src/screens/Home.tsx`, `src/screens/Setup.tsx`, `src/screens/LeagueSetup.tsx`
- Modify: `src/main.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `SettingsSheet` props `{ onClose: () => void; screen: string; round?: Round }`.

- [ ] **Step 1: Create the feedback form**

Create `src/components/FeedbackForm.tsx`:

```tsx
import { useState } from 'react';
import type { Round } from '../types';
import type { FeedbackKind } from '../feedback';
import { buildFeedback, enqueue, flushQueue, postFeedback } from '../feedback';
import { getSettings, saveSettings } from '../storage';

interface Props {
  screen: string;
  round?: Round;
  onBack: () => void;
}

type Status = null | 'sent' | 'queued';

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
];

export function FeedbackForm({ screen, round, onBack }: Props) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [reporter, setReporter] = useState(() => getSettings().reporterName);
  const [message, setMessage] = useState('');
  const [includeRound, setIncludeRound] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const name = reporter.trim();
    if (name) saveSettings({ reporterName: name });
    enqueue(
      buildFeedback(
        { kind, reporter: name, message, includeRound },
        {
          screen,
          version: __APP_VERSION__,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          round,
        }
      )
    );
    const { remaining } = await flushQueue(postFeedback);
    setStatus(remaining === 0 ? 'sent' : 'queued');
    setMessage('');
    setSending(false);
  };

  return (
    <div className="feedback">
      <button className="btn-ghost fb-back" onClick={onBack}>
        ‹ Settings
      </button>

      <div className="seg">
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`seg-btn${kind === k.id ? ' active' : ''}`}
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
          >
            {k.label}
          </button>
        ))}
      </div>

      <label className="fb-field">
        <span className="set-label">Your name</span>
        <input
          className="fb-input"
          value={reporter}
          placeholder="Optional"
          onChange={(e) => setReporter(e.target.value)}
        />
      </label>

      <label className="fb-field">
        <span className="set-label">What happened?</span>
        <textarea
          className="fb-text"
          rows={5}
          value={message}
          placeholder={kind === 'bug' ? 'What went wrong, and on which hole?' : 'What would you add?'}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {round && (
        <label className="set-row">
          <span>
            <span className="set-label">Include this round</span>
            <span className="set-hint">Player names and scores — helps reproduce scoring bugs</span>
          </span>
          <input
            type="checkbox"
            checked={includeRound}
            onChange={(e) => setIncludeRound(e.target.checked)}
          />
        </label>
      )}

      <button className="btn-primary big" onClick={send} disabled={!message.trim() || sending}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {status && (
        <p className="fb-status" role="status">
          {status === 'sent'
            ? 'Sent — thanks!'
            : "Saved — it'll send when you're back online."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Settings sheet**

In `src/components/SettingsSheet.tsx`:

Change the signature and add view state:

```tsx
import { useState } from 'react';
import type { Round } from '../types';
import { FeedbackForm } from './FeedbackForm';
import { listQueue } from '../feedback';

interface Props {
  onClose: () => void;
  screen: string;
  round?: Round;
}

export function SettingsSheet({ onClose, screen, round }: Props) {
  const [view, setView] = useState<'settings' | 'feedback'>('settings');
  const queued = listQueue().length;
```

(keep the existing `const [s, setS] = useState(getSettings);` and `set` helper).

Wrap the return so one `Sheet` serves both views — **not** a nested sheet; stacking two full-screen overlays on a phone is bad:

```tsx
  return (
    <Sheet title={view === 'feedback' ? 'Send feedback' : 'Settings'} onClose={onClose}>
      {view === 'feedback' ? (
        <FeedbackForm screen={screen} round={round} onBack={() => setView('settings')} />
      ) : (
        <>
          {/* The existing Appearance group, Glare row and Keep-awake row move
              into this fragment UNCHANGED — same JSX, same handlers, just
              re-indented one level. Do not rewrite them. */}

          <button className="set-row set-action" onClick={() => setView('feedback')}>
            <span>
              <span className="set-label">Send feedback</span>
              <span className="set-hint">
                {queued > 0
                  ? `${queued} report${queued === 1 ? '' : 's'} waiting to send`
                  : 'Report a bug or suggest an idea'}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>

          {/* The About block added in Task 1 stays here, last, unchanged. */}
        </>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 3: Pass the new props from every mount site**

`src/screens/Play.tsx` — it has the round:

```tsx
<SettingsSheet onClose={closeSettings} screen="play" round={round} />
```

`src/screens/Home.tsx`: add `screen="home"`.
`src/screens/Setup.tsx`: add `screen="setup"`.
`src/screens/LeagueSetup.tsx`: add `screen="leagueSetup"`.

Only `Play` passes `round`, so the round checkbox never appears on the menu screens.

- [ ] **Step 4: Flush at boot and on reconnect**

In `src/main.tsx`, add after the existing `watchSystemTheme()` call:

```ts
import { flushQueue, postFeedback, watchConnectivity } from './feedback'

// Retry anything written while offline. Fire-and-forget — a failure just
// leaves the entry queued for the next attempt.
void flushQueue(postFeedback)
watchConnectivity(postFeedback)
```

- [ ] **Step 5: Style it**

Append to `src/index.css`:

```css
/* ---------- Feedback ---------- */
.feedback {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.fb-back {
  align-self: flex-start;
  padding: 0;
  min-height: var(--tap);
}
.fb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fb-input,
.fb-text {
  font: inherit;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  width: 100%;
}
.fb-text {
  resize: vertical;
  min-height: 96px;
}
.fb-status {
  margin: 0;
  color: var(--under-ink);
  font-size: 0.9rem;
}
.set-action {
  width: 100%;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all clean, 181 tests.

- [ ] **Step 7: Manual check**

Run `npm run dev` at 375px. The `computer` click action is unreliable in this environment (`document.hasFocus()` is false) — dispatch DOM events via JS instead, which goes through React's handlers. Seed rounds via `localStorage` key `press.rounds.v1`.

- Open the gear from **Home** → "Send feedback" → confirm **no** round checkbox.
- Open the gear from **Play** → "Send feedback" → confirm the checkbox **is** there.
- Type a name and a message, Send. In DevTools' Network tab confirm a POST to `/__forms.html` with `form-name=press-feedback`, and confirm the body contains **no** `bot-field`.
- With the round checkbox off, confirm the request body contains no player names.
- Reopen the form and confirm the name is prefilled.
- Go offline (DevTools → Network → Offline), send another, and confirm the status reads "Saved — it'll send when you're back online" and that `localStorage['press.feedback.queue.v1']` holds it.
- Back online, reload, and confirm the queue drains.

Locally the POST will 404 (Netlify only processes forms on the deployed site) — that is expected and exercises the queued path. Real delivery is verified in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/FeedbackForm.tsx src/components/SettingsSheet.tsx src/screens src/main.tsx src/index.css
git commit -m "Add in-app feedback form with offline queue"
```

---

### Task 6: Acceptance sweep and deployed verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the full gate**

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

Expected: all clean.

- [ ] **Step 2: Walk the spec's acceptance criteria**

Check each numbered item at the end of `docs/superpowers/specs/2026-08-06-press-attribution-feedback-design.md` and record a verdict with evidence.

For criterion 1, prove the version is not hard-coded:

```bash
npm version patch --no-git-tag-version && npm run build && grep -o "0\.1\.1" dist/assets/*.js | head -1
git checkout package.json package-lock.json
```

Expected: the new version appears in the bundle. Then the `git checkout` restores it.

- [ ] **Step 3: Update the changelog**

Add an entry covering the About block crediting Jesse Morrison, and in-app feedback with its offline queue, optional remembered name, and opt-in round attachment. Match the file's existing format and voice.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "Document attribution and feedback"
```

- [ ] **Step 5: Report the deployed-verification steps to the human**

**This cannot be completed from the repo.** Report to the user that after merge and deploy they must:

1. Enable **Form detection** in Netlify (Site configuration → Forms), then redeploy.
2. Add an email notification for `press-feedback`.
3. Send one real report from the deployed site and confirm it appears in the Netlify Forms dashboard.

Step 3 is not optional and cannot be replaced by a local check: the failure mode this design guards against — the SPA catch-all rewrite swallowing the POST — returns **HTTP 200 with the app shell**, which is indistinguishable from success to the app. Only seeing the submission in the dashboard proves delivery.
