# Theme Control, Visible Handicaps, and Mid-Round Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the overloaded `sunlight` toggle into a real Appearance picker plus a renamed Glare mode, surface handicaps everywhere they are used, and let handicaps and scores be corrected mid-round.

**Architecture:** Theme resolution moves out of seven scattered `@media (prefers-color-scheme: dark)` blocks into a single JS-applied `.dark` class, so an explicit Light/Dark choice becomes expressible. Handicap visibility routes through one `usesHandicaps()` predicate because league rounds carry `useNet: false`. League stroke display shares its baseline math with `computeLeague` through an extracted helper, guarded by an invariant test.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 (`environment: 'node'`), plain CSS with custom properties. No component library, no CSS framework.

## Global Constraints

- **Tests are pure-logic only.** `vite.config.ts` sets `environment: 'node'` and `include: ['src/**/*.test.ts']` — `.tsx` files are never collected and there is no jsdom or Testing Library. Do not write component tests; verify UI manually per each task's Verify step.
- **Stub browser globals with `vi.stubGlobal`**, following the existing pattern at `src/storage.test.ts:5-11`.
- Spec of record: `docs/superpowers/specs/2026-08-05-press-theme-handicaps-design.md`.
- Run `npm test` (not `vitest` directly) — it is `vitest run`.
- Commit after every task. Never commit with a failing test.
- `--gold` is invisible on light backgrounds; any new gold-toned element must use `--gold-ink` in light and Glare, `--gold` in dark (regression fixed in `bbaca25`).
- Existing `src/games/*.test.ts` must stay green throughout. Only `league.ts` gains real logic changes.

---

### Task 1: Settings model — `theme` field and `sunlight` → `glare` migration

**Files:**
- Modify: `src/storage.ts:5-31`
- Test: `src/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Theme = 'system' | 'light' | 'dark'`; `interface Settings { keepAwake: boolean; theme: Theme; glare: boolean }`; `DEFAULT_SETTINGS`; `getSettings(): Settings`; `saveSettings(patch: Partial<Settings>): Settings`.

- [ ] **Step 1: Write the failing tests**

Append to `src/storage.test.ts`, inside the existing `describe('settings', ...)`:

```ts
  it('defaults theme to system and glare off', () => {
    expect(getSettings().theme).toBe('system');
    expect(getSettings().glare).toBe(false);
  });

  it('carries a v1 sunlight:true across to glare', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    expect(getSettings().glare).toBe(true);
  });

  it('drops the legacy sunlight key on the next write', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    saveSettings({ keepAwake: false });
    expect(JSON.parse(store.get('press.settings.v1')!)).toEqual({
      keepAwake: false,
      theme: 'system',
      glare: true,
    });
  });

  it('falls back to system when a stored theme is unrecognized', () => {
    store.set('press.settings.v1', JSON.stringify({ theme: 'sepia' }));
    expect(getSettings().theme).toBe('system');
  });

  it('persists an explicit theme', () => {
    saveSettings({ theme: 'dark' });
    expect(getSettings().theme).toBe('dark');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- storage`
Expected: FAIL — `theme` is `undefined`, `glare` is `undefined`.

- [ ] **Step 3: Replace the settings block in `src/storage.ts`**

Replace lines 5–31 (from `const SETTINGS_KEY` through the end of `saveSettings`) with:

```ts
const SETTINGS_KEY = 'press.settings.v1';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Hold a screen wake lock while scoring. */
  keepAwake: boolean;
  /** Which palette to paint. 'system' follows the OS appearance. */
  theme: Theme;
  /** Max-contrast light theme for direct sun. Overrides `theme` while on. */
  glare: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  keepAwake: true,
  theme: 'system',
  glare: false,
};

const THEMES: readonly string[] = ['system', 'light', 'dark'];
const isTheme = (v: unknown): v is Theme => typeof v === 'string' && THEMES.includes(v);

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings> & { sunlight?: unknown };
    return {
      keepAwake: typeof p.keepAwake === 'boolean' ? p.keepAwake : DEFAULT_SETTINGS.keepAwake,
      theme: isTheme(p.theme) ? p.theme : DEFAULT_SETTINGS.theme,
      // v1 stored this as `sunlight`. Read it across explicitly — a spread over
      // defaults would silently reset an enabled setting to false on upgrade.
      glare: typeof p.glare === 'boolean' ? p.glare : p.sunlight === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const cur = getSettings();
  // Field-by-field rather than a spread, so the legacy `sunlight` key is not
  // carried forward into the next write.
  const next: Settings = {
    keepAwake: patch.keepAwake ?? cur.keepAwake,
    theme: patch.theme ?? cur.theme,
    glare: patch.glare ?? cur.glare,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- storage`
Expected: PASS, including the three pre-existing `settings` tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `src/screens/Play.tsx` and `src/main.tsx` referencing `sunlight` — those are fixed in Tasks 3 and 4. No errors in `storage.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/storage.ts src/storage.test.ts
git commit -m "Add theme setting and migrate sunlight to glare"
```

---

### Task 2: `theme.ts` — resolution and application

**Files:**
- Create: `src/theme.ts`
- Test: `src/theme.test.ts`
- Delete (in Task 3): `src/sunlight.ts`

**Interfaces:**
- Consumes: `Theme` from `src/storage.ts` (Task 1).
- Produces: `resolveTheme(theme: Theme, glare: boolean): 'light' | 'dark'`; `applyTheme(theme: Theme, glare: boolean): void`; `watchSystemTheme(): void`.

- [ ] **Step 1: Write the failing test**

Create `src/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTheme, applyTheme } from './theme';

// Vitest runs in node — back the DOM bits this module touches with fakes.
const classes = new Set<string>();
const style: Record<string, string> = {};
let systemDark = false;

vi.stubGlobal('document', {
  documentElement: {
    classList: {
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
      },
    },
    style,
  },
});
vi.stubGlobal('matchMedia', () => ({
  matches: systemDark,
  addEventListener: () => {},
}));

describe('resolveTheme', () => {
  beforeEach(() => {
    systemDark = false;
  });

  it('returns the explicit choice when glare is off', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system appearance on system', () => {
    systemDark = true;
    expect(resolveTheme('system', false)).toBe('dark');
    systemDark = false;
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('forces light whenever glare is on, whatever the theme', () => {
    systemDark = true;
    expect(resolveTheme('dark', true)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    classes.clear();
    systemDark = false;
  });

  it('adds .dark for an explicit dark theme', () => {
    applyTheme('dark', false);
    expect(classes.has('dark')).toBe(true);
    expect(classes.has('glare')).toBe(false);
    expect(style.colorScheme).toBe('dark');
  });

  it('never sets .dark and .glare together', () => {
    applyTheme('dark', true);
    expect(classes.has('glare')).toBe(true);
    expect(classes.has('dark')).toBe(false);
    expect(style.colorScheme).toBe('light');
  });

  it('clears .dark when switching back to light', () => {
    applyTheme('dark', false);
    applyTheme('light', false);
    expect(classes.has('dark')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- theme`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Create `src/theme.ts`**

