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