```ts
import type { Theme } from './storage';

/**
 * Theme application. Resolution happens here rather than in CSS because a
 * `@media (prefers-color-scheme: dark)` rule cannot express "the user chose
 * Dark on a light phone" — index.css keys off the `.dark` class this sets.
 */

const DARK_QUERY = '(prefers-color-scheme: dark)';

const prefersDark = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;

/** The palette actually painted, after Glare's override and System's resolution. */
export function resolveTheme(theme: Theme, glare: boolean): 'light' | 'dark' {
  // Glare is a contrast tool, not a theme: it forces the light palette so the
  // high-contrast variables in :root.glare have a light base to override.
  if (glare) return 'light';
  if (theme === 'system') return prefersDark() ? 'dark' : 'light';
  return theme;
}

// Held so the matchMedia listener can re-apply the user's actual choice.
let current: { theme: Theme; glare: boolean } = { theme: 'system', glare: false };

export function applyTheme(theme: Theme, glare: boolean): void {
  current = { theme, glare };
  const resolved = resolveTheme(theme, glare);
  const root = document.documentElement;
  // `.dark` and `.glare` are mutually exclusive by construction — index.css
  // relies on that, which is what lets its rules stay single-class.
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('glare', glare);
  root.style.colorScheme = resolved;
}

/**
 * Repaint when the OS appearance changes. Stays registered even while Glare is
 * on, so turning Glare off lands on the correct theme rather than a stale one.
 */
export function watchSystemTheme(): void {
  if (typeof matchMedia !== 'function') return;
  matchMedia(DARK_QUERY).addEventListener('change', () => {
    applyTheme(current.theme, current.glare);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- theme`
Expected: PASS (9 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts src/theme.test.ts
git commit -m "Add theme resolution with glare override"
```

---

### Task 3: CSS theme rewrite, light-mode contours, boot wiring

**Files:**
- Modify: `src/index.css` (lines 40, 43–58, 62–71, 198–205, 256–262, 473–476, 530–533, 567–572, 946–949)
- Modify: `src/main.tsx`
- Delete: `src/sunlight.ts`

**Interfaces:**
- Consumes: `applyTheme`, `watchSystemTheme` (Task 2); `getSettings` (Task 1).
- Produces: `.dark` and `.glare` class contracts on `<html>` for all later CSS.

- [ ] **Step 1: Rewrite the dark palette block**

In `src/index.css`, replace lines 43–58 entirely:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.sunlight) {
```

becomes:

```css
/* Dark palette. Applied by theme.ts as a class, not a media query, so an
   explicit Dark choice works on a light phone. */
:root.dark {
```

and delete the now-extra closing brace at line 58 (the block loses one nesting level — the inner `}` at line 57 becomes the block's own close).

- [ ] **Step 2: Rename the glare block**

Replace line 62 `:root.sunlight {` with `:root.glare {`, and update the comment at lines 60–61 to:

```css
/* Glare mode: max-contrast light theme for direct daylight, whatever the
   Appearance setting. Deliberately texture-free — see the spec. */
```

- [ ] **Step 3: Green the light-mode contours**

At line 40, inside the base `:root`, change the topo stroke from `rgba(16,35,27,0.05)` to `rgba(20,105,78,0.11)`. This is a single substring inside the `--topo` data URI:

```bash
sed -i '' "s/rgba(16,35,27,0.05)/rgba(20,105,78,0.11)/" src/index.css
```

`--bg` stays `#eef3ee` — darkening it would cut contrast for `--muted` text sitting directly on it.

- [ ] **Step 4: Rewrite the six remaining dark blocks**

Each block has the shape:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.sunlight) .some-selector {
    ...
  }
}
```

Rewrite each to drop the media query and the `:not(.sunlight)` guard, de-indenting one level:

```css
:root.dark .some-selector {
  ...
}
```

The guard is safe to drop because `applyTheme` never sets `.dark` and `.glare` together. Preserve every existing comment. The six blocks and the selectors each must end up carrying:

| Original line | Selectors (each becomes `:root.dark <selector>`) |
|---|---|
| 198 | `.btn-secondary`, `.btn-primary` |
| 256 | `.logo`, `.round-result` |
| 473 | `.cs-hit-name` |
| 530 | `.saved-course-name` |
| 567 | `.round-del.armed`, `.saved-course-del.armed` — comma-separated, **both** prefixed |
| 946 | `.hole-dot.current::before` |

That is nine `:root.dark` rules in total, plus the palette block from Step 1 — ten occurrences of `:root.dark` when you are done.

- [ ] **Step 5: Verify no stale hooks remain**

```bash
grep -n "prefers-color-scheme\|sunlight" src/index.css
grep -c ":root.dark" src/index.css
```

Expected: no output from the first (any hit is an unconverted block); `10` from the second.

Note `@media (prefers-reduced-motion: reduce)` blocks are unrelated and must stay.

- [ ] **Step 6: Rewire boot in `src/main.tsx`**

Replace the two `sunlight` lines:

```ts
import { getSettings } from './storage'
import { applyTheme, watchSystemTheme } from './theme'

// Applied before render so there is no flash of the wrong palette.
const settings = getSettings()
applyTheme(settings.theme, settings.glare)
watchSystemTheme()
```

- [ ] **Step 7: Delete the old module**

```bash
rm src/sunlight.ts
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run typecheck`
Expected: tests PASS. Typecheck reports errors only in `src/screens/Play.tsx` (still importing `applySunlight` and `SunIcon`) — fixed in Task 4.

- [ ] **Step 9: Manual check**

Run `npm run dev`. In DevTools, set `<html class="dark">` by hand and confirm the dark palette paints; set `class="glare"` and confirm max-contrast white; clear both and confirm the light palette shows **visibly green** contour lines.

- [ ] **Step 10: Commit**

```bash
git add src/index.css src/main.tsx
git rm src/sunlight.ts
git commit -m "Apply themes by class; green the light-mode contours"
```

---

### Task 4: Sheet primitive, SettingsSheet, and mounting

**Files:**
- Create: `src/components/Sheet.tsx`
- Create: `src/components/SettingsSheet.tsx`
- Modify: `src/icons.tsx` (add `ContrastIcon`, `GearIcon`, `PencilIcon`; remove `SunIcon`)
- Modify: `src/screens/Play.tsx:15,17,48-54,184-192`
- Modify: `src/screens/Home.tsx:51-57`
- Modify: `src/screens/Setup.tsx:231`
- Modify: `src/screens/LeagueSetup.tsx:166`
- Modify: `src/index.css` (append sheet + settings styles)

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `Theme` (Task 1); `applyTheme` (Task 2).
- Produces: `<Sheet title onClose>{children}</Sheet>`; `<SettingsSheet onClose />`; `GearIcon`, `ContrastIcon`, `PencilIcon`.

- [ ] **Step 1: Add the three icons**

In `src/icons.tsx`, delete `SunIcon` (lines 95–101) and append, matching the existing `IconProps` + stroke style used by the neighbouring icons:

```tsx
/** Half-filled circle — contrast, not brightness. Glare mode's mark. */
export const ContrastIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </svg>
);

export const GearIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const PencilIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
```

- [ ] **Step 2: Create the Sheet primitive**

`src/components/Sheet.tsx` — the codebase has no modal pattern, and Tasks 4 and 8 both need one:

```tsx
import { useEffect, useRef } from 'react';
import { XIcon } from '../icons';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Bottom sheet: backdrop, Escape to dismiss, focus moved in on open. */
export function Sheet({ title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create SettingsSheet**

`src/components/SettingsSheet.tsx`:

```tsx
import { useState } from 'react';
import type { Theme } from '../storage';
import { getSettings, saveSettings } from '../storage';
import { applyTheme } from '../theme';
import { Sheet } from './Sheet';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState(getSettings);

  const set = (patch: Partial<typeof s>) => {
    const next = saveSettings(patch);
    setS(next);
    applyTheme(next.theme, next.glare);
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="set-group">
        <div className="set-label">Appearance</div>
        <div className={`seg${s.glare ? ' seg-disabled' : ''}`}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`seg-btn${s.theme === t.id ? ' active' : ''}`}
              onClick={() => set({ theme: t.id })}
              disabled={s.glare}
              aria-pressed={s.theme === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Without this, picking Dark under Glare appears to do nothing. */}
        {s.glare && (
          <button className="set-override" onClick={() => set({ glare: false })}>
            Glare mode is overriding this — tap to turn off
          </button>
        )}
      </div>

      <label className="set-row">
        <span>
          <span className="set-label">Glare mode</span>
          <span className="set-hint">Max contrast for direct sun</span>
        </span>
        <input type="checkbox" checked={s.glare} onChange={(e) => set({ glare: e.target.checked })} />
      </label>

      <label className="set-row">
        <span>
          <span className="set-label">Keep screen awake</span>
          <span className="set-hint">While scoring a round</span>
        </span>
        <input
          type="checkbox"
          checked={s.keepAwake}
          onChange={(e) => set({ keepAwake: e.target.checked })}
        />
      </label>
    </Sheet>
  );
}
```

- [ ] **Step 4: Mount on Play**

In `src/screens/Play.tsx`: delete the `applySunlight` import (line 15) and the `sunlight` state + `toggleSunlight` (lines 48–54). Change the icons import (line 17) to `import { EyeIcon, ContrastIcon, GearIcon } from '../icons';`. Add near the other state:

```tsx
  const [showSettings, setShowSettings] = useState(false);
  const [glare, setGlare] = useState(() => getSettings().glare);
  const toggleGlare = () => {
    const next = !glare;
    setGlare(next);
    const s = saveSettings({ glare: next });
    applyTheme(s.theme, s.glare);
  };
```

Import `applyTheme` from `../theme` and `SettingsSheet` from `../components/SettingsSheet`. Replace the sunlight button (lines 184–192) with:

```tsx
        <button
          className={`awake-toggle${glare ? ' on' : ''}`}
          onClick={toggleGlare}
          aria-label="Glare mode"
          aria-pressed={glare}
          title="Glare mode — max contrast for direct sun"
        >
          <ContrastIcon size={20} />
        </button>
        <button
          className="awake-toggle"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon size={20} />
        </button>
```

And render `{showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}` just before the closing `</div>` of `.screen.play`.

Because `keepAwake` is now also editable in the sheet, re-read it when the sheet closes so the two controls cannot disagree:

```tsx
  const closeSettings = () => {
    setShowSettings(false);
    setKeepAwake(getSettings().keepAwake);
  };
```

Use `closeSettings` as the sheet's `onClose`.

- [ ] **Step 5: Mount on Home, Setup, LeagueSetup**

In `src/screens/Setup.tsx` and `src/screens/LeagueSetup.tsx`, replace the empty `<span />` in the header bar with:

```tsx
        <button className="btn-ghost" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon size={20} />
        </button>
```

adding `const [showSettings, setShowSettings] = useState(false);` and rendering `{showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}` at the end of the screen div in each.

In `src/screens/Home.tsx`, add the same button inside `<header className="hero">` as its first child, with `className="hero-settings"`, plus the same state and sheet render.

- [ ] **Step 6: Add styles**

Append to `src/index.css`:

```css
/* ---------- Sheet ---------- */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 17, 11, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
}
.sheet {
  background: var(--card);
  border-radius: var(--radius) var(--radius) 0 0;
  width: 100%;
  max-width: 540px;
  padding: 16px calc(16px + env(safe-area-inset-right))
    calc(24px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 85vh;
  overflow-y: auto;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sheet-head h2 {
  margin: 0;
  font-family: var(--font-display);
}
.sheet-close {
  background: none;
  border: 0;
  color: var(--muted);
  min-width: var(--tap);
  min-height: var(--tap);
}
.set-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--tap);
}
.set-row span {
  display: flex;
  flex-direction: column;
}
.set-label {
  font-weight: 600;
}
.set-hint {
  color: var(--muted);
  font-size: 0.85rem;
}
.seg-disabled {
  opacity: 0.45;
}
.set-override {
  background: none;
  border: 0;
  text-align: left;
  padding: 0;
  color: var(--gold-ink);
  font-size: 0.85rem;
  text-decoration: underline;
  min-height: var(--tap);
}
.hero-settings {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top));
  right: 16px;
  background: none;
  border: 0;
  color: var(--muted);
  min-width: var(--tap);
  min-height: var(--tap);
}
.home .hero {
  position: relative;
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean. No remaining references to `sunlight`:

```bash
grep -rn "sunlight\|SunIcon" src
```

Expected: no output.

- [ ] **Step 8: Manual check**

`npm run dev`. On Home, open the gear: switch System/Light/Dark and confirm each paints immediately. Turn Glare on and confirm the Appearance segment dims, the override line appears, and tapping it restores the theme. Confirm the gear appears on Setup, League Setup, and in the Play toolbar.

- [ ] **Step 9: Commit**

```bash
git add src/components/Sheet.tsx src/components/SettingsSheet.tsx src/icons.tsx src/screens src/index.css
git commit -m "Add settings sheet with appearance picker and glare toggle"
```

---

### Task 5: `usesHandicaps` predicate and handicap badges

**Files:**
- Modify: `src/games/handicap.ts`
- Test: `src/games/handicap.test.ts`
- Modify: `src/screens/HoleView.tsx:102`
- Modify: `src/components/Scorecard.tsx:69`
- Modify: `src/components/Leaderboard.tsx`
- Modify: `src/screens/Play.tsx:226`, `src/screens/Results.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `usesHandicaps(round: Round): boolean`; `Leaderboard` prop `hcpOf?: (playerId: string) => number | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `src/games/handicap.test.ts`:

```ts
import { usesHandicaps } from './handicap';
import type { LeagueSetup } from '../types';

describe('usesHandicaps', () => {
  it('is false for a gross round', () => {
    expect(usesHandicaps(makeRound({ options: { useNet: false } }))).toBe(false);
  });

  it('is true for a net round', () => {
    expect(usesHandicaps(makeRound({ options: { useNet: true } }))).toBe(true);
  });

  // The trap this predicate exists for: LeagueSetup spreads DEFAULT_OPTIONS and
  // never sets useNet, because computeLeague reads player.handicap directly.
  // Gating on useNet alone would hide handicaps in the only rounds that require them.
  it('is true for a league round despite useNet being false', () => {
    const cfg: LeagueSetup = {
      teams: [
        { aId: 'p1', bId: 'p2' },
        { aId: 'p3', bId: 'p4' },
      ],
      pointsPerMatch: 1,
    };
    const r = makeRound({ options: { league: cfg } });
    expect(r.options.useNet).toBe(false);
    expect(usesHandicaps(r)).toBe(true);
  });
});
```

Ensure `makeRound` is imported at the top of the file (it already is, if the file uses fixtures; otherwise add `import { makeRound } from './testFixtures';`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- handicap`
Expected: FAIL — `usesHandicaps is not a function`.

- [ ] **Step 3: Add the predicate**

Append to `src/games/handicap.ts`:

```ts
/**
 * Whether this round uses handicaps at all — the gate for every handicap
 * display. Not the same as `options.useNet`: league rounds ship `useNet: false`
 * (LeagueSetup spreads DEFAULT_OPTIONS) yet score net through computeLeague,
 * which reads `player.handicap` directly.
 */
export const usesHandicaps = (round: Round): boolean =>
  round.options.useNet || round.options.league != null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- handicap`
Expected: PASS.

- [ ] **Step 5: Show the badge on every handicap round**

In `src/screens/HoleView.tsx`, import `usesHandicaps` from `../games/handicap` and change line 102 from:

```tsx
              handicap={round.options.league ? p.handicap : undefined}
```

to:

```tsx
              handicap={usesHandicaps(round) ? (p.handicap ?? 0) : undefined}
```

- [ ] **Step 6: Add the badge to the scorecard name cell**

In `src/components/Scorecard.tsx`, import `usesHandicaps`, add `const showHcp = usesHandicaps(round);` beside the existing `useNet`, and replace line 69:

```tsx
                <th className="sc-name">{p.name}</th>
```

with:

```tsx
                <th className="sc-name">
                  <span className="sc-name-text">{p.name}</span>
                  {showHcp && (
                    <span className="sc-hcp" aria-label={`Handicap ${p.handicap ?? 0}`}>
                      {p.handicap ?? 0}
                    </span>
                  )}
                </th>
```

The badge goes **inside** the existing sticky cell rather than in a column of its own: `.sc-name` is `position: sticky; left: 0` with no fixed width, so a second sticky column would need an exact `left` offset that long names break.

- [ ] **Step 7: Add `hcpOf` to Leaderboard**

In `src/components/Leaderboard.tsx`, add to `Props`:

```tsx
  hcpOf?: (playerId: string) => number | undefined;
```

destructure it, and inside the `<span className="board-name">` after `board-name-text`:

```tsx
                  {s.playerId && hcpOf?.(s.playerId) != null && (
                    <span className="board-hcp" aria-label={`Handicap ${hcpOf(s.playerId)}`}>
                      {hcpOf(s.playerId)}
                    </span>
                  )}
```

- [ ] **Step 8: Pass `hcpOf` from both call sites**

In `src/screens/Play.tsx`, add near the `colors` computation:

```tsx
  const hcpOf = (id: string) =>
    usesHandicaps(round) ? (round.players.find((p) => p.id === id)?.handicap ?? 0) : undefined;
```

and pass `hcpOf={hcpOf}` on the `<Leaderboard>` at line 226. Do the same in `src/screens/Results.tsx` for its `<Leaderboard>` render. Import `usesHandicaps` in both.

- [ ] **Step 9: Style the badges**

Append to `src/index.css`:

```css
.sc-name-text {
  margin-right: 4px;
}
.sc-hcp,
.board-hcp {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fairway) 18%, transparent);
  color: var(--muted);
  vertical-align: middle;
}
.board-hcp {
  margin-left: 6px;
}
```

- [ ] **Step 10: Verify**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 11: Manual check**

`npm run dev`. Start a round with handicaps: confirm the number shows on the steppers, on the Card tab beside each name (and stays put while scrolling holes), and on the Board tab. Start a **league** round and confirm all three still show. Start a gross round with no handicaps and confirm none of them appear.

- [ ] **Step 12: Commit**

```bash
git add src/games/handicap.ts src/games/handicap.test.ts src/components src/screens src/index.css
git commit -m "Show handicaps on steppers, scorecard, and leaderboards"
```

---

### Task 6: Shared league baselines and `leagueStrokesOnHole`

**Files:**
- Modify: `src/games/league.ts:24-56`
- Test: `src/games/league.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type LeagueMatchKey = 'A' | 'B' | 'T'`; `leagueStrokesOnHole(round: Round, hole: Hole): Record<string, LeagueMatchKey[]>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/games/league.test.ts`:

```ts
import { computeLeague, leagueStrokesOnHole } from './league';

describe('leagueStrokesOnHole', () => {
  // Team 1 (10, 14) v Team 2 (6, 8). A match plays off 6, B match off 8,
  // team match off 4 — three different baselines, so one player receives
  // different strokes in their singles and team matches at the same time.
  const FOUR_H = [
    player('p1', 'Al', 10),
    player('p2', 'Bo', 14),
    player('p3', 'Cy', 6),
    player('p4', 'Di', 8),
  ];
  const hs = holes(9);
  const r = makeRound({ players: FOUR_H, holes: hs, options: { league: league() } });

  it('gives Bo the B match stroke only on the holes the B match allows', () => {
    // B match: 14 - 8 = 6 strokes, on stroke indexes 1..6.
    expect(leagueStrokesOnHole(r, hs[0])['p2']).toContain('B');
    expect(leagueStrokesOnHole(r, hs[6])['p2']).not.toContain('B');
  });

  it('gives Di team strokes where she gets none in her singles match', () => {
    // B match: 8 - 8 = 0. Team match: 8 - 6 = 2, on stroke indexes 1..2.
    expect(leagueStrokesOnHole(r, hs[0])['p4']).toEqual(['T']);
    expect(leagueStrokesOnHole(r, hs[5])['p4']).toEqual([]);
  });

  it('gives the low man no strokes anywhere', () => {
    for (const h of hs) expect(leagueStrokesOnHole(r, h)['p3']).toEqual([]);
  });

  it('returns an empty map for a non-league round', () => {
    expect(leagueStrokesOnHole(makeRound({ holes: hs }), hs[0])).toEqual({});
  });

  // Drift guard: the chips and the scoring must never disagree. If someone
  // changes a baseline in one place and not the other, this fails.
  it('agrees with computeLeague on every per-match stroke total', () => {
    const league_ = computeLeague(r);
    const perHole = hs.map((h) => leagueStrokesOnHole(r, h));
    const countFor = (pid: string, key: 'A' | 'B' | 'T') =>
      perHole.filter((m) => m[pid]?.includes(key)).length;

    for (const m of league_.matches) {
      const key = m.key === 'team' ? 'T' : m.key;
      for (const s of m.strokes) {
        const p = FOUR_H.find((x) => x.name === s.name)!;
        expect(countFor(p.id, key)).toBe(s.strokes);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- league`
Expected: FAIL — `leagueStrokesOnHole is not exported`. Existing `computeLeague` tests still PASS.

- [ ] **Step 3: Extract the shared baselines**

In `src/games/league.ts`, insert before `computeLeague`:

```ts
export type LeagueMatchKey = 'A' | 'B' | 'T';

interface Baselines {
  /** Which singles match a player plays in, or null if they are not in the league. */
  matchOf: (id: string) => 'A' | 'B' | null;
  /** Capped, low-man-adjusted handicap for a player's singles match. */
  singles: (id: string) => number;
  /** Capped, low-man-adjusted handicap for the team match. */
  team: (id: string) => number;
  nameOf: (id: string) => string;
  hcp: (id: string) => number;
}

/**
 * The three stroke baselines a league night is scored off — A match off the low
 * of the two A players, B match off the low of the two B players, team match off
 * the low of all four. Extracted so computeLeague and leagueStrokesOnHole cannot
 * drift apart; league.test.ts asserts they agree.
 */
function leagueBaselines(round: Round): Baselines {
  const cfg = round.options.league!;
  const total = round.holes.length;
  // League rule: at most 1 stroke per hole, so capping the effective handicap at
  // `total` makes the second-stroke branch of strokesReceivedOnHole unreachable.
  const capHcp = (v: number) => Math.min(Math.max(0, v), total);
  const hcp = (id: string) => round.players.find((p) => p.id === id)?.handicap ?? 0;
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '?';
  const [t0, t1] = cfg.teams;
  const aLow = Math.min(hcp(t0.aId), hcp(t1.aId));
  const bLow = Math.min(hcp(t0.bId), hcp(t1.bId));
  const low4 = Math.min(hcp(t0.aId), hcp(t0.bId), hcp(t1.aId), hcp(t1.bId));
  const matchOf = (id: string): 'A' | 'B' | null =>
    id === t0.aId || id === t1.aId ? 'A' : id === t0.bId || id === t1.bId ? 'B' : null;
  return {
    matchOf,
    singles: (id) => {
      const m = matchOf(id);
      return m == null ? 0 : capHcp(hcp(id) - (m === 'A' ? aLow : bLow));
    },
    team: (id) => capHcp(hcp(id) - low4),
    nameOf,
    hcp,
  };
}

/**
 * Which matches give each player a stroke on this hole. Chips, not counts —
 * `capHcp` bounds league allocation to one stroke per hole.
 */
export function leagueStrokesOnHole(
  round: Round,
  hole: Hole
): Record<string, LeagueMatchKey[]> {
  if (!round.options.league) return {};
  const b = leagueBaselines(round);
  const si = strokeIndexMap(round)[hole.number];
  const total = round.holes.length;
  const out: Record<string, LeagueMatchKey[]> = {};
  for (const p of round.players) {
    const keys: LeagueMatchKey[] = [];
    const m = b.matchOf(p.id);
    if (m && strokesReceivedOnHole(b.singles(p.id), si, total) > 0) keys.push(m);
    if (strokesReceivedOnHole(b.team(p.id), si, total) > 0) keys.push('T');
    out[p.id] = keys;
  }
  return out;
}
```

- [ ] **Step 4: Route `computeLeague` through the same helper**

Inside `computeLeague`, replace the local `capHcp` / `hcp` / `nameOf` definitions and the inline baseline math so the effective handicaps come from `leagueBaselines`:

```ts
  const b = leagueBaselines(round);
  const { hcp, nameOf } = b;
```

- In `singles(id0, id1, key)`: replace `capHcp(hcp(id0) - low)` with `b.singles(id0)` and `capHcp(hcp(id1) - low)` with `b.singles(id1)`; drop the local `const low = ...`.
- In `teamBest(t)`: replace `capHcp(hcp(t.aId) - low4)` with `b.team(t.aId)` and `capHcp(hcp(t.bId) - low4)` with `b.team(t.bId)`.
- Drop the local `const low4 = ...` and the local `const capHcp = ...`; `leagueBaselines` owns both now.
- `teamMatch`'s `strokeList([t0.aId, t0.bId, t1.aId, t1.bId], low4)` becomes `strokeList([t0.aId, t0.bId, t1.aId, t1.bId], b.team)` (Step 4's `strokeList` change below).
- `cfg` is still needed for `cfg.pointsPerMatch`; keep it. `t0`/`t1` are still destructured from `cfg.teams`; keep them.
- Change `strokeList` to take an effective-handicap function instead of a low number:

```ts
  const strokeList = (ids: string[], eff: (id: string) => number) =>
    ids.map((id) => ({ name: nameOf(id), strokes: strokesFor(eff(id)) })).filter((s) => s.strokes > 0);
```

Call sites become `strokeList([id0, id1], b.singles)` and `strokeList([t0.aId, t0.bId, t1.aId, t1.bId], b.team)`.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- league`
Expected: PASS — both the new tests **and** every pre-existing `computeLeague` test. The pre-existing tests are the regression gate for this refactor; if any fails, the extraction changed behavior.

- [ ] **Step 6: Commit**

```bash
git add src/games/league.ts src/games/league.test.ts
git commit -m "Share league stroke baselines between scoring and display"
```

---

### Task 7: Per-match stroke chips on the Hole tab

**Files:**
- Modify: `src/components/HoleStepper.tsx:5-16,78-82`
- Modify: `src/screens/HoleView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `leagueStrokesOnHole` (Task 6); `usesHandicaps` (Task 5).
- Produces: `HoleStepper` prop `matchStrokes?: string[]`.

- [ ] **Step 1: Add the prop to HoleStepper**

In `src/components/HoleStepper.tsx`, add to `Props`:

```tsx
  /**
   * League only: which matches give this player a stroke on this hole, e.g.
   * ['A', 'T']. Kept as plain strings so this component stays league-agnostic.
   */
  matchStrokes?: string[];
```

Destructure `matchStrokes` in the signature, and replace the `strokesReceived > 0` block (lines 78–82) with:

```tsx
        {matchStrokes && matchStrokes.length > 0 && (
          <span
            className="lg-chips"
            aria-label={`Gets a stroke in: ${matchStrokes.join(', ')}`}
          >
            {matchStrokes.map((m) => (
              <span key={m} className="lg-chip">
                {m}
              </span>
            ))}
          </span>
        )}
        {!matchStrokes && strokesReceived > 0 && (
          <span className="hcp-dots" aria-label={`${strokesReceived} handicap strokes`}>
            {'•'.repeat(strokesReceived)}
          </span>
        )}
```

- [ ] **Step 2: Compute chips in HoleView**

In `src/screens/HoleView.tsx`, import `leagueStrokesOnHole` from `../games/league` and add above the return:

```tsx
  // League strokes are per-match off three different baselines, so a single dot
  // count would be ambiguous — chips name the matches instead. See the spec.
  const chips = round.options.league ? leagueStrokesOnHole(round, hole) : null;
```

Add to the `<HoleStepper>` props:

```tsx
              matchStrokes={chips ? chips[p.id] : undefined}
```

- [ ] **Step 3: Style the chips**

Append to `src/index.css`:

```css
.lg-chips {
  display: inline-flex;
  gap: 3px;
  margin-left: 6px;
}
.lg-chip {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  /* --gold is invisible on light backgrounds (see bbaca25) — ink in light and
     glare, bright gold only where the surface is dark. */
  color: var(--gold-ink);
  border: 1px solid currentColor;
}
:root.dark .lg-chip {
  color: var(--gold);
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 5: Manual check**

`npm run dev`. Start a league round with handicaps 10, 14 (Team 1) v 6, 8 (Team 2). On hole 1, confirm Bo shows `B` and `T`, Di shows `T` only, Cy shows nothing. Open the Board tab and confirm the per-match stroke lines match the chip counts. Confirm a non-league net round still shows the `•` dots.

- [ ] **Step 6: Commit**

```bash
git add src/components/HoleStepper.tsx src/screens/HoleView.tsx src/index.css
git commit -m "Show per-match stroke chips on league hole view"
```

---

### Task 8: Mid-round handicap editing

**Files:**
- Create: `src/games/roundEdits.ts`
- Create: `src/games/roundEdits.test.ts`
- Create: `src/components/EditHandicaps.tsx`
- Modify: `src/screens/Play.tsx`, `src/screens/Results.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `Sheet` (Task 4); `PencilIcon` (Task 4).
- Produces: `validateHandicaps(round, edits): string | null`; `applyHandicaps(round, edits): Round`; `<EditHandicaps round onChange onClose />`. `edits` is `Record<string, number | undefined>` keyed by player id.

- [ ] **Step 1: Write the failing tests**

Create `src/games/roundEdits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyHandicaps, validateHandicaps } from './roundEdits';
import { makeRound, player, holes, scoresFrom } from './testFixtures';
import type { LeagueSetup } from '../types';

const cfg: LeagueSetup = {
  teams: [
    { aId: 'p1', bId: 'p2' },
    { aId: 'p3', bId: 'p4' },
  ],
  pointsPerMatch: 1,
};
const FOUR = [
  player('p1', 'Al', 10),
  player('p2', 'Bo', 14),
  player('p3', 'Cy', 6),
  player('p4', 'Di', 8),
];

describe('applyHandicaps', () => {
  it('turns useNet on when a handicap is added to a gross round', () => {
    const r = makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')] });
    expect(r.options.useNet).toBe(false);
    const next = applyHandicaps(r, { p1: 8 });
    expect(next.options.useNet).toBe(true);
    expect(next.players[0].handicap).toBe(8);
  });

  it('turns useNet off when the last handicap is cleared', () => {
    const r = makeRound({
      players: [player('p1', 'Al', 8), player('p2', 'Bo')],
      options: { useNet: true },
    });
    expect(applyHandicaps(r, { p1: undefined }).options.useNet).toBe(false);
  });

  // League rounds ship useNet: false by construction and score net regardless.
  // Flipping it would switch on stroke dots league rounds have never shown.
  it('leaves useNet alone on a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(applyHandicaps(r, { p1: 12 }).options.useNet).toBe(false);
  });

  it('does not touch scores', () => {
    const hs = holes(9);
    const scores = scoresFrom(hs, { p1: Array(9).fill(4), p2: Array(9).fill(5) });
    const r = makeRound({ players: FOUR, holes: hs, scores });
    expect(applyHandicaps(r, { p1: 3 }).scores).toEqual(scores);
  });

  it('clamps a handicap to 0..54', () => {
    const r = makeRound({ players: [player('p1', 'Al')] });
    expect(applyHandicaps(r, { p1: -4 }).players[0].handicap).toBe(0);
    expect(applyHandicaps(r, { p1: 99 }).players[0].handicap).toBe(54);
  });
});

describe('validateHandicaps', () => {
  it('accepts a blank in a non-league round', () => {
    const r = makeRound({ players: [player('p1', 'Al', 8)] });
    expect(validateHandicaps(r, { p1: undefined })).toBeNull();
  });

  it('rejects a blank in a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(validateHandicaps(r, { p2: undefined })).toMatch(/all four/i);
  });

  it('accepts a full set in a league round', () => {
    const r = makeRound({ players: FOUR, options: { league: cfg } });
    expect(validateHandicaps(r, { p2: 12 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- roundEdits`
Expected: FAIL — `Cannot find module './roundEdits'`.

- [ ] **Step 3: Create `src/games/roundEdits.ts`**

```ts
import type { Round } from '../types';

/** playerId -> new handicap, or undefined to clear it. */
export type HandicapEdits = Record<string, number | undefined>;

const MAX_HANDICAP = 54;

const clamp = (v: number): number => Math.min(Math.max(0, Math.round(v)), MAX_HANDICAP);

const merged = (round: Round, edits: HandicapEdits) =>
  round.players.map((p) => {
    if (!(p.id in edits)) return p;
    const v = edits[p.id];
    return v == null || Number.isNaN(v) ? { ...p, handicap: undefined } : { ...p, handicap: clamp(v) };
  });

/** Returns an error message, or null when the edits are valid to save. */
export function validateHandicaps(round: Round, edits: HandicapEdits): string | null {
  if (!round.options.league) return null;
  // League scoring is net off these values in all three matches — a blank must
  // not silently become scratch (same rule LeagueSetup enforces at creation).
  const ok = merged(round, edits).every((p) => p.handicap != null);
  return ok ? null : 'Enter a handicap for all four players — league scoring needs it.';
}

/**
 * Applies handicap edits and recomputes `useNet` with Setup's rule, so adding a
 * handicap to a round that started gross actually switches on net scoring
 * instead of writing a value nothing reads.
 */
export function applyHandicaps(round: Round, edits: HandicapEdits): Round {
  const players = merged(round, edits);
  // League rounds carry useNet: false by construction and score net through
  // computeLeague regardless. Recomputing it here would switch on stroke dots
  // they have never shown — a behavior change this has no mandate to make.
  const useNet = round.options.league
    ? round.options.useNet
    : players.some((p) => (p.handicap ?? 0) > 0);
  return { ...round, players, options: { ...round.options, useNet } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- roundEdits`
Expected: PASS (8 tests).

- [ ] **Step 5: Create the EditHandicaps sheet**

`src/components/EditHandicaps.tsx`:

```tsx
import { useState } from 'react';
import type { Round } from '../types';
import { applyHandicaps, validateHandicaps, type HandicapEdits } from '../games/roundEdits';
import { Sheet } from './Sheet';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onClose: () => void;
}

export function EditHandicaps({ round, onChange, onClose }: Props) {
  const [edits, setEdits] = useState<HandicapEdits>({});
  const [error, setError] = useState<string | null>(null);

  const valueFor = (id: string) => {
    if (id in edits) return edits[id] ?? '';
    return round.players.find((p) => p.id === id)?.handicap ?? '';
  };

  const save = () => {
    const err = validateHandicaps(round, edits);
    if (err) return setError(err);
    onChange(applyHandicaps(round, edits));
    onClose();
  };

  return (
    <Sheet title="Edit handicaps" onClose={onClose}>
      {round.players.map((p) => (
        <label key={p.id} className="hcp-edit-row">
          <span className="hcp-edit-name">{p.name}</span>
          <input
            className="player-hcp"
            type="number"
            inputMode="numeric"
            min={0}
            max={54}
            value={valueFor(p.id)}
            placeholder="HCP"
            onChange={(e) => {
              setError(null);
              setEdits({
                ...edits,
                [p.id]: e.target.value === '' ? undefined : Number(e.target.value),
              });
            }}
          />
        </label>
      ))}
      {error && <p className="warn-banner" role="alert">{error}</p>}
      <button className="btn-primary big" onClick={save}>
        Save handicaps
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 6: Mount on Play and Results**

In `src/screens/Play.tsx`, add `PencilIcon` to the `../icons` import and `EditHandicaps` from `../components/EditHandicaps`, then add `const [showHcp, setShowHcp] = useState(false);` and a pencil button in the toolbar row beside the gear:

```tsx
        <button
          className="awake-toggle"
          onClick={() => setShowHcp(true)}
          aria-label="Edit handicaps"
          title="Edit handicaps"
        >
          <PencilIcon size={20} />
        </button>
```

and render beside the settings sheet:

```tsx
      {showHcp && (
        <EditHandicaps round={round} onChange={onChange} onClose={() => setShowHcp(false)} />
      )}
```

In `src/screens/Results.tsx`, add the same imports, state, and sheet, with a ghost button beside the existing `share-text` button (`Results.tsx:237`):

```tsx
      <button className="btn-ghost" onClick={() => setShowHcp(true)}>
        <PencilIcon size={16} /> Edit handicaps
      </button>
```

Results' header bar is deliberately left alone — it is already full (`‹ Scorecard` / Results / Home).

- [ ] **Step 7: Style the rows**

Append to `src/index.css`:

```css
.hcp-edit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--tap);
}
.hcp-edit-name {
  font-weight: 600;
}
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 9: Manual check**

`npm run dev`. In a gross round mid-play, open the pencil, give someone a handicap, save — confirm stroke dots and net leaderboards appear without a reload. In a league round, blank a handicap and confirm the save is blocked with the error. Confirm chips update after changing a league handicap.

- [ ] **Step 10: Commit**

```bash
git add src/games/roundEdits.ts src/games/roundEdits.test.ts src/components/EditHandicaps.tsx src/screens src/index.css
git commit -m "Allow handicap correction mid-round"
```

---

### Task 9: Direct score entry on the scorecard

**Files:**
- Modify: `src/components/Scorecard.tsx`
- Modify: `src/screens/Play.tsx:75-79,233-242`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Scorecard` prop `onScore?: (holeNumber: number, playerId: string, value: number | null) => void`.

- [ ] **Step 1: Add a hole-explicit setter in Play**

In `src/screens/Play.tsx`, replace `setScore` (lines 75–79) with:

```tsx
  const setScoreAt = (holeNumber: number, playerId: string, value: number | null) => {
    setWarn(null);
    const holeScores = { ...(round.scores[holeNumber] ?? {}), [playerId]: value };
    onChange({ ...round, scores: { ...round.scores, [holeNumber]: holeScores } });
  };

  const setScore = (playerId: string, value: number | null) =>
    setScoreAt(hole.number, playerId, value);
```

Pass `onScore={setScoreAt}` to `<Scorecard>` at line 233.

- [ ] **Step 2: Make cells editable**

In `src/components/Scorecard.tsx`, add `useState` to the React import, add `onScore` to `Props`, and add state:

```tsx
  const [editing, setEditing] = useState<{ playerId: string; holeNumber: number } | null>(null);
```

Replace the `<td>` body in the holes map with:

```tsx
                  const isEditing =
                    editing?.playerId === p.id && editing?.holeNumber === h.number;
                  return (
                    <td
                      key={h.number}
                      className={`sc-cell${tone}${h.number === currentHole ? ' current' : ''}`}
                    >
                      {isEditing ? (
                        <input
                          className="sc-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={15}
                          autoFocus
                          defaultValue={raw ?? ''}
                          onBlur={(e) => {
                            commit(p.id, h.number, e.target.value);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          className="sc-cell-btn"
                          onClick={() => onScore && setEditing({ playerId: p.id, holeNumber: h.number })}
                          aria-label={`${p.name}, hole ${h.number}${raw != null ? `, ${raw}` : ', no score'}`}
                        >
                          {raw != null && <span className={scoreMarkClass(toPar)}>{raw}</span>}
                          {dots > 0 && <span className="sc-dots">{'•'.repeat(dots)}</span>}
                        </button>
                      )}
                    </td>
                  );
```

Add the commit helper above the return:

```tsx
  // Clamped to the same 1..15 range the stepper enforces; empty clears the score.
  const commit = (playerId: string, holeNumber: number, raw: string) => {
    if (!onScore) return;
    if (raw.trim() === '') return onScore(holeNumber, playerId, null);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onScore(holeNumber, playerId, Math.min(15, Math.max(1, Math.round(n))));
  };
```

The jump gesture moves entirely to the hole-number header row, which already carries `jumpProps` with keyboard support (`Scorecard.tsx:20-33`) — leave that untouched.

⚠️ **Removing `onClick={() => onJumpToHole?.(i)}` from the `<td>` leaves the `i` parameter unused in the tbody map, and `tsconfig.app.json` sets `noUnusedParameters: true`** — typecheck will fail. Change the tbody map signature from `holes.map((h, i) => {` to `holes.map((h) => {`. The thead map keeps its `i`; it still feeds `jumpProps(i)`.

- [ ] **Step 3: Style the cell button and input**

Append to `src/index.css`:

```css
.sc-cell-btn {
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 0;
  width: 100%;
  min-height: 28px;
  cursor: pointer;
}
.sc-input {
  width: 34px;
  padding: 2px;
  text-align: center;
  font: inherit;
  color: var(--ink);
  background: var(--bg);
  border: 2px solid var(--fairway);
  border-radius: 4px;
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 5: Manual check**

`npm run dev`. On the Card tab, tap a cell, type `6`, press Enter — confirm the value sticks, the tone colour updates, and totals recalculate. Reload the page and confirm it persisted. Clear a cell to blank and confirm the score is removed. Tap a hole **number** in the header row and confirm it still jumps to that hole.

- [ ] **Step 6: Commit**

```bash
git add src/components/Scorecard.tsx src/screens/Play.tsx src/index.css
git commit -m "Type scores directly into scorecard cells"
```

---

### Task 10: Full acceptance sweep

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md` (only if it documents the Sunlight button by name)

- [ ] **Step 1: Run the full gate**

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

Expected: all clean.

- [ ] **Step 2: Walk the six theme states**

`npm run dev`, device toolbar at 375×812. Screenshot each: System/Light/Dark with Glare off, then Glare on over each. Confirm no unreadable text, and that Glare looks identical in all three.

- [ ] **Step 3: Confirm each spec acceptance criterion**

Walk the numbered list at the end of `docs/superpowers/specs/2026-08-05-press-theme-handicaps-design.md`. Pay particular attention to #5 (a league round shows every handicap badge despite `useNet: false`), #9 (chips match the Board's per-match totals), and #10 (chips legible in all themes and Glare).

- [ ] **Step 4: Update the changelog**

Add an entry covering: Appearance picker, Sunlight renamed to Glare mode, handicaps on scorecard and leaderboards, per-match league stroke chips, mid-round handicap editing, direct scorecard entry. Note that tapping a scorecard cell now edits rather than jumps, and that the hole-number row jumps.

Grep the docs for stale references before writing:

```bash
grep -rn "Sunlight\|sunlight" README.md CHANGELOG.md ROADMAP.md docs BRAND.md
```

Update any that describe the button as a theme toggle.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "Document theme control, handicap display, and mid-round edits"
```
